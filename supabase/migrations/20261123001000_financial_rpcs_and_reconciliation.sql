-- ============================================================================
-- SILVER SPOON — Phase B Migration 0010
-- Financial Posting Engine, Tax Resolver, Investment/Withdrawal RPCs & Reconciliation
-- Security Standard: SECURITY DEFINER + SET search_path = public, pg_temp
--                    Explicit internal auth/role checks (never relies on RLS alone)
--                    Deterministic FOR UPDATE row locking + idempotency keys
-- ============================================================================

-- Helper: assert caller is a privileged backend worker (service_role / postgres / treasury worker)
CREATE OR REPLACE FUNCTION public.internal_assert_service_caller()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF current_user IN ('postgres', 'service_role', 'silver_spoon_treasury_worker', 'silver_spoon_reconciler')
     OR v_jwt_role = 'service_role'
  THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'UNAUTHORIZED_SERVICE_CALL: Restricted strictly to backend service_role'
    USING ERRCODE = '42501';
END;
$$;

-- Helper: fetch current open financial period
CREATE OR REPLACE FUNCTION public.internal_get_open_period_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period_id UUID;
BEGIN
  SELECT id
  INTO v_period_id
  FROM public.financial_periods
  WHERE status = 'open'
    AND now() >= starts_at
    AND now() < ends_at
  ORDER BY starts_at DESC
  LIMIT 1;

  IF v_period_id IS NULL THEN
    SELECT id INTO v_period_id
    FROM public.financial_periods
    WHERE status = 'open'
    ORDER BY starts_at DESC
    LIMIT 1;
  END IF;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'NO_OPEN_FINANCIAL_PERIOD: Cannot post ledger entries when no open period exists'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_period_id;
END;
$$;

-- Helper: lookup system control ledger account by code
CREATE OR REPLACE FUNCTION public.internal_get_system_account_id(p_account_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM public.ledger_accounts
  WHERE account_code = p_account_code
    AND is_system = true
    AND is_active = true;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_SYSTEM_LEDGER_ACCOUNT: Account % not found', p_account_code
      USING ERRCODE = '22023';
  END IF;

  RETURN v_id;
END;
$$;

-- 1. Provision investor wallet + 3 mutually exclusive customer liability sub-ledgers
CREATE OR REPLACE FUNCTION public.internal_provision_investor_wallet(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_wallet_id UUID;
  v_client_code TEXT;
  v_avail_acc_id UUID;
  v_resv_acc_id UUID;
  v_inv_acc_id UUID;
  v_wallet_id UUID;
BEGIN
  PERFORM public.internal_assert_service_caller();

  SELECT id INTO v_existing_wallet_id
  FROM public.wallets
  WHERE user_id = p_user_id AND currency = 'NGN';

  IF v_existing_wallet_id IS NOT NULL THEN
    RETURN v_existing_wallet_id;
  END IF;

  SELECT client_code INTO v_client_code
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_client_code IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: Cannot provision wallet for unknown user %', p_user_id
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ledger_accounts (account_code, account_name, account_type, normal_balance, owner_user_id, subledger_kind, is_system)
  VALUES ('2010-' || v_client_code || '-AVAIL', 'Customer Available Liability (' || v_client_code || ')', 'liability', 'credit', p_user_id, 'customer_available', false)
  RETURNING id INTO v_avail_acc_id;

  INSERT INTO public.ledger_accounts (account_code, account_name, account_type, normal_balance, owner_user_id, subledger_kind, is_system)
  VALUES ('2020-' || v_client_code || '-RESV', 'Customer Reserved Withdrawal Liability (' || v_client_code || ')', 'liability', 'credit', p_user_id, 'customer_reserved', false)
  RETURNING id INTO v_resv_acc_id;

  INSERT INTO public.ledger_accounts (account_code, account_name, account_type, normal_balance, owner_user_id, subledger_kind, is_system)
  VALUES ('2030-' || v_client_code || '-INV', 'Customer Invested Principal Liability (' || v_client_code || ')', 'liability', 'credit', p_user_id, 'customer_invested', false)
  RETURNING id INTO v_inv_acc_id;

  INSERT INTO public.wallets (user_id, currency, status, available_account_id, reserved_account_id, invested_account_id)
  VALUES (p_user_id, 'NGN', 'active', v_avail_acc_id, v_resv_acc_id, v_inv_acc_id)
  RETURNING id INTO v_wallet_id;

  INSERT INTO public.wallet_balances (wallet_id, user_id, currency)
  VALUES (v_wallet_id, p_user_id, 'NGN');

  INSERT INTO public.notification_preferences (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_wallet_id;
END;
$$;

-- 2. Atomic Double-Entry Posting Engine with Idempotency & Deterministic Row Locking
CREATE OR REPLACE FUNCTION public.internal_post_journal_entry(
  p_idempotency_key TEXT,
  p_entry_type TEXT,
  p_reference_code TEXT,
  p_description TEXT,
  p_posted_by UUID,
  p_lines JSONB,
  p_reverses_entry_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id UUID;
  v_period_id UUID;
  v_entry_id UUID;
  v_line JSONB;
  v_debit_sum BIGINT := 0;
  v_credit_sum BIGINT := 0;
  v_line_count INTEGER := 0;
  v_acc_id UUID;
  v_dir public.journal_direction_enum;
  v_amt BIGINT;
  v_subledger_kind TEXT;
  v_owner_user_id UUID;
  v_delta BIGINT;
  v_wallet_id UUID;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 4 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY: Financial posting requires a valid idempotency_key'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotency check
  SELECT id INTO v_existing_id
  FROM public.journal_entries
  WHERE idempotency_key = p_idempotency_key;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'INCOMPLETE_JOURNAL_ENTRY: At least 2 journal lines are required'
      USING ERRCODE = '22023';
  END IF;

  -- Validate line arithmetic upfront before touching rows
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_count := v_line_count + 1;
    v_amt := (v_line ->> 'amount_kobo')::BIGINT;
    v_dir := (v_line ->> 'direction')::public.journal_direction_enum;
    IF v_amt IS NULL OR v_amt <= 0 THEN
      RAISE EXCEPTION 'INVALID_LINE_AMOUNT: Every journal line amount_kobo must be positive'
        USING ERRCODE = '22023';
    END IF;
    IF v_dir = 'debit' THEN
      v_debit_sum := v_debit_sum + v_amt;
    ELSE
      v_credit_sum := v_credit_sum + v_amt;
    END IF;
  END LOOP;

  IF v_debit_sum <> v_credit_sum OR v_debit_sum <= 0 THEN
    RAISE EXCEPTION 'UNBALANCED_JOURNAL_ENTRY: Debits (% kobo) <> Credits (% kobo)', v_debit_sum, v_credit_sum
      USING ERRCODE = '22023';
  END IF;

  -- Deterministic row-level locking on all affected wallets (ascending wallet_id prevents deadlocks)
  PERFORM wb.wallet_id
  FROM public.wallet_balances wb
  JOIN public.wallets w ON w.id = wb.wallet_id
  WHERE w.available_account_id IN (SELECT (elem ->> 'account_id')::UUID FROM jsonb_array_elements(p_lines) elem)
     OR w.reserved_account_id IN (SELECT (elem ->> 'account_id')::UUID FROM jsonb_array_elements(p_lines) elem)
     OR w.invested_account_id IN (SELECT (elem ->> 'account_id')::UUID FROM jsonb_array_elements(p_lines) elem)
  ORDER BY wb.wallet_id ASC
  FOR UPDATE;

  v_period_id := public.internal_get_open_period_id();

  INSERT INTO public.journal_entries (
    financial_period_id,
    idempotency_key,
    entry_type,
    reference_code,
    description,
    reverses_entry_id,
    posted_by,
    metadata
  )
  VALUES (
    v_period_id,
    p_idempotency_key,
    p_entry_type,
    p_reference_code,
    p_description,
    p_reverses_entry_id,
    p_posted_by,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_entry_id;

  -- Insert lines and synchronize customer wallet_balances atomically
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_acc_id := (v_line ->> 'account_id')::UUID;
    v_dir := (v_line ->> 'direction')::public.journal_direction_enum;
    v_amt := (v_line ->> 'amount_kobo')::BIGINT;

    INSERT INTO public.journal_lines (journal_entry_id, ledger_account_id, direction, amount_kobo, line_memo)
    VALUES (v_entry_id, v_acc_id, v_dir, v_amt, v_line ->> 'memo');

    SELECT subledger_kind, owner_user_id
    INTO v_subledger_kind, v_owner_user_id
    FROM public.ledger_accounts
    WHERE id = v_acc_id;

    -- Customer liability accounts have normal credit balance: credit increases (+), debit decreases (-)
    IF v_subledger_kind IN ('customer_available', 'customer_reserved', 'customer_invested') THEN
      v_delta := CASE WHEN v_dir = 'credit' THEN v_amt ELSE -v_amt END;

      SELECT id INTO v_wallet_id
      FROM public.wallets
      WHERE user_id = v_owner_user_id AND currency = 'NGN';

      IF v_subledger_kind = 'customer_available' THEN
        UPDATE public.wallet_balances
        SET available_kobo = available_kobo + v_delta,
            last_journal_entry_id = v_entry_id
        WHERE wallet_id = v_wallet_id;
      ELSIF v_subledger_kind = 'customer_reserved' THEN
        UPDATE public.wallet_balances
        SET reserved_withdrawal_kobo = reserved_withdrawal_kobo + v_delta,
            last_journal_entry_id = v_entry_id
        WHERE wallet_id = v_wallet_id;
      ELSIF v_subledger_kind = 'customer_invested' THEN
        UPDATE public.wallet_balances
        SET invested_principal_kobo = invested_principal_kobo + v_delta,
            last_journal_entry_id = v_entry_id
        WHERE wallet_id = v_wallet_id;
      END IF;
    END IF;
  END LOOP;

  RETURN v_entry_id;
END;
$$;

-- 3. Cached-vs-Journal Reconciliation (ADR-009)
CREATE OR REPLACE FUNCTION public.reconcile_wallet_balance(p_wallet_id UUID)
RETURNS TABLE (
  wallet_id UUID,
  is_reconciled BOOLEAN,
  cached_available_kobo BIGINT,
  ledger_available_kobo BIGINT,
  cached_reserved_kobo BIGINT,
  ledger_reserved_kobo BIGINT,
  cached_invested_kobo BIGINT,
  ledger_invested_kobo BIGINT,
  cached_total_liability_kobo BIGINT,
  ledger_total_liability_kobo BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_wallet RECORD;
  v_cached RECORD;
  v_ledger_avail BIGINT := 0;
  v_ledger_resv BIGINT := 0;
  v_ledger_inv BIGINT := 0;
  v_match BOOLEAN;
BEGIN
  -- Authorize either service_role/reconciler OR finance_officer/super_admin
  IF NOT (
    current_user IN ('postgres', 'service_role', 'silver_spoon_reconciler')
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR (v_caller_id IS NOT NULL AND public.app_has_any_role(v_caller_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]))
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_RECONCILIATION: Finance officer, super_admin, or reconciler role required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE id = p_wallet_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: Wallet % does not exist', p_wallet_id USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cached FROM public.wallet_balances wb WHERE wb.wallet_id = p_wallet_id;

  SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_kobo ELSE -amount_kobo END), 0)
  INTO v_ledger_avail
  FROM public.journal_lines
  WHERE ledger_account_id = v_wallet.available_account_id;

  SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_kobo ELSE -amount_kobo END), 0)
  INTO v_ledger_resv
  FROM public.journal_lines
  WHERE ledger_account_id = v_wallet.reserved_account_id;

  SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_kobo ELSE -amount_kobo END), 0)
  INTO v_ledger_inv
  FROM public.journal_lines
  WHERE ledger_account_id = v_wallet.invested_account_id;

  v_match := (
    v_cached.available_kobo = v_ledger_avail
    AND v_cached.reserved_withdrawal_kobo = v_ledger_resv
    AND v_cached.invested_principal_kobo = v_ledger_inv
  );

  IF v_match THEN
    UPDATE public.wallet_balances SET reconciled_at = now() WHERE public.wallet_balances.wallet_id = p_wallet_id;
  ELSE
    INSERT INTO public.compliance_events (user_id, event_type, severity, description, details)
    VALUES (
      v_wallet.user_id,
      'LEDGER_RECONCILIATION_DRIFT',
      'critical',
      'Cached wallet_balances diverged from double-entry journal_lines.',
      jsonb_build_object(
        'wallet_id', p_wallet_id,
        'cached_available_kobo', v_cached.available_kobo,
        'ledger_available_kobo', v_ledger_avail,
        'cached_reserved_kobo', v_cached.reserved_withdrawal_kobo,
        'ledger_reserved_kobo', v_ledger_resv,
        'cached_invested_kobo', v_cached.invested_principal_kobo,
        'ledger_invested_kobo', v_ledger_inv
      )
    );
  END IF;

  RETURN QUERY SELECT
    p_wallet_id,
    v_match,
    v_cached.available_kobo,
    v_ledger_avail,
    v_cached.reserved_withdrawal_kobo,
    v_ledger_resv,
    v_cached.invested_principal_kobo,
    v_ledger_inv,
    v_cached.total_customer_liability_kobo,
    (v_ledger_avail + v_ledger_resv + v_ledger_inv);
END;
$$;

-- 4. Configurable Tax Rule Resolver (ADR-004 — effective dates, instrument, investor classification, exemptions)
CREATE OR REPLACE FUNCTION public.resolve_applicable_tax_rule(
  p_tax_code TEXT,
  p_instrument_type TEXT,
  p_investor_classification public.investor_classification_enum,
  p_as_of TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  tax_rule_id UUID,
  rule_code TEXT,
  is_exempt BOOLEAN,
  exemption_code TEXT,
  rate_bps INTEGER,
  fixed_amount_kobo BIGINT,
  min_threshold_kobo BIGINT,
  legal_basis TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    tr.id,
    tr.rule_code,
    tr.is_exempt,
    tr.exemption_code,
    tr.rate_bps,
    tr.fixed_amount_kobo,
    tr.min_threshold_kobo,
    tr.legal_basis
  FROM public.tax_rules tr
  WHERE tr.tax_code = p_tax_code
    AND tr.instrument_type = p_instrument_type
    AND tr.investor_classification = p_investor_classification
    AND tr.is_active = true
    AND tr.effective_from <= p_as_of
    AND (tr.effective_to IS NULL OR tr.effective_to > p_as_of)
  ORDER BY tr.effective_from DESC
  LIMIT 1;
$$;

-- 5. Paystack Checkout Deposit Initialization & Verified Settlement (ADR-002 / ADR-007)
CREATE OR REPLACE FUNCTION public.initialize_deposit(
  p_amount_kobo BIGINT,
  p_channel public.deposit_channel_enum,
  p_paystack_reference TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_wallet RECORD;
  v_min_kobo BIGINT;
  v_existing_txn_id UUID;
  v_txn_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Sign-in required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_role(v_user_id, 'investor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Investor role required for deposit initialization' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_account_can_transact(v_user_id) THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED: Account status does not permit transactions' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_existing_txn_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
  IF v_existing_txn_id IS NOT NULL THEN
    RETURN v_existing_txn_id;
  END IF;

  SELECT COALESCE((value_json ->> 'amount_kobo')::BIGINT, 1000000)
  INTO v_min_kobo
  FROM public.platform_settings
  WHERE key = 'deposit.min_kobo';

  IF p_amount_kobo IS NULL OR p_amount_kobo < v_min_kobo THEN
    RAISE EXCEPTION 'DEPOSIT_BELOW_MINIMUM: Minimum deposit is % kobo', v_min_kobo USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id AND currency = 'NGN' FOR UPDATE;
  IF NOT FOUND OR v_wallet.status <> 'active' THEN
    RAISE EXCEPTION 'WALLET_UNAVAILABLE: Active NGN wallet required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.transactions (
    reference, idempotency_key, user_id, wallet_id, transaction_type, status,
    amount_kobo, fee_kobo, tax_kobo, net_amount_kobo, description, metadata
  )
  VALUES (
    p_paystack_reference, p_idempotency_key, v_user_id, v_wallet.id, 'deposit', 'pending',
    p_amount_kobo, 0, 0, p_amount_kobo, 'Paystack Checkout deposit initialized',
    jsonb_build_object('channel', p_channel)
  )
  RETURNING id INTO v_txn_id;

  INSERT INTO public.deposits (
    transaction_id, user_id, wallet_id, channel, expected_amount_kobo, paystack_reference, status
  )
  VALUES (
    v_txn_id, v_user_id, v_wallet.id, p_channel, p_amount_kobo, p_paystack_reference, 'pending'
  );

  UPDATE public.wallet_balances
  SET pending_deposit_kobo = pending_deposit_kobo + p_amount_kobo
  WHERE wallet_id = v_wallet.id;

  RETURN v_txn_id;
END;
$$;

-- Server-only settlement: NEVER callable directly from browser; requires server verification reference
CREATE OR REPLACE FUNCTION public.settle_verified_deposit(
  p_paystack_reference TEXT,
  p_settled_amount_kobo BIGINT,
  p_server_verification_ref TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dep RECORD;
  v_wallet RECORD;
  v_clearing_acc UUID;
  v_entry_id UUID;
BEGIN
  PERFORM public.internal_assert_service_caller();

  IF p_server_verification_ref IS NULL OR length(trim(p_server_verification_ref)) < 6 THEN
    RAISE EXCEPTION 'UNVERIFIED_DEPOSIT: Independent server verification reference required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dep
  FROM public.deposits
  WHERE paystack_reference = p_paystack_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPOSIT_NOT_FOUND: Reference % not found', p_paystack_reference USING ERRCODE = '22023';
  END IF;

  -- Idempotent return if already settled
  IF v_dep.settlement_journal_entry_id IS NOT NULL THEN
    RETURN v_dep.settlement_journal_entry_id;
  END IF;

  IF p_settled_amount_kobo <> v_dep.expected_amount_kobo THEN
    RAISE EXCEPTION 'DEPOSIT_AMOUNT_MISMATCH: Settled % kobo <> expected % kobo',
      p_settled_amount_kobo, v_dep.expected_amount_kobo
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_dep.wallet_id FOR UPDATE;
  v_clearing_acc := public.internal_get_system_account_id('1010-PAYSTACK-CLEARING');

  v_entry_id := public.internal_post_journal_entry(
    p_idempotency_key,
    'deposit_settlement',
    p_paystack_reference,
    'Verified Paystack Checkout deposit settlement',
    NULL,
    jsonb_build_array(
      jsonb_build_object('account_id', v_clearing_acc, 'direction', 'debit', 'amount_kobo', p_settled_amount_kobo, 'memo', 'Paystack checkout inflow'),
      jsonb_build_object('account_id', v_wallet.available_account_id, 'direction', 'credit', 'amount_kobo', p_settled_amount_kobo, 'memo', 'Investor available balance credit')
    ),
    NULL,
    jsonb_build_object('server_verification_ref', p_server_verification_ref)
  );

  UPDATE public.deposits
  SET status = 'completed',
      settled_amount_kobo = p_settled_amount_kobo,
      server_verified_at = now(),
      server_verification_ref = p_server_verification_ref,
      settlement_journal_entry_id = v_entry_id,
      settled_at = now()
  WHERE id = v_dep.id;

  UPDATE public.transactions
  SET status = 'completed',
      primary_journal_entry_id = v_entry_id
  WHERE id = v_dep.transaction_id;

  UPDATE public.wallet_balances
  SET pending_deposit_kobo = GREATEST(0, pending_deposit_kobo - v_dep.expected_amount_kobo)
  WHERE wallet_id = v_dep.wallet_id;

  PERFORM public.internal_write_audit_log(
    NULL, 'service_role', 'DEPOSIT_SETTLED', 'deposit', v_dep.id::text, 'medium',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'completed', 'settled_amount_kobo', p_settled_amount_kobo, 'journal_entry_id', v_entry_id),
    'Independent server verification confirmed'
  );

  RETURN v_entry_id;
END;
$$;

-- 6. Investor Withdrawal Request (Atomic Reservation: AVAIL -> RESV + Mandatory Four-Eyes Action)
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount_kobo BIGINT,
  p_wallet_account_id UUID,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing_wd_id UUID;
  v_profile RECORD;
  v_wallet RECORD;
  v_bal RECORD;
  v_bank RECORD;
  v_min_kobo BIGINT;
  v_fee_cfg JSONB;
  v_fee_kobo BIGINT := 0;
  v_total_reserve BIGINT;
  v_txn_id UUID;
  v_entry_id UUID;
  v_action_id UUID;
  v_wd_id UUID;
  v_ref TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Sign-in required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_role(v_user_id, 'investor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Investor role required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_account_can_transact(v_user_id) THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED: Account not permitted to withdraw' USING ERRCODE = '42501';
  END IF;

  -- Idempotency check
  SELECT w.id INTO v_existing_wd_id
  FROM public.withdrawals w
  JOIN public.transactions t ON t.id = w.transaction_id
  WHERE t.idempotency_key = p_idempotency_key AND w.user_id = v_user_id;

  IF v_existing_wd_id IS NOT NULL THEN
    RETURN v_existing_wd_id;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF v_profile.kyc_tier NOT IN ('Tier 2', 'Tier 3') THEN
    RAISE EXCEPTION 'KYC_TIER_REQUIRED: Minimum KYC Tier 2 required for withdrawals' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE((value_json ->> 'amount_kobo')::BIGINT, 500000)
  INTO v_min_kobo FROM public.platform_settings WHERE key = 'withdrawal.min_kobo';

  IF p_amount_kobo IS NULL OR p_amount_kobo < v_min_kobo THEN
    RAISE EXCEPTION 'WITHDRAWAL_BELOW_MINIMUM: Minimum withdrawal is % kobo', v_min_kobo USING ERRCODE = '22023';
  END IF;

  SELECT value_json INTO v_fee_cfg FROM public.platform_settings WHERE key = 'withdrawal.fee_schedule';
  IF v_fee_cfg IS NOT NULL AND p_amount_kobo >= (v_fee_cfg ->> 'high_value_threshold_kobo')::BIGINT THEN
    v_fee_kobo := COALESCE((v_fee_cfg ->> 'high_value_fee_kobo')::BIGINT, 0);
  ELSE
    v_fee_kobo := COALESCE((v_fee_cfg ->> 'standard_fee_kobo')::BIGINT, 0);
  END IF;

  v_total_reserve := p_amount_kobo + v_fee_kobo;

  -- Deterministic lock order: wallet -> wallet_balances
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id AND currency = 'NGN' FOR UPDATE;
  IF NOT FOUND OR v_wallet.status <> 'active' THEN
    RAISE EXCEPTION 'WALLET_FROZEN_OR_MISSING: Active NGN wallet required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_bal FROM public.wallet_balances WHERE wallet_id = v_wallet.id FOR UPDATE;
  IF v_bal.available_kobo < v_total_reserve THEN
    RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE_BALANCE: Available % kobo < required % kobo',
      v_bal.available_kobo, v_total_reserve
      USING ERRCODE = '22023';
  END IF;

  -- Verify payout bank account belongs to investor and is verified
  SELECT * INTO v_bank
  FROM public.wallet_accounts
  WHERE id = p_wallet_account_id
    AND wallet_id = v_wallet.id
    AND user_id = v_user_id
    AND verification_status = 'verified'
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_PAYOUT_ACCOUNT: Verified payout NUBAN account required' USING ERRCODE = '22023';
  END IF;

  v_ref := 'WDR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  -- Post atomic reservation: Debit AVAIL, Credit RESV (Total Customer Liability unchanged!)
  v_entry_id := public.internal_post_journal_entry(
    'resv:' || p_idempotency_key,
    'withdrawal_reservation',
    v_ref,
    'Reserve investor funds pending four-eyes approval and scheduled treasury settlement',
    v_user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_wallet.available_account_id, 'direction', 'debit', 'amount_kobo', v_total_reserve, 'memo', 'Reserve withdrawal principal + fee'),
      jsonb_build_object('account_id', v_wallet.reserved_account_id, 'direction', 'credit', 'amount_kobo', v_total_reserve, 'memo', 'Held in reserved withdrawal sub-ledger')
    )
  );

  INSERT INTO public.transactions (
    reference, idempotency_key, user_id, wallet_id, transaction_type, status,
    amount_kobo, fee_kobo, tax_kobo, net_amount_kobo, description, primary_journal_entry_id
  )
  VALUES (
    v_ref, p_idempotency_key, v_user_id, v_wallet.id, 'withdrawal', 'pending_approval',
    p_amount_kobo, v_fee_kobo, 0, p_amount_kobo, 'Scheduled withdrawal request reserved', v_entry_id
  )
  RETURNING id INTO v_txn_id;

  IF v_fee_kobo > 0 THEN
    INSERT INTO public.transaction_fees (transaction_id, fee_code, fee_label, amount_kobo, rate_bps)
    VALUES (v_txn_id, 'WIRE_TRANSFER_FEE', 'High-value scheduled wire fee', v_fee_kobo, 0);
  END IF;

  INSERT INTO public.admin_actions (
    action_type, status, target_table, subject_user_id, initiator_user_id, payload, justification
  )
  VALUES (
    'withdrawal_approval', 'pending_approval', 'withdrawals', v_user_id, v_user_id,
    jsonb_build_object('transaction_id', v_txn_id, 'amount_kobo', p_amount_kobo, 'fee_kobo', v_fee_kobo, 'wallet_account_id', p_wallet_account_id),
    'Investor withdrawal request requiring independent four-eyes approval (ADR-003)'
  )
  RETURNING id INTO v_action_id;

  INSERT INTO public.withdrawals (
    transaction_id, user_id, wallet_id, wallet_account_id, amount_kobo, fee_kobo,
    payout_idempotency_ref, status, initiated_by, four_eyes_action_id, reserve_journal_entry_id
  )
  VALUES (
    v_txn_id, v_user_id, v_wallet.id, p_wallet_account_id, p_amount_kobo, v_fee_kobo,
    'PAYOUT-' || v_ref, 'pending_approval', v_user_id, v_action_id, v_entry_id
  )
  RETURNING id INTO v_wd_id;

  UPDATE public.admin_actions SET target_id = v_wd_id WHERE id = v_action_id;

  PERFORM public.internal_write_audit_log(
    v_user_id, 'investor', 'WITHDRAWAL_REQUESTED', 'withdrawal', v_wd_id::text, 'medium',
    NULL, jsonb_build_object('amount_kobo', p_amount_kobo, 'fee_kobo', v_fee_kobo, 'status', 'pending_approval'),
    'Withdrawal reserved for scheduled treasury settlement'
  );

  RETURN v_wd_id;
END;
$$;

-- 7. Independent Four-Eyes Withdrawal Approval (ADR-003: applies to ALL withdrawals)
CREATE OR REPLACE FUNCTION public.approve_withdrawal_four_eyes(
  p_withdrawal_id UUID,
  p_notes TEXT DEFAULT 'Independently verified for scheduled treasury batch'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id UUID := auth.uid();
  v_wd RECORD;
  v_action RECORD;
  v_log_id UUID;
BEGIN
  IF v_approver_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Sign-in required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_approver_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Finance officer or super_admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_wd FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND: Withdrawal % does not exist', p_withdrawal_id USING ERRCODE = '22023';
  END IF;

  IF v_wd.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'INVALID_WITHDRAWAL_STATE: Expected pending_approval, found %', v_wd.status USING ERRCODE = '22023';
  END IF;

  IF v_approver_id = v_wd.user_id OR v_approver_id = v_wd.initiated_by THEN
    RAISE EXCEPTION 'FOUR_EYES_VIOLATION: Initiator or account owner cannot approve their own withdrawal'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_action FROM public.admin_actions WHERE id = v_wd.four_eyes_action_id FOR UPDATE;
  IF v_action.initiator_user_id = v_approver_id THEN
    RAISE EXCEPTION 'FOUR_EYES_VIOLATION: Approver must be distinct from initiator' USING ERRCODE = '42501';
  END IF;

  v_log_id := public.internal_write_audit_log(
    v_approver_id, 'finance_officer', 'WITHDRAWAL_APPROVED_FOUR_EYES', 'withdrawal', p_withdrawal_id::text, 'high',
    jsonb_build_object('status', v_wd.status),
    jsonb_build_object('status', 'approved', 'approved_by', v_approver_id),
    p_notes
  );

  UPDATE public.admin_actions
  SET status = 'approved',
      approver_user_id = v_approver_id,
      decided_at = now(),
      audit_log_id = v_log_id
  WHERE id = v_wd.four_eyes_action_id;

  UPDATE public.withdrawals
  SET status = 'approved',
      approved_by = v_approver_id
  WHERE id = p_withdrawal_id;

  UPDATE public.transactions
  SET status = 'approved'
  WHERE id = v_wd.transaction_id;

  RETURN p_withdrawal_id;
END;
$$;

-- 8. Scheduled Treasury Withdrawal Batch Creation & Independent Approval (ADR-007 / ADR-003)
CREATE OR REPLACE FUNCTION public.create_withdrawal_batch(
  p_batch_code TEXT,
  p_scheduled_settlement_at TIMESTAMPTZ,
  p_withdrawal_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_preparer_id UUID := auth.uid();
  v_batch_id UUID;
  v_action_id UUID;
  v_count INTEGER := 0;
  v_principal_sum BIGINT := 0;
  v_fee_sum BIGINT := 0;
  v_wd_id UUID;
  v_wd RECORD;
BEGIN
  IF v_preparer_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Sign-in required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_preparer_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Finance officer or super_admin required' USING ERRCODE = '42501';
  END IF;

  IF p_withdrawal_ids IS NULL OR array_length(p_withdrawal_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_BATCH: At least one approved withdrawal is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_actions (
    action_type, status, target_table, initiator_user_id, payload, justification
  )
  VALUES (
    'withdrawal_batch_approval', 'pending_approval', 'withdrawal_batches', v_preparer_id,
    jsonb_build_object('batch_code', p_batch_code, 'withdrawal_ids', p_withdrawal_ids),
    'Scheduled treasury settlement batch requires independent second approval (ADR-003 / ADR-007)'
  )
  RETURNING id INTO v_action_id;

  INSERT INTO public.withdrawal_batches (
    batch_code, scheduled_settlement_at, status, prepared_by, four_eyes_action_id
  )
  VALUES (
    p_batch_code, p_scheduled_settlement_at, 'pending_approval', v_preparer_id, v_action_id
  )
  RETURNING id INTO v_batch_id;

  FOREACH v_wd_id IN ARRAY p_withdrawal_ids
  LOOP
    SELECT * INTO v_wd FROM public.withdrawals WHERE id = v_wd_id FOR UPDATE;
    IF NOT FOUND OR v_wd.status <> 'approved' OR v_wd.withdrawal_batch_id IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_BATCH_MEMBER: Withdrawal % must be approved and unbatched', v_wd_id
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.withdrawals SET withdrawal_batch_id = v_batch_id WHERE id = v_wd_id;
    v_count := v_count + 1;
    v_principal_sum := v_principal_sum + v_wd.amount_kobo;
    v_fee_sum := v_fee_sum + v_wd.fee_kobo;
  END LOOP;

  UPDATE public.withdrawal_batches
  SET total_count = v_count,
      total_principal_kobo = v_principal_sum,
      total_fee_kobo = v_fee_sum
  WHERE id = v_batch_id;

  UPDATE public.admin_actions SET target_id = v_batch_id WHERE id = v_action_id;

  RETURN v_batch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_withdrawal_batch_four_eyes(
  p_batch_id UUID,
  p_treasury_funding_ref TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id UUID := auth.uid();
  v_batch RECORD;
  v_log_id UUID;
BEGIN
  IF v_approver_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Sign-in required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_approver_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Finance officer or super_admin required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch FROM public.withdrawal_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BATCH_NOT_FOUND: Batch % not found', p_batch_id USING ERRCODE = '22023';
  END IF;

  IF v_batch.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'INVALID_BATCH_STATE: Batch status is %', v_batch.status USING ERRCODE = '22023';
  END IF;

  IF v_approver_id = v_batch.prepared_by THEN
    RAISE EXCEPTION 'FOUR_EYES_VIOLATION: Batch preparer cannot approve their own payout batch'
      USING ERRCODE = '42501';
  END IF;

  v_log_id := public.internal_write_audit_log(
    v_approver_id, 'finance_officer', 'WITHDRAWAL_BATCH_APPROVED', 'withdrawal_batch', p_batch_id::text, 'high',
    jsonb_build_object('status', v_batch.status),
    jsonb_build_object('status', 'approved', 'treasury_funding_ref', p_treasury_funding_ref),
    'Independent four-eyes batch release approval'
  );

  UPDATE public.admin_actions
  SET status = 'approved', approver_user_id = v_approver_id, decided_at = now(), audit_log_id = v_log_id
  WHERE id = v_batch.four_eyes_action_id;

  UPDATE public.withdrawal_batches
  SET status = 'approved', approved_by = v_approver_id, treasury_funding_ref = p_treasury_funding_ref
  WHERE id = p_batch_id;

  RETURN p_batch_id;
END;
$$;

-- 9. Verified Withdrawal Settlement & Failed Payout Release (Server-Only — ADR-007)
CREATE OR REPLACE FUNCTION public.settle_withdrawal(
  p_withdrawal_id UUID,
  p_provider_transfer_ref TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_wd RECORD;
  v_batch RECORD;
  v_wallet RECORD;
  v_treasury_acc UUID;
  v_fee_acc UUID;
  v_lines JSONB;
  v_entry_id UUID;
BEGIN
  PERFORM public.internal_assert_service_caller();

  IF p_provider_transfer_ref IS NULL OR length(trim(p_provider_transfer_ref)) < 6 THEN
    RAISE EXCEPTION 'UNVERIFIED_SETTLEMENT: Verified bank/provider transfer reference required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_wd FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  -- Idempotent return if already settled
  IF v_wd.settlement_journal_entry_id IS NOT NULL THEN
    RETURN v_wd.settlement_journal_entry_id;
  END IF;

  IF v_wd.release_journal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'WITHDRAWAL_ALREADY_RELEASED: Cannot settle failed/declined withdrawal' USING ERRCODE = '22023';
  END IF;

  IF v_wd.status <> 'approved' OR v_wd.approved_by IS NULL THEN
    RAISE EXCEPTION 'FOUR_EYES_APPROVAL_REQUIRED: Withdrawal must be independently approved before settlement'
      USING ERRCODE = '42501';
  END IF;

  IF v_wd.withdrawal_batch_id IS NULL THEN
    RAISE EXCEPTION 'SCHEDULED_BATCH_REQUIRED: Withdrawal must belong to an approved scheduled treasury batch'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_batch FROM public.withdrawal_batches WHERE id = v_wd.withdrawal_batch_id FOR UPDATE;
  IF v_batch.status NOT IN ('approved', 'disbursing', 'partially_settled') OR v_batch.approved_by IS NULL THEN
    RAISE EXCEPTION 'BATCH_APPROVAL_REQUIRED: Parent treasury batch must be independently approved'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_wd.wallet_id FOR UPDATE;
  v_treasury_acc := public.internal_get_system_account_id('1020-TREASURY-BANK');
  v_fee_acc := public.internal_get_system_account_id('4010-FEE-REVENUE');

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_wallet.reserved_account_id, 'direction', 'debit', 'amount_kobo', v_wd.total_reserved_kobo, 'memo', 'Clear reserved withdrawal liability'),
    jsonb_build_object('account_id', v_treasury_acc, 'direction', 'credit', 'amount_kobo', v_wd.amount_kobo, 'memo', 'Verified treasury bank payout')
  );

  IF v_wd.fee_kobo > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_fee_acc, 'direction', 'credit', 'amount_kobo', v_wd.fee_kobo, 'memo', 'Withdrawal fee revenue')
    );
  END IF;

  v_entry_id := public.internal_post_journal_entry(
    p_idempotency_key,
    'withdrawal_settlement',
    p_provider_transfer_ref,
    'Verified scheduled treasury withdrawal settlement',
    NULL,
    v_lines
  );

  UPDATE public.withdrawals
  SET status = 'completed',
      provider_transfer_ref = p_provider_transfer_ref,
      verified_settlement_at = now(),
      settled_at = now(),
      settlement_journal_entry_id = v_entry_id
  WHERE id = p_withdrawal_id;

  UPDATE public.transactions
  SET status = 'completed'
  WHERE id = v_wd.transaction_id;

  PERFORM public.internal_write_audit_log(
    NULL, 'service_role', 'WITHDRAWAL_SETTLED', 'withdrawal', p_withdrawal_id::text, 'high',
    jsonb_build_object('status', 'approved'),
    jsonb_build_object('status', 'completed', 'provider_transfer_ref', p_provider_transfer_ref, 'journal_entry_id', v_entry_id),
    'Verified scheduled payout settlement posted'
  );

  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_or_decline_withdrawal(
  p_withdrawal_id UUID,
  p_reason TEXT,
  p_final_status public.transaction_status_enum,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_wd RECORD;
  v_wallet RECORD;
  v_entry_id UUID;
BEGIN
  IF NOT (
    current_user IN ('postgres', 'service_role', 'silver_spoon_treasury_worker')
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR (v_caller_id IS NOT NULL AND public.app_has_any_role(v_caller_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]))
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Service role or finance_officer/super_admin required' USING ERRCODE = '42501';
  END IF;

  IF p_final_status NOT IN ('failed', 'declined') THEN
    RAISE EXCEPTION 'INVALID_FINAL_STATUS: Must be failed or declined' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_wd FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF v_wd.release_journal_entry_id IS NOT NULL THEN
    RETURN v_wd.release_journal_entry_id;
  END IF;

  IF v_wd.settlement_journal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_SETTLED: Cannot release a settled withdrawal; use four-eyes reversal'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_wd.wallet_id FOR UPDATE;

  -- Atomic release: Debit RESV, Credit AVAIL (Customer Liability preserved intact)
  v_entry_id := public.internal_post_journal_entry(
    p_idempotency_key,
    'withdrawal_release',
    v_wd.payout_idempotency_ref,
    'Release reserved withdrawal back to available balance: ' || p_reason,
    v_caller_id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_wallet.reserved_account_id, 'direction', 'debit', 'amount_kobo', v_wd.total_reserved_kobo, 'memo', 'Release withdrawal reservation'),
      jsonb_build_object('account_id', v_wallet.available_account_id, 'direction', 'credit', 'amount_kobo', v_wd.total_reserved_kobo, 'memo', 'Restore available cash balance')
    )
  );

  UPDATE public.withdrawals
  SET status = p_final_status,
      failure_reason = p_reason,
      release_journal_entry_id = v_entry_id
  WHERE id = p_withdrawal_id;

  UPDATE public.transactions
  SET status = p_final_status
  WHERE id = v_wd.transaction_id;

  IF v_wd.four_eyes_action_id IS NOT NULL AND p_final_status = 'declined' AND v_caller_id IS NOT NULL AND v_caller_id <> v_wd.initiated_by THEN
    UPDATE public.admin_actions
    SET status = 'rejected', approver_user_id = v_caller_id, decided_at = now(), rejection_reason = p_reason
    WHERE id = v_wd.four_eyes_action_id AND status = 'pending_approval';
  END IF;

  RETURN v_entry_id;
END;
$$;

-- 10. Investment Subscription & Rollover Mode Update (ADR-005)
CREATE OR REPLACE FUNCTION public.create_investment(
  p_plan_id UUID,
  p_principal_kobo BIGINT,
  p_idempotency_key TEXT,
  p_rollover_mode public.rollover_mode_enum DEFAULT 'principal_only',
  p_compounding_consent BOOLEAN DEFAULT false,
  p_consent_version TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing_inv_id UUID;
  v_plan RECORD;
  v_wallet RECORD;
  v_bal RECORD;
  v_txn_id UUID;
  v_entry_id UUID;
  v_inv_id UUID;
  v_pos_code TEXT;
  v_projected_kobo BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Sign-in required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_role(v_user_id, 'investor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Investor role required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_account_can_transact(v_user_id) THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED: Account not permitted to subscribe' USING ERRCODE = '42501';
  END IF;

  SELECT i.id INTO v_existing_inv_id
  FROM public.investments i
  JOIN public.transactions t ON t.id = i.subscription_transaction_id
  WHERE t.idempotency_key = p_idempotency_key AND i.user_id = v_user_id;

  IF v_existing_inv_id IS NOT NULL THEN
    RETURN v_existing_inv_id;
  END IF;

  SELECT * INTO v_plan FROM public.investment_plans WHERE id = p_plan_id;
  IF NOT FOUND OR v_plan.status <> 'active' THEN
    RAISE EXCEPTION 'PLAN_NOT_ACTIVE: Cannot subscribe to non-active investment plan' USING ERRCODE = '22023';
  END IF;

  IF p_principal_kobo < v_plan.min_amount_kobo OR (v_plan.max_amount_kobo IS NOT NULL AND p_principal_kobo > v_plan.max_amount_kobo) THEN
    RAISE EXCEPTION 'AMOUNT_OUT_OF_RANGE: Principal outside mandate bounds' USING ERRCODE = '22023';
  END IF;

  -- ADR-005 Return Compounding Guard
  IF p_rollover_mode = 'principal_plus_net_return' THEN
    IF NOT v_plan.allows_return_compounding THEN
      RAISE EXCEPTION 'COMPOUNDING_NOT_PERMITTED: Product terms for plan % do not allow return compounding', v_plan.plan_code
        USING ERRCODE = '22023';
    END IF;
    IF NOT COALESCE(p_compounding_consent, false) OR p_consent_version IS NULL OR length(trim(p_consent_version)) < 2 THEN
      RAISE EXCEPTION 'EXPLICIT_CONSENT_REQUIRED: Return compounding requires explicit investor consent and consent version'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id AND currency = 'NGN' FOR UPDATE;
  IF NOT FOUND OR v_wallet.status <> 'active' THEN
    RAISE EXCEPTION 'WALLET_UNAVAILABLE' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_bal FROM public.wallet_balances WHERE wallet_id = v_wallet.id FOR UPDATE;
  IF v_bal.available_kobo < p_principal_kobo THEN
    RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE_BALANCE: Available % kobo < principal % kobo',
      v_bal.available_kobo, p_principal_kobo
      USING ERRCODE = '22023';
  END IF;

  v_pos_code := 'INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_projected_kobo := (p_principal_kobo * v_plan.illustrative_target_return_bps * v_plan.tenor_days) / (10000 * 365);

  -- Post atomic transfer: Debit AVAIL, Credit INV (Total Customer Liability unchanged!)
  v_entry_id := public.internal_post_journal_entry(
    'inv:' || p_idempotency_key,
    'investment_subscription',
    v_pos_code,
    'Investor subscription to ' || v_plan.name,
    v_user_id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_wallet.available_account_id, 'direction', 'debit', 'amount_kobo', p_principal_kobo, 'memo', 'Allocate capital from available balance'),
      jsonb_build_object('account_id', v_wallet.invested_account_id, 'direction', 'credit', 'amount_kobo', p_principal_kobo, 'memo', 'Active invested principal liability')
    )
  );

  INSERT INTO public.transactions (
    reference, idempotency_key, user_id, wallet_id, transaction_type, status,
    amount_kobo, fee_kobo, tax_kobo, net_amount_kobo, description, primary_journal_entry_id
  )
  VALUES (
    v_pos_code, p_idempotency_key, v_user_id, v_wallet.id, 'investment_subscription', 'completed',
    p_principal_kobo, 0, 0, p_principal_kobo, 'Mandate subscription: ' || v_plan.name, v_entry_id
  )
  RETURNING id INTO v_txn_id;

  INSERT INTO public.investments (
    position_code, user_id, wallet_id, plan_id, subscription_transaction_id, subscription_journal_entry_id,
    principal_kobo, illustrative_projected_return_kobo, status, rollover_mode,
    return_compounding_consented_at, return_compounding_consent_version,
    started_at, matures_at
  )
  VALUES (
    v_pos_code, v_user_id, v_wallet.id, p_plan_id, v_txn_id, v_entry_id,
    p_principal_kobo, v_projected_kobo, 'active', p_rollover_mode,
    CASE WHEN p_rollover_mode = 'principal_plus_net_return' THEN now() ELSE NULL END,
    CASE WHEN p_rollover_mode = 'principal_plus_net_return' THEN p_consent_version ELSE NULL END,
    now(), now() + make_interval(days => v_plan.tenor_days)
  )
  RETURNING id INTO v_inv_id;

  RETURN v_inv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_investment_rollover_mode(
  p_investment_id UUID,
  p_rollover_mode public.rollover_mode_enum,
  p_compounding_consent BOOLEAN DEFAULT false,
  p_consent_version TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_inv RECORD;
  v_plan RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.investments WHERE id = p_investment_id FOR UPDATE;
  IF NOT FOUND OR v_inv.user_id <> v_user_id THEN
    RAISE EXCEPTION 'INVESTMENT_NOT_FOUND_OR_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF v_inv.status <> 'active' THEN
    RAISE EXCEPTION 'INVESTMENT_NOT_ACTIVE' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_plan FROM public.investment_plans WHERE id = v_inv.plan_id;

  IF p_rollover_mode = 'principal_plus_net_return' THEN
    IF NOT v_plan.allows_return_compounding THEN
      RAISE EXCEPTION 'COMPOUNDING_NOT_PERMITTED: Plan % does not permit return compounding', v_plan.plan_code
        USING ERRCODE = '22023';
    END IF;
    IF NOT COALESCE(p_compounding_consent, false) OR p_consent_version IS NULL OR length(trim(p_consent_version)) < 2 THEN
      RAISE EXCEPTION 'EXPLICIT_CONSENT_REQUIRED: Explicit consent and version required for return compounding'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.investments
  SET rollover_mode = p_rollover_mode,
      return_compounding_consented_at = CASE WHEN p_rollover_mode = 'principal_plus_net_return' THEN now() ELSE NULL END,
      return_compounding_consent_version = CASE WHEN p_rollover_mode = 'principal_plus_net_return' THEN p_consent_version ELSE NULL END
  WHERE id = p_investment_id;

  PERFORM public.internal_write_audit_log(
    v_user_id, 'investor', 'ROLLOVER_MODE_UPDATED', 'investment', p_investment_id::text, 'low',
    jsonb_build_object('rollover_mode', v_inv.rollover_mode),
    jsonb_build_object('rollover_mode', p_rollover_mode, 'consent_version', p_consent_version),
    'Investor updated maturity rollover preference'
  );

  RETURN p_investment_id;
END;
$$;

-- 11. Four-Eyes Realized Return Distribution with Configurable Tax Engine (ADR-003 / ADR-004)
CREATE OR REPLACE FUNCTION public.request_realized_return_distribution(
  p_investment_id UUID,
  p_gross_return_kobo BIGINT,
  p_fee_kobo BIGINT,
  p_treasury_funding_reference TEXT,
  p_justification TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_initiator_id UUID := auth.uid();
  v_inv RECORD;
  v_action_id UUID;
BEGIN
  IF v_initiator_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_initiator_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Finance officer or super_admin required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.investments WHERE id = p_investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVESTMENT_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF p_gross_return_kobo <= 0 OR p_fee_kobo < 0 OR p_fee_kobo > p_gross_return_kobo THEN
    RAISE EXCEPTION 'INVALID_RETURN_AMOUNTS' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_actions (
    action_type, status, target_table, target_id, subject_user_id, initiator_user_id, payload, justification
  )
  VALUES (
    'realized_return_distribution', 'pending_approval', 'investments', p_investment_id, v_inv.user_id, v_initiator_id,
    jsonb_build_object(
      'investment_id', p_investment_id,
      'gross_return_kobo', p_gross_return_kobo,
      'fee_kobo', p_fee_kobo,
      'treasury_funding_reference', p_treasury_funding_reference
    ),
    p_justification
  )
  RETURNING id INTO v_action_id;

  RETURN v_action_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_and_distribute_investment_payout(
  p_admin_action_id UUID,
  p_idempotency_key TEXT,
  p_as_of TIMESTAMPTZ DEFAULT now()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id UUID := auth.uid();
  v_action RECORD;
  v_inv RECORD;
  v_plan RECORD;
  v_profile RECORD;
  v_wallet RECORD;
  v_tax RECORD;
  v_gross BIGINT;
  v_fee BIGINT;
  v_tax_kobo BIGINT := 0;
  v_net_kobo BIGINT;
  v_seq INTEGER;
  v_yield_acc UUID;
  v_tax_acc UUID;
  v_fee_acc UUID;
  v_lines JSONB;
  v_entry_id UUID;
  v_txn_id UUID;
  v_payout_id UUID;
  v_log_id UUID;
  v_ref TEXT;
BEGIN
  IF v_approver_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_approver_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Finance officer or super_admin required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_action FROM public.admin_actions WHERE id = p_admin_action_id FOR UPDATE;
  IF NOT FOUND OR v_action.action_type <> 'realized_return_distribution' OR v_action.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'INVALID_ADMIN_ACTION' USING ERRCODE = '22023';
  END IF;

  IF v_approver_id = v_action.initiator_user_id OR v_approver_id = v_action.subject_user_id THEN
    RAISE EXCEPTION 'FOUR_EYES_VIOLATION: Initiator or investor cannot approve realized return distribution'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.investments WHERE id = (v_action.payload ->> 'investment_id')::UUID FOR UPDATE;
  SELECT * INTO v_plan FROM public.investment_plans WHERE id = v_inv.plan_id;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_inv.user_id;
  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_inv.wallet_id FOR UPDATE;

  v_gross := (v_action.payload ->> 'gross_return_kobo')::BIGINT;
  v_fee := COALESCE((v_action.payload ->> 'fee_kobo')::BIGINT, 0);

  -- Resolve effective-dated statutory WHT rule dynamically (ADR-004 — zero hard-coded rates)
  SELECT * INTO v_tax
  FROM public.resolve_applicable_tax_rule('WHT', v_plan.instrument_type, v_profile.investor_classification, p_as_of);

  IF FOUND THEN
    IF NOT v_tax.is_exempt AND (v_gross - v_fee) >= v_tax.min_threshold_kobo THEN
      v_tax_kobo := (((v_gross - v_fee) * v_tax.rate_bps) / 10000) + v_tax.fixed_amount_kobo;
    ELSE
      v_tax_kobo := 0;
    END IF;
  ELSE
    RAISE EXCEPTION 'MISSING_TAX_RULE: No effective WHT tax rule configured for instrument=% classification=% at %',
      v_plan.instrument_type, v_profile.investor_classification, p_as_of
      USING ERRCODE = '22023';
  END IF;

  v_net_kobo := v_gross - v_fee - v_tax_kobo;
  IF v_net_kobo < 0 THEN
    RAISE EXCEPTION 'NEGATIVE_NET_PAYOUT' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(payout_sequence), 0) + 1 INTO v_seq
  FROM public.investment_payouts WHERE investment_id = v_inv.id;

  v_yield_acc := public.internal_get_system_account_id('3010-REALIZED-YIELD-POOL');
  v_tax_acc := public.internal_get_system_account_id('2100-TAX-PAYABLE-WHT');
  v_fee_acc := public.internal_get_system_account_id('4010-FEE-REVENUE');
  v_ref := 'PAY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_yield_acc, 'direction', 'debit', 'amount_kobo', v_gross, 'memo', 'Realized treasury yield pool disbursement')
  );

  IF v_net_kobo > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_wallet.available_account_id, 'direction', 'credit', 'amount_kobo', v_net_kobo, 'memo', 'Net realized return credited to available balance')
    );
  END IF;

  IF v_tax_kobo > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_tax_acc, 'direction', 'credit', 'amount_kobo', v_tax_kobo, 'memo', 'Statutory tax withheld per ' || v_tax.rule_code)
    );
  END IF;

  IF v_fee > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_fee_acc, 'direction', 'credit', 'amount_kobo', v_fee, 'memo', 'Management fee revenue')
    );
  END IF;

  v_entry_id := public.internal_post_journal_entry(
    p_idempotency_key,
    'investment_payout',
    v_ref,
    'Four-eyes realized investment return distribution',
    v_approver_id,
    v_lines
  );

  INSERT INTO public.transactions (
    reference, idempotency_key, user_id, wallet_id, transaction_type, status,
    amount_kobo, fee_kobo, tax_kobo, net_amount_kobo, description, primary_journal_entry_id
  )
  VALUES (
    v_ref, p_idempotency_key, v_inv.user_id, v_inv.wallet_id, 'investment_payout', 'completed',
    v_gross, v_fee, v_tax_kobo, v_net_kobo, 'Realized return distribution for ' || v_inv.position_code, v_entry_id
  )
  RETURNING id INTO v_txn_id;

  INSERT INTO public.investment_payouts (
    investment_id, user_id, payout_sequence, transaction_id,
    gross_amount_kobo, fee_kobo, total_tax_kobo, net_amount_kobo,
    treasury_funding_reference, four_eyes_action_id, journal_entry_id
  )
  VALUES (
    v_inv.id, v_inv.user_id, v_seq, v_txn_id,
    v_gross, v_fee, v_tax_kobo, v_net_kobo,
    v_action.payload ->> 'treasury_funding_reference', p_admin_action_id, v_entry_id
  )
  RETURNING id INTO v_payout_id;

  INSERT INTO public.tax_applications (
    tax_rule_id, transaction_id, investment_payout_id, user_id,
    tax_code, instrument_type, investor_classification,
    exemption_code, exemption_applied,
    gross_amount_kobo, tax_rate_bps, fixed_amount_kobo, tax_amount_kobo, net_amount_kobo,
    legal_basis, tax_liability_journal_entry_id
  )
  VALUES (
    v_tax.tax_rule_id, v_txn_id, v_payout_id, v_inv.user_id,
    'WHT', v_plan.instrument_type, v_profile.investor_classification,
    v_tax.exemption_code, v_tax.is_exempt,
    (v_gross - v_fee), v_tax.rate_bps, v_tax.fixed_amount_kobo, v_tax_kobo, v_net_kobo,
    v_tax.legal_basis, v_entry_id
  );

  UPDATE public.wallet_balances
  SET realized_earnings_kobo = realized_earnings_kobo + v_net_kobo
  WHERE wallet_id = v_wallet.id;

  v_log_id := public.internal_write_audit_log(
    v_approver_id, 'finance_officer', 'REALIZED_RETURN_DISTRIBUTED', 'investment_payout', v_payout_id::text, 'high',
    NULL, jsonb_build_object('gross_kobo', v_gross, 'tax_kobo', v_tax_kobo, 'net_kobo', v_net_kobo, 'tax_rule', v_tax.rule_code),
    'Independent four-eyes approval and distribution completed'
  );

  UPDATE public.admin_actions
  SET status = 'executed', approver_user_id = v_approver_id, decided_at = now(), executed_at = now(), audit_log_id = v_log_id
  WHERE id = p_admin_action_id;

  RETURN v_payout_id;
END;
$$;

-- 12. Investment Maturity & Rollover Execution (ADR-005: NEVER roll into paused/archived plans)
CREATE OR REPLACE FUNCTION public.mature_investment(
  p_investment_id UUID,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv RECORD;
  v_plan RECORD;
  v_wallet RECORD;
  v_bal RECORD;
  v_net_return_kobo BIGINT := 0;
  v_applied_mode public.rollover_mode_enum;
  v_disposition TEXT;
  v_rollover_principal BIGINT := 0;
  v_entry_id UUID;
  v_txn_id UUID;
  v_child_inv_id UUID := NULL;
  v_child_txn_id UUID;
  v_child_entry_id UUID;
  v_child_pos TEXT;
  v_mat_id UUID;
  v_ref TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_caller_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Finance officer or super_admin required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.investments WHERE id = p_investment_id FOR UPDATE;
  IF NOT FOUND OR v_inv.status <> 'active' THEN
    RAISE EXCEPTION 'INVALID_INVESTMENT_FOR_MATURITY' USING ERRCODE = '22023';
  END IF;

  IF v_caller_id = v_inv.user_id THEN
    RAISE EXCEPTION 'FOUR_EYES_VIOLATION: Staff cannot process maturity on their own investment'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_plan FROM public.investment_plans WHERE id = v_inv.plan_id FOR UPDATE;
  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_inv.wallet_id FOR UPDATE;
  SELECT * INTO v_bal FROM public.wallet_balances WHERE wallet_id = v_wallet.id FOR UPDATE;

  SELECT COALESCE(SUM(net_amount_kobo), 0) INTO v_net_return_kobo
  FROM public.investment_payouts WHERE investment_id = v_inv.id;

  v_ref := 'MAT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  -- Always settle matured principal from INV -> AVAIL first
  v_entry_id := public.internal_post_journal_entry(
    'mat:' || p_idempotency_key,
    'investment_maturity',
    v_ref,
    'Principal maturity release for ' || v_inv.position_code,
    v_caller_id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_wallet.invested_account_id, 'direction', 'debit', 'amount_kobo', v_inv.principal_kobo, 'memo', 'Release matured invested principal'),
      jsonb_build_object('account_id', v_wallet.available_account_id, 'direction', 'credit', 'amount_kobo', v_inv.principal_kobo, 'memo', 'Credit matured principal to available balance')
    )
  );

  INSERT INTO public.transactions (
    reference, idempotency_key, user_id, wallet_id, transaction_type, status,
    amount_kobo, fee_kobo, tax_kobo, net_amount_kobo, description, primary_journal_entry_id
  )
  VALUES (
    v_ref, p_idempotency_key, v_inv.user_id, v_wallet.id, 'investment_maturity', 'completed',
    v_inv.principal_kobo, 0, 0, v_inv.principal_kobo, 'Principal matured for ' || v_inv.position_code, v_entry_id
  )
  RETURNING id INTO v_txn_id;

  -- ADR-005 Strict Guard: NEVER roll funds into a paused, archived, or draft plan
  IF v_inv.rollover_mode = 'none' THEN
    v_applied_mode := 'none';
    v_disposition := 'settled_to_available';
  ELSIF v_plan.status <> 'active' THEN
    v_applied_mode := 'none';
    v_disposition := 'settled_to_available_plan_unavailable';

    INSERT INTO public.notifications (user_id, category, title, body, metadata)
    VALUES (
      v_inv.user_id,
      'Investment',
      'Maturity Settled to Available Balance (Plan Unavailable for Rollover)',
      'Your position ' || v_inv.position_code || ' matured and settled to your available NGN balance because plan ' || v_plan.name || ' is currently ' || v_plan.status::text || '.',
      jsonb_build_object('investment_id', v_inv.id, 'plan_status', v_plan.status)
    );
  ELSE
    -- Plan is active; verify compounding eligibility if principal_plus_net_return was requested
    IF v_inv.rollover_mode = 'principal_plus_net_return'
       AND v_plan.allows_return_compounding
       AND v_inv.return_compounding_consented_at IS NOT NULL
    THEN
      v_applied_mode := 'principal_plus_net_return';
      v_disposition := 'rolled_principal_plus_net_return';
      v_rollover_principal := v_inv.principal_kobo + v_net_return_kobo;
    ELSE
      v_applied_mode := 'principal_only';
      v_disposition := 'rolled_principal_only';
      v_rollover_principal := v_inv.principal_kobo;
    END IF;

    -- Refresh available balance check before rolling over
    SELECT * INTO v_bal FROM public.wallet_balances WHERE wallet_id = v_wallet.id FOR UPDATE;
    IF v_bal.available_kobo < v_rollover_principal THEN
      v_rollover_principal := v_inv.principal_kobo;
      v_applied_mode := 'principal_only';
      v_disposition := 'rolled_principal_only';
    END IF;

    v_child_pos := 'INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    v_child_entry_id := public.internal_post_journal_entry(
      'roll:' || p_idempotency_key,
      'investment_rollover',
      v_child_pos,
      'Maturity rollover (' || v_applied_mode::text || ') from ' || v_inv.position_code,
      v_caller_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_wallet.available_account_id, 'direction', 'debit', 'amount_kobo', v_rollover_principal, 'memo', 'Rollover capital allocation'),
        jsonb_build_object('account_id', v_wallet.invested_account_id, 'direction', 'credit', 'amount_kobo', v_rollover_principal, 'memo', 'Rolled investment principal liability')
      )
    );

    INSERT INTO public.transactions (
      reference, idempotency_key, user_id, wallet_id, transaction_type, status,
      amount_kobo, fee_kobo, tax_kobo, net_amount_kobo, description, primary_journal_entry_id
    )
    VALUES (
      v_child_pos, 'roll-txn:' || p_idempotency_key, v_inv.user_id, v_wallet.id, 'investment_subscription', 'completed',
      v_rollover_principal, 0, 0, v_rollover_principal, 'Rollover mandate subscription: ' || v_plan.name, v_child_entry_id
    )
    RETURNING id INTO v_child_txn_id;

    INSERT INTO public.investments (
      position_code, user_id, wallet_id, plan_id, subscription_transaction_id, subscription_journal_entry_id,
      principal_kobo, illustrative_projected_return_kobo, status, rollover_mode,
      return_compounding_consented_at, return_compounding_consent_version,
      parent_investment_id, started_at, matures_at
    )
    VALUES (
      v_child_pos, v_inv.user_id, v_wallet.id, v_plan.id, v_child_txn_id, v_child_entry_id,
      v_rollover_principal,
      (v_rollover_principal * v_plan.illustrative_target_return_bps * v_plan.tenor_days) / (10000 * 365),
      'active',
      v_applied_mode,
      CASE WHEN v_applied_mode = 'principal_plus_net_return' THEN v_inv.return_compounding_consented_at ELSE NULL END,
      CASE WHEN v_applied_mode = 'principal_plus_net_return' THEN v_inv.return_compounding_consent_version ELSE NULL END,
      v_inv.id, now(), now() + make_interval(days => v_plan.tenor_days)
    )
    RETURNING id INTO v_child_inv_id;
  END IF;

  UPDATE public.investments
  SET status = CASE WHEN v_child_inv_id IS NOT NULL THEN 'rolled_over'::public.investment_status_enum ELSE 'matured'::public.investment_status_enum END,
      matured_at = now()
  WHERE id = v_inv.id;

  INSERT INTO public.investment_maturities (
    investment_id, user_id, maturity_transaction_id, maturity_journal_entry_id,
    principal_kobo, net_return_kobo, requested_rollover_mode, applied_rollover_mode,
    maturity_disposition, child_investment_id, processed_by
  )
  VALUES (
    v_inv.id, v_inv.user_id, v_txn_id, v_entry_id,
    v_inv.principal_kobo, v_net_return_kobo, v_inv.rollover_mode, v_applied_mode,
    v_disposition, v_child_inv_id, v_caller_id
  )
  RETURNING id INTO v_mat_id;

  PERFORM public.internal_write_audit_log(
    v_caller_id, 'finance_officer', 'INVESTMENT_MATURED', 'investment_maturity', v_mat_id::text, 'medium',
    jsonb_build_object('status', 'active', 'rollover_mode', v_inv.rollover_mode),
    jsonb_build_object('disposition', v_disposition, 'applied_rollover_mode', v_applied_mode, 'child_investment_id', v_child_inv_id),
    'Investment maturity processed'
  );

  RETURN v_mat_id;
END;
$$;

-- 13. Four-Eyes Financial Reversal & Manual Ledger Adjustment (ADR-003 / ADR-009)
CREATE OR REPLACE FUNCTION public.request_transaction_reversal(
  p_journal_entry_id UUID,
  p_justification TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_initiator_id UUID := auth.uid();
  v_action_id UUID;
BEGIN
  IF v_initiator_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_initiator_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = p_journal_entry_id) THEN
    RAISE EXCEPTION 'JOURNAL_ENTRY_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reverses_entry_id = p_journal_entry_id) THEN
    RAISE EXCEPTION 'ALREADY_REVERSED: Journal entry has already been reversed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_actions (
    action_type, status, target_table, target_id, initiator_user_id, payload, justification
  )
  VALUES (
    'transaction_reversal', 'pending_approval', 'journal_entries', p_journal_entry_id, v_initiator_id,
    jsonb_build_object('journal_entry_id', p_journal_entry_id),
    p_justification
  )
  RETURNING id INTO v_action_id;

  RETURN v_action_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_and_post_reversal(
  p_admin_action_id UUID,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id UUID := auth.uid();
  v_action RECORD;
  v_orig_id UUID;
  v_orig RECORD;
  v_rev_lines JSONB;
  v_rev_entry_id UUID;
  v_log_id UUID;
BEGIN
  IF v_approver_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_approver_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_action FROM public.admin_actions WHERE id = p_admin_action_id FOR UPDATE;
  IF NOT FOUND OR v_action.action_type <> 'transaction_reversal' OR v_action.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'INVALID_REVERSAL_ACTION' USING ERRCODE = '22023';
  END IF;

  IF v_approver_id = v_action.initiator_user_id THEN
    RAISE EXCEPTION 'FOUR_EYES_VIOLATION: Initiator cannot approve own reversal' USING ERRCODE = '42501';
  END IF;

  v_orig_id := (v_action.payload ->> 'journal_entry_id')::UUID;
  SELECT * INTO v_orig FROM public.journal_entries WHERE id = v_orig_id;

  -- Mirror every debit <-> credit line verbatim
  SELECT jsonb_agg(
    jsonb_build_object(
      'account_id', jl.ledger_account_id,
      'direction', CASE WHEN jl.direction = 'debit' THEN 'credit' ELSE 'debit' END,
      'amount_kobo', jl.amount_kobo,
      'memo', 'Reversal of entry #' || v_orig.entry_number::text
    )
  )
  INTO v_rev_lines
  FROM public.journal_lines jl
  WHERE jl.journal_entry_id = v_orig_id;

  v_rev_entry_id := public.internal_post_journal_entry(
    p_idempotency_key,
    'reversal',
    'REV-' || v_orig.reference_code,
    'Four-eyes approved reversal of ' || v_orig.reference_code || ': ' || v_action.justification,
    v_approver_id,
    v_rev_lines,
    v_orig_id
  );

  UPDATE public.transactions
  SET status = 'reversed', reversal_journal_entry_id = v_rev_entry_id
  WHERE primary_journal_entry_id = v_orig_id;

  v_log_id := public.internal_write_audit_log(
    v_approver_id, 'finance_officer', 'JOURNAL_ENTRY_REVERSED', 'journal_entry', v_orig_id::text, 'high',
    jsonb_build_object('original_entry_id', v_orig_id),
    jsonb_build_object('reversing_entry_id', v_rev_entry_id),
    v_action.justification
  );

  UPDATE public.admin_actions
  SET status = 'executed', approver_user_id = v_approver_id, decided_at = now(), executed_at = now(), audit_log_id = v_log_id
  WHERE id = p_admin_action_id;

  RETURN v_rev_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_manual_ledger_adjustment(
  p_lines JSONB,
  p_reference_code TEXT,
  p_justification TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_initiator_id UUID := auth.uid();
  v_action_id UUID;
BEGIN
  IF v_initiator_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_initiator_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.admin_actions (
    action_type, status, target_table, initiator_user_id, payload, justification
  )
  VALUES (
    'manual_ledger_adjustment', 'pending_approval', 'journal_entries', v_initiator_id,
    jsonb_build_object('lines', p_lines, 'reference_code', p_reference_code),
    p_justification
  )
  RETURNING id INTO v_action_id;

  RETURN v_action_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_and_post_manual_adjustment(
  p_admin_action_id UUID,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id UUID := auth.uid();
  v_action RECORD;
  v_entry_id UUID;
  v_log_id UUID;
BEGIN
  IF v_approver_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_approver_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_action FROM public.admin_actions WHERE id = p_admin_action_id FOR UPDATE;
  IF NOT FOUND OR v_action.action_type <> 'manual_ledger_adjustment' OR v_action.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'INVALID_ADJUSTMENT_ACTION' USING ERRCODE = '22023';
  END IF;

  IF v_approver_id = v_action.initiator_user_id THEN
    RAISE EXCEPTION 'FOUR_EYES_VIOLATION: Initiator cannot approve own manual ledger adjustment' USING ERRCODE = '42501';
  END IF;

  v_entry_id := public.internal_post_journal_entry(
    p_idempotency_key,
    'manual_adjustment',
    v_action.payload ->> 'reference_code',
    'Four-eyes approved manual ledger adjustment: ' || v_action.justification,
    v_approver_id,
    v_action.payload -> 'lines'
  );

  v_log_id := public.internal_write_audit_log(
    v_approver_id, 'finance_officer', 'MANUAL_LEDGER_ADJUSTMENT_POSTED', 'journal_entry', v_entry_id::text, 'high',
    NULL, jsonb_build_object('journal_entry_id', v_entry_id, 'reference_code', v_action.payload ->> 'reference_code'),
    v_action.justification
  );

  UPDATE public.admin_actions
  SET status = 'executed', approver_user_id = v_approver_id, decided_at = now(), executed_at = now(), target_id = v_entry_id, audit_log_id = v_log_id
  WHERE id = p_admin_action_id;

  RETURN v_entry_id;
END;
$$;

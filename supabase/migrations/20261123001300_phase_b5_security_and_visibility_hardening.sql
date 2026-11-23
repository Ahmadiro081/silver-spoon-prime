-- ============================================================================
-- SILVER SPOON — Phase B.5 Forward-Only Migration 0013
-- Security & Public Plan Visibility Hardening
--
-- Preserves approved Migrations 0001-0012 untouched.
-- Fixes discovered during Phase B.5 Security Review:
--   1. Replace current_user check inside SECURITY DEFINER functions (which
--      always evaluated to function owner 'postgres') with explicit caller-role
--      detection via internal_is_service_caller() inspecting request.jwt.claim.role,
--      current_setting('role', true), and session_user.
--   2. Enforce verified-failure-only release for 'failed' withdrawals (restricted
--      to service_role / silver_spoon_treasury_worker) and non-self-decline for
--      'declined' withdrawals.
--   3. Prevent cross-user RBAC role enumeration in app_has_role / app_has_any_role
--      / app_is_staff / app_account_can_transact.
--   4. Restrict anonymous public plan visibility strictly to status = 'active'
--      (paused and archived plans never exposed as available opportunities).
--   5. Explicitly revoke CREATE on schema public from PUBLIC, anon, authenticated.
-- ============================================================================

-- 1. Explicitly revoke CREATE on schema public (defense-in-depth for PostgreSQL 15+)
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

-- 2. Accurate caller-role detector safe inside SECURITY DEFINER functions
CREATE OR REPLACE FUNCTION public.internal_is_service_caller()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role TEXT := NULLIF(current_setting('request.jwt.claim.role', true), '');
  v_active_role TEXT := COALESCE(NULLIF(current_setting('role', true), ''), 'none');
BEGIN
  -- Supabase PostgREST / Edge Function JWT claim takes precedence
  IF v_jwt_role IS NOT NULL THEN
    RETURN v_jwt_role = 'service_role';
  END IF;

  -- Direct SQL session using SET [LOCAL] ROLE
  IF v_active_role <> 'none' THEN
    RETURN v_active_role IN (
      'postgres',
      'supabase_admin',
      'service_role',
      'silver_spoon_treasury_worker',
      'silver_spoon_reconciler'
    );
  END IF;

  -- Direct superuser / backend worker connection without SET ROLE override
  RETURN session_user IN (
    'postgres',
    'supabase_admin',
    'service_role',
    'silver_spoon_treasury_worker',
    'silver_spoon_reconciler'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.internal_is_service_caller() FROM PUBLIC, anon, authenticated;

-- 3. Harden internal_assert_service_caller() to use internal_is_service_caller()
CREATE OR REPLACE FUNCTION public.internal_assert_service_caller()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.internal_is_service_caller() THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'UNAUTHORIZED_SERVICE_CALL: Restricted strictly to backend service_role'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.internal_assert_service_caller() FROM PUBLIC, anon, authenticated;

-- 4. Harden RBAC helper functions against cross-user role enumeration by non-service callers
CREATE OR REPLACE FUNCTION public.app_has_role(p_user_id UUID, p_role public.app_role_enum)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.internal_is_service_caller() AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role = p_role
      AND ur.revoked_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_has_any_role(p_user_id UUID, p_roles public.app_role_enum[])
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.internal_is_service_caller() AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role = ANY(p_roles)
      AND ur.revoked_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_is_staff(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.internal_is_service_caller() AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN public.app_has_any_role(
    p_user_id,
    ARRAY['super_admin', 'admin', 'finance_officer', 'compliance_officer']::public.app_role_enum[]
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_account_can_transact(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.internal_is_service_caller() AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.account_statuses s ON s.code = p.status_code
    WHERE p.id = p_user_id
      AND s.can_login = true
      AND s.can_transact = true
  );
END;
$$;

-- 5. Harden reconcile_wallet_balance() so authenticated investors can NEVER bypass authorization
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
  IF NOT (
    public.internal_is_service_caller()
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

-- 6. Harden fail_or_decline_withdrawal():
--    - Blocks investors completely (fixes current_user SECURITY DEFINER bug)
--    - 'failed' payout release strictly requires verified backend service_role / treasury worker
--    - 'declined' strictly requires independent finance_officer/super_admin (not owner/initiator)
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
  v_is_service BOOLEAN := public.internal_is_service_caller();
  v_wd RECORD;
  v_wallet RECORD;
  v_entry_id UUID;
BEGIN
  IF p_final_status NOT IN ('failed', 'declined') THEN
    RAISE EXCEPTION 'INVALID_FINAL_STATUS: Must be failed or declined' USING ERRCODE = '22023';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 6 THEN
    RAISE EXCEPTION 'FAILURE_REASON_REQUIRED: Verified failure or decline justification required'
      USING ERRCODE = '22023';
  END IF;

  IF p_final_status = 'failed' THEN
    -- Failed payout reservations may ONLY be released after verified external failure via backend service caller
    IF NOT v_is_service THEN
      RAISE EXCEPTION 'VERIFIED_FAILURE_SERVICE_REQUIRED: Failed payout release requires verified backend service callback'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Pre-disbursement decline requires service caller OR finance_officer / super_admin
    IF NOT (
      v_is_service
      OR (v_caller_id IS NOT NULL AND public.app_has_any_role(v_caller_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]))
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Finance officer, super_admin, or treasury worker required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_wd FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF p_final_status = 'declined' AND NOT v_is_service AND (v_caller_id = v_wd.user_id OR v_caller_id = v_wd.initiated_by) THEN
    RAISE EXCEPTION 'FOUR_EYES_VIOLATION: Initiator or owner cannot decline own withdrawal via staff RPC'
      USING ERRCODE = '42501';
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

  PERFORM public.internal_write_audit_log(
    v_caller_id,
    CASE WHEN v_is_service THEN 'service_role' ELSE 'finance_officer' END,
    CASE WHEN p_final_status = 'failed' THEN 'WITHDRAWAL_FAILED_RESERVATION_RELEASED' ELSE 'WITHDRAWAL_DECLINED_RESERVATION_RELEASED' END,
    'withdrawal',
    p_withdrawal_id::text,
    'high',
    jsonb_build_object('status', v_wd.status),
    jsonb_build_object('status', p_final_status, 'release_journal_entry_id', v_entry_id),
    p_reason
  );

  RETURN v_entry_id;
END;
$$;

-- 7. Tighten Public Investment Plan Visibility (Phase B.5 Requirement #4)
--    Public/anonymous users ONLY see status = 'active'. Paused & archived plans are hidden.
--    Authenticated investors see 'active' plans plus metadata ONLY for plans they already hold positions in.
DROP POLICY IF EXISTS rls_investment_plans_select_public ON public.investment_plans;

CREATE POLICY rls_investment_plans_select_anon ON public.investment_plans
  FOR SELECT TO anon
  USING (status = 'active');

CREATE POLICY rls_investment_plans_select_investor ON public.investment_plans
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    OR EXISTS (
      SELECT 1
      FROM public.investments i
      WHERE i.plan_id = public.investment_plans.id
        AND i.user_id = auth.uid()
    )
  );

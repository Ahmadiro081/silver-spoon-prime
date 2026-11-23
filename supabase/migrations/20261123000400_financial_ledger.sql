-- ============================================================================
-- SILVER SPOON — Phase B Migration 0004
-- Module C: Double-Entry Internal Financial Subledger (Tables 8-11)
-- Tables: financial_periods, ledger_accounts, journal_entries, journal_lines
--
-- CUSTODY DISCLAIMER (ADR-001):
-- This PostgreSQL ledger is strictly an internal accounting subledger.
-- It is NOT a substitute for actual legal custody, custodian holdings,
-- or regulated banking partner balances.
-- ============================================================================

-- 8. financial_periods
CREATE TABLE public.financial_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_code TEXT NOT NULL UNIQUE CHECK (period_code ~ '^[0-9]{4}-[0-9]{2}$'),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status public.financial_period_status_enum NOT NULL DEFAULT 'open',
  closed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  close_action_id UUID REFERENCES public.admin_actions(id) ON DELETE RESTRICT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- Seed active initial accounting period for non-production staging validation
INSERT INTO public.financial_periods (period_code, starts_at, ends_at, status)
VALUES (
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'),
  date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
  (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC',
  'open'
)
ON CONFLICT (period_code) DO NOTHING;

-- 9. ledger_accounts (Chart of Accounts — NGN kobo subledger)
CREATE TABLE public.ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code TEXT NOT NULL UNIQUE,
  account_name TEXT NOT NULL,
  account_type public.ledger_account_type_enum NOT NULL,
  normal_balance public.journal_direction_enum NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  owner_user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  subledger_kind TEXT CHECK (
    subledger_kind IS NULL
    OR subledger_kind IN ('customer_available', 'customer_reserved', 'customer_invested', 'system_control')
  ),
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (account_type IN ('asset', 'expense') AND normal_balance = 'debit')
    OR (account_type IN ('liability', 'equity', 'revenue') AND normal_balance = 'credit')
  )
);

CREATE INDEX idx_ledger_accounts_owner ON public.ledger_accounts(owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE UNIQUE INDEX uq_ledger_accounts_owner_subledger
  ON public.ledger_accounts(owner_user_id, subledger_kind)
  WHERE owner_user_id IS NOT NULL AND subledger_kind IN ('customer_available', 'customer_reserved', 'customer_invested');

-- Seed system subledger control accounts
INSERT INTO public.ledger_accounts (account_code, account_name, account_type, normal_balance, subledger_kind, is_system)
VALUES
  ('1010-PAYSTACK-CLEARING', 'Paystack Checkout Clearing Control', 'asset', 'debit', 'system_control', true),
  ('1020-TREASURY-BANK', 'Regulated Banking Partner Treasury Control', 'asset', 'debit', 'system_control', true),
  ('1030-CUSTODIAN-MANAGED-POOL', 'Custodian & SEC-Registered Manager Pool Control', 'asset', 'debit', 'system_control', true),
  ('2100-TAX-PAYABLE-WHT', 'Statutory Withholding Tax Payable Control', 'liability', 'credit', 'system_control', true),
  ('2100-TAX-PAYABLE-EMTL', 'Statutory Electronic Money Transfer Levy Payable', 'liability', 'credit', 'system_control', true),
  ('2100-TAX-PAYABLE-OTHER', 'Other Statutory Tax Payable Control', 'liability', 'credit', 'system_control', true),
  ('3010-REALIZED-YIELD-POOL', 'Verified Realized Treasury Yield Clearing Pool', 'liability', 'credit', 'system_control', true),
  ('4010-FEE-REVENUE', 'Platform Fee Revenue', 'revenue', 'credit', 'system_control', true),
  ('5010-REFERRAL-EXP', 'Referral Commission Expense', 'expense', 'debit', 'system_control', true)
ON CONFLICT (account_code) DO NOTHING;

-- 10. journal_entries (immutable double-entry header)
CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  financial_period_id UUID NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  entry_type TEXT NOT NULL,
  reference_code TEXT NOT NULL,
  description TEXT NOT NULL,
  reverses_entry_id UUID UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  posted_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (reverses_entry_id IS NULL OR reverses_entry_id <> id)
);

CREATE INDEX idx_journal_entries_period ON public.journal_entries(financial_period_id, posted_at DESC);
CREATE INDEX idx_journal_entries_reference ON public.journal_entries(reference_code);

-- 11. journal_lines (immutable double-entry legs; integer kobo BIGINT > 0)
CREATE TABLE public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  ledger_account_id UUID NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  direction public.journal_direction_enum NOT NULL,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  currency CHAR(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  line_memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_lines_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX idx_journal_lines_account ON public.journal_lines(ledger_account_id, created_at DESC);

-- ============================================================================
-- Mandatory Ledger Integrity Triggers (ADR-009)
-- ============================================================================

-- 1) Append-only immutability on journal_entries and journal_lines
CREATE TRIGGER trg_journal_entries_immutable
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

CREATE TRIGGER trg_journal_lines_immutable
  BEFORE UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

-- 2) Commit-time balanced journal verification (DEFERRABLE INITIALLY DEFERRED)
CREATE OR REPLACE FUNCTION public.assert_journal_entry_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id UUID;
  v_period_status public.financial_period_status_enum;
  v_line_count INTEGER;
  v_debit_total BIGINT;
  v_credit_total BIGINT;
BEGIN
  v_entry_id := COALESCE(
    NULLIF(to_jsonb(NEW) ->> 'journal_entry_id', '')::UUID,
    (to_jsonb(NEW) ->> 'id')::UUID
  );

  SELECT fp.status
  INTO v_period_status
  FROM public.journal_entries je
  JOIN public.financial_periods fp ON fp.id = je.financial_period_id
  WHERE je.id = v_entry_id;

  IF v_period_status IS NULL OR v_period_status <> 'open' THEN
    RAISE EXCEPTION 'CLOSED_FINANCIAL_PERIOD: Journal entry % cannot be posted into non-open period (status=%)',
      v_entry_id, COALESCE(v_period_status::text, 'NULL')
      USING ERRCODE = '22023';
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_kobo ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_kobo ELSE 0 END), 0)
  INTO v_line_count, v_debit_total, v_credit_total
  FROM public.journal_lines
  WHERE journal_entry_id = v_entry_id;

  IF v_line_count < 2 THEN
    RAISE EXCEPTION 'INCOMPLETE_JOURNAL_ENTRY: Journal entry % must have at least 2 lines (found %)',
      v_entry_id, v_line_count
      USING ERRCODE = '22023';
  END IF;

  IF v_debit_total <= 0 OR v_debit_total <> v_credit_total THEN
    RAISE EXCEPTION 'UNBALANCED_JOURNAL_ENTRY: Journal entry % debits (% kobo) <> credits (% kobo)',
      v_entry_id, v_debit_total, v_credit_total
      USING ERRCODE = '22023';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_journal_entries_assert_balanced
  AFTER INSERT ON public.journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_journal_entry_balanced();

CREATE CONSTRAINT TRIGGER trg_journal_lines_assert_balanced
  AFTER INSERT ON public.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_journal_entry_balanced();

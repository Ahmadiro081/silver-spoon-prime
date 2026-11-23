-- ============================================================================
-- SILVER SPOON — Phase B Migration 0007
-- Module E: Configurable Statutory Tax Rules Engine (Tables 21-22)
-- Tables: tax_rules, tax_applications
--
-- ADR-004: Universal hard-coded 10% WHT or NGN 50 EMTL deductions are
-- strictly prohibited. All statutory taxes are driven by effective-dated,
-- instrument- and investor-classified rules with immutable legal_basis snapshots.
-- ============================================================================

-- 21. tax_rules
CREATE TABLE public.tax_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code TEXT NOT NULL UNIQUE CHECK (rule_code ~ '^[A-Z0-9_-]{4,48}$'),
  tax_code TEXT NOT NULL CHECK (tax_code IN ('WHT', 'EMTL', 'VAT_ON_FEE', 'STAMP_DUTY', 'OTHER')),
  instrument_type TEXT NOT NULL CHECK (instrument_type IN (
    'fgn_treasury_bill',
    'fgn_bond',
    'corporate_commercial_paper',
    'private_credit',
    'money_market_fund',
    'bank_transfer',
    'platform_fee',
    'general'
  )),
  investor_classification public.investor_classification_enum NOT NULL,
  exemption_code TEXT,
  is_exempt BOOLEAN NOT NULL DEFAULT false,
  rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (rate_bps >= 0 AND rate_bps <= 10000),
  fixed_amount_kobo BIGINT NOT NULL DEFAULT 0 CHECK (fixed_amount_kobo >= 0),
  min_threshold_kobo BIGINT NOT NULL DEFAULT 0 CHECK (min_threshold_kobo >= 0),
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  legal_basis TEXT NOT NULL CHECK (length(trim(legal_basis)) >= 10),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approval_action_id UUID REFERENCES public.admin_actions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_tax_rules_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT chk_tax_rules_exempt_zero_rate
    CHECK (NOT is_exempt OR (rate_bps = 0 AND fixed_amount_kobo = 0))
);

CREATE INDEX idx_tax_rules_lookup
  ON public.tax_rules(tax_code, instrument_type, investor_classification, effective_from DESC)
  WHERE is_active = true;

CREATE TRIGGER trg_tax_rules_updated_at
  BEFORE UPDATE ON public.tax_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 22. tax_applications (immutable point-in-time statutory tax calculation snapshot)
CREATE TABLE public.tax_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_rule_id UUID NOT NULL REFERENCES public.tax_rules(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  investment_payout_id UUID, -- FK added in migration 0008 -> investment_payouts(id)
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  tax_code TEXT NOT NULL,
  instrument_type TEXT NOT NULL,
  investor_classification public.investor_classification_enum NOT NULL,
  exemption_code TEXT,
  exemption_applied BOOLEAN NOT NULL DEFAULT false,
  gross_amount_kobo BIGINT NOT NULL CHECK (gross_amount_kobo >= 0),
  tax_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_bps >= 0),
  fixed_amount_kobo BIGINT NOT NULL DEFAULT 0 CHECK (fixed_amount_kobo >= 0),
  tax_amount_kobo BIGINT NOT NULL CHECK (tax_amount_kobo >= 0),
  net_amount_kobo BIGINT NOT NULL CHECK (net_amount_kobo >= 0),
  legal_basis TEXT NOT NULL,
  tax_liability_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  remittance_reference TEXT,
  remitted_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_tax_applications_arithmetic
    CHECK (net_amount_kobo = gross_amount_kobo - tax_amount_kobo),
  CONSTRAINT chk_tax_applications_remittance_pair
    CHECK ((remittance_reference IS NULL AND remitted_at IS NULL) OR (remittance_reference IS NOT NULL AND remitted_at IS NOT NULL))
);

CREATE INDEX idx_tax_applications_user ON public.tax_applications(user_id, applied_at DESC);
CREATE INDEX idx_tax_applications_txn ON public.tax_applications(transaction_id);
CREATE INDEX idx_tax_applications_unremitted ON public.tax_applications(tax_code, applied_at)
  WHERE remittance_reference IS NULL AND tax_amount_kobo > 0;

-- Append-only guard on tax_applications: blocks DELETE and blocks all UPDATE except one-time remittance recording
CREATE OR REPLACE FUNCTION public.guard_tax_applications_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD: DELETE prohibited on public.tax_applications'
      USING ERRCODE = '55000';
  END IF;

  -- Only allow setting remittance_reference & remitted_at once when previously NULL
  IF OLD.remittance_reference IS NOT NULL
     OR NEW.tax_rule_id IS DISTINCT FROM OLD.tax_rule_id
     OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
     OR NEW.investment_payout_id IS DISTINCT FROM OLD.investment_payout_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.tax_code IS DISTINCT FROM OLD.tax_code
     OR NEW.instrument_type IS DISTINCT FROM OLD.instrument_type
     OR NEW.investor_classification IS DISTINCT FROM OLD.investor_classification
     OR NEW.exemption_code IS DISTINCT FROM OLD.exemption_code
     OR NEW.exemption_applied IS DISTINCT FROM OLD.exemption_applied
     OR NEW.gross_amount_kobo IS DISTINCT FROM OLD.gross_amount_kobo
     OR NEW.tax_rate_bps IS DISTINCT FROM OLD.tax_rate_bps
     OR NEW.fixed_amount_kobo IS DISTINCT FROM OLD.fixed_amount_kobo
     OR NEW.tax_amount_kobo IS DISTINCT FROM OLD.tax_amount_kobo
     OR NEW.net_amount_kobo IS DISTINCT FROM OLD.net_amount_kobo
     OR NEW.legal_basis IS DISTINCT FROM OLD.legal_basis
     OR NEW.tax_liability_journal_entry_id IS DISTINCT FROM OLD.tax_liability_journal_entry_id
     OR NEW.applied_at IS DISTINCT FROM OLD.applied_at
  THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD: tax_applications financial and legal snapshot fields are immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tax_applications_immutable
  BEFORE UPDATE OR DELETE ON public.tax_applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_tax_applications_immutability();

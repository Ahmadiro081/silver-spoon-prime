-- ============================================================================
-- SILVER SPOON — Phase B Migration 0008
-- Modules F & G: Investment Mandates, Rollovers, Realized Payouts & Referrals (Tables 23-30)
-- Tables: investment_plans, investments, investment_allocations,
--         investment_payouts, investment_maturities,
--         referral_settings, referrals, referral_commissions
-- ============================================================================

-- 23. investment_plans
CREATE TABLE public.investment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code TEXT NOT NULL UNIQUE CHECK (plan_code ~ '^PLN-[A-Z0-9-]{3,24}$'),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,48}$'),
  name TEXT NOT NULL,
  instrument_type TEXT NOT NULL CHECK (instrument_type IN (
    'fgn_treasury_bill',
    'fgn_bond',
    'corporate_commercial_paper',
    'private_credit',
    'money_market_fund'
  )),
  risk_band TEXT NOT NULL CHECK (risk_band IN ('Conservative', 'Moderate', 'Balanced', 'Institutional')),
  tenor_days INTEGER NOT NULL CHECK (tenor_days > 0),
  min_amount_kobo BIGINT NOT NULL CHECK (min_amount_kobo > 0),
  max_amount_kobo BIGINT CHECK (max_amount_kobo IS NULL OR max_amount_kobo >= min_amount_kobo),
  -- Strictly informational projection; NEVER triggers ledger posting
  illustrative_target_return_bps INTEGER NOT NULL CHECK (illustrative_target_return_bps >= 0),
  -- ADR-005: Product terms flag governing whether return compounding is legally permitted
  allows_return_compounding BOOLEAN NOT NULL DEFAULT false,
  status public.plan_status_enum NOT NULL DEFAULT 'draft',
  terms_version TEXT NOT NULL DEFAULT 'v1.0',
  summary TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_investment_plans_status ON public.investment_plans(status);

CREATE TRIGGER trg_investment_plans_updated_at
  BEFORE UPDATE ON public.investment_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 24. investments
CREATE TABLE public.investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_code TEXT NOT NULL UNIQUE CHECK (position_code ~ '^INV-[A-Z0-9-]{4,32}$'),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES public.investment_plans(id) ON DELETE RESTRICT,
  subscription_transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  subscription_journal_entry_id UUID NOT NULL UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  principal_kobo BIGINT NOT NULL CHECK (principal_kobo > 0),
  illustrative_projected_return_kobo BIGINT NOT NULL DEFAULT 0 CHECK (illustrative_projected_return_kobo >= 0),
  status public.investment_status_enum NOT NULL DEFAULT 'active',
  -- ADR-005: Principal-only default; principal_plus_net_return requires explicit consent timestamp
  rollover_mode public.rollover_mode_enum NOT NULL DEFAULT 'principal_only',
  return_compounding_consented_at TIMESTAMPTZ,
  return_compounding_consent_version TEXT,
  parent_investment_id UUID REFERENCES public.investments(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  matures_at TIMESTAMPTZ NOT NULL,
  matured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_investments_maturity_after_start CHECK (matures_at > started_at),
  CONSTRAINT chk_investments_compounding_requires_consent CHECK (
    rollover_mode <> 'principal_plus_net_return'
    OR (return_compounding_consented_at IS NOT NULL AND return_compounding_consent_version IS NOT NULL)
  )
);

CREATE INDEX idx_investments_user_status ON public.investments(user_id, status, matures_at);
CREATE INDEX idx_investments_plan_status ON public.investments(plan_id, status);

CREATE TRIGGER trg_investments_updated_at
  BEFORE UPDATE ON public.investments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 25. investment_allocations (tracks custodian / SEC-registered manager deployment batches)
CREATE TABLE public.investment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id UUID NOT NULL REFERENCES public.investments(id) ON DELETE RESTRICT,
  custodian_batch_ref TEXT NOT NULL,
  instrument_type TEXT NOT NULL,
  allocated_kobo BIGINT NOT NULL CHECK (allocated_kobo > 0),
  allocation_status TEXT NOT NULL DEFAULT 'pending_custodian' CHECK (
    allocation_status IN ('pending_custodian', 'deployed', 'liquidated', 'reconciled')
  ),
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciled_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX idx_investment_allocations_inv ON public.investment_allocations(investment_id);

-- 26. investment_payouts (strictly realized distributions backed by treasury cash & four-eyes approval)
CREATE TABLE public.investment_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id UUID NOT NULL REFERENCES public.investments(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payout_sequence INTEGER NOT NULL CHECK (payout_sequence >= 1),
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  gross_amount_kobo BIGINT NOT NULL CHECK (gross_amount_kobo > 0),
  fee_kobo BIGINT NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0),
  total_tax_kobo BIGINT NOT NULL DEFAULT 0 CHECK (total_tax_kobo >= 0),
  net_amount_kobo BIGINT NOT NULL CHECK (net_amount_kobo >= 0),
  treasury_funding_reference TEXT NOT NULL CHECK (length(trim(treasury_funding_reference)) >= 6),
  four_eyes_action_id UUID NOT NULL REFERENCES public.admin_actions(id) ON DELETE RESTRICT,
  journal_entry_id UUID NOT NULL UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  distributed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (investment_id, payout_sequence),
  CONSTRAINT chk_investment_payouts_net_formula
    CHECK (net_amount_kobo = gross_amount_kobo - fee_kobo - total_tax_kobo)
);

CREATE INDEX idx_investment_payouts_user ON public.investment_payouts(user_id, distributed_at DESC);

-- Wire deferred FK on tax_applications -> investment_payouts
ALTER TABLE public.tax_applications
  ADD CONSTRAINT fk_tax_applications_payout
    FOREIGN KEY (investment_payout_id) REFERENCES public.investment_payouts(id) ON DELETE RESTRICT;

-- 27. investment_maturities (records principal maturity & rollover disposition)
CREATE TABLE public.investment_maturities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id UUID NOT NULL UNIQUE REFERENCES public.investments(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  maturity_transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  maturity_journal_entry_id UUID NOT NULL UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  principal_kobo BIGINT NOT NULL CHECK (principal_kobo > 0),
  net_return_kobo BIGINT NOT NULL DEFAULT 0 CHECK (net_return_kobo >= 0),
  requested_rollover_mode public.rollover_mode_enum NOT NULL,
  applied_rollover_mode public.rollover_mode_enum NOT NULL,
  maturity_disposition TEXT NOT NULL CHECK (maturity_disposition IN (
    'settled_to_available',
    'rolled_principal_only',
    'rolled_principal_plus_net_return',
    'settled_to_available_plan_unavailable'
  )),
  child_investment_id UUID UNIQUE REFERENCES public.investments(id) ON DELETE RESTRICT,
  processed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE INDEX idx_investment_maturities_user ON public.investment_maturities(user_id, processed_at DESC);

-- 28. referral_settings
CREATE TABLE public.referral_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_rate_bps INTEGER NOT NULL CHECK (commission_rate_bps >= 0 AND commission_rate_bps <= 2000),
  min_qualifying_investment_kobo BIGINT NOT NULL CHECK (min_qualifying_investment_kobo > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  approval_action_id UUID REFERENCES public.admin_actions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- 29. referrals
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  referred_user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  referral_code_used TEXT NOT NULL,
  qualifying_investment_id UUID UNIQUE REFERENCES public.investments(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'qualified', 'paid', 'disqualified')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_referrals_no_self_referral CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_user_id, status);

CREATE TRIGGER trg_referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 30. referral_commissions (idempotent, four-eyes approved payout)
CREATE TABLE public.referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL UNIQUE REFERENCES public.referrals(id) ON DELETE RESTRICT,
  qualifying_investment_id UUID NOT NULL UNIQUE REFERENCES public.investments(id) ON DELETE RESTRICT,
  referrer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  journal_entry_id UUID NOT NULL UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  commission_kobo BIGINT NOT NULL CHECK (commission_kobo > 0),
  four_eyes_action_id UUID NOT NULL REFERENCES public.admin_actions(id) ON DELETE RESTRICT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_referral_commissions_referrer ON public.referral_commissions(referrer_user_id, paid_at DESC);

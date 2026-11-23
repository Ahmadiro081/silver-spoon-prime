-- ============================================================================
-- SILVER SPOON — Phase B Migration 0005
-- Module B: Wallet Management & Mutually Exclusive Customer Sub-Ledgers (Tables 12-14)
-- Tables: wallets, wallet_accounts, wallet_balances
-- ============================================================================

-- 12. wallets (1:1 NGN subledger wallet per investor linking 3 disjoint liability sub-ledgers)
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  currency CHAR(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status public.wallet_status_enum NOT NULL DEFAULT 'active',
  available_account_id UUID NOT NULL UNIQUE REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  reserved_account_id UUID NOT NULL UNIQUE REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  invested_account_id UUID NOT NULL UNIQUE REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  frozen_reason TEXT,
  frozen_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  frozen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency),
  -- Mathematical non-double-counting structural invariant: the 3 sub-ledgers MUST be distinct
  CONSTRAINT chk_wallets_distinct_subledgers CHECK (
    available_account_id <> reserved_account_id
    AND available_account_id <> invested_account_id
    AND reserved_account_id <> invested_account_id
  )
);

CREATE INDEX idx_wallets_user_id ON public.wallets(user_id);
CREATE INDEX idx_wallets_status ON public.wallets(status);

CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 13. wallet_accounts (verified Nigerian payout NUBAN bank accounts only; DVAs deferred per ADR-002)
CREATE TABLE public.wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  bank_code TEXT NOT NULL CHECK (bank_code ~ '^[0-9]{3,6}$'),
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL CHECK (account_number ~ '^[0-9]{10}$'),
  account_name TEXT NOT NULL CHECK (length(trim(account_name)) >= 2),
  account_purpose TEXT NOT NULL DEFAULT 'payout_nuban' CHECK (account_purpose = 'payout_nuban'),
  is_primary BOOLEAN NOT NULL DEFAULT true,
  verification_status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (
    verification_status IN ('pending_approval', 'verified', 'rejected', 'revoked')
  ),
  change_approval_action_id UUID REFERENCES public.admin_actions(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_wallet_accounts_active_nuban
  ON public.wallet_accounts(wallet_id, bank_code, account_number)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX uq_wallet_accounts_primary_active
  ON public.wallet_accounts(wallet_id)
  WHERE is_primary = true AND verification_status = 'verified' AND revoked_at IS NULL;

CREATE INDEX idx_wallet_accounts_user ON public.wallet_accounts(user_id);

CREATE TRIGGER trg_wallet_accounts_updated_at
  BEFORE UPDATE ON public.wallet_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 14. wallet_balances (atomically updated cache continuously reconciled against journal_lines)
CREATE TABLE public.wallet_balances (
  wallet_id UUID PRIMARY KEY REFERENCES public.wallets(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  currency CHAR(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  available_kobo BIGINT NOT NULL DEFAULT 0 CHECK (available_kobo >= 0),
  reserved_withdrawal_kobo BIGINT NOT NULL DEFAULT 0 CHECK (reserved_withdrawal_kobo >= 0),
  invested_principal_kobo BIGINT NOT NULL DEFAULT 0 CHECK (invested_principal_kobo >= 0),
  -- Memorandum-only counters (excluded from customer liability until verified settlement)
  pending_deposit_kobo BIGINT NOT NULL DEFAULT 0 CHECK (pending_deposit_kobo >= 0),
  realized_earnings_kobo BIGINT NOT NULL DEFAULT 0 CHECK (realized_earnings_kobo >= 0),
  -- Exact ADR-009 Customer Liability Formula (mutually exclusive sub-ledgers; zero double-counting)
  total_customer_liability_kobo BIGINT GENERATED ALWAYS AS (
    available_kobo + reserved_withdrawal_kobo + invested_principal_kobo
  ) STORED,
  last_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_balances_user ON public.wallet_balances(user_id);

CREATE TRIGGER trg_wallet_balances_updated_at
  BEFORE UPDATE ON public.wallet_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

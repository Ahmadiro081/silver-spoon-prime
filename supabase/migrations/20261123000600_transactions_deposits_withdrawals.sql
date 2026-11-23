-- ============================================================================
-- SILVER SPOON — Phase B Migration 0006
-- Module D: Transactions, Deposits, Scheduled Withdrawal Batches & Withdrawals (Tables 15-20)
-- Tables: transactions, transaction_references, transaction_fees,
--         deposits, withdrawal_batches, withdrawals
-- ============================================================================

-- 15. transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE CHECK (length(trim(reference)) >= 6),
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  transaction_type public.transaction_type_enum NOT NULL,
  status public.transaction_status_enum NOT NULL DEFAULT 'initiated',
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  fee_kobo BIGINT NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0),
  tax_kobo BIGINT NOT NULL DEFAULT 0 CHECK (tax_kobo >= 0),
  net_amount_kobo BIGINT NOT NULL CHECK (net_amount_kobo >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  description TEXT NOT NULL,
  primary_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  reversal_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_created ON public.transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_wallet_status ON public.transactions(wallet_id, status, created_at DESC);
CREATE INDEX idx_transactions_type_status ON public.transactions(transaction_type, status);

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 16. transaction_references (external gateway / banking / custodian correlation references)
CREATE TABLE public.transaction_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  ref_type TEXT NOT NULL CHECK (ref_type IN (
    'paystack_checkout', 'paystack_transfer', 'bank_settlement', 'custodian_settlement', 'treasury_batch', 'internal_correlation'
  )),
  ref_value TEXT NOT NULL CHECK (length(trim(ref_value)) >= 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ref_type, ref_value)
);

CREATE INDEX idx_transaction_references_txn ON public.transaction_references(transaction_id);

-- 17. transaction_fees (itemized non-tax platform or settlement fee lines)
CREATE TABLE public.transaction_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  fee_code TEXT NOT NULL,
  fee_label TEXT NOT NULL,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo >= 0),
  rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (rate_bps >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transaction_fees_txn ON public.transaction_fees(transaction_id);

-- 18. deposits (Paystack Checkout card & bank transfer only; DVAs deferred per ADR-002)
CREATE TABLE public.deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  channel public.deposit_channel_enum NOT NULL,
  expected_amount_kobo BIGINT NOT NULL CHECK (expected_amount_kobo > 0),
  settled_amount_kobo BIGINT CHECK (settled_amount_kobo IS NULL OR settled_amount_kobo > 0),
  paystack_reference TEXT NOT NULL UNIQUE,
  status public.transaction_status_enum NOT NULL DEFAULT 'pending',
  server_verified_at TIMESTAMPTZ,
  server_verification_ref TEXT,
  settlement_journal_entry_id UUID UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  settled_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Settlement strictly requires independent server verification (ADR-007)
  CONSTRAINT chk_deposits_verified_before_settlement CHECK (
    settlement_journal_entry_id IS NULL OR (server_verified_at IS NOT NULL AND settled_amount_kobo IS NOT NULL)
  )
);

CREATE INDEX idx_deposits_user_status ON public.deposits(user_id, status, created_at DESC);

CREATE TRIGGER trg_deposits_updated_at
  BEFORE UPDATE ON public.deposits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 19. withdrawal_batches (scheduled treasury settlement batches — ADR-007)
CREATE TABLE public.withdrawal_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT NOT NULL UNIQUE CHECK (batch_code ~ '^WB-[0-9]{8}-[A-Z0-9]{2,12}$'),
  scheduled_settlement_at TIMESTAMPTZ NOT NULL,
  status public.withdrawal_batch_status_enum NOT NULL DEFAULT 'draft',
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  total_principal_kobo BIGINT NOT NULL DEFAULT 0 CHECK (total_principal_kobo >= 0),
  total_fee_kobo BIGINT NOT NULL DEFAULT 0 CHECK (total_fee_kobo >= 0),
  prepared_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  four_eyes_action_id UUID REFERENCES public.admin_actions(id) ON DELETE RESTRICT,
  treasury_funding_ref TEXT,
  disbursed_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Strict Four-Eyes Batch Approval: preparer cannot approve own batch
  CONSTRAINT chk_withdrawal_batches_four_eyes
    CHECK (approved_by IS NULL OR approved_by <> prepared_by),
  CONSTRAINT chk_withdrawal_batches_approved_requires_action
    CHECK (status NOT IN ('approved', 'disbursing', 'settled', 'partially_settled') OR (approved_by IS NOT NULL AND four_eyes_action_id IS NOT NULL))
);

CREATE INDEX idx_withdrawal_batches_status_sched ON public.withdrawal_batches(status, scheduled_settlement_at);

CREATE TRIGGER trg_withdrawal_batches_updated_at
  BEFORE UPDATE ON public.withdrawal_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 20. withdrawals (universal four-eyes approval + scheduled settlement + reservation tracking)
CREATE TABLE public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  wallet_account_id UUID NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT,
  withdrawal_batch_id UUID REFERENCES public.withdrawal_batches(id) ON DELETE RESTRICT,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  fee_kobo BIGINT NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0),
  total_reserved_kobo BIGINT GENERATED ALWAYS AS (amount_kobo + fee_kobo) STORED,
  payout_idempotency_ref TEXT NOT NULL UNIQUE,
  status public.transaction_status_enum NOT NULL DEFAULT 'pending_approval',
  initiated_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  four_eyes_action_id UUID REFERENCES public.admin_actions(id) ON DELETE RESTRICT,
  reserve_journal_entry_id UUID NOT NULL UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  settlement_journal_entry_id UUID UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  release_journal_entry_id UUID UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  provider_transfer_ref TEXT UNIQUE,
  verified_settlement_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Universal Four-Eyes Constraints (ADR-003): approver cannot be investor or initiator
  CONSTRAINT chk_withdrawals_not_self_approved_owner
    CHECK (approved_by IS NULL OR approved_by <> user_id),
  CONSTRAINT chk_withdrawals_not_self_approved_initiator
    CHECK (approved_by IS NULL OR approved_by <> initiated_by),
  -- Cannot both settle and release a reservation
  CONSTRAINT chk_withdrawals_exclusive_finalization
    CHECK (NOT (settlement_journal_entry_id IS NOT NULL AND release_journal_entry_id IS NOT NULL)),
  -- Final settlement requires prior four-eyes approval AND verified external settlement
  CONSTRAINT chk_withdrawals_verified_settlement
    CHECK (
      settlement_journal_entry_id IS NULL
      OR (approved_by IS NOT NULL AND four_eyes_action_id IS NOT NULL AND verified_settlement_at IS NOT NULL)
    )
);

CREATE INDEX idx_withdrawals_user_status ON public.withdrawals(user_id, status, created_at DESC);
CREATE INDEX idx_withdrawals_batch ON public.withdrawals(withdrawal_batch_id) WHERE withdrawal_batch_id IS NOT NULL;

CREATE TRIGGER trg_withdrawals_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

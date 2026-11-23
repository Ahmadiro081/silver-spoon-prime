-- ============================================================================
-- SILVER SPOON — Staging Multi-Session Concurrency Verification Guide (SQL)
--
-- Purpose: Supplement the embedded PGlite test suite (scripts/db/run-phase-b-tests.mjs)
-- with true multi-connection row-lock contention verification once a dedicated,
-- isolated non-production Supabase staging PostgreSQL instance is provisioned.
--
-- Run Session A and Session B concurrently in two psql terminals connected to
-- the dedicated non-production staging database ONLY (never production).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TEST 1: Concurrent Withdrawal Row-Lock Contention (SELECT ... FOR UPDATE)
-- Precondition: Synthetic Investor 1 has exactly 30,000,000 kobo available.
-- Expected Outcome:
--   - Session A acquires FOR UPDATE on wallet_balances and reserves 20,000,000 kobo.
--   - Session B blocks on FOR UPDATE until Session A commits, then re-evaluates
--     available_kobo (now 10,000,000 < 20,000,000) and FAILS with
--     INSUFFICIENT_AVAILABLE_BALANCE.
-- ----------------------------------------------------------------------------

-- [SESSION A]
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
-- SELECT set_config('request.jwt.claim.role', 'authenticated', true);
-- SELECT public.request_withdrawal(20000000, '<verified_wallet_account_uuid>', 'ms-conc-wd-a');
-- -- Hold transaction open for 5 seconds while running Session B, then:
-- COMMIT;

-- [SESSION B — execute while Session A is uncommitted]
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
-- SELECT set_config('request.jwt.claim.role', 'authenticated', true);
-- SELECT public.request_withdrawal(20000000, '<verified_wallet_account_uuid>', 'ms-conc-wd-b');
-- -- Must block until Session A commits, then fail with INSUFFICIENT_AVAILABLE_BALANCE.
-- ROLLBACK;

-- ----------------------------------------------------------------------------
-- TEST 2: Concurrent Duplicate Deposit Settlement (Idempotency + FOR UPDATE)
-- Expected Outcome:
--   - Session A locks deposits row FOR UPDATE and settles once.
--   - Session B blocks until Session A commits, sees settlement_journal_entry_id IS NOT NULL,
--     and returns the exact same journal_entry_id without double-crediting.
-- ----------------------------------------------------------------------------

-- [SESSION A & SESSION B simultaneously as service_role]
-- SELECT public.settle_verified_deposit('PSK-STG-CONC-1', 10000000, 'VERIFY-CONC-1', 'dep-conc-settle-1');

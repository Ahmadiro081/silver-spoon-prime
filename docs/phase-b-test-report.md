# SILVER SPOON — Phase B Automated Database Test Report

**Test Runner**: `npm run test:db` (`scripts/db/run-phase-b-tests.mjs`)  
**Execution Engine**: Real embedded PostgreSQL (`@electric-sql/pglite`) initialized with `supabase/tests/harness_supabase_shim.sql`, all 12 Phase B migrations (`supabase/migrations/*.sql`), and synthetic test fixtures (`supabase/seed/staging_synthetic_seed.sql`).  
**Remote Staging Status**: Not yet executed against a remote Supabase staging host (no dedicated staging project credentials present in workspace). Supplementary multi-session concurrency script prepared at `supabase/tests/staging_multisession_concurrency.sql`.

---

## 1. Execution Summary

- **Total Automated Tests Executed**: **20**
- **Passed**: **20**
- **Failed**: **0**
- **Schema Assertions**: **40/40** tables created with `ENABLE` + `FORCE ROW LEVEL SECURITY`; **42/42** `SECURITY DEFINER` functions pin `search_path = public, pg_temp`; **62** table-specific RLS policies active.

---

## 2. Detailed Test Results by Suite

### Suite A: Financial Integrity (6 / 6 Passed)

| # | Test Case | Status | Verified Result |
| :-: | :--- | :---: | :--- |
| A1 | Balanced journal transaction updates `wallet_balances` & generated `total_customer_liability_kobo` accurately | **PASS** | `available_kobo = 50,000,000`, `reserved_withdrawal_kobo = 0`, `invested_principal_kobo = 0`, `total_customer_liability_kobo = 50,000,000` |
| A2 | Commit-time deferred constraint trigger rejects unbalanced journal postings | **PASS** | Transaction aborted at `COMMIT` with `UNBALANCED_JOURNAL_ENTRY` |
| A3 | Duplicate idempotency deposit settlement returns original entry without double-crediting | **PASS** | Replayed `idempotency_key` returned exact `journal_entry_id` with zero balance inflation |
| A4 | Posted journal entries & lines are strictly immutable (`UPDATE` & `DELETE` blocked) | **PASS** | Both `UPDATE journal_entries` and `DELETE journal_lines` raised `IMMUTABLE_RECORD` |
| A5 | Four-eyes reversal posts mirrored entry, blocks self-approval, and blocks double-reversal | **PASS** | FinA self-approval raised `FOUR_EYES_VIOLATION`; FinB approval posted mirrored reversal restoring balance to `50,000,000`; second reversal request raised `ALREADY_REVERSED` |
| A6 | Cached-vs-journal reconciliation passes cleanly and flags drift on simulated tamper | **PASS** | `reconcile_wallet_balance` returned `is_reconciled = true`; simulated out-of-band `+100` kobo tamper returned `is_reconciled = false` and inserted a `critical` `LEDGER_RECONCILIATION_DRIFT` compliance event |

### Suite B: Database Security, RLS, Grants & Anti-Escalation (6 / 6 Passed)

| # | Test Case | Status | Verified Result |
| :-: | :--- | :---: | :--- |
| B1 | Investor account isolation (Investor 1 vs Investor 2 + ledger tables) | **PASS** | 0 rows returned when Investor 1 queried Investor 2's `profiles`, `wallet_balances`, or `journal_entries` |
| B2 | Direct browser-side financial DML (`INSERT`/`UPDATE`/`DELETE`) blocked by least-privilege grants | **PASS** | `UPDATE wallet_balances` and `INSERT user_roles` as `authenticated` failed with `permission denied` |
| B3 | Unauthorized administrative access & role escalation attempts rejected inside `SECURITY DEFINER` RPCs | **PASS** | Investor escalation rejected (`UNAUTHORIZED_ROLE_ESCALATION`); SuperAdmin A self-escalation rejected (`SELF_ESCALATION_BLOCKED`); SuperAdmin A self-approval rejected (`FOUR_EYES_VIOLATION`); independent SuperAdmin B approval succeeded |
| B4 | Unauthorized RPC execution blocked for `anon` and `authenticated` on privileged/service-only functions | **PASS** | `authenticated` call to `settle_verified_deposit` and `anon` call to `request_withdrawal` rejected with `permission denied` |
| B5 | Unauthorized KYC metadata access blocked | **PASS** | Investor 2 and Finance Officer saw 0 rows of Investor 1's `kyc_records`; Compliance Officer saw 1 row; Finance Officer attempt to call `review_kyc_record` rejected (`UNAUTHORIZED_ROLE`) |
| B6 | All `SECURITY DEFINER` functions in `public` schema pin `search_path = public, pg_temp` | **PASS** | **42/42** `SECURITY DEFINER` functions verified via `pg_proc.proconfig` |

### Suite C: Concurrency & Race Guardrails (4 / 4 Passed)

*Execution Scope Note*: Embedded PGlite runs a single PostgreSQL backend process, so Suite C executes deterministic row-locking, atomic reservation, idempotency, and overspend checks sequentially inside real PostgreSQL transactions. True multi-connection blocking (`Session A` holding `FOR UPDATE` while `Session B` waits) must additionally be executed on the dedicated remote staging PostgreSQL instance using `supabase/tests/staging_multisession_concurrency.sql`.

| # | Test Case | Status | Verified Result |
| :-: | :--- | :---: | :--- |
| C1 | Overlapping withdrawal requests exceeding available balance reject overspend atomically | **PASS** | First `30,000,000` kobo reservation succeeded (`available=20,000,000`, `reserved=30,000,000`, `total_liability=50,000,000`); second `25,000,000` request rejected (`INSUFFICIENT_AVAILABLE_BALANCE`) |
| C2 | Duplicate settlement requests are idempotent and never double-debit reserved balance | **PASS** | Four-eyes batch self-approval blocked (`FOUR_EYES_VIOLATION`); independent batch approval + repeated `settle_withdrawal` returned identical entry ID and cleared `reserved_withdrawal_kobo` to `0` once |
| C3 | Failed payout releases reserved funds atomically and idempotently back to available balance | **PASS** | Repeated `fail_or_decline_withdrawal` returned identical release entry ID and restored `available_kobo = 20,000,000`, `reserved_withdrawal_kobo = 0` |
| C4 | Competing balance reservation (withdrawal vs investment subscription) prevents double-spend | **PASS** | After reserving `16,000,000` of `20,000,000` available, a competing `5,000,000` `create_investment` call was rejected (`INSUFFICIENT_AVAILABLE_BALANCE`) |

### Suite D: Business Rules (4 / 4 Passed)

| # | Test Case | Status | Verified Result |
| :-: | :--- | :---: | :--- |
| D1 | Universal four-eyes gates (withdrawal settlement, bank-detail change, manual ledger adjustment, platform settings) | **PASS** | Unapproved withdrawal settlement rejected (`FOUR_EYES_APPROVAL_REQUIRED`); self-approval rejected across bank change, manual ledger adjustment, and `platform_settings`; independent second approver succeeded |
| D2 | Default rollover is `principal_only`; return compounding requires BOTH plan eligibility AND explicit consent | **PASS** | Compounding rejected on non-eligible plan (`COMPOUNDING_NOT_PERMITTED`) and on eligible plan without consent (`EXPLICIT_CONSENT_REQUIRED`); default subscription stored `rollover_mode = 'principal_only'` |
| D3 | Configurable `tax_rules` resolve effective dates & exemptions dynamically + `tax_applications` immutability | **PASS** | Payout as of `2026-03-15` applied `1000 bps` (`100,000` tax); payout as of `2026-09-15` applied `750 bps` (`75,000` tax); FGN T-Bill resolved `0 bps` (`is_exempt = true`); financial tamper and second remittance overwrite rejected (`IMMUTABLE_RECORD`); self-approval of realized payout rejected (`FOUR_EYES_VIOLATION`) |
| D4 | Rollover into `paused` and `archived` plans strictly blocked; active consented compounding succeeds + final recon = 0 | **PASS** | Maturing positions under both `paused` and `archived` plans produced `settled_to_available_plan_unavailable`, `child_investment_id = NULL`, and investor notification; active consented CP position rolled `11,825,000` kobo; final `reconcile_wallet_balance` returned `is_reconciled = true` |

---

## 3. Failures Encountered During Initial Runs & Resolutions

| Run | Failure Observed | Root Cause | Resolution | Verification |
| :-: | :--- | :--- | :--- | :---: |
| Run 1 | Migration 0001 failed: `extension "pgcrypto" is not available` | Minimal embedded PostgreSQL lacks optional contrib `pgcrypto`; PG 15+ provides core `gen_random_uuid()`. | Conditionally enabled `pgcrypto` only when present in `pg_available_extensions`. | **Passed** |
| Run 2 | Seed deposit commit failed: `record "new" has no field "journal_entry_id"` | Shared deferred trigger `assert_journal_entry_balanced()` used a static `CASE` referencing `NEW.journal_entry_id` when fired on `journal_entries`. | Replaced with `COALESCE(NULLIF(to_jsonb(NEW) ->> 'journal_entry_id', '')::UUID, (to_jsonb(NEW) ->> 'id')::UUID)`. | **Passed** |
| Run 3 | Expanded suite (20 tests) | — | Zero failures; 20/20 passed. | **Passed** |

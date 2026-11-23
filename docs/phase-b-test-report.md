# SILVER SPOON — Phase B / B.5 Automated Database Test Report

**Local Automated Runner**: `npm run test:db` (`scripts/db/run-phase-b-tests.mjs`)  
**Local Execution Engine**: Embedded PostgreSQL (`@electric-sql/pglite`) running `supabase/tests/harness_supabase_shim.sql`, all 13 migrations (`supabase/migrations/20261123000100`–`20261123001300`), and `supabase/seed/staging_synthetic_seed.sql`.

---

## 1. Execution Scope Distinction (Local vs. Remote Staging)

| Test Category | Execution Status | Result | Evidence / Next Action |
| :--- | :---: | :---: | :--- |
| **1. Local PGlite Verification (Suites A–E)** | **EXECUTED** | **24 / 24 PASSED (0 Failed)** | Executed via `npm run test:db` across all 13 migrations |
| **2. Remote Supabase Staging Deployment** | **NOT EXECUTED** | Pending staging provisioning | Requires dedicated staging project ref + `supabase db push` |
| **3. Remote PostgreSQL Security Tests** | **NOT EXECUTED** | Pending remote deployment | Run security verification SQL in `docs/phase-b-deployment-guide.md` Section 5.2 |
| **4. Remote Multi-Session Concurrency Tests** | **NOT EXECUTED** | Pending remote deployment | Run all 6 two-session scenarios in `supabase/tests/staging_multisession_concurrency.sql` |

---

## 2. Executed Local PGlite Results (24 / 24 Passed)

### Suite A: Financial Integrity (6 / 6 Passed)

| # | Test Case | Status | Verified Result |
| :-: | :--- | :---: | :--- |
| A1 | Balanced journal transaction updates `wallet_balances` & generated `total_customer_liability_kobo` | **PASS** | `available_kobo = 50,000,000`, `reserved = 0`, `invested = 0`, `total_customer_liability_kobo = 50,000,000` |
| A2 | Commit-time deferred constraint trigger rejects unbalanced journal postings | **PASS** | Aborted at `COMMIT` with `UNBALANCED_JOURNAL_ENTRY` |
| A3 | Duplicate idempotency deposit settlement returns original entry without double-crediting | **PASS** | Exact `journal_entry_id` returned; balance unchanged at `50,000,000` |
| A4 | Posted journal entries & lines are strictly immutable (`UPDATE` & `DELETE` blocked) | **PASS** | Raised `IMMUTABLE_RECORD` on both `UPDATE` and `DELETE` |
| A5 | Four-eyes reversal posts mirrored entry, blocks self-approval, blocks double-reversal | **PASS** | FinA self-approval rejected (`FOUR_EYES_VIOLATION`); FinB reversed cleanly; repeat request rejected (`ALREADY_REVERSED`) |
| A6 | Cached-vs-journal reconciliation passes cleanly and flags drift on simulated tamper | **PASS** | Clean match (`is_reconciled = true`); simulated `+100` kobo tamper returned `is_reconciled = false` and raised a `critical` `LEDGER_RECONCILIATION_DRIFT` compliance event |

### Suite B: Database Security, RLS, Grants & Anti-Escalation (6 / 6 Passed)

| # | Test Case | Status | Verified Result |
| :-: | :--- | :---: | :--- |
| B1 | Investor account isolation (Investor 1 vs Investor 2 + ledger tables) | **PASS** | 0 cross-account `profiles`, `wallet_balances`, or `journal_entries` rows visible |
| B2 | Direct browser-side financial DML (`INSERT`/`UPDATE`/`DELETE`) blocked by `REVOKE ALL` | **PASS** | `UPDATE wallet_balances` and `INSERT user_roles` rejected (`permission denied`) |
| B3 | Unauthorized administrative access & role escalation rejected inside `SECURITY DEFINER` RPCs | **PASS** | Investor escalation (`UNAUTHORIZED_ROLE_ESCALATION`), self-escalation (`SELF_ESCALATION_BLOCKED`), and self-approval (`FOUR_EYES_VIOLATION`) all blocked; independent dual `super_admin` grant succeeded |
| B4 | Unauthorized RPC execution blocked for `anon` & `authenticated` on service-only functions | **PASS** | `settle_verified_deposit` as `authenticated` and `request_withdrawal` as `anon` rejected (`permission denied`) |
| B5 | Unauthorized KYC metadata access blocked | **PASS** | Investor 2 and Finance Officer saw 0 rows; Compliance Officer saw 1 row; Finance Officer review rejected (`UNAUTHORIZED_ROLE`) |
| B6 | All `SECURITY DEFINER` functions pin `search_path = public, pg_temp` | **PASS** | **43 / 43** `SECURITY DEFINER` functions verified via `pg_proc.proconfig` |

### Suite C: Concurrency & Race Guardrails — Local Serialized Verification (4 / 4 Passed)

*Note*: Embedded PGlite runs a single PostgreSQL backend process; true two-session lock blocking (`Session A` holding `FOR UPDATE` while `Session B` waits) must be executed remotely on Supabase staging via `supabase/tests/staging_multisession_concurrency.sql`.

| # | Test Case | Status | Verified Result |
| :-: | :--- | :---: | :--- |
| C1 | Overlapping withdrawals exceeding available balance reject overspend atomically | **PASS** | First `30,000,000` reserved (`total_liability` invariant at `50,000,000`); second `25,000,000` rejected (`INSUFFICIENT_AVAILABLE_BALANCE`) |
| C2 | Duplicate settlement requests are idempotent and never double-debit reserved balance | **PASS** | Batch self-approval rejected; duplicate `settle_withdrawal` returned identical entry ID; reserved cleared to `0` once |
| C3 | Failed payout releases reserved funds atomically & idempotently back to available balance | **PASS** | Duplicate release returned identical entry ID; `available_kobo` restored to `20,000,000` |
| C4 | Competing balance reservation (withdrawal vs investment subscription) prevents double-spend | **PASS** | `16,000,000` reserved blocked competing `5,000,000` investment (`INSUFFICIENT_AVAILABLE_BALANCE`) |

### Suite D: Business Rules (4 / 4 Passed)

| # | Test Case | Status | Verified Result |
| :-: | :--- | :---: | :--- |
| D1 | Universal four-eyes gates (withdrawal settlement, bank-detail change, manual adjustment, platform settings) | **PASS** | Unapproved settlement blocked (`FOUR_EYES_APPROVAL_REQUIRED`); self-approval blocked across bank change, manual ledger adjustment, and `platform_settings` |
| D2 | Default rollover is `principal_only`; return compounding requires plan eligibility AND explicit consent | **PASS** | Non-eligible plan (`COMPOUNDING_NOT_PERMITTED`) and missing consent (`EXPLICIT_CONSENT_REQUIRED`) rejected; default stored `principal_only` |
| D3 | Configurable `tax_rules` resolve effective dates & exemptions dynamically + `tax_applications` immutable | **PASS** | `2026-03` resolved `10.00%`; `2026-09` resolved `7.50%`; FGN T-Bill resolved `0%` exempt; tamper & double-remittance blocked (`IMMUTABLE_RECORD`) |
| D4 | Rollover into `paused` and `archived` plans strictly blocked; active consented compounding succeeds | **PASS** | Both `paused` and `archived` settled to `available_kobo` (`child_investment_id = NULL`, disposition `settled_to_available_plan_unavailable`); active consented plan rolled `11,825,000` kobo |

### Suite E: Phase B.5 Security Review & Public Plan Visibility Hardening (4 / 4 Passed)

| # | Test Case | Status | Verified Result |
| :-: | :--- | :---: | :--- |
| E1 | `SECURITY DEFINER` caller checks block investors from `reconcile_wallet_balance` & `fail_or_decline_withdrawal`; `'failed'` restricted to `service_role`; competing admin approvals rejected | **PASS** | Investor calls rejected (`UNAUTHORIZED_RECONCILIATION` / `UNAUTHORIZED`); Finance Officer `'failed'` call rejected (`VERIFIED_FAILURE_SERVICE_REQUIRED`); competing FinB approval rejected (`INVALID_WITHDRAWAL_STATE`) |
| E2 | Anti-role-enumeration, internal helper restriction & `public` schema `CREATE` revocation | **PASS** | `app_has_role(supA, 'super_admin')` as Investor 1 returned `false`; `internal_is_service_caller()` denied (`permission denied`); `anon` & `authenticated` have `CREATE = false` on `public` |
| E3 | Public anonymous users see ONLY `status = 'active'` investment plans | **PASS** | `anon` saw `1/1` active plan (0 paused, 0 archived); Investor 2 (no holdings) saw `1/1` active plan; Investor 1 (existing holdings) retained read visibility of own historical plan metadata |
| E4 | Final end-to-end wallet reconciliation & full `SECURITY DEFINER` `search_path` audit post-Migration 0013 | **PASS** | `43/43` `SECURITY DEFINER` functions pinned; `reconcile_wallet_balance` returned `is_reconciled = true` (0 kobo drift) |

---

## 3. Remote Multi-Session Concurrency Tests (Prepared — Pending Dedicated Staging Host)

Once a dedicated non-production Supabase staging project is provisioned and migrated, all 6 scenarios in `supabase/tests/staging_multisession_concurrency.sql` must be executed across two concurrent `psql` sessions and recorded here:

1. Concurrent withdrawals (`Session A` vs `Session B` competing on `FOR UPDATE`) — **Pending remote staging**
2. Duplicate deposit settlement (concurrent webhook + verify race) — **Pending remote staging**
3. Concurrent wallet reservations (two valid reservations fitting available balance) — **Pending remote staging**
4. Withdrawal vs. investment subscription race — **Pending remote staging**
5. Duplicate payout settlement race — **Pending remote staging**
6. Competing administrative approvals (`Finance Officer A` vs `Finance Officer B` racing on `approve_withdrawal_four_eyes`) — **Pending remote staging**

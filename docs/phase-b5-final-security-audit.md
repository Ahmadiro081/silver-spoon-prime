# SILVER SPOON — Phase B.5 Final Pre-Staging Security Audit

**Audit Scope**: All 13 prior Phase B / B.5 SQL migrations (`20261123000100` through `20261123001300`), all 47 pre-audit PostgreSQL functions (43 `SECURITY DEFINER` + 4 trigger functions), RLS & grant posture across all 40 tables, `service_role` containment across frontend/env/config files, and all core financial state-transition RPCs.  
**Remediation Vehicle**: Forward-only Migration `20261123001400_phase_b5_final_security_audit_hardening.sql` (Migrations `0001`–`0013` preserved 100% unmodified; post-audit total = **14 migrations**, **48 functions**, **44 `SECURITY DEFINER` functions**).  
**Execution Scope & Honesty Boundary**: All automated verification and adversarial tests ran locally against embedded PostgreSQL (`@electric-sql/pglite`). **Hosted Supabase deployment, remote PostgREST JWT testing, and remote two-session `psql` concurrency tests have NOT yet been executed.**  
**Active Frontend Provider**: `VITE_DATA_PROVIDER=mock` (unchanged; zero staging DB connections; Phase C not started).

---

## 1. Findings

### Priority 1: `public.internal_is_service_caller()` — Deep Inspection & Exact Trust Assumptions

#### Pre-Audit Implementation Defect (Migration `0013`)
In Migration `0013`, `public.internal_is_service_caller()` evaluated `current_setting('request.jwt.claim.role', true)` **before** inspecting PostgreSQL's kernel-enforced active role (`current_setting('role', true)` / `session_user`):
- Because `request.jwt.claim.*` and `request.jwt.claims` are custom PostgreSQL placeholder GUCs, **any** database role able to call `set_config('request.jwt.claim.role', 'service_role', true)` could satisfy `v_jwt_role = 'service_role'` while still executing as `authenticated`, `anon`, or an unprivileged direct DB role.
- It ignored PostgREST v10+/Supabase's standard JSON GUC `request.jwt.claims` (which modern Supabase PostgREST populates alongside or instead of legacy `request.jwt.claim.role`).
- It did not require `sub IS NULL` for `service_role` calls, leaving a theoretical confusion window if a user-bound JWT ever shared a session context.
- It granted full `internal_is_service_caller() = true` status to `silver_spoon_reconciler`, even though reconcilers should only be permitted to execute `reconcile_wallet_balance(UUID)` and never settlement or failed-payout release paths.

#### Post-Audit Hardened Implementation (Migration `0014`)
`public.internal_is_service_caller()` now enforces a **5-gate conjunctive (AND) check**:
1. **Kernel-Enforced PostgreSQL Role Gate (Unforgeable)**: Resolves `v_effective_role := COALESCE(NULLIF(NULLIF(current_setting('role', true), ''), 'none'), session_user)`. Immediately returns `FALSE` unless `v_effective_role IN ('service_role', 'silver_spoon_treasury_worker', 'postgres', 'supabase_admin')`. Neither `authenticated`, `anon`, `authenticator`, `silver_spoon_reconciler`, nor any unprivileged direct login role can pass Gate 1 or execute `SET ROLE service_role` (enforced by `pg_auth_members`).
2. **Safe PostgREST v10+ JSON + Legacy Claim Parsing (Fail Closed)**: Safely parses `request.jwt.claims` as JSONB inside an exception block; malformed JSON or non-object JSON immediately returns `FALSE`. If both legacy `request.jwt.claim.role` and `request.jwt.claims ->> 'role'` are present and disagree, immediately returns `FALSE`.
3. **Zero User-Subject (`sub`) Requirement**: Extracts `sub` from both `request.jwt.claims ->> 'sub'` and `request.jwt.claim.sub`. If `v_jwt_sub IS NOT NULL`, immediately returns `FALSE` (a user-bound JWT can never impersonate backend service privileges).
4. **Conjunctive `service_role` Verification**: When `v_effective_role = 'service_role'`, **both** `v_effective_role = 'service_role'` **and** `v_jwt_role = 'service_role'` **and** `v_jwt_sub IS NULL` must hold. Bare `SET LOCAL ROLE service_role` without a valid service JWT claim returns `FALSE`.
5. **Dedicated Worker & Owner Guard**: When `v_effective_role IN ('silver_spoon_treasury_worker', 'postgres', 'supabase_admin')`, rejects any conflicting non-service JWT role claim (`v_jwt_role IS NOT NULL AND v_jwt_role <> 'service_role'`).
6. **Reconciler Role Separation**: Added `public.internal_is_reconciler_caller()` exclusively for `reconcile_wallet_balance(UUID)`, keeping `silver_spoon_reconciler` completely excluded from `internal_is_service_caller()` and `internal_assert_service_caller()`.

#### Exact Trust Assumptions Under Real Supabase PostgREST & Direct PostgreSQL
| Context | PostgreSQL `session_user` | Active Role (`current_setting('role')`) | JWT Claims GUCs | `internal_is_service_caller()` Result & Trust Basis |
| :--- | :--- | :--- | :--- | :--- |
| **PostgREST: Investor / Finance Officer / Admin / Super Admin** | `authenticator` | `authenticated` | `{"role":"authenticated","sub":"<uuid>"}` | **`FALSE`** — PostgREST verifies the JWT signature and executes `SET LOCAL ROLE authenticated`. HTTP callers cannot run arbitrary SQL (`SET ROLE`) or bypass PostgREST's transaction wrapper. |
| **PostgREST: Anonymous visitor** | `authenticator` | `anon` | `{"role":"anon"}` or empty | **`FALSE`** — Active role is `anon` and `anon` holds zero `EXECUTE` grants on all 48 `public` functions. |
| **PostgREST: Verified Edge Function (`SUPABASE_SERVICE_ROLE_KEY`)** | `authenticator` | `service_role` | `{"role":"service_role","iss":"supabase",...}` (no `sub`) | **`TRUE`** — PostgREST cryptographically verifies the `service_role` JWT against the project JWT secret/JWKS, executes `SET LOCAL ROLE service_role`, and sets `request.jwt.claims`. Trust assumes `SUPABASE_SERVICE_ROLE_KEY` and the project JWT signing secret remain strictly server-side. |
| **Direct DB Session: Unprivileged / Read-Only / `authenticator` Role** | `<unprivileged_role>` | `none` or `<unprivileged_role>` | Any attacker-supplied `set_config(...)` | **`FALSE`** — Kernel role membership prevents `SET ROLE service_role`; Gate 1 rejects before inspecting any GUC. |
| **Direct DB Session: `silver_spoon_reconciler`** | `silver_spoon_reconciler` | `none` or `silver_spoon_reconciler` | None | **`FALSE`** on `internal_is_service_caller()`, **`TRUE`** ONLY on `internal_is_reconciler_caller()` (used solely in `reconcile_wallet_balance`). |
| **Direct DB Session: `postgres` / `supabase_admin` / `silver_spoon_treasury_worker`** | Superuser / treasury worker | `none` or worker role | None (or `service_role` with no `sub`) | **`TRUE`** — Database owner and dedicated treasury worker credentials are high-trust backend infrastructure principals; direct `postgres` credentials must be restricted to migrations, break-glass DBA operations, and CI/CD secret vaults. |

---

### Priority 2: Audit of All 48 Database Functions (44 `SECURITY DEFINER` + 4 Triggers)

| Security Property | Audit Result (Post-Migration 0014) |
| :--- | :--- |
| **Function Ownership** | **48 / 48** functions owned by the database migration owner (`postgres`); **0** owned by `anon`, `authenticated`, or `service_role`. |
| **`search_path` Pinning** | **48 / 48** functions (including **44 / 44** `SECURITY DEFINER` functions) explicitly pin `SET search_path = public, pg_temp`. |
| **Dynamic SQL (`EXECUTE`)** | **0 / 48** stored functions contain dynamic SQL. (Only Migration `0012`'s one-time `DO $$` RLS loop uses `EXECUTE format('... %I ...')` over a static table array.) |
| **Client-Supplied Caller Identity** | **0** client-callable RPCs trust client-supplied caller identity. Every investor/staff RPC derives caller identity strictly from `auth.uid()`. RBAC helper functions (`app_has_role`, `app_has_any_role`, `app_is_staff`, `app_account_can_transact`) return `false` for any non-service caller querying a UUID distinct from `auth.uid()`. |
| **`anon` `EXECUTE` Grants** | **0 / 48** functions grant `EXECUTE` to `anon` (verified via `pg_proc` + `has_function_privilege`). |
| **Internal Primitive Lockdown** | All 7 low-level primitives (`internal_is_service_caller`, `internal_is_reconciler_caller`, `internal_assert_service_caller`, `internal_get_open_period_id`, `internal_get_system_account_id`, `internal_post_journal_entry`, `internal_write_audit_log`) explicitly revoke `ALL` from `PUBLIC`, `anon`, `authenticated`, `service_role`, `silver_spoon_treasury_worker`, and `silver_spoon_reconciler`. |
| **Settlement RPC Grants** | `settle_verified_deposit`, `settle_withdrawal`, and `internal_provision_investor_wallet` are granted ONLY to `service_role` and `silver_spoon_treasury_worker` — **0** grants to `anon`, `authenticated`, or `silver_spoon_reconciler`. |
| **Reconciler RPC Grants** | `silver_spoon_reconciler` holds `EXECUTE` strictly on `reconcile_wallet_balance(UUID)` and nothing else. |
| **Dependency Supply Chain** | `bun audit` checked 280 packages: **0 vulnerabilities found**. |

---

### Priority 3: `service_role` Containment Verification

- **Frontend Code & Environment Scan**: Verified across `src/`, `.env.example`, `package.json`, and `supabase/config.toml` that **zero** `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, or `VITE_*` service credentials exist anywhere in the codebase. Only defensive warning comments exist in `src/services/supabase/config.ts` and `.env.example`.
- **Staff Account Isolation**: No ordinary staff account (`admin`, `finance_officer`, `compliance_officer`, `super_admin`) receives PostgreSQL `service_role` privileges; all staff operate via standard `authenticated` JWTs governed by `public.user_roles` and forced RLS.
- **Narrowly Scoped Settlement Functions**: `settle_verified_deposit`, `settle_withdrawal`, and `fail_or_decline_withdrawal(..., 'failed', ...)` all require `internal_is_service_caller()` plus database-level invariants (server verification ref, four-eyes approval, approved batch membership, non-empty reason, and idempotency keys).
- **Zero Public Financial RPCs**: `anon` has zero `EXECUTE` grants on any function in `public`, and `authenticated` has zero `EXECUTE` grants on any `internal_*` or settlement function.

---

### Priority 4: Financial Operations Review

| Financial Workflow | Idempotency | Atomicity & Row Locking | Four-Eyes / Authorization | Double-Spend & Integrity Guards |
| :--- | :--- | :--- | :--- | :--- |
| **Deposit Init & Verified Settlement** (`initialize_deposit`, `settle_verified_deposit`) | User-scoped idempotency on init (fixed in M0014); `deposits.settlement_journal_entry_id` + `journal_entries.idempotency_key` on settle | `FOR UPDATE` on `deposits` -> `wallets` -> `wallet_balances` | Init: `investor` + `can_transact`; Settle: `service_role` / treasury worker only + non-empty `server_verification_ref` | Amount mismatch check (`settled = expected`); `status = 'pending'` check; `chk_deposits_verified_before_settlement` |
| **Withdrawal Reservation** (`request_withdrawal`) | User-scoped `transactions.idempotency_key` + non-blank validation (M0014) | Deterministic `wallets` -> `wallet_balances` `FOR UPDATE` | `investor` + `can_transact` + `can_withdraw` (M0014) + KYC Tier 2/3 + verified NUBAN | Rolling 24h Tier 2/3 daily cap (M0014); `available_kobo >= amount + fee`; atomic `AVAIL -> RESV` preserves total customer liability |
| **Withdrawal Approval & Batching** (`approve_withdrawal_four_eyes`, `create_withdrawal_batch`, `approve_withdrawal_batch_four_eyes`) | State-gated (`pending_approval` -> `approved`) under `FOR UPDATE` | `withdrawals` -> `admin_actions` / `withdrawal_batches` `FOR UPDATE` | `finance_officer` / `super_admin`; owner/initiator/preparer blocked; batch member owner check + `expires_at` check (M0014) | Competing admin approval rejected (`INVALID_WITHDRAWAL_STATE`); batch requires verified `treasury_funding_ref` |
| **Withdrawal Failure / Decline** (`fail_or_decline_withdrawal`) | `release_journal_entry_id` idempotent return + non-blank key validation | `withdrawals` -> `wallets` -> `wallet_balances` `FOR UPDATE` | `'failed'` strictly `service_role`/treasury worker; `'declined'` strictly independent `finance_officer`/`super_admin` | **M0014 Critical Fix**: `'declined'` blocked once `status <> 'pending_approval'` or `approved_by IS NOT NULL` or `withdrawal_batch_id IS NOT NULL` (blocks in-flight double-spend) |
| **Payout Settlement** (`settle_withdrawal`) | `settlement_journal_entry_id` idempotent return + `UNIQUE(provider_transfer_ref)` | `withdrawals` -> `withdrawal_batches` -> `wallets` -> `wallet_balances` `FOR UPDATE` | `service_role` / treasury worker only; re-verifies independent `approved_by` + `four_eyes_action_id` + approved batch | `chk_withdrawals_exclusive_finalization` prevents both settling and releasing; zero duplicate payout |
| **Investment Subscription & Rollover** (`create_investment`, `update_investment_rollover_mode`) | User-scoped `transactions.idempotency_key` + non-blank validation | `investment_plans FOR SHARE` (M0014) + `wallets` -> `wallet_balances` `FOR UPDATE` | `investor` + `can_transact` on both subscription and rollover update | Plan active check, bounds check, ADR-005 compounding eligibility + explicit consent version |
| **Realized Distribution & Maturity** (`request_realized_return_distribution`, `approve_and_distribute_investment_payout`, `mature_investment`) | `admin_actions.status = 'executed'` + `investment_maturities.investment_id` `UNIQUE` + replay return (M0014) | `admin_actions` -> `investments` -> `investment_plans` -> `wallets` -> `wallet_balances` `FOR UPDATE` | Independent `finance_officer` / `super_admin`; initiator/owner blocked; `expires_at` enforced | Active/matured investment check; dynamic effective-dated `tax_rules`; paused/archived plans strictly block rollover |
| **Reversal & Manual Adjustment** (`request_transaction_reversal`, `approve_and_post_reversal`, `request_manual_ledger_adjustment`, `approve_and_post_manual_adjustment`) | `UNIQUE(journal_entries.reverses_entry_id)` + `idempotency_key` | `admin_actions` `FOR UPDATE` + deterministic ascending `wallet_id` lock in `internal_post_journal_entry` | Independent `finance_officer` / `super_admin`; **M0014**: subject/owner ledger isolation + `expires_at` enforced | Deferred commit-time balanced trigger (`assert_journal_entry_balanced`); active ledger account check; immutable journal triggers |
| **Reconciliation** (`reconcile_wallet_balance`) | Read + timestamp/alert update | Compares `wallet_balances` against `SUM(journal_lines)` | Scoped to `internal_is_reconciler_caller()` OR `finance_officer`/`super_admin` | Logs `critical` `LEDGER_RECONCILIATION_DRIFT` compliance event on any non-zero delta |

---

## 2. Vulnerabilities Identified

| ID | Severity | Location (Pre-Audit) | Vulnerability Description |
| :--- | :---: | :--- | :--- |
| **AUDIT-01** | **Critical** | `20261123001300` (`internal_is_service_caller`) | Trusted custom session GUC `request.jwt.claim.role = 'service_role'` ahead of PostgreSQL's kernel-enforced active role, allowing GUC-based `service_role` impersonation in any session able to invoke `set_config()`. Also omitted PostgREST v10+ JSON `request.jwt.claims` parsing, `sub IS NULL` enforcement, and `silver_spoon_reconciler` separation. |
| **AUDIT-02** | **High** | `20261123001300` (`fail_or_decline_withdrawal`) | Allowed `finance_officer` / `super_admin` to invoke `p_final_status = 'declined'` on an already-approved or batched withdrawal before external settlement completed, creating an in-flight double-spend window where reserved funds could be released while a bank payout was in progress. |
| **AUDIT-03** | **High** | `20261123001000` (`initialize_deposit`) | Idempotency lookup queried `public.transactions` by `idempotency_key` without scoping to `user_id = auth.uid()`, leaking another investor's `transaction_id` UUID on idempotency key collision. |
| **AUDIT-04** | **High** | `20261123001000` (`request_withdrawal`) | Did not check `account_statuses.can_withdraw`, did not enforce rolling 24-hour Tier 2/Tier 3 daily withdrawal limits from `platform_settings`, and allowed blank `p_idempotency_key` values to pass `internal_post_journal_entry` after `'resv:'` prefixing. |
| **AUDIT-05** | **High** | `20261123001000` (`request_transaction_reversal`, `approve_and_post_reversal`, `request_manual_ledger_adjustment`, `approve_and_post_manual_adjustment`, `create_withdrawal_batch`, `approve_withdrawal_batch_four_eyes`) | Missing four-eyes subject/owner isolation: reversals did not populate `subject_user_id`; manual adjustments did not check `ledger_accounts.owner_user_id` against initiator/approver; withdrawal batch preparer/approver checks did not prevent including/approving a batch containing the caller's own withdrawal. |
| **AUDIT-06** | **Medium** | `20261123001000`, `20261123001100` (9 approval RPCs + `internal_post_journal_entry`, `create_investment`, `update_investment_rollover_mode`, `review_kyc_record`, `update_own_profile`) | Missing `admin_actions.expires_at < now()` enforcement on all 9 approval RPCs; `internal_post_journal_entry` did not check `ledger_accounts.is_active`; `create_investment` lacked `FOR SHARE` plan lock; `review_kyc_record` allowed re-reviewing finalized KYC records; `update_own_profile` / `update_investment_rollover_mode` lacked `can_login` / `can_transact` guards; low-level `internal_*` primitives did not have explicit `REVOKE ALL` from `service_role`. |

---

## 3. Corrections Made (Forward-Only Migration `0014`)

Created `supabase/migrations/20261123001400_phase_b5_final_security_audit_hardening.sql` without modifying Migrations `0001`–`0013`:
1. Rewrote `public.internal_is_service_caller()` with 5-gate conjunctive role + PostgREST v10+ JSON/legacy JWT + `sub IS NULL` verification, and added dedicated `public.internal_is_reconciler_caller()` scoped strictly to `reconcile_wallet_balance(UUID)`.
2. Explicitly executed `REVOKE ALL` on all 7 `internal_*` primitive functions from `PUBLIC`, `anon`, `authenticated`, `service_role`, `silver_spoon_treasury_worker`, and `silver_spoon_reconciler`.
3. Restricted `fail_or_decline_withdrawal(..., 'declined', ...)` strictly to `status = 'pending_approval' AND approved_by IS NULL AND withdrawal_batch_id IS NULL`.
4. Scoped `initialize_deposit()` idempotency lookup to `user_id = v_user_id AND transaction_type = 'deposit'` and added upfront key/reference length validation.
5. Added `account_statuses.can_withdraw`, rolling 24-hour KYC Tier 2/Tier 3 daily caps, and upfront `p_idempotency_key` validation to `request_withdrawal()`.
6. Enforced subject/owner four-eyes isolation across reversals, manual ledger adjustments, and withdrawal batch preparation/approval.
7. Added `admin_actions.expires_at < now()` checks across all 9 four-eyes approval RPCs, active ledger account verification in `internal_post_journal_entry()`, `FOR SHARE` plan locking in `create_investment()`, `can_transact` / `can_login` checks in `update_investment_rollover_mode()` and `update_own_profile()`, `submitted`/`under_review` state guard in `review_kyc_record()`, and idempotent replay handling in `mature_investment()`.

---

## 4. Adversarial Test Results (Local Embedded PostgreSQL Only)

> **Scope Notice**: Executed locally via `npm run test:db` (`@electric-sql/pglite`) across all **14 migrations**. **Hosted Supabase validation has NOT been executed.**

| Command | Result | Exact Summary |
| :--- | :---: | :--- |
| `npm run test:db` | **PASS** | **28 / 28 PASSED, 0 FAILED** across Suites A–F (14 migrations; 40 tables with 40/40 `ENABLE` + `FORCE RLS`; 149 indexes; 691 constraints; 24 triggers; 48 functions / 44 `SECURITY DEFINER` all pinned to `search_path = public, pg_temp`; 63 RLS policies) |
| `npm run typecheck` | **PASS** | `tsc --noEmit` exited with 0 errors |
| `npm run lint` | **PASS** | `eslint .` exited with 0 errors / 0 warnings |
| `npm run build` | **PASS** | Production Vite bundle compiled cleanly (`VITE_DATA_PROVIDER=mock` intact) |

### Suite F — Adversarial Security Tests Added & Verified
1. **GUC `service_role` Impersonation Blocked Across All 4 Authenticated Roles**: Tested `investor`, `finance_officer`, `admin`, and `super_admin` injecting BOTH `request.jwt.claim.role = 'service_role'` and `request.jwt.claims = '{"role":"service_role"}'` while running as `authenticated` — **all blocked** on `reconcile_wallet_balance`, `fail_or_decline_withdrawal('failed')`, and cross-user `app_has_role` enumeration.
2. **Direct Unprivileged Sessions, Bare/Sub-Bound/Malformed `service_role`, PostgREST v10+ JSON & Reconciler Isolation**:
   - Direct unprivileged role (`adv_direct_user`) and simulated `authenticator_sim` injecting service JWT GUCs — **blocked** (`permission denied`).
   - `service_role` carrying a user `sub` claim — **blocked** (`UNAUTHORIZED_SERVICE_CALL`).
   - Bare `SET LOCAL ROLE service_role` with no JWT role claim — **blocked** (`UNAUTHORIZED_SERVICE_CALL`).
   - Malformed JSON in `request.jwt.claims` — **blocked** (fail-closed `UNAUTHORIZED_SERVICE_CALL`).
   - Legitimate Supabase PostgREST v10+ JSON `request.jwt.claims = '{"role":"service_role","iss":"supabase"}'` with empty legacy claim — **succeeded**.
   - `silver_spoon_reconciler` succeeded on `reconcile_wallet_balance` and was **blocked** (`permission denied`) on `settle_verified_deposit`.
3. **Zero `anon` RPC Grants & `service_role` Internal Primitive Lockdown**:
   - Verified `0` `EXECUTE` grants for `anon` across all 48 `public` functions.
   - Verified `0` `EXECUTE` grants for `authenticated` on all `internal_*` + settlement RPCs.
   - Verified `0` `EXECUTE` grants for `service_role` on all 7 low-level `internal_*` primitives (`internal_post_journal_entry` call as `service_role` rejected with `permission denied`).
4. **Financial Guardrail Adversarial Tests**:
   - Declining an already-approved withdrawal (`FinB` after `FinA` approval) — **blocked** (`INVALID_DECLINE_STATE`).
   - Cross-user deposit idempotency key collision (`Investor 2` reusing `Investor 1`'s key) — **blocked** without leaking UUID.
   - Approving an expired `admin_action` — **blocked** (`ACTION_EXPIRED`).
   - Blank idempotency key (`'   '`) in `request_withdrawal` — **blocked** (`INVALID_IDEMPOTENCY_KEY`).
   - Withdrawal exceeding Tier 2 24h daily cap (`500,000,001` kobo) — **blocked** (`DAILY_WITHDRAWAL_LIMIT_EXCEEDED`).
   - Final wallet reconciliation after all 28 tests — **`is_reconciled = true`, 0 kobo drift**.

---

## 5. Remaining Risks

1. **Hosted Supabase `service_role` `BYPASSRLS` Operational Blast Radius**: On hosted Supabase, `service_role` carries `rolbypassrls = true` and has `GRANT ALL ON ALL TABLES` for Edge Functions. While Migration `0014` blocks `service_role` from calling low-level `internal_*` primitives directly via RPC, any leaked `SUPABASE_SERVICE_ROLE_KEY` could still query/modify tables directly. Mitigation: keep `SUPABASE_SERVICE_ROLE_KEY` exclusively inside server-side Edge Function secrets, rotate immediately on suspected exposure, and consider a least-privilege dedicated `silver_spoon_treasury_worker` login connection for treasury settlement workers in later phases.
2. **Database Owner (`postgres` / `supabase_admin`) Credential Custody**: Direct superuser sessions satisfy Gate 5 of `internal_is_service_caller()` (required for migrations and seeding). Superuser credentials must never be used by application servers or human dashboards.
3. **Untested Real Hosted PostgREST & Multi-Session Locking**: Embedded PGlite runs single-connection in-memory PostgreSQL and mocks `auth.uid()` via a local shim. Real Supabase GoTrue JWT issuance, PostgREST `SET LOCAL ROLE` + `request.jwt.claims` behavior, `auth.users` schema columns, and true multi-session `FOR UPDATE` blocking across concurrent TCP connections remain unverified until deployed to a dedicated non-production staging project.
4. **`approve_and_distribute_investment_payout()` `p_as_of` Parameter**: Currently accepts an optional `p_as_of` timestamp (required for back-dated corporate-action settlement windows and tax effective-date testing) and records `tax_as_of` in `audit_logs`. Before production, enforce an operational tolerance window or restrict non-current `p_as_of` overrides to `super_admin` with compliance sign-off.
5. **No Automated Expiry Sweep Job Yet**: `approve_*` RPCs now reject expired `admin_actions` at approval time (`ACTION_EXPIRED`), but a scheduled backend sweeper (Phase C+) is still needed to transition stale rows to `status = 'expired'` and release associated pending withdrawal reservations if an investor cancels/times out.

---

## 6. Remote Staging Deployment Prerequisites

Before running `supabase db push` on a dedicated non-production Supabase staging project:

1. **Dedicated Non-Production Project Provisioned**: Confirm a brand-new, isolated Supabase staging project (`PostgreSQL 15+`) with **zero real customer accounts**, zero production data, and `STAGING_PROJECT_REF` explicitly verified as non-production.
2. **All 14 Migrations Verified in Order**: Confirm Migrations `20261123000100` through `20261123001400` apply cleanly with `supabase db push --dry-run` before executing `supabase db push`.
3. **Post-Push Remote Catalog & Security Verification**: Run all SQL assertions in `docs/phase-b-deployment-guide.md` Section 5 (confirming 40/40 forced RLS tables, 44/44 pinned `SECURITY DEFINER` functions, 0 `anon` function grants, 0 `anon`/`authenticated` `CREATE` schema grants, `payment_providers.is_enabled = false`, and `rls_investment_plans_select_anon` active-only filter).
4. **Live Hosted PostgREST JWT Impersonation Smoke Test**: Using real staging GoTrue JWTs (synthetic `.invalid` investor, finance officer, admin, and super admin accounts) over HTTPS `/rest/v1/rpc/*`, verify:
   - Authenticated investor/staff JWTs cannot execute `settle_verified_deposit`, `settle_withdrawal`, `internal_post_journal_entry`, or `fail_or_decline_withdrawal(..., 'failed', ...)`.
   - `service_role` JWT succeeds on `settle_verified_deposit` and `reconcile_wallet_balance`, and fails (`permission denied`) on `internal_post_journal_entry`.
5. **Remote Two-Session `psql` Concurrency Execution**: Execute all 6 scenarios in `supabase/tests/staging_multisession_concurrency.sql` across two concurrent `psql` connections against staging and confirm `reconcile_wallet_balance` returns `is_reconciled = true` with zero drift.
6. **Frontend Mock Boundary Maintained**: Keep `VITE_DATA_PROVIDER=mock` in `.env` / `.env.example`; do NOT connect the frontend to staging, enable live Paystack, collect real BVN/NIN, or begin Phase C until remote staging results are reviewed and approved.

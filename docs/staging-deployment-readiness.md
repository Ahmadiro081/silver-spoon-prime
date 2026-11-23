# SILVER SPOON — Controlled Supabase Staging Deployment Readiness

**Status**: **READY FOR CONTROLLED STAGING PROVISIONING — REMOTE DEPLOYMENT NOT YET EXECUTED**  
**Local Baseline**: 14 frozen SQL migrations (`0001`–`0014`), `28 / 28` local embedded PostgreSQL (`@electric-sql/pglite`) verification tests passing (`npm run test:db`).  
**Remote Execution Honesty Statement**: **Zero** remote Supabase projects have been linked, **zero** migrations have been executed against any remote database, and **zero** hosted PostgREST or multi-session concurrency checks have been run.  
**Active Frontend Provider**: `VITE_DATA_PROVIDER=mock` (unchanged; Phase C not started; zero service-role keys or database credentials in frontend code or `VITE_*` variables).

---

## 1. Chronological Review of All 14 Migrations & Deployment Guide Verification (Task A)

All 14 SQL migrations in `supabase/migrations/` were reviewed in strict chronological execution order. Migrations `0001`–`0014` are frozen and unmodified.

### 1.1 Chronological Dependency & Execution Matrix

| # | Migration File | Strict Upstream Dependencies | Schema / Security Objects Created or Hardened | Re-run / Rollback Profile |
| :---: | :--- | :--- | :--- | :--- |
| **01** | `20261123000100_extensions_and_enums.sql` | PostgreSQL 15+ (`pg_catalog.gen_random_uuid()`) | Conditional `pgcrypto` install, `public.set_updated_at()`, 20 domain `ENUM` types | Idempotent (`IF NOT EXISTS` / `duplicate_object` guard); forward-only |
| **02** | `20261123000200_user_management_and_rbac.sql` | Supabase `auth.users`, `0001` | 4 tables (`account_statuses`, `profiles`, `user_roles`, `user_sessions`), status seed, 4 RBAC helpers (`app_has_role`, `app_has_any_role`, `app_is_staff`, `app_account_can_transact`) | Requires `auth.users` PK (`UUID`); forward-only |
| **03** | `20261123000300_governance_and_audit.sql` | `0001`, `0002` | 3 tables (`platform_settings`, immutable `audit_logs`, universal four-eyes `admin_actions`), default settings seed, `prevent_immutable_mutation()`, `internal_write_audit_log()` | Forward-only (`audit_logs` immutable trigger) |
| **04** | `20261123000400_financial_ledger.sql` | `0001`, `0002`, `0003` | 4 tables (`financial_periods`, `ledger_accounts`, `journal_entries`, `journal_lines`), 9 system ledger accounts, open period seed, deferred commit-time `assert_journal_entry_balanced()` + immutability triggers | Forward-only (append-only financial ledger) |
| **05** | `20261123000500_wallets_and_balances.sql` | `0001`–`0004` | 3 tables (`wallets` with distinct sub-ledger checks, payout-only `wallet_accounts`, reconciled `wallet_balances` with generated `total_customer_liability_kobo`) | Forward-only |
| **06** | `20261123000600_transactions_deposits_withdrawals.sql` | `0001`–`0005` | 6 tables (`transactions`, `transaction_references`, `transaction_fees`, Checkout-only `deposits`, `withdrawal_batches`, four-eyes `withdrawals`) | Forward-only |
| **07** | `20261123000700_tax_engine.sql` | `0001`–`0004`, `0006` | 2 tables (effective-dated `tax_rules`, immutable `tax_applications`), `guard_tax_applications_immutability()` | Forward-only |
| **08** | `20261123000800_investments_and_referrals.sql` | `0001`–`0006` | 8 tables (`investment_plans`, `investments`, `investment_allocations`, `investment_payouts`, `investment_maturities`, `referral_settings`, `referrals`, `referral_commissions`) | Forward-only |
| **09** | `20261123000900_kyc_notifications_and_payments.sql` | `0001`–`0003`, `0006` | 10 tables (`kyc_records`, `kyc_documents`, `kyc_reviews`, `compliance_events`, `notifications`, `notification_preferences`, `payment_providers` with `paystack.is_enabled = false`, `payment_references`, `payment_events`, `webhook_logs`) — **40/40 tables complete** | Forward-only |
| **10** | `20261123001000_financial_rpcs_and_reconciliation.sql` | Supabase `auth.uid()`, `0001`–`0009` | 22 `SECURITY DEFINER` functions (posting engine, wallet provisioning, reconciliation, tax resolution, deposit/withdrawal/batch/investment/payout/maturity/reversal/adjustment RPCs) | `CREATE OR REPLACE`; forward-only |
| **11** | `20261123001100_governance_and_profile_rpcs.sql` | Supabase `auth.uid()`, `0001`–`0010` | 13 `SECURITY DEFINER` functions (four-eyes bank detail, RBAC, settings, tax rule governance + profile, KYC, plan lifecycle, notifications) | `CREATE OR REPLACE`; forward-only |
| **12** | `20261123001200_rls_and_least_privilege_grants.sql` | Supabase `anon`/`authenticated`/`service_role`, `0001`–`0011` | Creates `silver_spoon_treasury_worker` & `silver_spoon_reconciler` (`NOLOGIN`); global `REVOKE ALL` + `ALTER DEFAULT PRIVILEGES`; `ENABLE` + `FORCE RLS` on 40/40 tables; 62 initial RLS policies; least-privilege `SELECT` & `EXECUTE` grants | Must run strictly after `0011` so all 40 tables & 46 prior functions are covered |
| **13** | `20261123001300_phase_b5_security_and_visibility_hardening.sql` | `0002`, `0010`, `0012` | Explicit `REVOKE CREATE ON SCHEMA public`; initial `internal_is_service_caller()`; anti-role-enumeration on 4 RBAC helpers; verified-failure payout gate; active-only `anon` plan policy (`rls_investment_plans_select_anon` + `rls_investment_plans_select_investor` → **63 policies**) | Must run strictly after `0012` |
| **14** | `20261123001400_phase_b5_final_security_audit_hardening.sql` | `0010`, `0011`, `0012`, `0013` | 5-gate conjunctive `internal_is_service_caller()` + dedicated `internal_is_reconciler_caller()` (**48 functions / 44 `SECURITY DEFINER`**); explicit `REVOKE ALL` on 7 `internal_*` primitives from `PUBLIC`, `anon`, `authenticated`, `service_role`, and workers; in-flight withdrawal decline block; user-scoped deposit idempotency; Tier 2/3 24h daily withdrawal caps; subject four-eyes isolation; approval `expires_at` enforcement; active ledger account check; `FOR SHARE` plan lock; KYC review state guard; idempotent maturity replay | Must run strictly after `0013` (replaces functions defined in `0010`, `0011`, and `0013`) |

### 1.2 Deployment Guide Audit Findings & Updates Applied

Review of `docs/phase-b-deployment-guide.md` and companion files identified four alignment items:
1. **Frozen migration range**: `docs/phase-b-deployment-guide.md` previously warned not to edit `0001`–`0013`. Updated to lock all **14** migrations (`0001`–`0014`) and document explicit cross-migration dependencies.
2. **Migration history tracking warning**: Direct `psql` loops bypass `supabase_migrations.schema_migrations`, causing CLI drift on future pushes. Updated `docs/phase-b-deployment-guide.md` to designate `supabase db push` as the required staging migration mechanism.
3. **Auth Admin API seeding order**: Clarified that on hosted Supabase GoTrue, the 8 synthetic `.invalid` users must be pre-created via Supabase Auth Admin API (so real signed JWTs can be minted) before running `supabase/seed/staging_synthetic_seed.sql`.
4. **Companion script note**: `supabase/tests/staging_multisession_concurrency.sql` header comment still references `0001-0013` and sets only legacy `request.jwt.claim.role` in its manual snippets; all **14** migrations (`0001`–`0014`) must be applied prior to running it, and `docs/staging-post-deployment-verification.md` supplements it with PostgREST v10+ JSON `request.jwt.claims` checks and Migration `0014` concurrency scenarios.

---

## 2. Remaining Risks & Hosted Supabase Assumptions (Task B)

From the Phase B.5 Final Security Audit (`docs/phase-b5-final-security-audit.md`) and `docs/internal-is-service-caller-security-evaluation.md`, the following risks and architectural assumptions **cannot be proven by local PGlite** and **must be tested against hosted Supabase**:

| ID | Risk / Assumption | Why Local PGlite Cannot Prove It | Hosted Staging Verification Requirement |
| :---: | :--- | :--- | :--- |
| **R1** | **Hosted `postgres` Role Privileges (`rolsuper = false`, `CREATEROLE`, `public` Schema Ownership)** | PGlite runs as a true PostgreSQL superuser (`rolsuper = true`). On hosted Supabase, `postgres` is a non-superuser member of `pg_database_owner` with `CREATEROLE` (and PG 16+ changed `CREATEROLE` delegation behavior). | Run `supabase db push --dry-run` then `supabase db push` on staging PG 15+ to confirm `CREATE ROLE silver_spoon_treasury_worker / silver_spoon_reconciler`, `REVOKE ALL ON SCHEMA public`, `REVOKE CREATE ON SCHEMA public`, and `ALTER DEFAULT PRIVILEGES` all succeed cleanly without `42501` permission errors. |
| **R2** | **Hosted Supabase Default Function Privileges for `service_role`** | PGlite's shim creates `service_role` with zero default privileges. Hosted Supabase's bootstrap runs `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role`. | Confirm via `supabase/tests/staging_security_verification.sql` Section 8 that all **7 `internal_*` primitives** are strictly revoked from `service_role` (guaranteed by Migration `0014`), `anon` and `PUBLIC` have **0** `EXECUTE` grants, and inspect whether `service_role` inherited default `EXECUTE` on any `authenticated`-facing RPCs (which still reject `auth.uid() IS NULL`). |
| **R3** | **Hosted `service_role` `BYPASSRLS` Operational Blast Radius** | Hosted Supabase grants `rolbypassrls = true` to `service_role`, meaning a leaked `SUPABASE_SERVICE_ROLE_KEY` bypasses forced RLS on direct table access. | Verify zero service-role keys exist in frontend/browser configs (`VITE_*`); verify `pg_roles.rolbypassrls = false` for `anon`, `authenticated`, `silver_spoon_treasury_worker`, and `silver_spoon_reconciler`; plan dedicated `silver_spoon_treasury_worker` credentials for future backend workers. |
| **R4** | **Real PostgREST v10+ JWT Verification, `SET LOCAL ROLE`, & `request.jwt.claims` Format** | PGlite mocks `auth.uid()` via `harness_supabase_shim.sql` and manual `SET LOCAL ROLE` / `set_config()`. | Execute live HTTPS calls against hosted `/rest/v1/*` and `/rest/v1/rpc/*` using real GoTrue-minted JWTs for every role (`anon`, `investor`, `finance_officer`, `compliance_officer`, `admin`, `super_admin`, and server-only `service_role`) plus tampered `user_metadata` and forged signatures. |
| **R5** | **Hosted `pg_auth_members` Role Membership Graph** | Local PGlite lacks Supabase's real `authenticator`, `supabase_auth_admin`, `supabase_storage_admin`, and `dashboard_user` roles. | Inspect `pg_auth_members` via `staging_security_verification.sql` Section 4.2 to prove `anon`, `authenticated`, and `silver_spoon_reconciler` are never members of `service_role`, `silver_spoon_treasury_worker`, `postgres`, or `supabase_admin`. |
| **R6** | **Hosted GoTrue `auth.users` Schema Compatibility for Synthetic Seeding** | PGlite's shim creates a 3-column `auth.users (id, email, created_at)` table; hosted Supabase GoTrue manages ~30+ columns and hashed passwords. | Provision the 8 synthetic `.invalid` personas via Supabase Auth Admin API first, then run `staging_synthetic_seed.sql` (`ON CONFLICT (id) DO NOTHING`). |
| **R7** | **True Multi-Connection Row Locking & Deadlock Freedom** | PGlite runs single-connection in-memory PostgreSQL and cannot test overlapping uncommitted TCP transactions blocking on `FOR UPDATE` / `FOR SHARE`. | Execute all 6 scenarios in `supabase/tests/staging_multisession_concurrency.sql` plus Migration `0014` daily-cap and plan-status `FOR SHARE` lock races across two independent `psql` connections. |
| **R8** | **Operational Governance Controls Deferred to Phase C+ Backend Workers** | Not a schema defect, but operational controls remain unimplemented until backend workers exist: (a) restricting non-current `p_as_of` overrides in `approve_and_distribute_investment_payout()`, and (b) scheduled sweeper transitioning expired `admin_actions` rows to `'expired'` and releasing stale pending withdrawal reservations. | Document as Phase C+ prerequisites; do not authorize production cutover until operational runbooks/cron jobs exist. |

---

## 3. Staging-Only Deployment Checklist (Task C)

Every item below must be verified and checked off during controlled staging deployment.

### 3.1 Supabase Project Identity & Environment Verification
- [ ] Brand-new, isolated Supabase project created exclusively for non-production staging (e.g., `silver-spoon-staging`).
- [ ] `STAGING_PROJECT_REF` double-checked against Supabase Dashboard → Project Settings → General and confirmed **distinct from any production or legacy project**.
- [ ] Supabase Auth → Providers/Settings configured with **public sign-ups disabled** and **anonymous sign-ins disabled** during Phase B.5 validation.
- [ ] Confirmed `0` real customer records exist in `auth.users` and `public.profiles`.
- [ ] Confirmed local frontend remains locked to `VITE_DATA_PROVIDER=mock` in `.env.example` and runtime environment, with zero `VITE_SUPABASE_*` production credentials and zero `SUPABASE_SERVICE_ROLE_KEY` / `PAYSTACK_SECRET_KEY` references in `src/`.
- [ ] Staging database password and `STAGING_DATABASE_URL` stored only in an ephemeral operator shell or secret vault — never committed to git.

### 3.2 Database Version & Extension Compatibility
- [ ] Staging project provisioned on **PostgreSQL 15+** (matching `supabase/config.toml` `major_version = 15`; verify exact version via `SHOW server_version;`).
- [ ] `pg_catalog.gen_random_uuid()` available natively; `pgcrypto` status and schema (`extensions` or `public`) verified via Section 1.2 of `staging_security_verification.sql`.
- [ ] Confirmed zero extensions required by `0001`–`0014` are unavailable or blocked on the chosen Supabase tier.

### 3.3 Migration Execution & Rollback Limitations
- [ ] Local baseline re-verified before touching staging (`npm run test:db` → `28/28` passed).
- [ ] `supabase link --project-ref "$STAGING_PROJECT_REF"` executed and confirmed via `supabase projects list`.
- [ ] `supabase db push --dry-run` executed and inspected to confirm exact ordered plan of all **14** migrations (`20261123000100` through `20261123001400`).
- [ ] `supabase db push` executed cleanly with zero warnings/errors.
- [ ] `supabase_migrations.schema_migrations` verified to contain all **14 / 14** timestamps (never bypass CLI tracking via raw `psql` migration loops).
- [ ] **Rollback limitation acknowledged**: Migrations `0001`–`0014` are strictly **forward-only** (no automated `DOWN` scripts). If any migration fails mid-push or a post-push defect is found:
  - Do **not** edit `0001`–`0014`.
  - For a brand-new staging project with zero retained test history, restore from the pre-migration snapshot or recreate the isolated staging database; for incremental defects after staging goes active, author a new forward-only migration (`0015+`).

### 3.4 Database Roles, Ownership & Grants
- [ ] Custom roles `silver_spoon_treasury_worker` and `silver_spoon_reconciler` exist with `rolcanlogin = false`, `rolsuper = false`, `rolbypassrls = false`.
- [ ] `pg_auth_members` confirms `anon`, `authenticated`, and `silver_spoon_reconciler` are **not** members of `service_role`, `silver_spoon_treasury_worker`, `postgres`, or `supabase_admin`.
- [ ] `PUBLIC`, `anon`, and `authenticated` hold `CREATE = false` on schema `public`.
- [ ] `PUBLIC`, `anon`, and `authenticated` hold **0** direct `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER` grants on all 40 `public` tables.
- [ ] `anon` holds `SELECT` **only** on `public.investment_plans` (1 table) and `0` grants on all other 39 tables.

### 3.5 RLS & `FORCE RLS` Verification
- [ ] Exactly **40 / 40** `public` tables have both `relrowsecurity = true` (`ENABLE`) and `relforcerowsecurity = true` (`FORCE`).
- [ ] Exactly **63** RLS policies exist in `public`, covering all 40 tables, and all 63 policies are strictly `FOR SELECT` (zero client write policies).
- [ ] `rls_investment_plans_select_anon` filters strictly to `status = 'active'`.
- [ ] `kyc_records`, `kyc_documents`, `kyc_reviews`, and `compliance_events` restrict staff reads strictly to `compliance_officer` and `super_admin` (blocking `finance_officer` and `admin`).
- [ ] Ledger (`journal_entries`, `journal_lines`, `ledger_accounts`, `financial_periods`), `withdrawal_batches`, and `payment_*` tables restrict reads strictly to `finance_officer` and `super_admin`.

### 3.6 `SECURITY DEFINER` Ownership & `search_path`
- [ ] Exactly **48** functions exist in `public`: **44** `SECURITY DEFINER` + **4** invoker trigger functions (`set_updated_at`, `prevent_immutable_mutation`, `assert_journal_entry_balanced`, `guard_tax_applications_immutability`).
- [ ] **48 / 48** functions explicitly pin `search_path=public, pg_temp` in `pg_proc.proconfig`.
- [ ] **0 / 48** functions are owned by `anon`, `authenticated`, or `service_role` (all owned by `postgres` / `supabase_admin`).
- [ ] **0 / 48** functions reference `user_metadata`, `app_metadata`, `raw_user_meta_data`, or `raw_app_meta_data`.

### 3.7 Service-Role Isolation
- [ ] **0 / 48** functions grant `EXECUTE` to `anon` or `PUBLIC`.
- [ ] All **7** low-level `internal_*` primitives (`internal_is_service_caller`, `internal_is_reconciler_caller`, `internal_assert_service_caller`, `internal_get_open_period_id`, `internal_get_system_account_id`, `internal_post_journal_entry`, `internal_write_audit_log`) have `EXECUTE = false` for `PUBLIC`, `anon`, `authenticated`, `service_role`, `silver_spoon_treasury_worker`, and `silver_spoon_reconciler`.
- [ ] Settlement RPCs (`settle_verified_deposit`, `settle_withdrawal`, `internal_provision_investor_wallet`) are **not** executable by `anon`, `authenticated`, or `silver_spoon_reconciler`.
- [ ] `silver_spoon_reconciler` holds `EXECUTE` **exclusively** on `reconcile_wallet_balance(UUID)` (1 function).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is never exposed to browsers, frontend `.env`, or human staff accounts.

### 3.8 PostgREST JWT Claim Behavior
- [ ] Live PostgREST request with tampered/unsigned JWT returns HTTP `401 Unauthorized`.
- [ ] Investor JWT with modified `user_metadata` (`{"role":"service_role","is_super_admin":true}`) cannot call `reconcile_wallet_balance`, `settle_verified_deposit`, `settle_withdrawal`, `fail_or_decline_withdrawal('failed')`, or probe another user via `app_has_role`.
- [ ] Finance Officer, Compliance Officer, Admin, and Super Admin JWTs all evaluate `internal_is_service_caller() = false` and are blocked from backend settlement / verified-failure paths.
- [ ] Verified server-only `service_role` JWT (PostgREST v10+ JSON `request.jwt.claims` with no `sub`) succeeds on `reconcile_wallet_balance` and `settle_verified_deposit`, and receives `403` / `42501 permission denied` on `internal_post_journal_entry`.

### 3.9 Financial RPC Authorization
- [ ] `payment_providers` confirms `paystack` has `is_enabled = false` and DVA excluded from `allowed_channels`.
- [ ] Universal four-eyes rules verified over hosted PostgREST: initiator/owner/subject cannot approve own withdrawal, withdrawal batch, bank detail change, payout distribution, reversal, manual adjustment, role change, setting change, or tax rule change.
- [ ] Approved or batched withdrawals cannot be declined (`INVALID_DECLINE_STATE`); expired `admin_actions` rejected (`ACTION_EXPIRED`); Tier 2 24h daily withdrawal cap enforced (`DAILY_WITHDRAWAL_LIMIT_EXCEEDED`); cross-user deposit idempotency keys do not leak UUIDs.

### 3.10 Concurrent Withdrawal & Ledger Operations
- [ ] Two independent `psql` sessions connected to `$STAGING_DATABASE_URL` verify true row-lock blocking (`FOR UPDATE` / `FOR SHARE`) across all 6 scenarios in `supabase/tests/staging_multisession_concurrency.sql`:
  1. Concurrent withdrawals exceeding available balance
  2. Duplicate deposit settlement race
  3. Concurrent valid wallet reservations
  4. Withdrawal vs. investment subscription race
  5. Duplicate payout settlement race
  6. Competing administrative approvals
- [ ] Additional Migration `0014` concurrency races verified: (a) two concurrent withdrawals breaching Tier 2 24h daily cap, and (b) `create_investment` racing against `set_investment_plan_status('paused')` (`FOR SHARE` lock).
- [ ] Zero deadlocks, zero double-spends, zero duplicate payouts, zero negative balances.

### 3.11 Audit Logging & Reconciliation
- [ ] `24` user triggers verified active (including commit-time deferred journal balancing and append-only immutability on `audit_logs`, `journal_entries`, `journal_lines`, `tax_applications`, `payment_events`, and `webhook_logs`).
- [ ] Attempted `UPDATE` / `DELETE` on `audit_logs` and `journal_entries` fails with `IMMUTABLE_RECORD`.
- [ ] Read-only unbalanced journal check returns `0` unbalanced entries.
- [ ] `reconcile_wallet_balance(UUID)` returns `is_reconciled = true` and `0` kobo drift across all seeded investor wallets after all functional and concurrency tests.

### 3.12 Backup & Recovery Arrangements
- [ ] Pre-deployment logical backup or Supabase automated daily backup / PITR status confirmed before running `supabase db push` and before synthetic seeding.
- [ ] Post-migration clean-schema snapshot (`pg_dump --schema-only`) archived in secure engineering storage (non-production) as a known-good baseline.
- [ ] Verified staging reset/recovery procedure documented: because staging contains strictly synthetic `.invalid` test data, staging can be cleanly rebuilt from scratch via fresh project reset + `supabase db push` (14 migrations) + Auth Admin API synthetic users + `staging_synthetic_seed.sql`.
- [ ] Confirmed backup retention and PITR enablement requirements are captured as mandatory production-readiness gates prior to any future production phase.

---

## 4. PGlite vs. Hosted Supabase Verification Parity Matrix (Task E)

| Test Category | Verified Locally in PGlite? | MUST Repeat on Hosted Supabase? | Rationale |
| :--- | :---: | :---: | :--- |
| Schema DDL, 40 tables, 20 enums, 691 constraints, 149 indexes | Yes (`28/28`) | **Yes** (Read-only script) | Confirms hosted PG 15+ compatibility, non-superuser `postgres` execution of `CREATE ROLE` / `REVOKE`, and `supabase_migrations.schema_migrations` tracking. |
| `40/40` `ENABLE` + `FORCE RLS`, 63 policies, 48 function `search_path` & owners | Yes (`28/28`) | **Yes** (Read-only script) | Hosted Supabase applies platform default ACLs (`ALTER DEFAULT PRIVILEGES`) and owns `public` via `pg_database_owner`; actual live catalog grants must be verified post-push. |
| `pg_auth_members` & `service_role` `BYPASSRLS` audit | Partial (3 shim roles) | **Yes (Critical)** | Local PGlite lacks real `authenticator` and Supabase platform roles; must verify `pg_auth_members` on real hosted PostgreSQL. |
| PostgREST cryptographic JWT verification & `request.jwt.claims` JSON parsing | Simulated (`set_config`) | **Yes (Critical)** | Real GoTrue JWT signing, PostgREST `SET LOCAL ROLE`, and `user_metadata` tamper resistance can only be proven over live HTTPS `/rest/v1/*` and `/rest/v1/rpc/*`. |
| Role separation across `anon`, `investor`, `finance_officer`, `compliance_officer`, `admin`, `super_admin`, `service_role` | Simulated (`runAs`) | **Yes (Critical)** | Must prove live PostgREST enforces identical isolation for wallets, KYC, ledger, batches, and settlement RPCs under real GoTrue tokens. |
| Direct `service_role` block on 7 `internal_*` primitives | Yes (Suite F Test 3) | **Yes (Critical)** | Must prove hosted Supabase default privileges did not override Migration `0014`'s `REVOKE ALL` from `service_role`. |
| True multi-session `FOR UPDATE` / `FOR SHARE` row-lock contention (6 + 2 races) | **No** (single-connection PGlite) | **Yes (Mandatory)** | PGlite cannot execute concurrent overlapping TCP transactions; true lock blocking and deadlock freedom can ONLY be verified on hosted PostgreSQL. |
| GoTrue `auth.users` synthetic persona seeding & wallet provisioning | Shim `auth.users` only | **Yes (Mandatory)** | Hosted GoTrue requires Auth Admin API provisioning for usable login tokens. |
| End-to-end financial lifecycle (deposit → withdrawal → batch → payout → investment → tax → maturity → reversal → reconciliation) | Yes (Suites A–D) | **Yes (Smoke Test)** | Confirms end-to-end execution and `reconcile_wallet_balance` zero drift on real hosted Postgres + PostgREST. |

---

## 5. Unresolved Blockers & Exact Safe Sequence for Next Deployment Stage

### 5.1 Current Unresolved Blockers (Before Remote Staging Execution)
1. **No Dedicated Non-Production Supabase Staging Project Provisioned / Linked Yet**: `supabase/config.toml` intentionally contains no `STAGING_PROJECT_REF`, and no staging credentials exist in this workspace.
2. **Hosted PostgreSQL Permission Dry-Run Not Yet Observed**: Migration `0012` (`CREATE ROLE ... NOLOGIN`, `REVOKE ALL ON SCHEMA public`) and Migration `0013` (`REVOKE CREATE ON SCHEMA public`) have not yet been dry-run against hosted Supabase's non-superuser `postgres` role (PostgreSQL 15+ target).
3. **Hosted GoTrue Auth Admin API Synthetic User Seeding Not Yet Run**: Real GoTrue-signed staging JWTs for the 8 `.invalid` test personas do not yet exist.
4. **Live Hosted PostgREST & Two-Session Concurrency Evidence Not Yet Captured**: All hosted tests in `docs/staging-post-deployment-verification.md` remain `PENDING`.
5. **Phase C+ Operational Controls (Non-Blocking for Staging Schema Push, Blocking for Production)**: Restricting `approve_and_distribute_investment_payout(p_as_of)` override window and implementing a scheduled sweeper for expired `admin_actions` rows remain future backend worker tasks.

### 5.2 Exact Safe Sequence for Controlled Staging Deployment

Execute these gates **strictly in order**; do not advance to the next gate if any assertion fails:

1. **Gate 0 — Local Pre-Flight Re-Verification (No Remote Access)**
   - Run `npm run test:db`, `npm run typecheck`, `npm run lint`, and `npm run build`.
   - Confirm `VITE_DATA_PROVIDER=mock`, zero `SUPABASE_SERVICE_ROLE_KEY` in `src/` or `.env*`, and `git status` clean on Migrations `0001`–`0014`.
2. **Gate 1 — Provision Isolated Staging Project & Verify Identity**
   - Create a brand-new Supabase project (`PostgreSQL 15+`) dedicated solely to non-production staging.
   - Disable public sign-ups and anonymous sign-ins in Auth Settings; verify `auth.users` is empty (`0` rows).
   - Confirm backup/snapshot settings are enabled and export `STAGING_PROJECT_REF` + `STAGING_DATABASE_URL` in an ephemeral terminal session only.
3. **Gate 2 — Link & Dry-Run All 14 Migrations**
   - Run `supabase login`, `supabase link --project-ref "$STAGING_PROJECT_REF"`, and `supabase projects list` to double-check target identity.
   - Run `supabase db push --dry-run` and verify exact chronological plan (`20261123000100` → `20261123001400`).
4. **Gate 3 — Controlled Migration Push & Immediate Read-Only Security Audit**
   - Run `supabase db push`.
   - Immediately execute the read-only verification script:
     ```bash
     psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/staging_security_verification.sql
     ```
   - Verify **14/14** scorecard checks report `PASS` (zero `FAIL` rows). If any hosted permission error occurs (e.g., `CREATE ROLE` or default privileges), stop immediately and evaluate a forward-only Migration `0015` without modifying `0001`–`0014`.
5. **Gate 4 — Synthetic Staging Persona Provisioning & Domain Seeding**
   - Create the 8 deterministic `.invalid` users via Supabase Auth Admin API (zero real emails, zero real PII).
   - Run `psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/staging_synthetic_seed.sql`.
   - Re-run `supabase/tests/staging_security_verification.sql` to confirm synthetic email hygiene (`11.1`), wallet reconciliation (`10.4`), and disabled payment providers (`10.1`) all remain `PASS`.
6. **Gate 5 — Live PostgREST JWT Tests & Two-Session Concurrency Suite**
   - Complete Phases 3, 4, and 5 of `docs/staging-post-deployment-verification.md` (live HTTPS JWT authorization tests across all roles + two-terminal `psql` execution of `supabase/tests/staging_multisession_concurrency.sql` + Migration `0014` races + final `reconcile_wallet_balance` zero-drift check).
7. **Gate 6 — Evidence Sign-Off Before Authorizing Phase C**
   - Record all raw outputs and verdicts in `docs/staging-post-deployment-verification.md` and `docs/phase-b-test-report.md`.
   - Keep `VITE_DATA_PROVIDER=mock` intact until Phase B.5 hosted staging evidence is formally reviewed and Phase C is explicitly authorized.

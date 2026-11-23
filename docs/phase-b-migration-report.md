# SILVER SPOON — Phase B / B.5 Migration Report

**Phase**: Phase B (Local PostgreSQL Foundation) + Phase B.5 (Pre-Staging Security & Visibility Hardening)  
**Frontend Data Provider**: `VITE_DATA_PROVIDER=mock` (preserved intact; `supabaseDataProvider` remains in zero-network standby).

### Environment Execution Matrix

| Validation Stage | Status | Notes |
| :--- | :---: | :--- |
| **1. Local PGlite Verification** | **Executed & Passed** | All 13 migrations + synthetic seed executed cleanly on embedded PostgreSQL (`@electric-sql/pglite`); 24/24 tests passed (`npm run test:db`). |
| **2. Remote Supabase Staging Deployment** | **Pending (Not Executed)** | No dedicated remote Supabase staging project ref or credentials exist in this workspace. Zero remote databases were contacted. |
| **3. Remote PostgreSQL Security Tests** | **Pending (Not Executed)** | Ready to run immediately after dedicated staging provisioning and `supabase db push`. |
| **4. Remote Multi-Session Concurrency Tests** | **Pending (Not Executed)** | 6-scenario two-session SQL suite prepared at `supabase/tests/staging_multisession_concurrency.sql`. |

---

## 1. Migration Inventory (13 Version-Controlled SQL Files)

Approved historical migrations `0001`–`0012` were **never modified silently**. All Phase B.5 security and public plan visibility refinements were authored as forward-only migration `0013`.

| # | Migration File | Local PGlite | Remote Staging | Key Objects Created / Updated |
| :-: | :--- | :---: | :---: | :--- |
| 1 | `supabase/migrations/20261123000100_extensions_and_enums.sql` | **Executed & Verified** | Pending staging ref | Conditional `pgcrypto`, `set_updated_at()`, 20 domain enums |
| 2 | `supabase/migrations/20261123000200_user_management_and_rbac.sql` | **Executed & Verified** | Pending staging ref | `account_statuses`, `profiles`, `user_roles`, `user_sessions`, 4 RBAC/account helpers |
| 3 | `supabase/migrations/20261123000300_governance_and_audit.sql` | **Executed & Verified** | Pending staging ref | `platform_settings`, immutable `audit_logs`, universal four-eyes `admin_actions`, `prevent_immutable_mutation()`, `internal_write_audit_log()` |
| 4 | `supabase/migrations/20261123000400_financial_ledger.sql` | **Executed & Verified** | Pending staging ref | `financial_periods`, `ledger_accounts` (9 system accounts), `journal_entries`, `journal_lines`, immutability & commit-time deferred balancing triggers |
| 5 | `supabase/migrations/20261123000500_wallets_and_balances.sql` | **Executed & Verified** | Pending staging ref | `wallets`, `wallet_accounts` (payout NUBAN only), `wallet_balances` (generated `total_customer_liability_kobo`) |
| 6 | `supabase/migrations/20261123000600_transactions_deposits_withdrawals.sql` | **Executed & Verified** | Pending staging ref | `transactions`, `transaction_references`, `transaction_fees`, `deposits`, `withdrawal_batches`, `withdrawals` |
| 7 | `supabase/migrations/20261123000700_tax_engine.sql` | **Executed & Verified** | Pending staging ref | `tax_rules`, `tax_applications`, `guard_tax_applications_immutability()` |
| 8 | `supabase/migrations/20261123000800_investments_and_referrals.sql` | **Executed & Verified** | Pending staging ref | `investment_plans`, `investments`, `investment_allocations`, `investment_payouts`, `investment_maturities`, `referral_settings`, `referrals`, `referral_commissions` |
| 9 | `supabase/migrations/20261123000900_kyc_notifications_and_payments.sql` | **Executed & Verified** | Pending staging ref | `kyc_records`, `kyc_documents`, `kyc_reviews`, `compliance_events`, `notifications`, `notification_preferences`, `payment_providers` (disabled), `payment_references`, `payment_events`, `webhook_logs` |
| 10 | `supabase/migrations/20261123001000_financial_rpcs_and_reconciliation.sql` | **Executed & Verified** | Pending staging ref | 22 financial, posting, tax-resolution, rollover, four-eyes payout, and reconciliation functions |
| 11 | `supabase/migrations/20261123001100_governance_and_profile_rpcs.sql` | **Executed & Verified** | Pending staging ref | 13 governance, four-eyes bank/RBAC/settings/tax-rule, profile, KYC, and plan lifecycle functions |
| 12 | `supabase/migrations/20261123001200_rls_and_least_privilege_grants.sql` | **Executed & Verified** | Pending staging ref | 2 internal worker roles, global `REVOKE ALL`, `ENABLE` + `FORCE RLS` on 40 tables, 62 initial RLS policies, least-privilege grants |
| 13 | `supabase/migrations/20261123001300_phase_b5_security_and_visibility_hardening.sql` | **Executed & Verified** | Pending staging ref | Forward-only hardening: `internal_is_service_caller()`, caller-role fixes in `reconcile_wallet_balance` & `fail_or_decline_withdrawal`, anti-role-enumeration in RBAC helpers, explicit `REVOKE CREATE ON SCHEMA public`, active-only `anon` plan policy |

**Supporting CLI & Non-Production Artifacts**:
- `supabase/config.toml` — Non-production Supabase CLI baseline (PostgreSQL 15, zero hardcoded project refs or secrets).
- `supabase/seed/staging_synthetic_seed.sql` — 8 synthetic `.invalid` personas covering all 5 RBAC roles, 2 synthetic plans, and 3 effective-dated tax rules.

---

## 2. Verified `pg_catalog` Schema Inventory (Post-Migration 0013, Local PGlite)

| Catalog Object Category | Verified Count | Key Highlights |
| :--- | :---: | :--- |
| **Public Tables** | **40** | 100% aligned to the approved 40-table architecture |
| **Tables with `ENABLE` + `FORCE ROW LEVEL SECURITY`** | **40 / 40** | Zero unprotected tables in `public` schema |
| **Indexes (`pg_indexes`)** | **149** | PKs, partial uniques (`uq_user_roles_active`, `uq_wallet_accounts_primary_active`, `uq_kyc_records_bvn_hash_approved`), idempotency & lookup indexes |
| **Constraints (`pg_constraint`)** | **691** | Non-negative kobo checks, `currency = 'NGN'`, `ON DELETE RESTRICT` FKs, four-eyes `<>` checks, consent checks, distinct sub-ledger checks |
| **Triggers (non-internal `pg_trigger`)** | **24** | Append-only immutability on 6 tables, commit-time deferred journal balancing, `updated_at` triggers |
| **Functions (`pg_proc` in `public`)** | **47** | **43** `SECURITY DEFINER` functions (**43/43** pinning `SET search_path = public, pg_temp`) + **4** trigger functions (also pinning `search_path = public, pg_temp`) |
| **Table-Specific RLS Policies (`pg_policies`)** | **63** | Replaced 1 broad public plan policy with 2 stricter policies (`rls_investment_plans_select_anon` active-only + `rls_investment_plans_select_investor`) |

---

## 3. Supabase Compatibility Audit (PGlite vs. Hosted Supabase PostgreSQL 15+)

All 13 migrations were reviewed for PGlite-specific assumptions before remote deployment:
- **Extensions**: `CREATE EXTENSION IF NOT EXISTS pgcrypto` is guarded via `pg_available_extensions`; UUID generation uses PostgreSQL 15+ core `pg_catalog.gen_random_uuid()` directly with zero schema mismatch if Supabase installs `pgcrypto` in `extensions`.
- **Auth Schema References**: All `auth.users` foreign keys and `auth.uid()` calls are explicitly schema-qualified (`auth.uid()`), fully compatible with pinned `SET search_path = public, pg_temp`.
- **Supabase `service_role` `BYPASSRLS`**: On hosted Supabase, `service_role` carries `BYPASSRLS` and bypasses even `FORCE ROW LEVEL SECURITY`. All `service_role` settlement calls are therefore restricted strictly to server-side Edge Functions with verified provider signatures/references and are never exposed to browser clients.
- **Seed Compatibility Note**: `supabase/seed/staging_synthetic_seed.sql` inserts minimal `(id, email)` rows into `auth.users`. On remote Supabase GoTrue instances where extra columns or Auth Admin API provisioning are preferred, see `docs/phase-b-deployment-guide.md` Section 4.

---

## 4. Security & Visibility Findings Discovered and Resolved in Phase B.5 (Migration 0013)

1. **`SECURITY DEFINER` `current_user` Role-Check Bypass (High Severity — Fixed)**
   - *Discovery*: Inside a `postgres`-owned `SECURITY DEFINER` function, PostgreSQL's `current_user` always resolves to `'postgres'`, not the invoking role. Consequently, `current_user IN ('postgres', ...)` inside `reconcile_wallet_balance()` and `fail_or_decline_withdrawal()` (which are granted to `authenticated` for staff access) would have permitted an authenticated investor to bypass internal role authorization.
   - *Resolution (Migration 0013)*: Introduced `public.internal_is_service_caller()` inspecting `request.jwt.claim.role`, `current_setting('role', true)`, and `session_user`, and updated `internal_assert_service_caller()`, `reconcile_wallet_balance()`, and `fail_or_decline_withdrawal()`. Verified via automated test that investors are now strictly blocked (`UNAUTHORIZED_RECONCILIATION` / `UNAUTHORIZED`).
2. **Failed Payout Release Verification Gate (Medium Severity — Fixed)**
   - *Discovery*: `fail_or_decline_withdrawal()` previously allowed staff to pass `p_final_status = 'failed'` directly.
   - *Resolution (Migration 0013)*: Restricted `'failed'` payout reservation release exclusively to verified backend service callers (`service_role` / `silver_spoon_treasury_worker`) with a mandatory failure reason, while keeping `'declined'` available to independent `finance_officer`/`super_admin` reviewers (blocking self-decline).
3. **Cross-User RBAC Role Enumeration (Medium Severity — Fixed)**
   - *Discovery*: `app_has_role(p_user_id, role)` and related helpers were executable by `authenticated` for RLS evaluation, allowing a caller to pass another user's UUID to probe staff roles.
   - *Resolution (Migration 0013)*: Restricted `app_has_role`, `app_has_any_role`, `app_is_staff`, and `app_account_can_transact` to return `false` whenever a non-service caller supplies a `p_user_id` distinct from `auth.uid()`.
4. **Anonymous Public Investment Plan Visibility (Business & Compliance Fix)**
   - *Discovery*: `rls_investment_plans_select_public` exposed `status IN ('active', 'paused')` to `anon` and `authenticated`, presenting paused mandates as public catalog items.
   - *Resolution (Migration 0013)*: Dropped `rls_investment_plans_select_public` and created `rls_investment_plans_select_anon` (`status = 'active'` ONLY) and `rls_investment_plans_select_investor` (`status = 'active'` OR existing holding in `public.investments`).
5. **Explicit `public` Schema `CREATE` Revocation (Defense-in-Depth)**
   - *Resolution (Migration 0013)*: Explicitly executed `REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;` and verified `has_schema_privilege(..., 'public', 'CREATE') = false` for both roles.

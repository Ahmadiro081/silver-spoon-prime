# SILVER SPOON — Phase B / B.5 Remote Non-Production Supabase Staging Deployment Guide

**Target Environment**: Dedicated, isolated, non-production Supabase Staging PostgreSQL 15+ project ONLY.  
**Active Frontend Provider**: `VITE_DATA_PROVIDER=mock` (MUST remain `mock` throughout Phase B and Phase B.5).  
**CLI Baseline Config**: `supabase/config.toml` (contains NO remote project ref and NO secrets).

> **CRITICAL NON-PRODUCTION BOUNDARY**
> - **NEVER** link or deploy to an existing production Supabase project or any database containing real customer data.
> - **NEVER** enable `payment_providers.is_enabled = true` or configure live Paystack secret keys.
> - **NEVER** collect real BVN/NIN or upload real KYC identity documents.
> - **NEVER** switch `VITE_DATA_PROVIDER` away from `mock` or connect the frontend to the staging database.

---

## 1. Provisioning a Dedicated Non-Production Supabase Staging Project

If no dedicated staging project exists yet, complete these steps before running any CLI or `psql` command:

1. Open the Supabase Dashboard and create a **new, isolated project** named e.g. `silver-spoon-staging` (separate from any production or legacy project).
2. Choose **PostgreSQL 15+** and record:
   - `STAGING_PROJECT_REF` (Project Settings → General → Reference ID)
   - `STAGING_DATABASE_URL` (Project Settings → Database → Direct Connection URI, using the staging database password; store only in your secure shell session or CI secret manager — **never commit to git or `.env.example`**)
3. Confirm in Supabase Dashboard → Authentication → Settings that public sign-ups remain restricted during Phase B.5 validation and **zero real user records** exist in `auth.users`.
4. Confirm locally that the frontend remains locked to mock mode (`VITE_DATA_PROVIDER=mock`) and local PGlite verification passes:
   ```bash
   npm run test:db
   ```

---

## 2. Migration Execution Order & Dependencies (14 Frozen Forward-Only SQL Files)

Do **not** edit approved migrations `0001`–`0014`. Any future change must be authored as a forward-only migration (`0015+`). Apply all 14 migrations in strict lexicographical order:

| Step | Migration File | Explicit Dependencies | Objects Created / Hardened |
| :---: | :--- | :--- | :--- |
| 1 | `20261123000100_extensions_and_enums.sql` | PostgreSQL 15+ (`pg_catalog.gen_random_uuid()`) | Conditional `pgcrypto`, `set_updated_at()`, 20 domain enums |
| 2 | `20261123000200_user_management_and_rbac.sql` | Supabase `auth.users`, `0001` | 4 tables (`account_statuses`, `profiles`, `user_roles`, `user_sessions`), 4 RBAC/account helpers |
| 3 | `20261123000300_governance_and_audit.sql` | `0001`, `0002` | 3 tables (`platform_settings`, immutable `audit_logs`, four-eyes `admin_actions`), `prevent_immutable_mutation()`, `internal_write_audit_log()` |
| 4 | `20261123000400_financial_ledger.sql` | `0001`, `0002`, `0003` | 4 tables (`financial_periods`, `ledger_accounts` + 9 system accounts, `journal_entries`, `journal_lines`), immutability & commit-time deferred balancing triggers |
| 5 | `20261123000500_wallets_and_balances.sql` | `0001`–`0004` | 3 tables (disjoint sub-ledger `wallets`, payout NUBAN `wallet_accounts`, reconciled `wallet_balances`) |
| 6 | `20261123000600_transactions_deposits_withdrawals.sql` | `0001`–`0005` | 6 tables (`transactions`, `transaction_references`, `transaction_fees`, `deposits`, `withdrawal_batches`, `withdrawals`) |
| 7 | `20261123000700_tax_engine.sql` | `0001`–`0004`, `0006` | 2 tables (effective-dated `tax_rules`, immutable `tax_applications`), `guard_tax_applications_immutability()` |
| 8 | `20261123000800_investments_and_referrals.sql` | `0001`–`0006` | 8 tables (`investment_plans`, `investments`, `investment_allocations`, `investment_payouts`, `investment_maturities`, `referral_settings`, `referrals`, `referral_commissions`) |
| 9 | `20261123000900_kyc_notifications_and_payments.sql` | `0001`–`0003`, `0006` | 10 tables (`kyc_*`, `compliance_events`, `notifications*`, `payment_*` with Paystack `is_enabled = false`, `webhook_logs`) — completes **40 tables** |
| 10 | `20261123001000_financial_rpcs_and_reconciliation.sql` | Supabase `auth.uid()`, `0001`–`0009` | 22 `SECURITY DEFINER` financial, posting, tax-resolution, rollover, four-eyes payout, and reconciliation functions |
| 11 | `20261123001100_governance_and_profile_rpcs.sql` | Supabase `auth.uid()`, `0001`–`0010` | 13 `SECURITY DEFINER` governance (bank details, roles, settings, tax rules), profile, KYC, plan status & notification functions |
| 12 | `20261123001200_rls_and_least_privilege_grants.sql` | Supabase `anon`/`authenticated`/`service_role`, `0001`–`0011` | 2 internal `NOLOGIN` roles, global `REVOKE ALL` + `ALTER DEFAULT PRIVILEGES`, `ENABLE` + `FORCE RLS` on 40/40 tables, 62 initial RLS policies, least-privilege grants |
| 13 | `20261123001300_phase_b5_security_and_visibility_hardening.sql` | `0002`, `0010`, `0012` | Initial `internal_is_service_caller()`, caller-role fixes, verified-failure payout gate, anti-role-enumeration, explicit `REVOKE CREATE ON SCHEMA public`, active-only `anon` plan visibility (63 RLS policies) |
| 14 | `20261123001400_phase_b5_final_security_audit_hardening.sql` | `0010`, `0011`, `0012`, `0013` | 5-gate conjunctive `internal_is_service_caller()` + `internal_is_reconciler_caller()` (48 functions / 44 `SECURITY DEFINER`), explicit `REVOKE ALL` on 7 `internal_*` primitives from `service_role`, in-flight withdrawal decline block, user-scoped deposit idempotency, Tier 2/3 24h daily withdrawal caps, subject four-eyes isolation & approval expiry enforcement |

---

## 3. Deploying Migrations to Dedicated Staging

Review `docs/staging-deployment-readiness.md` before executing any command below.

### Step 3.1: Verify Non-Production Target Before Linking
```bash
# Confirm target ref is strictly your dedicated staging project ref (NEVER production)
export STAGING_PROJECT_REF="<YOUR_DEDICATED_STAGING_PROJECT_REF>"

supabase login
supabase link --project-ref "$STAGING_PROJECT_REF"
supabase projects list
```

### Step 3.2: Dry-Run & Push Migrations (Required Method)
Use `supabase db push` so all 14 migration timestamps are recorded in `supabase_migrations.schema_migrations`:
```bash
# Inspect exact pending SQL statements first
supabase db push --dry-run

# Apply all 14 migrations to staging
supabase db push
```

> **Direct `psql` Warning**: Applying migration SQL files directly via `psql` bypasses `supabase_migrations.schema_migrations`, causing CLI drift on future pushes. Use `supabase db push` for staging deployment; reserve direct `psql` for read-only verification scripts and multi-session concurrency testing.

---

## 4. Seeding Synthetic Staging Test Personas (Non-Production Only)

On hosted Supabase GoTrue, pre-create the 8 deterministic `.invalid` synthetic users via the **Supabase Auth Admin API** (using the exact UUIDs in `supabase/seed/staging_synthetic_seed.sql` and synthetic test passwords stored only in non-production staging secrets) so real signed GoTrue JWTs can be minted for PostgREST verification. Then apply the idempotent domain seed:
```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/staging_synthetic_seed.sql
```
*(Because `staging_synthetic_seed.sql` uses `ON CONFLICT (id) DO NOTHING`, pre-created GoTrue users are preserved cleanly while profiles, roles, wallets, plans, and tax rules are populated.)*

---

## 5. Remote Staging Security & Inventory Verification (Read-Only)

Execute the complete read-only security verification suite immediately after `supabase db push` and follow the full runbook in `docs/staging-post-deployment-verification.md`:

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/staging_security_verification.sql
```

This read-only script (`BEGIN TRANSACTION READ ONLY;`) inspects:
- PostgreSQL version (`>= 15`) and extensions (`pgcrypto`)
- `supabase_migrations.schema_migrations` completeness (`14 / 14`)
- `public` schema `USAGE`/`CREATE` grants and `pg_default_acl`
- Database roles, `BYPASSRLS`, and `pg_auth_members` integrity
- `40 / 40` tables with `ENABLE` + `FORCE ROW LEVEL SECURITY` and `0` client DML grants
- `63` `SELECT`-only RLS policies including active-only `anon` plan visibility and KYC isolation
- `48` functions (`44` `SECURITY DEFINER` + `4` trigger functions), ownership, pinned `search_path = public, pg_temp`, and zero `user_metadata`/`app_metadata` references
- Function `EXECUTE` grants: `0` for `anon`/`PUBLIC`, all `7` `internal_*` primitives revoked even from `service_role`, `silver_spoon_reconciler` restricted strictly to `reconcile_wallet_balance(UUID)`
- `24` triggers (including deferred journal balancing and immutability triggers), disabled `payment_providers`, zero unbalanced journals, zero wallet drift, and `.invalid`-only synthetic staging hygiene

---

## 6. Remote Multi-Session Concurrency & Live PostgREST Validation

Follow `docs/staging-post-deployment-verification.md` to execute:
1. Live HTTPS PostgREST JWT authorization & impersonation tests across `anon`, `investor`, `finance_officer`, `compliance_officer`, `admin`, `super_admin`, and server-only `service_role`.
2. Two-terminal concurrent `psql` execution of all scenarios in `supabase/tests/staging_multisession_concurrency.sql` (plus Migration `0014` daily-cap and plan-lock races).
3. Final `SELECT * FROM public.reconcile_wallet_balance('<investor1_wallet_uuid>');` confirming `is_reconciled = true` and zero kobo drift.


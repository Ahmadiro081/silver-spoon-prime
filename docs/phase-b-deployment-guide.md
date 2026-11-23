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

## 2. Migration Execution Order (14 Version-Controlled SQL Files)

Do **not** edit approved migrations `0001`–`0013`. Apply all 14 migrations in strict lexicographical order:

| Step | Migration File | Purpose |
| :---: | :--- | :--- |
| 1 | `20261123000100_extensions_and_enums.sql` | Conditional `pgcrypto`, `set_updated_at()`, 20 domain enums |
| 2 | `20261123000200_user_management_and_rbac.sql` | User management, 5-role RBAC tables & helper functions |
| 3 | `20261123000300_governance_and_audit.sql` | `platform_settings`, immutable `audit_logs`, four-eyes `admin_actions` |
| 4 | `20261123000400_financial_ledger.sql` | Double-entry internal subledger, immutability & deferred balancing triggers |
| 5 | `20261123000500_wallets_and_balances.sql` | Disjoint sub-ledger `wallets`, payout NUBAN `wallet_accounts`, reconciled `wallet_balances` |
| 6 | `20261123000600_transactions_deposits_withdrawals.sql` | Transactions, Checkout `deposits`, scheduled `withdrawal_batches`, four-eyes `withdrawals` |
| 7 | `20261123000700_tax_engine.sql` | Effective-dated configurable `tax_rules` & immutable `tax_applications` |
| 8 | `20261123000800_investments_and_referrals.sql` | Plans, investments (rollover guards), allocations, realized payouts, maturities, referrals |
| 9 | `20261123000900_kyc_notifications_and_payments.sql` | Vendor-agnostic KYC metadata, notifications, payment audit (`paystack` disabled) |
| 10 | `20261123001000_financial_rpcs_and_reconciliation.sql` | Atomic posting engine, reconciliation, tax resolver, financial RPCs |
| 11 | `20261123001100_governance_and_profile_rpcs.sql` | Four-eyes governance RPCs (bank details, roles, settings, tax rules), profile & KYC RPCs |
| 12 | `20261123001200_rls_and_least_privilege_grants.sql` | Internal worker roles, global `REVOKE ALL`, forced RLS on 40 tables, least-privilege grants |
| 13 | `20261123001300_phase_b5_security_and_visibility_hardening.sql` | `internal_is_service_caller()`, caller-role fixes, verified-failure payout gate, anti-role-enumeration, explicit `REVOKE CREATE ON SCHEMA public`, active-only `anon` plan visibility |
| 14 | `20261123001400_phase_b5_final_security_audit_hardening.sql` | Conjunctive non-spoofable `internal_is_service_caller()` + `internal_is_reconciler_caller()`, PostgREST v10+ JSON claims & `sub IS NULL` check, explicit `internal_*` revoke from `service_role`, in-flight withdrawal decline block, user-scoped deposit idempotency, daily withdrawal caps, subject four-eyes isolation & approval expiry enforcement |

---

## 3. Deploying Migrations to Dedicated Staging

### Step 3.1: Verify Non-Production Target Before Linking
```bash
# Confirm target ref is strictly your dedicated staging project ref (NEVER production)
export STAGING_PROJECT_REF="<YOUR_DEDICATED_STAGING_PROJECT_REF>"

supabase login
supabase link --project-ref "$STAGING_PROJECT_REF"
supabase projects list
```

### Step 3.2: Dry-Run & Push Migrations
```bash
# Inspect exact pending SQL statements first
supabase db push --dry-run

# Apply all 14 migrations to staging
supabase db push
```

*(Alternative via direct `psql` against `STAGING_DATABASE_URL`)*:
```bash
for file in supabase/migrations/*.sql; do
  echo "Applying $file..."
  psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
done
```

---

## 4. Seeding Synthetic Staging Test Personas (Non-Production Only)

Load purely synthetic `.invalid` test users, synthetic plans, and synthetic effective-dated tax rules:
```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/staging_synthetic_seed.sql
```
*(If your Supabase GoTrue version requires `instance_id`/`aud`/`role` defaults on `auth.users`, pre-create the 8 deterministic UUID users via Supabase Auth Admin API using the exact UUIDs in `staging_synthetic_seed.sql`, then run the seed — `ON CONFLICT (id) DO NOTHING` handles existing synthetic user rows idempotently.)*

---

## 5. Remote Staging Security & Inventory Verification Queries

Execute these read-only checks against the remote staging database after `supabase db push` and record actual output in `docs/phase-b-test-report.md`:

```sql
-- 1. Confirm 40/40 public tables with ENABLE + FORCE ROW LEVEL SECURITY
SELECT
  COUNT(*) AS total_tables,
  COUNT(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity) AS forced_rls_tables
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';
-- Expected: total_tables = 40, forced_rls_tables = 40

-- 2. Confirm 44/44 SECURITY DEFINER functions pin search_path = public, pg_temp and check ownership
SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true
ORDER BY p.proname;
-- Expected: 44 rows, every row owned by postgres/supabase_admin with search_path=public, pg_temp

-- 3. Confirm zero CREATE privilege on schema public for anon & authenticated
SELECT
  has_schema_privilege('anon', 'public', 'CREATE') AS anon_create,
  has_schema_privilege('authenticated', 'public', 'CREATE') AS auth_create;
-- Expected: false, false

-- 4. Confirm 63 RLS policies and active-only anon policy on investment_plans
SELECT COUNT(*) AS total_rls_policies FROM pg_policies WHERE schemaname = 'public';
SELECT policyname, roles, qual FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'investment_plans';
-- Expected: rls_investment_plans_select_anon -> (status = 'active'::plan_status_enum)

-- 5. Confirm Paystack remains disabled
SELECT code, is_enabled, allowed_channels FROM public.payment_providers;
-- Expected: is_enabled = false

-- 6. Inspect service_role BYPASSRLS posture (informational audit)
SELECT rolname, rolbypassrls FROM pg_roles
WHERE rolname IN ('anon', 'authenticated', 'service_role', 'silver_spoon_treasury_worker', 'silver_spoon_reconciler');
-- Expected: ONLY service_role has rolbypassrls = true; never expose service_role to browsers or staff UI
```

---

## 6. Remote Multi-Session Concurrency Validation

Open **two independent `psql` terminals** connected to `$STAGING_DATABASE_URL` and execute all 6 scenarios documented in:
- `supabase/tests/staging_multisession_concurrency.sql`
  1. Concurrent withdrawals
  2. Duplicate deposit settlement
  3. Concurrent wallet reservations
  4. Withdrawal vs. investment subscription
  5. Duplicate payout settlement
  6. Competing administrative approvals

Finish with `SELECT * FROM public.reconcile_wallet_balance('<investor1_wallet_uuid>');` and verify `is_reconciled = true` and `cached_total_liability_kobo = ledger_total_liability_kobo`.

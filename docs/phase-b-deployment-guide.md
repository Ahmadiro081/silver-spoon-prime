# SILVER SPOON — Phase B Non-Production Staging Deployment Guide

**Target Environment**: Dedicated, isolated, non-production Supabase Staging PostgreSQL 15+ project ONLY.  
**Active Frontend Provider**: `VITE_DATA_PROVIDER=mock` (MUST remain `mock` throughout Phase B).

> **CRITICAL SAFETY BOUNDARY**
> - **NEVER** run these migrations against a production database or any database containing real customer data.
> - **NEVER** enable `payment_providers.is_enabled = true` or connect live Paystack credentials in Phase B.
> - **NEVER** upload real BVN, NIN, or real KYC identity documents to staging.
> - **NEVER** switch `VITE_DATA_PROVIDER` away from `mock` during Phase B.

---

## 1. Pre-Deployment Staging Isolation Checklist

Before applying migrations to a remote Supabase staging project, confirm every item below:

- [ ] A **dedicated non-production Supabase project** has been provisioned exclusively for staging (distinct project ref, distinct database password, distinct anon/service keys).
- [ ] Confirmed zero production customer rows exist in `auth.users` or `public.*`.
- [ ] Local automated PostgreSQL verification (`npm run test:db`) passes with **0 failures**.
- [ ] `VITE_DATA_PROVIDER` remains set to `mock` in `.env` / Vercel / AI Studio preview settings.
- [ ] Paystack remains disabled (`payment_providers.is_enabled = false`).

---

## 2. Migration Execution Order

Apply all 12 version-controlled SQL migrations in strict lexicographical order from `supabase/migrations/`:

| Step | Migration File | Scope |
| :---: | :--- | :--- |
| 1 | `20261123000100_extensions_and_enums.sql` | Conditional `pgcrypto`, `set_updated_at()`, 20 foundational PostgreSQL enums |
| 2 | `20261123000200_user_management_and_rbac.sql` | `account_statuses`, `profiles`, `user_roles`, `user_sessions`, 4 RBAC/status helper functions |
| 3 | `20261123000300_governance_and_audit.sql` | `platform_settings`, immutable `audit_logs`, universal four-eyes `admin_actions`, `internal_write_audit_log()` |
| 4 | `20261123000400_financial_ledger.sql` | `financial_periods`, `ledger_accounts` (9 system control accounts), `journal_entries`, `journal_lines`, immutability & deferred commit-time balancing triggers |
| 5 | `20261123000500_wallets_and_balances.sql` | `wallets` (3 disjoint customer sub-ledgers), `wallet_accounts` (payout NUBAN only), `wallet_balances` (generated `total_customer_liability_kobo`) |
| 6 | `20261123000600_transactions_deposits_withdrawals.sql` | `transactions`, `transaction_references`, `transaction_fees`, `deposits` (Paystack Checkout only), `withdrawal_batches`, `withdrawals` |
| 7 | `20261123000700_tax_engine.sql` | Configurable effective-dated `tax_rules` and immutable `tax_applications` |
| 8 | `20261123000800_investments_and_referrals.sql` | `investment_plans`, `investments` (rollover guards), `investment_allocations`, `investment_payouts`, `investment_maturities`, `referral_settings`, `referrals`, `referral_commissions` |
| 9 | `20261123000900_kyc_notifications_and_payments.sql` | Vendor-agnostic `kyc_records`, `kyc_documents`, `kyc_reviews`, `compliance_events`, `notifications`, `notification_preferences`, `payment_providers` (disabled), `payment_references`, `payment_events`, `webhook_logs` |
| 10 | `20261123001000_financial_rpcs_and_reconciliation.sql` | Atomic posting engine, `reconcile_wallet_balance`, tax resolver, deposit/withdrawal/batch/investment/maturity/reversal/adjustment RPCs |
| 11 | `20261123001100_governance_and_profile_rpcs.sql` | Four-eyes bank detail, RBAC role, platform settings, tax rule RPCs; profile update; KYC submit/review; plan status management |
| 12 | `20261123001200_rls_and_least_privilege_grants.sql` | Internal worker roles, global `REVOKE ALL`, `ENABLE` + `FORCE ROW LEVEL SECURITY` on all 40 tables, table-specific RLS policies, least-privilege grants |

---

## 3. Deploying to a Dedicated Supabase Staging Project

### Option A: Supabase CLI (Recommended)

```bash
# 1. Authenticate CLI and link ONLY to the dedicated staging project ref
supabase login
supabase link --project-ref <DEDICATED_STAGING_PROJECT_REF>

# 2. Dry-run inspect pending migrations before execution
supabase db push --dry-run

# 3. Push all 12 migrations to staging
supabase db push
```

### Option B: Direct `psql` Against Staging Connection String

```bash
# Ensure STAGING_DATABASE_URL points ONLY to the isolated non-production staging instance
for file in supabase/migrations/*.sql; do
  echo "Applying $file..."
  psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
done
```

---

## 4. Loading Synthetic Staging Test Fixtures (Non-Production Only)

After all 12 schema migrations succeed, optionally seed synthetic `.invalid` test personas, synthetic investment mandates, and synthetic effective-dated tax rules:

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/staging_synthetic_seed.sql
```

---

## 5. Post-Deployment Staging Verification Commands

### 5.1 Local Embedded PostgreSQL Automated Suite
```bash
npm run test:db
```

### 5.2 Remote Staging Schema & Security Sanity Queries
Run these read-only checks on the staging database after `supabase db push`:

```sql
-- 1. Confirm exact 40 public tables and 100% ENABLE + FORCE ROW LEVEL SECURITY
SELECT COUNT(*) AS total_tables,
       COUNT(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity) AS forced_rls_tables
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';

-- 2. Confirm 100% of SECURITY DEFINER functions pin search_path = public, pg_temp
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND (p.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig)));
-- Expected: 0 rows

-- 3. Confirm Paystack provider remains disabled in staging
SELECT code, is_enabled, allowed_channels FROM public.payment_providers;
-- Expected: is_enabled = false
```

### 5.3 True Multi-Session Concurrency Verification on Remote Staging
Execute the two-session `SELECT ... FOR UPDATE` lock-contention tests documented in:
- `supabase/tests/staging_multisession_concurrency.sql`

---

## 6. Reset / Teardown (Staging Only)

Because Phase B is strictly non-production with synthetic data, a clean staging rebuild uses `supabase db reset` on the dedicated staging project (never on production).

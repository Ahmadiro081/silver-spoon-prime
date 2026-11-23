# SILVER SPOON — Phase B Migration Report

**Phase**: Phase B — Non-Production PostgreSQL Foundation  
**Frontend Data Provider**: `VITE_DATA_PROVIDER=mock` (preserved intact; `supabaseDataProvider` remains in standby).  
**Remote Staging Deployment Status**: **Locally Prepared & Locally Verified Only** — No dedicated remote Supabase staging project credentials (`STAGING_DATABASE_URL` / project ref) were present in this workspace. In strict compliance with Phase B scope, no existing or production Supabase project was connected. All 12 migrations were executed and verified end-to-end against a real embedded PostgreSQL engine (`@electric-sql/pglite`).

---

## 1. Migration Inventory (12 Version-Controlled SQL Files)

| # | Migration File | Status (Embedded PG) | Status (Remote Staging) | Key Objects Created |
| :-: | :--- | :---: | :---: | :--- |
| 1 | `supabase/migrations/20261123000100_extensions_and_enums.sql` | **Executed & Verified** | Prepared locally (pending staging ref) | Conditional `pgcrypto`, `set_updated_at()`, 20 domain enums |
| 2 | `supabase/migrations/20261123000200_user_management_and_rbac.sql` | **Executed & Verified** | Prepared locally (pending staging ref) | `account_statuses`, `profiles`, `user_roles`, `user_sessions`, 4 RBAC/account helpers |
| 3 | `supabase/migrations/20261123000300_governance_and_audit.sql` | **Executed & Verified** | Prepared locally (pending staging ref) | `platform_settings`, `audit_logs`, `admin_actions`, `prevent_immutable_mutation()`, `internal_write_audit_log()` |
| 4 | `supabase/migrations/20261123000400_financial_ledger.sql` | **Executed & Verified** | Prepared locally (pending staging ref) | `financial_periods`, `ledger_accounts` (9 system accounts), `journal_entries`, `journal_lines`, immutability & commit-time deferred balancing triggers |
| 5 | `supabase/migrations/20261123000500_wallets_and_balances.sql` | **Executed & Verified** | Prepared locally (pending staging ref) | `wallets`, `wallet_accounts` (payout NUBAN only), `wallet_balances` (generated `total_customer_liability_kobo`) |
| 6 | `supabase/migrations/20261123000600_transactions_deposits_withdrawals.sql` | **Executed & Verified** | Prepared locally (pending staging ref) | `transactions`, `transaction_references`, `transaction_fees`, `deposits`, `withdrawal_batches`, `withdrawals` |
| 7 | `supabase/migrations/20261123000700_tax_engine.sql` | **Executed & Verified** | Prepared locally (pending staging ref) | `tax_rules`, `tax_applications`, `guard_tax_applications_immutability()` |
| 8 | `supabase/migrations/20261123000800_investments_and_referrals.sql` | **Executed & Verified** | Prepared locally (pending staging ref) | `investment_plans`, `investments`, `investment_allocations`, `investment_payouts`, `investment_maturities`, `referral_settings`, `referrals`, `referral_commissions` |
| 9 | `supabase/migrations/20261123000900_kyc_notifications_and_payments.sql` | **Executed & Verified** | Prepared locally (pending staging ref) | `kyc_records`, `kyc_documents`, `kyc_reviews`, `compliance_events`, `notifications`, `notification_preferences`, `payment_providers` (disabled), `payment_references`, `payment_events`, `webhook_logs` |
| 10 | `supabase/migrations/20261123001000_financial_rpcs_and_reconciliation.sql` | **Executed & Verified** | Prepared locally (pending staging ref) | 22 financial, posting, tax-resolution, rollover, four-eyes payout, and reconciliation functions |
| 11 | `supabase/migrations/20261123001100_governance_and_profile_rpcs.sql` | **Executed & Verified** | Prepared locally (pending staging ref) | 13 governance, four-eyes bank/RBAC/settings/tax-rule, profile, KYC, and plan lifecycle functions |
| 12 | `supabase/migrations/20261123001200_rls_and_least_privilege_grants.sql` | **Executed & Verified** | Prepared locally (pending staging ref) | 2 internal worker roles, global `REVOKE ALL`, `ENABLE` + `FORCE RLS` on 40 tables, 62 RLS policies, explicit least-privilege grants |

**Non-Production Fixtures (Separate from Migrations)**:
- `supabase/seed/staging_synthetic_seed.sql` — 8 synthetic `.invalid` personas covering all 5 RBAC roles, 2 synthetic investment plans, and 3 synthetic effective-dated tax rules.

---

## 2. Verified `pg_catalog` Schema Inventory

Captured directly from PostgreSQL `pg_catalog` after executing all 12 migrations:

| Catalog Object Category | Verified Count | Key Highlights |
| :--- | :---: | :--- |
| **Public Tables** | **40** | 100% aligned to the approved 40-table architecture |
| **Tables with `ENABLE` + `FORCE ROW LEVEL SECURITY`** | **40 / 40** | Zero unprotected tables in `public` schema |
| **Indexes (`pg_indexes`)** | **149** | Primary keys, partial uniques (`uq_user_roles_active`, `uq_wallet_accounts_primary_active`, `uq_kyc_records_bvn_hash_approved`), idempotency & lookup indexes |
| **Constraints (`pg_constraint`)** | **691** | Non-negative kobo checks, `currency = 'NGN'`, `ON DELETE RESTRICT` FKs, four-eyes `<>` checks, consent checks, distinct sub-ledger checks |
| **Triggers (non-internal `pg_trigger`)** | **24** | Append-only immutability on `journal_entries`, `journal_lines`, `audit_logs`, `kyc_reviews`, `webhook_logs`, `tax_applications`; deferred commit-time balancing on `journal_entries` & `journal_lines`; `updated_at` triggers |
| **Functions (`pg_proc` in `public`)** | **46** | **42** `SECURITY DEFINER` functions (100% pinning `SET search_path = public, pg_temp`) + **4** trigger functions (also pinning `SET search_path = public, pg_temp`) |
| **Table-Specific RLS Policies (`pg_policies`)** | **62** | Strict owner isolation & 5-role staff scoping; zero direct client `INSERT`/`UPDATE`/`DELETE` policies |

---

## 3. Complete 40-Table Matrix

| Module | Tables (40 Total) |
| :--- | :--- |
| **A. User Management & RBAC (4)** | `account_statuses`, `profiles`, `user_roles`, `user_sessions` |
| **B. Wallet Management (3)** | `wallets`, `wallet_accounts`, `wallet_balances` |
| **C. Financial Subledger (4)** | `financial_periods`, `ledger_accounts`, `journal_entries`, `journal_lines` |
| **D. Transactions & Settlement (6)** | `transactions`, `transaction_references`, `transaction_fees`, `deposits`, `withdrawal_batches`, `withdrawals` |
| **E. Configurable Tax Engine (2)** | `tax_rules`, `tax_applications` |
| **F. Investment Management (5)** | `investment_plans`, `investments`, `investment_allocations`, `investment_payouts`, `investment_maturities` |
| **G. Referral Management (3)** | `referral_settings`, `referrals`, `referral_commissions` |
| **H. KYC & Compliance (4)** | `kyc_records`, `kyc_documents`, `kyc_reviews`, `compliance_events` |
| **I. Notifications (2)** | `notifications`, `notification_preferences` |
| **J. Administration & Governance (3)** | `platform_settings`, `audit_logs`, `admin_actions` |
| **K. Payment Audit (4)** | `payment_providers`, `payment_references`, `payment_events`, `webhook_logs` |

---

## 4. Database Roles & Privilege Summary

- **Supabase Runtime Roles**: `anon` (only `SELECT` on active/paused `investment_plans`), `authenticated` (read-only `SELECT` strictly filtered by 62 RLS policies + `EXECUTE` strictly on 34 approved client/staff RPCs; zero direct table `INSERT`/`UPDATE`/`DELETE`), `service_role` (backend Edge Functions & workers).
- **Custom Internal NOLOGIN Roles**:
  - `silver_spoon_treasury_worker` — restricted `EXECUTE` on `internal_provision_investor_wallet`, `settle_verified_deposit`, `settle_withdrawal`, `fail_or_decline_withdrawal`, `reconcile_wallet_balance`.
  - `silver_spoon_reconciler` — restricted `EXECUTE` on `reconcile_wallet_balance`.
- **Internal Functions Blocked from `PUBLIC`, `anon`, and `authenticated`**: `internal_assert_service_caller`, `internal_get_open_period_id`, `internal_get_system_account_id`, `internal_provision_investor_wallet`, `internal_post_journal_entry`, `internal_write_audit_log`, `settle_verified_deposit`, `settle_withdrawal`.

---

## 5. Issues Discovered & Resolved During Migration Execution

1. **Extension Availability Guard (`20261123000100_extensions_and_enums.sql`)**
   - *Finding*: Unconditional `CREATE EXTENSION IF NOT EXISTS pgcrypto` failed on minimal PostgreSQL distributions lacking the optional `pgcrypto` contrib package, even though PostgreSQL 15+ provides `gen_random_uuid()` natively in `pg_catalog`.
   - *Resolution*: Wrapped `CREATE EXTENSION IF NOT EXISTS pgcrypto` in an `IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgcrypto')` block so Supabase Staging automatically installs `pgcrypto` while minimal PostgreSQL test runtimes succeed cleanly.
2. **Shared Constraint Trigger Record Field Resolution (`20261123000400_financial_ledger.sql`)**
   - *Finding*: In `assert_journal_entry_balanced()`, PL/pgSQL statically binds every field referenced inside a `CASE` expression against `NEW`, raising `record "new" has no field "journal_entry_id"` when triggered from `journal_entries`.
   - *Resolution*: Replaced the `CASE` lookup with `COALESCE(NULLIF(to_jsonb(NEW) ->> 'journal_entry_id', '')::UUID, (to_jsonb(NEW) ->> 'id')::UUID)` so the shared deferred constraint trigger executes cleanly on both `journal_entries` and `journal_lines`.
3. **Defensive Self-Maturity Guard (`20261123001000_financial_rpcs_and_reconciliation.sql`)**
   - *Finding*: During security review of `mature_investment()`, added an explicit check preventing any dual-role staff member from processing maturity on their own investment (`v_caller_id = v_inv.user_id`).
   - *Resolution*: Added `FOUR_EYES_VIOLATION` guard directly inside `mature_investment()`.

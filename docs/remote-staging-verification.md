# SILVER SPOON — Phase B.5 Remote Staging Verification Workbook (Supabase SQL Editor)

**Verification Phase**: Phase B.5 — Remote Non-Production Database Verification  
**Target Environment**: Connected SILVER SPOON Supabase Staging Project (PostgreSQL 15+)  
**Active Frontend Provider**: `VITE_DATA_PROVIDER=mock` (unchanged; Phase C not started)  
**Migration Baseline**: Migrations `20261123000100` through `20261123001400` (14 frozen forward-only migrations — **unmodified**)  
**Safety Guarantee**: Every SQL query in this document is **100% READ-ONLY (`SELECT` only)**. Zero migrations are created or modified, zero database objects are altered, and zero secret keys, service-role keys, or passwords are requested or referenced.

> **Honesty & Evidence Boundary**
> - **Confirmed Remotely So Far**: Migration history confirmation provided by the operator showing all **14 migrations (`20261123000100`–`20261123001400`)** present on the remote Supabase project (**Check 0: PASS**).
> - **Not Yet Executed Remotely**: Checks **1 through 11** have **NOT** been executed against the remote Supabase database. Their current status is **`NEEDS INVESTIGATION` (awaiting manual Supabase SQL Editor output)**. No remote check is marked `PASS` without actual remote query results.

---

## 1. Architecture Baseline Reconciliation (Local Reference Documents)

Before comparing remote query results, note the chronological progression across the five reference documents so expected counts are evaluated against the authoritative post-Migration `0014` state:

| Reference Document | Schema Snapshot Covered | Key Expected Counts |
| :--- | :--- | :--- |
| `docs/database-architecture.md` | Phase B design & 12-migration core schema | 40 tables, 3 disjoint customer sub-ledgers, deferred journal balancing, forced RLS, append-only audit/ledger |
| `docs/phase-b-migration-report.md` | Post-Migration `0013` (13 migrations) | 40 tables, 149 indexes, 691 constraints, 24 triggers, **47 functions (43 `SECURITY DEFINER` + 4 triggers)**, 63 RLS policies |
| `docs/phase-b-test-report.md` | Post-Migration `0013` local PGlite (`24/24`) | 40/40 forced RLS, **43/43 `SECURITY DEFINER`** pinned `search_path = public, pg_temp`, 63 policies |
| `docs/security-architecture.md` | Post-Migration `0013` security architecture | 5-role RBAC (`public.user_roles`), universal four-eyes, `REVOKE CREATE ON SCHEMA public`, active-only `anon` plan visibility, `payment_providers.is_enabled = false` |
| `docs/phase-b5-final-security-audit.md` *(Authoritative Target)* | **Post-Migration `0014` (14 migrations, `28/28` local PGlite)** | **40 tables**, **20 enums**, **149 indexes**, **691 constraints**, **24 triggers**, **48 functions (44 `SECURITY DEFINER` + 4 triggers)**, **63 RLS policies**, **7 `internal_*` primitives revoked even from `service_role`**, `silver_spoon_reconciler` isolated to 1 RPC |

*Why functions increased from 47 → 48 (43 → 44 `SECURITY DEFINER`)*: Forward-only Migration `0014` added `public.internal_is_reconciler_caller()` (`SECURITY DEFINER`) to separate `silver_spoon_reconciler` from `public.internal_is_service_caller()`. Because your remote project confirms all **14 migrations (`0001`–`0014`)**, every remote verification check below targets the **post-Migration `0014`** baseline.

---

## 2. Current Remote Verification Status Scorecard

| Check | Verification Area | Authoritative Expected Baseline (Post-M0014) | Current Remote Status | Basis |
| :---: | :--- | :--- | :---: | :--- |
| **0** | Remote Migration History (`0001`–`0014`) | 14 migrations (`20261123000100`..`20261123001400`) | **PASS** | Confirmed by operator's remote migration history query |
| **1** | 40 Expected Public Tables | Exact 40 tables across Modules A–K (`0` missing, `0` unexpected) | **NEEDS INVESTIGATION** | Pending manual SQL Editor execution of Query 1 |
| **2** | `ENABLE` + `FORCE ROW LEVEL SECURITY` | `40 / 40` tables with `relrowsecurity = true` AND `relforcerowsecurity = true` | **NEEDS INVESTIGATION** | Pending manual SQL Editor execution of Query 2 |
| **3** | 63 Expected RLS Policies | `63` `SELECT`-only policies across `40` tables; active-only `anon` plan policy; strict KYC isolation | **NEEDS INVESTIGATION** | Pending manual SQL Editor execution of Query 3 |
| **4** | 48 Expected Database Functions | `48` functions (`44` `SECURITY DEFINER` + `4` invoker triggers), `0` missing | **NEEDS INVESTIGATION** | Pending manual SQL Editor execution of Query 4 |
| **5** | `SECURITY DEFINER` Ownership & `search_path` | `44 / 44` `SECURITY DEFINER` (and `48 / 48` total) pin `search_path=public, pg_temp`; safe owner | **NEEDS INVESTIGATION** | Pending manual SQL Editor execution of Query 5 |
| **6** | Internal Primitive Privilege Lockdown | All `7` `internal_*` primitives have `EXECUTE = false` for `PUBLIC`, `anon`, `authenticated`, `service_role`, `silver_spoon_treasury_worker`, `silver_spoon_reconciler` | **NEEDS INVESTIGATION** | Pending manual SQL Editor execution of Query 6 |
| **7** | Zero `anon` & `PUBLIC` Function Grants | `0 / 48` functions executable by `anon` or `PUBLIC` | **NEEDS INVESTIGATION** | Pending manual SQL Editor execution of Query 7 |
| **8** | Schema `public` `CREATE` Restrictions | `CREATE = false` for `PUBLIC`, `anon`, `authenticated`, `silver_spoon_reconciler`, `silver_spoon_treasury_worker` | **NEEDS INVESTIGATION** | Pending manual SQL Editor execution of Query 8 |
| **9** | Financial RPC Role Permissions & Role Graph | Exact `authenticated` (34), `treasury_worker` (5), `reconciler` (1) grants; settlement RPCs blocked for `anon`/`authenticated`/`reconciler`; safe `pg_auth_members`; `0` client table DML grants | **NEEDS INVESTIGATION** | Pending manual SQL Editor execution of Query 9 |
| **10** | Withdrawal, Deposit & Ledger Safeguards | Paystack disabled (no DVA); 9 system accounts; open period; four-eyes/daily-cap/decline/idempotency/expiry guards live; `0` unbalanced journals; `0` drifted wallets; `0` JWT metadata reads | **NEEDS INVESTIGATION** | Pending manual SQL Editor execution of Query 10 |
| **11** | Triggers, Indexes, Constraints & Object Inventory | `20` enums, `24` user triggers, `149` indexes, `691` constraints (note PG version nuance), `2` custom `NOLOGIN` roles | **NEEDS INVESTIGATION** | Pending manual SQL Editor execution of Query 11 |

---

## 3. Manual Read-Only SQL Verification Queries (Supabase SQL Editor)

Run each query block independently in the **Supabase SQL Editor** against your staging project. All queries are strictly read-only (`SELECT` only). Paste the query results back to update each check from `NEEDS INVESTIGATION` to `PASS` or `FAIL`.

---

### Check 0 — Optional Audit Snapshot: Remote Migration History & PostgreSQL Environment
**Current Status**: **PASS** *(operator confirmed `20261123000100`–`20261123001400`; run to record PostgreSQL version & extension placement for the audit log)*

```sql
-- QUERY 0A: PostgreSQL version, session role, and installed extensions
SELECT
  current_database() AS database_name,
  current_user AS effective_user,
  session_user AS connected_user,
  current_setting('server_version') AS pg_version,
  current_setting('server_version_num')::INT AS pg_version_num,
  (SELECT string_agg(e.extname || '@' || e.extversion || ' (' || n.nspname || ')', ', ' ORDER BY e.extname)
   FROM pg_extension e
   JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname IN ('pgcrypto', 'plpgsql', 'uuid-ossp', 'pg_stat_statements')) AS relevant_extensions;

-- QUERY 0B: Confirm exact 14 migration versions in Supabase migration history
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
```

- **PASS**: `pg_version_num >= 150000` and all 14 versions `20261123000100` through `20261123001400` appear in order.
- **FAIL**: `pg_version_num < 150000` or any of the 14 migrations is missing.

---

### Check 1 — Verify All 40 Expected Public Tables Exist
**Current Status**: **NEEDS INVESTIGATION**

```sql
-- QUERY 1: Exact diff between the 40 expected tables and remote public schema tables
WITH expected_tables(table_name) AS (
  VALUES
    -- Module A: User Management (4)
    ('account_statuses'), ('profiles'), ('user_roles'), ('user_sessions'),
    -- Module B: Wallets (3)
    ('wallets'), ('wallet_accounts'), ('wallet_balances'),
    -- Module C: Financial Ledger (4)
    ('financial_periods'), ('ledger_accounts'), ('journal_entries'), ('journal_lines'),
    -- Module D: Transactions & Treasury Settlement (6)
    ('transactions'), ('transaction_references'), ('transaction_fees'),
    ('deposits'), ('withdrawal_batches'), ('withdrawals'),
    -- Module E: Tax Engine (2)
    ('tax_rules'), ('tax_applications'),
    -- Module F: Investments (5)
    ('investment_plans'), ('investments'), ('investment_allocations'),
    ('investment_payouts'), ('investment_maturities'),
    -- Module G: Referrals (3)
    ('referral_settings'), ('referrals'), ('referral_commissions'),
    -- Module H: KYC & Compliance (4)
    ('kyc_records'), ('kyc_documents'), ('kyc_reviews'), ('compliance_events'),
    -- Module I: Notifications (2)
    ('notifications'), ('notification_preferences'),
    -- Module J: Governance & Audit (3)
    ('platform_settings'), ('audit_logs'), ('admin_actions'),
    -- Module K: Payment Integration (4)
    ('payment_providers'), ('payment_references'), ('payment_events'), ('webhook_logs')
),
actual_tables AS (
  SELECT c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
)
SELECT
  (SELECT COUNT(*) FROM actual_tables) AS actual_table_count,
  (SELECT COUNT(*) FROM expected_tables) AS expected_table_count,
  COALESCE(
    (SELECT array_agg(e.table_name ORDER BY e.table_name)
     FROM expected_tables e
     LEFT JOIN actual_tables a ON a.table_name = e.table_name
     WHERE a.table_name IS NULL),
    ARRAY[]::TEXT[]
  ) AS missing_tables,
  COALESCE(
    (SELECT array_agg(a.table_name ORDER BY a.table_name)
     FROM actual_tables a
     LEFT JOIN expected_tables e ON e.table_name = a.table_name
     WHERE e.table_name IS NULL),
    ARRAY[]::TEXT[]
  ) AS unexpected_tables;
```

- **PASS**: `actual_table_count = 40`, `missing_tables = {}`, `unexpected_tables = {}`.
- **FAIL**: Any table in `missing_tables`.
- **NEEDS INVESTIGATION**: Any table in `unexpected_tables` (confirm whether it is a leftover pre-existing table from an older schema or platform extension).

---

### Check 2 — Verify `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on All 40 Tables
**Current Status**: **NEEDS INVESTIGATION**

```sql
-- QUERY 2A: Summary of RLS + FORCE RLS and table ownership across public schema
SELECT
  COUNT(*) AS total_public_tables,
  COUNT(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled_count,
  COUNT(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity) AS rls_forced_count,
  COUNT(*) FILTER (WHERE pg_get_userbyid(c.relowner) IN ('anon', 'authenticated', 'service_role')) AS unsafe_owner_count,
  array_agg(DISTINCT pg_get_userbyid(c.relowner)) AS table_owners
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';

-- QUERY 2B: List any table missing ENABLE RLS, FORCE RLS, or safe ownership (Expected: 0 rows)
SELECT
  c.relname AS table_name,
  pg_get_userbyid(c.relowner) AS owner_role,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND (
    NOT c.relrowsecurity
    OR NOT c.relforcerowsecurity
    OR pg_get_userbyid(c.relowner) IN ('anon', 'authenticated', 'service_role')
  )
ORDER BY c.relname;
```

- **PASS**: `total_public_tables = 40`, `rls_enabled_count = 40`, `rls_forced_count = 40`, `unsafe_owner_count = 0`, and Query 2B returns `0` rows.
- **FAIL**: Any table missing `rls_enabled` or `rls_forced`, or owned by `anon`/`authenticated`/`service_role`.

---

### Check 3 — Verify All 63 Expected RLS Policies Exist & Enforce Intended Visibility
**Current Status**: **NEEDS INVESTIGATION**

```sql
-- QUERY 3A: Policy summary across public schema
SELECT
  COUNT(*) AS total_rls_policies,
  COUNT(DISTINCT tablename) AS tables_covered,
  COUNT(*) FILTER (WHERE cmd <> 'SELECT') AS non_select_policies,
  COUNT(*) FILTER (WHERE qual ~* '(user_metadata|app_metadata|raw_user_meta_data|raw_app_meta_data)') AS jwt_metadata_policies
FROM pg_policies
WHERE schemaname = 'public';

-- QUERY 3B: Inspect high-sensitivity RLS policies (plan visibility, KYC, ledger, batches, payments, RBAC)
SELECT
  tablename,
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'investment_plans', 'kyc_records', 'kyc_documents', 'kyc_reviews',
    'compliance_events', 'user_roles', 'journal_entries', 'journal_lines',
    'withdrawal_batches', 'payment_providers', 'webhook_logs', 'audit_logs'
  )
ORDER BY tablename, policyname;

-- QUERY 3C: Confirm zero tables have 0 RLS policies (Expected: 0 rows)
SELECT c.relname AS table_without_policy
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  )
ORDER BY c.relname;
```

- **PASS**: `total_rls_policies = 63`, `tables_covered = 40`, `non_select_policies = 0`, `jwt_metadata_policies = 0`, Query 3C returns `0` rows, `rls_investment_plans_select_anon` filters `(status = 'active'::plan_status_enum)`, and `kyc_*` / `compliance_events` restrict staff reads strictly to `compliance_officer` and `super_admin`.
- **FAIL**: Missing policies, any non-`SELECT` client policy, `anon` seeing paused/archived plans, or `finance_officer`/`admin` permitted to read `kyc_*`.

---

### Check 4 — Verify All 48 Expected Database Functions Exist
**Current Status**: **NEEDS INVESTIGATION**

```sql
-- QUERY 4: Exact diff between the 48 expected functions (Post-M0014) and remote public functions
WITH expected_functions(proname, expected_secdef) AS (
  VALUES
    -- 4 Invoker Trigger Functions
    ('assert_journal_entry_balanced', false),
    ('guard_tax_applications_immutability', false),
    ('prevent_immutable_mutation', false),
    ('set_updated_at', false),
    -- 7 Locked-Down Internal Primitives
    ('internal_assert_service_caller', true),
    ('internal_get_open_period_id', true),
    ('internal_get_system_account_id', true),
    ('internal_is_reconciler_caller', true),
    ('internal_is_service_caller', true),
    ('internal_post_journal_entry', true),
    ('internal_write_audit_log', true),
    -- 3 Backend-Only Settlement / Provisioning RPCs
    ('internal_provision_investor_wallet', true),
    ('settle_verified_deposit', true),
    ('settle_withdrawal', true),
    -- 34 Authenticated-Callable RPCs (RBAC, Tax, Financial, Governance, Profile/KYC)
    ('app_account_can_transact', true),
    ('app_has_any_role', true),
    ('app_has_role', true),
    ('app_is_staff', true),
    ('approve_and_distribute_investment_payout', true),
    ('approve_and_post_manual_adjustment', true),
    ('approve_and_post_reversal', true),
    ('approve_bank_account_change', true),
    ('approve_platform_setting_change', true),
    ('approve_role_change', true),
    ('approve_tax_rule_change', true),
    ('approve_withdrawal_batch_four_eyes', true),
    ('approve_withdrawal_four_eyes', true),
    ('create_investment', true),
    ('create_withdrawal_batch', true),
    ('fail_or_decline_withdrawal', true),
    ('initialize_deposit', true),
    ('mark_notification_read', true),
    ('mature_investment', true),
    ('reconcile_wallet_balance', true),
    ('request_bank_account_change', true),
    ('request_manual_ledger_adjustment', true),
    ('request_platform_setting_change', true),
    ('request_realized_return_distribution', true),
    ('request_role_change', true),
    ('request_tax_rule_change', true),
    ('request_transaction_reversal', true),
    ('request_withdrawal', true),
    ('resolve_applicable_tax_rule', true),
    ('review_kyc_record', true),
    ('set_investment_plan_status', true),
    ('submit_kyc_record', true),
    ('update_investment_rollover_mode', true),
    ('update_own_profile', true)
),
actual_functions AS (
  SELECT p.proname, p.prosecdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.objid = p.oid AND d.deptype = 'e'
    ) -- excludes extension-owned functions if pgcrypto were installed in public
)
SELECT
  (SELECT COUNT(*) FROM actual_functions) AS actual_app_function_count,
  (SELECT COUNT(*) FROM actual_functions WHERE prosecdef) AS actual_secdef_count,
  COALESCE(
    (SELECT array_agg(e.proname ORDER BY e.proname)
     FROM expected_functions e
     LEFT JOIN actual_functions a ON a.proname = e.proname
     WHERE a.proname IS NULL),
    ARRAY[]::TEXT[]
  ) AS missing_functions,
  COALESCE(
    (SELECT array_agg(a.proname ORDER BY a.proname)
     FROM actual_functions a
     LEFT JOIN expected_functions e ON e.proname = a.proname
     WHERE e.proname IS NULL),
    ARRAY[]::TEXT[]
  ) AS unexpected_app_functions,
  COALESCE(
    (SELECT array_agg(e.proname ORDER BY e.proname)
     FROM expected_functions e
     JOIN actual_functions a ON a.proname = e.proname
     WHERE a.prosecdef <> e.expected_secdef),
    ARRAY[]::TEXT[]
  ) AS secdef_mismatches;
```

- **PASS**: `actual_app_function_count = 48`, `actual_secdef_count = 44`, `missing_functions = {}`, `unexpected_app_functions = {}`, `secdef_mismatches = {}`.
- **FAIL**: Any function missing or any `secdef_mismatches`.
- **NEEDS INVESTIGATION**: Any non-extension function in `unexpected_app_functions` (check for stale legacy functions in `public`).

---

### Check 5 — Verify All 44 `SECURITY DEFINER` Functions Pin `search_path = public, pg_temp` & Safe Ownership
**Current Status**: **NEEDS INVESTIGATION**

```sql
-- QUERY 5A: Summary of search_path pinning and ownership across all app functions
WITH app_procs AS (
  SELECT p.oid, p.proname, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) AS owner_role
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
)
SELECT
  COUNT(*) AS total_app_functions,
  COUNT(*) FILTER (WHERE prosecdef) AS secdef_count,
  COUNT(*) FILTER (WHERE prosecdef AND proconfig IS NOT NULL AND 'search_path=public, pg_temp' = ANY(proconfig)) AS secdef_pinned_count,
  COUNT(*) FILTER (WHERE proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY(proconfig))) AS any_unpinned_count,
  COUNT(*) FILTER (WHERE owner_role IN ('anon', 'authenticated', 'service_role')) AS unsafe_owner_count,
  array_agg(DISTINCT owner_role) AS distinct_owners
FROM app_procs;

-- QUERY 5B: List any function missing pinned search_path or owned by an unsafe role (Expected: 0 rows)
SELECT
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS owner_role,
  p.prosecdef AS is_security_definer,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  AND (
    p.proconfig IS NULL
    OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig))
    OR pg_get_userbyid(p.proowner) IN ('anon', 'authenticated', 'service_role')
  )
ORDER BY p.proname;
```

- **PASS**: `secdef_count = 44`, `secdef_pinned_count = 44`, `any_unpinned_count = 0`, `unsafe_owner_count = 0`, all owners are `postgres` / `supabase_admin`, and Query 5B returns `0` rows.
- **FAIL**: Any `SECURITY DEFINER` function missing `search_path=public, pg_temp` or owned by `anon`/`authenticated`/`service_role`.

---

### Check 6 — Verify Internal Primitive Execution Privileges Are Restricted
**Current Status**: **NEEDS INVESTIGATION**

```sql
-- QUERY 6: Inspect EXECUTE privileges on all 7 low-level internal_* primitives
SELECT
  p.proname AS internal_primitive,
  has_function_privilege('public', p.oid, 'EXECUTE') AS pub_exec,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_exec,
  has_function_privilege('silver_spoon_treasury_worker', p.oid, 'EXECUTE') AS treasury_worker_exec,
  has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE') AS reconciler_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'internal_is_service_caller',
    'internal_is_reconciler_caller',
    'internal_assert_service_caller',
    'internal_get_open_period_id',
    'internal_get_system_account_id',
    'internal_post_journal_entry',
    'internal_write_audit_log'
  )
ORDER BY p.proname;
```

- **PASS**: Exactly `7` rows returned, and **all 6 boolean columns are `false`** on every single row (even `service_role_exec = false`).
- **FAIL**: Fewer than `7` rows or **any** `true` value in any column.

---

### Check 7 — Verify Anonymous (`anon`) & `PUBLIC` Have Zero `EXECUTE` Privileges Across All Application Functions
**Current Status**: **NEEDS INVESTIGATION**

```sql
-- QUERY 7A: Count of application functions executable by anon or PUBLIC (Expected: 0, 0)
SELECT
  COUNT(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')) AS anon_executable_app_functions,
  COUNT(*) FILTER (WHERE has_function_privilege('public', p.oid, 'EXECUTE')) AS public_executable_app_functions
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');

-- QUERY 7B: List any application function executable by anon or PUBLIC (Expected: 0 rows)
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  AND (
    has_function_privilege('anon', p.oid, 'EXECUTE')
    OR has_function_privilege('public', p.oid, 'EXECUTE')
  )
ORDER BY p.proname;
```

- **PASS**: `anon_executable_app_functions = 0`, `public_executable_app_functions = 0`, and Query 7B returns `0` rows.
- **FAIL**: Any application function executable by `anon` or `PUBLIC`.

---

### Check 8 — Verify Schema `public` `CREATE` Privileges Are Restricted
**Current Status**: **NEEDS INVESTIGATION**

```sql
-- QUERY 8A: Schema public USAGE & CREATE privileges for PUBLIC and application/worker roles
SELECT
  role_name,
  has_schema_privilege(role_name, 'public', 'USAGE') AS has_usage,
  has_schema_privilege(role_name, 'public', 'CREATE') AS has_create
FROM (
  VALUES
    ('public'),
    ('anon'),
    ('authenticated'),
    ('service_role'),
    ('silver_spoon_treasury_worker'),
    ('silver_spoon_reconciler')
) AS r(role_name);

-- QUERY 8B: Inspect pg_default_acl entries on schema public
SELECT
  pg_get_userbyid(d.defaclrole) AS granting_role,
  CASE d.defaclobjtype
    WHEN 'r' THEN 'TABLES'
    WHEN 'S' THEN 'SEQUENCES'
    WHEN 'f' THEN 'FUNCTIONS'
    WHEN 'T' THEN 'TYPES'
    ELSE d.defaclobjtype::TEXT
  END AS object_type,
  d.defaclacl::TEXT AS default_acl
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public'
ORDER BY granting_role, object_type;
```

- **PASS**: `has_create = false` for `public`, `anon`, `authenticated`, `silver_spoon_treasury_worker`, and `silver_spoon_reconciler`; `has_usage = true` for `anon`, `authenticated`, `service_role`, `silver_spoon_treasury_worker`, and `silver_spoon_reconciler`.
- **FAIL**: `has_create = true` for `public`, `anon`, `authenticated`, `silver_spoon_treasury_worker`, or `silver_spoon_reconciler`.
- **NEEDS INVESTIGATION**: If `pg_default_acl` still shows hosted Supabase's default `GRANT ALL ON FUNCTIONS TO ... anon, authenticated, service_role` for `postgres`, note it so any future forward-only migrations (`0015+`) always include explicit `REVOKE ALL` statements.

---

### Check 9 — Verify Financial RPC Permissions, Client Table Grants & Role Separation Graph
**Current Status**: **NEEDS INVESTIGATION**

```sql
-- QUERY 9A: Full EXECUTE matrix across all 48 app functions (counts per role)
WITH app_procs AS (
  SELECT p.oid, p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
)
SELECT
  COUNT(*) FILTER (WHERE has_function_privilege('authenticated', oid, 'EXECUTE')) AS authenticated_exec_count,
  COUNT(*) FILTER (WHERE has_function_privilege('service_role', oid, 'EXECUTE')) AS service_role_exec_count,
  COUNT(*) FILTER (WHERE has_function_privilege('silver_spoon_treasury_worker', oid, 'EXECUTE')) AS treasury_worker_exec_count,
  COUNT(*) FILTER (WHERE has_function_privilege('silver_spoon_reconciler', oid, 'EXECUTE')) AS reconciler_exec_count,
  array_agg(proname ORDER BY proname) FILTER (WHERE has_function_privilege('silver_spoon_treasury_worker', oid, 'EXECUTE')) AS treasury_worker_fns,
  array_agg(proname ORDER BY proname) FILTER (WHERE has_function_privilege('silver_spoon_reconciler', oid, 'EXECUTE')) AS reconciler_fns
FROM app_procs;

-- QUERY 9B: Verify settlement RPCs are strictly blocked for anon, authenticated, and reconciler
SELECT
  p.proname AS settlement_rpc,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE') AS reconciler_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_exec,
  has_function_privilege('silver_spoon_treasury_worker', p.oid, 'EXECUTE') AS treasury_worker_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'internal_provision_investor_wallet',
    'settle_verified_deposit',
    'settle_withdrawal',
    'fail_or_decline_withdrawal',
    'reconcile_wallet_balance'
  )
ORDER BY p.proname;

-- QUERY 9C: Verify zero direct table DML grants for PUBLIC/anon/authenticated, and anon SELECT on investment_plans ONLY
SELECT
  'forbidden_dml_grants' AS check_type,
  COUNT(*) AS row_count,
  COALESCE(array_agg(grantee || ':' || table_name || ':' || privilege_type ORDER BY grantee, table_name), ARRAY[]::TEXT[]) AS details
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
UNION ALL
SELECT
  'anon_table_grants' AS check_type,
  COUNT(*) AS row_count,
  COALESCE(array_agg(table_name || ':' || privilege_type ORDER BY table_name), ARRAY[]::TEXT[]) AS details
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon';

-- QUERY 9D: Inspect role attributes & pg_auth_members for privileged backend roles
SELECT
  rolname,
  rolsuper,
  rolcreaterole,
  rolcanlogin,
  rolbypassrls
FROM pg_roles
WHERE rolname IN (
  'anon', 'authenticated', 'authenticator', 'service_role',
  'silver_spoon_treasury_worker', 'silver_spoon_reconciler',
  'postgres', 'supabase_admin'
)
ORDER BY rolname;

SELECT
  parent.rolname AS granted_role,
  member.rolname AS member_role,
  m.admin_option
FROM pg_auth_members m
JOIN pg_roles parent ON parent.oid = m.roleid
JOIN pg_roles member ON member.oid = m.member
WHERE parent.rolname IN (
  'service_role', 'silver_spoon_treasury_worker', 'silver_spoon_reconciler',
  'postgres', 'supabase_admin'
)
ORDER BY parent.rolname, member.rolname;
```

- **PASS**:
  - `authenticated_exec_count = 34`, `treasury_worker_exec_count = 5` (`fail_or_decline_withdrawal`, `internal_provision_investor_wallet`, `reconcile_wallet_balance`, `settle_verified_deposit`, `settle_withdrawal`), `reconciler_exec_count = 1` (`reconcile_wallet_balance` ONLY).
  - `internal_provision_investor_wallet`, `settle_verified_deposit`, and `settle_withdrawal` have `anon_exec = false`, `auth_exec = false`, `reconciler_exec = false`, `service_role_exec = true`, `treasury_worker_exec = true`.
  - `forbidden_dml_grants = 0`, `anon_table_grants = 1` (`investment_plans:SELECT`).
  - `anon`, `authenticated`, `silver_spoon_treasury_worker`, and `silver_spoon_reconciler` all have `rolsuper = false`, `rolbypassrls = false`, `rolcanlogin = false`, and none of `anon`/`authenticated`/`silver_spoon_reconciler` appear as members of `service_role`, `silver_spoon_treasury_worker`, `postgres`, or `supabase_admin`.
- **NEEDS INVESTIGATION**: On hosted Supabase, `service_role_exec_count` may exceed `5` (up to `39` or `41`) if hosted Supabase default privileges granted `service_role` `EXECUTE` on `authenticated`-facing RPCs created in `0001`–`0011`. As long as Check 6 confirms all `7` `internal_*` primitives are `false` for `service_role` (and `authenticated`-facing RPCs require `auth.uid()`), note this finding cleanly for review.
- **FAIL**: `authenticated` can execute any settlement/internal RPC, `silver_spoon_reconciler` can execute anything besides `reconcile_wallet_balance`, any client DML table grant exists, or any unprivileged role is a member of `service_role` / `silver_spoon_treasury_worker`.

---

### Check 10 — Verify Withdrawal, Deposit & Ledger Safeguards Are Present
**Current Status**: **NEEDS INVESTIGATION**

```sql
-- QUERY 10A: Payment providers (Paystack disabled, DVAs excluded), system ledger accounts, open periods & withdrawal settings
SELECT 'payment_providers' AS check_name,
  code || ' | enabled=' || is_enabled::TEXT || ' | channels=' || array_to_string(allowed_channels, ',') AS detail
FROM public.payment_providers
UNION ALL
SELECT 'active_system_ledger_accounts',
  COUNT(*)::TEXT || ' active system accounts (expected 9)'
FROM public.ledger_accounts WHERE is_system = true AND is_active = true
UNION ALL
SELECT 'open_financial_periods',
  COUNT(*)::TEXT || ' open period(s) (expected >= 1)'
FROM public.financial_periods WHERE status = 'open'
UNION ALL
SELECT 'critical_platform_settings',
  COALESCE(string_agg(key, ', ' ORDER BY key), 'NONE')
FROM public.platform_settings
WHERE key IN (
  'withdrawal.daily_limit_tier2_kobo',
  'withdrawal.daily_limit_tier3_kobo',
  'withdrawal.four_eyes_required_all',
  'withdrawal.settlement_mode'
);

-- QUERY 10B: Verify Migration 0014 security & financial guardrails are active in live function definitions
SELECT
  p.proname AS function_name,
  CASE p.proname
    WHEN 'internal_is_service_caller' THEN
      (p.prosrc LIKE '%current_setting(''role'', true)%'
       AND p.prosrc LIKE '%request.jwt.claims%'
       AND p.prosrc LIKE '%v_jwt_sub IS NOT NULL%')
    WHEN 'fail_or_decline_withdrawal' THEN
      (p.prosrc LIKE '%INVALID_DECLINE_STATE%'
       AND p.prosrc LIKE '%VERIFIED_FAILURE_SERVICE_REQUIRED%')
    WHEN 'request_withdrawal' THEN
      (p.prosrc LIKE '%can_withdraw%'
       AND p.prosrc LIKE '%DAILY_WITHDRAWAL_LIMIT_EXCEEDED%'
       AND p.prosrc LIKE '%INVALID_IDEMPOTENCY_KEY%')
    WHEN 'initialize_deposit' THEN
      (p.prosrc LIKE '%user_id = v_user_id%'
       AND p.prosrc LIKE '%INVALID_IDEMPOTENCY_KEY%')
    WHEN 'create_investment' THEN
      (p.prosrc LIKE '%FOR SHARE%')
    WHEN 'approve_withdrawal_four_eyes' THEN
      (p.prosrc LIKE '%ACTION_EXPIRED%')
    WHEN 'internal_post_journal_entry' THEN
      (p.prosrc LIKE '%is_active%')
    ELSE true
  END AS m0014_guard_present,
  (p.prosrc ~* '(user_metadata|app_metadata|raw_user_meta_data|raw_app_meta_data)') AS reads_jwt_metadata
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'internal_is_service_caller',
    'fail_or_decline_withdrawal',
    'request_withdrawal',
    'initialize_deposit',
    'create_investment',
    'approve_withdrawal_four_eyes',
    'internal_post_journal_entry'
  )
ORDER BY p.proname;

-- QUERY 10C: Verify zero functions across all 48 read user_metadata/app_metadata
SELECT COUNT(*) AS functions_reading_jwt_metadata
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  AND p.prosrc ~* '(user_metadata|app_metadata|raw_user_meta_data|raw_app_meta_data)';

-- QUERY 10D: Live double-entry invariant check & read-only wallet reconciliation across all rows
WITH unbalanced AS (
  SELECT je.id
  FROM public.journal_entries je
  LEFT JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
  GROUP BY je.id
  HAVING COALESCE(SUM(jl.amount_kobo) FILTER (WHERE jl.direction = 'debit'), 0)
         <> COALESCE(SUM(jl.amount_kobo) FILTER (WHERE jl.direction = 'credit'), 0)
      OR COUNT(jl.id) < 2
),
wallet_drift AS (
  SELECT
    w.id AS wallet_id,
    wb.available_kobo - COALESCE(SUM(CASE WHEN jl.ledger_account_id = w.available_account_id AND jl.direction = 'credit' THEN jl.amount_kobo WHEN jl.ledger_account_id = w.available_account_id AND jl.direction = 'debit' THEN -jl.amount_kobo ELSE 0 END), 0) AS avail_delta,
    wb.reserved_withdrawal_kobo - COALESCE(SUM(CASE WHEN jl.ledger_account_id = w.reserved_account_id AND jl.direction = 'credit' THEN jl.amount_kobo WHEN jl.ledger_account_id = w.reserved_account_id AND jl.direction = 'debit' THEN -jl.amount_kobo ELSE 0 END), 0) AS resv_delta,
    wb.invested_principal_kobo - COALESCE(SUM(CASE WHEN jl.ledger_account_id = w.invested_account_id AND jl.direction = 'credit' THEN jl.amount_kobo WHEN jl.ledger_account_id = w.invested_account_id AND jl.direction = 'debit' THEN -jl.amount_kobo ELSE 0 END), 0) AS inv_delta
  FROM public.wallets w
  JOIN public.wallet_balances wb ON wb.wallet_id = w.id
  LEFT JOIN public.journal_lines jl
    ON jl.ledger_account_id IN (w.available_account_id, w.reserved_account_id, w.invested_account_id)
  GROUP BY w.id, wb.available_kobo, wb.reserved_withdrawal_kobo, wb.invested_principal_kobo
)
SELECT
  (SELECT COUNT(*) FROM public.journal_entries) AS total_journal_entries,
  (SELECT COUNT(*) FROM unbalanced) AS unbalanced_journal_entries,
  (SELECT COUNT(*) FROM wallet_drift) AS total_wallets_checked,
  (SELECT COUNT(*) FROM wallet_drift WHERE avail_delta <> 0 OR resv_delta <> 0 OR inv_delta <> 0) AS drifted_wallets,
  (SELECT COUNT(*) FROM public.profiles WHERE email !~* '\.invalid$') AS non_synthetic_staging_profiles;
```

- **PASS**:
  - `paystack` has `enabled=false` and `channels=paystack_checkout_card,paystack_checkout_bank_transfer` (no DVA); `9` active system ledger accounts; `>= 1` open period; all 4 critical `platform_settings` keys present.
  - All 7 rows in Query 10B show `m0014_guard_present = true` and `reads_jwt_metadata = false`; Query 10C returns `0`.
  - `unbalanced_journal_entries = 0`, `drifted_wallets = 0`, `non_synthetic_staging_profiles = 0`.
- **FAIL**: `paystack` enabled, any `m0014_guard_present = false`, any unbalanced journal, any drifted wallet, or any real customer email present in staging.

---

### Check 11 — Verify Triggers, Indexes, Constraints, Enums & Custom Roles Match Local Audit Inventory
**Current Status**: **NEEDS INVESTIGATION**

```sql
-- QUERY 11A: Complete pg_catalog object inventory vs. local audit baseline
SELECT
  (SELECT COUNT(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e') AS enum_types_count,
  (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r') AS tables_count,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public') AS indexes_count,
  (SELECT COUNT(*) FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace WHERE n.nspname = 'public') AS constraints_total,
  (SELECT COUNT(*) FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace WHERE n.nspname = 'public' AND con.contype <> 'n') AS constraints_excl_not_null,
  (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal) AS triggers_count,
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')) AS app_functions_count,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') AS rls_policies_count,
  (SELECT COUNT(*) FROM pg_roles WHERE rolname IN ('silver_spoon_treasury_worker', 'silver_spoon_reconciler')) AS custom_worker_roles_count;

-- QUERY 11B: List all 24 user triggers (confirming deferred journal balancing + 6 immutability triggers + updated_at triggers)
SELECT
  c.relname AS table_name,
  t.tgname AS trigger_name,
  p.proname AS trigger_function,
  t.tgdeferrable AS is_deferrable,
  t.tginitdeferred AS initially_deferred
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY p.proname, c.relname, t.tgname;

-- QUERY 11C: Breakdown of constraints by type (p=PK, u=UNIQUE, f=FK, c=CHECK, n=NOT NULL on PG18+)
SELECT
  con.contype,
  COUNT(*) AS constraint_count
FROM pg_constraint con
JOIN pg_namespace n ON n.oid = con.connamespace
WHERE n.nspname = 'public'
GROUP BY con.contype
ORDER BY con.contype;
```

- **Local Audit Baseline (`docs/phase-b5-final-security-audit.md`)**:
  - `enum_types_count = 20`
  - `tables_count = 40`
  - `indexes_count = 149`
  - `triggers_count = 24` (including `assert_journal_entry_balanced` with `is_deferrable = true` & `initially_deferred = true`, `prevent_immutable_mutation` on `audit_logs`, `journal_entries`, `journal_lines`, `payment_events`, `webhook_logs`, and `guard_tax_applications_immutability` on `tax_applications`)
  - `app_functions_count = 48`
  - `rls_policies_count = 63`
  - `custom_worker_roles_count = 2`
  - `constraints_total` / `constraints_excl_not_null`: Local PGlite (PostgreSQL 17/18 WASM) reported `691` total constraints (which includes `contype = 'n'` `NOT NULL` catalog constraints on PG 18, whereas PostgreSQL 15/16/17 stores `NOT NULL` in `pg_attribute.attnotnull` rather than `pg_constraint`). Query 11C splits counts by `contype` (`p`, `u`, `f`, `c`, `n`) so PostgreSQL 15/16/17 vs. 18 differences are evaluated accurately without false alarms!
- **PASS**: Exact match on `enums (20)`, `tables (40)`, `indexes (149)`, `triggers (24)` including deferred balancing & immutability triggers, `app_functions (48)`, `rls_policies (63)`, `custom_worker_roles (2)`, and all `p`/`u`/`f`/`c` constraints present.
- **NEEDS INVESTIGATION**: `constraints_total < 691` solely because hosted Supabase runs PostgreSQL 15/16/17 (where `contype = 'n'` rows do not exist in `pg_constraint`) — verify `p`, `u`, `f`, `c` counts via Query 11C.
- **FAIL**: Missing enums, indexes, triggers (especially deferred journal balancing or immutability triggers), `CHECK`/`UNIQUE`/`FK` constraints, or custom worker roles.

---

## 4. Next Step After Executing Queries in Supabase SQL Editor

1. Run **Queries 0 through 11** manually in the **Supabase SQL Editor** (zero modifications will occur).
2. Share the returned query outputs (without any API keys, service-role keys, or database passwords).
3. Each check in Section 2 will then be formally updated to **`PASS`**, **`FAIL`**, or **`NEEDS INVESTIGATION`** based strictly on the observed remote query results before proceeding to live PostgREST JWT tests and two-session concurrency testing (`docs/staging-post-deployment-verification.md`).

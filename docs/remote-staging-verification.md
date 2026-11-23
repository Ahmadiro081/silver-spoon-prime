# SILVER SPOON — Phase B.5 Remote Staging Verification Workbook (Supabase SQL Editor)

**Verification Phase**: Phase B.5 — Remote Non-Production Database Verification  
**Target Environment**: Connected SILVER SPOON Supabase Staging Project (PostgreSQL `17.12`, `server_version_num = 170012`)  
**Active Frontend Provider**: `VITE_DATA_PROVIDER=mock` (unchanged; Phase C not started)  
**Migration Baseline**: Migrations `20261123000100` through `20261123001400` (14 frozen forward-only migrations — **unmodified**)  
**Safety Guarantee**: Every SQL query in this document is **100% READ-ONLY (`SELECT` only)**. Zero migrations are created or modified, zero database objects are altered, and zero secret keys, service-role keys, or passwords are requested or referenced.

> **Honesty & Evidence Boundary (Catalog Checks vs. Runtime Tests & Verbatim Raw Output Availability)**
> - **Confirmed Remotely with Verbatim Raw Outputs Archived in This Document (Catalog Checks Only)**:
>   - **Check 0 (`0A` Environment & `0B` Migration History)**: Query `0A` archived verbatim (`postgres,postgres,postgres,17.12,170012,"pg_stat_statements@1.11 (extensions), pgcrypto@1.3 (extensions), plpgsql@1.0 (pg_catalog), uuid-ossp@1.1 (extensions)"` — PostgreSQL `17.12 >= 15` **PASS**; extensions isolated in `extensions` / `pg_catalog`); all **14 migrations (`20261123000100`–`20261123001400`)** confirmed present (`PASS`).
>   - **Check 1 (40 Tables)**: `40, 40, [], {}` archived verbatim (`PASS`).
>   - **Check 2 (Forced RLS & Ownership)**: `40, 40, 40, 0, {postgres}` archived verbatim (`PASS`).
>   - **Check 3A (RLS Policy Summary)**: `63, 40, 0, 0` archived verbatim (`PASS`).
>   - **Check 4 (Function Inventory)**: `49, 45, [], {rls_auto_enable}, []` archived verbatim — **48 SILVER SPOON application functions** (`44` `SECURITY DEFINER` + `4` invoker triggers) + **1 legitimate PostgreSQL/Supabase infrastructure event-trigger function** (`public.rls_auto_enable`, invoked by enabled event trigger `ensure_rls`, owner `postgres`, `SECURITY DEFINER`, `search_path = pg_catalog`) = **49 total observed** (`PASS`).
>   - **Check 5A (`SECURITY DEFINER` Pinning Summary)**: `49, 45, 44, 1, 0, {postgres}` archived verbatim (`PASS`).
>   - **Check 6 (7 Internal Primitives Lockdown)**: All `7/7` `internal_*` primitives archived verbatim as `false,false,false,false,false,false` across `PUBLIC`, `anon`, `authenticated`, `service_role`, `silver_spoon_treasury_worker`, and `silver_spoon_reconciler` (`PASS`).
> - **Operator-Reviewed Remote Catalog Queries (External Review Recorded — Verbatim Raw CSV Transcripts Not Archived in Repository)**:
>   - The operator confirmed that raw Supabase SQL Editor outputs for **Queries `3B`, `3C`, `5B`, `7A`, `7B`, `8A`, `8B`, `9A`–`9D`, `10A`–`10D`, and `11A`–`11C`** were executed remotely and reviewed in the operator's external review session. Their reconciled statuses are recorded in Section 2.1 below (`3B` preliminary PASS pending helper-function/runtime validation; `3C`, `5B`, `7A`/`7B`, `8A`, `10A` PASS; `8B` PASS WITH OBSERVATION on Supabase-managed default ACLs; `9A`–`9D` assessed including intentional dual-audience RPC grants; `10B`/`10C` PASS at catalog/function inspection level; `10D` PASS WITH RUNTIME LIMITATIONS due to zero populated wallets/journals; `11A`–`11C` PASS at catalog level).
>   - **Raw Evidence Limitation**: Exact verbatim row-by-row raw outputs for Queries `3B`, `3C`, `5B`, `7A`, `7B`, `8A`, `8B`, `9A`–`9D`, `10A`–`10D`, and `11A`–`11C` are **not present in the repository files or this session transcript**. No rows have been reconstructed, interpolated, or fabricated; attach verbatim CSV exports before final Phase B.5 audit sign-off.
> - **Still Pending (Not Executed)**:
>   - **Runtime & Concurrency Suites (0% Executed)**: (1) Synthetic persona seeding, (2) Live PostgREST JWT security tests (`P1`–`P20`), (3) Multi-session row-locking tests (`C1`–`C8`), and (4) Synthetic wallet & journal runtime tests have **NOT** been executed remotely.
> - **Governance Lock & Readiness Statement**: No Migration `0015` created; Migrations `0001`–`0014` unmodified; Paystack remains disabled; `VITE_DATA_PROVIDER=mock` intact; **Phase C remains unauthorized; staging is NOT production-ready**.

---

## 1. Architecture Baseline & Function Inventory Reconciliation

Before comparing remote query results, note the chronological progression across the five reference documents and the hosted PostgreSQL infrastructure classification:

| Reference Document | Schema Snapshot Covered | Key Expected Counts |
| :--- | :--- | :--- |
| `docs/database-architecture.md` | Phase B design & 12-migration core schema | 40 tables, 3 disjoint customer sub-ledgers, deferred journal balancing, forced RLS, append-only audit/ledger |
| `docs/phase-b-migration-report.md` | Post-Migration `0013` (13 migrations) | 40 tables, 149 indexes, 691 constraints, 24 triggers, **47 app functions (43 `SECURITY DEFINER` + 4 triggers)**, 63 RLS policies |
| `docs/phase-b-test-report.md` | Post-Migration `0013` local PGlite (`24/24`) | 40/40 forced RLS, **43/43 app `SECURITY DEFINER`** pinned `search_path = public, pg_temp`, 63 policies |
| `docs/security-architecture.md` | Post-Migration `0013` security architecture | 5-role RBAC (`public.user_roles`), universal four-eyes, `REVOKE CREATE ON SCHEMA public`, active-only `anon` plan visibility, `payment_providers.is_enabled = false` |
| `docs/phase-b5-final-security-audit.md` *(Authoritative App Target)* | **Post-Migration `0014` (14 migrations, `28/28` local PGlite)** | **40 tables**, **20 enums**, **149 indexes**, **691 constraints**, **24 triggers**, **48 app functions (44 `SECURITY DEFINER` + 4 triggers)**, **63 RLS policies**, **7 `internal_*` primitives revoked even from `service_role`**, `silver_spoon_reconciler` isolated to 1 RPC |

### 1.1 Hosted Supabase Function Inventory Classification (48 App + 1 Infrastructure = 49 Total)

| Category | Count | `SECURITY DEFINER` | Expected `search_path` | Owner | Classification Notes |
| :--- | :---: | :---: | :--- | :---: | :--- |
| **SILVER SPOON Application Functions** | **48** | **44** (+ `4` invoker triggers) | `public, pg_temp` (48/48) | `postgres` | Exact Migrations `0001`–`0014` inventory |
| **PostgreSQL / Supabase Infrastructure Event-Trigger Function** | **1** | **1** (`public.rls_auto_enable`) | `pg_catalog` | `postgres` | Invoked by enabled event trigger `ensure_rls`; **excluded from the 48-function application inventory and tracked separately** |
| **Total Observed Non-Extension Functions in `public`** | **49** | **45** | `48` × `public, pg_temp` + `1` × `pg_catalog` | `postgres` | Matches remote Query 4 (`49,45`) and Query 5A (`49,45,44,1,0,{postgres}`) |

### 1.2 Confirmed Expected ACLs for Dual-Audience Financial & Reconciliation RPCs

Read-only security investigation of Migrations `0001`–`0014` confirmed that `authenticated EXECUTE = true` on the two RPCs below is **intentional by design** (explicitly granted in Migration `0012` so `finance_officer` and `super_admin` JWTs can execute authorized workflows without ever holding `service_role`), accepted subject to full remote definition/ACL confirmation:

| Function | `PUBLIC` | `anon` | `authenticated` | `service_role` | `silver_spoon_treasury_worker` | `silver_spoon_reconciler` | Migration Origin & Internal Safeguards |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`public.fail_or_decline_withdrawal`** | `false` | `false` | **`true`** *(intentional)* | `true` | `true` | `false` | **M0012** lines 308 & 339; **M0014** lines 833–950. `SECURITY DEFINER`, `search_path = public, pg_temp`. `'failed'` strictly requires 5-gate `internal_is_service_caller()`; `'declined'` strictly requires independent `finance_officer`/`super_admin` and is blocked once approved/batched (`INVALID_DECLINE_STATE`) or self-owned (`FOUR_EYES_VIOLATION`). |
| **`public.reconcile_wallet_balance`** | `false` | `false` | **`true`** *(intentional)* | `true` | `true` | **`true`** *(sole grant)* | **M0012** lines 318, 340 & 344; **M0014** lines 347–442. `SECURITY DEFINER`, `search_path = public, pg_temp`. Strictly requires `internal_is_reconciler_caller()` OR `finance_officer`/`super_admin`. Never modifies wallet balances or posts financial journals (updates `reconciled_at` or logs drift alert only). |

---

## 2. Current Remote Verification Status Scorecard (Catalog vs. Runtime)

### 2.1 Remote Catalog & Security Configuration Checks

| Check | Verification Area | Authoritative Expected Baseline (Post-M0014 + Hosted) | Current Remote Status | Recorded Evidence, Limitations & Remaining Action |
| :---: | :--- | :--- | :---: | :--- |
| **0** | Remote Migration History (`0001`–`0014`) & PG Environment (`0A`, `0B`) | 14 migrations (`20261123000100`..`20261123001400`) + PG `>= 15` | **PASS** | `0A` verbatim archived: PostgreSQL `17.12` (`170012 >= 150000`), `pg_stat_statements@1.11`, `pgcrypto@1.3`, `uuid-ossp@1.1` in `extensions`, `plpgsql@1.0` in `pg_catalog`; `0B` all 14 migration versions confirmed present |
| **1** | 40 Expected Public Tables | Exact 40 tables (`0` missing, `0` unexpected) | **PASS** | Verbatim output archived: `40, 40, [], {}` |
| **2** | `ENABLE` + `FORCE ROW LEVEL SECURITY` | `40 / 40` tables with `ENABLE` + `FORCE RLS`, safe owner | **PASS** | Verbatim output archived (`2A`): `40, 40, 40, 0, {postgres}` |
| **3** | 63 Expected RLS Policies (`3A`, `3B`, `3C`) | `63` `SELECT`-only policies across `40` tables + verified qualifiers + `0` uncovered tables | **PRELIMINARY PASS (`3A`/`3C` PASS; `3B` PRELIMINARY PASS)** | `3A` verbatim output archived (`63, 40, 0, 0`). `3B` operator-reviewed (**preliminary PASS** pending helper-function and runtime JWT validation); `3C` operator-reviewed (**PASS**). *Raw CSV transcripts for `3B`/`3C` not archived in repo.* |
| **4** | Function Inventory (`48` App + `1` Infra = `49`) | `48` app (`44` `SECURITY DEFINER` + `4` triggers) + `1` infra (`rls_auto_enable`) | **PASS** | Verbatim output archived: `49, 45, [], {rls_auto_enable}, []`; `rls_auto_enable` verified separately as `ensure_rls` infrastructure event-trigger function (`pg_catalog`, `postgres`) |
| **5** | `SECURITY DEFINER` Ownership & `search_path` (`5A`, `5B`) | `44/44` app `SECURITY DEFINER` pinned to `public, pg_temp` + `rls_auto_enable` pinned to `pg_catalog` | **PASS** | `5A` verbatim output archived (`49, 45, 44, 1, 0, {postgres}`). `5B` operator-reviewed (**PASS**). *Raw CSV transcript for `5B` not archived in repo.* |
| **6** | Internal Primitive Privilege Lockdown | All `7` `internal_*` primitives = `false` across all 6 non-owner roles | **PASS** | Verbatim output archived: `7/7` rows `false,false,false,false,false,false` |
| **7** | Zero `anon` & `PUBLIC` Function Grants (`7A`, `7B`) | `0 / 48` app functions executable by `anon` or `PUBLIC` + full 49-row ACL check | **PASS** | `7A` & `7B` operator-reviewed (**PASS**). *Raw CSV transcripts for `7A`/`7B` not archived in repo.* |
| **8** | Schema `public` `CREATE` Restrictions & Default ACLs (`8A`, `8B`) | `CREATE = false` for `PUBLIC`, `anon`, `authenticated`, workers; default ACL review | **PASS WITH OBSERVATION (`8A` PASS; `8B` PASS WITH OBSERVATION)** | `8A` operator-reviewed (**PASS**). `8B` operator-reviewed (**PASS WITH OBSERVATION** concerning Supabase-managed default ACLs on future `public` objects — future migrations `0015+` must continue including explicit `REVOKE ALL` statements). *Raw CSV transcripts for `8A`/`8B` not archived in repo.* |
| **9** | Financial RPC Role Permissions, Table Grants & Role Graph (`9A`–`9D`) | `34` `authenticated`, `5` `treasury_worker`, `1` `reconciler`; intentional dual grants accepted; `0` client DML grants; safe `pg_auth_members` | **ASSESSED / PASS (Catalog Level)** | `9A`–`9D` operator-reviewed and assessed, including intentional `authenticated EXECUTE = true` grants on `public.fail_or_decline_withdrawal` and `public.reconcile_wallet_balance` (Migration `0012`). *Raw CSV transcripts for `9A`–`9D` not archived in repo; runtime JWT enforcement pending Phase 3.* |
| **10** | Withdrawal, Deposit & Ledger Safeguards (`10A`–`10D`) | Paystack disabled (no DVA); 9 system accounts; open period; M0014 live function guards; `0` JWT metadata reads; `0` unbalanced journals; `0` drift | **PASS WITH RUNTIME LIMITATIONS (`10A` PASS; `10B`/`10C` PASS Catalog; `10D` PASS WITH RUNTIME LIMITATIONS)** | `10A` operator-reviewed (**PASS**). `10B` & `10C` operator-reviewed (**PASS** at catalog/function inspection level). `10D` operator-reviewed (**PASS WITH RUNTIME LIMITATIONS**: no actual synthetic wallets or journal entries were populated in staging for live runtime verification). *Raw CSV transcripts for `10A`–`10D` not archived in repo.* |
| **11** | Triggers, Indexes, Constraints & Object Inventory (`11A`–`11C`) | `20` enums, `40` tables, `149` indexes, `24` triggers, `48` app + `1` infra functions, `63` policies, `2` custom roles, `pg_constraint` breakdown | **PASS (Catalog Level)** | `11A`–`11C` operator-reviewed (**PASS** at catalog level). *Raw CSV transcripts for `11A`–`11C` not archived in repo.* |

### 2.2 Remote Runtime & Concurrency Tests (Strictly Distinct from Catalog Checks — 0% Executed)

| Runtime Test Suite | Scope | Current Remote Status |
| :--- | :--- | :---: |
| **1. Synthetic Persona Seeding** | Auth Admin API creation of 8 `.invalid` users + `staging_synthetic_seed.sql` | **PENDING (NOT EXECUTED)** |
| **2. Live PostgREST JWT Security Tests (`P1`–`P20`)** | Real GoTrue JWTs across `anon`, `investor` (with tampered `user_metadata`), `finance_officer`, `compliance_officer`, `admin`, `super_admin`, and server-only `service_role` (also completes runtime validation for `3B` helper-function & RLS enforcement and `9A`–`9D` dual-audience RPCs) | **PENDING (NOT EXECUTED)** |
| **3. Multi-Session Row-Locking Tests (`C1`–`C8`)** | Two independent `psql` connections testing `FOR UPDATE` / `FOR SHARE` blocking (`staging_multisession_concurrency.sql` + M0014 daily-cap & plan-lock races) | **PENDING (NOT EXECUTED)** |
| **4. Synthetic Wallet & Journal Runtime Tests** | End-to-end deposit → withdrawal → four-eyes approval/decline → settlement → immutability → live non-empty `reconcile_wallet_balance` zero-drift verification (resolves `10D` runtime limitation) | **PENDING (NOT EXECUTED)** |

### 2.3 Preserved Raw Remote Query Outputs (Verbatim Outputs Available in Repository / Session)

```csv
-- Query 0A (PASS — verbatim)
database_name,effective_user,connected_user,pg_version,pg_version_num,relevant_extensions
postgres,postgres,postgres,17.12,170012,"pg_stat_statements@1.11 (extensions), pgcrypto@1.3 (extensions), plpgsql@1.0 (pg_catalog), uuid-ossp@1.1 (extensions)"

-- Query 1 (PASS — verbatim)
actual_table_count,expected_table_count,missing_tables,unexpected_tables
40,40,[],{}

-- Query 2A (PASS — verbatim)
total_public_tables,rls_enabled_count,rls_forced_count,unsafe_owner_count,table_owners
40,40,40,0,{postgres}

-- Query 3A (PASS — verbatim)
total_rls_policies,tables_covered,non_select_policies,jwt_metadata_policies
63,40,0,0

-- Query 4 (PASS — verbatim; 48 app + 1 infrastructure event_trigger function rls_auto_enable = 49 total)
actual_app_function_count,actual_secdef_count,missing_functions,unexpected_app_functions,secdef_mismatches
49,45,[],{rls_auto_enable},[]

-- Query 5A (PASS — verbatim)
total_app_functions,secdef_count,secdef_pinned_count,any_unpinned_count,unsafe_owner_count,distinct_owners
49,45,44,1,0,{postgres}

-- Query 6 (PASS — verbatim)
internal_primitive,pub_exec,anon_exec,auth_exec,service_role_exec,treasury_worker_exec,reconciler_exec
internal_assert_service_caller,false,false,false,false,false,false
internal_get_open_period_id,false,false,false,false,false,false
internal_get_system_account_id,false,false,false,false,false,false
internal_is_reconciler_caller,false,false,false,false,false,false
internal_is_service_caller,false,false,false,false,false,false
internal_post_journal_entry,false,false,false,false,false,false
internal_write_audit_log,false,false,false,false,false,false
```

> **Verbatim Raw Output Availability Limitation (`Queries 3B, 3C, 5B, 7A, 7B, 8A, 8B, 9A–9D, 10A–10D, 11A–11C`)**:
> The operator confirmed that these queries were executed in the remote Supabase SQL Editor and reviewed externally, and supplied the reconciled statuses recorded in Section 2.1. However, their exact verbatim CSV/row outputs are **not stored in this repository or present in this session transcript**. In accordance with strict audit integrity rules, **no missing rows have been fabricated, reconstructed, or guessed**. Before final Phase B.5 audit sign-off, attach the verbatim CSV exports to the permanent staging verification archive.

---

## 3. Manual Read-Only SQL Verification Queries (Supabase SQL Editor)

All Phase 1 catalog queries (`0A` through `11C`) have been executed remotely (with verbatim outputs archived for `0A`, `1`, `2A`, `3A`, `4`, `5A`, and `6`). Re-run any query block below independently in the **Supabase SQL Editor** if needed to archive additional verbatim CSV exports. All queries are strictly read-only (`SELECT` only).

---

### Check 0 — Audit Snapshot: Remote Migration History & PostgreSQL Environment
**Current Status**: **PASS** *(Query `0A` verbatim archived: PostgreSQL `17.12` [`pg_version_num = 170012 >= 150000`], `pg_stat_statements@1.11 (extensions)`, `pgcrypto@1.3 (extensions)`, `plpgsql@1.0 (pg_catalog)`, `uuid-ossp@1.1 (extensions)`; Query `0B` all 14 migration versions `20261123000100`–`20261123001400` confirmed present)*

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
**Current Status**: **PASS** *(Observed: `40, 40, [], {}`)*

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
**Current Status**: **PASS** *(Observed Query 2A: `40, 40, 40, 0, {postgres}`)*

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
**Current Status**: **PRELIMINARY PASS** *(Query `3A` **PASS** verbatim: `63, 40, 0, 0`; Query `3B` operator-reviewed **PRELIMINARY PASS** pending helper-function and runtime validation; Query `3C` operator-reviewed **PASS**; verbatim raw CSVs for `3B`/`3C` not archived in repository)*

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

### Check 4 — Verify All 48 Expected Application Functions Exist (+ 1 Infrastructure Event-Trigger Function = 49 Total)
**Current Status**: **PASS** *(Observed: `49, 45, [], {rls_auto_enable}, []` — 48/48 SILVER SPOON application functions match; `public.rls_auto_enable` verified separately as legitimate infrastructure event-trigger function invoked by enabled event trigger `ensure_rls`, owner `postgres`, `SECURITY DEFINER`, `search_path = pg_catalog`)*

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

### Check 5 — Verify All 44 Application `SECURITY DEFINER` Functions Pin `search_path = public, pg_temp` & Safe Ownership
**Current Status**: **PASS** *(Query `5A` **PASS** verbatim: `49, 45, 44, 1, 0, {postgres}` — 44/44 app `SECURITY DEFINER` + 4/4 trigger functions pinned to `public, pg_temp`, 1 infrastructure function `rls_auto_enable` pinned to `pg_catalog`; Query `5B` operator-reviewed **PASS**; verbatim raw CSV for `5B` not archived in repository)*

```sql
-- QUERY 5A: Summary of search_path pinning and ownership across all public non-extension functions
WITH app_procs AS (
  SELECT p.oid, p.proname, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) AS owner_role
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
)
SELECT
  COUNT(*) AS total_observed_functions,
  COUNT(*) FILTER (WHERE proname <> 'rls_auto_enable') AS app_functions_count,
  COUNT(*) FILTER (WHERE proname = 'rls_auto_enable') AS infra_event_trigger_count,
  COUNT(*) FILTER (WHERE prosecdef) AS total_secdef_count,
  COUNT(*) FILTER (WHERE prosecdef AND proname <> 'rls_auto_enable' AND proconfig IS NOT NULL AND 'search_path=public, pg_temp' = ANY(proconfig)) AS app_secdef_pinned_count,
  COUNT(*) FILTER (WHERE proname <> 'rls_auto_enable' AND (proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY(proconfig)))) AS app_unpinned_count,
  COUNT(*) FILTER (WHERE owner_role IN ('anon', 'authenticated', 'service_role')) AS unsafe_owner_count,
  array_agg(DISTINCT owner_role) AS distinct_owners
FROM app_procs;

-- QUERY 5B: Confirm exact security configuration of rls_auto_enable + verify ZERO unpinned/unsafe SILVER SPOON functions
SELECT
  p.proname AS function_name,
  CASE WHEN p.proname = 'rls_auto_enable' THEN 'infrastructure_event_trigger' ELSE 'application' END AS classification,
  pg_get_userbyid(p.proowner) AS owner_role,
  p.prosecdef AS is_security_definer,
  format_type(p.prorettype, NULL) AS return_type,
  p.proconfig,
  has_function_privilege('public', p.oid, 'EXECUTE') AS pub_exec,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  AND (
    p.proname = 'rls_auto_enable'
    OR p.proconfig IS NULL
    OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig))
    OR pg_get_userbyid(p.proowner) IN ('anon', 'authenticated', 'service_role')
  )
ORDER BY p.proname;
```

- **PASS**: Query 5B returns **only** `rls_auto_enable` (`classification = 'infrastructure_event_trigger'`, `owner_role = 'postgres'`, `is_security_definer = true`, `return_type = 'event_trigger'`, `proconfig = {search_path=pg_catalog}`) and **0** application functions.
- **FAIL**: Any SILVER SPOON application function appears in Query 5B.

---

### Check 6 — Verify Internal Primitive Execution Privileges Are Restricted
**Current Status**: **PASS** *(Observed: all 7/7 `internal_*` primitives returned `false,false,false,false,false,false` across all 6 non-owner roles including `service_role`)*

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

### Check 7 — Verify Anonymous (`anon`) & `PUBLIC` Have Zero `EXECUTE` Privileges Across All 48 Application Functions
**Current Status**: **PASS** *(Queries `7A` & `7B` operator-reviewed **PASS**; verbatim raw CSVs not archived in repository)*

```sql
-- QUERY 7A: Count of application functions (48) vs. infrastructure event-trigger (1) executable by anon or PUBLIC
SELECT
  COUNT(*) FILTER (WHERE p.proname <> 'rls_auto_enable' AND has_function_privilege('anon', p.oid, 'EXECUTE')) AS anon_executable_app_functions,
  COUNT(*) FILTER (WHERE p.proname <> 'rls_auto_enable' AND has_function_privilege('public', p.oid, 'EXECUTE')) AS public_executable_app_functions,
  COUNT(*) FILTER (WHERE p.proname = 'rls_auto_enable' AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE'))) AS infra_rls_auto_enable_public_or_anon
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');

-- QUERY 7B: Detailed function ACL listing across all 49 non-extension public functions (separating 48 app + 1 infra)
SELECT
  p.proname AS function_name,
  CASE WHEN p.proname = 'rls_auto_enable' THEN 'infrastructure_event_trigger' ELSE 'application' END AS classification,
  has_function_privilege('public', p.oid, 'EXECUTE') AS pub_exec,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_exec,
  has_function_privilege('silver_spoon_treasury_worker', p.oid, 'EXECUTE') AS treasury_worker_exec,
  has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE') AS reconciler_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
ORDER BY classification, p.proname;
```

- **PASS**: `anon_executable_app_functions = 0`, `public_executable_app_functions = 0`, and Query 7B confirms exact expected ACLs across all 48 application functions (plus clear visibility of `rls_auto_enable`, which as `RETURNS event_trigger` cannot be called directly via PostgREST RPC regardless).
- **FAIL**: Any of the 48 application functions is executable by `anon` or `PUBLIC`.

---

### Check 8 — Verify Schema `public` `CREATE` Privileges Are Restricted
**Current Status**: **PASS WITH OBSERVATION** *(Query `8A` operator-reviewed **PASS**; Query `8B` operator-reviewed **PASS WITH OBSERVATION** concerning Supabase-managed default ACLs on future `public` objects — future migrations `0015+` must retain explicit `REVOKE ALL` statements; verbatim raw CSVs not archived in repository)*

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
**Current Status**: **ASSESSED / PASS (Catalog Level)** *(Queries `9A`–`9D` operator-reviewed and assessed, including accepted intentional `authenticated EXECUTE = true` grants on `fail_or_decline_withdrawal` & `reconcile_wallet_balance` per Section 1.2; verbatim raw CSVs not archived in repository; runtime JWT verification pending Phase 3)*

```sql
-- QUERY 9A: Full EXECUTE matrix across the 48 application functions (excluding infrastructure event-trigger rls_auto_enable)
WITH app_procs AS (
  SELECT p.oid, p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname <> 'rls_auto_enable'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
)
SELECT
  COUNT(*) AS app_function_count,
  COUNT(*) FILTER (WHERE has_function_privilege('authenticated', oid, 'EXECUTE')) AS authenticated_exec_count,
  COUNT(*) FILTER (WHERE has_function_privilege('service_role', oid, 'EXECUTE')) AS service_role_exec_count,
  COUNT(*) FILTER (WHERE has_function_privilege('silver_spoon_treasury_worker', oid, 'EXECUTE')) AS treasury_worker_exec_count,
  COUNT(*) FILTER (WHERE has_function_privilege('silver_spoon_reconciler', oid, 'EXECUTE')) AS reconciler_exec_count,
  array_agg(proname ORDER BY proname) FILTER (WHERE has_function_privilege('silver_spoon_treasury_worker', oid, 'EXECUTE')) AS treasury_worker_fns,
  array_agg(proname ORDER BY proname) FILTER (WHERE has_function_privilege('silver_spoon_reconciler', oid, 'EXECUTE')) AS reconciler_fns
FROM app_procs;

-- QUERY 9B: Verify settlement & reconciliation RPC ACLs (including intentional dual-audience grants)
SELECT
  p.proname AS rpc_name,
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
**Current Status**: **PASS WITH RUNTIME LIMITATIONS** *(Query `10A` operator-reviewed **PASS**; Queries `10B` & `10C` operator-reviewed **PASS** at catalog/function inspection level; Query `10D` operator-reviewed **PASS WITH RUNTIME LIMITATIONS** because no actual wallets or journal entries were populated in staging for live runtime verification; verbatim raw CSVs not archived in repository)*

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
**Current Status**: **PASS (Catalog Level)** *(Queries `11A`–`11C` operator-reviewed **PASS** at catalog level; verbatim raw CSVs not archived in repository)*

```sql
-- QUERY 11A: Complete pg_catalog object inventory separating 48 app functions + 1 infra event-trigger function = 49 total
SELECT
  (SELECT COUNT(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e') AS enum_types_count,
  (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r') AS tables_count,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public') AS indexes_count,
  (SELECT COUNT(*) FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace WHERE n.nspname = 'public') AS constraints_total,
  (SELECT COUNT(*) FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace WHERE n.nspname = 'public' AND con.contype <> 'n') AS constraints_excl_not_null,
  (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal) AS triggers_count,
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname <> 'rls_auto_enable' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')) AS app_functions_count,
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable') AS infra_event_trigger_functions_count,
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')) AS total_observed_functions_count,
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

- **Local Audit Baseline (`docs/phase-b5-final-security-audit.md`) + Hosted Classification**:
  - `enum_types_count = 20`
  - `tables_count = 40`
  - `indexes_count = 149`
  - `triggers_count = 24` (including `assert_journal_entry_balanced` with `is_deferrable = true` & `initially_deferred = true`, `prevent_immutable_mutation` on `audit_logs`, `journal_entries`, `journal_lines`, `payment_events`, `webhook_logs`, and `guard_tax_applications_immutability` on `tax_applications`)
  - `app_functions_count = 48`, `infra_event_trigger_functions_count = 1` (`rls_auto_enable`), `total_observed_functions_count = 49`
  - `rls_policies_count = 63`
  - `custom_worker_roles_count = 2`
  - `constraints_total` / `constraints_excl_not_null`: Local PGlite (PostgreSQL 17/18 WASM) reported `691` total constraints (including `contype = 'n'` `NOT NULL` catalog constraints on PG 18, whereas PostgreSQL 15/16/17 stores `NOT NULL` in `pg_attribute.attnotnull`). Query 11C splits counts by `contype` (`p`, `u`, `f`, `c`, `n`) for exact comparison.
- **PASS**: Exact match on `enums (20)`, `tables (40)`, `indexes (149)`, `triggers (24)` including deferred balancing & immutability triggers, `app_functions (48)` + `infra (1)` = `49`, `rls_policies (63)`, `custom_worker_roles (2)`, and all `p`/`u`/`f`/`c` constraints present.
- **NEEDS INVESTIGATION**: `constraints_total < 691` solely because hosted Supabase runs PostgreSQL 15/16/17 (no `contype = 'n'` rows) — verify `p`, `u`, `f`, `c` counts via Query 11C.
- **FAIL**: Missing enums, indexes, triggers (especially deferred journal balancing or immutability triggers), `CHECK`/`UNIQUE`/`FK` constraints, or custom worker roles.

---

## 4. Remaining Uncompleted Verification Checks, Documentation Limitations & Next Sequence

1. **Remaining Catalog Evidence & Governance Items**:
   - **Archive Verbatim Raw CSV Exports** (documentation hygiene): Queries `3B`, `3C`, `5B`, `7A`, `7B`, `8A`, `8B`, `9A`–`9D`, `10A`–`10D`, and `11A`–`11C` were reviewed externally by the operator; attach their verbatim CSV exports to the staging audit record so every catalog check has immutable local evidence alongside Queries `0A`, `1`, `2A`, `3A`, `4`, `5A`, and `6`.
   - **Monitor Observation (`Query 8B`)**: Supabase-managed default ACLs on future `public` objects mean every future forward-only migration (`0015+`) must continue executing explicit `REVOKE ALL` statements immediately after creating any table, sequence, or function.
   - **Close Preliminary / Runtime-Limited Catalog Items**:
     - **Query `3B`** remains **PRELIMINARY PASS** until helper-function and live PostgREST JWT tests (`P1`–`P20`) verify effective row filtering at runtime.
     - **Query `10D`** remains **PASS WITH RUNTIME LIMITATIONS** until synthetic wallets and journal entries exist and pass live end-to-end reconciliation.
2. **Execute All 4 Pending Runtime & Concurrency Suites (`docs/staging-post-deployment-verification.md`)**:
   - **Suite 1 — Synthetic Persona Seeding**: Auth Admin API creation of 8 `.invalid` users + `staging_synthetic_seed.sql`.
   - **Suite 2 — Live PostgREST JWT Security Tests (`P1`–`P20`)**: Verify real GoTrue JWT enforcement across all 5 roles, `anon`, tampered `user_metadata`, and server-only `service_role`.
   - **Suite 3 — Multi-Session Locking Tests (`C1`–`C8`)**: Two independent `psql` connections proving `FOR UPDATE` / `FOR SHARE` serialization under contention.
   - **Suite 4 — Synthetic Wallet & Journal Runtime Tests**: Full deposit, withdrawal, four-eyes approval/decline, settlement, immutability rejection (`IMMUTABLE_RECORD`), non-empty `reconcile_wallet_balance` zero-drift verification, and backup verification.
3. **Hold Phase C Gate (Not Production-Ready)**: Keep `VITE_DATA_PROVIDER=mock`, Paystack disabled, Migrations `0001`–`0014` frozen, and do **not** begin Phase C authentication integration or claim production readiness until verbatim audit archival and all 4 runtime/concurrency suites pass completely.

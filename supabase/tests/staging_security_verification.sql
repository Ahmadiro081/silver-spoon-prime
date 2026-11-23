-- ============================================================================
-- SILVER SPOON — Read-Only Post-Deployment Staging Security Verification Suite
--
-- Target: Dedicated, isolated non-production Supabase Staging PostgreSQL 15+
-- Mode:   STRICTLY READ-ONLY (enforced by BEGIN TRANSACTION READ ONLY)
--         Zero schema changes, zero data writes, zero role modifications.
--
-- Purpose:
--   Run immediately after applying Migrations 0001–0014 via `supabase db push`
--   to inspect migration history, PostgreSQL version & extensions, schema &
--   default privileges, roles/ownership/membership, 40/40 ENABLE + FORCE RLS,
--   63 RLS policies, 48 function security attributes & grants, 7 internal_*
--   primitive revocations, triggers, financial ledger & payment provider safety,
--   and non-production data hygiene.
--
-- Usage (psql):
--   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/staging_security_verification.sql
--
-- Usage (Supabase SQL Editor):
--   Paste and run against the dedicated STAGING project only.
-- ============================================================================

BEGIN TRANSACTION READ ONLY;

-- ============================================================================
-- SECTION 1: ENVIRONMENT, POSTGRESQL VERSION & EXTENSION COMPATIBILITY
-- ============================================================================
SELECT
  '1.1_environment' AS check_group,
  current_database() AS database_name,
  current_user AS effective_user,
  session_user AS connected_session_user,
  current_setting('server_version') AS pg_version,
  current_setting('server_version_num')::INT AS pg_version_num,
  CASE
    WHEN current_setting('server_version_num')::INT >= 150000 THEN 'PASS'
    ELSE 'FAIL: Requires PostgreSQL 15+'
  END AS version_status;

SELECT
  '1.2_extensions' AS check_group,
  e.extname AS extension_name,
  n.nspname AS extension_schema,
  e.extversion AS extension_version
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname IN ('pgcrypto', 'pg_stat_statements', 'uuid-ossp', 'plpgsql')
ORDER BY e.extname;

-- ============================================================================
-- SECTION 2: MIGRATION HISTORY VERIFICATION (0001–0014)
-- Safely handles both hosted Supabase (supabase_migrations.schema_migrations)
-- and plain PostgreSQL instances without raising an error.
-- ============================================================================
DO $$
DECLARE
  v_expected TEXT[] := ARRAY[
    '20261123000100', '20261123000200', '20261123000300', '20261123000400',
    '20261123000500', '20261123000600', '20261123000700', '20261123000800',
    '20261123000900', '20261123001000', '20261123001100', '20261123001200',
    '20261123001300', '20261123001400'
  ];
  v_missing TEXT[];
  v_applied_count INT;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE NOTICE '[2.1_migration_history] INFO: supabase_migrations.schema_migrations not present (expected on local/plain PostgreSQL; on hosted Supabase this indicates migrations were not applied via `supabase db push`).';
  ELSE
    EXECUTE $q$
      SELECT COUNT(*)
      FROM supabase_migrations.schema_migrations
      WHERE version = ANY($1)
    $q$ INTO v_applied_count USING v_expected;

    EXECUTE $q$
      SELECT COALESCE(ARRAY_AGG(exp_ver ORDER BY exp_ver), ARRAY[]::TEXT[])
      FROM UNNEST($1) AS exp_ver
      WHERE NOT EXISTS (
        SELECT 1
        FROM supabase_migrations.schema_migrations sm
        WHERE sm.version = exp_ver
      )
    $q$ INTO v_missing USING v_expected;

    IF v_applied_count = 14 AND COALESCE(array_length(v_missing, 1), 0) = 0 THEN
      RAISE NOTICE '[2.1_migration_history] PASS: All 14/14 expected migrations (20261123000100..20261123001400) recorded in supabase_migrations.schema_migrations.';
    ELSE
      RAISE NOTICE '[2.1_migration_history] FAIL: Found %/14 expected migrations. Missing: %', v_applied_count, v_missing;
    END IF;
  END IF;
END $$;

SELECT
  '2.2_migration_table_presence' AS check_group,
  (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL) AS supabase_migration_tracker_exists;

-- ============================================================================
-- SECTION 3: SCHEMA PRIVILEGES & DEFAULT PRIVILEGES (`public`)
-- ============================================================================
SELECT
  '3.1_public_schema_privileges' AS check_group,
  r.rolname AS role_name,
  has_schema_privilege(r.rolname, 'public', 'USAGE') AS has_usage,
  has_schema_privilege(r.rolname, 'public', 'CREATE') AS has_create,
  CASE
    WHEN r.rolname IN ('anon', 'authenticated', 'silver_spoon_reconciler', 'silver_spoon_treasury_worker')
         AND has_schema_privilege(r.rolname, 'public', 'CREATE') THEN 'FAIL: Must NOT have CREATE on public'
    WHEN r.rolname IN ('anon', 'authenticated', 'service_role', 'silver_spoon_treasury_worker', 'silver_spoon_reconciler')
         AND NOT has_schema_privilege(r.rolname, 'public', 'USAGE') THEN 'FAIL: Missing USAGE on public'
    ELSE 'PASS'
  END AS status
FROM pg_roles r
WHERE r.rolname IN (
  'anon', 'authenticated', 'service_role',
  'silver_spoon_treasury_worker', 'silver_spoon_reconciler'
)
ORDER BY r.rolname;

SELECT
  '3.2_public_pseudo_role_schema_create' AS check_group,
  has_schema_privilege('public', 'public', 'CREATE') AS public_has_create,
  has_schema_privilege('public', 'public', 'USAGE') AS public_has_usage,
  CASE
    WHEN has_schema_privilege('public', 'public', 'CREATE') THEN 'FAIL: PUBLIC still has CREATE on schema public'
    ELSE 'PASS'
  END AS status;

SELECT
  '3.3_default_privileges_public' AS check_group,
  pg_get_userbyid(d.defaclrole) AS granting_role,
  n.nspname AS schema_name,
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

-- ============================================================================
-- SECTION 4: DATABASE ROLES, BYPASSRLS & ROLE MEMBERSHIP (`pg_auth_members`)
-- ============================================================================
SELECT
  '4.1_role_attributes' AS check_group,
  rolname,
  rolsuper,
  rolcreaterole,
  rolcanlogin,
  rolbypassrls,
  CASE
    WHEN rolname IN ('anon', 'authenticated', 'silver_spoon_treasury_worker', 'silver_spoon_reconciler')
         AND (rolsuper OR rolbypassrls OR rolcanlogin) THEN 'FAIL: Unexpected elevated/login privilege'
    WHEN rolname = 'service_role' AND rolbypassrls THEN 'INFO: Hosted Supabase service_role has BYPASSRLS (must remain server-only)'
    ELSE 'PASS'
  END AS security_note
FROM pg_roles
WHERE rolname IN (
  'anon', 'authenticated', 'authenticator', 'service_role',
  'silver_spoon_treasury_worker', 'silver_spoon_reconciler',
  'postgres', 'supabase_admin'
)
ORDER BY rolname;

SELECT
  '4.2_privileged_role_memberships' AS check_group,
  parent.rolname AS granted_role,
  member.rolname AS member_role,
  m.admin_option,
  CASE
    WHEN parent.rolname IN ('service_role', 'silver_spoon_treasury_worker', 'postgres', 'supabase_admin')
         AND member.rolname IN ('anon', 'authenticated', 'silver_spoon_reconciler')
      THEN 'FAIL: Unprivileged role is member of privileged backend role'
    ELSE 'PASS'
  END AS status
FROM pg_auth_members m
JOIN pg_roles parent ON parent.oid = m.roleid
JOIN pg_roles member ON member.oid = m.member
WHERE parent.rolname IN (
  'service_role', 'silver_spoon_treasury_worker', 'silver_spoon_reconciler',
  'postgres', 'supabase_admin'
)
ORDER BY parent.rolname, member.rolname;

-- ============================================================================
-- SECTION 5: TABLE INVENTORY, OWNERSHIP, ENABLE + FORCE RLS & TABLE GRANTS
-- ============================================================================
SELECT
  '5.1_table_rls_summary' AS check_group,
  COUNT(*) AS total_public_tables,
  COUNT(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled_tables,
  COUNT(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity) AS rls_forced_tables,
  COUNT(*) FILTER (WHERE pg_get_userbyid(c.relowner) IN ('anon', 'authenticated', 'service_role')) AS unsafe_owner_tables,
  CASE
    WHEN COUNT(*) = 40
     AND COUNT(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity) = 40
     AND COUNT(*) FILTER (WHERE pg_get_userbyid(c.relowner) IN ('anon', 'authenticated', 'service_role')) = 0
      THEN 'PASS'
    ELSE 'FAIL'
  END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';

-- Diagnostic: Must return 0 rows (any table missing ENABLE/FORCE RLS or unsafe owner)
SELECT
  '5.2_tables_missing_forced_rls' AS check_group,
  c.relname AS table_name,
  pg_get_userbyid(c.relowner) AS table_owner,
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

-- Diagnostic: Must return 0 rows (direct DML grants to PUBLIC, anon, or authenticated)
SELECT
  '5.3_forbidden_client_table_dml_grants' AS check_group,
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
ORDER BY grantee, table_name, privilege_type;

-- Verify anon SELECT is strictly confined to public.investment_plans (1 table)
SELECT
  '5.4_anon_table_select_grants' AS check_group,
  table_name,
  privilege_type,
  CASE
    WHEN table_name = 'investment_plans' AND privilege_type = 'SELECT' THEN 'PASS'
    ELSE 'FAIL: Unexpected anon table grant'
  END AS status
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
ORDER BY table_name, privilege_type;

-- ============================================================================
-- SECTION 6: RLS POLICY COMPLETENESS & VISIBILITY ISOLATION (63 POLICIES)
-- ============================================================================
SELECT
  '6.1_rls_policy_counts' AS check_group,
  COUNT(*) AS total_policies,
  COUNT(DISTINCT tablename) AS tables_with_policies,
  COUNT(*) FILTER (WHERE cmd <> 'SELECT') AS non_select_client_policies,
  CASE
    WHEN COUNT(*) = 63
     AND COUNT(DISTINCT tablename) = 40
     AND COUNT(*) FILTER (WHERE cmd <> 'SELECT') = 0
      THEN 'PASS'
    ELSE 'FAIL'
  END AS status
FROM pg_policies
WHERE schemaname = 'public';

-- Verify active-only anon policy on investment_plans and strict KYC isolation policies
SELECT
  '6.2_critical_rls_policies' AS check_group,
  tablename,
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'investment_plans', 'kyc_records', 'kyc_documents',
    'kyc_reviews', 'compliance_events', 'user_roles',
    'journal_entries', 'withdrawal_batches', 'payment_providers'
  )
ORDER BY tablename, policyname;

-- ============================================================================
-- SECTION 7: FUNCTION SECURITY ATTRIBUTES (SECURITY DEFINER, OWNER, SEARCH_PATH)
-- ============================================================================
SELECT
  '7.1_function_security_summary' AS check_group,
  COUNT(*) AS total_public_functions,
  COUNT(*) FILTER (WHERE p.prosecdef) AS security_definer_functions,
  COUNT(*) FILTER (WHERE NOT p.prosecdef) AS invoker_trigger_functions,
  COUNT(*) FILTER (
    WHERE p.proconfig IS NULL
       OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig))
  ) AS functions_missing_pinned_search_path,
  COUNT(*) FILTER (
    WHERE pg_get_userbyid(p.proowner) IN ('anon', 'authenticated', 'service_role')
  ) AS functions_with_unsafe_owner,
  COUNT(*) FILTER (
    WHERE p.prosrc ~* '(user_metadata|app_metadata|raw_user_meta_data|raw_app_meta_data)'
  ) AS functions_reading_jwt_metadata,
  CASE
    WHEN COUNT(*) = 48
     AND COUNT(*) FILTER (WHERE p.prosecdef) = 44
     AND COUNT(*) FILTER (
       WHERE p.proconfig IS NULL
          OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig))
     ) = 0
     AND COUNT(*) FILTER (
       WHERE pg_get_userbyid(p.proowner) IN ('anon', 'authenticated', 'service_role')
     ) = 0
     AND COUNT(*) FILTER (
       WHERE p.prosrc ~* '(user_metadata|app_metadata|raw_user_meta_data|raw_app_meta_data)'
     ) = 0
      THEN 'PASS'
    ELSE 'FAIL'
  END AS status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';

-- Diagnostic: Must return 0 rows (any function lacking pinned search_path or safe owner)
SELECT
  '7.2_function_attribute_anomalies' AS check_group,
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS owner_role,
  p.prosecdef AS is_security_definer,
  p.proconfig AS function_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    p.proconfig IS NULL
    OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig))
    OR pg_get_userbyid(p.proowner) IN ('anon', 'authenticated', 'service_role')
  )
ORDER BY p.proname;

-- ============================================================================
-- SECTION 8: FUNCTION EXECUTE GRANTS & INTERNAL PRIMITIVE LOCKDOWN
-- ============================================================================
SELECT
  '8.1_function_execute_grant_counts' AS check_group,
  COUNT(*) FILTER (WHERE has_function_privilege('public', p.oid, 'EXECUTE')) AS public_exec_count,
  COUNT(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')) AS anon_exec_count,
  COUNT(*) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS authenticated_exec_count,
  COUNT(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE')) AS service_role_exec_count,
  COUNT(*) FILTER (WHERE has_function_privilege('silver_spoon_treasury_worker', p.oid, 'EXECUTE')) AS treasury_worker_exec_count,
  COUNT(*) FILTER (WHERE has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE')) AS reconciler_exec_count,
  CASE
    WHEN COUNT(*) FILTER (WHERE has_function_privilege('public', p.oid, 'EXECUTE')) = 0
     AND COUNT(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')) = 0
     AND COUNT(*) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 34
     AND COUNT(*) FILTER (WHERE has_function_privilege('silver_spoon_treasury_worker', p.oid, 'EXECUTE')) = 5
     AND COUNT(*) FILTER (WHERE has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE')) = 1
      THEN 'PASS'
    ELSE 'FAIL'
  END AS core_grant_status,
  CASE
    WHEN COUNT(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE')) = 5
      THEN 'PASS (Exact 5 backend RPCs)'
    WHEN COUNT(*) FILTER (
      WHERE p.proname IN (
        'internal_is_service_caller', 'internal_is_reconciler_caller',
        'internal_assert_service_caller', 'internal_get_open_period_id',
        'internal_get_system_account_id', 'internal_post_journal_entry',
        'internal_write_audit_log'
      ) AND has_function_privilege('service_role', p.oid, 'EXECUTE')
    ) > 0
      THEN 'FAIL: service_role has EXECUTE on internal_* primitive'
    ELSE 'INFO: Hosted Supabase default privileges granted service_role EXECUTE on non-internal RPCs (all 7 internal_* primitives remain revoked)'
  END AS service_role_grant_note
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';

-- Verify all 7 internal_* low-level primitives are revoked from EVERY non-owner role
SELECT
  '8.2_internal_primitive_lockdown' AS check_group,
  p.proname AS function_name,
  has_function_privilege('public', p.oid, 'EXECUTE') AS pub_exec,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec,
  has_function_privilege('silver_spoon_treasury_worker', p.oid, 'EXECUTE') AS tw_exec,
  has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE') AS rec_exec,
  CASE
    WHEN NOT has_function_privilege('public', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('silver_spoon_treasury_worker', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE')
      THEN 'PASS'
    ELSE 'FAIL: Unauthorized EXECUTE grant on internal primitive'
  END AS status
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

-- Verify settlement RPCs are strictly blocked for anon, authenticated, and reconciler
SELECT
  '8.3_settlement_rpc_isolation' AS check_group,
  p.proname AS function_name,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE') AS rec_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec,
  has_function_privilege('silver_spoon_treasury_worker', p.oid, 'EXECUTE') AS tw_exec,
  CASE
    WHEN NOT has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE')
     AND has_function_privilege('service_role', p.oid, 'EXECUTE')
     AND has_function_privilege('silver_spoon_treasury_worker', p.oid, 'EXECUTE')
      THEN 'PASS'
    ELSE 'FAIL: Improper settlement RPC grant'
  END AS status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'internal_provision_investor_wallet',
    'settle_verified_deposit',
    'settle_withdrawal'
  )
ORDER BY p.proname;

-- Verify silver_spoon_reconciler has EXECUTE on reconcile_wallet_balance ONLY
SELECT
  '8.4_reconciler_function_grants' AS check_group,
  p.proname AS granted_function,
  CASE
    WHEN p.proname = 'reconcile_wallet_balance' THEN 'PASS'
    ELSE 'FAIL: Unexpected function grant to silver_spoon_reconciler'
  END AS status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE')
ORDER BY p.proname;

-- ============================================================================
-- SECTION 9: TRIGGERS, IMMUTABILITY & DOUBLE-ENTRY BALANCING GUARDS
-- ============================================================================
SELECT
  '9.1_trigger_inventory_summary' AS check_group,
  COUNT(*) AS total_user_triggers,
  COUNT(*) FILTER (WHERE t.tgdeferrable AND t.tginitdeferred) AS deferred_constraint_triggers,
  CASE
    WHEN COUNT(*) = 24 AND COUNT(*) FILTER (WHERE t.tgdeferrable AND t.tginitdeferred) >= 1 THEN 'PASS'
    ELSE 'FAIL'
  END AS status
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal;

SELECT
  '9.2_immutability_and_balance_triggers' AS check_group,
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
  AND p.proname IN (
    'prevent_immutable_mutation',
    'guard_tax_applications_immutability',
    'assert_journal_entry_balanced'
  )
ORDER BY c.relname, t.tgname;

-- ============================================================================
-- SECTION 10: FINANCIAL LEDGER, PAYMENT PROVIDER & PLATFORM SETTINGS SAFETY
-- ============================================================================
SELECT
  '10.1_payment_providers_disabled' AS check_group,
  code,
  name AS provider_name,
  is_enabled,
  allowed_channels,
  CASE
    WHEN is_enabled = false
     AND NOT ('dedicated_virtual_account' = ANY(allowed_channels))
      THEN 'PASS'
    ELSE 'FAIL: Payment provider must remain disabled with DVAs excluded in staging'
  END AS status
FROM public.payment_providers
ORDER BY code;

SELECT
  '10.2_system_ledger_and_periods' AS check_group,
  (SELECT COUNT(*) FROM public.ledger_accounts WHERE is_system = true AND is_active = true) AS active_system_accounts,
  (SELECT COUNT(*) FROM public.financial_periods WHERE status = 'open') AS open_financial_periods,
  (SELECT COUNT(*) FROM public.platform_settings WHERE key IN ('withdrawal.daily_limit_tier2_kobo', 'withdrawal.daily_limit_tier3_kobo')) AS withdrawal_cap_settings,
  CASE
    WHEN (SELECT COUNT(*) FROM public.ledger_accounts WHERE is_system = true AND is_active = true) = 9
     AND (SELECT COUNT(*) FROM public.financial_periods WHERE status = 'open') >= 1
     AND (SELECT COUNT(*) FROM public.platform_settings WHERE key IN ('withdrawal.daily_limit_tier2_kobo', 'withdrawal.daily_limit_tier3_kobo')) = 2
      THEN 'PASS'
    ELSE 'FAIL'
  END AS status;

-- Read-only double-entry invariant check across ALL posted journal entries (must be 0)
SELECT
  '10.3_unbalanced_journal_entries' AS check_group,
  COUNT(*) AS unbalanced_entry_count,
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS'
    ELSE 'FAIL: Unbalanced journal entries detected'
  END AS status
FROM (
  SELECT
    je.id,
    COALESCE(SUM(jl.amount_kobo) FILTER (WHERE jl.direction = 'debit'), 0) AS total_debits,
    COALESCE(SUM(jl.amount_kobo) FILTER (WHERE jl.direction = 'credit'), 0) AS total_credits,
    COUNT(jl.id) AS line_count
  FROM public.journal_entries je
  LEFT JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
  GROUP BY je.id
  HAVING COALESCE(SUM(jl.amount_kobo) FILTER (WHERE jl.direction = 'debit'), 0)
         <> COALESCE(SUM(jl.amount_kobo) FILTER (WHERE jl.direction = 'credit'), 0)
      OR COUNT(jl.id) < 2
) unbalanced;

-- Read-only wallet reconciliation drift check across ALL wallets (must be 0 drifted wallets)
WITH wallet_ledger AS (
  SELECT
    w.id AS wallet_id,
    wb.available_kobo AS cached_available,
    wb.reserved_withdrawal_kobo AS cached_reserved,
    wb.invested_principal_kobo AS cached_invested,
    COALESCE(SUM(
      CASE
        WHEN jl.ledger_account_id = w.available_account_id AND jl.direction = 'credit' THEN jl.amount_kobo
        WHEN jl.ledger_account_id = w.available_account_id AND jl.direction = 'debit'  THEN -jl.amount_kobo
        ELSE 0
      END
    ), 0) AS ledger_available,
    COALESCE(SUM(
      CASE
        WHEN jl.ledger_account_id = w.reserved_account_id AND jl.direction = 'credit' THEN jl.amount_kobo
        WHEN jl.ledger_account_id = w.reserved_account_id AND jl.direction = 'debit'  THEN -jl.amount_kobo
        ELSE 0
      END
    ), 0) AS ledger_reserved,
    COALESCE(SUM(
      CASE
        WHEN jl.ledger_account_id = w.invested_account_id AND jl.direction = 'credit' THEN jl.amount_kobo
        WHEN jl.ledger_account_id = w.invested_account_id AND jl.direction = 'debit'  THEN -jl.amount_kobo
        ELSE 0
      END
    ), 0) AS ledger_invested
  FROM public.wallets w
  JOIN public.wallet_balances wb ON wb.wallet_id = w.id
  LEFT JOIN public.journal_lines jl
    ON jl.ledger_account_id IN (w.available_account_id, w.reserved_account_id, w.invested_account_id)
  GROUP BY w.id, wb.available_kobo, wb.reserved_withdrawal_kobo, wb.invested_principal_kobo
)
SELECT
  '10.4_wallet_reconciliation_drift' AS check_group,
  COUNT(*) AS total_wallets_checked,
  COUNT(*) FILTER (
    WHERE cached_available <> ledger_available
       OR cached_reserved <> ledger_reserved
       OR cached_invested <> ledger_invested
  ) AS drifted_wallets,
  CASE
    WHEN COUNT(*) FILTER (
      WHERE cached_available <> ledger_available
         OR cached_reserved <> ledger_reserved
         OR cached_invested <> ledger_invested
    ) = 0 THEN 'PASS'
    ELSE 'FAIL: Wallet balance drift detected'
  END AS status
FROM wallet_ledger;

-- ============================================================================
-- SECTION 11: NON-PRODUCTION STAGING DATA HYGIENE CHECK
-- ============================================================================
SELECT
  '11.1_synthetic_email_hygiene' AS check_group,
  COUNT(*) AS total_profiles,
  COUNT(*) FILTER (WHERE email !~* '\.invalid$') AS non_synthetic_email_count,
  CASE
    WHEN COUNT(*) FILTER (WHERE email !~* '\.invalid$') = 0 THEN 'PASS (All profiles use RFC 2606 .invalid synthetic domains)'
    ELSE 'FAIL: Non-.invalid email address detected in non-production staging'
  END AS status
FROM public.profiles;

SELECT
  '11.2_kyc_no_plaintext_ids' AS check_group,
  COUNT(*) AS total_kyc_records,
  COUNT(*) FILTER (
    WHERE (bvn_hash IS NOT NULL AND bvn_hash ~ '^[0-9]{11}$')
       OR (nin_hash IS NOT NULL AND nin_hash ~ '^[0-9]{11}$')
  ) AS suspected_plaintext_bvn_nin,
  CASE
    WHEN COUNT(*) FILTER (
      WHERE (bvn_hash IS NOT NULL AND bvn_hash ~ '^[0-9]{11}$')
         OR (nin_hash IS NOT NULL AND nin_hash ~ '^[0-9]{11}$')
    ) = 0 THEN 'PASS'
    ELSE 'FAIL: Suspected 11-digit plaintext BVN/NIN stored in hash column'
  END AS status
FROM public.kyc_records;

-- ============================================================================
-- SECTION 12: CONSOLIDATED PASS / FAIL SECURITY SCORECARD
-- ============================================================================
WITH checks AS (
  SELECT '01_pg_version_15_plus' AS check_id,
    (current_setting('server_version_num')::INT >= 150000) AS passed,
    current_setting('server_version') AS detail
  UNION ALL
  SELECT '02_tables_40_of_40_forced_rls',
    ((SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') = 40
     AND (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity) = 40),
    (SELECT COUNT(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity)::TEXT || '/' || COUNT(*)::TEXT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r')
  UNION ALL
  SELECT '03_rls_policies_63_select_only',
    ((SELECT COUNT(*) FROM pg_policies WHERE schemaname='public') = 63
     AND (SELECT COUNT(*) FROM pg_policies WHERE schemaname='public' AND cmd <> 'SELECT') = 0),
    (SELECT COUNT(*)::TEXT || ' policies' FROM pg_policies WHERE schemaname='public')
  UNION ALL
  SELECT '04_zero_client_dml_table_grants',
    ((SELECT COUNT(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('PUBLIC','anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')) = 0),
    (SELECT COUNT(*)::TEXT || ' forbidden DML grants' FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('PUBLIC','anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
  UNION ALL
  SELECT '05_anon_select_plans_only',
    ((SELECT COUNT(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') = 1
     AND EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon' AND table_name='investment_plans' AND privilege_type='SELECT')),
    (SELECT COALESCE(STRING_AGG(table_name || ':' || privilege_type, ', '), 'none') FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon')
  UNION ALL
  SELECT '06_public_schema_create_revoked',
    (NOT has_schema_privilege('public','public','CREATE')
     AND NOT has_schema_privilege('anon','public','CREATE')
     AND NOT has_schema_privilege('authenticated','public','CREATE')),
    'PUBLIC/anon/authenticated CREATE=' || has_schema_privilege('public','public','CREATE')::TEXT || '/' || has_schema_privilege('anon','public','CREATE')::TEXT || '/' || has_schema_privilege('authenticated','public','CREATE')::TEXT
  UNION ALL
  SELECT '07_functions_48_all_pinned_search_path',
    ((SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') = 48
     AND (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef) = 44
     AND (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig)))) = 0),
    (SELECT COUNT(*)::TEXT || ' total / ' || COUNT(*) FILTER (WHERE p.prosecdef)::TEXT || ' SECDEF' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
  UNION ALL
  SELECT '08_zero_anon_and_public_function_grants',
    ((SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE'))) = 0),
    (SELECT COUNT(*)::TEXT || ' grants' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE')))
  UNION ALL
  SELECT '09_internal_7_primitives_revoked_from_all',
    ((SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      AND p.proname IN ('internal_is_service_caller','internal_is_reconciler_caller','internal_assert_service_caller','internal_get_open_period_id','internal_get_system_account_id','internal_post_journal_entry','internal_write_audit_log')
      AND (has_function_privilege('public',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE') OR has_function_privilege('silver_spoon_treasury_worker',p.oid,'EXECUTE') OR has_function_privilege('silver_spoon_reconciler',p.oid,'EXECUTE'))) = 0),
    '7 internal_* primitives checked'
  UNION ALL
  SELECT '10_reconciler_isolated_to_1_rpc',
    ((SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE')) = 1
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reconcile_wallet_balance' AND has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE'))),
    (SELECT COALESCE(STRING_AGG(p.proname, ', '), 'none') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND has_function_privilege('silver_spoon_reconciler', p.oid, 'EXECUTE'))
  UNION ALL
  SELECT '11_no_jwt_metadata_in_functions',
    ((SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc ~* '(user_metadata|app_metadata|raw_user_meta_data|raw_app_meta_data)') = 0),
    '0 functions reference user_metadata/app_metadata'
  UNION ALL
  SELECT '12_payment_providers_disabled',
    ((SELECT COUNT(*) FROM public.payment_providers WHERE is_enabled = true) = 0),
    (SELECT COALESCE(STRING_AGG(code || '=' || is_enabled::TEXT, ', '), 'none') FROM public.payment_providers)
  UNION ALL
  SELECT '13_zero_unbalanced_journals',
    NOT EXISTS (
      SELECT 1 FROM public.journal_entries je
      LEFT JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
      GROUP BY je.id
      HAVING COALESCE(SUM(jl.amount_kobo) FILTER (WHERE jl.direction='debit'),0) <> COALESCE(SUM(jl.amount_kobo) FILTER (WHERE jl.direction='credit'),0)
          OR COUNT(jl.id) < 2
    ),
    (SELECT COUNT(*)::TEXT || ' journal entries checked' FROM public.journal_entries)
  UNION ALL
  SELECT '14_synthetic_non_production_emails_only',
    ((SELECT COUNT(*) FROM public.profiles WHERE email !~* '\.invalid$') = 0),
    (SELECT COUNT(*)::TEXT || ' profiles checked' FROM public.profiles)
)
SELECT
  '12_SUMMARY_SCORECARD' AS check_group,
  check_id,
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status,
  detail
FROM checks
ORDER BY check_id;

COMMIT;

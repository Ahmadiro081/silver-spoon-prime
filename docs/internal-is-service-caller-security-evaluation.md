# SILVER SPOON — Security Evaluation of `internal_is_service_caller()`, Role Separation & JWT Non-Override Guarantees

**Document Classification**: Phase B.5 Pre-Staging Security Architecture & Verification Specification  
**Primary Authoritative Source**: `supabase/migrations/20261123001400_phase_b5_final_security_audit_hardening.sql` (lines 32–172), `20261123001200_rls_and_least_privilege_grants.sql`, `20261123001300_phase_b5_security_and_visibility_hardening.sql`  
**Verification Evidence**: Local embedded PostgreSQL (`@electric-sql/pglite`) via `npm run test:db` (**28 / 28 passed, 0 failed** across 14 migrations). **Hosted Supabase staging execution remains pending** until a dedicated non-production project is provisioned.  
**Active Frontend Provider**: `VITE_DATA_PROVIDER=mock` (no database connection active in frontend).

---

## 1. Executive Summary

In PostgreSQL `SECURITY DEFINER` functions owned by the database superuser (`postgres`), PostgreSQL's `current_user` switches to the function owner (`'postgres'`) rather than the calling role. Relying on `current_user` inside a `SECURITY DEFINER` function causes privilege-check bypasses, while relying solely on custom session variables (`request.jwt.claim.role` or `request.jwt.claims`) creates a GUC-spoofing bypass in any session capable of calling `set_config()`.

SILVER SPOON resolves both failure modes in `public.internal_is_service_caller()` (Migration `0014`) using a **5-gate conjunctive, fail-closed verification model**:

1. **Kernel-enforced PostgreSQL role verification runs first** (before any JWT GUC is read), eliminating all session-setting spoofing by investors, finance officers, admins, super admins, anonymous visitors, or unprivileged direct database sessions.
2. **Strict role separation** ensures every human persona — `investor`, `finance_officer`, `compliance_officer`, `admin`, and `super_admin` — always executes inside PostgreSQL as the low-privilege `authenticated` role, governed by forced Row Level Security (40/40 tables) and database-backed RBAC (`public.user_roles`), never as `service_role`.
3. **Zero user-supplied JWT claims can override backend authorization**: neither unsigned/forged claims, `user_metadata`, `app_metadata`, custom role claims, malformed JSON claims, nor spoofed session GUCs are ever trusted for RBAC or backend service authorization.

---

## 2. Detailed Evaluation of `public.internal_is_service_caller()`

### 2.1 Evolution & Defect Closure

| Migration | Caller-Check Design | Security Weakness Identified | Resolution |
| :--- | :--- | :--- | :--- |
| `0010` | `current_user IN ('postgres', 'service_role', ...)` inside `SECURITY DEFINER` | `current_user` evaluated to function owner `'postgres'` even when called by `authenticated` investors | Fixed in `0013` |
| `0013` | Checked `request.jwt.claim.role = 'service_role'` **first**, then `current_setting('role', true)`, then `session_user` | Any session able to run `set_config('request.jwt.claim.role', 'service_role', true)` bypassed the active PostgreSQL role check; ignored modern PostgREST JSON `request.jwt.claims`; allowed `sub IS NOT NULL`; conflated `silver_spoon_reconciler` with full treasury privileges | Fixed in `0014` |
| `0014` | **5-gate conjunctive check** requiring kernel-enforced PostgreSQL role **AND** consistent PostgREST JSON/legacy JWT claims **AND** `sub IS NULL`; separate `internal_is_reconciler_caller()` | All impersonation vectors closed and verified against local adversarial tests (Suite F) | Current production-candidate baseline |

### 2.2 Gate-by-Gate Execution Analysis (`Migration 0014`, Lines 32–109)

```sql
v_active_role    := NULLIF(NULLIF(current_setting('role', true), ''), 'none');
v_effective_role := COALESCE(v_active_role, session_user);
```

- **Why `current_setting('role', true)` works safely inside `SECURITY DEFINER`**:
  In PostgreSQL, entering a `SECURITY DEFINER` function modifies the effective user identifier (`current_user`), **not** the session's `role` GUC (`current_setting('role')`) and **not** `session_user`. When Supabase PostgREST runs `SET LOCAL ROLE authenticated` before calling a `SECURITY DEFINER` RPC, `current_setting('role', true)` remains `'authenticated'` throughout the entire nested `SECURITY DEFINER` call stack.

| Gate | Code Path (`Migration 0014`) | Enforcement Mechanism | Result on Failure |
| :---: | :--- | :--- | :--- |
| **Gate 1** | Lines 54–61 | Requires `v_effective_role IN ('service_role', 'silver_spoon_treasury_worker', 'postgres', 'supabase_admin')`. PostgreSQL kernel role membership (`pg_auth_members`) blocks `authenticated`, `anon`, `authenticator`, `silver_spoon_reconciler`, and arbitrary login roles from ever running `SET ROLE` into this set. | Immediate `RETURN false` (no GUC ever trusted) |
| **Gate 2** | Lines 64–85 | Safely parses `request.jwt.claims` (PostgREST v10+/Supabase JSON format) inside `BEGIN ... EXCEPTION WHEN others THEN RETURN false; END;`, rejects non-JSON-object values, and rejects any mismatch between legacy `request.jwt.claim.role` and JSON `request.jwt.claims ->> 'role'`. | Immediate `RETURN false` (fail closed) |
| **Gate 3** | Lines 91–93 | Extracts subject UUID (`v_jwt_sub`) from both `request.jwt.claims ->> 'sub'` and `request.jwt.claim.sub`. Rejects any non-null `sub`. A user-bound JWT can never simultaneously execute as backend `service_role`. | Immediate `RETURN false` |
| **Gate 4** | Lines 97–99 | When `v_effective_role = 'service_role'`, requires **`v_jwt_role = 'service_role'`**. Bare `SET LOCAL ROLE service_role` without a valid service JWT claim is rejected. Matches exact Supabase PostgREST runtime for verified `SUPABASE_SERVICE_ROLE_KEY` requests. | `RETURN false` unless conjunctive condition holds |
| **Gate 5** | Lines 103–107 | When `v_effective_role IN ('silver_spoon_treasury_worker', 'postgres', 'supabase_admin')`, permits `v_jwt_role IS NULL` (direct migrations, seeds, and dedicated worker connections) or `v_jwt_role = 'service_role'`, while rejecting any conflicting non-service JWT role claim (`'authenticated'`, `'anon'`, etc.). | `RETURN false` on conflicting claim; otherwise `RETURN true` |

### 2.3 Reconciler Isolation (`public.internal_is_reconciler_caller()`, Lines 111–162)

- `silver_spoon_reconciler` is **excluded** from `internal_is_service_caller()`.
- Instead, `public.internal_is_reconciler_caller()` authorizes `internal_is_service_caller()` **OR** `v_effective_role = 'silver_spoon_reconciler'` (with `v_jwt_sub IS NULL` and no conflicting JWT role).
- `internal_is_reconciler_caller()` is called **exclusively** inside `public.reconcile_wallet_balance(UUID)`, and `silver_spoon_reconciler` holds `EXECUTE` privilege **exclusively** on `reconcile_wallet_balance(UUID)`.
- Result: Even if a reconciler credential were compromised, it could never settle deposits, settle withdrawals, release failed withdrawal reservations, or mutate ledger balances.

### 2.4 Direct-Call Lockdown on All Internal Primitives (Lines 165–172)

All 7 internal helper/primitive functions explicitly revoke all privileges from **every** non-owner role — including `service_role`:

```sql
REVOKE ALL ON FUNCTION
  public.internal_is_service_caller(),
  public.internal_is_reconciler_caller(),
  public.internal_assert_service_caller(),
  public.internal_get_open_period_id(),
  public.internal_get_system_account_id(TEXT),
  public.internal_post_journal_entry(TEXT, TEXT, TEXT, TEXT, UUID, JSONB, UUID, JSONB),
  public.internal_write_audit_log(UUID, TEXT, TEXT, TEXT, TEXT, public.compliance_severity_enum, JSONB, JSONB, TEXT)
FROM PUBLIC, anon, authenticated, service_role, silver_spoon_treasury_worker, silver_spoon_reconciler;
```

Even a verified backend Edge Function authenticating with `SUPABASE_SERVICE_ROLE_KEY` **cannot** invoke `/rest/v1/rpc/internal_post_journal_entry` or `/rest/v1/rpc/internal_is_service_caller` directly; it may only call the narrowly scoped settlement RPCs (`settle_verified_deposit`, `settle_withdrawal`, `fail_or_decline_withdrawal`, `internal_provision_investor_wallet`, `reconcile_wallet_balance`).

---

## 3. Explicit Security & Trust Assumptions

`public.internal_is_service_caller()` relies on **six explicit trust assumptions**. Each assumption is documented below alongside its enforcement boundary and blast radius if violated:

| # | Trust Assumption | Enforcing Layer | What Happens If Violated & Residual Mitigation |
| :---: | :--- | :--- | :--- |
| **A1** | **PostgREST Cryptographic JWT Verification**: Supabase PostgREST verifies every incoming HTTP `Authorization: Bearer <jwt>` signature against the project JWT secret/JWKS before executing `SET LOCAL ROLE <role>` and populating `request.jwt.claims`. | Supabase API Gateway / PostgREST | If the Supabase JWT signing secret is leaked, an attacker could mint a valid `service_role` JWT. **Mitigation**: Rotate the project JWT secret immediately in Supabase Dashboard; never store JWT secrets in git or browser bundles. |
| **A2** | **No Arbitrary SQL Execution via PostgREST**: HTTP API clients interact exclusively through PostgREST REST queries and whitelisted RPCs; they cannot send raw `RESET ROLE` or `SET ROLE` SQL statements on the `authenticator` connection. | Supabase PostgREST | Even if an RPC somehow allowed `set_config()`, Gate 1 still blocks escalation because PostgreSQL forbids `SET ROLE service_role` while active role is `authenticated` or `anon` (neither is a member of `service_role`). |
| **A3** | **`SUPABASE_SERVICE_ROLE_KEY` Remains Server-Only**: The `service_role` API key is stored solely in server-side Edge Function / backend worker secrets — never in `VITE_*` variables, browser bundles, or staff frontend sessions. | Operational Secret Management + CI/Codebase Audit | On hosted Supabase, `service_role` carries `BYPASSRLS` (`rolbypassrls = true`). Leaking `SUPABASE_SERVICE_ROLE_KEY` allows direct PostgREST access as `service_role`. **Mitigation**: Verified zero references in `src/`, `.env.example`, `package.json`, and `supabase/config.toml`; future backend workers can use dedicated `silver_spoon_treasury_worker` credentials without `BYPASSRLS`. |
| **A4** | **PostgreSQL Role Membership Integrity (`pg_auth_members`)**: Neither `anon`, `authenticated`, `silver_spoon_reconciler`, nor any unprivileged application login role is ever granted membership in `service_role`, `silver_spoon_treasury_worker`, `postgres`, or `supabase_admin`. | PostgreSQL Kernel + Migration Review | Only `authenticator` (PostgREST's internal connection role) holds `GRANT anon, authenticated, service_role TO authenticator`. Never expose `authenticator` database login credentials outside Supabase's managed PostgREST runtime. |
| **A5** | **Database Owner (`postgres` / `supabase_admin`) Credential Custody**: Direct superuser credentials are restricted strictly to schema migrations, seeding in non-production staging, and audited break-glass DBA operations. | Cloud IAM / Secret Vault | Superusers inherently bypass all PostgreSQL security controls (RLS, grants, triggers). Application services must never connect as `postgres`. |
| **A6** | **GoTrue `sub` Integrity & Zero `sub` on Service Keys**: Supabase GoTrue issues end-user JWTs with `role = 'authenticated'` and `sub = <auth.users.id>`, whereas Supabase `service_role` JWTs carry `role = 'service_role'` and no `sub` claim. | Supabase Auth (GoTrue) | Gate 3 explicitly enforces `v_jwt_sub IS NULL`, so even a misconfigured token carrying both `role = 'service_role'` and a `sub` UUID is rejected. |

---

## 4. Role Separation Verification (Investors, Finance Officers, Admins & Backend Roles)

### 4.1 Two-Layer Separation Model

SILVER SPOON enforces strict separation between **PostgreSQL execution roles** (Layer 1) and **application RBAC roles in `public.user_roles`** (Layer 2):

```
┌────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: PostgreSQL Execution Role (Kernel-Enforced via SET LOCAL ROLE)   │
│                                                                            │
│  anon           ──► Public active plans SELECT only (0 RPC EXECUTE grants) │
│  authenticated  ──► ALL human users (investor, finance_officer,            │
│                     compliance_officer, admin, super_admin)                │
│                     • Forced RLS on 40/40 tables                           │
│                     • 0 direct INSERT/UPDATE/DELETE grants on any table    │
│                     • internal_is_service_caller() ALWAYS returns FALSE    │
│  silver_spoon_  ──► reconcile_wallet_balance(UUID) ONLY                    │
│    reconciler       • internal_is_service_caller() ALWAYS returns FALSE    │
│  service_role / ──► Backend settlement & verified failure callbacks ONLY   │
│    treasury_worker  • 0 EXECUTE grants on low-level internal_* primitives  │
└────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼ (for `authenticated` callers only)
┌────────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: Authoritative Application RBAC (`public.user_roles`)              │
│                                                                            │
│  • Never client-editable (REVOKE ALL DML; mutations require dual           │
│    `super_admin` four-eyes via request_role_change + approve_role_change)  │
│  • Anti-role-enumeration: app_has_role / app_has_any_role / app_is_staff / │
│    app_account_can_transact return FALSE for any UUID <> auth.uid()        │
│  • Universal Four-Eyes (`admin_actions`): approver <> initiator AND        │
│    approver <> subject_user_id AND expires_at >= now()                     │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Complete Role Capability & Isolation Matrix

| Role | PG Execution Role | `internal_is_service_caller()` | Can Read Other Users' Wallets/Txns? | Can Read KYC Metadata? | Can Read Ledger / Audit / Batches? | Allowed Financial / Governance RPCs | Strictly Blocked Operations |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| **Anonymous (`anon`)** | `anon` | **`FALSE`** | No | No | No | **None** (`0` RPC grants); `SELECT` active `investment_plans` only | All 48 RPCs; paused/archived plans; all user/ledger/payment tables |
| **Investor** | `authenticated` | **`FALSE`** | No (strict `user_id = auth.uid()` RLS) | Own only | No (`0` rows) | `initialize_deposit`, `request_withdrawal`, `create_investment`, `update_investment_rollover_mode`, `request_bank_account_change`, `update_own_profile`, `submit_kyc_record`, `mark_notification_read` | All staff approvals; `reconcile_wallet_balance`; `fail_or_decline_withdrawal`; `settle_*`; `request_role_change`; `review_kyc_record`; cross-user `app_has_role` |
| **Finance Officer** | `authenticated` | **`FALSE`** | Scoped staff SELECT (RLS) | **No (`0` rows — strictly blocked)** | Yes (read-only SELECT) | `approve_withdrawal_four_eyes`, `create_withdrawal_batch`, `approve_withdrawal_batch_four_eyes`, `fail_or_decline_withdrawal('declined')` (pending only), `request_realized_return_distribution`, `approve_and_distribute_investment_payout`, `mature_investment`, `request/approve` reversals & manual adjustments, `reconcile_wallet_balance`, `approve_bank_account_change`, `request_tax_rule_change` | **Cannot impersonate `service_role`**; cannot call `settle_verified_deposit`, `settle_withdrawal`, or `fail_or_decline_withdrawal('failed')`; cannot decline approved/batched withdrawals; cannot read/review KYC; cannot change roles or platform settings; cannot self-approve or touch own account |
| **Compliance Officer** | `authenticated` | **`FALSE`** | Scoped staff SELECT (RLS) | **Yes (scoped compliance)** | Audit logs & `admin_actions` (not ledger/batches) | `review_kyc_record` (non-self, `submitted`/`under_review` only), `approve_bank_account_change` | Cannot approve withdrawals, batches, payouts, maturities, reversals, manual adjustments, role changes, or platform settings; cannot call `reconcile_wallet_balance` or `settle_*` |
| **Admin** | `authenticated` | **`FALSE`** | Scoped staff SELECT (RLS) | **No (`0` rows — strictly blocked)** | **No** (no ledger, audit logs, payment audit, or batches) | `set_investment_plan_status` | **Cannot impersonate `service_role`**; cannot approve withdrawals, payouts, reversals, adjustments, KYC reviews, role changes, tax rules, or platform settings; cannot call `reconcile_wallet_balance` |
| **Super Admin** | `authenticated` | **`FALSE`** | Scoped staff SELECT (RLS) | Yes | Yes (read-only SELECT) | Dual four-eyes `request/approve_role_change`, `request/approve_platform_setting_change`, `approve_tax_rule_change`, plus independent maker/checker participation in finance/compliance workflows | **Cannot impersonate `service_role`**; cannot call `settle_verified_deposit`, `settle_withdrawal`, or `fail_or_decline_withdrawal('failed')`; cannot self-escalate (`p_target_user_id = v_initiator_id` blocked); cannot self-approve any four-eyes action |
| **Reconciler** | `silver_spoon_reconciler` | **`FALSE`** (`internal_is_reconciler_caller() = TRUE`) | Via `reconcile_wallet_balance` only | No | No direct table grants | `reconcile_wallet_balance(UUID)` **only** | `settle_verified_deposit`, `settle_withdrawal`, `fail_or_decline_withdrawal`, `internal_provision_investor_wallet`, all `internal_*` primitives |
| **Treasury Worker / Backend `service_role`** | `silver_spoon_treasury_worker` / `service_role` | **`TRUE`** (conjunctive gates 1–5) | Server-only | Server-only | Server-only | `internal_provision_investor_wallet`, `settle_verified_deposit`, `settle_withdrawal`, `fail_or_decline_withdrawal`, `reconcile_wallet_balance` | Direct `EXECUTE` on all 7 low-level `internal_*` primitives (`internal_post_journal_entry`, `internal_write_audit_log`, etc.) explicitly revoked; settlement still requires prior four-eyes approval & verified external reference |

---

## 5. Proof That No User-Supplied JWT Claim Can Override Backend Authorization

Every possible JWT-claim manipulation vector has been evaluated against the database schema, RLS policies, and `SECURITY DEFINER` RPCs:

### Vector 1 — Tampering with JWT `role` Claim (e.g., Modifying `"role": "authenticated"` to `"role": "service_role"`)
- **Why it fails**: Supabase PostgREST verifies the JWT cryptographic signature (HS256 / RS256 / ES256) before touching PostgreSQL. Any client-modified JWT payload invalidates the signature and is rejected with HTTP `401 Unauthorized` at the API gateway before a database transaction ever begins.

### Vector 2 — User-Controlled Claims Inside a Valid Signed JWT (`user_metadata`, `app_metadata`, Custom Claims)
- **Why it fails**:
  - Supabase allows end users to update `raw_user_meta_data` (`user_metadata`) via `supabase.auth.updateUser({ data: { role: 'super_admin', is_admin: true } })`.
  - **Zero** RLS policies, **zero** triggers, and **zero** of the 48 PostgreSQL functions in SILVER SPOON ever read `user_metadata`, `raw_user_meta_data`, `app_metadata`, `raw_app_meta_data`, or any custom JWT claim for role or permission checks.
  - Every authorization check resolves roles exclusively from `public.user_roles` (`WHERE user_id = auth.uid() AND revoked_at IS NULL`) via `app_has_role()` / `app_has_any_role()` / `app_is_staff()`.
  - `public.user_roles` has **zero** `INSERT`/`UPDATE`/`DELETE` grants for `authenticated` or `anon`, forced RLS enabled, and can only be modified through dual-`super_admin` four-eyes governance (`request_role_change` + `approve_role_change`).

### Vector 3 — Setting PostgreSQL Custom Session GUCs (`request.jwt.claim.role` and `request.jwt.claims`)
- **Attack payload**:
  ```sql
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claim.sub', '<user_uuid>', true);
  SELECT set_config('request.jwt.claim.role', 'service_role', true);
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
  ```
- **Why it fails**:
  - In `internal_is_service_caller()`, **Gate 1** checks `v_effective_role` (`'authenticated'`) **before** reading either `request.jwt.claim.role` or `request.jwt.claims`, immediately returning `FALSE`.
  - Even if called from a direct unprivileged database role (`adv_direct_user` or `authenticator`), Gate 1 sees `v_effective_role` is not in the 4-role allowlist and returns `FALSE`.
  - Meanwhile, attempting `SET LOCAL ROLE service_role` from an unprivileged session is blocked by the PostgreSQL kernel (`42501 permission denied to set role "service_role"`).

### Vector 4 — Conflicting or Malformed JWT Claim Payloads
- **Attack payload**: `request.jwt.claims = '{not-valid-json'`, `request.jwt.claims = '["service_role"]'`, or `request.jwt.claim.role = 'service_role'` paired with `request.jwt.claims = '{"role":"authenticated"}'`.
- **Why it fails**: **Gate 2** catches all JSON parse errors inside an exception handler, requires `jsonb_typeof(v_claims_json) = 'object'`, and explicitly returns `FALSE` if legacy and JSON role claims disagree.

### Vector 5 — User-Bound `sub` Claim Combined with `service_role`, or Bare `SET LOCAL ROLE service_role`
- **Attack payload**:
  - Case A: `SET LOCAL ROLE service_role` + `request.jwt.claims = '{"role":"service_role","sub":"11111111-..."}'`.
  - Case B: `SET LOCAL ROLE service_role` with empty `request.jwt.claim.role` and empty `request.jwt.claims`.
- **Why it fails**:
  - Case A fails **Gate 3** (`IF v_jwt_sub IS NOT NULL THEN RETURN false`).
  - Case B fails **Gate 4** (`IF v_effective_role = 'service_role' THEN RETURN v_jwt_role = 'service_role'`).

### Vector 6 — Client-Supplied User Identity Parameters & Cross-User RBAC Enumeration
- **Attack payload**: An investor passes another user's UUID into an RPC or calls `SELECT public.app_has_role('<super_admin_uuid>', 'super_admin')`.
- **Why it fails**:
  - No investor/staff transactional RPC accepts a caller `user_id` parameter; every RPC derives the acting identity strictly from `auth.uid()`.
  - `app_has_role`, `app_has_any_role`, `app_is_staff`, and `app_account_can_transact` enforce `IF NOT public.internal_is_service_caller() AND p_user_id IS DISTINCT FROM auth.uid() THEN RETURN false;`. Because Gate 1 prevents GUC spoofing, investors and staff cannot bypass this check to probe other users' roles.

---

## 6. Verification Evidence Matrix (Local Executed vs. Remote Staging Pending)

### 6.1 Local Embedded PostgreSQL Evidence (`npm run test:db` — 28/28 Passed)

| Security Property Verified | Automated Test Location (`scripts/db/run-phase-b-tests.mjs`) | Status (Local PGlite) |
| :--- | :--- | :---: |
| Investor, Finance Officer, Admin & Super Admin blocked from GUC `service_role` impersonation (both legacy & JSON claims) | Suite F, Test 1 | **PASS** |
| Spoofed JWT GUCs cannot bypass anti-role-enumeration (`app_has_role`) | Suite F, Test 1 | **PASS** |
| Direct unprivileged DB role & simulated `authenticator` with spoofed GUCs denied on `settle_verified_deposit` & `settle_withdrawal` | Suite F, Test 2 | **PASS** |
| `service_role` with user `sub` claim rejected (`UNAUTHORIZED_SERVICE_CALL`) | Suite F, Test 2 | **PASS** |
| Bare `SET LOCAL ROLE service_role` without JWT role claim rejected (`UNAUTHORIZED_SERVICE_CALL`) | Suite F, Test 2 | **PASS** |
| Malformed JSON in `request.jwt.claims` fails closed (`UNAUTHORIZED_SERVICE_CALL`) | Suite F, Test 2 | **PASS** |
| Legitimate Supabase PostgREST v10+ JSON `request.jwt.claims = '{"role":"service_role","iss":"supabase"}'` succeeds | Suite F, Test 2 | **PASS** |
| `silver_spoon_reconciler` succeeds on `reconcile_wallet_balance` and is denied on `settle_verified_deposit` | Suite F, Test 2 | **PASS** |
| `anon` has 0 `EXECUTE` grants across all 48 functions; `authenticated` has 0 grants on `internal_*`/settlement RPCs; `service_role` has 0 direct grants on all 7 `internal_*` primitives | Suite F, Test 3 | **PASS** |
| Approved withdrawal cannot be declined by staff (`INVALID_DECLINE_STATE`); cross-user deposit idempotency leak closed; expired approvals rejected; blank keys & Tier 2 daily cap rejected | Suite F, Test 4 | **PASS** |
| All 40 tables enforce `ENABLE` + `FORCE ROW LEVEL SECURITY`; 44/44 `SECURITY DEFINER` functions pin `search_path = public, pg_temp` | Schema Check, Suite B Test 6, Suite E Test 4 | **PASS** |
| Cross-account investor isolation, KYC isolation (Finance Officer sees 0 KYC rows), role escalation & four-eyes self-approval blocked | Suite B Tests 1–5, Suite D Tests 1–4, Suite E Tests 1–3 | **PASS** |

### 6.2 Hosted Supabase Staging Verification Checklist (Pending Dedicated Staging Provisioning)

Once a dedicated non-production Supabase staging project is provisioned and all 14 migrations are pushed (`supabase db push`), execute these live PostgREST checks to confirm hosted parity:

1. **Investor JWT with Tampered `user_metadata`**: Sign in as a synthetic `.invalid` investor, update `user_metadata` with `{"role":"service_role","is_super_admin":true}`, and call:
   - `POST /rest/v1/rpc/reconcile_wallet_balance` → must return `403` / `42501` (`UNAUTHORIZED_RECONCILIATION`).
   - `POST /rest/v1/rpc/settle_verified_deposit` → must return `403` / `42501` (`permission denied`).
   - `POST /rest/v1/rpc/fail_or_decline_withdrawal` with `p_final_status = 'failed'` → must return `403` / `42501` (`VERIFIED_FAILURE_SERVICE_REQUIRED`).
2. **Finance Officer, Admin & Super Admin JWTs**: Verify each staff JWT over HTTPS `/rest/v1/rpc/*`:
   - Cannot call `settle_verified_deposit`, `settle_withdrawal`, `fail_or_decline_withdrawal('failed')`, or `internal_post_journal_entry`.
   - Finance Officer and Admin receive `0` rows from `GET /rest/v1/kyc_records`.
   - Admin receives `0` rows from `GET /rest/v1/journal_entries` and `GET /rest/v1/withdrawal_batches`.
3. **Verified Backend `service_role` JWT (Edge Function / Server Only)**:
   - `POST /rest/v1/rpc/reconcile_wallet_balance` → succeeds (`200 OK`, `is_reconciled: true`).
   - `POST /rest/v1/rpc/internal_post_journal_entry` → fails (`403` / `42501 permission denied`).
4. **Catalog Parity Check**: Confirm on hosted PostgreSQL that `pg_auth_members` grants `service_role` **only** to `authenticator` (never to `anon`, `authenticated`, `silver_spoon_reconciler`, or custom app users), and that `has_schema_privilege('anon'|'authenticated', 'public', 'CREATE')` returns `false`.

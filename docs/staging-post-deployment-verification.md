# SILVER SPOON — Staging Post-Deployment Verification Runbook & Sign-Off Workbook

**Execution Status**: **PENDING — NOT YET EXECUTED**  
**Honesty Statement**: Remote staging deployment and remote validation have **NOT** occurred. All checklists and evidence tables below are prepared templates for operator execution immediately after controlled deployment to a dedicated non-production Supabase staging project.  
**Target Environment**: Dedicated, isolated non-production Supabase Staging PostgreSQL 15+ project ONLY (zero real customers, zero live Paystack keys, `VITE_DATA_PROVIDER=mock` unchanged).

---

## Phase 1: Automated Read-Only Catalog & Security Verification

Immediately after `supabase db push` completes on the dedicated staging project, run the read-only verification suite (enforced with `BEGIN TRANSACTION READ ONLY;`):

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/staging_security_verification.sql \
  > staging_security_verification_output.txt
```

### Expected Pass Criteria (Sections 1–12 of `staging_security_verification.sql`)

| Section | Verification Check | Required Passing Result | Status |
| :---: | :--- | :--- | :---: |
| **1** | PostgreSQL Version & Extensions | `server_version_num >= 150000` (`PASS`); `pgcrypto` status logged | PENDING |
| **2** | Migration History (`supabase_migrations.schema_migrations`) | Notice confirms `14/14` versions (`20261123000100`..`20261123001400`) applied, `0` missing | PENDING |
| **3** | Schema Privileges & `pg_default_acl` | `PUBLIC`, `anon`, `authenticated`, `silver_spoon_reconciler`, `silver_spoon_treasury_worker` all have `CREATE = false`; `USAGE = true` for app/worker roles | PENDING |
| **4** | Roles, `BYPASSRLS` & `pg_auth_members` | `anon`, `authenticated`, `silver_spoon_reconciler`, `silver_spoon_treasury_worker` have `rolsuper=false`, `rolbypassrls=false`, `rolcanlogin=false`; none of `anon`/`authenticated`/`silver_spoon_reconciler` appear as members of `service_role`, `silver_spoon_treasury_worker`, `postgres`, or `supabase_admin` | PENDING |
| **5** | Tables, Ownership, `ENABLE` + `FORCE RLS` & Table Grants | `40/40` tables with `ENABLE` + `FORCE RLS`; `0` unsafe table owners; `0` client DML grants; `anon` `SELECT` strictly limited to `investment_plans` (1 table) | PENDING |
| **6** | RLS Policies | `63` total policies covering all `40` tables; `0` non-`SELECT` client policies; `rls_investment_plans_select_anon` filters `status = 'active'`; KYC/compliance policies restricted to owner + `compliance_officer`/`super_admin` | PENDING |
| **7** | Function Security Attributes | `48` total functions (`44` `SECURITY DEFINER` + `4` invoker triggers); `0` missing `search_path=public, pg_temp`; `0` owned by `anon`/`authenticated`/`service_role`; `0` referencing `user_metadata` or `app_metadata` | PENDING |
| **8** | Function `EXECUTE` Grants & Internal Primitive Lockdown | `0` `PUBLIC`/`anon` function grants; `34` `authenticated` grants; `5` `silver_spoon_treasury_worker` grants; `1` `silver_spoon_reconciler` grant (`reconcile_wallet_balance` ONLY); all `7` `internal_*` primitives have `false` across all 6 non-owner roles (including `service_role`); settlement RPCs blocked for `anon`/`authenticated`/`reconciler` | PENDING |
| **9** | Triggers & Immutability | `24` user triggers active; deferred commit-time balancing trigger (`assert_journal_entry_balanced`) and immutability triggers (`prevent_immutable_mutation`, `guard_tax_applications_immutability`) present | PENDING |
| **10** | Financial Ledger, Payment Providers & Settings | `payment_providers.paystack.is_enabled = false` (no DVA); `9` active system ledger accounts; `>= 1` open financial period; both Tier 2 & Tier 3 withdrawal cap settings present; `0` unbalanced journals; `0` drifted wallets | PENDING |
| **11** | Non-Production Data Hygiene | `0` non-`.invalid` email addresses in `public.profiles`; `0` suspected 11-digit plaintext BVN/NIN values | PENDING |
| **12** | Consolidated Scorecard (`12_SUMMARY_SCORECARD`) | All **14 / 14** scorecard checks = `PASS` (`0` `FAIL`) | PENDING |

*(Optional supplementary query in hosted Supabase SQL Editor to visually inspect the migration table rows directly)*:
```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
-- Expected: 14 rows from 20261123000100 through 20261123001400
```

---

## Phase 2: Synthetic Staging Persona Provisioning (Hosted GoTrue + Domain Seed)

Do **not** use real email addresses, real phone numbers, real BVN/NIN, or real bank accounts.

1. **Create the 8 Synthetic Users via Supabase Auth Admin API** (server-side script or Staging Dashboard using the exact deterministic UUIDs from `supabase/seed/staging_synthetic_seed.sql` and synthetic test passwords kept strictly in ephemeral staging environment variables):
   - `11111111-1111-4111-8111-111111111111` — `investor.one@staging.silverspoon.invalid`
   - `22222222-2222-4222-8222-222222222222` — `investor.two@staging.silverspoon.invalid`
   - `33333333-3333-4333-8333-333333333333` — `finance.a@staging.silverspoon.invalid`
   - `44444444-4444-4444-8444-444444444444` — `finance.b@staging.silverspoon.invalid`
   - `55555555-5555-4555-8555-555555555555` — `compliance.a@staging.silverspoon.invalid`
   - `66666666-6666-4666-8666-666666666666` — `admin.a@staging.silverspoon.invalid`
   - `77777777-7777-4777-8777-777777777777` — `superadmin.a@staging.silverspoon.invalid`
   - `88888888-8888-4888-8888-888888888888` — `superadmin.b@staging.silverspoon.invalid`
2. **Apply Idempotent Domain Seed**:
   ```bash
   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/staging_synthetic_seed.sql
   ```
3. **Re-run `staging_security_verification.sql`** and verify Section 11 (`8` `.invalid` profiles, `0` non-synthetic emails) and Section 10.4 (`2` wallets checked, `0` drifted wallets) both report `PASS`.

---

## Phase 3: Live Hosted PostgREST JWT & Role-Separation Verification

Mint real GoTrue access tokens via `POST $STAGING_SUPABASE_URL/auth/v1/token?grant_type=password` for the synthetic personas (in a temporary staging shell only; never commit tokens). Execute every test below over HTTPS against `$STAGING_SUPABASE_URL/rest/v1/*`:

### 3.1 Cryptographic JWT & Anonymous (`anon`) Boundary
| # | HTTP Request | Expected Hosted PostgREST Response | Status |
| :-: | :--- | :--- | :---: |
| **P1** | `GET /rest/v1/investment_plans?select=plan_code,status` with `apikey: $STAGING_ANON_KEY` (no user JWT) | `200 OK` returning **only** `status = 'active'` plans (pause a plan as Admin to verify paused plans disappear for `anon`) | PENDING |
| **P2** | `GET /rest/v1/profiles` and `GET /rest/v1/wallets` with `apikey: $STAGING_ANON_KEY` | `401` / `403` (`42501 permission denied`) | PENDING |
| **P3** | `POST /rest/v1/rpc/initialize_deposit` with `apikey: $STAGING_ANON_KEY` | `401` / `403` (`42501 permission denied` — `anon` has 0 RPC grants) | PENDING |
| **P4** | `GET /rest/v1/profiles` with a forged/tampered JWT payload (`"role":"service_role"` with invalid signature) | `401 Unauthorized` rejected by PostgREST before PostgreSQL executes | PENDING |

### 3.2 Investor Isolation & Tampered `user_metadata` Non-Override
First update Investor 1's own `user_metadata` via `PUT /auth/v1/user` with `{"data":{"role":"service_role","app_role":"super_admin","is_admin":true}}` and obtain a fresh signed JWT (`$INV1_TAMPERED_JWT`).

| # | HTTP Request (Bearer `$INV1_TAMPERED_JWT`) | Expected Hosted PostgREST Response | Status |
| :-: | :--- | :--- | :---: |
| **P5** | `GET /rest/v1/wallets?select=user_id` | `200 OK` returning **only** Investor 1's wallet (`0` rows for Investor 2) | PENDING |
| **P6** | `GET /rest/v1/journal_entries`, `GET /rest/v1/withdrawal_batches`, `GET /rest/v1/audit_logs`, `GET /rest/v1/payment_providers` | `200 OK` with empty array `[]` (`0` rows — forced RLS) | PENDING |
| **P7** | `POST /rest/v1/wallets` or `PATCH /rest/v1/wallet_balances` | `403` (`42501 permission denied` — zero client DML grants) | PENDING |
| **P8** | `POST /rest/v1/rpc/app_has_role` with `{"p_user_id":"77777777-7777-4777-8777-777777777777","p_role":"super_admin"}` | `200 OK` returning `false` (anti-role-enumeration holds despite tampered `user_metadata`) | PENDING |
| **P9** | `POST /rest/v1/rpc/reconcile_wallet_balance` with Investor 1's wallet UUID | `400`/`403` raising `UNAUTHORIZED_RECONCILIATION` (`internal_is_service_caller() = false`) | PENDING |
| **P10** | `POST /rest/v1/rpc/settle_verified_deposit` and `POST /rest/v1/rpc/internal_post_journal_entry` | `403` (`42501 permission denied`) | PENDING |
| **P11** | `POST /rest/v1/rpc/fail_or_decline_withdrawal` with `p_final_status = 'failed'` | `400`/`403` raising `VERIFIED_FAILURE_SERVICE_REQUIRED` | PENDING |

### 3.3 Staff Role Separation (`finance_officer`, `compliance_officer`, `admin`, `super_admin`)
| # | Caller JWT | HTTP Request | Expected Hosted PostgREST Response | Status |
| :-: | :--- | :--- | :--- | :---: |
| **P12** | **Finance Officer A** | `GET /rest/v1/kyc_records`, `GET /rest/v1/kyc_documents`, `GET /rest/v1/kyc_reviews`, `GET /rest/v1/compliance_events` | `200 OK` returning `[]` (`0` rows — strictly blocked from KYC) | PENDING |
| **P13** | **Finance Officer A** | `POST /rest/v1/rpc/settle_verified_deposit`, `POST /rest/v1/rpc/settle_withdrawal`, `POST /rest/v1/rpc/fail_or_decline_withdrawal` (`'failed'`) | `403` (`permission denied`) on settlement RPCs; `VERIFIED_FAILURE_SERVICE_REQUIRED` on `'failed'` | PENDING |
| **P14** | **Finance Officer B** | `POST /rest/v1/rpc/fail_or_decline_withdrawal` (`'declined'`) on a withdrawal already approved by Finance Officer A | Error `INVALID_DECLINE_STATE` (in-flight withdrawal decline blocked) | PENDING |
| **P15** | **Compliance Officer** | `GET /rest/v1/kyc_records` vs. `GET /rest/v1/journal_entries` & `GET /rest/v1/withdrawal_batches` | Sees KYC records; `0` rows on `journal_entries` and `withdrawal_batches`; denied on `approve_withdrawal_four_eyes` | PENDING |
| **P16** | **Admin** | `GET /rest/v1/kyc_records`, `GET /rest/v1/journal_entries`, `GET /rest/v1/audit_logs`, `GET /rest/v1/withdrawal_batches` | `200 OK` returning `[]` (`0` rows across all four); denied on `reconcile_wallet_balance` and financial approvals | PENDING |
| **P17** | **Super Admin A** | `POST /rest/v1/rpc/request_role_change` targeting self; `POST /rest/v1/rpc/settle_verified_deposit`; `POST /rest/v1/rpc/internal_post_journal_entry` | Self-escalation rejected (`SELF_ROLE_CHANGE_FORBIDDEN`); settlement & internal RPCs rejected (`42501 permission denied`) | PENDING |

### 3.4 Verified Server-Only `service_role` Boundary (Server Terminal Only — Never Browser)
| # | HTTP Request (Server-Side `Authorization: Bearer $STAGING_SERVICE_ROLE_KEY`) | Expected Hosted PostgREST Response | Status |
| :-: | :--- | :--- | :---: |
| **P18** | `POST /rest/v1/rpc/reconcile_wallet_balance` with `{"p_wallet_id":"<inv1_wallet_uuid>"}` | `200 OK` returning `is_reconciled: true` (proves PostgREST v10+ JSON `request.jwt.claims` passes Gates 1–4 of `internal_is_service_caller()`) | PENDING |
| **P19** | `POST /rest/v1/rpc/settle_verified_deposit` for a valid Investor 1 pending deposit | `200 OK` returning `journal_entry_id`; repeating identical call returns exact same `journal_entry_id` with zero double-credit | PENDING |
| **P20** | `POST /rest/v1/rpc/internal_post_journal_entry` and `POST /rest/v1/rpc/internal_is_service_caller` | `403` (`42501 permission denied` — proves Migration `0014` internal primitive lockdown holds on hosted Supabase) | PENDING |

---

## Phase 4: True Multi-Session Concurrency Verification (Two `psql` Terminals)

Open **two independent `psql` connections** (`Session A` and `Session B`) to `$STAGING_DATABASE_URL` (after all 14 migrations and synthetic seed are applied). Execute all 6 scenarios from `supabase/tests/staging_multisession_concurrency.sql` plus the 2 additional Migration `0014` concurrency scenarios below:

| Scenario | Description | Expected Hosted PostgreSQL Locking Outcome | Status |
| :---: | :--- | :--- | :---: |
| **C1** | Concurrent withdrawals exceeding available balance (`staging_multisession_concurrency.sql` Scenario 1) | Session B blocks on `wallet_balances FOR UPDATE` until Session A commits, then fails with `INSUFFICIENT_AVAILABLE_BALANCE` | PENDING |
| **C2** | Duplicate deposit settlement race (`staging_multisession_concurrency.sql` Scenario 2 — also test with JSON `request.jwt.claims = '{"role":"service_role","iss":"supabase"}'`) | Session B blocks on `deposits FOR UPDATE`, observes `settlement_journal_entry_id IS NOT NULL`, returns identical UUID (`0` double-credit) | PENDING |
| **C3** | Concurrent valid wallet reservations fitting available balance (Scenario 3) | Both commit serially without deadlock; `available + reserved = original total_customer_liability_kobo` | PENDING |
| **C4** | Withdrawal vs. investment subscription race (Scenario 4) | Session B blocks on `wallets`/`wallet_balances FOR UPDATE` then fails with `INSUFFICIENT_AVAILABLE_BALANCE` | PENDING |
| **C5** | Duplicate payout settlement race (Scenario 5) | Session B blocks on `withdrawals FOR UPDATE`, returns identical `settlement_journal_entry_id` (`0` duplicate payout) | PENDING |
| **C6** | Competing finance officer approvals on same pending withdrawal (Scenario 6) | Session B blocks on `withdrawals FOR UPDATE` then fails with `INVALID_WITHDRAWAL_STATE` | PENDING |
| **C7** | **Migration 0014 Race**: Two concurrent withdrawals individually under Tier 2 cap (`300M` + `250M` kobo) whose sum exceeds `500M` kobo 24h cap | Session B blocks on `wallet_balances FOR UPDATE`, recalculates rolling 24h sum after Session A commits, and fails with `DAILY_WITHDRAWAL_LIMIT_EXCEEDED` | PENDING |
| **C8** | **Migration 0014 Race**: `create_investment` (`FOR SHARE` lock on `investment_plans`) vs. Admin `set_investment_plan_status('paused')` (`UPDATE` lock on `investment_plans`) | Serialized cleanly without deadlock; if pause commits first, `create_investment` fails with `PLAN_NOT_ACTIVE` | PENDING |

---

## Phase 5: Audit Logging, Immutability, Reconciliation & Backup Sign-Off

Run these final verification checks after Phases 3 and 4 complete:

1. **Audit Trail Completeness**: Confirm `public.audit_logs` recorded entries for every deposit settlement, withdrawal request/approval/settlement, bank detail approval, KYC review, and plan status update performed in Phases 3–4.
2. **Immutability Enforcement**: As `postgres` in a rolled-back test transaction (`BEGIN; UPDATE public.audit_logs ...; ROLLBACK;` and `BEGIN; DELETE FROM public.journal_lines ...; ROLLBACK;`), confirm both raise `IMMUTABLE_RECORD`.
3. **Full Ledger & Wallet Reconciliation**:
   - Execute `SELECT * FROM public.reconcile_wallet_balance(id) FROM public.wallets;` and confirm **every** wallet reports `is_reconciled = true` and `cached_total_liability_kobo = ledger_total_liability_kobo`.
   - Re-run `psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/staging_security_verification.sql` and confirm **14 / 14** scorecard checks remain `PASS` (including `13_zero_unbalanced_journals` and `10.4_wallet_reconciliation_drift = 0`).
4. **Backup & Recovery Verification**:
   - Confirm Supabase Dashboard → Database → Backups shows active daily backup / PITR coverage for the staging project.
   - Archive a schema-only dump (`pg_dump --schema-only "$STAGING_DATABASE_URL" > staging_post_m0014_schema.sql` — never commit credentials) for diffing against future migrations.
5. **Frontend Boundary Confirmation**:
   - Confirm `VITE_DATA_PROVIDER=mock` remains active and zero staging credentials were added to `.env`, `.env.example`, or `src/`.

---

## Operator Sign-Off Record (Complete Only After Remote Execution)

| Gate / Evidence Artifact | Operator | Date (UTC) | Verdict | Notes / Link to Output Log |
| :--- | :--- | :--- | :---: | :--- |
| Phase 1 — `staging_security_verification.sql` (`14/14` PASS) | _TBD_ | _TBD_ | **PENDING** | |
| Phase 2 — Auth Admin API + `staging_synthetic_seed.sql` | _TBD_ | _TBD_ | **PENDING** | |
| Phase 3 — Live PostgREST JWT Tests (`P1`–`P20`) | _TBD_ | _TBD_ | **PENDING** | |
| Phase 4 — Two-Session Concurrency (`C1`–`C8`) | _TBD_ | _TBD_ | **PENDING** | |
| Phase 5 — Immutability, Reconciliation (`0` drift) & Backups | _TBD_ | _TBD_ | **PENDING** | |
| **Phase B.5 Hosted Staging Sign-Off (Prerequisite for Phase C)** | _TBD_ | _TBD_ | **PENDING** | Do not begin Phase C until all rows above are `PASS` |

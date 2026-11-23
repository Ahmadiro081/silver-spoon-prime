# SILVER SPOON — Staging Post-Deployment Verification Runbook & Sign-Off Workbook

**Execution Status**: **IN PROGRESS — PHASE 1 CATALOG QUERIES COMPLETE AT CATALOG LEVEL (VERBATIM ARCHIVAL & ALL RUNTIME/CONCURRENCY SUITES STILL PENDING; NOT PRODUCTION-READY)**  
**Honesty Statement**: Remote migration history (`0001`–`0014`) and verbatim catalog outputs (`Query 0A`, `Query 1`, `Query 2A`, `Query 3A`, `Query 4`, `Query 5A`, `Query 6`) are archived in `docs/remote-staging-verification.md` (with `Query 0A` confirming PostgreSQL `17.12` [`170012 >= 150000`] and extension isolation in `extensions` / `pg_catalog`). In addition, the operator executed and reviewed **Queries `3B`, `3C`, `5B`, `7A`, `7B`, `8A`, `8B`, `9A`–`9D`, `10A`–`10D`, and `11A`–`11C`** externally with the reconciled catalog statuses recorded below (noting explicitly that their exact verbatim CSV transcripts are not yet archived in this repository and no rows have been reconstructed or fabricated). **ALL runtime/concurrency suites (Phases 2–5: synthetic persona seeding, PostgREST JWT security tests, multi-session locking tests, and synthetic wallet/journal runtime tests) remain PENDING (0% executed).**  
**Target Environment**: Dedicated, isolated non-production Supabase Staging PostgreSQL `17.12` project ONLY (zero real customers, Paystack disabled, `VITE_DATA_PROVIDER=mock` unchanged, Migrations `0001`–`0014` frozen, no Migration `0015`, Phase C unauthorized, not production-ready).

---

## Phase 1: Read-Only Catalog & Security Configuration Verification (Catalog Queries Executed — Verbatim Archive & Runtime Closures Pending)

Catalog verification is being executed manually via the Supabase SQL Editor (`docs/remote-staging-verification.md`) and can also be cross-checked via `psql`:

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/staging_security_verification.sql \
  > staging_security_verification_output.txt
```

> **Hosted Supabase Function Inventory Note (`48` App + `1` Infrastructure = `49` Total)**:
> Hosted Supabase pre-installs `public.rls_auto_enable()` — a legitimate PostgreSQL/Supabase infrastructure event-trigger function invoked by enabled event trigger `ensure_rls` (owner `postgres`, `SECURITY DEFINER`, explicit `search_path = pg_catalog`). Exclude `rls_auto_enable` from the **48-function** SILVER SPOON application inventory and classify it separately (**48 application functions + 1 infrastructure event-trigger function = 49 total observed**). Note that `staging_security_verification.sql` (authored for local PGlite parity) checks `COUNT(*) = 48`; use `docs/remote-staging-verification.md` Queries `4`, `5`, `7`, `9`, and `11` for hosted Supabase runs so `rls_auto_enable` is separated cleanly.

> **Accepted Intentional Dual-Audience RPC Grants (Migration `0012` — No Migration `0015`)**:
> - `public.fail_or_decline_withdrawal`: `PUBLIC=false`, `anon=false`, **`authenticated=true`** (Finance Officer / Super Admin decline of eligible `pending_approval` withdrawals), `service_role=true`, `silver_spoon_treasury_worker=true`, `silver_spoon_reconciler=false`. Failed payout release (`'failed'`) strictly requires verified service caller (`internal_is_service_caller()`).
> - `public.reconcile_wallet_balance`: `PUBLIC=false`, `anon=false`, **`authenticated=true`** (Finance Officer / Super Admin on-demand reconciliation), `service_role=true`, `silver_spoon_treasury_worker=true`, `silver_spoon_reconciler=true` (sole reconciler grant). Never mutates wallet balances or posts financial journals.

### Phase 1 Catalog Verification Tracker (Catalog Checks Only — Distinct from Runtime Tests)

| Section | Verification Check | Required Passing Result (Hosted Baseline) | Current Status |
| :---: | :--- | :--- | :---: |
| **1** | PostgreSQL Version & Extensions (`Query 0A`) | `server_version_num >= 150000` (`PASS`); extension placement logged | **PASS** *(Verbatim archived: PostgreSQL `17.12` [`170012`]; `pg_stat_statements@1.11`, `pgcrypto@1.3`, `uuid-ossp@1.1` in `extensions`; `plpgsql@1.0` in `pg_catalog`)* |
| **2** | Migration History (`supabase_migrations.schema_migrations`) | All `14/14` versions (`20261123000100`..`20261123001400`) confirmed | **PASS** *(Confirmed remotely)* |
| **3** | Schema Privileges & `pg_default_acl` (`Query 8A`/`8B`) | `PUBLIC`, `anon`, `authenticated`, `silver_spoon_reconciler`, `silver_spoon_treasury_worker` all have `CREATE = false`; `USAGE = true` for app/worker roles; default ACL posture documented | **PASS WITH OBSERVATION** *(`8A` PASS; `8B` PASS WITH OBSERVATION on Supabase-managed default ACLs; verbatim CSVs not archived in repo)* |
| **4** | Roles, `BYPASSRLS` & `pg_auth_members` (`Query 9D`) | `anon`, `authenticated`, `silver_spoon_reconciler`, `silver_spoon_treasury_worker` have `rolsuper=false`, `rolbypassrls=false`, `rolcanlogin=false`; no unprivileged member of `service_role`/`treasury_worker`/`postgres`/`supabase_admin` | **ASSESSED / PASS (Catalog Level)** *(Operator-reviewed; verbatim CSV not archived in repo)* |
| **5** | Tables, Ownership, `ENABLE` + `FORCE RLS` & Table Grants (`Query 1`, `2A`, `9C`) | `40/40` tables with `ENABLE` + `FORCE RLS` & `postgres` owner (**PASS** verbatim); `0` client DML grants & `anon` `SELECT` on `investment_plans` only (`9C` operator-reviewed **ASSESSED / PASS**) | **PASS (Catalog Level)** *(`1` & `2A` verbatim; `9C` operator-reviewed, verbatim CSV not archived in repo)* |
| **6** | RLS Policies (`Query 3A`, `3B`, `3C`) | `63` `SELECT`-only policies covering `40` tables, `0` JWT metadata reads (`3A` **PASS** verbatim); `0` uncovered tables (`3C` **PASS**); detailed policy review (`3B` **PRELIMINARY PASS** pending helper-function and runtime JWT validation) | **PRELIMINARY PASS** *(`3A` verbatim; `3B` preliminary PASS pending helper-function/runtime validation; `3C` PASS; `3B`/`3C` verbatim CSVs not archived in repo)* |
| **7** | Function Inventory & Security Attributes (`Query 4`, `5A`, `5B`) | `48` app (`44` `SECURITY DEFINER` + `4` triggers, all `search_path = public, pg_temp`, owner `postgres`) + `1` infrastructure event-trigger (`rls_auto_enable`, `search_path = pg_catalog`, owner `postgres`) = `49` total (`4` & `5A` verbatim **PASS**; `5B` operator-reviewed **PASS**) | **PASS** *(`4` & `5A` verbatim; `5B` operator-reviewed, verbatim CSV not archived in repo)* |
| **8** | Function `EXECUTE` Grants & Internal Primitive Lockdown (`Query 6`, `7A`/`7B`, `9A`/`9B`) | All `7/7` `internal_*` primitives = `false` across all 6 non-owner roles including `service_role` (`Query 6` verbatim **PASS**); `0` `PUBLIC`/`anon` grants on 48 app functions (`7A`/`7B` **PASS**); `9A`/`9B` assessed including intentional dual-audience `authenticated` grants on `fail_or_decline_withdrawal` & `reconcile_wallet_balance` | **ASSESSED / PASS (Catalog Level)** *(`6` verbatim; `7A`/`7B` PASS & `9A`/`9B` assessed; verbatim CSVs for `7A`/`7B`/`9A`/`9B` not archived in repo; runtime JWT enforcement pending Phase 3)* |
| **9** | Triggers, Indexes, Constraints & Enums (`Query 11A`–`11C`) | `20` enums, `149` indexes, `24` user triggers (deferred journal balancing + 6 immutability triggers), `2` custom `NOLOGIN` roles, `pg_constraint` breakdown | **PASS (Catalog Level)** *(`11A`–`11C` operator-reviewed; verbatim CSVs not archived in repo)* |
| **10** | Financial Safeguards, Payment Providers & Settings (`Query 10A`–`10D`) | `payment_providers.paystack.is_enabled = false` (no DVA), `9` active system accounts, `>= 1` open period (`10A` **PASS**); M0014 live function guards & `0` JWT metadata reads (`10B`/`10C` **PASS** catalog/function inspection); `0` unbalanced journals & `0` drifted wallets (`10D` **PASS WITH RUNTIME LIMITATIONS** — zero populated wallets/journals in staging) | **PASS WITH RUNTIME LIMITATIONS** *(`10A` PASS; `10B`/`10C` catalog PASS; `10D` runtime-limited due to empty wallets/journals; verbatim CSVs not archived in repo)* |
| **11** | Non-Production Data Hygiene (`Query 10D`) | `0` non-`.invalid` email addresses in `public.profiles`; `0` suspected plaintext BVN/NIN values | **PASS WITH RUNTIME LIMITATIONS** *(Empty pre-seed staging dataset; must re-verify after Phase 2 synthetic seeding)* |
| **12** | Full Catalog Sign-Off | All catalog queries executed (`0A`–`11C`), verbatim CSVs archived for `3B`–`11C`, and preliminary/runtime-limited items (`3B`, `10D`) closed in runtime phases | **IN PROGRESS** *(All catalog queries executed; verbatim CSV archival for `3B`–`11C` and runtime closures in Phases 2–5 pending)* |

#### Verbatim Query 0A Environment Output (Recorded)
```csv
database_name,effective_user,connected_user,pg_version,pg_version_num,relevant_extensions
postgres,postgres,postgres,17.12,170012,"pg_stat_statements@1.11 (extensions), pgcrypto@1.3 (extensions), plpgsql@1.0 (pg_catalog), uuid-ossp@1.1 (extensions)"
```

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

| Gate / Evidence Artifact | Scope Type | Operator | Date (UTC) | Verdict | Notes / Link to Output Log |
| :--- | :---: | :--- | :--- | :---: | :--- |
| Phase 1 — Remote Catalog & Security Checks (`docs/remote-staging-verification.md`) | Catalog | _In Progress_ | _In Progress_ | **IN PROGRESS** | `0A (PG 17.12), 0B, 1, 2A, 3A, 4, 5A, 6` verbatim/confirmed PASS; `3B` preliminary PASS; `3C, 5B, 7A/7B, 8A, 10A` PASS; `8B` PASS w/ observation; `9A–9D` assessed; `10B/10C, 11A–11C` catalog PASS; `10D` PASS w/ runtime limitations; **verbatim CSVs for `3B`–`11C` not archived in repo** |
| Phase 2 — Auth Admin API + `staging_synthetic_seed.sql` | Runtime Setup | _TBD_ | _TBD_ | **PENDING** | Synthetic `.invalid` users not yet provisioned |
| Phase 3 — Live PostgREST JWT Tests (`P1`–`P20`) | Runtime Security | _TBD_ | _TBD_ | **PENDING** | Not yet executed remotely (required to close `3B` helper/RLS & `9A`–`9D` runtime validation) |
| Phase 4 — Two-Session Concurrency & Locking (`C1`–`C8`) | Runtime Concurrency | _TBD_ | _TBD_ | **PENDING** | Actual multi-session locking tests not yet executed |
| Phase 5 — Synthetic Wallet/Journal Runtime, Immutability, Reconciliation & Backups | Runtime Integrity | _TBD_ | _TBD_ | **PENDING** | Not yet executed remotely (required to resolve `10D` empty-dataset runtime limitation) |
| **Phase B.5 Hosted Staging Sign-Off (Prerequisite for Phase C)** | Release Gate | _TBD_ | _TBD_ | **PENDING** | **Not production-ready; Phase C remains unauthorized** until verbatim archive and ALL runtime/concurrency gates above are `PASS` |

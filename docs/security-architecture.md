# SILVER SPOON — Security, Governance & Authorization Architecture

**Status**: Phase B.5 Security Hardening Implemented & Locally Verified (`20261123001000`–`20261123001300`: 40/40 tables with `ENABLE` + `FORCE ROW LEVEL SECURITY`, 63 RLS policies, 43/43 `SECURITY DEFINER` functions with pinned `search_path = public, pg_temp`, verified via 24/24 local PGlite tests; remote Supabase staging verification pending dedicated staging project provisioning).  
**Security Posture**: Defense-in-depth — zero trust in frontend state, restrictive PostgreSQL grants (`REVOKE ALL` + explicit `REVOKE CREATE ON SCHEMA public`), mandatory table-specific forced RLS, universal four-eyes financial/governance controls, scheduled treasury settlement, and vendor-agnostic KYC due diligence.

> **Non-Production & Regulatory Notice**  
> No live authentication, live payment processing, real KYC collection, or customer fund custody is enabled or authorized in Phase B / B.5. `payment_providers.is_enabled` is seeded `false` and `VITE_DATA_PROVIDER=mock` remains active. Regulatory registrations, SEC/CBN authorizations, custodian agreements, and payment provider approvals are **not** represented as already obtained.

---

## 1. Role-Based Authorization (5-Role RBAC)

User roles are stored exclusively in `public.user_roles` (never in `auth.users.raw_user_meta_data`, JWT custom claims editable by clients, or browser `localStorage`). Active role resolution uses hardened `SECURITY DEFINER` PostgreSQL helpers (`app_has_role(auth.uid(), 'finance_officer')`) declared with `SET search_path = public, pg_temp` querying `WHERE revoked_at IS NULL`.

| Role | Scope of Authority | Explicit Prohibitions |
| :--- | :--- | :--- |
| **`investor`** | Own profile, own NGN subledger wallet, own checkout deposits, withdrawal requests, investment subscriptions, referrals, notifications, own KYC submission. | Cannot read or modify any other user's records; cannot alter roles, tier, KYC level, tax rules, or balances; cannot approve any financial or bank-detail change. |
| **`compliance_officer`** | KYC review queue, audited signed URLs for private KYC documents, AML/PEP/sanctions `compliance_events`, wallet freeze / account suspension. | Cannot approve withdrawals or payouts, cannot post ledger adjustments/reversals, cannot alter investment plans or staff roles. |
| **`finance_officer`** | Withdrawal verification, scheduled treasury batch preparation or independent approval (never both), deposit reconciliation, maturity settlement, realized-return distribution, wallet-ledger & bank/custodian reconciliation. | Cannot approve any transaction, batch, adjustment, or distribution they initiated (`approver_user_id <> initiator_user_id`); cannot approve own withdrawal; cannot alter roles or KYC decisions. |
| **`admin`** | Investment plan lifecycle management (draft/active/paused/archived), client tier updates, broadcast notifications, read-only operational analytics. | Cannot execute unverified ledger credits, cannot grant/revoke roles, cannot bypass four-eyes approvals, cannot modify treasury settlement settings unilaterally. |
| **`super_admin`** | Initiating or independently approving staff role grants/revocations, `platform_settings` / `tax_rules` changes, financial period closing, and high-risk reversals/adjustments. | Subject to strict **self-approval prohibition** on every four-eyes-protected operation; every action requires justification and emits immutable `admin_actions` + `audit_logs`. |

---

## 2. Universal Four-Eyes (Maker-Checker) Approval Controls (ADR-003)

Dual-operator control is enforced structurally in PostgreSQL via `admin_actions` (`CHECK (approver_user_id IS NULL OR approver_user_id <> initiator_user_id)`), `withdrawals` (`CHECK (approved_by IS NULL OR approved_by <> user_id)`), and `withdrawal_batches` (`CHECK (approved_by IS NULL OR approved_by <> prepared_by)`).

### 2.1 Mandatory Non-Self-Approval Rule
**An initiator must NEVER approve their own transaction or administrative action.** Self-approval is rejected at both the `SECURITY DEFINER` RPC layer and PostgreSQL table `CHECK` constraints.

### 2.2 Operations Requiring Mandatory Independent Approval + Immutable Audit Log
In the initial operating model, **no exemption threshold applies** to investor payouts—independent approval is required for **ALL** of the following:
1. **All Investor Withdrawals & Payouts** (every withdrawal request and every scheduled treasury payout batch, regardless of Naira amount).
2. **Manual Ledger Adjustments** (any non-automated correction or treasury reconciliation entry).
3. **Posted Transaction Reversals** (`reverse_transaction`, strictly via reversing `journal_entries`).
4. **Realized-Return Distributions** (`distribute_investment_payout`, verified against external treasury yield cash and configurable `tax_rules`).
5. **Changes to Investor or Treasury Bank Details** (`wallet_accounts` additions/updates and payout destination changes).
6. **Role Grants & Revocations** (`user_roles` assignments, escalations, and revocations).
7. **Sensitive Treasury & Tax Configuration Changes** (`platform_settings` limits/fees/settlement windows, `tax_rules` updates, and `financial_periods` closures).

---

## 3. Restrictive PostgreSQL Grants, Controlled RPCs & Table-Specific RLS (ADR-009)

### 3.1 Least-Privilege Database Grants & `service_role` `BYPASSRLS` Containment
Migrations enforce a deny-by-default privilege posture (Migrations `0012` & `0013`):
```sql
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, silver_spoon_treasury_worker, silver_spoon_reconciler;
-- Explicit table-level SELECT only where RLS-protected client reads are required.
-- Explicit EXECUTE granted ONLY on audited, parameter-validated RPC functions.
```
- **Supabase `service_role` `BYPASSRLS` Handling**: On hosted Supabase, `service_role` carries `BYPASSRLS` (`rolbypassrls = true`), meaning it bypasses even `FORCE ROW LEVEL SECURITY`. Consequently, `service_role` keys MUST NEVER be bundled into browser code or used by staff UI sessions; staff actions execute exclusively under each staff member's authenticated JWT (`authenticated` role + `auth.uid()`), while `service_role` is strictly confined to server-side webhook/settlement Edge Functions and reconciliation jobs that enforce independent provider verification and idempotency before calling settlement RPCs.

### 3.2 Hardened `SECURITY DEFINER` RPC Standards (43/43 Verified)
Every financial or privileged RPC MUST:
- Be owned strictly by a privileged migration owner (`postgres` / `supabase_admin`) and declare `SECURITY DEFINER SET search_path = public, pg_temp` with explicitly schema-qualified references (`public.*`, `auth.uid()`).
- **Accurate Caller-Role Detection (Migration 0013)**: Never rely on `current_user` inside a `SECURITY DEFINER` function (which resolves to the function owner). Always use `public.internal_is_service_caller()` inspecting `request.jwt.claim.role`, `current_setting('role', true)`, and `session_user`.
- Read caller identity strictly from `auth.uid()` (never accept client-supplied `actor_id` or `role`).
- Prevent cross-user role enumeration: `app_has_role`, `app_has_any_role`, `app_is_staff`, and `app_account_can_transact` return `false` if a non-service caller probes any UUID other than `auth.uid()`.
- Verify account status (`active`, not `suspended`/`closed`/`frozen`) and active `public.user_roles` membership.
- Acquire deterministic `SELECT ... FOR UPDATE` row locks before reading/mutating balances or approval states, enforce idempotency keys, and write `audit_logs` within the same ACID transaction.

### 3.3 Table-Specific Row Level Security (`ENABLE` + `FORCE ROW LEVEL SECURITY` on 40/40 Tables — 63 Policies)

| Table Group | `SELECT` Policy | `INSERT` / `UPDATE` / `DELETE` Policy |
| :--- | :--- | :--- |
| `profiles`, `wallets`, `wallet_balances`, `wallet_accounts` | Investor: own row (`user_id = auth.uid()` or `id = auth.uid()`); Authorized staff via `app_has_role()` | Direct client DML **DENIED**. All writes flow through validated RPCs (`update_own_profile`, `request_bank_account_change`). `DELETE` denied globally. |
| `journal_entries`, `journal_lines`, `ledger_accounts`, `financial_periods` | `finance_officer`, `super_admin` only | Direct client DML **DENIED**. `UPDATE`/`DELETE` unconditionally blocked by DB triggers (append-only). |
| `transactions`, `deposits`, `withdrawals`, `withdrawal_batches`, `transaction_fees`, `transaction_references` | Investor: own `transactions`/`deposits`/`withdrawals` only (zero visibility into `withdrawal_batches`); Staff: role-scoped | Direct client DML **DENIED**. Writes allowed exclusively via financial & treasury RPCs. |
| `tax_rules`, `tax_applications` | `tax_rules`: authenticated read of active rules; `tax_applications`: investor own rows + `finance_officer`/`super_admin` | Direct client DML **DENIED**. `tax_rules` modified only via four-eyes `super_admin` RPC; `tax_applications` append-only. |
| `investments`, `investment_allocations`, `investment_payouts`, `investment_maturities` | Investor: own `investments`/`investment_payouts`/`investment_maturities` (`user_id = auth.uid()`); Staff: role-scoped | Direct client DML **DENIED**. Writes via `create_investment`, `update_investment_rollover_mode`, `mature_investment`, `distribute_investment_payout` RPCs only. |
| `investment_plans` | **Anonymous (`anon`)**: `status = 'active'` **ONLY** (`paused` and `archived` hidden); **Authenticated Investors**: `status = 'active'` OR plans where the investor holds an existing `investments` position; **Staff**: All | `admin`/`super_admin` via RPC only; `DELETE` denied (archive only). |
| `referrals`, `referral_commissions`, `referral_settings` | Investor: `referrer_user_id = auth.uid()`; Staff: role-scoped | RPC-only; commission payout requires four-eyes approval. |
| `kyc_records`, `kyc_documents`, `kyc_reviews`, `compliance_events` | Investor: own `kyc_records`/`kyc_documents` metadata only; `compliance_officer`/`super_admin`: All (Finance & Admin blocked) | Investor submits own KYC via RPC; reviews & compliance events strictly `compliance_officer`/`super_admin` via RPC. `DELETE` denied. |
| `user_roles`, `platform_settings`, `audit_logs`, `admin_actions` | `user_roles`: own + `admin`/`super_admin`; `admin_actions`/`audit_logs`: scoped staff only | `user_roles`/`platform_settings`: four-eyes `super_admin` RPC only; `audit_logs`: append-only trigger (no `UPDATE`/`DELETE`). |
| `payment_providers`, `payment_references`, `payment_events`, `webhook_logs` | `finance_officer`, `super_admin` only | Server-side Edge Functions only; zero investor visibility. |

---

## 4. Payment Channels, Webhook Verification & Scheduled Withdrawal Operations (ADR-002, ADR-007)

### 4.1 Initial Payment Channel Scope
- **Authorized Future Scope (Subject to Approvals)**: **Paystack Checkout (card and bank transfer)** only, strictly contingent on written Paystack approval and approved custody/fund-flow arrangements.
- **Deferred**: Dedicated Virtual Accounts (DVAs) are explicitly deferred from the initial architecture.
- **Current Phase A Posture**: **No live Paystack integration is authorized.**

### 4.2 Scheduled Treasury Settlement for Withdrawals (No Immediate Auto-Disbursement)
The initial withdrawal operating model uses **scheduled treasury settlement** with mandatory four-eyes approval:
1. **Reservation**: Investor calls `request_withdrawal` → RPC locks wallet, validates KYC/limits/verified NUBAN, debits `2010-{USER}-AVAIL`, credits `2020-{USER}-RESV`, assigns an idempotent `payout_idempotency_ref`, and sets status `pending_approval`.
2. **Independent Four-Eyes Approval**: A qualified finance/treasury approver (distinct from the initiator and the investor) reviews and approves the withdrawal into a scheduled `withdrawal_batches` window, generating an immutable `admin_actions` + `audit_logs` record.
3. **Scheduled Batch Release**: At the scheduled settlement window, an independent second reviewer verifies batch totals against external treasury bank liquidity before triggering payout execution with deterministic idempotent references.
4. **Verified Settlement Finalization & Verified-Failure Release**: Funds are debited from `2020-{USER}-RESV` against `1020-TREASURY-BANK` (and any applicable fee/tax accounts) **only after verified settlement confirmation**. Failed payout reservations may **only** be released back to `2010-{USER}-AVAIL` via a verified backend `service_role` / `silver_spoon_treasury_worker` failure callback (enforced in Migration `0013`); pre-disbursement declines require independent `finance_officer`/`super_admin` action (blocking self-decline).

> **Strict Settlement Rule**: **Never release funds, mark a deposit credited, or finalize a withdrawal settlement based solely on a client-side response or an unverified webhook.**

### 4.3 Mandatory 6-Stage Webhook Verification & Replay Prevention
Every incoming payment webhook MUST pass all 6 controls prior to any ledger write:
1. **Constant-Time HMAC-SHA512 Signature Verification** over the raw request body using server-only `PAYSTACK_SECRET_KEY`.
2. **Audit-First Logging**: Persist every request (valid or invalid) to `webhook_logs` with `signature_valid`, `source_ip`, and HTTP status; reject invalid signatures with HTTP `401`.
3. **Database-Level Event Deduplication**: Insert `(provider_id, provider_event_id, event_type)` into `payment_events` (`UNIQUE` constraint); duplicates return HTTP `200` without re-posting.
4. **Independent Server-Side Provider Re-Verification**: Query Paystack's verification API directly over TLS to confirm `status`, `currency = 'NGN'`, exact `amount` in kobo, and reference match before posting any ledger credit or payout finalization.
5. **Atomic Row-Locked Settlement**: Settlement RPC acquires `FOR UPDATE` locks and checks `settlement_journal_entry_id IS NULL`.
6. **Secret & Role Segregation**: Browser builds may never embed `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, or KYC provider secrets. Staff actions always execute under the staff member's own authenticated JWT so PostgreSQL RLS and `auth.uid()` enforce attribution.

---

## 5. KYC Provider Evaluation Framework (ADR-006 — No Provider Selected Yet)

SILVER SPOON has **not** selected a KYC vendor. Before any KYC integration or collection of real customer BVN/NIN/identity documents is authorized, candidate vendors MUST be formally evaluated and scored against all 9 mandatory criteria:

| Evaluation Dimension | Mandatory Assessment Criteria & Evidence Required |
| :--- | :--- |
| **1. Regulatory Authorization** | Verified licensing/authorization to access Nigerian identity registries (NIBSS/NIMC authorized aggregator/verification status), valid Nigerian corporate registration, and formal letter of authority. |
| **2. BVN / NIN Verification** | Direct real-time verification against authoritative NIBSS (BVN) and NIMC (NIN) sources; support for exact name, DOB, and phone matching; deterministic mismatch error codes; minimal-data response modes. |
| **3. Liveness & Biometric Checks** | Active/passive liveness detection resistant to spoofing (print, replay, deepfake attacks), facial match scoring against government ID/BVN/NIN photo, and configurable confidence thresholds with manual compliance escalation. |
| **4. PEP & Sanctions Screening** | Continuous/onboarding screening against UN, OFAC, EU, UK, and Nigerian/NFIU sanctions lists, Politically Exposed Persons (PEP) registries, and adverse media, with audit-ready match disposition logs. |
| **5. Security Posture** | Independent security certifications (ISO 27001 / SOC 2 Type II), recent third-party penetration test reports, TLS 1.3 in transit, AES-256 encryption at rest, webhook signature verification, key rotation, and incident response SLAs (≤ 24–72h breach notification). |
| **6. Data Retention & Minimization** | Configurable vendor-side retention windows (zero unnecessary persistence of raw biometrics/ID images after verification), documented secure deletion procedures, and alignment with MLPPA 2022 5-year statutory retention held under SILVER SPOON's controlled private storage. |
| **7. NDPA 2023 Compliance** | Full compliance with the Nigeria Data Protection Act 2023: executed Data Processing Agreement (DPA), lawful basis & explicit consent capture support, Data Protection Officer (DPO) contact, Data Protection Impact Assessment (DPIA) artifacts, and NDPC registration evidence. |
| **8. Subprocessors** | Complete disclosure of all fourth-party subprocessors (cloud hosting, OCR, biometric ML, sanctions feeds), contractual flow-down security obligations, and advance written notice rights before subprocessor changes. |
| **9. Cross-Border Data Transfers** | Explicit data residency map identifying where Nigerian identity/biometric data is processed or stored; verification of NDPA 2023 cross-border adequacy safeguards, Standard Contractual Clauses (SCCs), or local Nigerian data hosting options. |

**Phase A Constraint**: Zero real BVN, NIN, government ID uploads, or live KYC API keys are permitted in the repository or runtime environment until vendor selection, DPIA sign-off, and legal/compliance approval are completed.

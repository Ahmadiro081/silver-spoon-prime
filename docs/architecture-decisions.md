# SILVER SPOON — Architecture Decision Record (ADR) Register

**Document Version**: Phase B Non-Production PostgreSQL Foundation Baseline  
**Active Runtime Mode**: `VITE_DATA_PROVIDER=mock` (Standalone Frontend — Non-Production Preparation Only)  
**Authorization Status**: Phase A completed; Phase B SQL migrations authored and locally verified on embedded PostgreSQL (remote staging push pending dedicated staging project credentials; **Phase C live Auth / frontend cutover NOT yet authorized**).

---

## 1. Approved Architecture Decisions

### ADR-001: Custody, Regulatory Structure & Internal Subledger Boundary
- **Status**: Approved
- **Decision**:
  - Structure the intended production operating model around an appropriately **SEC-registered investment manager**, an independent **trustee/custodian**, and a **regulated banking partner**.
  - Design and operate SILVER SPOON's PostgreSQL double-entry ledger strictly as an **internal accounting subledger** recording client entitlements, allocations, withdrawal reservations, fees, taxes, and realized distributions.
  - Explicitly prohibit representing the PostgreSQL ledger as a substitute for actual legal custody or regulated bank account balances.
  - Explicitly prohibit representing any regulatory registration, SEC/CBN authorization, trustee/custodian appointment, or banking/payment partnership as already obtained.
- **Consequences**: All documentation, database schemas, and reconciliation procedures treat bank and custodian statements as the external source of truth against which internal subledger control accounts (`1010`, `1020`, `1030`) are reconciled daily.

### ADR-002: Initial Payment Channels — Paystack Checkout Only (DVAs Deferred)
- **Status**: Approved
- **Decision**:
  - Scope the proposed initial payment collection architecture exclusively to **Paystack Checkout for card and bank transfer**, strictly subject to written Paystack approval and approved custody/fund-flow arrangements.
  - Defer **Dedicated Virtual Accounts (DVAs)** from the initial release.
  - Maintain zero live Paystack SDK/API integration during Phase A.
- **Consequences**: `wallet_accounts` initially tracks verified payout NUBAN bank accounts only; deposit initialization and verification flows target Paystack Checkout references exclusively.

### ADR-003: Universal Four-Eyes (Maker-Checker) Approval Controls
- **Status**: Approved
- **Decision**:
  - Initially require **independent four-eyes approval** (`approver_user_id <> initiator_user_id`) for **ALL investor withdrawals and payouts** (zero exemption threshold).
  - Strictly prohibit any initiator from ever approving their own transaction, enforced at both PostgreSQL `CHECK` constraints and `SECURITY DEFINER` RPC levels.
  - Require independent four-eyes approval and immutable `audit_logs` + `admin_actions` records for all high-risk operations:
    1. All investor withdrawals and payouts (and scheduled payout batches)
    2. Manual ledger adjustments
    3. Posted transaction reversals
    4. Realized-return distributions
    5. Changes to bank details (`wallet_accounts` and treasury settlement accounts)
    6. Staff role grants and revocations (`user_roles`)
    7. Sensitive treasury, fee, limit, and tax configuration changes (`platform_settings`, `tax_rules`, `financial_periods`)
- **Consequences**: Eliminates single-operator fraud/error paths across treasury, ledger, and RBAC operations.

### ADR-004: Configurable Statutory Tax Rules Engine (No Hard-Coded WHT / EMTL)
- **Status**: Approved
- **Decision**:
  - Prohibit hard-coding a universal `10% WHT` or `₦50 EMTL` deduction anywhere in SQL or application logic.
  - Model statutory taxation through dedicated `tax_rules` and immutable `tax_applications` tables supporting:
    - Instrument type (`instrument_type`)
    - Investor classification (`investor_classification`)
    - Applicable exemptions (`exemption_code`, `exemption_applied`)
    - Effective validity windows (`effective_from`, `effective_to`)
    - Gross, tax, and net kobo amounts (`gross_amount_kobo`, `tax_amount_kobo`, `net_amount_kobo`)
    - Applied tax rate (`tax_rate_bps` / `fixed_amount_kobo`) and statutory `legal_basis`
    - Tax remittance tracking (`remittance_reference`, `remitted_at`)
- **Consequences**: Accommodates Nigerian tax exemptions (e.g., eligible FGN securities, tax-exempt institutions) and future Finance Act / FIRS rate amendments without code redeployment or retroactive distortion of historical ledgers.

### ADR-005: Auto-Compound Policy & Paused/Archived Plan Guardrail
- **Status**: Approved
- **Decision**:
  - Default investment rollover behavior to **principal-only rollover** (`rollover_mode = 'principal_only'`).
  - Permit **principal + net realized returns** compounding (`rollover_mode = 'principal_plus_net_return'`) ONLY when BOTH:
    1. Explicitly consented to by the investor (`return_compounding_consented_at IS NOT NULL` + audit log); AND
    2. Permitted by approved investment product terms (`investment_plans.allows_return_compounding = true`).
  - **Strictly prohibit** rolling funds automatically into any `paused` or `archived` investment plan. At maturity, if the target plan is not `active`, the RPC must settle principal and net realized return to `available_kobo` (`2010-{USER}-AVAIL`), log the fallback disposition, and notify the investor.
- **Consequences**: Protects investors from unintended capital reinvestment into suspended or retired mandates and ensures contractual consent compliance.

### ADR-006: Vendor-Agnostic KYC Preparation & 9-Dimension Evaluation Framework
- **Status**: Approved
- **Decision**:
  - Defer selection of a KYC verification provider until formal legal, compliance, and security vendor due diligence is completed.
  - Adopt the 9-dimension evaluation framework in `docs/security-architecture.md` Section 5 covering: (1) regulatory authorization, (2) BVN/NIN verification, (3) liveness checks, (4) PEP/sanctions screening, (5) security posture, (6) data retention, (7) NDPA 2023 compliance, (8) subprocessors, and (9) cross-border data transfers.
  - Keep `kyc_records` and `kyc_documents` schema designs strictly vendor-agnostic.
- **Consequences**: Prevents premature vendor lock-in and ensures NDPA 2023 and NIBSS/NIMC compliance prior to handling any real identity data.

### ADR-007: Scheduled Treasury Settlement for Withdrawals
- **Status**: Approved
- **Decision**:
  - Operate investor withdrawals under a **scheduled treasury settlement** model (`withdrawal_batches`) with independent four-eyes approval rather than immediate automated disbursement.
  - Require deterministic idempotent payout references (`payout_idempotency_ref`), atomic balance reservation (`2010-{USER}-AVAIL` → `2020-{USER}-RESV`), verified settlement status confirmation before final debiting, and daily reconciliation.
  - Strictly prohibit releasing funds or finalizing settlements based solely on a client-side response or an unverified webhook.
- **Consequences**: Aligns outbound cash release with custodian/banking liquidity cycles, reduces operational loss exposure, and guarantees idempotent settlement accounting.

### ADR-008: Static Reference Data Extraction from Mock Seed Database
- **Status**: Approved & **Completed in Phase A**
- **Decision**:
  - Extract static reference/editorial catalogs (`NIGERIAN_BANKS`, `PUBLIC_STATS`, `TESTIMONIALS`, `FAQ_ITEMS`) out of `src/data/mockDatabase.ts` into dedicated static modules (`src/data/nigerianBanks.ts` and `src/data/publicContent.ts`), updating consuming pages while preserving 100% of existing UI behavior.
- **Consequences**: Zero UI pages or components now import `src/data/mockDatabase.ts`; transactional mock seeds are fully isolated behind `src/services/mockDataProvider.ts`.

### ADR-009: Core Database & Financial Ledger Technical Safeguards
- **Status**: Approved
- **Decision**: Enforce all 9 mandatory technical invariants in Phase B–F database implementations:
  1. **Non-Double-Counted Customer Liability Formula**: `Total Customer Liability = available_kobo + reserved_withdrawal_kobo + invested_principal_kobo` across mutually exclusive sub-ledgers (`2010-{USER}-AVAIL`, `2020-{USER}-RESV`, `2030-{USER}-INV`).
  2. **Commit-Time Journal Balancing**: `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` ensuring $\sum \text{debits} = \sum \text{credits}$ on every committed `journal_entry`.
  3. **Atomic Financial Posting**: Single ACID database transaction covering operational rows, journal lines, tax lines, balance caches, and audit logs.
  4. **Idempotency & Deterministic Row-Level Locking**: Unique idempotency keys + fixed-order `SELECT ... FOR UPDATE` locking.
  5. **Append-Only Journal & Audit Records**: `BEFORE UPDATE OR DELETE` blocking triggers; reversing entries only (`UNIQUE(reverses_entry_id)`).
  6. **Controlled `SECURITY DEFINER` RPCs**: `SET search_path = public, pg_temp`, `auth.uid()` caller identity, strict `user_roles` validation.
  7. **Restrictive Database Grants**: `REVOKE ALL` from `PUBLIC`/`anon`/`authenticated`; explicit least-privilege grants only.
  8. **Table-Specific RLS Policies**: `ENABLE` + `FORCE ROW LEVEL SECURITY` on every public table.
  9. **Continuous Reconciliation**: `reconcile_wallet_balance` verifying cached `wallet_balances` against `SUM(journal_lines)` and external bank/custodian statements.

### ADR-010: Strict Non-Production Implementation Boundary
- **Status**: Approved & Enforced (Phase A & Phase B)
- **Decision**: Restrict Phase A and Phase B strictly to non-production frontend hardening, static catalog extraction, standby provider scaffolding, architecture/security documentation, and isolated non-production PostgreSQL migrations + synthetic tests.
- **Explicitly Prohibited Until Separately Authorized**:
  - Connecting to or migrating any existing production database
  - Enabling live Supabase Authentication or switching `VITE_DATA_PROVIDER` away from `mock`
  - Connecting live Paystack APIs, setting `payment_providers.is_enabled = true`, or embedding live payment credentials
  - Collecting real BVN/NIN or uploading real KYC identity documents
  - Accepting real deposits, processing real withdrawals, or holding/investing customer funds
  - Launching public investment solicitation

### ADR-011: Local Embedded PostgreSQL Verification vs. Remote Staging Deployment Distinction
- **Status**: Approved & Executed (Phase B)
- **Decision**:
  - When a dedicated, isolated remote Supabase staging project is unavailable in the local workspace, execute all unmodified production-format SQL migrations (`supabase/migrations/*.sql`) and automated security/financial tests against an isolated embedded PostgreSQL engine (`@electric-sql/pglite`) using a clean Supabase Auth JWT shim (`supabase/tests/harness_supabase_shim.sql`) rather than connecting to any other remote database.
  - Clearly distinguish **locally verified SQL migrations** from **deployed remote staging database objects**, and require execution of `supabase/tests/staging_multisession_concurrency.sql` on the remote staging instance once provisioned to confirm multi-connection `SELECT ... FOR UPDATE` lock blocking.
- **Consequences**: Zero risk of contaminating external databases while guaranteeing 100% real PostgreSQL DDL, trigger, constraint, RLS, grant, and RPC execution verification before remote staging push.

---

## 2. Unresolved Issues & Open Decisions

| ID | Open Issue | Owner | Required Resolution Before |
| :--- | :--- | :--- | :--- |
| **OPEN-01** | **Regulatory & Custody Legal Structure**: Engagement and signed agreements with an appropriately SEC-registered investment manager, independent trustee/custodian, and regulated Nigerian banking partner, plus documented custody fund-flow diagram. | Legal / Executive | Production launch & live fund flows |
| **OPEN-02** | **Paystack Written Approval**: Written merchant/business approval from Paystack for Checkout (card + bank transfer) aligned to the approved investment/custody fund flow. | Compliance / Partnerships | Phase H payment integration |
| **OPEN-03** | **KYC Vendor Selection & DPIA**: Formal scoring of candidate KYC vendors against the 9-dimension framework (ADR-006), NDPA 2023 DPIA completion, and DPA execution. | Compliance / Security | Phase G KYC integration |
| **OPEN-04** | **Statutory Tax Schedule Sign-Off**: Written Nigerian tax counsel schedule mapping every planned instrument type and investor classification to production `tax_rules` rows, exemptions, and statutory `legal_basis` citations (replacing synthetic staging tax rules). | Tax Counsel / Finance | Production tax seeding |
| **OPEN-05** | **Scheduled Treasury Settlement Calendar**: Operational definition of daily/business-day payout cut-off times, batch settlement windows, reconciliation SLAs, and dual-approver staffing roster. | Treasury / Operations | Phase F/H withdrawal rollout |
| **OPEN-06** | **Product Terms for Return Compounding**: Legal review of each investment mandate's terms confirming which products set `allows_return_compounding = true` and exact investor consent wording. | Legal / Product | Production plan seeding |
| **OPEN-07** | **Dedicated Remote Supabase Staging Provisioning**: Provisioning of an isolated non-production Supabase staging project ref so `supabase db push` and two-session concurrency checks (`staging_multisession_concurrency.sql`) can be run remotely. | DevOps / Engineering | Phase C staging integration |
| **OPEN-08** | **Future DVA Roadmap Criteria**: Define volume, regulatory, and custody prerequisites required before reconsidering Dedicated Virtual Accounts in a post-launch phase. | Product / Compliance | Post-launch roadmap |

---

## 3. Remaining Dependencies Before Remote Staging Push & Phase C Authorization

1. **Dedicated Non-Production Supabase Staging Project (`OPEN-07`)**: Provisioned staging project ref + `supabase db push` + execution of `supabase/tests/staging_multisession_concurrency.sql`.
2. **Formal Phase C Authorization**: Separate written sign-off before introducing any staging Supabase Auth integration or async `PlatformServiceContract` adapter.
3. **Regulatory, Custody, Tax & Vendor Prerequisites (`OPEN-01`–`OPEN-06`)**: Required prior to any real-money, real-KYC, or public production authorization.

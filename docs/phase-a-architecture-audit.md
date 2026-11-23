# SILVER SPOON — Phase A Architecture Audit Report

**Status**: Conditionally Approved — Phase A Corrections & Static Reference Cleanup Applied  
**Scope**: Baseline architectural audit and non-production preparation of the Phase 3 standalone frontend prior to separately authorized Phase B implementation.  
**Active Provider**: `VITE_DATA_PROVIDER=mock` (preserved intact; Supabase remains strictly in zero-network standby mode).

> **Regulatory & Non-Production Boundary Notice**  
> SILVER SPOON's intended production operating model is structured around an appropriately SEC-registered investment manager, an independent trustee/custodian, and a regulated banking partner. **No regulatory registration, SEC/CBN approval, trustee/custodian engagement, or payment provider agreement is represented as already obtained.** The planned PostgreSQL ledger is strictly an **internal accounting subledger** and is not a substitute for actual custody records or regulated bank account balances.

---

## 1. Repository Structure Overview

```text
src/
├── assets/images/                     # Local static visual assets
├── components/
│   ├── auth/RouteGuards.tsx           # ProtectedRoute, InvestorRoute, AdminRoute
│   ├── brand/                         # Logo, ThemeToggle
│   └── common/                        # Modal, SlideOverDrawer, TransactionReceiptModal,
│                                      # InvestmentDetailModal, Primitives, RiskDisclosure, SafeImage
├── config/app.ts                      # Brand constants, currency (NGN), disclosures, provider flag
├── context/
│   ├── AppStateContext.tsx            # Context hook & typed state value interface
│   ├── AppStateProvider.tsx           # Mock runtime state engine & localStorage persistence
│   ├── ThemeContext.tsx               # Theme hook & context
│   └── ThemeProvider.tsx              # Light/dark theme state
├── data/
│   ├── mockDatabase.ts                # Transactional mock seed data ONLY (imported solely by mockDataProvider.ts)
│   ├── nigerianBanks.ts               # Static CBN Nigerian bank reference directory
│   └── publicContent.ts               # Static editorial FAQ, testimonials, and showcase metrics
├── layouts/                           # PublicLayout, AuthLayout, UserDashboardLayout, AdminDashboardLayout
├── pages/
│   ├── public/                        # 8 public pages
│   ├── auth/                          # 5 auth pages (Login, Register, Forgot, Verify, Reset)
│   ├── dashboard/                     # 8 investor dashboard pages
│   └── admin/                         # 13 administrator console pages
├── services/
│   ├── platformService.ts             # PlatformServiceContract + domain validators & record factories
│   ├── mockDataProvider.ts            # localStorage snapshot load/save/reset ("silver-spoon-mock-provider-v3")
│   ├── dataProvider.ts                # Phase A provider registry (keeps mock active)
│   └── supabase/                      # Phase A modular standby client & placeholder provider
│       ├── config.ts                  # Browser-safe env reader (VITE_SUPABASE_URL/ANON_KEY only)
│       ├── client.ts                  # Zero-network standby facade
│       └── supabaseDataProvider.ts    # PlatformServiceContract placeholder + approved RPC binding map
├── types/domain.ts                    # Domain models (UserProfile, InvestmentPlan, TransactionRecord, etc.)
└── utils/
    ├── calculations.ts                # Client-side wallet metrics, portfolio history, payout schedules
    └── format.ts                      # Naira (₦), compact Naira, date/time, NUBAN masking
```

---

## 2. Service Interfaces & Implementations

| Artifact | Role | Current Status |
| :--- | :--- | :--- |
| `PlatformServiceContract` (`src/services/platformService.ts`) | Canonical 28-method interface for auth, investor financial actions, notifications, profile/bank management, and admin operations. | Active; synchronous signatures (`ServiceResult<T>`). |
| `mockDataProvider` (`src/services/mockDataProvider.ts`) | Snapshot persistence adapter (`getSeedSnapshot`, `loadSnapshot`, `saveSnapshot`, `clearSnapshot`) backed by `localStorage`. Sole consumer of `src/data/mockDatabase.ts`. | Active default (`VITE_DATA_PROVIDER=mock`). |
| `AppStateProvider` (`src/context/AppStateProvider.tsx`) | Implements `PlatformServiceContract` in-memory over `mockDataProvider` snapshots and exposes isolated derived selectors. | Active; zero backend dependency. |
| `supabaseDataProvider` (`src/services/supabase/supabaseDataProvider.ts`) | Phase A placeholder implementing `PlatformServiceContract` with approved target PostgreSQL RPC / Edge Function mappings. | Standby (inactive in Phase A; zero network calls). |
| `dataProviders` (`src/services/dataProvider.ts`) | Registry surfacing active provider ID and Supabase standby status without altering runtime behavior. | Active (resolves to `"mock"`). |

---

## 3. Authentication, Authorization, Isolation & Financial Data Flows

### 3.1 Authentication & Role Separation (Phase 3 Baseline)
- **Guards**: `src/components/auth/RouteGuards.tsx` enforces `ProtectedRoute` (redirects unauthenticated visitors to `/login` preserving `location.state.from`), `InvestorRoute`, and `AdminRoute` (renders `UnauthorizedRoleView` on cross-role navigation).
- **Credential Validation**: `AppStateProvider.login` verifies email + password match and blocks `Suspended` accounts. Simulated `/verify-email`, `/forgot-password`, `/reset-password`, and `changePassword` flows update local state and append `Security` audit entries.
- **Per-Account Isolation**: `activeAccountId = authenticatedUser?.id ?? ""` filters `userTransactions`, `userInvestments`, `userReferrals`, and `userNotifications` strictly by the authenticated user ID. Unauthenticated sessions or administrators never inherit another investor's balance or referral code.

### 3.2 Financial Data Flows (Current Mock Simulation vs. Approved Target Model)
- **Deposits**: In mock mode, `createDeposit` simulates immediate or pending completion. In the approved production design, deposits flow exclusively through **Paystack Checkout (card and bank transfer)** subject to written provider and custody approval (Dedicated Virtual Accounts are deferred), and no wallet is credited until server-side verification and deduplicated webhook settlement succeed.
- **Withdrawals**: In mock mode, `requestWithdrawal` creates a `Pending` withdrawal. In the approved production design, withdrawals move funds from `available_kobo` to `reserved_withdrawal_kobo`, require **independent four-eyes approval for all withdrawals**, and settle via **scheduled treasury settlement batches** (no immediate auto-disbursement).
- **Investments & Auto-Compound**: In mock mode, `subscribeInvestment` creates an `InvestmentRecord`. In the approved production design, `rollover_mode` defaults to `'principal_only'`; `'principal_plus_net_return'` requires explicit investor consent and product eligibility (`allows_return_compounding = true`); and rollover into `paused` or `archived` plans is strictly prohibited.
- **Admin Reviews & Maturity**: In the approved production design, all withdrawals, payouts, manual ledger adjustments, reversals, realized-return distributions, bank detail changes, role grants, and sensitive treasury configuration changes require independent four-eyes approval (`approver_user_id <> initiator_user_id`) and immutable audit logging.

---

## 4. Direct Mock-Data Imports Audit (Static Reference Cleanup — COMPLETED)

The Phase A static reference cleanup has been executed while preserving 100% of existing page behavior:

| Previous Direct Import | Extracted Reference Module | Updated Consumer(s) | Status |
| :--- | :--- | :--- | :--- |
| `FAQ_ITEMS`, `PUBLIC_STATS`, `TESTIMONIALS` from `src/data/mockDatabase.ts` | `src/data/publicContent.ts` | `src/pages/public/HomePage.tsx`, `src/pages/public/FaqPage.tsx` | **Completed** |
| `NIGERIAN_BANKS` from `src/data/mockDatabase.ts` | `src/data/nigerianBanks.ts` | `src/pages/dashboard/WalletPage.tsx` | **Completed** |

**Verified Result**:
- **Zero UI pages or components** import from `src/data/mockDatabase.ts`.
- `src/services/mockDataProvider.ts` is now the **only** module importing transactional seed records (`INITIAL_*`) from `src/data/mockDatabase.ts`.
- In future backend phases, `publicContent.ts` can be supplemented by read-only public views/CMS and `nigerianBanks.ts` serves as a static fallback for server-resolved bank directories.

---

## 5. Architectural Gaps & Approved Production Rules

Every architectural gap identified between the Phase 3 mock frontend and the target production backend has an approved design resolution recorded in `docs/architecture-decisions.md`:

1. **Reserved Withdrawals & Non-Double-Counted Customer Liability (ADR-009)**
   - In `src/utils/calculations.ts`, mock `totalWalletBalance` computes `availableBalance + activeInvestments`, temporarily omitting `pendingWithdrawals` while settlement is pending.
   - **Approved Backend Formula**:
     $$\text{Total Customer Liability} = \text{available\_kobo} + \text{reserved\_withdrawal\_kobo} + \text{invested\_principal\_kobo}$$
   - Each kobo resides in **exactly one** mutually exclusive customer liability sub-ledger (`2010-{USER}-AVAIL`, `2020-{USER}-RESV`, or `2030-{USER}-INV`), guaranteeing mathematically that customer liabilities can never be double-counted.
2. **Synchronous Mock Contract vs. Asynchronous Backend Adapter**
   - `PlatformServiceContract` currently uses synchronous `ServiceResult<T>` signatures. Phase C/I will introduce an async adapter layer (`Promise<ServiceResult<T>>`) cleanly without altering mock behavior during Phase A.
3. **Floating-Point Naira vs. Integer Kobo (`BIGINT`)**
   - All PostgreSQL monetary fields strictly use integer kobo (`BIGINT`, suffix `_kobo`). Naira formatting occurs only at the UI serialization boundary.
4. **Two-Role Frontend vs. Five-Role Backend RBAC with Universal Four-Eyes Controls (ADR-003)**
   - Production RBAC enforces `super_admin`, `admin`, `finance_officer`, `compliance_officer`, and `investor` via `public.user_roles`, with mandatory independent approval on all withdrawals, payouts, manual adjustments, reversals, realized-return distributions, bank detail changes, role grants, and sensitive treasury configuration changes.
5. **Hard-Coded Tax/Fee Assumptions vs. Configurable Tax Rules Engine (ADR-004)**
   - No universal 10% WHT or ₦50 EMTL deduction may be hard-coded. Production tax calculations must read effective-dated, instrument- and investor-classified `tax_rules` and persist granular `tax_applications` with legal basis and remittance references.
6. **Simulated Instant Deposits & Auto-Disbursements vs. Verified Paystack Checkout & Scheduled Treasury Settlement (ADR-002, ADR-007)**
   - No deposit credits a wallet without server-side verification and deduplicated webhook processing. No withdrawal disburses automatically on request; withdrawals settle through approved scheduled treasury batches, and funds are never released on client-side responses or unverified webhooks.
7. **Simulated Maturity Return vs. Realized Treasury Yield & Rollover Guardrails (ADR-005)**
   - `illustrative_projected_return_kobo` is informational only and never enters `journal_lines`. Realized distributions require verified treasury cash backing, configurable tax computation, and strict rollover guards (principal-only default; never roll into `paused` or `archived` plans).
8. **Custody Boundary (ADR-001)**
   - PostgreSQL serves solely as an internal accounting subledger reconciled daily against custodian and regulated banking statements; it never represents custody itself.

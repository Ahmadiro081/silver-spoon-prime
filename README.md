# SILVER SPOON — Private Wealth & Naira Investment Platform

SILVER SPOON is a restructured, frontend-first Nigerian Naira (₦) fintech web application featuring a public institutional website, a complete client wealth dashboard, and a dedicated administrator operations console.

This codebase has been completely disconnected from the legacy Lovable / TanStack Start / Supabase / Paystack backend implementation and re-architected around a clean, modular React + TypeScript + Tailwind CSS v4 frontend powered by a decoupled mock-data service architecture.

---

## Architecture Overview

```text
src/
├── assets/images/        # Local architectural & executive visual assets
├── components/
│   ├── brand/            # Logo wordmark & ThemeToggle
│   ├── common/           # MetricCard, StatusText, RiskDisclosure, SafeImage, SegmentedFilter
│   └── ui/               # Reusable Radix UI primitives
├── config/
│   └── app.ts            # Application constants, disclosures, currency & backend readiness config
├── context/
│   ├── AppStateContext.tsx   # Reactive localStorage-persisted mock store for User & Admin workflows
│   └── ThemeContext.tsx      # Light-first theme provider with dark mode support
├── data/
│   └── mockDatabase.ts   # Realistic Nigerian Naira seed records (users, plans, ledgers, audit logs)
├── layouts/
│   ├── PublicLayout.tsx          # Public navigation shell & institutional footer
│   ├── AuthLayout.tsx            # Split-screen authentication shell
│   ├── UserDashboardLayout.tsx   # Client portal sidebar & header
│   └── AdminDashboardLayout.tsx  # Operations console sidebar & pending review badges
├── pages/
│   ├── public/           # Home, About, How It Works, Plans, FAQ, Contact, Terms, Privacy
│   ├── auth/             # Login, Register, Forgot Password
│   ├── dashboard/        # Overview, Wallet, Investments, Transactions, Referrals, Notifications, Profile, Settings
│   └── admin/            # Overview, Users, Plans, Investments, Deposits, Withdrawals, Transactions, Referrals, Analytics, Reports, Notifications, Audit Logs, Settings
├── services/
│   └── platformService.ts # Validation rules, factories, and service contract ready for Supabase swap
├── types/
│   └── domain.ts         # Strongly typed financial & administrative domain models
└── utils/
    ├── format.ts         # Nigerian Naira (₦) formatting, compact currency, dates, masking
    └── calculations.ts   # Client simulation wallet/investment math (documented for server-side migration)
```

---

## Legacy Backend Removal Summary

The following legacy local backend files and dependencies were removed without affecting any remote database or GitHub history:

- Removed `src/integrations/supabase/*` and local `supabase/` configuration & migrations.
- Removed legacy server-side RPCs and webhook handlers (`account.functions.ts`, `admin.functions.ts`, `payments.functions.ts`, `paystack.server.ts`, `ai-gateway.server.ts`, `cashflow-ai.functions.ts`, `src/routes/api/public/webhooks/paystack.ts`).
- Removed legacy TanStack Start / Nitro / Lovable SSR glue (`src/server.ts`, `src/start.ts`, `src/router.tsx`, `src/routeTree.gen.ts`, `.lovable/`, `bunfig.toml`, `bun.lock`).
- Cleaned obsolete dependencies (`@supabase/supabase-js`, `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/router-plugin`, `@tanstack/react-query`, `@lovable.dev/vite-tanstack-config`, `nitro`) from `package.json`.

---

## Core Modules Included

### 1. Public Website
- **Homepage** (`/`), **About Us** (`/about`), **How It Works** (`/how-it-works` with illustrative Naira projection calculator), **Investment Plans** (`/plans`), **FAQ** (`/faq`), **Contact** (`/contact`), **Terms & Conditions** (`/terms`), **Privacy Policy** (`/privacy`), **Login** (`/login`), **Registration** (`/register`), and **Forgot Password** (`/forgot-password`).
- Explicit non-guaranteed target return disclosures across all plans and calculators.

### 2. User Dashboard (`/dashboard/*`)
- **Portfolio Overview**: Total Wallet Balance, Available Balance, Active Investments, Total Deposits, Total Withdrawals, Realized Earnings, Referral Earnings, and interactive performance charts.
- **Wallet Management**: Simulated Deposit, simulated Withdrawal (with balance & fee validation), Nigerian NUBAN bank account setup, and tabbed Deposit / Withdrawal / All activity history.
- **Investment Management**: Naira investment plan cards (min/max, tenor, illustrative target return, risk band), interactive mandate allocation modal, portfolio breakdown chart, and investment history.
- **Transaction Ledger**: Searchable, type-filtered ledger with CSV export.
- **Referral System**: Unique referral link & code with copy controls, statistics, commission overview, and referral history.
- **Notifications, Profile & Settings**: Unread filtering, profile editor, 2FA/alert toggles, theme preference, and demo state reset.

### 3. Administrator Console (`/admin/*`)
- **Platform Overview**, **User Management**, **Investment Plan Management**, **Investment Management** (with maturity settlement), **Deposit Records** (approve/decline), **Withdrawal Records** (approve payout/decline), **Transaction Monitoring**, **Referral Management** (mark paid), **Financial Analytics**, **Reports** (CSV exports), **Notifications** (broadcast/direct), **Audit Logs**, and **Platform Settings**.

---

## Preparing for Future Production Backend (Supabase)

The frontend is intentionally decoupled so a production backend can be integrated cleanly without rewriting UI components:

1. **PostgreSQL + Supabase**: Map `src/types/domain.ts` tables (`profiles`, `investment_plans`, `investments`, `transactions`, `referrals`, `notifications`, `audit_logs`, `platform_settings`).
2. **Supabase Authentication + Row Level Security (RLS)**: Replace mock session state in `AppStateContext` with `supabase.auth` and enforce strict `auth.uid()` + role-based admin policies in PostgreSQL.
3. **Supabase Edge Functions**: Move authoritative financial logic (deposit confirmation webhooks, withdrawal disbursements, wallet balance ledger updates, investment maturity payouts, and referral commission credits) exclusively server-side.
4. **Supabase Storage**: Store KYC verification documents and generated PDF client statements in private RLS-protected buckets.
5. **Standalone Frontend Mode (Current)**: The application runs with `VITE_DATA_PROVIDER=mock` and requires zero database credentials, URLs, or API keys to start or build. Future backend environment variables should only be added when the new database is provisioned.

---

## Development & Build Scripts

```bash
npm install
npm run dev        # Starts Vite dev server on http://0.0.0.0:3000
npm run typecheck  # Runs TypeScript strict check
npm run lint       # Runs ESLint
npm run build      # Builds production bundle into dist/
```

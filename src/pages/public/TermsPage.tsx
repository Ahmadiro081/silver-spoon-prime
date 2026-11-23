import { PublicLayout } from "@/layouts/PublicLayout";
import { APP_CONFIG } from "@/config/app";

const SECTIONS = [
  {
    title: "01. Scope of Services",
    body: "SILVER SPOON Wealth Management Ltd. provides Naira-denominated digital portfolio administration, structured investment mandates, and client ledger reporting. All transactions in the current frontend build are simulated locally using mock data.",
  },
  {
    title: "02. Eligibility & KYC Verification",
    body: "Clients must be at least 18 years old and hold a valid Nigerian bank account (NUBAN). Withdrawal privileges and higher allocation limits require Tier 2 or Tier 3 Know-Your-Customer (KYC) verification in compliance with Nigerian anti-money laundering directives.",
  },
  {
    title: "03. Risk Disclosure & Non-Guaranteed Returns",
    body: "Target returns published on SILVER SPOON investment mandates are illustrative projections derived from fixed-income, treasury, and structured credit models. Returns are not guaranteed, and invested principal carries market, interest-rate, liquidity, and issuer risks.",
  },
  {
    title: "04. Wallet Funding, Tenors & Settlements",
    body: "Funds committed to an active mandate remain locked for the specified duration (30, 90, 180, or 365 days). Upon maturity, principal and any realized return settle into the client's Available Balance. Withdrawals above ₦10,000,000 attract a flat ₦2,500 wire settlement fee.",
  },
  {
    title: "05. Referral Program Terms",
    body: "Clients earn a 3% referral commission on a referred investor's qualifying first investment allocation, subject to anti-abuse and duplicate-account compliance checks.",
  },
  {
    title: "06. Server-Side Production Governance",
    body: "When deployed with the production PostgreSQL and Supabase backend, all authoritative financial balances, deposit verifications, and payout disbursements are governed exclusively by server-side Edge Functions and Row Level Security policies.",
  },
];

export function TermsPage() {
  return (
    <PublicLayout>
      <section className="border-b border-border bg-card py-14">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-medium text-muted-foreground">Legal Documentation</p>
          <h1 className="font-display mt-2 text-4xl font-medium tracking-tight text-foreground">
            Terms & Conditions
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Effective Date: November 2026 · {APP_CONFIG.legalName}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl space-y-8 px-4 py-14 sm:px-6 lg:px-8">
        {SECTIONS.map((s) => (
          <div key={s.title} className="border-b border-border pb-6 last:border-b-0">
            <h2 className="font-display text-xl font-medium text-foreground">{s.title}</h2>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </section>
    </PublicLayout>
  );
}

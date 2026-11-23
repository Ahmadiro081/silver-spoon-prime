import { PublicLayout } from "@/layouts/PublicLayout";
import { APP_CONFIG } from "@/config/app";

const SECTIONS = [
  {
    title: "01. Data Protection Commitment (NDPA)",
    body: "SILVER SPOON Wealth Management Ltd. processes personal and financial records in accordance with the Nigeria Data Protection Act (NDPA) and institutional financial confidentiality standards.",
  },
  {
    title: "02. Information We Collect",
    body: "In production, we collect identity verification details (full legal name, email, phone number, residential address, KYC tier documents) and Nigerian NUBAN payout details strictly to operate your account and satisfy regulatory obligations.",
  },
  {
    title: "03. Current Frontend Mock Environment",
    body: "During this frontend architecture phase, no personal or financial data is transmitted to any external database or third-party server. Interactive state persists solely inside your local browser storage and can be cleared anytime.",
  },
  {
    title: "04. Future Production Security Controls",
    body: "Our target production backend utilizes PostgreSQL on Supabase with Row Level Security (RLS), encrypted object storage for KYC artifacts, role-based access enforcement, and server-side audit trails for every administrative action.",
  },
  {
    title: "05. Client Data Rights",
    body: `Clients may request data export, profile rectification, or account closure by writing to ${APP_CONFIG.support.complianceEmail}.`,
  },
];

export function PrivacyPage() {
  return (
    <PublicLayout>
      <section className="border-b border-border bg-card py-14">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-medium text-muted-foreground">Privacy & Data Governance</p>
          <h1 className="font-display mt-2 text-4xl font-medium tracking-tight text-foreground">
            Privacy Policy
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Last Updated: November 2026 · {APP_CONFIG.legalName}
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

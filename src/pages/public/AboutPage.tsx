import { Link } from "react-router-dom";
import { PublicLayout } from "@/layouts/PublicLayout";
import { SafeImage } from "@/components/common/SafeImage";
import { APP_CONFIG } from "@/config/app";

const PILLARS = [
  {
    index: "01.",
    title: "Segregated Ledger Accounting",
    body: "Available liquidity, locked investment principal, pending withdrawals, and realized earnings are separated into distinct auditable states.",
  },
  {
    index: "02.",
    title: "Honest Risk Communication",
    body: "Every SILVER SPOON mandate discloses its target horizon, underlying asset mix, management fee, and explicit risk band without promising guaranteed profits.",
  },
  {
    index: "03.",
    title: "Server-First Production Architecture",
    body: "Our platform is architected for PostgreSQL, Supabase Authentication, Row Level Security (RLS), and Edge Functions so every financial mutation is verified server-side.",
  },
];

export function AboutPage() {
  return (
    <PublicLayout>
      <section className="border-b border-border bg-card py-16 lg:py-20">
        <div className="mx-auto grid max-w-7xl items-stretch gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="flex flex-col justify-center lg:col-span-6">
            <p className="text-xs font-medium text-muted-foreground">About SILVER SPOON</p>
            <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
              Built for disciplined Naira wealth administration.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              SILVER SPOON was founded in Lagos to bridge the gap between informal retail savings
              apps and traditional private banking. We combine clean digital portfolio software with
              clear reporting, structured tenors, and accountable operations.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-6 border-t border-border pt-6">
              <div>
                <p className="font-tabular text-2xl font-semibold text-foreground">3 Cities</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Lagos, Abuja, PH</p>
              </div>
              <div>
                <p className="font-tabular text-2xl font-semibold text-foreground">NGN</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Naira-native ledger</p>
              </div>
              <div>
                <p className="font-tabular text-2xl font-semibold text-foreground">100%</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Audited trail design</p>
              </div>
            </div>
          </div>

          <div className="min-h-[320px] overflow-hidden rounded-2xl border border-border lg:col-span-6">
            <SafeImage
              src={APP_CONFIG.assets.aboutBuilding}
              alt="SILVER SPOON architectural headquarters facade"
              className="h-full w-full object-cover"
              fallbackTitle="SILVER SPOON Headquarters, Victoria Island"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <h2 className="font-display text-3xl font-medium text-foreground">Governance & Engineering Pillars</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {PILLARS.map((item) => (
            <div key={item.index} className="surface-card p-6">
              <p className="font-tabular text-xs font-semibold text-muted-foreground">{item.index}</p>
              <h3 className="font-display mt-3 text-xl font-medium text-foreground">{item.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="surface-card mt-12 p-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Technical Roadmap</p>
              <h3 className="font-display mt-2 text-2xl font-medium text-foreground">
                Prepared for Supabase & PostgreSQL Production Deployment
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                This redesigned frontend separates domain services, data models, and calculation
                rules from UI components. When production infrastructure is connected, all wallet
                mutations, deposit confirmations, and withdrawal disbursements execute securely
                inside server-side Edge Functions and PostgreSQL RLS policies.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link
                to="/plans"
                className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Explore Investment Plans
              </Link>
              <Link
                to="/contact"
                className="inline-flex h-10 items-center rounded-lg border border-border px-5 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Contact Advisory Desk
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

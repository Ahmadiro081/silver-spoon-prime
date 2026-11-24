import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { PublicLayout } from "@/layouts/PublicLayout";
import { RiskDisclosure, StatusText } from "@/components/common/Primitives";
import { SafeImage } from "@/components/common/SafeImage";
import { APP_CONFIG } from "@/config/app";
import { useAppState } from "@/context/AppStateContext";
import { FAQ_ITEMS, GOVERNANCE_PILLARS, PUBLIC_STATS } from "@/data/publicContent";
import { formatNaira } from "@/utils/format";

const STEPS = [
  {
    index: "01.",
    title: "Complete Tiered Verification",
    body: "Open a Naira wealth account online in minutes with BVN-ready KYC verification and linked Nigerian bank payout details.",
  },
  {
    index: "02.",
    title: "Fund Your Naira Wallet",
    body: "Transfer capital via NIP bank transfer or corporate wire with zero deposit fees and instant ledger visibility.",
  },
  {
    index: "03.",
    title: "Allocate Across Structured Mandates",
    body: "Choose 30, 90, 180, or 365-day portfolios with clear minimum/maximum thresholds, allocation breakdowns, and explicit risk bands.",
  },
  {
    index: "04.",
    title: "Monitor & Settle to Your Bank",
    body: "Track accrued performance and maturity dates in real time, then settle available Naira balances to any verified Nigerian bank.",
  },
];

export function HomePage() {
  const { plans } = useAppState();
  const [openFaq, setOpenFaq] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);
  const featuredPlans = plans.filter((p) => p.status === "Active").slice(0, 3);

  return (
    <PublicLayout>
      {/* HERO — 2-column balanced architectural split */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col justify-between lg:col-span-6"
            >
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Private Wealth · Lagos · Abuja · Port Harcourt
                </p>
                <h1 className="font-display mt-4 text-[clamp(2.25rem,4vw,3.75rem)] font-medium leading-[1.06] tracking-tight text-foreground">
                  Structured Naira wealth, governed with institutional clarity.
                </h1>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
                  SILVER SPOON equips Nigerian professionals, founders, and corporate treasuries
                  with disciplined Naira mandates, transparent risk disclosures, and unified
                  portfolio accounting.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link
                    to="/register"
                    className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground whitespace-nowrap transition-colors hover:bg-primary/90"
                  >
                    Open Client Account
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link
                    to="/plans"
                    className="inline-flex h-11 items-center rounded-lg border border-border bg-background px-5 text-sm font-medium text-foreground whitespace-nowrap transition-colors hover:bg-secondary"
                  >
                    Compare Mandates
                  </Link>
                </div>
              </div>

              <div className="mt-10 border-t border-border pt-6">
                <p className="text-xs font-medium text-muted-foreground">Client Account Access</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <Link
                    to="/register"
                    className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                  >
                    Create New Client Account
                  </Link>
                  <span aria-hidden="true" className="text-border">/</span>
                  <Link
                    to="/login"
                    className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                  >
                    Sign In to Workspace
                  </Link>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="relative min-h-[340px] overflow-hidden rounded-2xl border border-border lg:col-span-6"
            >
              <SafeImage
                src={APP_CONFIG.assets.heroSuite}
                alt="SILVER SPOON private wealth advisory suite overlooking Lagos coastline"
                className="h-full w-full object-cover"
                fallbackTitle="SILVER SPOON Victoria Island Advisory Suite"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#08101f]/85 via-[#08101f]/25 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-7">
                <p className="text-xs text-slate-300">Structured Naira Mandate Parameters · NGN</p>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/20 pt-3.5 sm:gap-4 sm:pt-4">
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-300">Entry Mandate</p>
                    <p className="font-tabular mt-0.5 text-sm font-semibold sm:text-base">₦50,000</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-300">Tenor Range</p>
                    <p className="font-tabular mt-0.5 text-sm font-semibold sm:text-base">30 – 365d</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-300">Referral Share</p>
                    <p className="font-tabular mt-0.5 text-sm font-semibold sm:text-base">3.0%</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FULL-WIDTH 4-COLUMN KPI STRIP */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto grid max-w-7xl grid-cols-2 border-border lg:grid-cols-4 [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(odd)]:border-r lg:[&>*:not(:last-child)]:border-r lg:[&>*]:border-b-0">
          {PUBLIC_STATS.map((item) => (
            <div key={item.label} className="border-border px-4 py-6 sm:px-6 sm:py-8">
              <p className="font-tabular text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {item.value}
              </p>
              <p className="mt-1.5 text-sm font-medium text-foreground">{item.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* INVESTMENT PLANS PREVIEW */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Investment Mandates</p>
            <h2 className="font-display mt-2 text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
              Naira portfolios structured by horizon and risk.
            </h2>
          </div>
          <Link
            to="/plans"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground whitespace-nowrap hover:underline underline-offset-4"
          >
            View all {plans.length} mandates
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {featuredPlans.map((plan) => (
            <div
              key={plan.id}
              className={`surface-card flex flex-col justify-between p-6 transition-colors ${
                plan.featured ? "border-primary/50" : ""
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{plan.category}</span>
                  <span aria-hidden="true">·</span>
                  <StatusText status={plan.riskBand} />
                </div>

                <h3 className="font-display mt-3 text-2xl font-medium text-foreground">
                  {plan.name}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{plan.tagline}</p>

                <div className="mt-6 border-y border-border py-5">
                  <p className="text-xs text-muted-foreground">Illustrative Target Return</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-tabular text-3xl font-semibold text-foreground">
                      {plan.targetReturnPercent}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      per {plan.durationDays}-day cycle (not guaranteed)
                    </span>
                  </div>
                </div>

                <dl className="mt-5 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Minimum Allocation</dt>
                    <dd className="font-tabular font-medium text-foreground">
                      {formatNaira(plan.minAmount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Maximum Allocation</dt>
                    <dd className="font-tabular font-medium text-foreground">
                      {formatNaira(plan.maxAmount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Distribution</dt>
                    <dd className="font-medium text-foreground">{plan.payoutFrequency}</dd>
                  </div>
                </dl>

                <ul className="mt-5 space-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 pt-2">
                <Link
                  to={`/dashboard/investments?plan=${encodeURIComponent(plan.id)}`}
                  className={`inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                    plan.featured
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-border bg-background text-foreground hover:bg-secondary"
                  }`}
                >
                  Inspect Mandate
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <RiskDisclosure text={APP_CONFIG.disclosures.investmentRisk} />
        </div>
      </section>

      {/* EDITORIAL NUMBERED PROCESS */}
      <section className="border-y border-border bg-card py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-muted-foreground">Operating Process</p>
            <h2 className="font-display mt-2 text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
              From Naira funding to maturity settlement in four governed steps.
            </h2>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.index} className="border-t border-border pt-5">
                <p className="font-tabular text-sm font-semibold text-muted-foreground">
                  {step.index}
                </p>
                <h3 className="font-display mt-3 text-xl font-medium text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLATFORM GOVERNANCE & ARCHITECTURE */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-muted-foreground">Platform Governance</p>
          <h2 className="font-display mt-2 text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            Engineered for transparent accounting and disciplined portfolio control.
          </h2>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {GOVERNANCE_PILLARS.map((item) => (
            <article key={item.id} className="surface-card flex flex-col justify-between p-6">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <h3 className="font-display mt-2 text-xl font-medium text-foreground">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <p className="font-tabular mt-6 border-t border-border pt-4 text-xs font-semibold text-foreground">
                {item.metric}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* FAQ PREVIEW */}
      <section className="border-t border-border bg-card py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-5">
            <p className="text-xs font-medium text-muted-foreground">Frequently Asked Questions</p>
            <h2 className="font-display mt-2 text-3xl font-medium tracking-tight text-foreground">
              Clear answers before you commit capital.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Review our funding thresholds, settlement schedule, referral terms, and risk framework.
            </p>
            <Link
              to="/faq"
              className="mt-6 inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Read Full FAQ
            </Link>
          </div>

          <div className="divide-y divide-border border-y border-border lg:col-span-7">
            {FAQ_ITEMS.slice(0, 4).map((item) => {
              const isOpen = openFaq === item.id;
              const panelId = `home-faq-panel-${item.id}`;
              return (
                <div key={item.id} className="py-4">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenFaq(isOpen ? null : item.id)}
                    className="flex w-full items-center justify-between gap-4 text-left text-sm font-semibold text-foreground"
                  >
                    <span>{item.question}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <p
                      id={panelId}
                      className="mt-3 text-sm leading-relaxed text-muted-foreground"
                    >
                      {item.answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CLOSING CONVERSION BANNER */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-gradient-ink px-8 py-12 text-white sm:px-14 sm:py-16">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
              Bring institutional discipline to your Naira reserves.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Register a client account to explore SILVER SPOON&apos;s Naira wallet ledger,
              structured mandate schedules, and simulated portfolio controls in this standalone test
              environment.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="inline-flex h-11 items-center rounded-lg bg-white px-6 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100"
              >
                Create Account
              </Link>
              <Link
                to="/how-it-works"
                className="inline-flex h-11 items-center rounded-lg border border-white/25 px-5 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                How It Works
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

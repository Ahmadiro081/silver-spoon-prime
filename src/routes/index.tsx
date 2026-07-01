import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  ShieldCheck, TrendingUp, Wallet, ArrowRight, Sparkles, LineChart, Lock, Zap, Check,
} from "lucide-react";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Button } from "@/components/ui/button";
import { plans, testimonials, faqs, walletStats } from "@/lib/mock-data";
import { formatNaira } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SILVER SPOON — Nigeria's Private Wealth Platform" },
      { name: "description", content: "Grow, protect and withdraw in Naira. Institutional-grade investment plans starting from ₦50,000." },
    ],
  }),
  component: Home,
});

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

function Home() {
  return (
    <PublicLayout>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
        <div className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:px-8">
          <motion.div initial="hidden" animate="show" variants={fadeUp} className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground shadow-elegant">
              <Sparkles className="h-3.5 w-3.5" /> New — Sovereign Elite plan now open
            </span>
            <h1 className="font-display mt-6 text-5xl leading-[1.05] sm:text-6xl md:text-7xl">
              Private wealth,<br />
              <span className="text-gradient-ink">served in silver.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
              SILVER SPOON is the Naira-native investment platform for Nigerians who
              expect institutional discipline and concierge speed.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="rounded-full shadow-elegant">
                <Link to="/register">Open your account <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <Link to="/investment-plans">Explore plans</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Start from ₦50,000 · Withdraw in 15 minutes · Zero maintenance fees</p>
          </motion.div>

          {/* Hero card mock */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-14 max-w-4xl"
          >
            <div className="card-premium overflow-hidden shadow-lift">
              <div className="grid gap-6 p-6 sm:grid-cols-3 sm:p-8">
                <div className="col-span-1 rounded-2xl bg-gradient-ink p-6 text-primary-foreground">
                  <p className="text-xs uppercase tracking-widest opacity-70">Wallet balance</p>
                  <p className="font-display mt-2 text-3xl">{formatNaira(walletStats.walletBalance)}</p>
                  <p className="mt-6 text-xs opacity-80">+ ₦96,500 this month</p>
                  <div className="mt-6 flex items-center gap-2 text-xs opacity-80">
                    <Lock className="h-3.5 w-3.5" /> AES-256 secured
                  </div>
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-4">
                  <MiniStat label="Active" value={formatNaira(walletStats.activeInvestments)} icon={LineChart} />
                  <MiniStat label="Profit" value={formatNaira(walletStats.totalProfit)} icon={TrendingUp} tone="success" />
                  <MiniStat label="Deposits" value={formatNaira(walletStats.totalDeposits)} icon={Wallet} />
                  <MiniStat label="Referrals" value={formatNaira(walletStats.referralEarnings)} icon={Sparkles} />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* STATS */}
      <section className="border-y border-border/60 bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-10 sm:grid-cols-4 sm:px-6 lg:px-8">
          {[
            ["₦4.8B+", "Assets under management"],
            ["12,486", "Trusted investors"],
            ["99.98%", "Payout success rate"],
            ["15 min", "Avg. withdrawal time"],
          ].map(([v, l]) => (
            <div key={l}>
              <p className="font-display text-3xl">{v}</p>
              <p className="mt-1 text-sm text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PLANS PREVIEW */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Investment plans</p>
            <h2 className="font-display mt-2 text-4xl">Portfolios for every stage.</h2>
          </div>
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <Link to="/investment-plans">See all plans <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {plans.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className={`card-premium card-premium-hover flex flex-col p-6 ${p.featured ? "ring-1 ring-primary/60" : ""}`}
            >
              {p.featured && (
                <span className="mb-3 inline-flex w-fit rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                  Most popular
                </span>
              )}
              <h3 className="font-display text-2xl">{p.name}</h3>
              <p className="text-sm text-muted-foreground">{p.tagline}</p>
              <div className="my-6 flex items-baseline gap-1">
                <span className="font-display text-4xl">{p.roi}</span>
                <span className="text-sm text-muted-foreground">/ {p.duration}</span>
              </div>
              <ul className="mb-6 space-y-2 text-sm">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {perk}
                  </li>
                ))}
              </ul>
              <div className="mt-auto space-y-3 border-t border-border pt-4 text-xs text-muted-foreground">
                <Row label="Minimum" value={formatNaira(p.min)} />
                <Row label="Maximum" value={formatNaira(p.max)} />
                <Row label="Risk" value={p.risk} />
              </div>
              <Button asChild className="mt-6 rounded-full">
                <Link to="/register">Start investing</Link>
              </Button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-secondary/40 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Why SILVER SPOON</p>
            <h2 className="font-display mt-2 text-4xl">Designed for serious money.</h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: ShieldCheck, title: "Custodial security", body: "Segregated accounts audited quarterly by independent firms." },
              { icon: Zap, title: "Instant liquidity", body: "Withdraw available balance to any Nigerian bank in minutes." },
              { icon: LineChart, title: "Transparent returns", body: "Every plan shows the risk band, duration and expected ROI." },
              { icon: Sparkles, title: "Silver-tier support", body: "Named portfolio managers for Platinum and Sovereign clients." },
            ].map((f) => (
              <div key={f.title} className="card-premium p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-ink text-primary-foreground">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="font-display mt-4 text-lg">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Client stories</p>
          <h2 className="font-display mt-2 text-4xl">Trusted from Lagos to Kano.</h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure key={t.name} className="card-premium p-6">
              <blockquote className="text-sm leading-relaxed text-foreground">"{t.quote}"</blockquote>
              <figcaption className="mt-6 border-t border-border pt-4">
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* FAQ PREVIEW */}
      <section className="bg-secondary/40 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:px-8">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">FAQ</p>
            <h2 className="font-display mt-2 text-4xl">Questions, answered.</h2>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">Everything you need to know before opening your SILVER SPOON account.</p>
            <Button variant="outline" asChild className="mt-6 rounded-full">
              <Link to="/faq">Read the full FAQ</Link>
            </Button>
          </div>
          <div className="space-y-3">
            {faqs.slice(0, 4).map((f) => (
              <details key={f.q} className="card-premium group p-5">
                <summary className="flex cursor-pointer items-center justify-between font-medium">
                  {f.q}
                  <span className="text-muted-foreground group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-ink p-10 text-primary-foreground shadow-lift sm:p-16">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
          <div className="relative max-w-xl">
            <h2 className="font-display text-4xl sm:text-5xl">Your capital deserves better.</h2>
            <p className="mt-4 text-primary-foreground/80">Open a SILVER SPOON account in under 3 minutes — no paperwork, no branch visits.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary" className="rounded-full">
                <Link to="/register">Create free account</Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="rounded-full text-primary-foreground hover:bg-white/10 hover:text-primary-foreground">
                <Link to="/how-it-works">See how it works</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function MiniStat({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone?: "success" }) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/60 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${tone === "success" ? "text-success" : ""}`} /> {label}
      </div>
      <p className="font-display mt-2 text-lg">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

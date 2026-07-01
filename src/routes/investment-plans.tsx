import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { plans } from "@/lib/mock-data";
import { formatNaira } from "@/lib/format";

export const Route = createFileRoute("/investment-plans")({
  head: () => ({ meta: [
    { title: "Investment Plans — SILVER SPOON" },
    { name: "description", content: "Silver Starter, Platinum Growth and Sovereign Elite. Institutional plans built for Naira." },
    { property: "og:title", content: "Investment Plans — SILVER SPOON" },
    { property: "og:description", content: "Choose from Silver Starter, Platinum Growth or Sovereign Elite. Start from ₦50,000." },
  ]}),
  component: Plans,
});

function Plans() {
  return (
    <PublicLayout>
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Investment plans</p>
          <h1 className="font-display mt-3 text-5xl sm:text-6xl">Three tiers. One standard.</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Whether you're starting with ₦50,000 or allocating ₦100M, every SILVER SPOON plan
            comes with the same discipline and speed.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className={`card-premium card-premium-hover flex flex-col p-8 ${p.featured ? "ring-1 ring-primary/60" : ""}`}>
              {p.featured && (
                <span className="mb-3 inline-flex w-fit rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                  Most popular
                </span>
              )}
              <h3 className="font-display text-3xl">{p.name}</h3>
              <p className="text-muted-foreground">{p.tagline}</p>
              <div className="my-8 flex items-baseline gap-1">
                <span className="font-display text-5xl">{p.roi}</span>
                <span className="text-sm text-muted-foreground">/ {p.duration}</span>
              </div>
              <ul className="mb-6 space-y-2 text-sm">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {perk}
                  </li>
                ))}
              </ul>
              <div className="mt-auto space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
                <div className="flex justify-between"><span>Minimum</span><span className="font-medium text-foreground">{formatNaira(p.min)}</span></div>
                <div className="flex justify-between"><span>Maximum</span><span className="font-medium text-foreground">{formatNaira(p.max)}</span></div>
                <div className="flex justify-between"><span>Duration</span><span className="font-medium text-foreground">{p.duration}</span></div>
                <div className="flex justify-between"><span>Risk band</span><span className="font-medium text-foreground">{p.risk}</span></div>
              </div>
              <Button asChild className="mt-6 rounded-full">
                <Link to="/register">Invest now</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}

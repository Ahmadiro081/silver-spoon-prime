import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Target, Compass, Heart, Users } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [
    { title: "About — SILVER SPOON" },
    { name: "description", content: "Meet the team building Nigeria's private wealth platform." },
    { property: "og:title", content: "About SILVER SPOON" },
    { property: "og:description", content: "The story, values, and team behind Nigeria's silver-tier investment platform." },
  ]}),
  component: About,
});

function About() {
  return (
    <PublicLayout>
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-5xl px-4 py-24 text-center sm:px-6 lg:px-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">About us</p>
          <h1 className="font-display mt-3 text-5xl sm:text-6xl">A quiet standard for wealth in Nigeria.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-muted-foreground">
            SILVER SPOON was founded in 2023 by a small group of ex-bankers, engineers and
            portfolio managers who believed Nigerians deserved a private-banking experience
            without the private-banking gatekeeping.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2">
          {[
            { icon: Target, title: "Our mission", body: "Compound Nigerian capital with discipline, transparency and speed." },
            { icon: Compass, title: "Our approach", body: "Diversified low-volatility instruments, ring-fenced custody, and named portfolio managers." },
            { icon: Heart, title: "Our promise", body: "Zero maintenance fees, no hidden charges, and withdrawals honoured within 15 minutes." },
            { icon: Users, title: "Our clients", body: "12,486 investors across 34 states — from first-time savers to family offices." },
          ].map((v) => (
            <div key={v.title} className="card-premium p-8">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-ink text-primary-foreground">
                <v.icon className="h-5 w-5" />
              </span>
              <h3 className="font-display mt-4 text-2xl">{v.title}</h3>
              <p className="mt-2 text-muted-foreground">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-secondary/40 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl">Leadership</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Adaeze Okafor", "Chief Executive"],
              ["Segun Bakare", "Chief Investment Officer"],
              ["Halima Bello", "Head of Engineering"],
              ["Obinna Eze", "Head of Compliance"],
            ].map(([n, r]) => (
              <div key={n} className="card-premium p-6 text-center">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-silver text-2xl font-semibold text-foreground">
                  {n.split(" ").map((w) => w[0]).join("")}
                </div>
                <p className="font-display mt-4 text-lg">{n}</p>
                <p className="text-sm text-muted-foreground">{r}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

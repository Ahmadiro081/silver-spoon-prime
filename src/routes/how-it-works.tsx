import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { UserPlus, Wallet, LineChart, ArrowUpFromLine } from "lucide-react";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({ meta: [
    { title: "How it works — SILVER SPOON" },
    { name: "description", content: "From onboarding to withdrawal in four unhurried steps." },
    { property: "og:title", content: "How SILVER SPOON works" },
    { property: "og:description", content: "Register, fund, invest, withdraw. Four unhurried steps to grow your wealth in Naira." },
  ]}),
  component: How,
});

const steps = [
  { icon: UserPlus, title: "Register", body: "Create your account in under 3 minutes with a valid Nigerian ID and BVN." },
  { icon: Wallet, title: "Fund", body: "Deposit Naira via bank transfer or card. Zero deposit fees, ever." },
  { icon: LineChart, title: "Invest", body: "Choose a plan matching your risk band. Track returns in real time." },
  { icon: ArrowUpFromLine, title: "Withdraw", body: "Available balance moves to your bank in under 15 minutes." },
];

function How() {
  return (
    <PublicLayout>
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">How it works</p>
          <h1 className="font-display mt-3 text-5xl sm:text-6xl">Four steps. Unhurried.</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            We stripped away branch visits, forms and phone calls. What's left is a clean
            path from your first Naira to your first payout.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <ol className="relative space-y-8 border-l border-border pl-8">
          {steps.map((s, i) => (
            <li key={s.title} className="relative">
              <span className="absolute -left-[41px] grid h-10 w-10 place-items-center rounded-full border border-border bg-card shadow-elegant">
                <s.icon className="h-4 w-4" />
              </span>
              <div className="card-premium p-6">
                <p className="text-xs text-muted-foreground">Step 0{i + 1}</p>
                <h3 className="font-display mt-1 text-2xl">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </PublicLayout>
  );
}

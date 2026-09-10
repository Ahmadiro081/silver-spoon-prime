import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { plans, walletStats } from "@/lib/mock-data";
import { formatNaira } from "@/lib/format";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard/investments")({
  head: () => ({ meta: [{ title: "Investments — SILVER SPOON" }] }),
  component: Investments,
});

function Investments() {
  return (
    <DashboardLayout title="Investment plans">
      <div className="card-premium mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Currently invested</p>
          <p className="font-display mt-1 text-3xl">{formatNaira(walletStats.activeInvestments)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Available to invest</p>
          <p className="font-display mt-1 text-3xl">{formatNaira(walletStats.available)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Lifetime profit</p>
          <p className="font-display mt-1 text-3xl text-success">{formatNaira(walletStats.totalProfit)}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className={`card-premium card-premium-hover flex flex-col p-6 ${p.featured ? "ring-1 ring-primary/60" : ""}`}>
            {p.featured && <span className="mb-3 inline-flex w-fit rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">Recommended</span>}
            <h3 className="font-display text-2xl">{p.name}</h3>
            <p className="text-sm text-muted-foreground">{p.tagline}</p>
            <div className="my-5 flex items-baseline gap-1">
              <span className="font-display text-4xl">{p.roi}</span>
              <span className="text-sm text-muted-foreground">/ {p.duration}</span>
            </div>
            <ul className="mb-4 space-y-2 text-sm">
              {p.perks.map((perk) => (
                <li key={perk} className="flex items-start gap-2 text-muted-foreground"><Check className="mt-0.5 h-4 w-4 text-success" /> {perk}</li>
              ))}
            </ul>
            <div className="mt-auto space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Minimum</span><span className="font-medium text-foreground">{formatNaira(p.min)}</span></div>
              <div className="flex justify-between"><span>Maximum</span><span className="font-medium text-foreground">{formatNaira(p.max)}</span></div>
              <div className="flex justify-between"><span>Risk</span><span className="font-medium text-foreground">{p.risk}</span></div>
            </div>
            <InvestDialog plan={p.name} min={p.min} />
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}

function InvestDialog({ plan, min }: { plan: string; min: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="mt-6 rounded-full">Invest now</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Invest in {plan}</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            toast.success("Investment started", { description: `Your ${plan} plan is now active.` });
            setOpen(false);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label>Amount (₦)</Label>
            <Input type="number" required min={min} step={1000} defaultValue={min} />
            <p className="text-xs text-muted-foreground">Minimum {formatNaira(min)}</p>
          </div>
          <DialogFooter>
            <Button type="submit" className="w-full rounded-full">Confirm investment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

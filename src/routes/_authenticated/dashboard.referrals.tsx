import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { referrals as referralHistory, walletStats } from "@/lib/mock-data";
import { formatNaira } from "@/lib/format";
import { Copy, Share2, Users, Gift } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/referrals")({
  head: () => ({ meta: [{ title: "Referrals — SILVER SPOON" }] }),
  component: Referrals,
});

const LINK = "https://silverspoon.ng/r/ADAEZE-2025";

function Referrals() {
  const copy = () => {
    navigator.clipboard.writeText(LINK).then(() => toast.success("Referral link copied"));
  };
  return (
    <DashboardLayout title="Referrals">
      <div className="grid gap-4 md:grid-cols-3">
        <Card icon={<Gift className="h-4 w-4" />} label="Referral earnings" value={formatNaira(walletStats.referralEarnings)} />
        <Card icon={<Users className="h-4 w-4" />} label="Total referrals" value={referralHistory.length.toString()} />
        <Card icon={<Share2 className="h-4 w-4" />} label="Conversion rate" value="68%" />
      </div>

      <div className="card-premium mt-6 p-6">
        <h2 className="font-display text-xl">Your referral link</h2>
        <p className="text-sm text-muted-foreground">Earn 5% of every deposit made by people you refer, for life.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={LINK} className="font-mono text-sm" />
          <Button onClick={copy} className="rounded-full"><Copy className="mr-2 h-4 w-4" /> Copy link</Button>
        </div>
      </div>

      <div className="card-premium mt-6 p-6">
        <h2 className="font-display text-xl">Referral history</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-secondary text-xs uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Joined</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Bonus</th></tr>
            </thead>
            <tbody>
              {referralHistory.map((r) => (
                <tr key={r.name} className="border-t border-border">
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.joined}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "Active" ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-success">{formatNaira(r.bonus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card-premium p-5">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>{icon}
      </div>
      <p className="font-display mt-3 text-2xl">{value}</p>
    </div>
  );
}

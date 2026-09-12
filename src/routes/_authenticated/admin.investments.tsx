import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { completeInvestment } from "@/lib/admin.functions";
import { useAdminOverview, formatDate } from "@/hooks/useAdminData";
import { EmptyBlock, LoadingBlock, Panel, StatusBadge } from "@/components/admin/DataState";

export const Route = createFileRoute("/_authenticated/admin/investments")({
  head: () => ({ meta: [{ title: "Investments — Admin" }] }),
  component: InvestmentsPage,
});

function InvestmentsPage() {
  const { data, isPending, error, refresh } = useAdminOverview();
  const complete = useServerFn(completeInvestment);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = data?.investments ?? [];
  const activeValue = rows.filter((i) => i.status === "Active").reduce((s, i) => s + Number(i.amount), 0);

  const markComplete = async (id: string) => {
    setBusy(id);
    try {
      const res = (await complete({ data: { id } })) as { ok: boolean; error?: string; payout?: number };
      if (!res.ok) toast.error("Could not complete", { description: res.error });
      else {
        await refresh();
        toast.success("Investment completed", {
          description: `${formatNaira(res.payout ?? 0)} profit credited to the customer.`,
        });
      }
    } catch (err) {
      toast.error("Could not complete investment", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
    setBusy(null);
  };

  return (
    <AdminLayout title="Investments">
      <Panel
        title="Customer investments"
        action={<span className="text-sm text-muted-foreground">Active capital: <strong className="text-foreground">{formatNaira(activeValue)}</strong></span>}
      >
        {isPending ? (
          <LoadingBlock />
        ) : error ? (
          <EmptyBlock message="Could not load investments. Refresh and try again." />
        ) : rows.length === 0 ? (
          <EmptyBlock message="No investments yet. They appear here once customers fund a plan." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-secondary text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Plan</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">ROI</th>
                  <th className="px-4 py-3 text-left">Matures</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{i.user_name}</td>
                    <td className="px-4 py-3">{i.plan_name}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatNaira(Number(i.amount))}</td>
                    <td className="px-4 py-3 text-right">{Number(i.roi_percent)}%</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(i.matures_at)}</td>
                    <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {i.status === "Active" ? (
                        <Button size="sm" disabled={busy === i.id} onClick={() => markComplete(i.id)}>
                          Mark complete
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Settled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AdminLayout>
  );
}

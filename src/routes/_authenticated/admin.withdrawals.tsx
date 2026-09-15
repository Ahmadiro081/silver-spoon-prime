import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { reviewTransaction } from "@/lib/admin.functions";
import { payoutWithdrawal } from "@/lib/payments.functions";
import { useAdminOverview, formatDate } from "@/hooks/useAdminData";
import { EmptyBlock, LoadingBlock, Panel, StatusBadge } from "@/components/admin/DataState";

export const Route = createFileRoute("/_authenticated/admin/withdrawals")({
  head: () => ({ meta: [{ title: "Withdrawals — Admin" }] }),
  component: WithdrawalsPage,
});

function WithdrawalsPage() {
  const { data, isPending, error, refresh } = useAdminOverview();
  const review = useServerFn(reviewTransaction);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = (data?.transactions ?? []).filter((t) => t.type === "Withdrawal");
  const pendingValue = rows.filter((t) => t.status === "Pending").reduce((s, t) => s + t.amount, 0);

  const act = async (id: string, status: "Completed" | "Failed") => {
    setBusy(id);
    try {
      await review({ data: { id, status } });
      await refresh();
      toast.success(status === "Completed" ? "Payout released" : "Withdrawal declined");
    } catch (err) {
      toast.error("Could not update withdrawal", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
    setBusy(null);
  };

  return (
    <AdminLayout title="Withdrawals">
      <Panel
        title="Payout queue"
        action={<span className="text-sm text-muted-foreground">Awaiting payout: <strong className="text-foreground">{formatNaira(pendingValue)}</strong></span>}
      >
        {isPending ? (
          <LoadingBlock />
        ) : error ? (
          <EmptyBlock message="Could not load withdrawals. Refresh and try again." />
        ) : rows.length === 0 ? (
          <EmptyBlock message="No withdrawal requests yet." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-secondary text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Destination</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-3">{formatDate(t.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{t.user_name}</p>
                      <p className="text-xs text-muted-foreground">{t.user_email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.method ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatNaira(t.amount)}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3">
                      {t.status === "Pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" disabled={busy === t.id} onClick={() => act(t.id, "Completed")}>Release</Button>
                          <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => act(t.id, "Failed")}>Decline</Button>
                        </div>
                      ) : (
                        <p className="text-right text-xs text-muted-foreground">Reviewed</p>
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

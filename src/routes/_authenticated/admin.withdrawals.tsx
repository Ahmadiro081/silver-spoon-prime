import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { transactions } from "@/lib/mock-data";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/withdrawals")({
  head: () => ({ meta: [{ title: "Withdrawals — Admin" }] }),
  component: () => {
    const rows = transactions.filter((t) => t.type === "Withdrawal");
    return (
      <AdminLayout title="Withdrawals">
        <div className="card-premium overflow-x-auto p-6">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-xs uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">ID</th><th className="px-4 py-3 text-left">Destination</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-4 py-3">{t.date}</td>
                  <td className="px-4 py-3 font-mono text-xs">{t.id}</td>
                  <td className="px-4 py-3">{t.method}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatNaira(t.amount)}</td>
                  <td className="px-4 py-3">{t.status}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" onClick={() => toast.success("Payout released")}>Release</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminLayout>
    );
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { transactions } from "@/lib/mock-data";
import { formatNaira } from "@/lib/format";

export const Route = createFileRoute("/admin/transactions")({
  head: () => ({ meta: [{ title: "Transactions — Admin" }] }),
  component: () => (
    <AdminLayout title="Transactions">
      <div className="card-premium overflow-x-auto p-6">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-widest text-muted-foreground">
            <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">ID</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Method</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-left">Status</th></tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-3">{t.date}</td>
                <td className="px-4 py-3 font-mono text-xs">{t.id}</td>
                <td className="px-4 py-3">{t.type}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.method}</td>
                <td className="px-4 py-3 text-right font-medium">{formatNaira(t.amount)}</td>
                <td className="px-4 py-3">{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  ),
});

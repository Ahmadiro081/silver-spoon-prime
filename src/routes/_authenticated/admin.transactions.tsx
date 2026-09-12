import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { Input } from "@/components/ui/input";
import { formatNaira } from "@/lib/format";
import { useState } from "react";
import { Search } from "lucide-react";
import { useAdminOverview, formatDate } from "@/hooks/useAdminData";
import { EmptyBlock, LoadingBlock, Panel, StatusBadge } from "@/components/admin/DataState";

export const Route = createFileRoute("/_authenticated/admin/transactions")({
  head: () => ({ meta: [{ title: "Transactions — Admin" }] }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { data, isPending, error } = useAdminOverview();
  const [q, setQ] = useState("");
  const rows = (data?.transactions ?? []).filter((t) =>
    `${t.user_name} ${t.user_email} ${t.type} ${t.status}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <AdminLayout title="Transactions">
      <Panel
        title="All activity"
        action={
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions…" className="pl-9" />
          </div>
        }
      >
        {isPending ? (
          <LoadingBlock />
        ) : error ? (
          <EmptyBlock message="Could not load transactions. Refresh and try again." />
        ) : rows.length === 0 ? (
          <EmptyBlock message="No transactions match this search yet." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-secondary text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Method</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Status</th>
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
                    <td className="px-4 py-3">{t.type}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.method ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatNaira(t.amount)}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
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

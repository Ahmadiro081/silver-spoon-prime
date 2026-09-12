import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/format";
import { Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { setUserStatus } from "@/lib/admin.functions";
import { useAdminOverview, formatDate } from "@/hooks/useAdminData";
import { EmptyBlock, LoadingBlock, Panel, StatusBadge } from "@/components/admin/DataState";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Users — Admin" }] }),
  component: UsersPage,
});

function UsersPage() {
  const { data, isPending, error, refresh } = useAdminOverview();
  const updateStatus = useServerFn(setUserStatus);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const rows = (data?.users ?? []).filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  const toggle = async (userId: string, status: string) => {
    const next = status === "Active" ? "Suspended" : "Active";
    setBusy(userId);
    try {
      await updateStatus({ data: { userId, status: next } });
      await refresh();
      toast.success(`Account ${next.toLowerCase()}`);
    } catch (err) {
      toast.error("Could not update account", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
    setBusy(null);
  };

  return (
    <AdminLayout title="User management">
      <Panel
        title="Customers"
        action={
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…" className="pl-9" />
          </div>
        }
      >
        {isPending ? (
          <LoadingBlock />
        ) : error ? (
          <EmptyBlock message="Could not load customers. Refresh and try again." />
        ) : rows.length === 0 ? (
          <EmptyBlock message="No customer accounts match this search." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-secondary text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Joined</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-right">Invested</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-ink text-xs font-semibold text-primary-foreground">
                          {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <p className="font-medium">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(u.joined)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatNaira(u.balance)}</td>
                    <td className="px-4 py-3 text-right">{formatNaira(u.invested)}</td>
                    <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" disabled={busy === u.id} onClick={() => toggle(u.id, u.status)}>
                        {u.status === "Active" ? "Suspend" : "Reactivate"}
                      </Button>
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

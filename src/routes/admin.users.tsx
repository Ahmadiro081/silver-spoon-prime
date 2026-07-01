import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adminUsers } from "@/lib/mock-data";
import { formatNaira } from "@/lib/format";
import { Search, MoreHorizontal } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users — Admin" }] }),
  component: UsersPage,
});

function UsersPage() {
  const [q, setQ] = useState("");
  const rows = adminUsers.filter((u) => `${u.name} ${u.email} ${u.id}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <AdminLayout title="User management">
      <div className="card-premium p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…" className="pl-9" />
          </div>
          <Button className="rounded-full">Invite user</Button>
        </div>
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary text-xs uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-4 py-3 text-left">User</th><th className="px-4 py-3 text-left">Tier</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-ink text-xs font-semibold text-primary-foreground">
                        {u.name.split(" ").map((n) => n[0]).join("")}
                      </span>
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{u.tier}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatNaira(u.balance)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.status === "Active" ? "bg-success/15 text-success"
                      : u.status === "Pending" ? "bg-warning/20 text-warning-foreground"
                      : "bg-destructive/15 text-destructive"
                    }`}>{u.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

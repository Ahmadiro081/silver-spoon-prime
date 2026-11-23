import { useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { MetricCard, SegmentedFilter, StatusText } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import type { AccountStatus, UserProfile } from "@/types/domain";
import { calculateUserWalletMetrics } from "@/utils/calculations";
import { formatDate, formatNaira } from "@/utils/format";

export function AdminUsersPage() {
  const { users, transactions, investments, adminUpdateUserStatus, adminUpdateUserTier } =
    useAppState();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AccountStatus>("ALL");

  const investors = users.filter((u) => u.role === "investor");

  const filtered = investors.filter((u) => {
    const matchesStatus = statusFilter === "ALL" || u.status === statusFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const handleStatusChange = (user: UserProfile, next: AccountStatus) => {
    const res = adminUpdateUserStatus(user.id, next);
    if (res.ok) toast.success(`${user.fullName} set to ${next}.`);
  };

  const handleTierChange = (user: UserProfile, tier: UserProfile["tier"]) => {
    const res = adminUpdateUserTier(user.id, tier);
    if (res.ok) toast.success(`${user.fullName} moved to ${tier} tier.`);
  };

  return (
    <AdminDashboardLayout title="User Management" breadcrumb="Users">
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Total Client Accounts" value={String(investors.length)} />
          <MetricCard
            label="Active Verified Clients"
            value={String(investors.filter((u) => u.status === "Active").length)}
          />
          <MetricCard
            label="Pending KYC / Suspended"
            value={String(investors.filter((u) => u.status !== "Active").length)}
          />
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, or user ID..."
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <SegmentedFilter
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: "All", value: "ALL" },
              { label: "Active", value: "Active" },
              { label: "Pending KYC", value: "Pending KYC" },
              { label: "Suspended", value: "Suspended" },
            ]}
          />
        </div>

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Client</th>
                  <th className="px-6 py-3 font-medium">Tier & KYC</th>
                  <th className="px-6 py-3 text-right font-medium">Total Balance</th>
                  <th className="px-6 py-3 text-right font-medium">Active Invested</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((user) => {
                  const uTxns = transactions.filter((t) => t.userId === user.id);
                  const uInvs = investments.filter((i) => i.userId === user.id);
                  const wallet = calculateUserWalletMetrics(uTxns, uInvs);
                  return (
                    <tr key={user.id} className="hover:bg-secondary/25">
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-foreground">{user.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {user.email} · <span className="font-tabular">{user.id}</span>
                        </p>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Tier for ${user.fullName}`}
                            value={user.tier}
                            onChange={(e) =>
                              handleTierChange(user, e.target.value as UserProfile["tier"])
                            }
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground"
                          >
                            <option value="Silver">Silver</option>
                            <option value="Platinum">Platinum</option>
                            <option value="Sovereign">Sovereign</option>
                          </select>
                          <span className="text-xs text-muted-foreground">{user.kycLevel}</span>
                        </div>
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right font-semibold text-foreground">
                        {formatNaira(wallet.totalWalletBalance)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right text-muted-foreground">
                        {formatNaira(wallet.activeInvestments)}
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusText status={user.status} />
                        <p className="font-tabular text-[11px] text-muted-foreground">
                          Joined {formatDate(user.joinedAt)}
                        </p>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {user.status === "Active" ? (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(user, "Suspended")}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(user, "Active")}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            Activate
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminDashboardLayout>
  );
}

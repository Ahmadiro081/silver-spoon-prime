import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { formatNaira, formatCompactNaira } from "@/lib/format";
import { Users, Landmark, TrendingUp, Clock } from "lucide-react";
import { useAdminOverview, formatDate } from "@/hooks/useAdminData";
import { EmptyBlock, LoadingBlock, StatusBadge, chartTooltipStyle } from "@/components/admin/DataState";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Overview — SILVER SPOON" },
      { name: "description", content: "Live deposits, withdrawals, investments and customer growth for SILVER SPOON." },
    ],
  }),
  component: AdminOverviewPage,
});

const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)"];

function AdminOverviewPage() {
  const { data, isPending, error } = useAdminOverview();
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setHidden((h) => ({ ...h, [key]: !h[key] }));

  const kpis = data?.kpis;
  const monthly = data?.monthly ?? [];
  const growth = data?.userGrowth ?? [];
  const breakdown = data?.revenueBreakdown ?? [];
  const recent = (data?.transactions ?? []).slice(0, 6);
  const topUsers = [...(data?.users ?? [])].sort((a, b) => b.balance - a.balance).slice(0, 5);
  const hasMoney = monthly.some((m) => m.deposits || m.withdrawals || m.profit);

  return (
    <AdminLayout title="Overview">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Users className="h-4 w-4" />} label="Total users" value={kpis ? kpis.users.toLocaleString() : "—"} sub="Registered accounts" />
        <Kpi icon={<Landmark className="h-4 w-4" />} label="Assets under mgmt" value={kpis ? formatCompactNaira(kpis.aum) : "—"} sub="Customer balances" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Revenue this month" value={kpis ? formatCompactNaira(kpis.monthlyRevenue) : "—"} sub="Approved deposits" tone="success" />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Pending withdrawals" value={kpis ? kpis.pendingWithdrawals.toString() : "—"} sub={kpis ? `${formatNaira(kpis.pendingWithdrawalValue)} awaiting` : "Requires review"} tone="warn" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card-premium p-6 lg:col-span-2">
          <h2 className="font-display text-xl">Deposits vs withdrawals</h2>
          <p className="mt-1 text-xs text-muted-foreground">Click a legend item to hide or show a series.</p>
          <div className="mt-4 h-72">
            {isPending ? (
              <LoadingBlock height="h-full" />
            ) : error ? (
              <EmptyBlock message="Could not load chart data. Refresh and try again." height="h-full" />
            ) : !hasMoney ? (
              <EmptyBlock message="No money movement recorded yet." height="h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `₦${Math.round(v / 1000)}k`} />
                  <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.25 }} contentStyle={chartTooltipStyle} formatter={(v: number, name) => [formatNaira(v), String(name)]} />
                  <Legend
                    onClick={(entry) => toggle(String(entry.dataKey))}
                    wrapperStyle={{ cursor: "pointer", fontSize: 12 }}
                  />
                  <Bar name="Deposits" dataKey="deposits" hide={hidden["deposits"]} fill="var(--color-chart-1)" radius={[8, 8, 0, 0]} />
                  <Bar name="Withdrawals" dataKey="withdrawals" hide={hidden["withdrawals"]} fill="var(--color-chart-2)" radius={[8, 8, 0, 0]} />
                  <Bar name="Profit paid" dataKey="profit" hide={hidden["profit"]} fill="var(--color-chart-3)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card-premium p-6">
          <h2 className="font-display text-xl">Invested by plan</h2>
          <div className="mt-4 h-72">
            {isPending ? (
              <LoadingBlock height="h-full" />
            ) : breakdown.length === 0 ? (
              <EmptyBlock message="No investments yet." height="h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={breakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                    {breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name) => [`${v}%`, String(name)]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card-premium p-6 lg:col-span-2">
          <h2 className="font-display text-xl">User growth</h2>
          <div className="mt-4 h-64">
            {isPending ? (
              <LoadingBlock height="h-full" />
            ) : growth.length === 0 ? (
              <EmptyBlock message="No customers yet." height="h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [`${v}`, "Users"]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line name="Users" type="monotone" dataKey="users" stroke="var(--color-chart-3)" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card-premium p-6">
          <h2 className="font-display text-xl">Top customers</h2>
          {isPending ? (
            <div className="mt-4"><LoadingBlock height="h-40" /></div>
          ) : topUsers.length === 0 ? (
            <div className="mt-4"><EmptyBlock message="No customers yet." height="h-40" /></div>
          ) : (
            <ul className="mt-4 space-y-3">
              {topUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <p className="font-mono text-sm">{formatCompactNaira(u.balance)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card-premium mt-6 p-6">
        <h2 className="font-display text-xl">Latest activity</h2>
        <div className="mt-4">
          {isPending ? (
            <LoadingBlock height="h-48" />
          ) : recent.length === 0 ? (
            <EmptyBlock message="No transactions yet." height="h-48" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-secondary text-xs uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="px-4 py-3">{formatDate(t.created_at)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{t.user_name}</p>
                        <p className="text-xs text-muted-foreground">{t.user_email}</p>
                      </td>
                      <td className="px-4 py-3">{t.type}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatNaira(t.amount)}</td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone?: "success" | "warn" }) {
  return (
    <div className="card-premium p-5">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>{icon}
      </div>
      <p className="font-display mt-3 text-2xl">{value}</p>
      <p className={`mt-1 text-xs ${tone === "success" ? "text-success" : tone === "warn" ? "text-warning-foreground" : "text-muted-foreground"}`}>{sub}</p>
    </div>
  );
}

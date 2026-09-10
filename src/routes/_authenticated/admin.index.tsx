import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { adminKpis, growthChart, userGrowth, revenueBreakdown, adminUsers, transactions } from "@/lib/mock-data";
import { formatNaira, formatCompactNaira } from "@/lib/format";
import { Users, Landmark, TrendingUp, Clock } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin — SILVER SPOON" }] }),
  component: AdminOverview,
});

const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)"];

function AdminOverview() {
  return (
    <AdminLayout title="Overview">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Users className="h-4 w-4" />} label="Total users" value={adminKpis.users.toLocaleString()} sub="+8.2% this month" />
        <Kpi icon={<Landmark className="h-4 w-4" />} label="Assets under mgmt" value={formatCompactNaira(adminKpis.aum)} sub="+₦412m QoQ" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Monthly revenue" value={formatCompactNaira(adminKpis.monthlyRevenue)} sub="+14.1% MoM" tone="success" />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Pending withdrawals" value={adminKpis.pendingWithdrawals.toString()} sub="Requires review" tone="warn" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card-premium p-6 lg:col-span-2">
          <h2 className="font-display text-xl">Deposits vs withdrawals</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growthChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `₦${v/1000}k`} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} formatter={(v: number) => formatNaira(v)} />
                <Bar dataKey="deposits" fill="var(--color-chart-1)" radius={[8,8,0,0]} />
                <Bar dataKey="withdrawals" fill="var(--color-chart-2)" radius={[8,8,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card-premium p-6">
          <h2 className="font-display text-xl">Revenue by plan</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={revenueBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                  {revenueBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} formatter={(v: number) => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {revenueBreakdown.map((r, i) => (
              <li key={r.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />{r.name}</span>
                <span className="font-medium">{r.value}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card-premium p-6 lg:col-span-2">
          <h2 className="font-display text-xl">User growth</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={userGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                <Line type="monotone" dataKey="users" stroke="var(--color-chart-3)" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card-premium p-6">
          <h2 className="font-display text-xl">Top users</h2>
          <ul className="mt-4 space-y-3">
            {adminUsers.slice(0, 5).map((u) => (
              <li key={u.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.tier}</p>
                </div>
                <p className="font-mono text-sm">{formatCompactNaira(u.balance)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card-premium mt-6 p-6">
        <h2 className="font-display text-xl">Latest activity</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-xs uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">ID</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-left">Status</th></tr>
            </thead>
            <tbody>
              {transactions.slice(0, 6).map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-4 py-3">{t.date}</td>
                  <td className="px-4 py-3">{t.type}</td>
                  <td className="px-4 py-3 font-mono text-xs">{t.id}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatNaira(t.amount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

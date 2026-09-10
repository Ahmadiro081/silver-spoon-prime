import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { growthChart, userGrowth, revenueBreakdown } from "@/lib/mock-data";
import { formatNaira } from "@/lib/format";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Admin" }] }),
  component: Analytics,
});

const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)"];

function Analytics() {
  return (
    <AdminLayout title="Analytics">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue trend">
          <AreaChart data={growthChart}>
            <defs>
              <linearGradient id="rv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `₦${v/1000}k`} />
            <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} formatter={(v: number) => formatNaira(v)} />
            <Area type="monotone" dataKey="profit" stroke="var(--color-chart-3)" fill="url(#rv)" strokeWidth={2} />
          </AreaChart>
        </Panel>
        <Panel title="User growth">
          <BarChart data={userGrowth}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
            <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
            <Bar dataKey="users" fill="var(--color-chart-1)" radius={[8,8,0,0]} />
          </BarChart>
        </Panel>
        <Panel title="Deposits vs withdrawals">
          <BarChart data={growthChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `₦${v/1000}k`} />
            <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} formatter={(v: number) => formatNaira(v)} />
            <Bar dataKey="deposits" fill="var(--color-chart-1)" radius={[8,8,0,0]} />
            <Bar dataKey="withdrawals" fill="var(--color-chart-2)" radius={[8,8,0,0]} />
          </BarChart>
        </Panel>
        <Panel title="Revenue by plan">
          <PieChart>
            <Pie data={revenueBreakdown} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3}>
              {revenueBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} formatter={(v: number) => `${v}%`} />
          </PieChart>
        </Panel>
      </div>
    </AdminLayout>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="card-premium p-6">
      <h2 className="font-display text-xl">{title}</h2>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

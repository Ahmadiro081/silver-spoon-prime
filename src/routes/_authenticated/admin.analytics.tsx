import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactElement } from "react";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { formatNaira } from "@/lib/format";
import { useAdminOverview } from "@/hooks/useAdminData";
import { EmptyBlock, LoadingBlock, chartTooltipStyle } from "@/components/admin/DataState";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — SILVER SPOON Admin" },
      { name: "description", content: "Live revenue, deposits, withdrawals and customer growth analytics for SILVER SPOON." },
    ],
  }),
  component: Analytics,
});

const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)"];

function Analytics() {
  const { data, isPending, error } = useAdminOverview();
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setHidden((h) => ({ ...h, [key]: !h[key] }));

  const monthly = data?.monthly ?? [];
  const growth = data?.userGrowth ?? [];
  const breakdown = data?.revenueBreakdown ?? [];
  const hasMoney = monthly.some((m) => m.deposits || m.withdrawals || m.profit);
  const hasUsers = growth.some((g) => g.users > 0);

  const legendProps = {
    onClick: (entry: { dataKey?: unknown }) => toggle(String(entry.dataKey)),
    wrapperStyle: { cursor: "pointer", fontSize: 12 },
  };

  return (
    <AdminLayout title="Analytics">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Profit paid out" isPending={isPending} error={error} isEmpty={!monthly.some((m) => m.profit)}>
          <AreaChart data={monthly}>
            <defs>
              <linearGradient id="rv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `₦${Math.round(v / 1000)}k`} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [formatNaira(v), "Profit"]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area name="Profit" type="monotone" dataKey="profit" stroke="var(--color-chart-3)" fill="url(#rv)" strokeWidth={2} />
          </AreaChart>
        </Panel>

        <Panel title="User growth" isPending={isPending} error={error} isEmpty={!hasUsers}>
          <BarChart data={growth}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
            <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.25 }} contentStyle={chartTooltipStyle} formatter={(v: number) => [`${v}`, "Users"]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar name="Users" dataKey="users" fill="var(--color-chart-1)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </Panel>

        <Panel title="Deposits vs withdrawals" isPending={isPending} error={error} isEmpty={!hasMoney} hint="Click a legend item to hide or show a series.">
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `₦${Math.round(v / 1000)}k`} />
            <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.25 }} contentStyle={chartTooltipStyle} formatter={(v: number, name) => [formatNaira(v), String(name)]} />
            <Legend {...legendProps} />
            <Bar name="Deposits" dataKey="deposits" hide={hidden["deposits"]} fill="var(--color-chart-1)" radius={[8, 8, 0, 0]} />
            <Bar name="Withdrawals" dataKey="withdrawals" hide={hidden["withdrawals"]} fill="var(--color-chart-2)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </Panel>

        <Panel title="Invested by plan" isPending={isPending} error={error} isEmpty={breakdown.length === 0}>
          <PieChart>
            <Pie data={breakdown} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3}>
              {breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name) => [`${v}%`, String(name)]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </Panel>
      </div>
    </AdminLayout>
  );
}

function Panel({
  title, children, isPending, error, isEmpty, hint,
}: {
  title: string;
  children: ReactElement;
  isPending: boolean;
  error: unknown;
  isEmpty: boolean;
  hint?: string;
}) {
  return (
    <div className="card-premium p-6">
      <h2 className="font-display text-xl">{title}</h2>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-4 h-72">
        {isPending ? (
          <LoadingBlock height="h-full" />
        ) : error ? (
          <EmptyBlock message="Could not load this chart. Refresh and try again." height="h-full" />
        ) : isEmpty ? (
          <EmptyBlock message="No data for this period yet." height="h-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

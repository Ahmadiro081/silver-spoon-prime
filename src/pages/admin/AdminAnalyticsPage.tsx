import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { EmptyState, MetricCard } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import { buildPlatformMonthlyMetrics } from "@/utils/calculations";
import { formatCompactNaira, formatNaira, formatNumber } from "@/utils/format";

const PIE_COLORS = ["#0f1d36", "#4b6584", "#15803d", "#b45309", "#64748b"];

export function AdminAnalyticsPage() {
  const { users, transactions, investments, plans } = useAppState();

  const monthlySeries = useMemo(
    () => buildPlatformMonthlyMetrics(users, transactions, investments),
    [users, transactions, investments],
  );

  const planDistribution = useMemo(
    () =>
      plans
        .map((p) => ({
          name: p.name,
          value: investments
            .filter((i) => i.planId === p.id && i.status !== "Cancelled")
            .reduce((s, i) => s + i.principal, 0),
        }))
        .filter((d) => d.value > 0),
    [plans, investments],
  );

  const latest = monthlySeries[monthlySeries.length - 1] ?? {
    month: "Current",
    deposits: 0,
    withdrawals: 0,
    portfolioValue: 0,
    realizedEarnings: 0,
    activeUsers: 0,
  };
  const previous = monthlySeries[monthlySeries.length - 2];

  const aumChangePct =
    previous && previous.portfolioValue > 0
      ? ((latest.portfolioValue - previous.portfolioValue) / previous.portfolioValue) * 100
      : null;

  const cumulativeNetInflow = monthlySeries.reduce((s, m) => s + (m.deposits - m.withdrawals), 0);
  const cumulativeRealized = transactions
    .filter((t) => t.type === "Realized Return" && t.status === "Completed")
    .reduce((s, t) => s + t.amount, 0);

  return (
    <AdminDashboardLayout title="Financial Analytics" breadcrumb="Analytics">
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Live Platform Portfolio AUM"
            value={formatCompactNaira(latest.portfolioValue)}
            delta={
              aumChangePct !== null
                ? `${aumChangePct >= 0 ? "+" : ""}${aumChangePct.toFixed(1)}% vs ${previous?.month}`
                : undefined
            }
            deltaTone={
              aumChangePct === null ? "neutral" : aumChangePct >= 0 ? "positive" : "negative"
            }
            detail={`Exact: ${formatNaira(latest.portfolioValue)}`}
          />
          <MetricCard
            label="7-Month Net Treasury Flow"
            value={formatCompactNaira(cumulativeNetInflow)}
            detail={`Latest month: In ${formatCompactNaira(latest.deposits)} / Out ${formatCompactNaira(latest.withdrawals)}`}
            deltaTone={cumulativeNetInflow >= 0 ? "positive" : "negative"}
          />
          <MetricCard
            label="Cumulative Realized Returns"
            value={formatCompactNaira(cumulativeRealized)}
            detail={`Current month: ${formatNaira(latest.realizedEarnings)}`}
          />
          <MetricCard
            label="Active Non-Suspended Accounts"
            value={formatNumber(latest.activeUsers)}
            detail={`Out of ${users.filter((u) => u.role === "investor").length} registered investors`}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-12">
          <div className="surface-card p-6 lg:col-span-8">
            <h2 className="font-display text-xl font-medium text-foreground">
              Portfolio AUM Trajectory (NGN)
            </h2>
            <p className="text-xs text-muted-foreground">
              Live ledger-derived assets under administration across all active investor accounts
            </p>
            <div className="mt-5 h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlySeries}>
                  <defs>
                    <linearGradient id="aumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatCompactNaira(Number(v))} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} width={66} />
                  <Tooltip
                    formatter={(v: number) => formatNaira(v)}
                    contentStyle={{
                      backgroundColor: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                  />
                  <Area type="monotone" dataKey="portfolioValue" name="Portfolio AUM" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#aumGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="surface-card p-6 lg:col-span-4">
            <h2 className="font-display text-xl font-medium text-foreground">Mandate Mix</h2>
            <p className="text-xs text-muted-foreground">Share of total allocated Naira principal</p>
            {planDistribution.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  title="No allocations recorded"
                  description="Mandate distribution will display once investors subscribe to active plans."
                />
              </div>
            ) : (
              <>
                <div className="mt-4 h-[210px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={planDistribution}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={54}
                        outerRadius={82}
                        paddingAngle={3}
                      >
                        {planDistribution.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatNaira(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  {planDistribution.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 truncate text-muted-foreground">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-xs"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="truncate">{d.name}</span>
                      </span>
                      <span className="font-tabular font-medium text-foreground">
                        {formatCompactNaira(d.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="surface-card p-6">
          <h2 className="font-display text-xl font-medium text-foreground">
            Client Growth & Realized Distributions
          </h2>
          <p className="text-xs text-muted-foreground">
            Rolling 7-month registered investor count computed from live account records
          </p>
          <div className="mt-5 h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tickFormatter={(v) => formatNumber(Number(v))} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  formatter={(v: number) => formatNumber(v)}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "10px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="activeUsers" name="Active Accounts" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </AdminDashboardLayout>
  );
}

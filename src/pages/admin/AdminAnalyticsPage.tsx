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
import { MetricCard } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import { MONTHLY_PERFORMANCE } from "@/data/mockDatabase";
import { formatCompactNaira, formatNaira, formatNumber } from "@/utils/format";

const PIE_COLORS = ["#0f1d36", "#4b6584", "#15803d", "#b45309"];

export function AdminAnalyticsPage() {
  const { investments, plans } = useAppState();

  const planDistribution = plans
    .map((p) => ({
      name: p.name,
      value: investments
        .filter((i) => i.planId === p.id)
        .reduce((s, i) => s + i.principal, 0),
    }))
    .filter((d) => d.value > 0);

  const latest = MONTHLY_PERFORMANCE[MONTHLY_PERFORMANCE.length - 1]!;
  const netFlow = latest.deposits - latest.withdrawals;

  return (
    <AdminDashboardLayout title="Financial Analytics" breadcrumb="Analytics">
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Latest Month Portfolio AUM"
            value={formatCompactNaira(latest.portfolioValue)}
            delta="+8.2% MoM"
            deltaTone="positive"
          />
          <MetricCard
            label="Latest Month Net Inflow"
            value={formatCompactNaira(netFlow)}
            detail={`In ${formatCompactNaira(latest.deposits)} / Out ${formatCompactNaira(latest.withdrawals)}`}
          />
          <MetricCard
            label="Realized Returns Distributed"
            value={formatCompactNaira(latest.realizedEarnings)}
            detail="Simulated monthly settlement"
          />
          <MetricCard
            label="Platform Active Accounts"
            value={formatNumber(latest.activeUsers)}
            delta="+5.9% MoM"
            deltaTone="positive"
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-12">
          <div className="surface-card p-6 lg:col-span-8">
            <h2 className="font-display text-xl font-medium text-foreground">
              Portfolio AUM Trajectory (NGN)
            </h2>
            <p className="text-xs text-muted-foreground">
              Cumulative simulated assets under administration across Naira mandates
            </p>
            <div className="mt-5 h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={MONTHLY_PERFORMANCE}>
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
          </div>
        </section>

        <section className="surface-card p-6">
          <h2 className="font-display text-xl font-medium text-foreground">
            Client Growth & Realized Distributions
          </h2>
          <p className="text-xs text-muted-foreground">Monthly active account growth trajectory</p>
          <div className="mt-5 h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MONTHLY_PERFORMANCE}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => formatNumber(Number(v))} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} width={56} />
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

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { MetricCard, StatusText } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import { MONTHLY_PERFORMANCE } from "@/data/mockDatabase";
import { calculateUserWalletMetrics } from "@/utils/calculations";
import { formatCompactNaira, formatDateTime, formatNaira } from "@/utils/format";

export function AdminOverviewPage() {
  const { users, transactions, investments, auditLogs } = useAppState();

  const investors = users.filter((u) => u.role === "investor");
  const totalAum = investors.reduce((sum, u) => {
    const uTxns = transactions.filter((t) => t.userId === u.id);
    const uInvs = investments.filter((i) => i.userId === u.id);
    return sum + calculateUserWalletMetrics(uTxns, uInvs).totalWalletBalance;
  }, 0);

  const totalDeposits = transactions
    .filter((t) => t.type === "Deposit" && t.status === "Completed")
    .reduce((s, t) => s + t.amount, 0);

  const pendingDeposits = transactions.filter((t) => t.type === "Deposit" && t.status === "Pending");
  const pendingWithdrawals = transactions.filter(
    (t) => t.type === "Withdrawal" && t.status === "Pending",
  );
  const activeMandatesValue = investments
    .filter((i) => i.status === "Active")
    .reduce((s, i) => s + i.principal, 0);

  return (
    <AdminDashboardLayout
      title="Platform Overview"
      breadcrumb="Overview"
      action={
        <Link
          to="/admin/reports"
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground whitespace-nowrap hover:bg-primary/90"
        >
          Export Reports
        </Link>
      }
    >
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Simulated Assets Under Admin"
            value={formatCompactNaira(totalAum)}
            detail={`Exact: ${formatNaira(totalAum)}`}
          />
          <MetricCard
            label="Registered Investors"
            value={String(investors.length)}
            detail={`${investors.filter((u) => u.status === "Active").length} active · ${investors.filter((u) => u.status === "Pending KYC").length} pending KYC`}
          />
          <MetricCard
            label="Active Mandates Volume"
            value={formatCompactNaira(activeMandatesValue)}
            detail={`${investments.filter((i) => i.status === "Active").length} open allocations`}
          />
          <MetricCard
            label="Pending Treasury Reviews"
            value={String(pendingDeposits.length + pendingWithdrawals.length)}
            detail={`${pendingDeposits.length} deposits · ${pendingWithdrawals.length} withdrawals`}
            deltaTone={pendingWithdrawals.length > 0 ? "negative" : "neutral"}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-12">
          {/* Monthly Treasury Flows */}
          <div className="surface-card p-6 lg:col-span-8">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-display text-xl font-medium text-foreground">
                  Monthly Naira Treasury Flows
                </h2>
                <p className="text-xs text-muted-foreground">
                  Platform-wide confirmed deposits vs settled withdrawals (7-month series)
                </p>
              </div>
              <Link
                to="/admin/analytics"
                className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
              >
                Full Analytics <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-5 h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MONTHLY_PERFORMANCE} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCompactNaira(Number(v))}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <Tooltip
                    formatter={(value: number) => formatNaira(value)}
                    contentStyle={{
                      backgroundColor: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="deposits" name="Deposits" fill="var(--color-chart-1)" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="withdrawals" name="Withdrawals" fill="var(--color-chart-2)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pending Operations Queue */}
          <div className="surface-card flex flex-col justify-between p-6 lg:col-span-4">
            <div>
              <h2 className="font-display text-xl font-medium text-foreground">Action Queue</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Items awaiting treasury or compliance sign-off
              </p>

              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Pending Withdrawals</p>
                    <p className="font-tabular text-xs text-muted-foreground">
                      {formatNaira(pendingWithdrawals.reduce((s, t) => s + t.amount, 0))} total
                    </p>
                  </div>
                  <Link
                    to="/admin/withdrawals"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    Review ({pendingWithdrawals.length})
                  </Link>
                </div>

                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Pending Deposits</p>
                    <p className="font-tabular text-xs text-muted-foreground">
                      {formatNaira(pendingDeposits.reduce((s, t) => s + t.amount, 0))} total
                    </p>
                  </div>
                  <Link
                    to="/admin/deposits"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    Review ({pendingDeposits.length})
                  </Link>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Confirmed Deposits (Mock)</p>
                    <p className="font-tabular text-xs text-muted-foreground">
                      {formatNaira(totalDeposits)} cumulative
                    </p>
                  </div>
                  <Link
                    to="/admin/transactions"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    Inspect
                  </Link>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
              All admin actions record immediately into the platform audit trail.
            </div>
          </div>
        </section>

        {/* Recent Audit Trail Preview */}
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="font-display text-lg font-medium text-foreground">Recent Audit Events</h2>
              <p className="text-xs text-muted-foreground">Latest administrative, client, and system ledger activity</p>
            </div>
            <Link to="/admin/audit-logs" className="text-xs font-medium text-foreground hover:underline">
              Full Audit Log
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Timestamp</th>
                  <th className="px-6 py-3 font-medium">Actor</th>
                  <th className="px-6 py-3 font-medium">Event</th>
                  <th className="px-6 py-3 font-medium">Summary</th>
                  <th className="px-6 py-3 text-right font-medium">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLogs.slice(0, 5).map((log) => (
                  <tr key={log.id} className="hover:bg-secondary/25">
                    <td className="font-tabular px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="px-6 py-3 text-xs font-medium text-foreground">{log.actorName}</td>
                    <td className="font-tabular px-6 py-3 text-xs text-muted-foreground">{log.action}</td>
                    <td className="px-6 py-3 text-xs text-muted-foreground">{log.summary}</td>
                    <td className="px-6 py-3 text-right">
                      <StatusText status={log.severity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminDashboardLayout>
  );
}

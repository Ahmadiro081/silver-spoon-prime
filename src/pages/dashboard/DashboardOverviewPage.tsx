import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import { MetricCard, RiskDisclosure, StatusText } from "@/components/common/Primitives";
import { APP_CONFIG } from "@/config/app";
import { useAppState } from "@/context/AppStateContext";
import { USER_PORTFOLIO_HISTORY } from "@/data/mockDatabase";
import { calculateInvestmentProgress } from "@/utils/calculations";
import { daysRemaining, formatCompactNaira, formatDate, formatNaira } from "@/utils/format";

export function DashboardOverviewPage() {
  const { userWallet, userInvestments, userTransactions } = useAppState();
  const activeMandates = userInvestments.filter((i) => i.status === "Active");
  const recentTxns = userTransactions.slice(0, 6);

  const chartData = USER_PORTFOLIO_HISTORY.map((pt, idx) =>
    idx === USER_PORTFOLIO_HISTORY.length - 1
      ? {
          ...pt,
          balance: userWallet.totalWalletBalance,
          invested: userWallet.activeInvestments,
          realized: userWallet.realizedEarnings,
        }
      : pt,
  );

  return (
    <UserDashboardLayout
      title="Portfolio Overview"
      breadcrumb="Overview"
      action={
        <Link
          to="/dashboard/wallet"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground whitespace-nowrap transition-colors hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Fund Wallet
        </Link>
      }
    >
      <div className="space-y-6">
        {/* Primary Balance Banner + Key Breakdown */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-gradient-ink p-5 text-white">
            <p className="text-xs text-slate-300">Total Wallet Balance</p>
            <p className="font-tabular mt-2.5 text-2xl font-semibold tracking-tight">
              {formatNaira(userWallet.totalWalletBalance)}
            </p>
            <p className="mt-2 text-xs text-slate-300">
              Available + Active Mandates
            </p>
          </div>

          <MetricCard
            label="Available Balance"
            value={formatNaira(userWallet.availableBalance)}
            detail={
              userWallet.pendingWithdrawals > 0
                ? `${formatNaira(userWallet.pendingWithdrawals)} pending payout`
                : "Ready for allocation or payout"
            }
          />
          <MetricCard
            label="Active Investments"
            value={formatNaira(userWallet.activeInvestments)}
            detail={`${activeMandates.length} active Naira mandate${activeMandates.length === 1 ? "" : "s"}`}
          />
          <MetricCard
            label="Realized Earnings"
            value={formatNaira(userWallet.realizedEarnings)}
            detail={`+${formatNaira(userWallet.projectedAccrual)} accrued (est.)`}
            delta="Settled"
            deltaTone="positive"
          />
        </section>

        {/* Secondary Financial Metrics Row */}
        <section className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Total Deposits"
            value={formatNaira(userWallet.totalDeposits)}
            detail="Confirmed lifetime funding"
          />
          <MetricCard
            label="Total Withdrawals"
            value={formatNaira(userWallet.totalWithdrawals)}
            detail="Completed bank disbursements"
          />
          <MetricCard
            label="Referral Earnings"
            value={formatNaira(userWallet.referralEarnings)}
            detail="3.0% commission tier"
            deltaTone="positive"
          />
        </section>

        {/* Investment Performance Chart + Active Mandates */}
        <section className="grid gap-6 lg:grid-cols-12">
          <div className="surface-card p-6 lg:col-span-8">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-display text-xl font-medium text-foreground">
                  Investment Performance
                </h2>
                <p className="text-xs text-muted-foreground">
                  7-month Naira balance trajectory and active allocation history
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-chart-1" />
                  Total Balance
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-chart-3" />
                  Allocated Principal
                </span>
              </div>
            </div>

            <div className="mt-6 h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="investedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-chart-3)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--color-chart-3)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                  <Area
                    type="monotone"
                    dataKey="balance"
                    name="Total Balance"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    fill="url(#balanceGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="invested"
                    name="Allocated Principal"
                    stroke="var(--color-chart-3)"
                    strokeWidth={2}
                    fill="url(#investedGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="surface-card flex flex-col justify-between p-6 lg:col-span-4">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-medium text-foreground">Active Mandates</h2>
                <Link
                  to="/dashboard/investments"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Manage
                </Link>
              </div>

              <div className="mt-5 space-y-5">
                {activeMandates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active allocations yet. Select a structured mandate to allocate available Naira.
                  </p>
                ) : (
                  activeMandates.map((inv) => {
                    const pct = calculateInvestmentProgress(inv.startedAt, inv.maturesAt, inv.status);
                    return (
                      <div key={inv.id} className="space-y-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{inv.planName}</p>
                            <p className="font-tabular text-xs text-muted-foreground">
                              {inv.id} · {daysRemaining(inv.maturesAt)}d left
                            </p>
                          </div>
                          <p className="font-tabular text-sm font-semibold text-foreground">
                            {formatNaira(inv.principal)}
                          </p>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Target: {inv.targetReturnPercent}% (est.)</span>
                          <span>Matures {formatDate(inv.maturesAt)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2.5 border-t border-border pt-4">
              <Link
                to="/dashboard/investments"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                New Allocation
              </Link>
              <Link
                to="/dashboard/wallet"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border text-xs font-medium text-foreground hover:bg-secondary"
              >
                Withdraw
              </Link>
            </div>
          </div>
        </section>

        {/* Recent Ledger Table */}
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="font-display text-lg font-medium text-foreground">Recent Transactions</h2>
              <p className="text-xs text-muted-foreground">Latest wallet funding, allocations, and settlements</p>
            </div>
            <Link
              to="/dashboard/transactions"
              className="text-xs font-medium text-foreground hover:underline underline-offset-4"
            >
              View Full Ledger
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Reference</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Channel</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                  <th className="px-6 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentTxns.map((txn) => {
                  const inflow =
                    txn.type === "Deposit" ||
                    txn.type === "Realized Return" ||
                    txn.type === "Referral Commission";
                  return (
                    <tr key={txn.id} className="hover:bg-secondary/25">
                      <td className="font-tabular px-6 py-3 text-xs text-muted-foreground">
                        {txn.reference}
                      </td>
                      <td className="px-6 py-3 font-medium text-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          {inflow ? (
                            <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {txn.type}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-muted-foreground">{txn.channel}</td>
                      <td className="font-tabular px-6 py-3 text-xs text-muted-foreground">
                        {formatDate(txn.createdAt)}
                      </td>
                      <td
                        className={`font-tabular px-6 py-3 text-right font-semibold ${
                          inflow ? "text-success" : "text-foreground"
                        }`}
                      >
                        {inflow ? "+" : "-"}
                        {formatNaira(txn.amount)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <StatusText status={txn.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <RiskDisclosure title="Simulation & Risk Notice" text={APP_CONFIG.disclosures.simulationNotice} />
      </div>
    </UserDashboardLayout>
  );
}

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import {
  MetricCard,
  RiskDisclosure,
  SegmentedFilter,
  StatusText,
} from "@/components/common/Primitives";
import { APP_CONFIG } from "@/config/app";
import { useAppState } from "@/context/AppStateContext";
import type { InvestmentPlan } from "@/types/domain";
import { calculateInvestmentProgress, calculateProjectedReturn } from "@/utils/calculations";
import { daysRemaining, formatCompactNaira, formatDate, formatNaira } from "@/utils/format";

export function InvestmentsPage() {
  const { plans, userInvestments, userWallet, subscribeInvestment } = useAppState();
  const [selectedPlan, setSelectedPlan] = useState<InvestmentPlan | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [autoCompound, setAutoCompound] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "Active" | "Matured">("ALL");

  const activePlans = plans.filter((p) => p.status === "Active");
  const filteredInvestments = userInvestments.filter(
    (inv) => statusFilter === "ALL" || inv.status === statusFilter,
  );

  const openModal = (plan: InvestmentPlan) => {
    setSelectedPlan(plan);
    setAmountInput(String(plan.minAmount));
    setAutoCompound(true);
  };

  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    const res = subscribeInvestment({
      planId: selectedPlan.id,
      amount: Number(amountInput),
      autoCompound,
    });
    if (!res.ok || !res.data) {
      toast.error(res.error ?? "Unable to allocate funds.");
      return;
    }
    toast.success(`Allocated ${formatNaira(res.data.principal)} into ${res.data.planName}.`);
    setSelectedPlan(null);
  };

  const allocationChartData = activePlans.map((plan) => {
    const invested = userInvestments
      .filter((i) => i.planId === plan.id && i.status === "Active")
      .reduce((s, i) => s + i.principal, 0);
    const projected = userInvestments
      .filter((i) => i.planId === plan.id && i.status === "Active")
      .reduce((s, i) => s + i.projectedReturn, 0);
    return {
      name: plan.name.replace("Silver ", "").replace("Platinum ", "").replace("Sovereign ", "").replace("Heritage ", ""),
      principal: invested,
      projected,
    };
  });

  return (
    <UserDashboardLayout title="Investments & Mandates" breadcrumb="Investments">
      <div className="space-y-6">
        {/* Portfolio Summary */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Active Invested Principal"
            value={formatNaira(userWallet.activeInvestments)}
            detail={`${userInvestments.filter((i) => i.status === "Active").length} open positions`}
          />
          <MetricCard
            label="Available to Allocate"
            value={formatNaira(userWallet.availableBalance)}
            detail="Unallocated Naira balance"
          />
          <MetricCard
            label="Realized Earnings"
            value={formatNaira(userWallet.realizedEarnings)}
            detail="Settled maturity returns"
            deltaTone="positive"
          />
          <MetricCard
            label="Accrued (Illustrative)"
            value={formatNaira(userWallet.projectedAccrual)}
            detail="Non-guaranteed accrual estimate"
          />
        </section>

        {/* Portfolio Allocation Chart */}
        <section className="surface-card p-6">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-xl font-medium text-foreground">
                Allocation by Mandate
              </h2>
              <p className="text-xs text-muted-foreground">
                Active principal compared against illustrative target returns across open Naira mandates
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-chart-1" />
                Active Principal
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-chart-3" />
                Illustrative Target Return
              </span>
            </div>
          </div>

          <div className="mt-5 h-[230px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={allocationChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="name"
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
                <Bar dataKey="principal" name="Active Principal" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="projected" name="Target Return (Est.)" fill="var(--color-chart-3)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Available Investment Plan Cards */}
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-2xl font-medium text-foreground">
              Open Naira Investment Plans
            </h2>
            <p className="text-xs text-muted-foreground">
              Select a plan to allocate capital from your available Naira wallet. All target returns are illustrative and not guaranteed.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {activePlans.map((plan) => (
              <div key={plan.id} className="surface-card flex flex-col justify-between p-6">
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-tabular">{plan.code}</span>
                    <span>
                      {plan.durationDays} Days · <StatusText status={`${plan.riskBand} Risk`} />
                    </span>
                  </div>
                  <h3 className="font-display mt-2.5 text-xl font-medium text-foreground">
                    {plan.name}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {plan.description}
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-3 border-y border-border py-3.5 text-xs">
                    <div>
                      <p className="text-muted-foreground">Target Return*</p>
                      <p className="font-tabular mt-0.5 text-lg font-semibold text-foreground">
                        {plan.targetReturnPercent}%
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Minimum</p>
                      <p className="font-tabular mt-0.5 text-sm font-semibold text-foreground">
                        {formatNaira(plan.minAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Maximum</p>
                      <p className="font-tabular mt-0.5 text-sm font-semibold text-foreground">
                        {formatNaira(plan.maxAmount)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    {plan.riskNote}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openModal(plan)}
                  className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Allocate to {plan.name}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Investment History Table */}
        <section className="surface-card overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-lg font-medium text-foreground">
                Investment History
              </h2>
              <p className="text-xs text-muted-foreground">
                Active and matured Naira portfolio allocations
              </p>
            </div>
            <SegmentedFilter
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: "All", value: "ALL" },
                { label: "Active", value: "Active" },
                { label: "Matured", value: "Matured" },
              ]}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Mandate</th>
                  <th className="px-6 py-3 text-right font-medium">Principal</th>
                  <th className="px-6 py-3 text-right font-medium">Target Return*</th>
                  <th className="px-6 py-3 font-medium">Progress</th>
                  <th className="px-6 py-3 font-medium">Maturity</th>
                  <th className="px-6 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvestments.map((inv) => {
                  const pct = calculateInvestmentProgress(inv.startedAt, inv.maturesAt, inv.status);
                  return (
                    <tr key={inv.id} className="hover:bg-secondary/25">
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-foreground">{inv.planName}</p>
                        <p className="font-tabular text-xs text-muted-foreground">
                          {inv.id} · {inv.riskBand} risk · {inv.durationDays}d
                        </p>
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right font-semibold text-foreground">
                        {formatNaira(inv.principal)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right text-xs">
                        <p className="font-semibold text-success">
                          +{formatNaira(inv.projectedReturn)}
                        </p>
                        <p className="text-muted-foreground">{inv.targetReturnPercent}% est.</p>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="w-28">
                          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="font-tabular mt-1 text-[11px] text-muted-foreground">
                            {inv.status === "Active"
                              ? `${pct}% · ${daysRemaining(inv.maturesAt)}d left`
                              : "100% completed"}
                          </p>
                        </div>
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                        {formatDate(inv.maturesAt)}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <StatusText status={inv.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <RiskDisclosure text={APP_CONFIG.disclosures.investmentRisk} />
      </div>

      {/* Allocation Modal */}
      {selectedPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="alloc-modal-title"
        >
          <div className="surface-card w-full max-w-lg p-6 shadow-elevated">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="text-xs text-muted-foreground">Simulated Mandate Subscription</p>
                <h3 id="alloc-modal-title" className="font-display mt-1 text-2xl font-medium text-foreground">
                  {selectedPlan.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubscribe} className="mt-5 space-y-4">
              <div>
                <div className="flex justify-between text-xs">
                  <label htmlFor="alloc-amt" className="font-medium text-foreground">
                    Principal Amount (₦)
                  </label>
                  <span className="font-tabular text-muted-foreground">
                    Available: {formatNaira(userWallet.availableBalance)}
                  </span>
                </div>
                <input
                  id="alloc-amt"
                  type="number"
                  min={selectedPlan.minAmount}
                  max={selectedPlan.maxAmount}
                  step={10000}
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="font-tabular mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3.5 text-base font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="font-tabular mt-1 text-[11px] text-muted-foreground">
                  Range: {formatNaira(selectedPlan.minAmount)} – {formatNaira(selectedPlan.maxAmount)}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-secondary/40 p-4 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lock-in Tenor</span>
                  <span className="font-tabular font-medium text-foreground">
                    {selectedPlan.durationDays} days
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Illustrative Target Return</span>
                  <span className="font-tabular font-semibold text-success">
                    +{formatNaira(calculateProjectedReturn(Number(amountInput) || 0, selectedPlan.targetReturnPercent))}{" "}
                    ({selectedPlan.targetReturnPercent}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Risk Classification</span>
                  <StatusText status={selectedPlan.riskBand} />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoCompound}
                  onChange={(e) => setAutoCompound(e.target.checked)}
                  className="rounded border-input accent-primary"
                />
                Enable automatic re-allocation preference at maturity
              </label>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {selectedPlan.riskNote}
              </p>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedPlan(null)}
                  className="h-10 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-10 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Confirm Allocation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </UserDashboardLayout>
  );
}

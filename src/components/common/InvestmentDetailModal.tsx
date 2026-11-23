import { Download } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { RiskDisclosure, StatusText } from "@/components/common/Primitives";
import type { InvestmentPlan, InvestmentRecord } from "@/types/domain";
import { buildInvestmentPayoutSchedule, calculateInvestmentProgress } from "@/utils/calculations";
import { daysRemaining, formatDate, formatNaira } from "@/utils/format";

export function InvestmentDetailModal({
  investment,
  plan,
  onClose,
  onToggleAutoCompound,
}: {
  investment: InvestmentRecord | null;
  plan?: InvestmentPlan;
  onClose: () => void;
  onToggleAutoCompound?: (investmentId: string) => void;
}) {
  if (!investment) return null;

  const progress = calculateInvestmentProgress(
    investment.startedAt,
    investment.maturesAt,
    investment.status,
  );
  const schedule = buildInvestmentPayoutSchedule(investment, plan);
  const isMatured = investment.status === "Matured";

  const downloadStatement = () => {
    const lines = [
      "SILVER SPOON — SIMULATED INVESTMENT MANDATE STATEMENT",
      "========================================================",
      `Allocation ID:          ${investment.id}`,
      `Investor:               ${investment.userName}`,
      `Mandate:                ${investment.planName} (${plan?.code ?? "N/A"})`,
      `Status:                 ${investment.status}`,
      `Risk Band:              ${investment.riskBand}`,
      `Tenor:                  ${investment.durationDays} days`,
      `Start Date:             ${formatDate(investment.startedAt)}`,
      `Maturity Date:          ${formatDate(investment.maturesAt)}`,
      `Allocated Principal:    ${formatNaira(investment.principal, true)}`,
      `Target Rate (Est.):     ${investment.targetReturnPercent}% (non-guaranteed)`,
      `Illustrative Projected: ${formatNaira(investment.projectedReturn, true)}`,
      isMatured
        ? `Realized Earnings Paid: ${formatNaira(investment.accruedReturn, true)}`
        : `Estimated Accrued:      ${formatNaira(investment.accruedReturn, true)} (unrealized)`,
      `Auto-Compound Pref.:    ${investment.autoCompound ? "Enabled" : "Disabled"}`,
      "",
      "PAYOUT SCHEDULE",
      ...schedule.map(
        (s) =>
          `  #${s.installment} | ${formatDate(s.scheduledDate)} | ${s.label} | Est. Return: ${formatNaira(s.projectedAmount)} | Principal: ${formatNaira(s.principalComponent)} | ${s.status}`,
      ),
      "========================================================",
      "Disclosure: Projected returns are illustrative simulations only and are not guaranteed profits.",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `statement-${investment.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded statement for ${investment.id}.`);
  };

  return (
    <Modal
      open={Boolean(investment)}
      onClose={onClose}
      title={investment.planName}
      subtitle={`Investment Mandate Statement · ${investment.id}`}
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Summary Grid separating Principal, Simulated Projection, and Realized Earnings */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <p className="text-[11px] text-muted-foreground">Allocated Principal</p>
            <p className="font-tabular mt-1 text-lg font-semibold text-foreground">
              {formatNaira(investment.principal)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {investment.durationDays}-day tenor
            </p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <p className="text-[11px] text-muted-foreground">Simulated Target Return*</p>
            <p className="font-tabular mt-1 text-lg font-semibold text-foreground">
              +{formatNaira(investment.projectedReturn)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {investment.targetReturnPercent}% illustrative (not guaranteed)
            </p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <p className="text-[11px] text-muted-foreground">
              {isMatured ? "Actual Realized Earnings" : "Estimated Accrued (Unrealized)"}
            </p>
            <p
              className={`font-tabular mt-1 text-lg font-semibold ${
                isMatured ? "text-success" : "text-foreground"
              }`}
            >
              {isMatured
                ? `+${formatNaira(investment.accruedReturn)}`
                : formatNaira(investment.accruedReturn)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {isMatured ? "Settled to wallet ledger" : "Not yet realized or withdrawable"}
            </p>
          </div>
        </div>

        {/* Cycle Progress & Key Metadata */}
        <div className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <StatusText status={investment.status} showIcon />
              <span aria-hidden="true" className="text-border">·</span>
              <span className="text-muted-foreground">{investment.riskBand} Risk Band</span>
              {plan && (
                <>
                  <span aria-hidden="true" className="text-border">·</span>
                  <span className="text-muted-foreground">{plan.payoutFrequency}</span>
                </>
              )}
            </div>
            <span className="font-tabular text-muted-foreground">
              {investment.status === "Active"
                ? `${progress}% elapsed · ${daysRemaining(investment.maturesAt)} days to maturity`
                : `Matured on ${formatDate(investment.maturesAt)}`}
            </span>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>

          <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Subscription Date</dt>
              <dd className="font-tabular mt-0.5 font-medium text-foreground">
                {formatDate(investment.startedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Scheduled Maturity</dt>
              <dd className="font-tabular mt-0.5 font-medium text-foreground">
                {formatDate(investment.maturesAt)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Management Fee</dt>
              <dd className="font-tabular mt-0.5 font-medium text-foreground">
                {plan ? `${plan.managementFeePercent}% p.a.` : "Per mandate memo"}
              </dd>
            </div>
          </dl>
        </div>

        {/* Auto-Compound Preference Toggle (for Active Investments) */}
        {onToggleAutoCompound && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3.5">
            <div>
              <p className="text-xs font-semibold text-foreground">
                Auto-Compound at Maturity
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {investment.status === "Active"
                  ? "Automatically roll principal and realized earnings into a new cycle upon maturity."
                  : "Preference is locked because this mandate has already settled."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              disabled={investment.status !== "Active"}
              aria-checked={investment.autoCompound}
              aria-label="Toggle auto-compound preference"
              onClick={() => onToggleAutoCompound(investment.id)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                investment.autoCompound ? "bg-primary" : "border border-border bg-secondary"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-card shadow-subtle transition-transform ${
                  investment.autoCompound ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        )}

        {/* Payout Schedule */}
        <div>
          <h4 className="text-xs font-semibold text-foreground">
            Illustrative Payout Schedule
          </h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Projected cashflows are estimates based on target mandate parameters and are not guaranteed.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-secondary/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Event</th>
                  <th className="px-4 py-2.5 font-medium">Scheduled Date</th>
                  <th className="px-4 py-2.5 text-right font-medium">Principal</th>
                  <th className="px-4 py-2.5 text-right font-medium">Est. Return*</th>
                  <th className="px-4 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {schedule.map((row) => (
                  <tr key={row.installment}>
                    <td className="px-4 py-2.5 font-medium text-foreground">{row.label}</td>
                    <td className="font-tabular px-4 py-2.5 text-muted-foreground">
                      {formatDate(row.scheduledDate)}
                    </td>
                    <td className="font-tabular px-4 py-2.5 text-right text-foreground">
                      {row.principalComponent > 0 ? formatNaira(row.principalComponent) : "—"}
                    </td>
                    <td className="font-tabular px-4 py-2.5 text-right font-medium text-success">
                      +{formatNaira(row.projectedAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <StatusText status={row.status === "Settled" ? "Completed" : "Pending"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <RiskDisclosure
          title="Simulated Return Disclosure"
          text={
            plan?.riskNote ??
            "All projected returns and accrued estimates displayed on SILVER SPOON are illustrative simulations and do not constitute guaranteed profits. Realized earnings are credited only upon actual maturity settlement."
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={downloadStatement}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-xs font-medium text-foreground whitespace-nowrap hover:bg-secondary"
          >
            <Download className="h-3.5 w-3.5" />
            Download Statement
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Close Statement
          </button>
        </div>
      </div>
    </Modal>
  );
}

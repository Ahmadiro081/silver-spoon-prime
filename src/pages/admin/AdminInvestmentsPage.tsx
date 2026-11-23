import { useState } from "react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { MetricCard, SegmentedFilter, StatusText } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import type { InvestmentStatus } from "@/types/domain";
import { formatDate, formatNaira } from "@/utils/format";

export function AdminInvestmentsPage() {
  const { investments, adminMatureInvestment } = useAppState();
  const [filter, setFilter] = useState<"ALL" | InvestmentStatus>("ALL");

  const filtered = investments.filter((i) => filter === "ALL" || i.status === filter);
  const activeTotal = investments
    .filter((i) => i.status === "Active")
    .reduce((s, i) => s + i.principal, 0);
  const maturedTotal = investments
    .filter((i) => i.status === "Matured")
    .reduce((s, i) => s + i.principal, 0);

  const handleMature = (id: string, planName: string) => {
    const res = adminMatureInvestment(id);
    if (!res.ok) {
      toast.error(res.error ?? "Unable to settle investment.");
      return;
    }
    toast.success(
      `Settled ${planName} (${id}). Realized return of ${formatNaira(res.data?.realizedReturn ?? 0)} credited.`,
    );
  };

  return (
    <AdminDashboardLayout title="Investment Management" breadcrumb="Investments">
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Active Allocated Capital" value={formatNaira(activeTotal)} />
          <MetricCard label="Matured Principal History" value={formatNaira(maturedTotal)} />
          <MetricCard
            label="Total Mandate Records"
            value={String(investments.length)}
            detail={`${investments.filter((i) => i.status === "Active").length} active`}
          />
        </section>

        <SegmentedFilter
          value={filter}
          onChange={setFilter}
          options={[
            { label: "All Mandates", value: "ALL" },
            { label: "Active", value: "Active" },
            { label: "Matured", value: "Matured" },
          ]}
        />

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Allocation ID</th>
                  <th className="px-6 py-3 font-medium">Investor</th>
                  <th className="px-6 py-3 font-medium">Plan</th>
                  <th className="px-6 py-3 text-right font-medium">Principal</th>
                  <th className="px-6 py-3 text-right font-medium">Projected Return</th>
                  <th className="px-6 py-3 font-medium">Maturity</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Operation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-secondary/25">
                    <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">{inv.id}</td>
                    <td className="px-6 py-3.5 font-medium text-foreground">{inv.userName}</td>
                    <td className="px-6 py-3.5 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">{inv.planName}</p>
                      <p>{inv.targetReturnPercent}% · {inv.riskBand} risk</p>
                    </td>
                    <td className="font-tabular px-6 py-3.5 text-right font-semibold text-foreground">
                      {formatNaira(inv.principal)}
                    </td>
                    <td className="font-tabular px-6 py-3.5 text-right text-success">
                      +{formatNaira(inv.projectedReturn)}
                    </td>
                    <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                      {formatDate(inv.maturesAt)}
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusText status={inv.status} />
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {inv.status === "Active" ? (
                        <button
                          type="button"
                          onClick={() => handleMature(inv.id, inv.planName)}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Settle Maturity
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Settled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminDashboardLayout>
  );
}

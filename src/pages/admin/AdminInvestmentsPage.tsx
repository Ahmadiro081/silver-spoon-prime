import { useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { Modal } from "@/components/common/Modal";
import {
  MetricCard,
  SegmentedFilter,
  StatusText,
  TableEmptyRow,
} from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import type { InvestmentRecord, InvestmentStatus } from "@/types/domain";
import { formatDate, formatNaira } from "@/utils/format";

export function AdminInvestmentsPage() {
  const { investments, adminMatureInvestment } = useAppState();
  const [filter, setFilter] = useState<"ALL" | InvestmentStatus>("ALL");
  const [query, setQuery] = useState("");
  const [maturingInv, setMaturingInv] = useState<InvestmentRecord | null>(null);

  const filtered = investments.filter((i) => {
    const matchesStatus = filter === "ALL" || i.status === filter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      i.id.toLowerCase().includes(q) ||
      i.userName.toLowerCase().includes(q) ||
      i.planName.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const activeTotal = investments
    .filter((i) => i.status === "Active")
    .reduce((s, i) => s + i.principal, 0);
  const maturedTotal = investments
    .filter((i) => i.status === "Matured")
    .reduce((s, i) => s + i.principal, 0);

  const confirmMature = () => {
    if (!maturingInv) return;
    const res = adminMatureInvestment(maturingInv.id);
    if (!res.ok) {
      toast.error(res.error ?? "Unable to settle investment.");
      return;
    }
    toast.success(
      `Settled ${maturingInv.planName} (${maturingInv.id}). Realized return of ${formatNaira(res.data?.realizedReturn ?? 0)} credited.`,
    );
    setMaturingInv(null);
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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search allocation ID, investor, or plan..."
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <SegmentedFilter
            value={filter}
            onChange={setFilter}
            options={[
              { label: "All Mandates", value: "ALL" },
              { label: "Active", value: "Active" },
              { label: "Matured", value: "Matured" },
            ]}
          />
        </div>

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
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={8}
                    title="No investment allocations match your filters"
                    description="Clear your search query or change the mandate status filter."
                  />
                ) : (
                  filtered.map((inv) => (
                    <tr key={inv.id} className="hover:bg-secondary/25">
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">{inv.id}</td>
                      <td className="px-6 py-3.5 font-medium text-foreground">{inv.userName}</td>
                      <td className="px-6 py-3.5 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">{inv.planName}</p>
                        <p>{inv.targetReturnPercent}% · {inv.riskBand} risk</p>
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right font-semibold text-foreground whitespace-nowrap">
                        {formatNaira(inv.principal)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right text-success whitespace-nowrap">
                        +{formatNaira(inv.projectedReturn)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(inv.maturesAt)}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <StatusText status={inv.status} />
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        {inv.status === "Active" ? (
                          <button
                            type="button"
                            onClick={() => setMaturingInv(inv)}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            Settle Maturity
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Settled</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Maturity Settlement Confirmation Modal */}
      <Modal
        open={Boolean(maturingInv)}
        onClose={() => setMaturingInv(null)}
        title="Confirm Mandate Maturity Settlement"
        subtitle={maturingInv ? `Allocation ID: ${maturingInv.id}` : undefined}
        maxWidthClass="max-w-md"
      >
        {maturingInv && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/35 p-4 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Investor</span>
                <span className="font-medium text-foreground">{maturingInv.userName}</span>
              </div>
              <div className="mt-2 flex justify-between gap-2">
                <span className="text-muted-foreground">Mandate Plan</span>
                <span className="font-medium text-foreground">{maturingInv.planName}</span>
              </div>
              <div className="mt-2 flex justify-between gap-2">
                <span className="text-muted-foreground">Principal Released</span>
                <span className="font-tabular font-semibold text-foreground">
                  {formatNaira(maturingInv.principal)}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-2 border-t border-border pt-2">
                <span className="text-muted-foreground">Simulated Realized Return</span>
                <span className="font-tabular font-semibold text-success">
                  +{formatNaira(maturingInv.projectedReturn)}
                </span>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Settling this mandate releases the principal back into the investor&apos;s Available
              Balance, logs a completed Realized Return ledger entry, and notifies the client.
            </p>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setMaturingInv(null)}
                className="h-9 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmMature}
                className="h-9 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Confirm Settlement
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AdminDashboardLayout>
  );
}

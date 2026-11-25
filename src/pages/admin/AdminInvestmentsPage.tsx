import { useState } from "react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { Modal } from "@/components/common/Modal";
import {
  MetricCard,
  SearchInput,
  SegmentedFilter,
  StatusText,
  TableEmptyRow,
} from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import { evaluateAutoCompoundRollover } from "@/services/platformService";
import type { InvestmentRecord, InvestmentStatus } from "@/types/domain";
import { formatDate, formatNaira } from "@/utils/format";

export function AdminInvestmentsPage() {
  const { investments, plans, users, adminMatureInvestment } = useAppState();
  const [filter, setFilter] = useState<"ALL" | InvestmentStatus>("ALL");
  const [query, setQuery] = useState("");
  const [maturingInv, setMaturingInv] = useState<InvestmentRecord | null>(null);
  const [settling, setSettling] = useState(false);

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

  const maturingPreview = maturingInv
    ? evaluateAutoCompoundRollover(
        maturingInv,
        plans.find((p) => p.id === maturingInv.planId),
        users.find((u) => u.id === maturingInv.userId),
        maturingInv.projectedReturn,
      )
    : null;

  const confirmMature = async () => {
    if (!maturingInv || settling) return;
    setSettling(true);
    try {
      const res = await adminMatureInvestment(maturingInv.id);
      if (!res.ok) {
        toast.error(res.error ?? "Unable to settle investment.");
        return;
      }
      if (res.data?.rolledOverInvestmentId) {
        toast.success(
          `Settled ${maturingInv.id} (+${formatNaira(res.data.realizedReturn)}) and auto-compounded ${formatNaira(res.data.rolloverPrincipal ?? 0)} into ${res.data.rolledOverInvestmentId}.`,
        );
      } else if (maturingInv.autoCompound && res.data?.rolloverSkippedReason) {
        toast.success(
          `Settled ${maturingInv.id} (+${formatNaira(res.data.realizedReturn)}) to Available Balance. Auto-compound skipped: ${res.data.rolloverSkippedReason}`,
        );
      } else {
        toast.success(
          `Settled ${maturingInv.planName} (${maturingInv.id}). Realized return of ${formatNaira(res.data?.realizedReturn ?? 0)} credited.`,
        );
      }
      setMaturingInv(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to settle investment.");
    } finally {
      setSettling(false);
    }
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
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search allocation ID, investor, or plan..."
            ariaLabel="Search allocations by ID, investor, or plan"
            className="w-full max-w-sm"
          />
          <SegmentedFilter
            ariaLabel="Filter investment mandates by status"
            value={filter}
            onChange={setFilter}
            options={[
              { label: "All Mandates", value: "ALL" },
              { label: "Active", value: "Active" },
              { label: "Matured", value: "Matured" },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p aria-live="polite" className="font-tabular">
            Showing {filtered.length} of {investments.length} investment mandates
          </p>
          {(query.trim() || filter !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("ALL");
              }}
              className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-6 py-3 font-medium">Allocation ID</th>
                  <th scope="col" className="px-6 py-3 font-medium">Investor</th>
                  <th scope="col" className="px-6 py-3 font-medium">Plan</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Principal</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Projected Return</th>
                  <th scope="col" className="px-6 py-3 font-medium">Maturity</th>
                  <th scope="col" className="px-6 py-3 font-medium">Status</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Operation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={8}
                    title="No investment allocations match your filters"
                    description="Clear your search query or change the mandate status filter."
                    action={
                      (query.trim() || filter !== "ALL") ? (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setFilter("ALL");
                          }}
                          className="h-9 rounded-lg border border-border bg-card px-4 text-xs font-medium text-foreground hover:bg-secondary"
                        >
                          Clear Filters
                        </button>
                      ) : undefined
                    }
                  />
                ) : (
                  filtered.map((inv) => (
                    <tr key={inv.id} className="hover:bg-secondary/25">
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">{inv.id}</td>
                      <td className="px-6 py-3.5 font-medium text-foreground">{inv.userName}</td>
                      <td className="px-6 py-3.5 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">{inv.planName}</p>
                        <p>
                          {inv.targetReturnPercent}% · {inv.riskBand} risk ·{" "}
                          {inv.rolledOverToInvestmentId
                            ? `Rolled → ${inv.rolledOverToInvestmentId}`
                            : inv.autoCompound
                              ? "Auto-Compound On"
                              : "Settle to Cash"}
                        </p>
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
                            aria-label={`Settle maturity for ${inv.id} (${inv.userName})`}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            Settle Maturity
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {inv.rolledOverToInvestmentId ? "Rolled Over" : "Settled"}
                          </span>
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
              <div className="mt-2 flex justify-between gap-2">
                <span className="text-muted-foreground">Auto-Compound Preference</span>
                <span className="font-medium text-foreground">
                  {maturingInv.autoCompound ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>

            {maturingInv.autoCompound && maturingPreview?.eligible ? (
              <div className="rounded-lg border border-border bg-secondary/30 px-3.5 py-2.5 text-xs leading-relaxed text-foreground">
                <span className="font-semibold">Automatic Rollover Preview:</span> Principal +
                realized return (
                <span className="font-tabular font-semibold">
                  {formatNaira(maturingPreview.rolloverPrincipal)}
                </span>
                ) will automatically roll over into a new active cycle of {maturingInv.planName},
                keeping Available Balance unchanged and logging both the Realized Return and new
                Investment entries.
              </div>
            ) : maturingInv.autoCompound && maturingPreview?.reason ? (
              <div className="rounded-lg border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-xs leading-relaxed text-foreground">
                <span className="font-semibold">Rollover Ineligible:</span>{" "}
                {maturingPreview.reason} Full principal and realized return will credit to Available
                Balance instead.
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Settling this mandate releases the principal back into the investor&apos;s Available
                Balance, logs a completed Realized Return ledger entry, and notifies the client.
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                disabled={settling}
                onClick={() => setMaturingInv(null)}
                className="h-10 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={settling}
                onClick={confirmMature}
                className="h-10 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {settling ? "Settling..." : "Confirm Settlement"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AdminDashboardLayout>
  );
}

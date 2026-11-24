import { useState } from "react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { ConfirmDialog } from "@/components/common/Modal";
import {
  MetricCard,
  SearchInput,
  SegmentedFilter,
  StatusText,
  TableEmptyRow,
} from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import type { ReferralRecord } from "@/types/domain";
import { formatDate, formatNaira } from "@/utils/format";

export function AdminReferralsPage() {
  const { referrals, settings, adminMarkReferralPaid } = useAppState();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ReferralRecord["status"]>("ALL");
  const [settleTarget, setSettleTarget] = useState<ReferralRecord | null>(null);

  const hasFilters = Boolean(query.trim()) || statusFilter !== "ALL";

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("ALL");
  };

  const filtered = referrals.filter((ref) => {
    const matchesStatus = statusFilter === "ALL" || ref.status === statusFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      ref.id.toLowerCase().includes(q) ||
      ref.referrerName.toLowerCase().includes(q) ||
      ref.referredUserName.toLowerCase().includes(q) ||
      ref.referredUserEmail.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const totalPaid = referrals
    .filter((r) => r.status === "Paid")
    .reduce((s, r) => s + r.commissionEarned, 0);
  const totalVolume = referrals.reduce((s, r) => s + r.qualifyingInvestment, 0);

  const settleCommission = (id: string, name: string) => {
    const res = adminMarkReferralPaid(id);
    if (res.ok) {
      toast.success(`Settled referral commission for ${name}.`);
    } else {
      toast.error(res.error ?? "Unable to settle referral commission.");
    }
  };

  return (
    <AdminDashboardLayout title="Referral Management" breadcrumb="Referrals">
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total Referral Records" value={String(referrals.length)} />
          <MetricCard label="Qualifying Volume" value={formatNaira(totalVolume)} />
          <MetricCard label="Commissions Settled" value={formatNaira(totalPaid)} deltaTone="positive" />
          <MetricCard
            label="Platform Rate"
            value={`${settings.referralCommissionPercent.toFixed(1)}%`}
            detail="Configurable in Platform Settings"
          />
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search referrer, invitee, email, or ID..."
            ariaLabel="Search referrals by referrer, invitee, email, or ID"
            className="w-full max-w-sm"
          />
          <SegmentedFilter
            ariaLabel="Filter referrals by status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: "All", value: "ALL" },
              { label: "Paid", value: "Paid" },
              { label: "Active", value: "Active" },
              { label: "Pending", value: "Pending" },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p aria-live="polite" className="font-tabular">
            Showing {filtered.length} of {referrals.length} referral records
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="surface-card overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display text-lg font-medium text-foreground">
              Referral Commission Ledger
            </h2>
            <p className="text-xs text-muted-foreground">
              Pending referrals auto-qualify on first qualifying investment; manual settlement is also available below.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-6 py-3 font-medium">ID</th>
                  <th scope="col" className="px-6 py-3 font-medium">Referrer</th>
                  <th scope="col" className="px-6 py-3 font-medium">Invited Client</th>
                  <th scope="col" className="px-6 py-3 font-medium">Joined</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Qualifying Allocation</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Commission</th>
                  <th scope="col" className="px-6 py-3 font-medium">Status</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={8}
                    title="No referral records match your filters"
                    description="Clear your search keyword or status filter to view all referral invitations."
                    action={
                      hasFilters ? (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="h-9 rounded-lg border border-border bg-card px-4 text-xs font-medium text-foreground hover:bg-secondary"
                        >
                          Clear Filters
                        </button>
                      ) : undefined
                    }
                  />
                ) : (
                  filtered.map((ref) => (
                    <tr key={ref.id} className="hover:bg-secondary/25">
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">{ref.id}</td>
                      <td className="px-6 py-3.5 font-medium text-foreground">{ref.referrerName}</td>
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-foreground">{ref.referredUserName}</p>
                        <p className="text-xs text-muted-foreground">{ref.referredUserEmail}</p>
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(ref.joinedAt)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right text-foreground whitespace-nowrap">
                        {formatNaira(ref.qualifyingInvestment)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right font-semibold text-success whitespace-nowrap">
                        {formatNaira(ref.commissionEarned)}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <StatusText status={ref.status} />
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        {ref.status !== "Paid" ? (
                          <button
                            type="button"
                            onClick={() => setSettleTarget(ref)}
                            aria-label={`Mark referral ${ref.id} paid for ${ref.referrerName}`}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            Mark Paid
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

      <ConfirmDialog
        open={Boolean(settleTarget)}
        onClose={() => setSettleTarget(null)}
        onConfirm={() => {
          if (!settleTarget) return;
          settleCommission(settleTarget.id, settleTarget.referrerName);
          setSettleTarget(null);
        }}
        title="Settle Referral Commission?"
        subtitle={
          settleTarget
            ? `${settleTarget.id} · ${settleTarget.referrerName} (Invited ${settleTarget.referredUserName})`
            : undefined
        }
        description={
          settleTarget
            ? `This credits ${formatNaira(settleTarget.commissionEarned)} to ${settleTarget.referrerName}'s Available Balance, records a Referral Commission ledger entry, and marks the referral as Paid.`
            : ""
        }
        confirmLabel="Confirm & Credit Commission"
      />
    </AdminDashboardLayout>
  );
}

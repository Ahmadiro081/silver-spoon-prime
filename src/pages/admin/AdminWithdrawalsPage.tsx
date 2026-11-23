import { useState } from "react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { MetricCard, SegmentedFilter, StatusText } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import type { TransactionStatus } from "@/types/domain";
import { formatDateTime, formatNaira } from "@/utils/format";

export function AdminWithdrawalsPage() {
  const { transactions, adminReviewTransaction } = useAppState();
  const [filter, setFilter] = useState<"ALL" | TransactionStatus>("ALL");

  const withdrawals = transactions.filter((t) => t.type === "Withdrawal");
  const filtered = withdrawals.filter((t) => filter === "ALL" || t.status === filter);

  const pendingVal = withdrawals
    .filter((w) => w.status === "Pending")
    .reduce((s, w) => s + w.amount, 0);
  const settledVal = withdrawals
    .filter((w) => w.status === "Completed")
    .reduce((s, w) => s + w.amount, 0);

  const review = (id: string, status: TransactionStatus) => {
    const res = adminReviewTransaction(
      id,
      status,
      status === "Completed" ? "Simulated NIP payout disbursed by treasury" : "Declined by compliance desk",
    );
    if (res.ok) toast.success(`Withdrawal marked ${status}.`);
  };

  return (
    <AdminDashboardLayout title="Withdrawal Records" breadcrumb="Withdrawals">
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Pending Payout Queue" value={formatNaira(pendingVal)} />
          <MetricCard label="Settled Withdrawals" value={formatNaira(settledVal)} />
          <MetricCard label="Total Requests" value={String(withdrawals.length)} />
        </section>

        <SegmentedFilter
          value={filter}
          onChange={setFilter}
          options={[
            { label: "All", value: "ALL" },
            { label: "Pending", value: "Pending" },
            { label: "Completed", value: "Completed" },
            { label: "Declined", value: "Declined" },
          ]}
        />

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Reference</th>
                  <th className="px-6 py-3 font-medium">Client</th>
                  <th className="px-6 py-3 font-medium">Destination Bank</th>
                  <th className="px-6 py-3 font-medium">Requested</th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Payout Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((txn) => (
                  <tr key={txn.id} className="hover:bg-secondary/25">
                    <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                      {txn.reference}
                    </td>
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-foreground">{txn.userName}</p>
                      <p className="text-xs text-muted-foreground">{txn.userEmail}</p>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-muted-foreground">{txn.channel}</td>
                    <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                      {formatDateTime(txn.createdAt)}
                    </td>
                    <td className="font-tabular px-6 py-3.5 text-right font-semibold text-foreground">
                      {formatNaira(txn.amount)}
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusText status={txn.status} />
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {txn.status === "Pending" ? (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => review(txn.id, "Completed")}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            Approve Payout
                          </button>
                          <button
                            type="button"
                            onClick={() => review(txn.id, "Declined")}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {txn.reviewedBy ?? "Processed"}
                        </span>
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

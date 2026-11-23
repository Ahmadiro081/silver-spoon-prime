import { useState, type FormEvent } from "react";
import { Receipt, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { Modal } from "@/components/common/Modal";
import {
  MetricCard,
  SegmentedFilter,
  StatusText,
  TableEmptyRow,
} from "@/components/common/Primitives";
import { TransactionReceiptModal } from "@/components/common/TransactionReceiptModal";
import { useAppState } from "@/context/AppStateContext";
import type { TransactionRecord, TransactionStatus } from "@/types/domain";
import { formatDateTime, formatNaira } from "@/utils/format";

interface DepositReviewDraft {
  txn: TransactionRecord;
  decision: "Completed" | "Declined";
}

export function AdminDepositsPage() {
  const { transactions, adminReviewTransaction } = useAppState();
  const [filter, setFilter] = useState<"ALL" | TransactionStatus>("ALL");
  const [query, setQuery] = useState("");
  const [reviewDraft, setReviewDraft] = useState<DepositReviewDraft | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [receiptTxn, setReceiptTxn] = useState<TransactionRecord | null>(null);

  const deposits = transactions.filter((t) => t.type === "Deposit");
  const filtered = deposits.filter((t) => {
    const matchesStatus = filter === "ALL" || t.status === filter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      t.reference.toLowerCase().includes(q) ||
      t.userName.toLowerCase().includes(q) ||
      t.userEmail.toLowerCase().includes(q) ||
      t.channel.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const pendingVal = deposits
    .filter((d) => d.status === "Pending")
    .reduce((s, d) => s + d.amount, 0);
  const completedVal = deposits
    .filter((d) => d.status === "Completed")
    .reduce((s, d) => s + d.amount, 0);

  const openReviewModal = (txn: TransactionRecord, decision: "Completed" | "Declined") => {
    setReviewDraft({ txn, decision });
    setReviewNote(
      decision === "Completed"
        ? "Reconciled against settlement ledger and confirmed by treasury admin."
        : "",
    );
  };

  const handleConfirmReview = (e: FormEvent) => {
    e.preventDefault();
    if (!reviewDraft) return;
    if (reviewDraft.decision === "Declined" && !reviewNote.trim()) {
      toast.error("Please enter a rejection reason for the client and audit log.");
      return;
    }

    const res = adminReviewTransaction(
      reviewDraft.txn.id,
      reviewDraft.decision,
      reviewNote.trim() ||
        (reviewDraft.decision === "Completed"
          ? "Confirmed by treasury admin."
          : "Declined by treasury admin."),
    );
    if (!res.ok) {
      toast.error(res.error ?? "Unable to review deposit.");
      return;
    }
    toast.success(
      `Deposit ${reviewDraft.txn.reference} marked ${reviewDraft.decision}.`,
    );
    setReviewDraft(null);
    setReviewNote("");
  };

  return (
    <AdminDashboardLayout title="Deposit Records" breadcrumb="Deposits">
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Confirmed Deposits" value={formatNaira(completedVal)} />
          <MetricCard label="Pending Reconciliation" value={formatNaira(pendingVal)} />
          <MetricCard label="Total Deposit Entries" value={String(deposits.length)} />
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reference, investor, or channel..."
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
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
        </div>

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Reference</th>
                  <th className="px-6 py-3 font-medium">Client</th>
                  <th className="px-6 py-3 font-medium">Channel</th>
                  <th className="px-6 py-3 font-medium">Timestamp</th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Treasury Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={7}
                    title="No deposit records found"
                    description="Adjust the status filter or search query to inspect Naira deposit entries."
                  />
                ) : (
                  filtered.map((txn) => (
                    <tr
                      key={txn.id}
                      onClick={() => setReceiptTxn(txn)}
                      className="cursor-pointer hover:bg-secondary/25"
                    >
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                        {txn.reference}
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-foreground">{txn.userName}</p>
                        <p className="text-xs text-muted-foreground">{txn.userEmail}</p>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-muted-foreground">{txn.channel}</td>
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(txn.createdAt)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right font-semibold text-foreground whitespace-nowrap">
                        {formatNaira(txn.amount)}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <StatusText status={txn.status} />
                      </td>
                      <td
                        className="px-6 py-3.5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {txn.status === "Pending" ? (
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              onClick={() => openReviewModal(txn, "Completed")}
                              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => openReviewModal(txn, "Declined")}
                              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setReceiptTxn(txn)}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            Receipt
                          </button>
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

      {/* Deposit Review Confirmation Modal */}
      <Modal
        open={Boolean(reviewDraft)}
        onClose={() => setReviewDraft(null)}
        title={
          reviewDraft?.decision === "Completed"
            ? "Confirm Deposit Reconciliation"
            : "Decline Deposit Entry"
        }
        subtitle={reviewDraft ? `Reference: ${reviewDraft.txn.reference}` : undefined}
        maxWidthClass="max-w-md"
      >
        {reviewDraft && (
          <form onSubmit={handleConfirmReview} className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/35 p-4 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Investor</span>
                <span className="font-medium text-foreground">{reviewDraft.txn.userName}</span>
              </div>
              <div className="mt-2 flex justify-between gap-2">
                <span className="text-muted-foreground">Channel</span>
                <span className="text-foreground">{reviewDraft.txn.channel}</span>
              </div>
              <div className="mt-2 flex justify-between gap-2 border-t border-border pt-2">
                <span className="text-muted-foreground">Deposit Amount</span>
                <span className="font-tabular font-semibold text-foreground">
                  {formatNaira(reviewDraft.txn.amount)}
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="dep-review-note" className="block text-xs font-medium text-foreground">
                {reviewDraft.decision === "Declined"
                  ? "Rejection Reason (Required)"
                  : "Treasury Confirmation Note"}
              </label>
              <textarea
                id="dep-review-note"
                rows={3}
                required={reviewDraft.decision === "Declined"}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={
                  reviewDraft.decision === "Declined"
                    ? "e.g. Transfer reference not matched on settlement bank feed..."
                    : "Optional settlement reference or desk note..."
                }
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setReviewDraft(null)}
                className="h-9 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`h-9 rounded-lg px-5 text-xs font-medium ${
                  reviewDraft.decision === "Declined"
                    ? "bg-destructive text-white hover:bg-destructive/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {reviewDraft.decision === "Completed" ? "Approve & Credit Wallet" : "Confirm Decline"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <TransactionReceiptModal transaction={receiptTxn} onClose={() => setReceiptTxn(null)} />
    </AdminDashboardLayout>
  );
}

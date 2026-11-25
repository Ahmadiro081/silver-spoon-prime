import { useState, type FormEvent } from "react";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { Modal } from "@/components/common/Modal";
import {
  FormAlert,
  MetricCard,
  SearchInput,
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
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
    setReviewError(null);
    setReviewDraft({ txn, decision });
    setReviewNote(
      decision === "Completed"
        ? "Reconciled against settlement ledger and confirmed by treasury admin."
        : "",
    );
  };

  const handleConfirmReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!reviewDraft || submitting) return;
    if (reviewDraft.decision === "Declined" && !reviewNote.trim()) {
      setReviewError("Please enter a rejection reason for the client and audit log.");
      return;
    }

    setReviewError(null);
    setSubmitting(true);
    try {
      const res = await adminReviewTransaction(
        reviewDraft.txn.id,
        reviewDraft.decision,
        reviewNote.trim() ||
          (reviewDraft.decision === "Completed"
            ? "Confirmed by treasury admin."
            : "Declined by treasury admin."),
      );
      if (!res.ok) {
        setReviewError(res.error ?? "Unable to review deposit.");
        return;
      }
      toast.success(
        `Deposit ${reviewDraft.txn.reference} marked ${reviewDraft.decision}.`,
      );
      setReviewDraft(null);
      setReviewNote("");
      setReviewError(null);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Unable to review deposit.");
    } finally {
      setSubmitting(false);
    }
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
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search reference, investor, or channel..."
            ariaLabel="Search deposits by reference, investor, or channel"
            className="w-full max-w-sm"
          />
          <SegmentedFilter
            ariaLabel="Filter deposits by status"
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

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p aria-live="polite" className="font-tabular">
            Showing {filtered.length} of {deposits.length} deposit entries
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
                  <th scope="col" className="px-6 py-3 font-medium">Reference</th>
                  <th scope="col" className="px-6 py-3 font-medium">Client</th>
                  <th scope="col" className="px-6 py-3 font-medium">Channel</th>
                  <th scope="col" className="px-6 py-3 font-medium">Timestamp</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-6 py-3 font-medium">Status</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Treasury Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={7}
                    title="No deposit records found"
                    description="Adjust the status filter or search query to inspect Naira deposit entries."
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
                              aria-label={`Approve deposit ${txn.reference}`}
                              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => openReviewModal(txn, "Declined")}
                              aria-label={`Decline deposit ${txn.reference}`}
                              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setReceiptTxn(txn)}
                            aria-label={`View receipt for ${txn.reference}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                          >
                            <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
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
        onClose={() => {
          setReviewDraft(null);
          setReviewError(null);
        }}
        title={
          reviewDraft?.decision === "Completed"
            ? "Confirm Deposit Reconciliation"
            : "Decline Deposit Entry"
        }
        subtitle={reviewDraft ? `Reference: ${reviewDraft.txn.reference}` : undefined}
        maxWidthClass="max-w-md"
      >
        {reviewDraft && (
          <form onSubmit={handleConfirmReview} noValidate className="space-y-4">
            {reviewError && <FormAlert>{reviewError}</FormAlert>}

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
                onChange={(e) => {
                  setReviewNote(e.target.value);
                  if (reviewError) setReviewError(null);
                }}
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
                disabled={submitting}
                onClick={() => {
                  setReviewDraft(null);
                  setReviewError(null);
                }}
                className="h-10 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`h-10 rounded-lg px-5 text-xs font-medium disabled:opacity-50 ${
                  reviewDraft.decision === "Declined"
                    ? "bg-destructive text-white hover:bg-destructive/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {submitting
                  ? "Processing..."
                  : reviewDraft.decision === "Completed"
                    ? "Approve & Credit Wallet"
                    : "Confirm Decline"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <TransactionReceiptModal transaction={receiptTxn} onClose={() => setReceiptTxn(null)} />
    </AdminDashboardLayout>
  );
}

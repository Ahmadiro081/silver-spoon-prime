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

interface WithdrawalReviewDraft {
  txn: TransactionRecord;
  decision: "Completed" | "Declined";
}

export function AdminWithdrawalsPage() {
  const { transactions, adminReviewTransaction } = useAppState();
  const [filter, setFilter] = useState<"ALL" | TransactionStatus>("ALL");
  const [query, setQuery] = useState("");
  const [reviewDraft, setReviewDraft] = useState<WithdrawalReviewDraft | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receiptTxn, setReceiptTxn] = useState<TransactionRecord | null>(null);

  const withdrawals = transactions.filter((t) => t.type === "Withdrawal");
  const filtered = withdrawals.filter((t) => {
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

  const pendingVal = withdrawals
    .filter((w) => w.status === "Pending")
    .reduce((s, w) => s + w.amount, 0);
  const settledVal = withdrawals
    .filter((w) => w.status === "Completed")
    .reduce((s, w) => s + w.amount, 0);

  const openReviewModal = (txn: TransactionRecord, decision: "Completed" | "Declined") => {
    setReviewError(null);
    setReviewDraft({ txn, decision });
    setReviewNote(
      decision === "Completed"
        ? "Simulated NIP disbursement approved and released by treasury desk."
        : "",
    );
  };

  const handleConfirmReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!reviewDraft || submitting) return;
    if (reviewDraft.decision === "Declined" && !reviewNote.trim()) {
      setReviewError("Please provide a rejection note explaining why the withdrawal was declined.");
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
            ? "Simulated NIP payout disbursed by treasury."
            : "Declined by compliance desk."),
      );
      if (!res.ok) {
        setReviewError(res.error ?? "Unable to process withdrawal review.");
        return;
      }
      toast.success(
        reviewDraft.decision === "Completed"
          ? `Withdrawal ${reviewDraft.txn.reference} approved and settled.`
          : `Withdrawal ${reviewDraft.txn.reference} declined; held funds restored to client available balance.`,
      );
      setReviewDraft(null);
      setReviewNote("");
      setReviewError(null);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Unable to process withdrawal review.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminDashboardLayout title="Withdrawal Records" breadcrumb="Withdrawals">
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Pending Payout Queue" value={formatNaira(pendingVal)} />
          <MetricCard label="Settled Withdrawals" value={formatNaira(settledVal)} />
          <MetricCard label="Total Requests" value={String(withdrawals.length)} />
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search reference, investor, or bank..."
            ariaLabel="Search withdrawals by reference, investor, or bank"
            className="w-full max-w-sm"
          />
          <SegmentedFilter
            ariaLabel="Filter withdrawals by status"
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
            Showing {filtered.length} of {withdrawals.length} withdrawal requests
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
                  <th scope="col" className="px-6 py-3 font-medium">Destination Bank</th>
                  <th scope="col" className="px-6 py-3 font-medium">Requested</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-6 py-3 font-medium">Status</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Payout Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={7}
                    title="No withdrawal records found"
                    description="Adjust the status filter or search query to inspect payout requests."
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
                              aria-label={`Approve payout ${txn.reference}`}
                              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                            >
                              Approve Payout
                            </button>
                            <button
                              type="button"
                              onClick={() => openReviewModal(txn, "Declined")}
                              aria-label={`Decline withdrawal ${txn.reference}`}
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

      {/* Withdrawal Payout Confirmation Modal */}
      <Modal
        open={Boolean(reviewDraft)}
        onClose={() => {
          setReviewDraft(null);
          setReviewError(null);
        }}
        title={
          reviewDraft?.decision === "Completed"
            ? "Approve Simulated NIP Disbursement"
            : "Decline Withdrawal Request"
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
                <span className="text-muted-foreground">Destination Bank</span>
                <span className="text-right font-medium text-foreground">
                  {reviewDraft.txn.channel}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-2">
                <span className="text-muted-foreground">Transfer Amount</span>
                <span className="font-tabular font-semibold text-foreground">
                  {formatNaira(reviewDraft.txn.amount)}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-2 border-t border-border pt-2">
                <span className="text-muted-foreground">Settlement Fee</span>
                <span className="font-tabular text-foreground">
                  {reviewDraft.txn.fee > 0 ? formatNaira(reviewDraft.txn.fee) : "₦0 (Waived)"}
                </span>
              </div>
            </div>

            {reviewDraft.decision === "Declined" && (
              <p className="text-xs text-muted-foreground">
                Declining this request releases the reserved Naira balance back into the client&apos;s
                Available Balance immediately.
              </p>
            )}

            <div>
              <label htmlFor="wdr-review-note" className="block text-xs font-medium text-foreground">
                {reviewDraft.decision === "Declined"
                  ? "Compliance / Rejection Reason (Required)"
                  : "Treasury Disbursement Note"}
              </label>
              <textarea
                id="wdr-review-note"
                rows={3}
                required={reviewDraft.decision === "Declined"}
                value={reviewNote}
                onChange={(e) => {
                  setReviewNote(e.target.value);
                  if (reviewError) setReviewError(null);
                }}
                placeholder={
                  reviewDraft.decision === "Declined"
                    ? "e.g. Account name mismatch with KYC profile..."
                    : "NIP session reference or disbursement remarks..."
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
                    ? "Approve & Disburse"
                    : "Decline & Refund Hold"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <TransactionReceiptModal transaction={receiptTxn} onClose={() => setReceiptTxn(null)} />
    </AdminDashboardLayout>
  );
}

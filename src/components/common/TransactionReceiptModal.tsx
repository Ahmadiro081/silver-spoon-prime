import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { StatusText } from "@/components/common/Primitives";
import type { TransactionRecord } from "@/types/domain";
import { formatDateTime, formatNaira } from "@/utils/format";

export function TransactionReceiptModal({
  transaction,
  onClose,
}: {
  transaction: TransactionRecord | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!transaction) return null;

  const isInflow =
    transaction.type === "Deposit" ||
    transaction.type === "Realized Return" ||
    transaction.type === "Referral Commission";
  const netTotal = transaction.amount + transaction.fee;

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(transaction.reference);
      setCopied(true);
      toast.success("Transaction reference copied.");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Unable to copy reference.");
    }
  };

  const downloadReceipt = () => {
    const lines = [
      "SILVER SPOON — SIMULATED TRANSACTION RECEIPT",
      "====================================================",
      `Reference:       ${transaction.reference}`,
      `Transaction ID:  ${transaction.id}`,
      `Type:            ${transaction.type}`,
      `Status:          ${transaction.status}`,
      `Account Holder:  ${transaction.userName} (${transaction.userEmail})`,
      `Channel:         ${transaction.channel}`,
      `Amount:          ${isInflow ? "+" : "-"}${formatNaira(transaction.amount, true)}`,
      `Fee:             ${formatNaira(transaction.fee, true)}`,
      `Total Impact:    ${isInflow ? "+" : "-"}${formatNaira(netTotal, true)}`,
      `Created At:      ${formatDateTime(transaction.createdAt)}`,
      `Reviewed At:     ${transaction.reviewedAt ? formatDateTime(transaction.reviewedAt) : "Pending Review"}`,
      `Reviewed By:     ${transaction.reviewedBy ?? "Awaiting Treasury Desk"}`,
      `Narration:       ${transaction.note ?? "—"}`,
      "====================================================",
      "Notice: Simulated frontend ledger receipt for demonstration purposes only.",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${transaction.reference}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded transaction receipt.");
  };

  return (
    <Modal
      open={Boolean(transaction)}
      onClose={onClose}
      title="Transaction Receipt"
      subtitle="Simulated Naira Ledger Breakdown"
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-secondary/40 p-5 text-center">
          <p className="text-xs text-muted-foreground">{transaction.type}</p>
          <p
            className={`font-tabular mt-1.5 text-3xl font-semibold tracking-tight ${
              isInflow ? "text-success" : "text-foreground"
            }`}
          >
            {isInflow ? "+" : "-"}
            {formatNaira(transaction.amount, true)}
          </p>
          <div className="mt-2.5 flex justify-center">
            <StatusText status={transaction.status} showIcon />
          </div>
        </div>

        <dl className="divide-y divide-border border-y border-border text-xs">
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="flex items-center gap-2">
              <span className="font-tabular font-medium text-foreground">
                {transaction.reference}
              </span>
              <button
                type="button"
                onClick={copyReference}
                aria-label="Copy reference"
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Ledger Entry ID</dt>
            <dd className="font-tabular font-medium text-foreground">{transaction.id}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Account Holder</dt>
            <dd className="text-right font-medium text-foreground">
              {transaction.userName}
              <span className="block font-normal text-muted-foreground">
                {transaction.userEmail}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Channel / Instrument</dt>
            <dd className="text-right font-medium text-foreground">{transaction.channel}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Settlement Fee</dt>
            <dd className="font-tabular font-medium text-foreground">
              {transaction.fee > 0 ? formatNaira(transaction.fee, true) : "₦0.00 (Waived)"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Net Ledger Impact</dt>
            <dd className="font-tabular font-semibold text-foreground">
              {isInflow ? "+" : "-"}
              {formatNaira(netTotal, true)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Initiated</dt>
            <dd className="font-tabular text-foreground">
              {formatDateTime(transaction.createdAt)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Treasury Review</dt>
            <dd className="text-right text-foreground">
              {transaction.reviewedBy ? (
                <>
                  <span className="font-medium">{transaction.reviewedBy}</span>
                  {transaction.reviewedAt && (
                    <span className="font-tabular block text-[11px] text-muted-foreground">
                      {formatDateTime(transaction.reviewedAt)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Pending review</span>
              )}
            </dd>
          </div>
          {transaction.note && (
            <div className="py-3">
              <dt className="text-muted-foreground">Narration / Review Note</dt>
              <dd className="mt-1 leading-relaxed text-foreground">{transaction.note}</dd>
            </div>
          )}
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={downloadReceipt}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-xs font-medium text-foreground whitespace-nowrap hover:bg-secondary"
          >
            <Download className="h-3.5 w-3.5" />
            Download Receipt
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

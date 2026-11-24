import { useEffect, useState } from "react";
import { Download, Receipt } from "lucide-react";
import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import {
  SearchInput,
  SegmentedFilter,
  StatusText,
  TableEmptyRow,
} from "@/components/common/Primitives";
import { TransactionReceiptModal } from "@/components/common/TransactionReceiptModal";
import { useAppState } from "@/context/AppStateContext";
import type { TransactionRecord, TransactionStatus, TransactionType } from "@/types/domain";
import { getTransactionLedgerImpact } from "@/utils/calculations";
import { buildCsvContent, downloadCsvFile } from "@/utils/csv";
import { formatDateTime, formatNaira } from "@/utils/format";

export function TransactionsPage() {
  const { currentUser, userTransactions } = useAppState();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | TransactionType>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TransactionStatus>("ALL");
  const [selectedTxn, setSelectedTxn] = useState<TransactionRecord | null>(null);

  useEffect(() => {
    setSelectedTxn(null);
  }, [currentUser.id]);

  const filtered = userTransactions.filter((t) => {
    const matchesType = typeFilter === "ALL" || t.type === typeFilter;
    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      t.reference.toLowerCase().includes(q) ||
      t.channel.toLowerCase().includes(q) ||
      (t.note?.toLowerCase().includes(q) ?? false);
    return matchesType && matchesStatus && matchesQuery;
  });

  const hasFilters = Boolean(query.trim()) || typeFilter !== "ALL" || statusFilter !== "ALL";

  const exportCsv = () => {
    const csvContent = buildCsvContent(
      [
        "Ledger Mode",
        "Reference",
        "Type",
        "Channel",
        "Amount (NGN)",
        "Fee (NGN)",
        "Status",
        "Note",
        "Date",
      ],
      filtered.map((t) => [
        "SIMULATED TRANSACTION (TEST ENVIRONMENT)",
        t.reference,
        t.type,
        t.channel,
        t.amount,
        t.fee,
        t.status,
        t.note ?? "",
        t.createdAt,
      ]),
    );
    downloadCsvFile("silver-spoon-simulated-transactions.csv", csvContent);
    toast.success("Exported simulated transaction ledger to CSV.");
  };

  return (
    <UserDashboardLayout
      title="Transaction Ledger"
      breadcrumb="Transactions"
      action={
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground whitespace-nowrap hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Download CSV
        </button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search reference, channel, or narration..."
              ariaLabel="Search transactions by reference, channel, or narration"
            />

            <SegmentedFilter
              ariaLabel="Filter transactions by status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: "All Statuses", value: "ALL" },
                { label: "Completed", value: "Completed" },
                { label: "Pending", value: "Pending" },
                { label: "Declined", value: "Declined" },
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedFilter
              ariaLabel="Filter transactions by type"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { label: "All Types", value: "ALL" },
                { label: "Deposit", value: "Deposit" },
                { label: "Withdrawal", value: "Withdrawal" },
                { label: "Investment", value: "Investment" },
                { label: "Realized Return", value: "Realized Return" },
                { label: "Referral", value: "Referral Commission" },
              ]}
            />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span aria-live="polite" className="font-tabular">
                Showing {filtered.length} of {userTransactions.length}
              </span>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setTypeFilter("ALL");
                    setStatusFilter("ALL");
                  }}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-6 py-3 font-medium">Reference</th>
                  <th scope="col" className="px-6 py-3 font-medium">Type</th>
                  <th scope="col" className="px-6 py-3 font-medium">Channel / Detail</th>
                  <th scope="col" className="px-6 py-3 font-medium">Date & Time</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Status</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={7}
                    title={
                      userTransactions.length === 0
                        ? "No transactions yet"
                        : "No matching ledger entries"
                    }
                    description={
                      userTransactions.length === 0
                        ? "Simulated deposits, allocations, realized returns, and withdrawals for your account will appear here."
                        : "Adjust your search keyword, transaction type, or status filter to inspect records."
                    }
                    action={
                      hasFilters ? (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setTypeFilter("ALL");
                            setStatusFilter("ALL");
                          }}
                          className="inline-flex h-9 items-center rounded-lg border border-border px-3.5 text-xs font-medium text-foreground hover:bg-secondary"
                        >
                          Clear Filters
                        </button>
                      ) : undefined
                    }
                  />
                ) : (
                  filtered.map((txn) => {
                    const impact = getTransactionLedgerImpact(txn);
                    const amountTone =
                      txn.status === "Declined"
                        ? "text-muted-foreground line-through"
                        : impact.isInflow
                          ? "text-success"
                          : "text-foreground";
                    return (
                      <tr
                        key={txn.id}
                        onClick={() => setSelectedTxn(txn)}
                        className="cursor-pointer hover:bg-secondary/25"
                      >
                        <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                          {txn.reference}
                        </td>
                        <td className="px-6 py-3.5 font-medium text-foreground">{txn.type}</td>
                        <td className="px-6 py-3.5">
                          <p className="text-xs font-medium text-foreground">{txn.channel}</p>
                          {txn.note && (
                            <p className="text-[11px] text-muted-foreground">{txn.note}</p>
                          )}
                        </td>
                        <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(txn.createdAt)}
                        </td>
                        <td className="font-tabular px-6 py-3.5 text-right whitespace-nowrap">
                          <span className={`font-semibold ${amountTone}`}>
                            {impact.sign}
                            {formatNaira(txn.amount)}
                          </span>
                          {txn.fee > 0 && (
                            <span className="block text-[11px] text-muted-foreground">
                              Fee: {formatNaira(txn.fee)}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <StatusText status={txn.status} />
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            aria-label={`View receipt for ${txn.reference}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTxn(txn);
                            }}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-secondary"
                          >
                            <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <TransactionReceiptModal transaction={selectedTxn} onClose={() => setSelectedTxn(null)} />
    </UserDashboardLayout>
  );
}

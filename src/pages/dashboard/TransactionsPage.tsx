import { useState } from "react";
import { Download, Receipt, Search } from "lucide-react";
import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import { SegmentedFilter, StatusText, TableEmptyRow } from "@/components/common/Primitives";
import { TransactionReceiptModal } from "@/components/common/TransactionReceiptModal";
import { useAppState } from "@/context/AppStateContext";
import type { TransactionRecord, TransactionStatus, TransactionType } from "@/types/domain";
import { formatDateTime, formatNaira } from "@/utils/format";

export function TransactionsPage() {
  const { userTransactions } = useAppState();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | TransactionType>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TransactionStatus>("ALL");
  const [selectedTxn, setSelectedTxn] = useState<TransactionRecord | null>(null);

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
    const header = "Reference,Type,Channel,Amount (NGN),Fee (NGN),Status,Date\n";
    const rows = filtered
      .map(
        (t) =>
          `"${t.reference}","${t.type}","${t.channel}",${t.amount},${t.fee},"${t.status}","${t.createdAt}"`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "silver-spoon-transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Exported transaction ledger to CSV.");
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
          <Download className="h-3.5 w-3.5" />
          Download CSV
        </button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reference, channel, or narration..."
                className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <SegmentedFilter
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
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setTypeFilter("ALL");
                  setStatusFilter("ALL");
                }}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Reference</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Channel / Detail</th>
                  <th className="px-6 py-3 font-medium">Date & Time</th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                  <th className="px-6 py-3 text-right font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Receipt</th>
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
                  />
                ) : (
                  filtered.map((txn) => (
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
                        {txn.note && <p className="text-[11px] text-muted-foreground">{txn.note}</p>}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(txn.createdAt)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right font-semibold text-foreground whitespace-nowrap">
                        {formatNaira(txn.amount)}
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <StatusText status={txn.status} />
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTxn(txn);
                          }}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-secondary"
                        >
                          <Receipt className="h-3.5 w-3.5" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))
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

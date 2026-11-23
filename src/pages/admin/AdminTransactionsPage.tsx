import { useState } from "react";
import { Download, Receipt, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { SegmentedFilter, StatusText, TableEmptyRow } from "@/components/common/Primitives";
import { TransactionReceiptModal } from "@/components/common/TransactionReceiptModal";
import { useAppState } from "@/context/AppStateContext";
import type { TransactionRecord, TransactionStatus, TransactionType } from "@/types/domain";
import { formatDateTime, formatNaira } from "@/utils/format";

export function AdminTransactionsPage() {
  const { transactions } = useAppState();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | TransactionType>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TransactionStatus>("ALL");
  const [selectedTxn, setSelectedTxn] = useState<TransactionRecord | null>(null);

  const filtered = transactions.filter((t) => {
    const matchesType = typeFilter === "ALL" || t.type === typeFilter;
    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      t.reference.toLowerCase().includes(q) ||
      t.userName.toLowerCase().includes(q) ||
      t.userEmail.toLowerCase().includes(q) ||
      t.channel.toLowerCase().includes(q);
    return matchesType && matchesStatus && matchesQuery;
  });

  const exportCsv = () => {
    const header = "Reference,Client,Email,Type,Channel,Amount (NGN),Status,Timestamp\n";
    const rows = filtered
      .map(
        (t) =>
          `"${t.reference}","${t.userName}","${t.userEmail}","${t.type}","${t.channel}",${t.amount},"${t.status}","${t.createdAt}"`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "silver-spoon-admin-ledger.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded platform transaction ledger CSV.");
  };

  return (
    <AdminDashboardLayout
      title="Transaction Monitoring"
      breadcrumb="Transactions"
      action={
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground whitespace-nowrap hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
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
                placeholder="Search reference, investor, or bank..."
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
        </div>

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Reference</th>
                  <th className="px-6 py-3 font-medium">Client</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Channel</th>
                  <th className="px-6 py-3 font-medium">Timestamp</th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                  <th className="px-6 py-3 text-right font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={8}
                    title="No platform transactions match your filters"
                    description="Adjust the search keyword, transaction type, or status filter."
                  />
                ) : (
                  filtered.map((txn) => (
                    <tr
                      key={txn.id}
                      onClick={() => setSelectedTxn(txn)}
                      className="cursor-pointer hover:bg-secondary/25"
                    >
                      <td className="font-tabular px-6 py-3 text-xs text-muted-foreground">
                        {txn.reference}
                      </td>
                      <td className="px-6 py-3 text-xs">
                        <p className="font-medium text-foreground">{txn.userName}</p>
                        <p className="text-muted-foreground">{txn.userEmail}</p>
                      </td>
                      <td className="px-6 py-3 font-medium text-foreground">{txn.type}</td>
                      <td className="px-6 py-3 text-xs text-muted-foreground">{txn.channel}</td>
                      <td className="font-tabular px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(txn.createdAt)}
                      </td>
                      <td className="font-tabular px-6 py-3 text-right font-semibold text-foreground whitespace-nowrap">
                        {formatNaira(txn.amount)}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <StatusText status={txn.status} />
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
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
    </AdminDashboardLayout>
  );
}

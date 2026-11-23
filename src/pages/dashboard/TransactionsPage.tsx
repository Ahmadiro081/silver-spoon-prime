import { useState } from "react";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import { EmptyState, SegmentedFilter, StatusText } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import type { TransactionType } from "@/types/domain";
import { formatDateTime, formatNaira } from "@/utils/format";

export function TransactionsPage() {
  const { userTransactions } = useAppState();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | TransactionType>("ALL");

  const filtered = userTransactions.filter((t) => {
    const matchesType = typeFilter === "ALL" || t.type === typeFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      t.reference.toLowerCase().includes(q) ||
      t.channel.toLowerCase().includes(q) ||
      (t.note?.toLowerCase().includes(q) ?? false);
    return matchesType && matchesQuery;
  });

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
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground whitespace-nowrap hover:bg-secondary"
        >
          <Download className="h-3.5 w-3.5" />
          Download CSV
        </button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reference or channel..."
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <SegmentedFilter
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { label: "All", value: "ALL" },
              { label: "Deposit", value: "Deposit" },
              { label: "Withdrawal", value: "Withdrawal" },
              { label: "Investment", value: "Investment" },
              { label: "Realized Return", value: "Realized Return" },
              { label: "Referral", value: "Referral Commission" },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No matching ledger entries"
            description="Adjust your search keyword or transaction type filter to inspect records."
          />
        ) : (
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((txn) => (
                    <tr key={txn.id} className="hover:bg-secondary/25">
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                        {txn.reference}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-foreground">{txn.type}</td>
                      <td className="px-6 py-3.5">
                        <p className="text-xs font-medium text-foreground">{txn.channel}</p>
                        {txn.note && <p className="text-[11px] text-muted-foreground">{txn.note}</p>}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                        {formatDateTime(txn.createdAt)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right font-semibold text-foreground">
                        {formatNaira(txn.amount)}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <StatusText status={txn.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </UserDashboardLayout>
  );
}

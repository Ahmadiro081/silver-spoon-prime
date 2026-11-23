import { useState } from "react";
import { Search } from "lucide-react";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { SegmentedFilter, StatusText, TableEmptyRow } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import type { AuditLogEntry } from "@/types/domain";
import { formatDateTime } from "@/utils/format";

export function AdminAuditLogsPage() {
  const { auditLogs } = useAppState();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<"ALL" | AuditLogEntry["severity"]>("ALL");

  const filtered = auditLogs.filter((entry) => {
    const matchesSeverity = severity === "ALL" || entry.severity === severity;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      entry.actorName.toLowerCase().includes(q) ||
      entry.action.toLowerCase().includes(q) ||
      entry.summary.toLowerCase().includes(q) ||
      entry.targetId.toLowerCase().includes(q);
    return matchesSeverity && matchesQuery;
  });

  return (
    <AdminDashboardLayout title="Audit Logs" breadcrumb="Audit Logs">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search actor, action, or target ID..."
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <SegmentedFilter
            value={severity}
            onChange={setSeverity}
            options={[
              { label: "All Severities", value: "ALL" },
              { label: "Info", value: "Info" },
              { label: "Review", value: "Review" },
              { label: "Critical", value: "Critical" },
            ]}
          />
        </div>

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Timestamp</th>
                  <th className="px-6 py-3 font-medium">Actor</th>
                  <th className="px-6 py-3 font-medium">Action & Target</th>
                  <th className="px-6 py-3 font-medium">Details</th>
                  <th className="px-6 py-3 font-medium">IP</th>
                  <th className="px-6 py-3 text-right font-medium">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={6}
                    title="No audit events match your filters"
                    description="Clear your search keyword or select All Severities to view full platform history."
                  />
                ) : (
                  filtered.map((log) => (
                    <tr key={log.id} className="hover:bg-secondary/25">
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(log.timestamp)}
                      </td>
                      <td className="px-6 py-3.5 text-xs">
                        <p className="font-medium text-foreground">{log.actorName}</p>
                        <p className="capitalize text-muted-foreground">{log.actorRole}</p>
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-xs">
                        <p className="font-medium text-foreground">{log.action}</p>
                        <p className="text-muted-foreground">
                          {log.targetType} · {log.targetId}
                        </p>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-muted-foreground">{log.summary}</td>
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                        {log.ipAddress}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <StatusText status={log.severity} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminDashboardLayout>
  );
}

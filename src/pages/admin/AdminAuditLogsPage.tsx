import { useState } from "react";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import {
  SearchInput,
  SegmentedFilter,
  StatusText,
  TableEmptyRow,
} from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import type { AuditLogEntry } from "@/types/domain";
import { formatDateTime } from "@/utils/format";

export function AdminAuditLogsPage() {
  const { auditLogs } = useAppState();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<"ALL" | AuditLogEntry["severity"]>("ALL");

  const hasFilters = Boolean(query.trim()) || severity !== "ALL";

  const clearFilters = () => {
    setQuery("");
    setSeverity("ALL");
  };

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
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search actor, action, or target ID..."
            ariaLabel="Search audit logs by actor, action, or target ID"
            className="w-full max-w-sm"
          />
          <SegmentedFilter
            ariaLabel="Filter audit logs by severity"
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

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p aria-live="polite" className="font-tabular">
            Showing {filtered.length} of {auditLogs.length} audit events
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
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
                  <th scope="col" className="px-6 py-3 font-medium">Timestamp</th>
                  <th scope="col" className="px-6 py-3 font-medium">Actor</th>
                  <th scope="col" className="px-6 py-3 font-medium">Action & Target</th>
                  <th scope="col" className="px-6 py-3 font-medium">Details</th>
                  <th scope="col" className="px-6 py-3 font-medium">IP</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={6}
                    title="No audit events match your filters"
                    description="Clear your search keyword or select All Severities to view full platform history."
                    action={
                      hasFilters ? (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="h-9 rounded-lg border border-border bg-card px-4 text-xs font-medium text-foreground hover:bg-secondary"
                        >
                          Clear Filters
                        </button>
                      ) : undefined
                    }
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
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
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

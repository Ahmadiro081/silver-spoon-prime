import type { ReactNode } from "react";

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card-premium p-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function LoadingBlock({ height = "h-64" }: { height?: string }) {
  return <div className={`w-full animate-pulse rounded-xl bg-secondary ${height}`} />;
}

export function EmptyBlock({ message, height = "h-64" }: { message: string; height?: string }) {
  return (
    <div className={`grid w-full place-items-center rounded-xl border border-dashed border-border ${height}`}>
      <p className="px-6 text-center text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "Completed" || status === "Active" || status === "Matured"
      ? "bg-success/15 text-success"
      : status === "Pending"
        ? "bg-warning/20 text-warning-foreground"
        : "bg-destructive/15 text-destructive";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

export const chartTooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  color: "var(--color-foreground)",
};

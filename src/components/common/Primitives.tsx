import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Info, XCircle } from "lucide-react";

type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

const STATUS_MAP: Record<string, StatusTone> = {
  Completed: "success",
  Active: "success",
  Paid: "success",
  Matured: "success",
  Verified: "success",
  Low: "success",
  "Low Risk": "success",
  Info: "info",
  Pending: "warning",
  "Pending KYC": "warning",
  Moderate: "warning",
  "Moderate Risk": "warning",
  Paused: "warning",
  Review: "warning",
  Declined: "danger",
  Suspended: "danger",
  Cancelled: "danger",
  Elevated: "danger",
  "Elevated Risk": "danger",
  Critical: "danger",
  Archived: "neutral",
};

const TONE_CLASS: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-foreground",
  neutral: "text-muted-foreground",
};

export function StatusText({ status, showIcon = false }: { status: string; showIcon?: boolean }) {
  const tone = STATUS_MAP[status] ?? "neutral";
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "warning"
        ? Clock
        : tone === "danger"
          ? XCircle
          : Info;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${TONE_CLASS[tone]}`}
    >
      {showIcon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      {status}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  delta,
  deltaTone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
}) {
  const deltaClass =
    deltaTone === "positive"
      ? "text-success"
      : deltaTone === "negative"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className="surface-card p-5 transition-colors hover:border-foreground/20">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-tabular mt-2.5 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {(detail || delta) && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          {detail && <span className="truncate text-muted-foreground">{detail}</span>}
          {delta && (
            <span className={`font-tabular shrink-0 font-medium ${deltaClass}`}>{delta}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function RiskDisclosure({
  title = "Risk & Return Disclosure",
  text,
}: {
  title?: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/50 px-4 py-3.5 text-xs leading-relaxed text-muted-foreground">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <span className="font-semibold text-foreground">{title}: </span>
          {text}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="font-display text-lg font-medium text-foreground">{title}</p>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function TableEmptyRow({
  colSpan,
  title,
  description,
  action,
}: {
  colSpan: number;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-12 text-center">
        <p className="font-display text-base font-medium text-foreground">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{description}</p>
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </td>
    </tr>
  );
}

export function PageLoadingSkeleton() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-background px-6"
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-4xl space-y-5">
        <div className="h-7 w-48 animate-pulse rounded-md bg-secondary" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="h-28 animate-pulse rounded-xl border border-border bg-card" />
          <div className="h-28 animate-pulse rounded-xl border border-border bg-card" />
          <div className="h-28 animate-pulse rounded-xl border border-border bg-card" />
        </div>
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
      </div>
      <span className="sr-only">Loading SILVER SPOON interface...</span>
    </div>
  );
}

export function SegmentedFilter<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-secondary/70 p-1">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "bg-card text-foreground shadow-subtle"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

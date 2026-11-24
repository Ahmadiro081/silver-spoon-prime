import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Info,
  Search,
  X,
  XCircle,
} from "lucide-react";

type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

const STATUS_MAP: Record<string, StatusTone> = {
  Completed: "success",
  Active: "success",
  Paid: "success",
  Matured: "success",
  Settled: "success",
  Approved: "success",
  Verified: "success",
  "Simulated Verified": "success",
  Low: "success",
  "Low Risk": "success",
  Info: "info",
  Scheduled: "neutral",
  Pending: "warning",
  "Pending Settlement": "warning",
  "Pending Verification": "warning",
  "Pending KYC": "warning",
  "Under Review": "warning",
  "Needs Resubmission": "danger",
  Unverified: "neutral",
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
  danger: "text-destructive dark:text-red-400",
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
      {showIcon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {status}
    </span>
  );
}

export function FormAlert({
  tone = "error",
  children,
  className = "",
}: {
  tone?: "error" | "warning" | "info" | "success";
  children: ReactNode;
  className?: string;
}) {
  const styles =
    tone === "error"
      ? "border-destructive/35 bg-destructive/10 text-destructive dark:text-red-400"
      : tone === "warning"
        ? "border-warning/35 bg-warning/10 text-foreground"
        : tone === "success"
          ? "border-success/35 bg-success/10 text-foreground"
          : "border-border bg-secondary/45 text-muted-foreground";

  const Icon =
    tone === "error"
      ? XCircle
      : tone === "warning"
        ? AlertTriangle
        : tone === "success"
          ? CheckCircle2
          : Info;

  const iconTone =
    tone === "error"
      ? "text-destructive dark:text-red-400"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-foreground";

  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed ${styles} ${className}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconTone}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = "w-full max-w-sm",
  compact = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search
        className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground ${
          compact ? "h-3.5 w-3.5" : "h-4 w-4"
        }`}
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`w-full rounded-lg border border-input bg-card text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
          compact
            ? "h-9 pl-8 pr-8 text-xs"
            : "h-10 pl-10 pr-9 text-sm"
        }`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function PasswordInput({
  id,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { id: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative mt-1.5">
      <input
        id={id}
        type={visible ? "text" : "password"}
        {...props}
        className={`h-10 w-full rounded-lg border border-input bg-background pl-3.5 pr-11 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
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
        ? "text-destructive dark:text-red-400"
        : "text-muted-foreground";

  return (
    <div className="surface-card min-w-0 p-5 transition-colors hover:border-foreground/20">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-tabular mt-2.5 truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
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
  ariaLabel,
}: {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-secondary/70 p-1"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`min-h-[34px] rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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

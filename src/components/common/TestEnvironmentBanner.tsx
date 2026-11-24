import { Link } from "react-router-dom";
import { useAppState } from "@/context/AppStateContext";

type EnvironmentBannerVariant = "workspace" | "public" | "auth";

/**
 * Transparent test-environment indicator strip rendered across public, auth,
 * and authenticated workspaces so simulated ledger operations can never be
 * mistaken for live bank transactions or real fund transfers.
 */
export function TestEnvironmentBanner({
  variant = "workspace",
}: {
  variant?: EnvironmentBannerVariant;
}) {
  const { authenticatedUser } = useAppState();

  if (variant === "public") {
    return (
      <div
        role="region"
        aria-label="Test environment disclosure"
        className="border-b border-border bg-secondary/50 text-xs text-muted-foreground"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-warning uppercase">
              Test Environment
            </span>
            <span className="text-foreground/90">
              Simulated Naira ledger — local browser storage only. NOT A REAL BANK TRANSACTION.
            </span>
          </div>
          <Link
            to={
              authenticatedUser
                ? authenticatedUser.role === "admin"
                  ? "/admin"
                  : "/dashboard"
                : "/register"
            }
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            {authenticatedUser ? "Open Workspace" : "Open Client Account"}
          </Link>
        </div>
      </div>
    );
  }

  if (variant === "auth") {
    return (
      <div
        role="region"
        aria-label="Test environment disclosure"
        className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/45 px-3.5 py-2.5 text-xs text-muted-foreground"
      >
        <span className="inline-flex shrink-0 items-center rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-warning uppercase">
          Test Environment
        </span>
        <span className="text-foreground/90">
          Simulated local browser ledger — NOT A REAL BANK TRANSACTION. No real funds or external
          settlements are processed.
        </span>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Test environment disclosure"
      className="border-b border-border bg-secondary/45 text-xs"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex shrink-0 items-center rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-warning uppercase">
            Test Environment
          </span>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">SIMULATED TRANSACTION LEDGER</span> ·
            Stored locally in your browser — NOT A REAL BANK TRANSACTION.
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          No live NIBSS or Paystack settlements
        </span>
      </div>
    </div>
  );
}

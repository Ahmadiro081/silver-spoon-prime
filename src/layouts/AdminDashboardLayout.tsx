import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Bell,
  Briefcase,
  ClipboardList,
  FileBarChart2,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { TestEnvironmentBanner } from "@/components/common/TestEnvironmentBanner";
import { useAppState } from "@/context/AppStateContext";
import { formatStaffRoleLabel } from "@/services/dataProvider";
import { handleFocusTrapKeyDown } from "@/utils/accessibility";

interface AdminNavGroup {
  label: string;
  items: { to: string; label: string; icon: ComponentType<{ className?: string }> }[];
}

const ADMIN_GROUPS: AdminNavGroup[] = [
  {
    label: "Operations",
    items: [
      { to: "/admin", label: "Overview", icon: LayoutDashboard },
      { to: "/admin/users", label: "User Management", icon: Users },
      { to: "/admin/plans", label: "Investment Plans", icon: Briefcase },
      { to: "/admin/investments", label: "Investments", icon: TrendingUp },
    ],
  },
  {
    label: "Treasury & Ledger",
    items: [
      { to: "/admin/deposits", label: "Deposits", icon: ArrowDownToLine },
      { to: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
      { to: "/admin/transactions", label: "Transactions", icon: Receipt },
      { to: "/admin/referrals", label: "Referrals", icon: GitBranch },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/admin/analytics", label: "Financial Analytics", icon: BarChart3 },
      { to: "/admin/reports", label: "Reports", icon: FileBarChart2 },
      { to: "/admin/notifications", label: "Notifications", icon: Bell },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: ClipboardList },
      { to: "/admin/settings", label: "Platform Settings", icon: Settings },
    ],
  },
];

export function AdminDashboardLayout({
  title,
  breadcrumb,
  action,
  children,
}: {
  title: string;
  breadcrumb?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    currentUser,
    users,
    transactions,
    kycSubmissions,
    adminReadData,
    refreshAdminReadData,
    logout,
  } = useAppState();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setSidebarOpen(false);
        return;
      }
      handleFocusTrapKeyDown(e, drawerRef.current);
    };

    window.addEventListener("keydown", onKey);
    drawerRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [sidebarOpen]);

  const pendingWithdrawalsCount = transactions.filter(
    (t) => t.type === "Withdrawal" && t.status === "Pending",
  ).length;
  const pendingDepositsCount = transactions.filter(
    (t) => t.type === "Deposit" && t.status === "Pending",
  ).length;
  const pendingKycCount = Math.max(
    users.filter((u) => u.role === "investor" && u.status === "Pending KYC").length,
    kycSubmissions.filter((s) => s.status === "Under Review").length,
  );

  const handleSignOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const renderSidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
        <Logo to="/" />
      </div>

      <div className="px-4 pt-4 pb-1">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">
          Administrator Console
        </p>
      </div>

      <nav
        className="flex-1 space-y-5 overflow-y-auto px-3 py-3"
        aria-label="Admin console navigation"
      >
        {ADMIN_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[11px] font-medium text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.to;
                const Icon = item.icon;
                const badgeCount =
                  item.to === "/admin/withdrawals"
                    ? pendingWithdrawalsCount
                    : item.to === "/admin/deposits"
                      ? pendingDepositsCount
                      : item.to === "/admin/users"
                        ? pendingKycCount
                        : 0;
                const badgeLabel =
                  item.to === "/admin/withdrawals"
                    ? "pending withdrawals"
                    : item.to === "/admin/deposits"
                      ? "pending deposits"
                      : "pending KYC reviews";

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={`flex min-h-[38px] items-center justify-between rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </span>
                    {badgeCount > 0 && (
                      <span
                        title={`${badgeCount} ${badgeLabel}`}
                        className="font-tabular text-xs font-semibold opacity-85"
                      >
                        <span className="sr-only">{badgeLabel}: </span>
                        {badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">{currentUser.fullName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {formatStaffRoleLabel(adminReadData.effectiveRole)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border lg:block">
        {renderSidebar()}
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            id="admin-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Admin console navigation"
            tabIndex={-1}
            className="relative h-full w-72 max-w-[85vw] border-r border-sidebar-border bg-sidebar shadow-elevated focus:outline-none"
          >
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close admin menu"
              className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {renderSidebar(() => setSidebarOpen(false))}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-expanded={sidebarOpen}
                aria-controls="admin-mobile-drawer"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border transition-colors hover:bg-secondary lg:hidden"
                aria-label="Open admin menu"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">
                  Admin Console / {breadcrumb ?? title}
                </p>
                <h1 className="font-display truncate text-lg font-medium text-foreground sm:text-xl">
                  {title}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 sm:gap-2.5">
              {action}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <TestEnvironmentBanner variant="workspace" />

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        >
          {(adminReadData.isDisconnected ||
            adminReadData.isForbidden ||
            adminReadData.status === "session_expired" ||
            adminReadData.status === "error") && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground"
            >
              <span>
                {adminReadData.isDisconnected
                  ? adminReadData.disconnectedReason ??
                    "Administrative read provider is in disconnected standby mode."
                  : adminReadData.error?.message ??
                    "Unable to synchronize administrative read-only data."}
              </span>
              {adminReadData.error?.recoverable && (
                <button
                  type="button"
                  onClick={() => void refreshAdminReadData()}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  Retry Sync
                </button>
              )}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

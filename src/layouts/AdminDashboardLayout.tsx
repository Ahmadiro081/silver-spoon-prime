import { useState, type ComponentType, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowLeftRight,
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
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { useAppState } from "@/context/AppStateContext";

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
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { transactions, switchRoleDemo, logout } = useAppState();

  const pendingWithdrawalsCount = transactions.filter(
    (t) => t.type === "Withdrawal" && t.status === "Pending",
  ).length;
  const pendingDepositsCount = transactions.filter(
    (t) => t.type === "Deposit" && t.status === "Pending",
  ).length;

  const handleOpenClient = () => {
    switchRoleDemo("investor");
    navigate("/dashboard");
  };

  const handleSignOut = () => {
    logout();
    navigate("/login");
  };

  const renderSidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
        <Logo to="/" />
      </div>

      <div className="px-4 pt-4 pb-1">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground">
          Administrator Console
        </p>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Admin console navigation">
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
                      : 0;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </span>
                    {badgeCount > 0 && (
                      <span className="font-tabular text-xs font-semibold opacity-80">
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
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            handleOpenClient();
          }}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
        >
          <span className="flex items-center gap-2 whitespace-nowrap">
            <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
            Client Portal View
          </span>
          <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">Oluwaseun Adeyemi</p>
            <p className="truncate text-[11px] text-muted-foreground">Operations Director</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border lg:block">
        {renderSidebar()}
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative h-full w-72 border-r border-sidebar-border bg-sidebar shadow-elevated">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
              className="absolute right-3 top-3.5 z-10 rounded-lg p-2 text-muted-foreground hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
            {renderSidebar(() => setSidebarOpen(false))}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border lg:hidden"
                aria-label="Open admin menu"
              >
                <Menu className="h-4 w-4" />
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

            <div className="flex items-center gap-2.5 shrink-0">
              {action}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

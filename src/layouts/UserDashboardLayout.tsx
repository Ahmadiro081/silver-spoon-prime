import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  Bell,
  LayoutDashboard,
  LineChart,
  LogOut,
  MailWarning,
  Menu,
  Receipt,
  Settings,
  ShieldCheck,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { useAppState } from "@/context/AppStateContext";
import { getInitials } from "@/utils/format";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const USER_NAV: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { to: "/dashboard/investments", label: "Investments", icon: LineChart },
  { to: "/dashboard/transactions", label: "Transactions", icon: Receipt },
  { to: "/dashboard/referrals", label: "Referrals", icon: Users },
  { to: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { to: "/dashboard/profile", label: "Profile", icon: User },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function UserDashboardLayout({
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
  const { currentUser, unreadNotificationCount, switchRoleDemo, logout } = useAppState();

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const handleSwitchAdminDemo = () => {
    switchRoleDemo("admin");
    navigate("/admin");
  };

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const renderSidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
        <Logo to="/" />
      </div>

      <div className="px-4 pt-4 pb-2">
        <p className="text-[11px] font-medium text-muted-foreground">Client Workspace</p>
      </div>

      <nav
        className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4"
        aria-label="Client dashboard navigation"
      >
        {USER_NAV.map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </span>
              {item.to === "/dashboard/notifications" && unreadNotificationCount > 0 && (
                <span className="font-tabular text-xs font-semibold opacity-80">
                  {unreadNotificationCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            handleSwitchAdminDemo();
          }}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
        >
          <span className="flex items-center gap-2 whitespace-nowrap">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
            Switch to Admin Demo
          </span>
          <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {getInitials(currentUser.fullName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">
                {currentUser.fullName}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {currentUser.tier} Client · {currentUser.kycLevel}
              </p>
            </div>
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
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border lg:block">
        {renderSidebar()}
      </aside>

      {/* Mobile Drawer */}
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

      {/* Main Content Area */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">
                  Client Portal / {breadcrumb ?? title}
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

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {currentUser.emailVerified === false && (
            <div className="mb-6 flex flex-col justify-between gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-xs sm:flex-row sm:items-center">
              <div className="flex items-center gap-2.5 text-foreground">
                <MailWarning className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <span>
                  Your email address (<span className="font-medium">{currentUser.email}</span>) has
                  not been verified yet.
                </span>
              </div>
              <Link
                to={`/verify-email?email=${encodeURIComponent(currentUser.email)}`}
                className="shrink-0 font-semibold text-foreground underline underline-offset-4 hover:text-primary"
              >
                Verify Email
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

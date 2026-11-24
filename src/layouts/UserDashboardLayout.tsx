import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
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
import { TestEnvironmentBanner } from "@/components/common/TestEnvironmentBanner";
import { useAppState } from "@/context/AppStateContext";
import { handleFocusTrapKeyDown } from "@/utils/accessibility";
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
  const drawerRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { currentUser, unreadNotificationCount, logout } = useAppState();

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
        <p className="text-xs font-medium text-muted-foreground">Client Workspace</p>
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
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={`flex min-h-[40px] items-center justify-between rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </span>
              {item.to === "/dashboard/notifications" && unreadNotificationCount > 0 && (
                <span className="font-tabular text-xs font-semibold opacity-85">
                  <span className="sr-only">unread notifications: </span>
                  {unreadNotificationCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              aria-hidden="true"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            >
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

      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border lg:block">
        {renderSidebar()}
      </aside>

      {/* Mobile Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            id="client-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Client portal navigation"
            tabIndex={-1}
            className="relative h-full w-72 max-w-[85vw] border-r border-sidebar-border bg-sidebar shadow-elevated focus:outline-none"
          >
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation drawer"
              className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {renderSidebar(() => setSidebarOpen(false))}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-expanded={sidebarOpen}
                aria-controls="client-mobile-drawer"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border transition-colors hover:bg-secondary lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
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
          {currentUser.emailVerified === false && (
            <div
              role="status"
              className="mb-4 flex flex-col justify-between gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-xs sm:flex-row sm:items-center"
            >
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
          {currentUser.role === "investor" &&
            (currentUser.status === "Pending KYC" || currentUser.kycLevel === "Tier 1") && (
              <div
                role="status"
                className="mb-6 flex flex-col justify-between gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-xs sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-2.5 text-foreground">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <span>
                    Compliance status is{" "}
                    <span className="font-medium">
                      {currentUser.status} ({currentUser.kycLevel})
                    </span>
                    . Submit your simulated KYC verification package to enable withdrawal eligibility.
                  </span>
                </div>
                <Link
                  to="/dashboard/profile#kyc"
                  className="shrink-0 font-semibold text-foreground underline underline-offset-4 hover:text-primary"
                >
                  Complete KYC
                </Link>
              </div>
            )}
          {children}
        </main>
      </div>
    </div>
  );
}

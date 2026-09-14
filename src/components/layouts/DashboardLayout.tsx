import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Wallet, LineChart, Users, Bell, Receipt, User, Settings, Menu, X,
  ShieldCheck, BarChart3, FileText, CircleDollarSign, ArrowDownToLine, ArrowUpFromLine, TrendingUp,
} from "lucide-react";
import { useState, type ReactNode, type ComponentType } from "react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useSession } from "@/hooks/useSession";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Item = { to: string; label: string; icon: ComponentType<{ className?: string }> };

const userNav: Item[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { to: "/dashboard/investments", label: "Investments", icon: LineChart },
  { to: "/dashboard/transactions", label: "Transactions", icon: Receipt },
  { to: "/dashboard/referrals", label: "Referrals", icon: Users },
  { to: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { to: "/dashboard/profile", label: "Profile", icon: User },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

const adminNav: Item[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/plans", label: "Plans", icon: CircleDollarSign },
  { to: "/admin/investments", label: "Investments", icon: TrendingUp },
  { to: "/admin/transactions", label: "Transactions", icon: Receipt },
  { to: "/admin/deposits", label: "Deposits", icon: ArrowDownToLine },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
  { to: "/admin/reports", label: "Reports", icon: FileText },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

function SidebarInner({
  items,
  onNavigate,
  badge,
}: { items: Item[]; onNavigate?: () => void; badge?: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo />
        {badge && (
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {items.map((it) => {
          const active = path === it.to;
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              onClick={onNavigate}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-elegant"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <Link
          to="/login"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Link>
      </div>
    </div>
  );
}

function Topbar({
  title,
  onOpenSidebar,
  right,
}: { title: string; onOpenSidebar: () => void; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          className="rounded-md p-2 lg:hidden"
          onClick={onOpenSidebar}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="font-display truncate text-lg sm:text-xl">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          {right}
          <ThemeToggle />
          <Link to="/dashboard/notifications" className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <Bell className="h-4 w-4" />
          </Link>
          <Avatar className="h-8 w-8 border border-border">
            <AvatarFallback className="bg-gradient-ink text-xs text-primary-foreground">AO</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}

function AppShell({
  children, title, items, badge, right,
}: {
  children: ReactNode; title: string; items: Item[]; badge?: string; right?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-secondary/30">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-sidebar lg:block">
        <SidebarInner items={items} badge={badge} />
      </aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar shadow-lift">
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarInner items={items} badge={badge} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <Topbar title={title} onOpenSidebar={() => setOpen(true)} right={right} />
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
      </div>
    </div>
  );
}

export function DashboardLayout({
  children, title, right,
}: { children: ReactNode; title: string; right?: ReactNode }) {
  return <AppShell items={userNav} title={title} right={right}>{children}</AppShell>;
}

export function AdminLayout({
  children, title, right,
}: { children: ReactNode; title: string; right?: ReactNode }) {
  return (
    <AppShell
      items={adminNav}
      title={title}
      badge="Admin"
      right={
        <span className="hidden items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground sm:inline-flex">
          <ShieldCheck className="h-3.5 w-3.5" /> Console
        </span>
      }
    >
      {children}
    </AppShell>
  );
}

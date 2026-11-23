import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { APP_CONFIG } from "@/config/app";
import { useAppState } from "@/context/AppStateContext";

const NAV_LINKS = [
  { to: "/plans", label: "Plans" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/about", label: "About" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
] as const;

export function PublicLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const { authenticatedUser } = useAppState();

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const workspaceHref = authenticatedUser?.role === "admin" ? "/admin" : "/dashboard";
  const workspaceLabel =
    authenticatedUser?.role === "admin" ? "Admin Console" : "Client Dashboard";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <Logo to="/" />

          {/* Zone 2: 5 clean single-line text nav links */}
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Main navigation">
            {NAV_LINKS.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`relative py-1 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? "text-foreground after:absolute after:inset-x-0 after:-bottom-[19px] after:h-[2px] after:bg-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action + Theme Toggle */}
          <div className="hidden items-center gap-4 shrink-0 lg:flex">
            <ThemeToggle />
            {authenticatedUser ? (
              <Link
                to={workspaceHref}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground whitespace-nowrap shrink-0 transition-colors hover:bg-primary/90"
              >
                {workspaceLabel}
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium text-muted-foreground whitespace-nowrap shrink-0 transition-colors hover:text-foreground"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground whitespace-nowrap shrink-0 transition-colors hover:bg-primary/90"
                >
                  Open Account
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-foreground"
              aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-border bg-card lg:hidden">
            <div className="mx-auto max-w-7xl space-y-1 px-4 py-4">
              {NAV_LINKS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
                {authenticatedUser ? (
                  <Link
                    to={workspaceHref}
                    onClick={() => setMobileOpen(false)}
                    className="col-span-2 inline-flex h-11 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground"
                  >
                    {workspaceLabel}
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={() => setMobileOpen(false)}
                      className="inline-flex h-11 items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground"
                    >
                      Sign In
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setMobileOpen(false)}
                      className="inline-flex h-11 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground"
                    >
                      Open Account
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-2">
              <Logo to="/" />
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Naira-native private wealth and structured investment platform built for transparent
                portfolio reporting and disciplined treasury management.
              </p>
              <p className="text-xs text-muted-foreground">{APP_CONFIG.support.headquarters}</p>
            </div>

            <div>
              <h4 className="text-xs font-semibold tracking-wide text-foreground">Platform</h4>
              <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <Link to="/plans" className="hover:text-foreground">
                    Investment Plans
                  </Link>
                </li>
                <li>
                  <Link to="/how-it-works" className="hover:text-foreground">
                    How It Works
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-foreground">
                    Client Dashboard
                  </Link>
                </li>
                <li>
                  <Link to="/admin" className="hover:text-foreground">
                    Admin Console
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold tracking-wide text-foreground">Company</h4>
              <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <Link to="/about" className="hover:text-foreground">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link to="/faq" className="hover:text-foreground">
                    FAQ
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:text-foreground">
                    Contact Desk
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold tracking-wide text-foreground">Governance</h4>
              <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <Link to="/terms" className="hover:text-foreground">
                    Terms & Conditions
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="hover:text-foreground">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/login" className="hover:text-foreground">
                    Client Sign In
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
            <p className="leading-relaxed">{APP_CONFIG.disclosures.investmentRisk}</p>
            <div className="mt-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <p>
                © {new Date().getFullYear()} {APP_CONFIG.legalName} All rights reserved.
              </p>
              <p>{APP_CONFIG.support.branches.join(" · ")}</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

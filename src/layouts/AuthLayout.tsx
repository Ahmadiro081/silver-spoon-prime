import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { TestEnvironmentBanner } from "@/components/common/TestEnvironmentBanner";
import { SafeImage } from "@/components/common/SafeImage";
import { APP_CONFIG } from "@/config/app";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Left Brand & Editorial Architectural Panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <SafeImage
          src={APP_CONFIG.assets.heroSuite}
          alt="SILVER SPOON private wealth advisory suite"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#08101f] via-[#0f1d36]/80 to-[#0f1d36]/60" />

        <div className="relative z-10">
          <Logo to="/" invert />
        </div>

        <div className="relative z-10 max-w-md space-y-6">
          <h2 className="font-display text-4xl font-medium leading-tight text-white">
            Disciplined Naira wealth architecture for modern Nigerian portfolios.
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">
            Track available liquidity, structured fixed-income mandates, realized earnings, and referral commissions from one institutional ledger.
          </p>
          <div className="grid grid-cols-2 gap-6 border-t border-white/15 pt-6 text-xs text-slate-300">
            <div>
              <p className="font-tabular text-lg font-semibold text-white">₦50,000</p>
              <p className="mt-0.5">Minimum mandate entry</p>
            </div>
            <div>
              <p className="font-tabular text-lg font-semibold text-white">30 – 365 Days</p>
              <p className="mt-0.5">Structured Naira tenors</p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-300">
          {APP_CONFIG.support.branches.join(" · ")} — Simulated Frontend Architecture
        </p>
      </aside>

      {/* Right Authentication Form Panel */}
      <div className="flex flex-col justify-between px-4 py-6 sm:px-10 sm:py-8 lg:px-16">
        <header className="flex items-center justify-between gap-3">
          <div className="lg:hidden">
            <Logo to="/" />
          </div>
          <div className="flex items-center gap-3 lg:w-full lg:justify-between">
            <Link
              to="/"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to Website
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <TestEnvironmentBanner variant="auth" />

        <main id="main-content" tabIndex={-1} className="mx-auto my-8 w-full max-w-md sm:my-10">
          <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-7 sm:mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </main>

        <footer className="text-center text-xs text-muted-foreground lg:text-left">
          Protected client workspace · {APP_CONFIG.legalName}
        </footer>
      </div>
    </div>
  );
}

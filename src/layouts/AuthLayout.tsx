import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
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
      {/* Left Brand & Editorial Architectural Panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
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

        <p className="relative z-10 text-xs text-slate-400">
          {APP_CONFIG.support.branches.join(" · ")} — Simulated Frontend Architecture
        </p>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:px-16">
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <Logo to="/" />
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Website
          </Link>
        </div>

        <div className="mx-auto my-10 w-full max-w-md">
          <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>

        <p className="text-center text-xs text-muted-foreground lg:text-left">
          Protected client workspace · {APP_CONFIG.legalName}
        </p>
      </div>
    </div>
  );
}

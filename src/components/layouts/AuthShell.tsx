import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Logo } from "@/components/brand/Logo";
import { ShieldCheck } from "lucide-react";

export function AuthShell({
  title, subtitle, children, footer,
}: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-2">
        <aside className="hidden flex-col justify-between overflow-hidden bg-gradient-ink p-10 text-primary-foreground lg:flex">
          <Logo invert />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] opacity-70">Private wealth</p>
            <h2 className="font-display mt-3 text-4xl leading-tight">
              Compounded quietly.<br />Withdrawn instantly.
            </h2>
            <p className="mt-4 max-w-sm text-sm text-primary-foreground/80">
              Join 12,486 Nigerians allocating with SILVER SPOON.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs opacity-80">
            <ShieldCheck className="h-4 w-4" /> Bank-grade encryption · Segregated custody
          </div>
        </aside>

        <main className="flex items-center justify-center p-6 sm:p-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md"
          >
            <div className="mb-8 lg:hidden"><Logo /></div>
            <h1 className="font-display text-3xl">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-8 card-premium p-6 sm:p-8">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
            <p className="mt-8 text-center text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">← Back to home</Link>
            </p>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

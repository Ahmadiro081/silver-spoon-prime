import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Wallet, PiggyBank, LineChart as LineIcon, TrendingUp, ArrowDownToLine,
  ArrowUpFromLine, Users, ArrowRight,
} from "lucide-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { growthChart, plans } from "@/lib/mock-data";
import { useWallet } from "@/lib/wallet-store";
import { formatNaira } from "@/lib/format";
import { formatDate } from "@/hooks/useAdminData";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({ meta: [{ title: "Dashboard — SILVER SPOON" }] }),
  component: DashboardHome,
});

function DashboardHome() {
  const wallet = useWallet();
  const stats = [
    { key: "balance",           label: "Wallet balance",     value: wallet.balance,          icon: Wallet,           tone: "ink" as const },
    { key: "available",         label: "Available balance",  value: wallet.available,        icon: PiggyBank },
    { key: "locked",            label: "Active investments", value: wallet.locked,           icon: LineIcon },
    { key: "profit",            label: "Total profit",       value: wallet.profit,           icon: TrendingUp, tone: "success" as const },
    { key: "totalDeposits",     label: "Total deposits",     value: wallet.totalDeposits,    icon: ArrowDownToLine },
    { key: "totalWithdrawals",  label: "Total withdrawals",  value: wallet.totalWithdrawals, icon: ArrowUpFromLine },
    { key: "referralEarnings",  label: "Referral earnings",  value: 96_500,                  icon: Users },
  ];
  return (
    <DashboardLayout title="Good evening, Adaeze">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => {
          const value = s.value;
          const isInk = s.tone === "ink";
          return (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`card-premium p-5 ${isInk ? "bg-gradient-ink text-primary-foreground" : ""}`}
            >
              <div className="flex items-center justify-between">
                <p className={`text-xs uppercase tracking-widest ${isInk ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {s.label}
                </p>
                <s.icon className={`h-4 w-4 ${s.tone === "success" ? "text-success" : ""}`} />
              </div>
              <p className="font-display mt-3 text-2xl">{formatNaira(value)}</p>
              <p className={`mt-1 text-xs ${isInk ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {s.tone === "success" ? "+12.4% vs last month" : "Updated just now"}
              </p>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card-premium p-6 lg:col-span-2">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-display text-xl">Portfolio performance</h2>
              <p className="text-sm text-muted-foreground">Deposits, withdrawals and profit</p>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">Last 7 months</span>
          </div>
          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growthChart}>
                <defs>
                  <linearGradient id="d" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `₦${v/1000}k`} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} formatter={(v: number) => formatNaira(v)} />
                <Area type="monotone" dataKey="deposits" stroke="var(--color-chart-1)" fill="url(#d)" strokeWidth={2} />
                <Area type="monotone" dataKey="profit" stroke="var(--color-chart-3)" fill="url(#p)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium p-6">
          <h2 className="font-display text-xl">Quick actions</h2>
          <p className="text-sm text-muted-foreground">Move money without friction</p>
          <div className="mt-6 space-y-2">
            <Button asChild className="w-full justify-between rounded-full"><Link to="/dashboard/wallet"><span className="flex items-center gap-2"><ArrowDownToLine className="h-4 w-4" /> Deposit</span><ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild variant="outline" className="w-full justify-between rounded-full"><Link to="/dashboard/wallet"><span className="flex items-center gap-2"><ArrowUpFromLine className="h-4 w-4" /> Withdraw</span><ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild variant="outline" className="w-full justify-between rounded-full"><Link to="/dashboard/investments"><span className="flex items-center gap-2"><LineIcon className="h-4 w-4" /> Start investment</span><ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild variant="outline" className="w-full justify-between rounded-full"><Link to="/dashboard/referrals"><span className="flex items-center gap-2"><Users className="h-4 w-4" /> Refer & earn</span><ArrowRight className="h-4 w-4" /></Link></Button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card-premium p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Recent transactions</h2>
            <Button asChild variant="ghost" size="sm"><Link to="/dashboard/transactions">View all <ArrowRight className="h-4 w-4" /></Link></Button>
          </div>
          <div className="mt-4 divide-y divide-border">
            {wallet.transactions.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{t.type}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(t.date)}{t.method ? ` · ${t.method}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${t.type === "Withdrawal" ? "text-destructive" : t.type === "Profit" || t.type === "Referral" ? "text-success" : ""}`}>
                    {t.type === "Withdrawal" ? "−" : "+"}{formatNaira(t.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-premium p-6">
          <h2 className="font-display text-xl">Featured plan</h2>
          <p className="text-sm text-muted-foreground">Handpicked for your risk band</p>
          <div className="mt-6 rounded-2xl bg-gradient-ink p-5 text-primary-foreground">
            <p className="text-xs uppercase tracking-widest opacity-70">{plans[1].tagline}</p>
            <p className="font-display mt-2 text-2xl">{plans[1].name}</p>
            <p className="mt-4 text-3xl font-semibold">{plans[1].roi}</p>
            <p className="text-xs opacity-70">over {plans[1].duration}</p>
            <Button asChild variant="secondary" className="mt-6 w-full rounded-full">
              <Link to="/dashboard/investments">Invest now</Link>
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

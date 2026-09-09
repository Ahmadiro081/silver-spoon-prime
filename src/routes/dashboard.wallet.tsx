import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNaira } from "@/lib/format";
import { useWallet, type WalletState } from "@/lib/wallet-store";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/dashboard/wallet")({
  head: () => ({ meta: [{ title: "Wallet — SILVER SPOON" }] }),
  component: WalletPage,
});

function WalletPage() {
  const wallet = useWallet();
  return (
    <DashboardLayout title="Wallet">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-premium bg-gradient-ink p-6 text-primary-foreground lg:col-span-2">
          <p className="text-xs uppercase tracking-widest opacity-70">Current balance</p>
          <p className="font-display mt-2 text-5xl">{formatNaira(wallet.balance)}</p>
          <div className="mt-8 grid grid-cols-3 gap-4 text-sm">
            <Stat label="Available" value={formatNaira(wallet.available)} />
            <Stat label="Locked" value={formatNaira(wallet.locked)} />
            <Stat label="Profit" value={formatNaira(wallet.profit)} />
          </div>
        </div>
        <div className="card-premium p-6">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Linked bank</p>
          <p className="font-display mt-2 text-xl">GTBank</p>
          <p className="text-sm text-muted-foreground">0123 45**89 · Adaeze O. Okafor</p>
          <Button variant="outline" className="mt-6 w-full rounded-full">Manage bank details</Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <FormCard type="deposit" />
        <FormCard type="withdraw" />
      </div>

      <div className="card-premium mt-6 p-6">
        <Tabs defaultValue="all">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl">Wallet history</h2>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="deposits">Deposits</TabsTrigger>
              <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
              <TabsTrigger value="other">Other</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="all" className="mt-4"><HistoryTable filter={() => true} /></TabsContent>
          <TabsContent value="deposits" className="mt-4"><HistoryTable filter={(t) => t.type === "Deposit"} /></TabsContent>
          <TabsContent value="withdrawals" className="mt-4"><HistoryTable filter={(t) => t.type === "Withdrawal"} /></TabsContent>
          <TabsContent value="other" className="mt-4"><HistoryTable filter={(t) => t.type !== "Deposit" && t.type !== "Withdrawal"} /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest opacity-70">{label}</p>
      <p className="font-display mt-1 text-lg">{value}</p>
    </div>
  );
}

function FormCard({ type }: { type: "deposit" | "withdraw" }) {
  const isDeposit = type === "deposit";
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    toast.success(isDeposit ? "Deposit initiated" : "Withdrawal requested", {
      description: isDeposit ? "Funds will reflect once payment clears." : "Your bank will be credited within 15 minutes.",
    });
    (e.target as HTMLFormElement).reset();
  };
  return (
    <form onSubmit={onSubmit} className="card-premium p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-ink text-primary-foreground">
          {isDeposit ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
        </span>
        <div>
          <h3 className="font-display text-lg">{isDeposit ? "Deposit" : "Withdraw"}</h3>
          <p className="text-xs text-muted-foreground">{isDeposit ? "Fund your wallet" : "Send to your bank"}</p>
        </div>
      </div>
      <div className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label>Amount (₦)</Label>
          <Input type="number" min={1000} step={1000} required placeholder="₦ 100,000" />
        </div>
        <div className="space-y-1.5">
          <Label>{isDeposit ? "Method" : "Destination"}</Label>
          <Select defaultValue={isDeposit ? "transfer" : "gtbank"}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {isDeposit ? (
                <>
                  <SelectItem value="transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Debit Card</SelectItem>
                  <SelectItem value="ussd">USSD</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="gtbank">GTBank ****4521</SelectItem>
                  <SelectItem value="access">Access ****9012</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="w-full rounded-full">{isDeposit ? "Confirm deposit" : "Request withdrawal"}</Button>
      </div>
    </form>
  );
}

function HistoryTable({ filter }: { filter: (t: (typeof transactions)[number]) => boolean }) {
  const rows = transactions.filter(filter);
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-xs uppercase tracking-widest text-muted-foreground">
          <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Method</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-left">Status</th></tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-border">
              <td className="px-4 py-3">{t.date}</td>
              <td className="px-4 py-3">{t.type}</td>
              <td className="px-4 py-3 text-muted-foreground">{t.method}</td>
              <td className="px-4 py-3 text-right font-medium">{formatNaira(t.amount)}</td>
              <td className="px-4 py-3"><StatusBadge s={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const tone = s === "Completed" ? "bg-success/15 text-success" : s === "Pending" ? "bg-warning/20 text-warning-foreground" : "bg-destructive/15 text-destructive";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{s}</span>;
}

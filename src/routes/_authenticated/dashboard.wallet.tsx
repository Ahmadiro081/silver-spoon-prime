import { createFileRoute, Link } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNaira } from "@/lib/format";
import { useWallet } from "@/lib/wallet-store";
import type { Transaction } from "@/lib/wallet-store";
import { formatDate } from "@/hooks/useAdminData";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startDeposit, confirmDeposit } from "@/lib/payments.functions";

export const Route = createFileRoute("/_authenticated/dashboard/wallet")({
  head: () => ({ meta: [{ title: "Wallet — SILVER SPOON" }] }),
  component: WalletPage,
});

function WalletPage() {
  const wallet = useWallet();
  const confirm = useServerFn(confirmDeposit);
  const handled = useRef(false);

  // Paystack sends the customer back here with ?reference=...
  useEffect(() => {
    if (handled.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") ?? params.get("trxref");
    if (!reference) return;
    handled.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    void (async () => {
      try {
        const res = await confirm({ data: { reference } });
        if (res.ok) {
          await wallet.refresh();
          toast.success("Payment received", { description: "Your wallet has been credited." });
        } else {
          toast.error("Payment not completed", { description: res.error });
        }
      } catch {
        toast.error("Could not confirm the payment", { description: "Please refresh in a moment." });
      }
    })();
  }, [confirm, wallet]);

  const bank = wallet.profile;

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
          {bank?.account_number ? (
            <>
              <p className="font-display mt-2 text-xl">{bank.bank_name ?? "Bank account"}</p>
              <p className="text-sm text-muted-foreground">
                {bank.account_number} · {bank.account_name ?? bank.full_name}
              </p>
            </>
          ) : (
            <>
              <p className="font-display mt-2 text-xl">Not set up</p>
              <p className="text-sm text-muted-foreground">Add your bank account to receive payouts.</p>
            </>
          )}
          <Button asChild variant="outline" className="mt-6 w-full rounded-full">
            <Link to="/dashboard/profile">{bank?.account_number ? "Manage bank details" : "Add bank details"}</Link>
          </Button>
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
          <TabsContent value="all" className="mt-4"><HistoryTable filter={() => true} txns={wallet.transactions} /></TabsContent>
          <TabsContent value="deposits" className="mt-4"><HistoryTable filter={(t) => t.type === "Deposit"} txns={wallet.transactions} /></TabsContent>
          <TabsContent value="withdrawals" className="mt-4"><HistoryTable filter={(t) => t.type === "Withdrawal"} txns={wallet.transactions} /></TabsContent>
          <TabsContent value="other" className="mt-4"><HistoryTable filter={(t) => t.type !== "Deposit" && t.type !== "Withdrawal"} txns={wallet.transactions} /></TabsContent>
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
  const wallet = useWallet();
  const pay = useServerFn(startDeposit);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const bank = wallet.profile;
  const destination = bank?.account_number
    ? `${bank.bank_name ?? "Bank"} ${bank.account_number}`
    : "";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Math.floor(Number(amount));
    if (!Number.isFinite(value) || value < 1000) {
      toast.error("Enter a valid amount", { description: "Minimum amount is ₦1,000." });
      return;
    }
    setBusy(true);

    if (isDeposit) {
      try {
        const res = await pay({ data: { amount: value, origin: window.location.origin } });
        if (!res.ok || !res.url) {
          toast.error("Could not start the payment", { description: res.error ?? "Please try again." });
          setBusy(false);
          return;
        }
        window.location.href = res.url;
        return;
      } catch (err) {
        toast.error("Could not start the payment", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
        setBusy(false);
        return;
      }
    }

    if (!destination) {
      toast.error("Add your bank account first", { description: "We need it to send your money." });
      setBusy(false);
      return;
    }
    const res = await wallet.withdraw(value, destination);
    setBusy(false);
    if (!res.ok) {
      toast.error("Withdrawal failed", { description: res.error ?? "Please try again." });
      return;
    }
    toast.success("Withdrawal requested", {
      description: `${formatNaira(value)} is awaiting payout approval.`,
    });
    setAmount("");
  };

  return (
    <form onSubmit={onSubmit} className="card-premium p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-ink text-primary-foreground">
          {isDeposit ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
        </span>
        <div>
          <h3 className="font-display text-lg">{isDeposit ? "Deposit" : "Withdraw"}</h3>
          <p className="text-xs text-muted-foreground">
            {isDeposit ? "Pay securely by card, transfer or USSD" : "Send to your saved bank account"}
          </p>
        </div>
      </div>
      <div className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label>Amount (₦)</Label>
          <Input type="number" min={1000} step={1000} required placeholder="₦ 100,000" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{isDeposit ? "Payment" : "Destination"}</Label>
          <div className="rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-sm text-muted-foreground">
            {isDeposit ? "Card · Bank transfer · USSD" : destination || "No bank account saved yet"}
          </div>
        </div>
        <Button type="submit" disabled={busy} className="w-full rounded-full">
          {busy ? "Please wait…" : isDeposit ? "Continue to payment" : "Request withdrawal"}
        </Button>
      </div>
    </form>
  );
}

function HistoryTable({ filter, txns }: { filter: (t: Transaction) => boolean; txns: Transaction[] }) {
  const rows = txns.filter(filter);
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-xs uppercase tracking-widest text-muted-foreground">
          <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Method</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-left">Status</th></tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-border">
              <td className="px-4 py-3">{formatDate(t.date)}</td>
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

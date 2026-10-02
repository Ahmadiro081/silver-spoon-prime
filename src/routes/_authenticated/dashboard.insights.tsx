import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Sparkles, ArrowDownLeft, ArrowUpRight, Minus, Loader2, Lightbulb } from "lucide-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { analyzeTransaction, type CashflowInsight } from "@/lib/cashflow-ai.functions";
import { formatNaira } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard/insights")({
  head: () => ({
    meta: [
      { title: "AI Cash Flow Insights — SILVER SPOON" },
      { name: "description", content: "Describe a transaction and get an instant category and cash flow explanation." },
      { property: "og:title", content: "AI Cash Flow Insights — SILVER SPOON" },
      { property: "og:description", content: "Categorize transactions and understand their impact on your cash flow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InsightsPage,
});

function InsightsPage() {
  const analyze = useServerFn(analyzeTransaction);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ insight: CashflowInsight; description: string; amount?: number } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || description.trim().length < 3) return;
    setLoading(true);
    setError(null);
    const amt = amount ? Number(amount) : undefined;
    try {
      const r = await analyze({ data: { description, amount: amt && amt > 0 ? amt : undefined } });
      if (r.ok) setResult({ insight: r.insight, description, amount: amt });
      else setError(r.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const dir = result?.insight.direction;
  const DirIcon = dir === "inflow" ? ArrowDownLeft : dir === "outflow" ? ArrowUpRight : Minus;
  const dirClass = dir === "inflow" ? "bg-success/15 text-success" : dir === "outflow" ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground";

  return (
    <DashboardLayout title="AI cash flow insights">
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="card-premium space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg">Describe a transaction</h2>
          </div>
          <p className="text-sm text-muted-foreground">e.g. "Paid DSTV subscription" or "Received freelance payment from client".</p>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={4} placeholder="What was this transaction for?" />
          <Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount in ₦ (optional)" />
          <Button type="submit" disabled={loading || description.trim().length < 3} className="w-full">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing…</> : "Analyze"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        <div className="card-premium p-6">
          {!result && !loading && (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <Sparkles className="mb-3 h-8 w-8 opacity-50" />
              Your category and cash flow explanation will appear here.
            </div>
          )}
          {loading && !result && (
            <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Thinking…
            </div>
          )}
          {result && (
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Result</p>
              <p className="text-sm text-muted-foreground">"{result.description}"{result.amount ? ` · ${formatNaira(result.amount)}` : ""}</p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{result.insight.category}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium capitalize ${dirClass}`}>
                  <DirIcon className="h-3.5 w-3.5" />{result.insight.direction}
                </span>
                <span className="rounded-full bg-secondary px-3 py-1 text-sm">{result.insight.essential ? "Essential" : "Discretionary"}</span>
              </div>
              <div>
                <h3 className="mb-1 font-medium">Effect on your cash flow</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{result.insight.explanation}</p>
              </div>
              <div className="flex gap-2 rounded-xl border border-border p-3 text-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{result.insight.tip}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

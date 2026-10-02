import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { summarizeCashflow } from "@/lib/cashflow-ai.functions";
import { useWallet } from "@/lib/wallet-store";

export function CashflowExplainer() {
  const wallet = useWallet();
  const summarize = useServerFn(summarizeCashflow);
  const key = wallet.transactions.map((t) => `${t.id}:${t.status}`).join("|");
  const q = useQuery({
    queryKey: ["cashflow-summary", key],
    queryFn: () => summarize(),
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const s = q.data?.ok ? q.data.summary : null;
  const TrendIcon = s?.trend === "growing" ? TrendingUp : s?.trend === "shrinking" ? TrendingDown : Minus;
  const trendClass = s?.trend === "growing" ? "text-success" : s?.trend === "shrinking" ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="card-premium flex flex-col p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Why your money moved
        </p>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => q.refetch()} disabled={q.isFetching} aria-label="Refresh explanation">
          <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {q.isLoading ? (
        <div className="flex flex-1 items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading your activity…</div>
      ) : q.data && !q.data.ok ? (
        <p className="mt-3 text-sm text-destructive">{q.data.error}</p>
      ) : q.isError ? (
        <p className="mt-3 text-sm text-destructive">Couldn't load the explanation.</p>
      ) : !s ? (
        <p className="mt-3 text-sm text-muted-foreground">Make your first deposit and we'll explain how your money is moving.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="flex gap-2 text-sm font-medium"><TrendIcon className={`mt-0.5 h-4 w-4 shrink-0 ${trendClass}`} />{s.headline}</p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {s.drivers.map((d, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span>{d}</li>)}
          </ul>
          <p className="rounded-lg bg-secondary p-2.5 text-xs">{s.advice}</p>
        </div>
      )}
    </div>
  );
}

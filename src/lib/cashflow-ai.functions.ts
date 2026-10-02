import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { streamStructured } from "./ai-gateway.server";

export type CashflowInsight = {
  category: string;
  direction: "inflow" | "outflow" | "neutral";
  essential: boolean;
  explanation: string;
  tip: string;
};

export type CashflowSummary = {
  headline: string;
  trend: "growing" | "shrinking" | "steady";
  drivers: string[];
  advice: string;
};

const insightSchema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "direction", "essential", "explanation", "tip"],
  properties: {
    category: { type: "string" },
    direction: { type: "string", enum: ["inflow", "outflow", "neutral"] },
    essential: { type: "boolean" },
    explanation: { type: "string", description: "2-3 sentences on cash flow effect" },
    tip: { type: "string" },
  },
};

const summarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "trend", "drivers", "advice"],
  properties: {
    headline: { type: "string", description: "One sentence on why the balance is where it is" },
    trend: { type: "string", enum: ["growing", "shrinking", "steady"] },
    drivers: { type: "array", items: { type: "string" }, description: "2-4 short bullet points on what moved money" },
    advice: { type: "string", description: "One short practical tip" },
  },
};

export const analyzeTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ description: z.string().trim().min(3).max(500), amount: z.number().positive().max(1e12).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const r = await streamStructured<CashflowInsight>({
      instructions:
        "You are a personal finance assistant for a Nigerian user. Categorize the transaction and explain its effect on their cash flow in plain, friendly language. Use Naira (₦). Keep it brief.",
      input: `Transaction: ${data.description}${data.amount ? `\nAmount: ₦${data.amount.toLocaleString("en-NG")}` : ""}`,
      name: "cashflow_insight",
      schema: insightSchema,
    });
    return r.ok ? { ok: true as const, insight: r.value } : { ok: false as const, error: r.error };
  });

export const summarizeCashflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: txns } = await context.supabase
      .from("transactions")
      .select("type, amount, status, method, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(40);
    const { data: invs } = await context.supabase
      .from("investments")
      .select("plan_name, amount, status, matures_at")
      .eq("user_id", context.userId)
      .limit(20);
    if (!txns?.length && !invs?.length) return { ok: true as const, summary: null };
    const lines = (txns ?? []).map(
      (t) => `${t.created_at.slice(0, 10)} ${t.type} ₦${Number(t.amount).toLocaleString("en-NG")} ${t.status}${t.method ? ` via ${t.method}` : ""}`,
    );
    const invLines = (invs ?? []).map((i) => `${i.plan_name} ₦${Number(i.amount).toLocaleString("en-NG")} ${i.status}, matures ${i.matures_at.slice(0, 10)}`);
    const r = await streamStructured<CashflowSummary>({
      instructions:
        "You explain a Nigerian investor's wallet cash flow in plain, friendly language. Explain why their money is moving: what came in, what went out, what's locked in investments, and what's pending. Use Naira (₦). Be concise.",
      input: `Transactions (newest first):\n${lines.join("\n") || "none"}\n\nInvestments:\n${invLines.join("\n") || "none"}`,
      name: "cashflow_summary",
      schema: summarySchema,
    });
    return r.ok ? { ok: true as const, summary: r.value } : { ok: false as const, error: r.error };
  });

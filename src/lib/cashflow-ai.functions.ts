import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CashflowInsight = {
  category: string;
  direction: "inflow" | "outflow" | "neutral";
  essential: boolean;
  explanation: string;
  tip: string;
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "direction", "essential", "explanation", "tip"],
  properties: {
    category: { type: "string", description: "Short category, e.g. Groceries, Salary, Rent, Transport, Utilities, Entertainment, Savings, Investment, Transfer" },
    direction: { type: "string", enum: ["inflow", "outflow", "neutral"] },
    essential: { type: "boolean", description: "True if a necessity" },
    explanation: { type: "string", description: "2-3 sentences on how this affects the user's cash flow" },
    tip: { type: "string", description: "One practical, short tip" },
  },
};

export const analyzeTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ description: z.string().trim().min(3).max(500), amount: z.number().positive().max(1e12).optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; insight: CashflowInsight } | { ok: false; error: string }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, error: "AI is not configured." };

    const userText = `Transaction: ${data.description}${data.amount ? `\nAmount: ₦${data.amount.toLocaleString("en-NG")}` : ""}`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        instructions:
          "You are a personal finance assistant for a Nigerian user. Categorize the transaction and explain its effect on their cash flow in plain, friendly language. Use Naira (₦). Keep it brief.",
        input: userText,
        text: { format: { type: "json_schema", name: "cashflow_insight", strict: true, schema } },
      }),
    });

    if (!res.ok || !res.body) {
      if (res.status === 429) return { ok: false, error: "Too many requests right now. Please try again in a moment." };
      if (res.status === 402) return { ok: false, error: "AI credits are used up. Please top up to continue." };
      if (res.status === 403) return { ok: false, error: "AI access is currently unavailable for this workspace." };
      return { ok: false, error: "Couldn't analyze this transaction. Please try again." };
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    let refused = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload);
            if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
            else if (ev.type === "response.refusal.delta") refused = true;
            else if (ev.type === "response.failed" || ev.type === "error") return { ok: false, error: "The AI couldn't complete this request." };
          } catch { /* partial */ }
        }
      }
    }
    if (refused) return { ok: false, error: "The AI declined to analyze this description." };
    try {
      return { ok: true, insight: JSON.parse(text) as CashflowInsight };
    } catch {
      return { ok: false, error: "The AI returned an unexpected answer. Please try again." };
    }
  });

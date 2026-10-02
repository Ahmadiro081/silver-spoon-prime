// Server-only: streams a structured Responses call and returns parsed JSON.
export async function streamStructured<T>(opts: {
  instructions: string;
  input: string;
  name: string;
  schema: Record<string, unknown>;
}): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { ok: false, error: "AI is not configured." };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      instructions: opts.instructions,
      input: opts.input,
      text: { format: { type: "json_schema", name: opts.name, strict: true, schema: opts.schema } },
    }),
  });
  if (!res.ok || !res.body) {
    if (res.status === 429) return { ok: false, error: "Too many requests right now. Please try again in a moment." };
    if (res.status === 402) return { ok: false, error: "AI credits are used up. Please top up to continue." };
    if (res.status === 403) return { ok: false, error: "AI access is currently unavailable for this workspace." };
    return { ok: false, error: "The AI couldn't complete this request. Please try again." };
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
          else if (ev.type === "response.failed" || ev.type === "error")
            return { ok: false, error: "The AI couldn't complete this request." };
        } catch { /* partial frame */ }
      }
    }
  }
  if (refused) return { ok: false, error: "The AI declined this request." };
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: "The AI returned an unexpected answer. Please try again." };
  }
}

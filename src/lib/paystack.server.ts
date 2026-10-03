// Server-only Paystack helpers. Never import from client code.
const BASE = "https://api.paystack.co";

function secretKey() {
  const key = process.env["PAYSTACK_SECRET_KEY"] ?? process.env["STRIPE_LIVE_API_KEY"];
  if (!key) throw new Error("Paystack is not configured yet.");
  return key;
}

export async function paystack<T = any>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; message: string; data: T | null }> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: T;
  };
  return {
    ok: res.ok && json.status !== false,
    message: json.message ?? `Paystack request failed (${res.status})`,
    data: (json.data ?? null) as T | null,
  };
}

export type Bank = { name: string; code: string };

export async function listNigerianBanks(): Promise<Bank[]> {
  const res = await paystack<Bank[]>("/bank?country=nigeria&perPage=100");
  return (res.data ?? []).map((b) => ({ name: b.name, code: b.code }));
}

export async function initializeCheckout(params: {
  email: string;
  amountNaira: number;
  reference: string;
  callbackUrl: string;
}) {
  return paystack<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: {
      email: params.email,
      amount: Math.round(params.amountNaira * 100),
      reference: params.reference,
      callback_url: params.callbackUrl,
      currency: "NGN",
    },
  });
}

export async function verifyCharge(reference: string) {
  return paystack<{ status: string; amount: number; reference: string }>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
}

export async function createTransferRecipient(params: {
  name: string;
  accountNumber: string;
  bankCode: string;
}) {
  return paystack<{ recipient_code: string }>("/transferrecipient", {
    method: "POST",
    body: {
      type: "nuban",
      name: params.name,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: "NGN",
    },
  });
}

export async function initiateTransfer(params: {
  recipientCode: string;
  amountNaira: number;
  reference: string;
  reason: string;
}) {
  return paystack<{ status: string; transfer_code: string; reference: string }>("/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: Math.round(params.amountNaira * 100),
      recipient: params.recipientCode,
      reference: params.reference,
      reason: params.reason,
    },
  });
}

/** sha256 of the Paystack secret — proves to the database that the caller is this app's server. */
export async function serverTokenHash() {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(secretKey()).digest("hex");
}

/** Lets an admin session register this server's proof with the database. */
export async function syncServerToken(supabase: { rpc: (...a: any[]) => any }) {
  try {
    await supabase.rpc("sync_server_token", { p_hash: await serverTokenHash() });
  } catch {
    /* payments not configured yet */
  }
}

/** Marks a payment Completed/Failed by Paystack reference without the master database key. */
export async function serverSetTxnStatus(ref: string, status: "Completed" | "Failed") {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { error } = await client.rpc("server_set_txn_status" as never, {
    p_token: secretKey(),
    p_ref: ref,
    p_status: status,
  } as never);
  if (error) throw new Error("Could not update payment status.");
}

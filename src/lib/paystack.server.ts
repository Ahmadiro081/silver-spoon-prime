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

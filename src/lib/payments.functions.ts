import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeWallet, type DbInvestment, type DbTransaction } from "@/lib/account.functions";

export type BankOption = { name: string; code: string };

/** Public list of Nigerian banks for the payout form. */
export const getBanks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<BankOption[]> => {
    const { listNigerianBanks } = await import("@/lib/paystack.server");
    try {
      return await listNigerianBanks();
    } catch {
      return [];
    }
  });

/** Starts a real card/bank payment and returns the Paystack checkout link. */
export const startDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { amount: number; origin: string }) =>
    z
      .object({ amount: z.number().finite().min(1000), origin: z.string().url() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const email = (claims as { email?: string })?.email;
    if (!email) return { ok: false as const, error: "No email on this account." };

    const reference = `SSP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      type: "Deposit",
      amount: data.amount,
      status: "Pending",
      method: "Paystack",
      provider: "paystack",
      provider_ref: reference,
    });
    if (error) throw new Error(error.message);

    const { initializeCheckout } = await import("@/lib/paystack.server");
    let res;
    try {
      res = await initializeCheckout({
        email,
        amountNaira: data.amount,
        reference,
        callbackUrl: `${data.origin}/dashboard/wallet`,
      });
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Payment setup failed." };
    }
    if (!res.ok || !res.data?.authorization_url) {
      return { ok: false as const, error: res.message };
    }
    return { ok: true as const, url: res.data.authorization_url, reference };
  });

/** Confirms a payment after the customer returns from Paystack. */
export const confirmDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reference: string }) =>
    z.object({ reference: z.string().min(4).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: txn } = await supabase
      .from("transactions")
      .select("*")
      .eq("provider_ref", data.reference)
      .eq("user_id", userId)
      .maybeSingle();
    if (!txn) return { ok: false as const, error: "Payment not found." };
    if (txn.status === "Completed") return { ok: true as const, status: "Completed" as const };

    const { verifyCharge } = await import("@/lib/paystack.server");
    const res = await verifyCharge(data.reference);
    const paid = res.ok && res.data?.status === "success";
    if (!paid) return { ok: false as const, error: "Payment was not completed." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("transactions")
      .update({ status: "Completed" })
      .eq("id", txn.id);
    if (error) throw new Error(error.message);
    return { ok: true as const, status: "Completed" as const };
  });

/** Admin: actually sends a pending withdrawal to the customer's bank account. */
export const payoutWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden: admin access required.");

    const { data: txn, error: readError } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!txn) return { ok: false as const, error: "Withdrawal not found." };
    if (txn.type !== "Withdrawal") return { ok: false as const, error: "Not a withdrawal." };
    if (txn.status !== "Pending") return { ok: false as const, error: "This request was already reviewed." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", txn.user_id)
      .maybeSingle();
    if (!profile?.account_number || !profile?.bank_code) {
      return { ok: false as const, error: "Customer has not saved a valid bank account yet." };
    }

    // Re-check the customer can still cover this payout.
    const [txnRes, invRes] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", txn.user_id),
      supabase.from("investments").select("*").eq("user_id", txn.user_id),
    ]);
    const wallet = computeWallet(
      (txnRes.data ?? []) as DbTransaction[],
      (invRes.data ?? []) as DbInvestment[],
    );
    if (wallet.available < 0) {
      return { ok: false as const, error: "Customer balance no longer covers this payout." };
    }

    const { createTransferRecipient, initiateTransfer } = await import("@/lib/paystack.server");
    let recipientCode: string;
    try {
      const recipient = await createTransferRecipient({
        name: profile.account_name || profile.full_name || profile.email,
        accountNumber: profile.account_number,
        bankCode: profile.bank_code,
      });
      if (!recipient.ok || !recipient.data?.recipient_code) {
        return { ok: false as const, error: recipient.message };
      }
      recipientCode = recipient.data.recipient_code;
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Payout setup failed." };
    }

    const reference = `SSW-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const transfer = await initiateTransfer({
      recipientCode,
      amountNaira: Number(txn.amount),
      reference,
      reason: "SILVER SPOON withdrawal",
    });
    if (!transfer.ok) return { ok: false as const, error: transfer.message };

    const status = transfer.data?.status === "success" ? "Completed" : "Pending";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await supabaseAdmin
      .from("transactions")
      .update({
        status,
        provider: "paystack",
        provider_ref: transfer.data?.transfer_code ?? reference,
        note: status === "Completed" ? "Paid out via Paystack" : "Payout sent, awaiting bank confirmation",
      })
      .eq("id", txn.id);
    if (updateError) throw new Error(updateError.message);

    return { ok: true as const, status };
  });

export const resolveBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ account_number: z.string().regex(/^\d{10}$/), bank_code: z.string().min(2).max(10) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { paystack } = await import("./paystack.server");
    const res = await paystack<{ account_name: string }>(
      `/bank/resolve?account_number=${data.account_number}&bank_code=${encodeURIComponent(data.bank_code)}`,
    );
    if (!res.ok || !res.data?.account_name) return { ok: false as const, error: "We couldn't verify this account. Check the number and bank." };
    return { ok: true as const, account_name: res.data.account_name };
  });

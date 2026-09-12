import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { plans } from "@/lib/mock-data";

export type DbTransaction = {
  id: string;
  user_id: string;
  type: "Deposit" | "Withdrawal" | "Investment" | "Profit" | "Referral";
  amount: number;
  status: "Pending" | "Completed" | "Failed";
  method: string | null;
  note: string | null;
  created_at: string;
};

export type DbInvestment = {
  id: string;
  plan_id: string;
  plan_name: string;
  amount: number;
  roi_percent: number;
  status: "Active" | "Matured" | "Cancelled";
  started_at: string;
  matures_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  referral_code: string;
  status: string;
  created_at: string;
};

export type AccountSnapshot = {
  profile: Profile | null;
  isAdmin: boolean;
  transactions: DbTransaction[];
  investments: DbInvestment[];
  wallet: {
    balance: number;
    available: number;
    locked: number;
    profit: number;
    totalDeposits: number;
    totalWithdrawals: number;
    referralEarnings: number;
  };
};

const num = (v: unknown) => Number(v ?? 0);

export function computeWallet(txns: DbTransaction[], investments: DbInvestment[]) {
  let deposits = 0, withdrawals = 0, pendingWithdrawals = 0, profit = 0, referral = 0, invested = 0;
  for (const t of txns) {
    const amount = num(t.amount);
    if (t.status === "Failed") continue;
    if (t.type === "Deposit" && t.status === "Completed") deposits += amount;
    if (t.type === "Withdrawal" && t.status === "Completed") withdrawals += amount;
    if (t.type === "Withdrawal" && t.status === "Pending") pendingWithdrawals += amount;
    if (t.type === "Profit" && t.status === "Completed") profit += amount;
    if (t.type === "Referral" && t.status === "Completed") referral += amount;
    if (t.type === "Investment" && t.status === "Completed") invested += amount;
  }
  const locked = investments
    .filter((i) => i.status === "Active")
    .reduce((sum, i) => sum + num(i.amount), 0);
  void invested;
  // Only active investments hold money; matured/cancelled principal returns to available.
  const available = deposits + profit + referral - withdrawals - pendingWithdrawals - locked;
  return {
    balance: available + locked,
    available,
    locked,
    profit,
    totalDeposits: deposits,
    totalWithdrawals: withdrawals,
    referralEarnings: referral,
  };
}

export const getAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountSnapshot> => {
    const { supabase, userId } = context;
    const [profileRes, txnRes, invRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("investments").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    const transactions = ((txnRes.data ?? []) as DbTransaction[]).map((t) => ({ ...t, amount: num(t.amount) }));
    const investments = ((invRes.data ?? []) as DbInvestment[]).map((i) => ({ ...i, amount: num(i.amount) }));
    return {
      profile: (profileRes.data as Profile | null) ?? null,
      isAdmin: Boolean(roleRes.data),
      transactions,
      investments,
      wallet: computeWallet(transactions, investments),
    };
  });

const amountSchema = z.number().finite().min(1000);

export const createDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { amount: number; method: string }) =>
    z.object({ amount: amountSchema, method: z.string().min(1).max(60) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("transactions").insert({
      user_id: context.userId,
      type: "Deposit",
      amount: data.amount,
      status: "Pending",
      method: data.method,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { amount: number; method: string }) =>
    z.object({ amount: amountSchema, method: z.string().min(1).max(60) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [txnRes, invRes] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", userId),
      supabase.from("investments").select("*").eq("user_id", userId),
    ]);
    const wallet = computeWallet((txnRes.data ?? []) as DbTransaction[], (invRes.data ?? []) as DbInvestment[]);
    if (data.amount > wallet.available) {
      return { ok: false as const, error: "Insufficient available balance." };
    }
    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      type: "Withdrawal",
      amount: data.amount,
      status: "Pending",
      method: data.method,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const createInvestment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; amount: number }) =>
    z.object({ planId: z.string().min(1), amount: amountSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const plan = plans.find((p) => p.id === data.planId);
    if (!plan) return { ok: false as const, error: "Unknown plan." };
    if (data.amount < plan.min) {
      return { ok: false as const, error: `Minimum for ${plan.name} is ₦${plan.min.toLocaleString()}.` };
    }
    const [txnRes, invRes] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", userId),
      supabase.from("investments").select("*").eq("user_id", userId),
    ]);
    const wallet = computeWallet((txnRes.data ?? []) as DbTransaction[], (invRes.data ?? []) as DbInvestment[]);
    if (data.amount > wallet.available) {
      return { ok: false as const, error: "Insufficient available balance." };
    }
    const days = Number(plan.duration.replace(/\D/g, "")) || 30;
    const matures = new Date(Date.now() + days * 86_400_000).toISOString();
    const { error: invError } = await supabase.from("investments").insert({
      user_id: userId,
      plan_id: plan.id,
      plan_name: plan.name,
      amount: data.amount,
      roi_percent: Number(plan.roi.replace(/[^\d.]/g, "")) || 0,
      matures_at: matures,
    });
    if (invError) throw new Error(invError.message);
    const { error: txnError } = await supabase.from("transactions").insert({
      user_id: userId,
      type: "Investment",
      amount: data.amount,
      status: "Completed",
      method: plan.name,
    });
    if (txnError) throw new Error(txnError.message);
    return { ok: true as const };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, unknown>) =>
    z
      .object({
        full_name: z.string().max(120).optional(),
        phone: z.string().max(40).optional(),
        bank_name: z.string().max(80).optional(),
        account_number: z.string().max(20).optional(),
        account_name: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("profiles").update(data).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

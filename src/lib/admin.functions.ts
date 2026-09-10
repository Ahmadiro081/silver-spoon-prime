import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeWallet, type DbInvestment, type DbTransaction, type Profile } from "@/lib/account.functions";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  joined: string;
  balance: number;
  invested: number;
  deposits: number;
  withdrawals: number;
};

export type AdminOverview = {
  kpis: {
    users: number;
    aum: number;
    monthlyRevenue: number;
    pendingWithdrawals: number;
    pendingWithdrawalValue: number;
    totalDeposits: number;
    totalWithdrawals: number;
  };
  monthly: { month: string; deposits: number; withdrawals: number; profit: number }[];
  userGrowth: { month: string; users: number }[];
  revenueBreakdown: { name: string; value: number }[];
  users: AdminUserRow[];
  transactions: (DbTransaction & { user_name: string; user_email: string })[];
  investments: (DbInvestment & { user_id: string; user_name: string })[];
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const num = (v: unknown) => Number(v ?? 0);

function lastMonths(count: number) {
  const now = new Date();
  const out: { key: string; month: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTH_LABELS[d.getMonth()]! });
  }
  return out;
}

const monthKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
};

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: admin access required.");
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const [profileRes, txnRes, invRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("transactions").select("*").order("created_at", { ascending: false }),
      supabase.from("investments").select("*").order("created_at", { ascending: false }),
    ]);

    const profiles = (profileRes.data ?? []) as Profile[];
    const txns = ((txnRes.data ?? []) as DbTransaction[]).map((t) => ({ ...t, amount: num(t.amount) }));
    const invs = ((invRes.data ?? []) as (DbInvestment & { user_id: string })[]).map((i) => ({
      ...i,
      amount: num(i.amount),
    }));

    const byUser = new Map<string, Profile>(profiles.map((p) => [p.id, p]));
    const nameFor = (id: string) => byUser.get(id)?.full_name || byUser.get(id)?.email || "Unknown user";

    const users: AdminUserRow[] = profiles.map((p) => {
      const userTxns = txns.filter((t) => t.user_id === p.id);
      const userInvs = invs.filter((i) => i.user_id === p.id);
      const wallet = computeWallet(userTxns, userInvs);
      return {
        id: p.id,
        name: p.full_name || p.email,
        email: p.email,
        status: p.status,
        joined: p.created_at,
        balance: wallet.balance,
        invested: wallet.locked,
        deposits: wallet.totalDeposits,
        withdrawals: wallet.totalWithdrawals,
      };
    });

    const months = lastMonths(7);
    const monthly = months.map(({ key, month }) => {
      const inMonth = txns.filter((t) => monthKey(t.created_at) === key && t.status !== "Failed");
      return {
        month,
        deposits: inMonth.filter((t) => t.type === "Deposit").reduce((s, t) => s + t.amount, 0),
        withdrawals: inMonth.filter((t) => t.type === "Withdrawal").reduce((s, t) => s + t.amount, 0),
        profit: inMonth.filter((t) => t.type === "Profit").reduce((s, t) => s + t.amount, 0),
      };
    });

    const userGrowth = months.map(({ key, month }, index) => {
      const cutoff = new Date();
      const parts = key.split("-").map(Number);
      const end = new Date(parts[0]!, parts[1]! + 1, 1);
      const total = profiles.filter((p) => new Date(p.created_at) < (index === months.length - 1 ? cutoff : end)).length;
      return { month, users: total };
    });

    const planTotals = new Map<string, number>();
    for (const inv of invs) planTotals.set(inv.plan_name, (planTotals.get(inv.plan_name) ?? 0) + inv.amount);
    const planSum = [...planTotals.values()].reduce((s, v) => s + v, 0);
    const revenueBreakdown = [...planTotals.entries()].map(([name, value]) => ({
      name,
      value: planSum ? Math.round((value / planSum) * 100) : 0,
    }));

    const pending = txns.filter((t) => t.type === "Withdrawal" && t.status === "Pending");
    const thisMonthKey = monthKey(new Date().toISOString());

    return {
      kpis: {
        users: profiles.length,
        aum: users.reduce((s, u) => s + u.balance, 0),
        monthlyRevenue: txns
          .filter((t) => t.type === "Deposit" && t.status === "Completed" && monthKey(t.created_at) === thisMonthKey)
          .reduce((s, t) => s + t.amount, 0),
        pendingWithdrawals: pending.length,
        pendingWithdrawalValue: pending.reduce((s, t) => s + t.amount, 0),
        totalDeposits: txns.filter((t) => t.type === "Deposit" && t.status === "Completed").reduce((s, t) => s + t.amount, 0),
        totalWithdrawals: txns.filter((t) => t.type === "Withdrawal" && t.status === "Completed").reduce((s, t) => s + t.amount, 0),
      },
      monthly,
      userGrowth,
      revenueBreakdown,
      users,
      transactions: txns.map((t) => ({
        ...t,
        user_name: nameFor(t.user_id),
        user_email: byUser.get(t.user_id)?.email ?? "",
      })),
      investments: invs.map((i) => ({ ...i, user_name: nameFor(i.user_id) })),
    };
  });

export const reviewTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string; note?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["Completed", "Failed", "Pending"]),
        note: z.string().max(240).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("transactions")
      .update({ status: data.status, note: data.note ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; status: string }) =>
    z.object({ userId: z.string().uuid(), status: z.enum(["Active", "Suspended"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("profiles").update({ status: data.status }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

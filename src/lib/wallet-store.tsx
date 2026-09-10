// Live wallet state backed by the Lovable Cloud backend.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  getAccount,
  createDeposit,
  requestWithdrawal,
  createInvestment,
  type AccountSnapshot,
  type DbInvestment,
  type DbTransaction,
} from "@/lib/account.functions";
import { useSession } from "@/hooks/useSession";

export type Transaction = {
  id: string;
  date: string;
  type: DbTransaction["type"];
  amount: number;
  status: DbTransaction["status"];
  method?: string;
};

type Result = { ok: boolean; error?: string };

export type WalletState = {
  loading: boolean;
  error: unknown;
  isAdmin: boolean;
  profile: AccountSnapshot["profile"];
  balance: number;
  available: number;
  locked: number;
  profit: number;
  totalDeposits: number;
  totalWithdrawals: number;
  referralEarnings: number;
  transactions: Transaction[];
  investments: DbInvestment[];
  deposit: (amount: number, method: string) => Promise<Result>;
  withdraw: (amount: number, method: string) => Promise<Result>;
  invest: (planId: string, amount: number) => Promise<Result>;
  refresh: () => Promise<unknown>;
};

const WalletContext = createContext<WalletState | null>(null);

export const METHOD_LABELS: Record<string, string> = {
  transfer: "Bank Transfer",
  card: "Debit Card",
  ussd: "USSD",
  bank: "Bank Account",
};

const EMPTY_WALLET = {
  balance: 0,
  available: 0,
  locked: 0,
  profit: 0,
  totalDeposits: 0,
  totalWithdrawals: 0,
  referralEarnings: 0,
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getAccount);
  const depositFn = useServerFn(createDeposit);
  const withdrawFn = useServerFn(requestWithdrawal);
  const investFn = useServerFn(createInvestment);

  const query = useQuery({
    queryKey: ["account", userId],
    queryFn: () => fetchAccount(),
    enabled: Boolean(userId),
  });

  const value = useMemo<WalletState>(() => {
    const snapshot = query.data;
    const wallet = snapshot?.wallet ?? EMPTY_WALLET;
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["account"] });
    const run = async (fn: () => Promise<{ ok: boolean; error?: string }>): Promise<Result> => {
      try {
        const res = await fn();
        if (res?.ok) await refresh();
        return { ok: Boolean(res?.ok), error: res?.error };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
      }
    };

    return {
      loading: Boolean(userId) && query.isPending,
      error: query.error,
      isAdmin: Boolean(snapshot?.isAdmin),
      profile: snapshot?.profile ?? null,
      ...wallet,
      transactions: (snapshot?.transactions ?? []).map((t) => ({
        id: t.id,
        date: t.created_at,
        type: t.type,
        amount: Number(t.amount),
        status: t.status,
        method: t.method ?? undefined,
      })),
      investments: snapshot?.investments ?? [],
      deposit: (amount, method) => run(() => depositFn({ data: { amount, method } }) as Promise<Result>),
      withdraw: (amount, method) => run(() => withdrawFn({ data: { amount, method } }) as Promise<Result>),
      invest: (planId, amount) => run(() => investFn({ data: { planId, amount } }) as Promise<Result>),
      refresh,
    };
  }, [query.data, query.isPending, query.error, userId, queryClient, depositFn, withdrawFn, investFn]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

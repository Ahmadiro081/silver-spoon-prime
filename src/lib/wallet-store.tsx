// Frontend-only wallet store (in-memory, resets on refresh).
// Powers mock deposit/withdraw flows across the dashboard.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { transactions as seedTransactions, walletStats, type Transaction } from "@/lib/mock-data";

export type WalletState = {
  balance: number;
  available: number;
  locked: number;
  profit: number;
  totalDeposits: number;
  totalWithdrawals: number;
  transactions: Transaction[];
  deposit: (amount: number, method: string) => Transaction;
  withdraw: (amount: number, method: string) => Transaction | { error: string };
};

const WalletContext = createContext<WalletState | null>(null);

const METHOD_LABELS: Record<string, string> = {
  transfer: "Bank Transfer",
  card: "Debit Card",
  ussd: "USSD",
  gtbank: "GTBank ****4521",
  access: "Access ****9012",
};

let txnCounter = 1043;
const nextId = () => `TXN-${txnCounter++}`;
const today = () => new Date().toISOString().slice(0, 10);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(walletStats.available);
  const [totalDeposits, setTotalDeposits] = useState(walletStats.totalDeposits);
  const [totalWithdrawals, setTotalWithdrawals] = useState(walletStats.totalWithdrawals);
  const [txns, setTxns] = useState<Transaction[]>(seedTransactions);

  const value = useMemo<WalletState>(() => {
    const balance = available + walletStats.activeInvestments;
    const addTxn = (t: Omit<Transaction, "id" | "date">): Transaction => {
      const txn: Transaction = { ...t, id: nextId(), date: today() };
      setTxns((prev) => [txn, ...prev]);
      return txn;
    };
    return {
      balance,
      available,
      locked: walletStats.activeInvestments,
      profit: walletStats.totalProfit,
      totalDeposits,
      totalWithdrawals,
      transactions: txns,
      deposit: (amount, method) => {
        setAvailable((a) => a + amount);
        setTotalDeposits((d) => d + amount);
        return addTxn({
          type: "Deposit",
          amount,
          status: "Completed",
          method: METHOD_LABELS[method] ?? method,
        });
      },
      withdraw: (amount, method) => {
        if (amount > available) return { error: "Insufficient available balance." };
        setAvailable((a) => a - amount);
        setTotalWithdrawals((w) => w + amount);
        return addTxn({
          type: "Withdrawal",
          amount,
          status: "Pending",
          method: METHOD_LABELS[method] ?? method,
        });
      },
    };
  }, [available, totalDeposits, totalWithdrawals, txns]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

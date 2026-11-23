import type { InvestmentRecord, TransactionRecord, WalletMetrics } from "@/types/domain";

/**
 * Client-side wallet ledger calculation used during frontend mock simulation.
 *
 * PRODUCTION NOTE (Supabase Migration):
 * All authoritative balance calculations, ledger locks, deposit confirmations,
 * withdrawal disbursements, and investment maturity payouts MUST be enforced
 * server-side inside PostgreSQL transactions / RPC functions and Supabase
 * Edge Functions with Row Level Security (RLS).
 */
export function calculateUserWalletMetrics(
  transactions: TransactionRecord[],
  investments: InvestmentRecord[],
): WalletMetrics {
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let pendingWithdrawals = 0;
  let realizedEarnings = 0;
  let referralEarnings = 0;

  for (const txn of transactions) {
    if (txn.status === "Declined") continue;

    if (txn.type === "Deposit" && txn.status === "Completed") {
      totalDeposits += txn.amount;
    } else if (txn.type === "Withdrawal" && txn.status === "Completed") {
      totalWithdrawals += txn.amount;
    } else if (txn.type === "Withdrawal" && txn.status === "Pending") {
      pendingWithdrawals += txn.amount;
    } else if (txn.type === "Realized Return" && txn.status === "Completed") {
      realizedEarnings += txn.amount;
    } else if (txn.type === "Referral Commission" && txn.status === "Completed") {
      referralEarnings += txn.amount;
    }
  }

  const activeInvestments = investments
    .filter((inv) => inv.status === "Active")
    .reduce((sum, inv) => sum + inv.principal, 0);

  const projectedAccrual = investments
    .filter((inv) => inv.status === "Active")
    .reduce((sum, inv) => sum + inv.accruedReturn, 0);

  const availableBalance = Math.max(
    0,
    totalDeposits + realizedEarnings + referralEarnings - totalWithdrawals - pendingWithdrawals - activeInvestments,
  );

  const totalWalletBalance = availableBalance + activeInvestments;

  return {
    totalWalletBalance,
    availableBalance,
    activeInvestments,
    pendingWithdrawals,
    totalDeposits,
    totalWithdrawals,
    realizedEarnings,
    referralEarnings,
    projectedAccrual,
  };
}

export function calculateProjectedReturn(principal: number, targetReturnPercent: number): number {
  return Math.round((principal * targetReturnPercent) / 100);
}

export function calculateInvestmentProgress(startedAt: string, maturesAt: string, status: InvestmentRecord["status"]): number {
  if (status === "Matured") return 100;
  if (status === "Cancelled") return 0;
  const start = new Date(startedAt).getTime();
  const end = new Date(maturesAt).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  return Math.min(99, Math.max(4, Math.round(((now - start) / (end - start)) * 100)));
}

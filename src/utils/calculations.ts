import type {
  InvestmentPlan,
  InvestmentRecord,
  MonthlyPerformancePoint,
  PayoutScheduleItem,
  TransactionRecord,
  UserPortfolioPoint,
  UserProfile,
  WalletMetrics,
} from "@/types/domain";

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
      totalWithdrawals += txn.amount + txn.fee;
    } else if (txn.type === "Withdrawal" && txn.status === "Pending") {
      pendingWithdrawals += txn.amount + txn.fee;
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
    totalDeposits +
      realizedEarnings +
      referralEarnings -
      totalWithdrawals -
      pendingWithdrawals -
      activeInvestments,
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

export function calculateInvestmentProgress(
  startedAt: string,
  maturesAt: string,
  status: InvestmentRecord["status"],
): number {
  if (status === "Matured") return 100;
  if (status === "Cancelled") return 0;
  const start = new Date(startedAt).getTime();
  const end = new Date(maturesAt).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  return Math.min(99, Math.max(4, Math.round(((now - start) / (end - start)) * 100)));
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function getRecentMonthWindows(count = 7): { key: string; label: string; endTs: number; startTs: number }[] {
  const now = new Date();
  const windows: { key: string; label: string; endTs: number; startTs: number }[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1, 0, 0, 0, 0);
    const end =
      offset === 0
        ? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        : new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999);
    windows.push({
      key: `${start.getFullYear()}-${start.getMonth()}`,
      label: MONTH_LABELS[start.getMonth()] ?? "",
      startTs: start.getTime(),
      endTs: end.getTime(),
    });
  }
  return windows;
}

/**
 * Dynamically builds a 7-month portfolio history strictly from a specific user's
 * transactions and investments so new or different users never inherit another account's chart.
 */
export function buildUserPortfolioHistory(
  transactions: TransactionRecord[],
  investments: InvestmentRecord[],
): UserPortfolioPoint[] {
  const windows = getRecentMonthWindows(7);
  const currentMetrics = calculateUserWalletMetrics(transactions, investments);

  return windows.map((win, idx) => {
    if (idx === windows.length - 1) {
      return {
        month: win.label,
        balance: currentMetrics.totalWalletBalance,
        invested: currentMetrics.activeInvestments,
        realized: currentMetrics.realizedEarnings,
      };
    }

    const txnsUpToMonth = transactions.filter((t) => new Date(t.createdAt).getTime() <= win.endTs);
    const invsUpToMonth = investments
      .filter((i) => new Date(i.startedAt).getTime() <= win.endTs)
      .map((i) => {
        const maturedByEnd = new Date(i.maturesAt).getTime() <= win.endTs;
        return {
          ...i,
          status:
            i.status === "Cancelled"
              ? ("Cancelled" as const)
              : maturedByEnd
                ? ("Matured" as const)
                : ("Active" as const),
        };
      });

    const snapshot = calculateUserWalletMetrics(txnsUpToMonth, invsUpToMonth);
    return {
      month: win.label,
      balance: snapshot.totalWalletBalance,
      invested: snapshot.activeInvestments,
      realized: snapshot.realizedEarnings,
    };
  });
}

/**
 * Dynamically computes 7-month platform treasury flows, cumulative AUM, realized payouts,
 * and active account counts strictly from the live mock database records.
 */
export function buildPlatformMonthlyMetrics(
  users: UserProfile[],
  transactions: TransactionRecord[],
  investments: InvestmentRecord[],
): MonthlyPerformancePoint[] {
  const windows = getRecentMonthWindows(7);
  const investors = users.filter((u) => u.role === "investor");

  return windows.map((win, idx) => {
    const isCurrent = idx === windows.length - 1;

    const deposits = transactions
      .filter((t) => {
        const ts = new Date(t.createdAt).getTime();
        return t.type === "Deposit" && t.status === "Completed" && ts >= win.startTs && ts <= win.endTs;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const withdrawals = transactions
      .filter((t) => {
        const ts = new Date(t.createdAt).getTime();
        return t.type === "Withdrawal" && t.status === "Completed" && ts >= win.startTs && ts <= win.endTs;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const realizedEarnings = transactions
      .filter((t) => {
        const ts = new Date(t.createdAt).getTime();
        return (
          t.type === "Realized Return" && t.status === "Completed" && ts >= win.startTs && ts <= win.endTs
        );
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const activeUsers = investors.filter(
      (u) => new Date(u.joinedAt).getTime() <= win.endTs && u.status !== "Suspended",
    ).length;

    const portfolioValue = investors.reduce((sum, u) => {
      if (new Date(u.joinedAt).getTime() > win.endTs) return sum;
      const uTxns = isCurrent
        ? transactions.filter((t) => t.userId === u.id)
        : transactions.filter((t) => t.userId === u.id && new Date(t.createdAt).getTime() <= win.endTs);
      const uInvs = isCurrent
        ? investments.filter((i) => i.userId === u.id)
        : investments
            .filter((i) => i.userId === u.id && new Date(i.startedAt).getTime() <= win.endTs)
            .map((i) => ({
              ...i,
              status:
                i.status === "Cancelled"
                  ? ("Cancelled" as const)
                  : new Date(i.maturesAt).getTime() <= win.endTs
                    ? ("Matured" as const)
                    : ("Active" as const),
            }));
      return sum + calculateUserWalletMetrics(uTxns, uInvs).totalWalletBalance;
    }, 0);

    return {
      month: win.label,
      deposits,
      withdrawals,
      portfolioValue,
      realizedEarnings,
      activeUsers,
    };
  });
}

/**
 * Generates an illustrative payout schedule for a single investment mandate.
 */
export function buildInvestmentPayoutSchedule(
  investment: InvestmentRecord,
  plan?: InvestmentPlan,
): PayoutScheduleItem[] {
  const startMs = new Date(investment.startedAt).getTime();
  const endMs = new Date(investment.maturesAt).getTime();
  const frequency = plan?.payoutFrequency ?? "At Maturity";
  const now = Date.now();

  let periods = 1;
  if (frequency === "Quarterly" && investment.durationDays >= 180) {
    periods = Math.max(2, Math.round(investment.durationDays / 90));
  } else if (frequency === "Monthly" && investment.durationDays >= 60) {
    periods = Math.max(2, Math.round(investment.durationDays / 30));
  }

  const stepMs = (endMs - startMs) / periods;
  const perPeriodReturn = Math.round(investment.projectedReturn / periods);

  const items: PayoutScheduleItem[] = [];
  for (let i = 1; i <= periods; i += 1) {
    const isFinal = i === periods;
    const schedMs = isFinal ? endMs : startMs + stepMs * i;
    const projectedAmount = isFinal
      ? investment.projectedReturn - perPeriodReturn * (periods - 1)
      : perPeriodReturn;
    const settled = investment.status === "Matured" || (!isFinal && schedMs <= now);

    items.push({
      installment: i,
      label: isFinal
        ? "Maturity Settlement (Principal + Return)"
        : `${frequency} Distribution #${i}`,
      scheduledDate: new Date(schedMs).toISOString(),
      projectedAmount,
      principalComponent: isFinal ? investment.principal : 0,
      status: settled ? "Settled" : "Projected",
    });
  }

  return items;
}

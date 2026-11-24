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
        const effectiveMaturityTs = new Date(i.settledAt ?? i.maturesAt).getTime();
        const maturedByEnd = i.status === "Matured" && effectiveMaturityTs <= win.endTs;
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
                  : i.status === "Matured" &&
                      new Date(i.settledAt ?? i.maturesAt).getTime() <= win.endTs
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
 *
 * Financial consistency rule:
 * - Interim schedule dates on Active mandates are NEVER marked "Settled" because
 *   earnings are only credited to the wallet ledger upon actual maturity settlement.
 * - Past schedule milestones on Active mandates display as "Pending Settlement";
 *   future milestones display as "Scheduled".
 * - Only Matured mandates mark schedule rows "Settled".
 */
export function buildInvestmentPayoutSchedule(
  investment: InvestmentRecord,
  plan?: InvestmentPlan,
  referenceDate: Date = new Date(),
): PayoutScheduleItem[] {
  const startMs = new Date(investment.startedAt).getTime();
  const endMs = new Date(investment.maturesAt).getTime();
  const frequency = plan?.payoutFrequency ?? "At Maturity";
  const now = referenceDate.getTime();

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

    let status: PayoutScheduleItem["status"];
    if (investment.status === "Cancelled") {
      status = "Cancelled";
    } else if (investment.status === "Matured") {
      status = "Settled";
    } else if (schedMs <= now) {
      status = "Pending Settlement";
    } else {
      status = "Scheduled";
    }

    const finalLabel = investment.rolledOverToInvestmentId
      ? `Maturity Settlement (Rolled Over → ${investment.rolledOverToInvestmentId})`
      : "Maturity Settlement (Principal + Return)";

    items.push({
      installment: i,
      label: isFinal ? finalLabel : `${frequency} Milestone #${i} (Accrual Checkpoint)`,
      scheduledDate: new Date(schedMs).toISOString(),
      projectedAmount,
      principalComponent: isFinal ? investment.principal : 0,
      status,
    });
  }

  return items;
}

export interface TransactionLedgerImpact {
  isInflow: boolean;
  sign: "+" | "-" | "";
  grossAmount: number;
  fee: number;
  netWalletImpact: number;
  impactDescription: string;
}

/**
 * Single source of truth for how a transaction affects an investor's Available Balance
 * across overview, wallet history, transaction ledger, and receipts.
 */
export function getTransactionLedgerImpact(txn: TransactionRecord): TransactionLedgerImpact {
  const isInflow =
    txn.type === "Deposit" ||
    txn.type === "Realized Return" ||
    txn.type === "Referral Commission";

  if (txn.status === "Declined") {
    return {
      isInflow,
      sign: "",
      grossAmount: txn.amount,
      fee: txn.fee,
      netWalletImpact: 0,
      impactDescription: "No wallet balance impact (declined)",
    };
  }

  if (txn.type === "Deposit" && txn.status === "Pending") {
    return {
      isInflow: true,
      sign: "+",
      grossAmount: txn.amount,
      fee: txn.fee,
      netWalletImpact: 0,
      impactDescription: "Pending credit — reflected in Available Balance after confirmation",
    };
  }

  if (txn.type === "Withdrawal" && txn.status === "Pending") {
    return {
      isInflow: false,
      sign: "-",
      grossAmount: txn.amount,
      fee: txn.fee,
      netWalletImpact: -(txn.amount + txn.fee),
      impactDescription: "Reserved from Available Balance pending treasury disbursement",
    };
  }

  if (txn.type === "Investment") {
    return {
      isInflow: false,
      sign: "-",
      grossAmount: txn.amount,
      fee: txn.fee,
      netWalletImpact: -txn.amount,
      impactDescription: "Reallocated from Available Balance into Active Investments",
    };
  }

  if (isInflow) {
    return {
      isInflow: true,
      sign: "+",
      grossAmount: txn.amount,
      fee: txn.fee,
      netWalletImpact: txn.amount,
      impactDescription: "Credited to Available Balance",
    };
  }

  return {
    isInflow: false,
    sign: "-",
    grossAmount: txn.amount,
    fee: txn.fee,
    netWalletImpact: -(txn.amount + txn.fee),
    impactDescription: "Debited from Available Balance (principal + settlement fee)",
  };
}

import type { MockDataSnapshot } from "@/services/mockDataProvider";
import {
  isNotificationReadByUser,
  isNotificationVisibleToUser,
} from "@/services/platformService";
import type {
  InvestmentRecord,
  KycSubmissionRecord,
  ReferralRecord,
  SessionState,
  TransactionRecord,
  UserNotificationItem,
  UserProfile,
  WalletMetrics,
} from "@/types/domain";
import { calculateUserWalletMetrics } from "@/utils/calculations";

export const MOCK_SCHEMA_VERSION = 4;

export interface IntegrityIssue {
  code: string;
  severity: "error" | "warning";
  entity: string;
  message: string;
}

export interface MockIntegrityAuditResult {
  ok: boolean;
  issues: IntegrityIssue[];
  summary: {
    users: number;
    investors: number;
    admins: number;
    plans: number;
    investments: number;
    transactions: number;
    referrals: number;
    notifications: number;
    kycSubmissions: number;
  };
}

export interface IsolatedAccountView {
  accountId: string;
  transactions: TransactionRecord[];
  investments: InvestmentRecord[];
  wallet: WalletMetrics;
  referrals: ReferralRecord[];
  notifications: UserNotificationItem[];
  unreadNotificationCount: number;
  kycSubmissions: KycSubmissionRecord[];
}

/**
 * Identifies unmigrated legacy persisted snapshots (from versions prior to
 * MOCK_SCHEMA_VERSION, which contained preloaded demo records).
 */
export function isLegacyUnmigratedSnapshot(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
  const candidate = raw as { schemaVersion?: unknown };
  return candidate.schemaVersion !== MOCK_SCHEMA_VERSION;
}

/**
 * Computes the unclamped raw ledger available balance for an investor so audits
 * can verify that `Math.max(0, ...)` is never silently masking a missing deposit
 * or orphaned active investment in the dataset.
 */
export function calculateRawAvailableBalance(
  transactions: TransactionRecord[],
  investments: InvestmentRecord[],
): number {
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

  return (
    totalDeposits +
    realizedEarnings +
    referralEarnings -
    totalWithdrawals -
    pendingWithdrawals -
    activeInvestments
  );
}

/**
 * Strictly scopes all derived account collections and wallet metrics to a single
 * authenticated user ID. When `accountId` is empty or unknown, returns empty
 * collections and a zeroed wallet so zero cross-account data can ever leak.
 */
export function selectIsolatedAccountView(
  snapshot: Pick<
    MockDataSnapshot,
    "users" | "transactions" | "investments" | "referrals" | "notifications" | "kycSubmissions"
  >,
  accountId: string,
): IsolatedAccountView {
  const normalizedId = accountId.trim();
  const userExists = normalizedId
    ? snapshot.users.some((user) => user.id === normalizedId)
    : false;

  if (!normalizedId || !userExists) {
    return {
      accountId: "",
      transactions: [],
      investments: [],
      wallet: calculateUserWalletMetrics([], []),
      referrals: [],
      notifications: [],
      unreadNotificationCount: 0,
      kycSubmissions: [],
    };
  }

  const transactions = snapshot.transactions
    .filter((t) => t.userId === normalizedId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const investments = snapshot.investments
    .filter((i) => i.userId === normalizedId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const wallet = calculateUserWalletMetrics(transactions, investments);

  const referrals = snapshot.referrals.filter((r) => r.referrerId === normalizedId);

  const notifications: UserNotificationItem[] = snapshot.notifications
    .filter((n) => isNotificationVisibleToUser(n, normalizedId))
    .map((n) => ({
      ...n,
      read: isNotificationReadByUser(n, normalizedId),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  const kycSubmissions = snapshot.kycSubmissions
    .filter((s) => s.userId === normalizedId)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  return {
    accountId: normalizedId,
    transactions,
    investments,
    wallet,
    referrals,
    notifications,
    unreadNotificationCount,
    kycSubmissions,
  };
}

/**
 * Validates a restored session against the current user registry.
 * Prevents orphaned user IDs, role mismatches, or suspended accounts from
 * remaining authenticated after a refresh or storage edit.
 */
export function sanitizeRestoredSession(
  rawSession: Partial<SessionState> | undefined,
  users: UserProfile[],
): SessionState {
  if (!rawSession || typeof rawSession !== "object" || users.length === 0) {
    return {
      authenticated: false,
      userId: "",
      role: "investor",
    };
  }

  const matched =
    typeof rawSession.userId === "string"
      ? users.find((u) => u.id === rawSession.userId)
      : undefined;

  if (!matched || matched.status === "Suspended" || !rawSession.authenticated) {
    return {
      authenticated: false,
      userId: "",
      role: "investor",
    };
  }

  return {
    authenticated: true,
    userId: matched.id,
    role: matched.role,
  };
}

function collectDuplicateIds(items: { id: string }[], entity: string, issues: IntegrityIssue[]) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      issues.push({
        code: "DUPLICATE_ID",
        severity: "error",
        entity: `${entity}:${item.id}`,
        message: `Duplicate ${entity} ID detected: ${item.id}.`,
      });
    }
    seen.add(item.id);
  }
}

/**
 * Performs a comprehensive relational and ledger-consistency audit across an
 * entire MockDataSnapshot. Works on both clean empty datasets and populated
 * runtime datasets created via registration and simulated transactions.
 */
export function auditMockDatasetIntegrity(snapshot: MockDataSnapshot): MockIntegrityAuditResult {
  const issues: IntegrityIssue[] = [];

  collectDuplicateIds(snapshot.users, "User", issues);
  collectDuplicateIds(snapshot.plans, "Plan", issues);
  collectDuplicateIds(snapshot.investments, "Investment", issues);
  collectDuplicateIds(snapshot.transactions, "Transaction", issues);
  collectDuplicateIds(snapshot.referrals, "Referral", issues);
  collectDuplicateIds(snapshot.notifications, "Notification", issues);
  collectDuplicateIds(snapshot.auditLogs, "AuditLog", issues);
  collectDuplicateIds(snapshot.kycSubmissions, "KycSubmission", issues);

  const userById = new Map(snapshot.users.map((u) => [u.id, u]));
  const planById = new Map(snapshot.plans.map((p) => [p.id, p]));
  const investmentById = new Map(snapshot.investments.map((i) => [i.id, i]));
  const txnById = new Map(snapshot.transactions.map((t) => [t.id, t]));

  // 1. User email and referral code uniqueness
  const seenEmails = new Set<string>();
  const seenReferralCodes = new Set<string>();
  for (const user of snapshot.users) {
    const emailKey = user.email.trim().toLowerCase();
    if (seenEmails.has(emailKey)) {
      issues.push({
        code: "DUPLICATE_EMAIL",
        severity: "error",
        entity: `User:${user.id}`,
        message: `Duplicate email address ${user.email}.`,
      });
    }
    seenEmails.add(emailKey);

    const codeKey = user.referralCode.trim().toUpperCase();
    if (seenReferralCodes.has(codeKey)) {
      issues.push({
        code: "DUPLICATE_REFERRAL_CODE",
        severity: "error",
        entity: `User:${user.id}`,
        message: `Duplicate referral code ${user.referralCode}.`,
      });
    }
    seenReferralCodes.add(codeKey);
  }

  // 2. Session consistency
  if (snapshot.session.authenticated) {
    const sessionUser = userById.get(snapshot.session.userId);
    if (!sessionUser) {
      issues.push({
        code: "ORPHANED_SESSION_USER",
        severity: "error",
        entity: `Session:${snapshot.session.userId}`,
        message: `Authenticated session references unknown user ${snapshot.session.userId}.`,
      });
    } else {
      if (sessionUser.role !== snapshot.session.role) {
        issues.push({
          code: "SESSION_ROLE_MISMATCH",
          severity: "error",
          entity: `Session:${snapshot.session.userId}`,
          message: `Session role (${snapshot.session.role}) does not match user role (${sessionUser.role}).`,
        });
      }
      if (sessionUser.status === "Suspended") {
        issues.push({
          code: "SUSPENDED_ACTIVE_SESSION",
          severity: "error",
          entity: `Session:${snapshot.session.userId}`,
          message: `Suspended user ${sessionUser.id} cannot hold an authenticated session.`,
        });
      }
    }
  }

  // 3. Transaction relational integrity
  const seenRefs = new Set<string>();
  for (const txn of snapshot.transactions) {
    if (seenRefs.has(txn.reference)) {
      issues.push({
        code: "DUPLICATE_TXN_REFERENCE",
        severity: "error",
        entity: `Transaction:${txn.id}`,
        message: `Duplicate transaction reference ${txn.reference}.`,
      });
    }
    seenRefs.add(txn.reference);

    const owner = userById.get(txn.userId);
    if (!owner) {
      issues.push({
        code: "ORPHANED_TRANSACTION_USER",
        severity: "error",
        entity: `Transaction:${txn.id}`,
        message: `Transaction ${txn.id} references missing user ${txn.userId}.`,
      });
    } else if (owner.email.toLowerCase() !== txn.userEmail.toLowerCase()) {
      issues.push({
        code: "TXN_USER_EMAIL_MISMATCH",
        severity: "error",
        entity: `Transaction:${txn.id}`,
        message: `Transaction ${txn.id} email (${txn.userEmail}) mismatches owner ${owner.email}.`,
      });
    }

    if (!Number.isFinite(txn.amount) || txn.amount <= 0) {
      issues.push({
        code: "INVALID_TXN_AMOUNT",
        severity: "error",
        entity: `Transaction:${txn.id}`,
        message: `Transaction ${txn.id} has non-positive amount (${txn.amount}).`,
      });
    }
    if (!Number.isFinite(txn.fee) || txn.fee < 0) {
      issues.push({
        code: "INVALID_TXN_FEE",
        severity: "error",
        entity: `Transaction:${txn.id}`,
        message: `Transaction ${txn.id} has negative fee (${txn.fee}).`,
      });
    }
  }

  // 4. Investment relational & ledger pairing integrity
  for (const inv of snapshot.investments) {
    const owner = userById.get(inv.userId);
    if (!owner || owner.role !== "investor") {
      issues.push({
        code: "ORPHANED_INVESTMENT_USER",
        severity: "error",
        entity: `Investment:${inv.id}`,
        message: `Investment ${inv.id} references missing or non-investor user ${inv.userId}.`,
      });
    }
    const plan = planById.get(inv.planId);
    if (!plan) {
      issues.push({
        code: "ORPHANED_INVESTMENT_PLAN",
        severity: "error",
        entity: `Investment:${inv.id}`,
        message: `Investment ${inv.id} references missing plan ${inv.planId}.`,
      });
    }

    const matchingAllocationTxn = snapshot.transactions.find(
      (t) =>
        t.userId === inv.userId &&
        t.type === "Investment" &&
        t.status === "Completed" &&
        t.amount === inv.principal &&
        (t.note?.includes(inv.id) || t.createdAt === inv.startedAt),
    );
    if (!matchingAllocationTxn) {
      issues.push({
        code: "MISSING_INVESTMENT_LEDGER_ENTRY",
        severity: "error",
        entity: `Investment:${inv.id}`,
        message: `Investment ${inv.id} (${inv.userId}, ${inv.principal}) lacks a matching Completed Investment ledger transaction.`,
      });
    }

    if (inv.status === "Matured") {
      if (!inv.maturityPayoutTxnId) {
        issues.push({
          code: "MISSING_MATURITY_PAYOUT_REF",
          severity: "error",
          entity: `Investment:${inv.id}`,
          message: `Matured investment ${inv.id} is missing maturityPayoutTxnId.`,
        });
      } else {
        const payoutTxn = txnById.get(inv.maturityPayoutTxnId);
        if (
          !payoutTxn ||
          payoutTxn.userId !== inv.userId ||
          payoutTxn.type !== "Realized Return" ||
          payoutTxn.status !== "Completed"
        ) {
          issues.push({
            code: "BROKEN_MATURITY_PAYOUT_LINK",
            severity: "error",
            entity: `Investment:${inv.id}`,
            message: `Matured investment ${inv.id} maturityPayoutTxnId (${inv.maturityPayoutTxnId}) does not link to a Completed Realized Return transaction for ${inv.userId}.`,
          });
        }
      }
    }
  }

  // 5. Referral relational integrity
  for (const ref of snapshot.referrals) {
    const referrer = userById.get(ref.referrerId);
    const referred = userById.get(ref.referredUserId);
    if (!referrer || !referred) {
      issues.push({
        code: "ORPHANED_REFERRAL_USER",
        severity: "error",
        entity: `Referral:${ref.id}`,
        message: `Referral ${ref.id} references missing referrer (${ref.referrerId}) or referred user (${ref.referredUserId}).`,
      });
      continue;
    }

    if (
      !referred.referredBy ||
      referred.referredBy.trim().toUpperCase() !== referrer.referralCode.trim().toUpperCase()
    ) {
      issues.push({
        code: "REFERRAL_CODE_MISMATCH",
        severity: "error",
        entity: `Referral:${ref.id}`,
        message: `Referred user ${referred.id} has referredBy=${referred.referredBy ?? "undefined"}, expected ${referrer.referralCode}.`,
      });
    }

    if (ref.qualifyingInvestmentId) {
      const qualInv = investmentById.get(ref.qualifyingInvestmentId);
      if (!qualInv || qualInv.userId !== ref.referredUserId) {
        issues.push({
          code: "BROKEN_REFERRAL_INVESTMENT_LINK",
          severity: "error",
          entity: `Referral:${ref.id}`,
          message: `Referral ${ref.id} qualifyingInvestmentId (${ref.qualifyingInvestmentId}) does not match an investment owned by ${ref.referredUserId}.`,
        });
      }
    }

    if (ref.status === "Paid") {
      if (!ref.payoutTxnId) {
        issues.push({
          code: "MISSING_REFERRAL_PAYOUT_TXN",
          severity: "error",
          entity: `Referral:${ref.id}`,
          message: `Paid referral ${ref.id} is missing payoutTxnId.`,
        });
      } else {
        const payoutTxn = txnById.get(ref.payoutTxnId);
        if (
          !payoutTxn ||
          payoutTxn.userId !== ref.referrerId ||
          payoutTxn.type !== "Referral Commission" ||
          payoutTxn.status !== "Completed" ||
          payoutTxn.amount !== ref.commissionEarned
        ) {
          issues.push({
            code: "BROKEN_REFERRAL_PAYOUT_LINK",
            severity: "error",
            entity: `Referral:${ref.id}`,
            message: `Paid referral ${ref.id} payoutTxnId (${ref.payoutTxnId}) does not match a Completed Referral Commission transaction of ${ref.commissionEarned} for ${ref.referrerId}.`,
          });
        }
      }
    }
  }

  // 6. Notification target & readByUserIds integrity
  for (const ntf of snapshot.notifications) {
    if (ntf.userId !== "ALL" && !userById.has(ntf.userId)) {
      issues.push({
        code: "ORPHANED_NOTIFICATION_USER",
        severity: "error",
        entity: `Notification:${ntf.id}`,
        message: `Notification ${ntf.id} targets missing user ${ntf.userId}.`,
      });
    }
    for (const readerId of ntf.readByUserIds) {
      if (!userById.has(readerId)) {
        issues.push({
          code: "ORPHANED_NOTIFICATION_READER",
          severity: "error",
          entity: `Notification:${ntf.id}`,
          message: `Notification ${ntf.id} readByUserIds contains unknown user ${readerId}.`,
        });
      }
    }
  }

  // 7. KYC submission integrity
  for (const kyc of snapshot.kycSubmissions) {
    const owner = userById.get(kyc.userId);
    if (!owner || owner.role !== "investor") {
      issues.push({
        code: "ORPHANED_KYC_USER",
        severity: "error",
        entity: `KycSubmission:${kyc.id}`,
        message: `KYC submission ${kyc.id} references missing or non-investor user ${kyc.userId}.`,
      });
    }
  }

  // 8. Per-investor ledger solvency & chronology invariants
  for (const user of snapshot.users) {
    if (user.role !== "investor") continue;
    const view = selectIsolatedAccountView(snapshot, user.id);
    const rawAvailable = calculateRawAvailableBalance(view.transactions, view.investments);
    if (rawAvailable < 0) {
      issues.push({
        code: "NEGATIVE_RAW_LEDGER_BALANCE",
        severity: "error",
        entity: `Wallet:${user.id}`,
        message: `Investor ${user.id} (${user.fullName}) has negative unclamped ledger balance (${rawAvailable}), indicating missing deposits or over-allocated positions.`,
      });
    }
    if (view.wallet.totalWalletBalance !== view.wallet.availableBalance + view.wallet.activeInvestments) {
      issues.push({
        code: "WALLET_EQUATION_MISMATCH",
        severity: "error",
        entity: `Wallet:${user.id}`,
        message: `Investor ${user.id} totalWalletBalance does not equal availableBalance + activeInvestments.`,
      });
    }

    // Verify first deposit precedes first investment for investors with investments
    if (view.investments.length > 0) {
      const completedDeposits = view.transactions.filter(
        (t) => t.type === "Deposit" && t.status === "Completed",
      );
      if (completedDeposits.length === 0) {
        issues.push({
          code: "INVESTMENT_WITHOUT_FUNDING",
          severity: "error",
          entity: `Wallet:${user.id}`,
          message: `Investor ${user.id} holds investments without any Completed Deposit in the ledger.`,
        });
      } else {
        const earliestDepositTs = Math.min(
          ...completedDeposits.map((t) => new Date(t.createdAt).getTime()),
        );
        const earliestInvestmentTs = Math.min(
          ...view.investments.map((i) => new Date(i.startedAt).getTime()),
        );
        if (earliestDepositTs > earliestInvestmentTs) {
          issues.push({
            code: "DEPOSIT_AFTER_INVESTMENT",
            severity: "error",
            entity: `Wallet:${user.id}`,
            message: `Investor ${user.id} earliest Completed Deposit occurs after their earliest investment start date.`,
          });
        }
      }
    }
  }

  return {
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    summary: {
      users: snapshot.users.length,
      investors: snapshot.users.filter((u) => u.role === "investor").length,
      admins: snapshot.users.filter((u) => u.role === "admin").length,
      plans: snapshot.plans.length,
      investments: snapshot.investments.length,
      transactions: snapshot.transactions.length,
      referrals: snapshot.referrals.length,
      notifications: snapshot.notifications.length,
      kycSubmissions: snapshot.kycSubmissions.length,
    },
  };
}

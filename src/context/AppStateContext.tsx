import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_INVESTMENTS,
  INITIAL_NOTIFICATIONS,
  INITIAL_PLANS,
  INITIAL_REFERRALS,
  INITIAL_SETTINGS,
  INITIAL_TRANSACTIONS,
  INITIAL_USERS,
} from "@/data/mockDatabase";
import {
  buildInvestmentRecord,
  buildTransactionRecord,
  generateId,
  validateDeposit,
  validateInvestmentSubscription,
  validateWithdrawal,
  type CreatePlanInput,
  type DepositInput,
  type PlatformServiceContract,
  type SubscribeInvestmentInput,
  type WithdrawalInput,
} from "@/services/platformService";
import type {
  AccountStatus,
  AuditLogEntry,
  BankAccountDetails,
  InvestmentPlan,
  InvestmentRecord,
  NotificationCategory,
  NotificationItem,
  PlatformSettings,
  ReferralRecord,
  SessionState,
  TransactionRecord,
  TransactionStatus,
  UserProfile,
  WalletMetrics,
} from "@/types/domain";
import { calculateUserWalletMetrics } from "@/utils/calculations";
import { formatNaira, maskAccountNumber } from "@/utils/format";

const STORAGE_KEY = "silver-spoon-mock-state-v2";

interface PersistedState {
  session: SessionState;
  users: UserProfile[];
  plans: InvestmentPlan[];
  investments: InvestmentRecord[];
  transactions: TransactionRecord[];
  referrals: ReferralRecord[];
  notifications: NotificationItem[];
  auditLogs: AuditLogEntry[];
  settings: PlatformSettings;
}

function getDefaultState(): PersistedState {
  return {
    session: {
      authenticated: true,
      userId: "USR-1001",
      role: "investor",
    },
    users: INITIAL_USERS,
    plans: INITIAL_PLANS,
    investments: INITIAL_INVESTMENTS,
    transactions: INITIAL_TRANSACTIONS,
    referrals: INITIAL_REFERRALS,
    notifications: INITIAL_NOTIFICATIONS,
    auditLogs: INITIAL_AUDIT_LOGS,
    settings: INITIAL_SETTINGS,
  };
}

function loadState(): PersistedState {
  if (typeof window === "undefined") return getDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!parsed.users?.length || !parsed.plans?.length) return getDefaultState();
    return {
      ...getDefaultState(),
      ...parsed,
    };
  } catch {
    return getDefaultState();
  }
}

export interface AppStateContextValue extends PlatformServiceContract {
  session: SessionState;
  currentUser: UserProfile;
  users: UserProfile[];
  plans: InvestmentPlan[];
  investments: InvestmentRecord[];
  transactions: TransactionRecord[];
  referrals: ReferralRecord[];
  notifications: NotificationItem[];
  auditLogs: AuditLogEntry[];
  settings: PlatformSettings;
  // Derived views for currently active investor
  userWallet: WalletMetrics;
  userTransactions: TransactionRecord[];
  userInvestments: InvestmentRecord[];
  userReferrals: ReferralRecord[];
  userNotifications: NotificationItem[];
  unreadNotificationCount: number;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors in sandboxed iframes
    }
  }, [state]);

  const currentUser = useMemo(() => {
    return state.users.find((u) => u.id === state.session.userId) ?? state.users[0]!;
  }, [state.users, state.session.userId]);

  const activeInvestorId = currentUser.role === "investor" ? currentUser.id : "USR-1001";

  const userTransactions = useMemo(
    () =>
      state.transactions
        .filter((t) => t.userId === activeInvestorId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [state.transactions, activeInvestorId],
  );

  const userInvestments = useMemo(
    () =>
      state.investments
        .filter((i) => i.userId === activeInvestorId)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    [state.investments, activeInvestorId],
  );

  const userWallet = useMemo(
    () => calculateUserWalletMetrics(userTransactions, userInvestments),
    [userTransactions, userInvestments],
  );

  const userReferrals = useMemo(
    () => state.referrals.filter((r) => r.referrerId === activeInvestorId),
    [state.referrals, activeInvestorId],
  );

  const userNotifications = useMemo(
    () =>
      state.notifications
        .filter((n) => n.userId === activeInvestorId || n.userId === "ALL")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [state.notifications, activeInvestorId],
  );

  const unreadNotificationCount = useMemo(
    () => userNotifications.filter((n) => !n.read).length,
    [userNotifications],
  );

  const appendAudit = (
    prev: PersistedState,
    entry: Omit<AuditLogEntry, "id" | "timestamp" | "ipAddress">,
  ): AuditLogEntry[] => [
    {
      ...entry,
      id: generateId("AUD"),
      timestamp: new Date().toISOString(),
      ipAddress: "102.89.34.18",
    },
    ...prev.auditLogs,
  ];

  const login: PlatformServiceContract["login"] = (email, password, roleOverride) => {
    if (!email.trim() || !password.trim()) {
      return { ok: false, error: "Please enter both email address and password." };
    }
    const normalized = email.trim().toLowerCase();
    let matched = state.users.find((u) => u.email.toLowerCase() === normalized);
    if (!matched) {
      matched =
        roleOverride === "admin" || normalized.includes("admin")
          ? state.users.find((u) => u.role === "admin")
          : state.users.find((u) => u.role === "investor");
    }
    if (!matched) return { ok: false, error: "Unable to locate demo account." };
    if (matched.status === "Suspended") {
      return { ok: false, error: "This account is currently suspended. Contact compliance support." };
    }

    setState((prev) => ({
      ...prev,
      session: { authenticated: true, userId: matched!.id, role: matched!.role },
      users: prev.users.map((u) =>
        u.id === matched!.id ? { ...u, lastLoginAt: new Date().toISOString() } : u,
      ),
    }));
    return { ok: true, data: matched };
  };

  const register: PlatformServiceContract["register"] = (payload) => {
    if (!state.settings.allowNewRegistrations) {
      return { ok: false, error: "New client onboarding is temporarily paused by administration." };
    }
    if (!payload.fullName.trim() || !payload.email.trim() || payload.password.length < 8) {
      return { ok: false, error: "Provide full name, valid email, and a password of at least 8 characters." };
    }
    const exists = state.users.some((u) => u.email.toLowerCase() === payload.email.trim().toLowerCase());
    if (exists) {
      return { ok: false, error: "An account with this email already exists." };
    }

    const firstWord = payload.fullName.trim().split(/\s+/)[0]?.toUpperCase().slice(0, 6) || "CLIENT";
    const newUser: UserProfile = {
      id: generateId("USR"),
      fullName: payload.fullName.trim(),
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone.trim() || "+234 800 000 0000",
      city: "Lagos",
      address: "Victoria Island, Lagos",
      role: "investor",
      tier: "Silver",
      status: "Active",
      kycLevel: "Tier 2",
      referralCode: `SS-${firstWord}${Math.floor(10 + Math.random() * 89)}`,
      referredBy: payload.referralCode?.trim() || undefined,
      joinedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      twoFactorEnabled: false,
      emailAlerts: true,
      smsAlerts: false,
      bankAccount: {
        bankName: "Guaranty Trust Bank (GTBank)",
        bankCode: "058",
        accountNumber: "",
        accountName: payload.fullName.trim().toUpperCase(),
        verified: false,
      },
    };

    const referrer = payload.referralCode
      ? state.users.find((u) => u.referralCode.toLowerCase() === payload.referralCode!.trim().toLowerCase())
      : undefined;

    setState((prev) => ({
      ...prev,
      session: { authenticated: true, userId: newUser.id, role: "investor" },
      users: [newUser, ...prev.users],
      referrals: referrer
        ? [
            {
              id: generateId("REF"),
              referrerId: referrer.id,
              referrerName: referrer.fullName,
              referredUserId: newUser.id,
              referredUserName: newUser.fullName,
              referredUserEmail: newUser.email,
              joinedAt: newUser.joinedAt,
              qualifyingInvestment: 0,
              commissionRatePercent: prev.settings.referralCommissionPercent,
              commissionEarned: 0,
              status: "Pending",
            },
            ...prev.referrals,
          ]
        : prev.referrals,
      notifications: [
        {
          id: generateId("NTF"),
          userId: newUser.id,
          title: "Welcome to SILVER SPOON",
          message:
            "Your simulated Naira wealth account is active. Fund your wallet to explore structured investment mandates.",
          category: "platform",
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...prev.notifications,
      ],
      auditLogs: appendAudit(prev, {
        actorName: newUser.fullName,
        actorRole: "investor",
        action: "ACCOUNT_REGISTERED",
        targetType: "User",
        targetId: newUser.id,
        summary: `New investor account registered (${newUser.email}).`,
        severity: "Info",
      }),
    }));

    return { ok: true, data: newUser };
  };

  const logout = () => {
    setState((prev) => ({
      ...prev,
      session: { ...prev.session, authenticated: false },
    }));
  };

  const switchRoleDemo = (role: "investor" | "admin") => {
    const target = state.users.find((u) => u.role === role);
    if (!target) return;
    setState((prev) => ({
      ...prev,
      session: { authenticated: true, userId: target.id, role: target.role },
    }));
  };

  const createDeposit: PlatformServiceContract["createDeposit"] = (input: DepositInput) => {
    const validation = validateDeposit(input, state.settings);
    if (!validation.ok) return { ok: false, error: validation.error };

    const investor = state.users.find((u) => u.id === activeInvestorId) ?? currentUser;
    const autoApprove = input.amount <= state.settings.autoApproveDepositsUnder;
    const status: TransactionStatus = autoApprove ? "Completed" : "Pending";

    const txn = buildTransactionRecord({
      user: investor,
      type: "Deposit",
      amount: input.amount,
      status,
      channel: input.channel,
      note:
        input.note?.trim() ||
        (autoApprove
          ? "Simulated instant credit under auto-approval threshold"
          : "Queued for treasury confirmation in Admin Console"),
      reviewedBy: autoApprove ? "Auto-Settlement Engine" : undefined,
    });

    setState((prev) => ({
      ...prev,
      transactions: [txn, ...prev.transactions],
      notifications: [
        {
          id: generateId("NTF"),
          userId: investor.id,
          title: autoApprove ? "Simulated Deposit Credited" : "Deposit Submitted for Review",
          message: autoApprove
            ? `${formatNaira(input.amount)} via ${input.channel} has been credited to your available balance.`
            : `${formatNaira(input.amount)} via ${input.channel} is pending treasury confirmation.`,
          category: "deposit",
          createdAt: txn.createdAt,
          read: false,
        },
        ...prev.notifications,
      ],
      auditLogs: appendAudit(prev, {
        actorName: investor.fullName,
        actorRole: "investor",
        action: autoApprove ? "DEPOSIT_COMPLETED" : "DEPOSIT_SUBMITTED",
        targetType: "Deposit",
        targetId: txn.id,
        summary: `Simulated deposit of ${formatNaira(input.amount)} via ${input.channel} (${status}).`,
        severity: autoApprove ? "Info" : "Review",
      }),
    }));

    return { ok: true, data: txn };
  };

  const requestWithdrawal: PlatformServiceContract["requestWithdrawal"] = (input: WithdrawalInput) => {
    const investor = state.users.find((u) => u.id === activeInvestorId) ?? currentUser;
    const validation = validateWithdrawal(input, userWallet.availableBalance, investor, state.settings);
    if (!validation.ok) return { ok: false, error: validation.error };

    const fee = validation.data?.fee ?? 0;
    const channel = `${investor.bankAccount.bankName} ${maskAccountNumber(investor.bankAccount.accountNumber)}`;
    const txn = buildTransactionRecord({
      user: investor,
      type: "Withdrawal",
      amount: input.amount,
      fee,
      status: "Pending",
      channel,
      note: input.note?.trim() || "Simulated payout request awaiting treasury review",
    });

    setState((prev) => ({
      ...prev,
      transactions: [txn, ...prev.transactions],
      notifications: [
        {
          id: generateId("NTF"),
          userId: investor.id,
          title: "Withdrawal Request Submitted",
          message: `Your withdrawal request of ${formatNaira(input.amount)} to ${channel} is pending review.`,
          category: "withdrawal",
          createdAt: txn.createdAt,
          read: false,
        },
        ...prev.notifications,
      ],
      auditLogs: appendAudit(prev, {
        actorName: investor.fullName,
        actorRole: "investor",
        action: "WITHDRAWAL_REQUESTED",
        targetType: "Withdrawal",
        targetId: txn.id,
        summary: `Requested withdrawal of ${formatNaira(input.amount)} to ${channel}.`,
        severity: "Review",
      }),
    }));

    return { ok: true, data: txn };
  };

  const subscribeInvestment: PlatformServiceContract["subscribeInvestment"] = (
    input: SubscribeInvestmentInput,
  ) => {
    const investor = state.users.find((u) => u.id === activeInvestorId) ?? currentUser;
    const plan = state.plans.find((p) => p.id === input.planId);
    const validation = validateInvestmentSubscription(input, plan, userWallet.availableBalance);
    if (!validation.ok || !plan) return { ok: false, error: validation.error };

    const investment = buildInvestmentRecord(investor, plan, input.amount, input.autoCompound);
    const txn = buildTransactionRecord({
      user: investor,
      type: "Investment",
      amount: input.amount,
      status: "Completed",
      channel: plan.name,
      note: `Allocated for ${plan.durationDays} days (target ${plan.targetReturnPercent}%, non-guaranteed)`,
      reviewedBy: "Portfolio Allocation Desk",
    });

    setState((prev) => ({
      ...prev,
      investments: [investment, ...prev.investments],
      transactions: [txn, ...prev.transactions],
      notifications: [
        {
          id: generateId("NTF"),
          userId: investor.id,
          title: "Investment Mandate Activated",
          message: `Allocated ${formatNaira(input.amount)} into ${plan.name} (${plan.durationDays} days).`,
          category: "investment",
          createdAt: investment.startedAt,
          read: false,
        },
        ...prev.notifications,
      ],
      auditLogs: appendAudit(prev, {
        actorName: investor.fullName,
        actorRole: "investor",
        action: "INVESTMENT_ALLOCATED",
        targetType: "Investment",
        targetId: investment.id,
        summary: `Subscribed ${formatNaira(input.amount)} to ${plan.name}.`,
        severity: "Info",
      }),
    }));

    return { ok: true, data: investment };
  };

  const updateProfile: PlatformServiceContract["updateProfile"] = (updates) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === currentUser.id ? { ...u, ...updates } : u)),
    }));
    return { ok: true };
  };

  const updateBankAccount: PlatformServiceContract["updateBankAccount"] = (bank: BankAccountDetails) => {
    if (!/^\d{10}$/.test(bank.accountNumber)) {
      return { ok: false, error: "Nigerian NUBAN account numbers must be exactly 10 digits." };
    }
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === currentUser.id
          ? { ...u, bankAccount: { ...bank, verified: true } }
          : u,
      ),
    }));
    return { ok: true };
  };

  const markNotificationRead = (id: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  };

  const markAllNotificationsRead = () => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.userId === activeInvestorId || n.userId === "ALL" ? { ...n, read: true } : n,
      ),
    }));
  };

  // ── Administrator Actions ──

  const adminReviewTransaction: PlatformServiceContract["adminReviewTransaction"] = (
    txnId,
    status,
    note,
  ) => {
    const target = state.transactions.find((t) => t.id === txnId);
    if (!target) return { ok: false, error: "Transaction record not found." };
    const actor = state.users.find((u) => u.role === "admin") ?? currentUser;

    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.map((t) =>
        t.id === txnId
          ? {
              ...t,
              status,
              note: note?.trim() || t.note,
              reviewedAt: new Date().toISOString(),
              reviewedBy: actor.fullName,
            }
          : t,
      ),
      notifications: [
        {
          id: generateId("NTF"),
          userId: target.userId,
          title: `${target.type} ${status}`,
          message: `Your ${target.type.toLowerCase()} of ${formatNaira(target.amount)} (${target.reference}) was marked ${status.toLowerCase()}.`,
          category: target.type === "Deposit" ? "deposit" : "withdrawal",
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...prev.notifications,
      ],
      auditLogs: appendAudit(prev, {
        actorName: actor.fullName,
        actorRole: "admin",
        action: `${target.type.toUpperCase()}_${status.toUpperCase()}`,
        targetType: target.type === "Deposit" ? "Deposit" : "Withdrawal",
        targetId: target.id,
        summary: `Marked ${target.type} ${target.reference} (${formatNaira(target.amount)}) as ${status}.`,
        severity: status === "Declined" ? "Critical" : "Info",
      }),
    }));
    return { ok: true };
  };

  const adminMatureInvestment: PlatformServiceContract["adminMatureInvestment"] = (investmentId) => {
    const inv = state.investments.find((i) => i.id === investmentId);
    if (!inv) return { ok: false, error: "Investment not found." };
    if (inv.status !== "Active") return { ok: false, error: "Only active investments can be matured." };

    const investor = state.users.find((u) => u.id === inv.userId);
    const admin = state.users.find((u) => u.role === "admin") ?? currentUser;
    if (!investor) return { ok: false, error: "Investor record missing." };

    const realizedReturn = inv.projectedReturn;
    const payoutTxn = buildTransactionRecord({
      user: investor,
      type: "Realized Return",
      amount: realizedReturn,
      status: "Completed",
      channel: inv.planName,
      note: `Simulated maturity settlement for ${inv.id}`,
      reviewedBy: admin.fullName,
    });

    setState((prev) => ({
      ...prev,
      investments: prev.investments.map((i) =>
        i.id === investmentId
          ? { ...i, status: "Matured", accruedReturn: realizedReturn }
          : i,
      ),
      transactions: [payoutTxn, ...prev.transactions],
      notifications: [
        {
          id: generateId("NTF"),
          userId: investor.id,
          title: "Investment Mandate Matured",
          message: `${inv.planName} (${inv.id}) matured. Principal of ${formatNaira(inv.principal)} returned to available balance with ${formatNaira(realizedReturn)} realized return.`,
          category: "investment",
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...prev.notifications,
      ],
      auditLogs: appendAudit(prev, {
        actorName: admin.fullName,
        actorRole: "admin",
        action: "INVESTMENT_MATURED",
        targetType: "Investment",
        targetId: inv.id,
        summary: `Matured ${inv.id} for ${inv.userName}; credited ${formatNaira(realizedReturn)} realized return.`,
        severity: "Info",
      }),
    }));

    return { ok: true, data: { realizedReturn } };
  };

  const adminUpdateUserStatus: PlatformServiceContract["adminUpdateUserStatus"] = (
    userId: string,
    status: AccountStatus,
  ) => {
    const target = state.users.find((u) => u.id === userId);
    const admin = state.users.find((u) => u.role === "admin") ?? currentUser;
    if (!target) return { ok: false, error: "User not found." };

    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, status } : u)),
      auditLogs: appendAudit(prev, {
        actorName: admin.fullName,
        actorRole: "admin",
        action: "USER_STATUS_UPDATED",
        targetType: "User",
        targetId: userId,
        summary: `Updated ${target.fullName} account status to ${status}.`,
        severity: status === "Suspended" ? "Critical" : "Info",
      }),
    }));
    return { ok: true };
  };

  const adminUpdateUserTier: PlatformServiceContract["adminUpdateUserTier"] = (userId, tier) => {
    const target = state.users.find((u) => u.id === userId);
    const admin = state.users.find((u) => u.role === "admin") ?? currentUser;
    if (!target) return { ok: false, error: "User not found." };

    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, tier } : u)),
      auditLogs: appendAudit(prev, {
        actorName: admin.fullName,
        actorRole: "admin",
        action: "USER_TIER_UPDATED",
        targetType: "User",
        targetId: userId,
        summary: `Changed ${target.fullName} wealth tier to ${tier}.`,
        severity: "Info",
      }),
    }));
    return { ok: true };
  };

  const adminCreatePlan: PlatformServiceContract["adminCreatePlan"] = (input: CreatePlanInput) => {
    if (!input.name.trim() || input.minAmount <= 0 || input.maxAmount <= input.minAmount) {
      return { ok: false, error: "Provide a valid plan name and min/max Naira range." };
    }
    const admin = state.users.find((u) => u.role === "admin") ?? currentUser;
    const newPlan: InvestmentPlan = {
      id: `plan-${input.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString().slice(-3)}`,
      ...input,
      status: "Active",
      allocationFocus: ["Nigerian Treasury Securities (55%)", "Corporate Fixed Income (35%)", "Liquidity Buffer (10%)"],
      perks: [`${input.durationDays}-day cycle`, `${input.payoutFrequency} distribution`, "Monthly ledger reporting"],
    };

    setState((prev) => ({
      ...prev,
      plans: [newPlan, ...prev.plans],
      auditLogs: appendAudit(prev, {
        actorName: admin.fullName,
        actorRole: "admin",
        action: "PLAN_CREATED",
        targetType: "Plan",
        targetId: newPlan.id,
        summary: `Created investment plan ${newPlan.name} (${newPlan.durationDays}d, ${newPlan.targetReturnPercent}% target).`,
        severity: "Review",
      }),
    }));
    return { ok: true, data: newPlan };
  };

  const adminTogglePlanStatus: PlatformServiceContract["adminTogglePlanStatus"] = (planId, status) => {
    const plan = state.plans.find((p) => p.id === planId);
    const admin = state.users.find((u) => u.role === "admin") ?? currentUser;
    if (!plan) return { ok: false, error: "Plan not found." };

    setState((prev) => ({
      ...prev,
      plans: prev.plans.map((p) => (p.id === planId ? { ...p, status } : p)),
      auditLogs: appendAudit(prev, {
        actorName: admin.fullName,
        actorRole: "admin",
        action: "PLAN_STATUS_CHANGED",
        targetType: "Plan",
        targetId: planId,
        summary: `Set plan ${plan.name} status to ${status}.`,
        severity: "Review",
      }),
    }));
    return { ok: true };
  };

  const adminUpdatePlan: PlatformServiceContract["adminUpdatePlan"] = (planId, updates) => {
    const plan = state.plans.find((p) => p.id === planId);
    const admin = state.users.find((u) => u.role === "admin") ?? currentUser;
    if (!plan) return { ok: false, error: "Plan not found." };

    setState((prev) => ({
      ...prev,
      plans: prev.plans.map((p) => (p.id === planId ? { ...p, ...updates } : p)),
      auditLogs: appendAudit(prev, {
        actorName: admin.fullName,
        actorRole: "admin",
        action: "PLAN_UPDATED",
        targetType: "Plan",
        targetId: planId,
        summary: `Updated parameters for ${plan.name}.`,
        severity: "Review",
      }),
    }));
    return { ok: true };
  };

  const adminSendNotification: PlatformServiceContract["adminSendNotification"] = (payload) => {
    if (!payload.title.trim() || !payload.message.trim()) {
      return { ok: false, error: "Notification title and message are required." };
    }
    const admin = state.users.find((u) => u.role === "admin") ?? currentUser;
    const item: NotificationItem = {
      id: generateId("NTF"),
      userId: payload.userId,
      title: payload.title.trim(),
      message: payload.message.trim(),
      category: payload.category as NotificationCategory,
      createdAt: new Date().toISOString(),
      read: false,
    };

    setState((prev) => ({
      ...prev,
      notifications: [item, ...prev.notifications],
      auditLogs: appendAudit(prev, {
        actorName: admin.fullName,
        actorRole: "admin",
        action: "NOTIFICATION_SENT",
        targetType: "Notification",
        targetId: item.id,
        summary: `Dispatched "${item.title}" to ${payload.userId === "ALL" ? "all clients" : payload.userId}.`,
        severity: "Info",
      }),
    }));
    return { ok: true };
  };

  const adminUpdateSettings: PlatformServiceContract["adminUpdateSettings"] = (updates) => {
    const admin = state.users.find((u) => u.role === "admin") ?? currentUser;
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...updates },
      auditLogs: appendAudit(prev, {
        actorName: admin.fullName,
        actorRole: "admin",
        action: "PLATFORM_SETTINGS_UPDATED",
        targetType: "Settings",
        targetId: "GLOBAL",
        summary: `Updated platform configuration keys: ${Object.keys(updates).join(", ")}.`,
        severity: "Review",
      }),
    }));
    return { ok: true };
  };

  const adminMarkReferralPaid: PlatformServiceContract["adminMarkReferralPaid"] = (referralId) => {
    const ref = state.referrals.find((r) => r.id === referralId);
    const admin = state.users.find((u) => u.role === "admin") ?? currentUser;
    if (!ref) return { ok: false, error: "Referral record not found." };
    const referrer = state.users.find((u) => u.id === ref.referrerId);
    const payoutAmount = ref.commissionEarned > 0 ? ref.commissionEarned : 15_000;

    setState((prev) => ({
      ...prev,
      referrals: prev.referrals.map((r) =>
        r.id === referralId
          ? { ...r, status: "Paid", commissionEarned: payoutAmount }
          : r,
      ),
      transactions: referrer
        ? [
            buildTransactionRecord({
              user: referrer,
              type: "Referral Commission",
              amount: payoutAmount,
              status: "Completed",
              channel: "Referral Program",
              note: `Commission settled for ${ref.referredUserName}`,
              reviewedBy: admin.fullName,
            }),
            ...prev.transactions,
          ]
        : prev.transactions,
      auditLogs: appendAudit(prev, {
        actorName: admin.fullName,
        actorRole: "admin",
        action: "REFERRAL_COMMISSION_PAID",
        targetType: "Referral",
        targetId: ref.id,
        summary: `Settled ${formatNaira(payoutAmount)} referral commission to ${ref.referrerName}.`,
        severity: "Info",
      }),
    }));
    return { ok: true };
  };

  const resetDemoState = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState(getDefaultState());
  };

  const value: AppStateContextValue = {
    session: state.session,
    currentUser,
    users: state.users,
    plans: state.plans,
    investments: state.investments,
    transactions: state.transactions,
    referrals: state.referrals,
    notifications: state.notifications,
    auditLogs: state.auditLogs,
    settings: state.settings,
    userWallet,
    userTransactions,
    userInvestments,
    userReferrals,
    userNotifications,
    unreadNotificationCount,
    login,
    register,
    logout,
    switchRoleDemo,
    createDeposit,
    requestWithdrawal,
    subscribeInvestment,
    updateProfile,
    updateBankAccount,
    markNotificationRead,
    markAllNotificationsRead,
    adminReviewTransaction,
    adminMatureInvestment,
    adminUpdateUserStatus,
    adminUpdateUserTier,
    adminCreatePlan,
    adminTogglePlanStatus,
    adminUpdatePlan,
    adminSendNotification,
    adminUpdateSettings,
    adminMarkReferralPaid,
    resetDemoState,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return ctx;
}

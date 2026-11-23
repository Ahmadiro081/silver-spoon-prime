import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppStateContext, type AppStateContextValue } from "@/context/AppStateContext";
import { mockDataProvider, type MockDataSnapshot } from "@/services/mockDataProvider";
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
  NotificationCategory,
  NotificationItem,
  TransactionStatus,
  UserProfile,
} from "@/types/domain";
import { calculateUserWalletMetrics } from "@/utils/calculations";
import { formatNaira, maskAccountNumber } from "@/utils/format";

type PersistedState = MockDataSnapshot;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => mockDataProvider.loadSnapshot());
  const [resetVersion, setResetVersion] = useState(0);

  useEffect(() => {
    mockDataProvider.saveSnapshot(state);
  }, [state]);

  const authenticatedUser = useMemo(() => {
    if (!state.session.authenticated) return null;
    return state.users.find((u) => u.id === state.session.userId) ?? null;
  }, [state.session.authenticated, state.session.userId, state.users]);

  const currentUser = useMemo(() => {
    return authenticatedUser ?? state.users.find((u) => u.id === state.session.userId) ?? state.users[0]!;
  }, [authenticatedUser, state.users, state.session.userId]);

  // Strict per-account isolation: never inherit another user's or investor's records
  const activeAccountId = authenticatedUser?.id ?? "";

  const userTransactions = useMemo(
    () =>
      activeAccountId
        ? state.transactions
            .filter((t) => t.userId === activeAccountId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : [],
    [state.transactions, activeAccountId],
  );

  const userInvestments = useMemo(
    () =>
      activeAccountId
        ? state.investments
            .filter((i) => i.userId === activeAccountId)
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        : [],
    [state.investments, activeAccountId],
  );

  const userWallet = useMemo(
    () => calculateUserWalletMetrics(userTransactions, userInvestments),
    [userTransactions, userInvestments],
  );

  const userReferrals = useMemo(
    () => (activeAccountId ? state.referrals.filter((r) => r.referrerId === activeAccountId) : []),
    [state.referrals, activeAccountId],
  );

  const userNotifications = useMemo(
    () =>
      activeAccountId
        ? state.notifications
            .filter((n) => n.userId === activeAccountId || n.userId === "ALL")
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : [],
    [state.notifications, activeAccountId],
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

  // ── Authentication & Account Management ──

  const login: PlatformServiceContract["login"] = (email, password) => {
    if (!email.trim() || !password.trim()) {
      return { ok: false, error: "Please enter both email address and password." };
    }
    const normalized = email.trim().toLowerCase();
    const matched = state.users.find((u) => u.email.toLowerCase() === normalized);
    const expectedPassword = matched?.password ?? "silverspoon2026";

    if (!matched || password !== expectedPassword) {
      return {
        ok: false,
        error:
          "Invalid email address or password. Verify your credentials or use a Demo Workspace button below.",
      };
    }

    if (matched.status === "Suspended") {
      return {
        ok: false,
        error: "This account is currently suspended. Contact compliance support.",
      };
    }

    setState((prev) => ({
      ...prev,
      session: { authenticated: true, userId: matched.id, role: matched.role },
      users: prev.users.map((u) =>
        u.id === matched.id ? { ...u, lastLoginAt: new Date().toISOString() } : u,
      ),
    }));
    return { ok: true, data: matched };
  };

  const register: PlatformServiceContract["register"] = (payload) => {
    if (!state.settings.allowNewRegistrations) {
      return { ok: false, error: "New client onboarding is temporarily paused by administration." };
    }
    const emailNormalized = payload.email.trim().toLowerCase();
    if (
      !payload.fullName.trim() ||
      !emailNormalized.includes("@") ||
      !emailNormalized.includes(".") ||
      payload.password.length < 8
    ) {
      return {
        ok: false,
        error: "Provide full name, a valid email address, and a password of at least 8 characters.",
      };
    }
    const exists = state.users.some((u) => u.email.toLowerCase() === emailNormalized);
    if (exists) {
      return { ok: false, error: "An account with this email already exists." };
    }

    const firstWord =
      payload.fullName
        .trim()
        .split(/\s+/)[0]
        ?.replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase()
        .slice(0, 6) || "CLIENT";

    const newUser: UserProfile = {
      id: generateId("USR"),
      fullName: payload.fullName.trim(),
      email: emailNormalized,
      password: payload.password,
      emailVerified: false,
      phone: payload.phone.trim() || "+234 800 000 0000",
      city: "Lagos",
      address: "Victoria Island, Lagos",
      role: "investor",
      tier: "Silver",
      status: "Active",
      kycLevel: "Tier 2",
      kycNote: "Standard onboarding Tier 2 profile (simulated).",
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
      ? state.users.find(
          (u) =>
            u.role === "investor" &&
            u.referralCode.toLowerCase() === payload.referralCode!.trim().toLowerCase(),
        )
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
            "Your independent Naira wealth account is ready. Complete email verification and fund your wallet to allocate into mandates.",
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
        summary: `New investor account registered (${newUser.email})${referrer ? ` via referral ${referrer.referralCode}` : ""}.`,
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
    const target =
      role === "investor"
        ? state.users.find((u) => u.id === "USR-1001") ?? state.users.find((u) => u.role === "investor")
        : state.users.find((u) => u.role === "admin");
    if (!target) return;
    setState((prev) => ({
      ...prev,
      session: { authenticated: true, userId: target.id, role: target.role },
      users: prev.users.map((u) =>
        u.id === target.id ? { ...u, lastLoginAt: new Date().toISOString() } : u,
      ),
    }));
  };

  const verifyEmail: PlatformServiceContract["verifyEmail"] = (email, code) => {
    const normalized = email.trim().toLowerCase();
    const trimmedCode = code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      return { ok: false, error: "Enter a valid 6-digit verification code (e.g. 482910)." };
    }
    const target = state.users.find((u) => u.email.toLowerCase() === normalized);
    if (!target) {
      return { ok: false, error: "No account matches that email address." };
    }

    const updatedUser: UserProfile = { ...target, emailVerified: true };
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === target.id ? updatedUser : u)),
      auditLogs: appendAudit(prev, {
        actorName: target.fullName,
        actorRole: target.role,
        action: "EMAIL_VERIFIED",
        targetType: "Security",
        targetId: target.id,
        summary: `Simulated email address verification completed for ${target.email}.`,
        severity: "Info",
      }),
    }));
    return { ok: true, data: updatedUser };
  };

  const requestPasswordReset: PlatformServiceContract["requestPasswordReset"] = (email) => {
    const normalized = email.trim().toLowerCase();
    const target = state.users.find((u) => u.email.toLowerCase() === normalized);
    if (!target) {
      return { ok: false, error: "No registered account was found with that email address." };
    }
    const resetToken = `SS-${Math.floor(100000 + Math.random() * 899999)}`;
    setState((prev) => ({
      ...prev,
      resetTokens: { ...prev.resetTokens, [normalized]: resetToken },
      auditLogs: appendAudit(prev, {
        actorName: target.fullName,
        actorRole: target.role,
        action: "PASSWORD_RESET_REQUESTED",
        targetType: "Security",
        targetId: target.id,
        summary: `Simulated password recovery token issued for ${target.email}.`,
        severity: "Review",
      }),
    }));
    return { ok: true, data: { resetToken } };
  };

  const resetPassword: PlatformServiceContract["resetPassword"] = (email, token, newPassword) => {
    const normalized = email.trim().toLowerCase();
    const target = state.users.find((u) => u.email.toLowerCase() === normalized);
    if (!target) {
      return { ok: false, error: "Account not found for the specified email." };
    }
    const expectedToken = state.resetTokens[normalized];
    if (!token.trim() || (expectedToken && token.trim() !== expectedToken && token.trim().length < 6)) {
      return { ok: false, error: "Invalid or expired recovery token." };
    }
    if (expectedToken && token.trim() !== expectedToken) {
      return { ok: false, error: "The recovery token does not match the issued code." };
    }
    if (newPassword.length < 8) {
      return { ok: false, error: "New password must be at least 8 characters." };
    }

    setState((prev) => {
      const nextTokens = { ...prev.resetTokens };
      delete nextTokens[normalized];
      return {
        ...prev,
        resetTokens: nextTokens,
        users: prev.users.map((u) =>
          u.id === target.id ? { ...u, password: newPassword } : u,
        ),
        notifications: [
          {
            id: generateId("NTF"),
            userId: target.id,
            title: "Password Reset Confirmed",
            message: "Your simulated account password was updated via recovery reset.",
            category: "security",
            createdAt: new Date().toISOString(),
            read: false,
          },
          ...prev.notifications,
        ],
        auditLogs: appendAudit(prev, {
          actorName: target.fullName,
          actorRole: target.role,
          action: "PASSWORD_RESET_COMPLETED",
          targetType: "Security",
          targetId: target.id,
          summary: `Password reset completed for ${target.email}.`,
          severity: "Review",
        }),
      };
    });
    return { ok: true };
  };

  const changePassword: PlatformServiceContract["changePassword"] = (
    currentPassword,
    newPassword,
  ) => {
    if (!authenticatedUser) {
      return { ok: false, error: "You must be signed in to update your password." };
    }
    const expected = authenticatedUser.password ?? "silverspoon2026";
    if (currentPassword !== expected) {
      return { ok: false, error: "Current password is incorrect." };
    }
    if (newPassword.length < 8) {
      return { ok: false, error: "New password must be at least 8 characters long." };
    }
    if (newPassword === currentPassword) {
      return { ok: false, error: "New password must differ from your current password." };
    }

    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === authenticatedUser.id ? { ...u, password: newPassword } : u,
      ),
      notifications: [
        {
          id: generateId("NTF"),
          userId: authenticatedUser.id,
          title: "Account Password Updated",
          message: "Your SILVER SPOON password was changed in Account Security Settings.",
          category: "security",
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...prev.notifications,
      ],
      auditLogs: appendAudit(prev, {
        actorName: authenticatedUser.fullName,
        actorRole: authenticatedUser.role,
        action: "PASSWORD_CHANGED",
        targetType: "Security",
        targetId: authenticatedUser.id,
        summary: `${authenticatedUser.fullName} updated their account password.`,
        severity: "Review",
      }),
    }));
    return { ok: true };
  };

  // ── Investor Financial Actions (Strictly scoped to authenticated investor) ──

  const createDeposit: PlatformServiceContract["createDeposit"] = (input: DepositInput) => {
    if (!authenticatedUser || authenticatedUser.role !== "investor") {
      return { ok: false, error: "Sign in with an investor account to initiate deposits." };
    }
    const validation = validateDeposit(input, state.settings);
    if (!validation.ok) return { ok: false, error: validation.error };

    const investor = authenticatedUser;
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
    if (!authenticatedUser || authenticatedUser.role !== "investor") {
      return { ok: false, error: "Sign in with an investor account to request withdrawals." };
    }
    const investor = authenticatedUser;
    const validation = validateWithdrawal(
      input,
      userWallet.availableBalance,
      investor,
      state.settings,
    );
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
    if (!authenticatedUser || authenticatedUser.role !== "investor") {
      return { ok: false, error: "Sign in with an investor account to allocate investments." };
    }
    const investor = authenticatedUser;
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
      note: `Allocated for ${plan.durationDays} days (target ${plan.targetReturnPercent}%, illustrative & non-guaranteed)`,
      reviewedBy: "Portfolio Allocation Desk",
    });

    setState((prev) => {
      // Phase 3.4: Complete referral qualification workflow with duplicate-credit guard
      const pendingReferral = prev.referrals.find(
        (r) =>
          r.referredUserId === investor.id &&
          r.status === "Pending" &&
          !r.qualifyingInvestmentId &&
          !r.payoutTxnId,
      );

      let nextReferrals = prev.referrals;
      let extraTxns: typeof prev.transactions = [];
      let extraNotifs: NotificationItem[] = [];
      let nextAudit = appendAudit(prev, {
        actorName: investor.fullName,
        actorRole: "investor",
        action: "INVESTMENT_ALLOCATED",
        targetType: "Investment",
        targetId: investment.id,
        summary: `Subscribed ${formatNaira(input.amount)} to ${plan.name}.`,
        severity: "Info",
      });

      if (pendingReferral) {
        const referrer = prev.users.find((u) => u.id === pendingReferral.referrerId);
        const commissionEarned = Math.round(
          (input.amount * pendingReferral.commissionRatePercent) / 100,
        );

        if (referrer && commissionEarned > 0) {
          const commissionTxn = buildTransactionRecord({
            user: referrer,
            type: "Referral Commission",
            amount: commissionEarned,
            status: "Completed",
            channel: `Referral Program (${pendingReferral.commissionRatePercent}%)`,
            note: `Simulated qualifying commission for ${investor.fullName} (${investment.id})`,
            reviewedBy: "Referral Settlement Engine",
          });

          nextReferrals = prev.referrals.map((r) =>
            r.id === pendingReferral.id
              ? {
                  ...r,
                  qualifyingInvestment: input.amount,
                  qualifyingInvestmentId: investment.id,
                  qualifiedAt: investment.startedAt,
                  payoutTxnId: commissionTxn.id,
                  commissionEarned,
                  status: "Paid",
                }
              : r,
          );

          extraTxns = [commissionTxn];
          extraNotifs = [
            {
              id: generateId("NTF"),
              userId: referrer.id,
              title: "Referral Commission Credited",
              message: `${investor.fullName} completed a qualifying allocation of ${formatNaira(input.amount)}. ${formatNaira(commissionEarned)} (${pendingReferral.commissionRatePercent}%) has been credited to your wallet.`,
              category: "referral",
              createdAt: investment.startedAt,
              read: false,
            },
          ];

          nextAudit = [
            {
              id: generateId("AUD"),
              timestamp: new Date().toISOString(),
              ipAddress: "102.89.34.18",
              actorName: "Referral Settlement Engine",
              actorRole: "system",
              action: "REFERRAL_QUALIFIED_AND_CREDITED",
              targetType: "Referral",
              targetId: pendingReferral.id,
              summary: `Qualified referral ${pendingReferral.id} from ${investment.id}; credited ${formatNaira(commissionEarned)} to ${referrer.fullName}.`,
              severity: "Info",
            },
            ...nextAudit,
          ];
        }
      }

      return {
        ...prev,
        investments: [investment, ...prev.investments],
        transactions: [txn, ...extraTxns, ...prev.transactions],
        referrals: nextReferrals,
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
          ...extraNotifs,
          ...prev.notifications,
        ],
        auditLogs: nextAudit,
      };
    });

    return { ok: true, data: investment };
  };

  const toggleInvestmentAutoCompound: PlatformServiceContract["toggleInvestmentAutoCompound"] = (
    investmentId,
  ) => {
    if (!authenticatedUser) {
      return { ok: false, error: "Sign in required." };
    }
    const target = state.investments.find(
      (i) => i.id === investmentId && i.userId === authenticatedUser.id,
    );
    if (!target) {
      return { ok: false, error: "Investment mandate not found." };
    }
    if (target.status !== "Active") {
      return { ok: false, error: "Auto-compound preference can only be changed on active mandates." };
    }
    const updated = { ...target, autoCompound: !target.autoCompound };
    setState((prev) => ({
      ...prev,
      investments: prev.investments.map((i) => (i.id === investmentId ? updated : i)),
      auditLogs: appendAudit(prev, {
        actorName: authenticatedUser.fullName,
        actorRole: "investor",
        action: "INVESTMENT_AUTOCOMPOUND_UPDATED",
        targetType: "Investment",
        targetId: investmentId,
        summary: `Set auto-compound preference on ${target.planName} (${investmentId}) to ${updated.autoCompound ? "Enabled" : "Disabled"}.`,
        severity: "Info",
      }),
    }));
    return { ok: true, data: updated };
  };

  const updateProfile: PlatformServiceContract["updateProfile"] = (updates) => {
    if (!authenticatedUser) return { ok: false, error: "Not authenticated." };
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === authenticatedUser.id ? { ...u, ...updates } : u)),
    }));
    return { ok: true };
  };

  const updateBankAccount: PlatformServiceContract["updateBankAccount"] = (
    bank: BankAccountDetails,
  ) => {
    if (!authenticatedUser) return { ok: false, error: "Not authenticated." };
    if (!/^\d{10}$/.test(bank.accountNumber)) {
      return { ok: false, error: "Nigerian NUBAN account numbers must be exactly 10 digits." };
    }
    if (!bank.accountName.trim()) {
      return { ok: false, error: "Enter the legal account holder name." };
    }
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === authenticatedUser.id ? { ...u, bankAccount: { ...bank, verified: true } } : u,
      ),
      auditLogs: appendAudit(prev, {
        actorName: authenticatedUser.fullName,
        actorRole: authenticatedUser.role,
        action: "BANK_ACCOUNT_UPDATED",
        targetType: "User",
        targetId: authenticatedUser.id,
        summary: `Updated payout NUBAN account (${bank.bankName} ${maskAccountNumber(bank.accountNumber)}).`,
        severity: "Info",
      }),
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
    if (!activeAccountId) return;
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.userId === activeAccountId || n.userId === "ALL" ? { ...n, read: true } : n,
      ),
    }));
  };

  // ── Administrator Actions ──

  const requireAdminActor = () => {
    if (!authenticatedUser || authenticatedUser.role !== "admin") return null;
    return authenticatedUser;
  };

  const adminReviewTransaction: PlatformServiceContract["adminReviewTransaction"] = (
    txnId,
    status,
    note,
  ) => {
    const actor = requireAdminActor();
    if (!actor) return { ok: false, error: "Administrator role required." };
    const target = state.transactions.find((t) => t.id === txnId);
    if (!target) return { ok: false, error: "Transaction record not found." };
    if (target.status !== "Pending") {
      return { ok: false, error: "This transaction has already been reviewed." };
    }

    const reviewNote = note?.trim() || target.note;

    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.map((t) =>
        t.id === txnId
          ? {
              ...t,
              status,
              note: reviewNote,
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
          message: `Your ${target.type.toLowerCase()} of ${formatNaira(target.amount)} (${target.reference}) was marked ${status.toLowerCase()}.${reviewNote ? ` Note: ${reviewNote}` : ""}`,
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
        summary: `Marked ${target.type} ${target.reference} (${formatNaira(target.amount)}) as ${status}.${reviewNote ? ` Reason: ${reviewNote}` : ""}`,
        severity: status === "Declined" ? "Critical" : "Info",
      }),
    }));
    return { ok: true };
  };

  const adminMatureInvestment: PlatformServiceContract["adminMatureInvestment"] = (investmentId) => {
    const admin = requireAdminActor();
    if (!admin) return { ok: false, error: "Administrator role required." };
    const inv = state.investments.find((i) => i.id === investmentId);
    if (!inv) return { ok: false, error: "Investment not found." };
    if (inv.status !== "Active") return { ok: false, error: "Only active investments can be matured." };

    const investor = state.users.find((u) => u.id === inv.userId);
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
        i.id === investmentId ? { ...i, status: "Matured", accruedReturn: realizedReturn } : i,
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
    const admin = requireAdminActor();
    if (!admin) return { ok: false, error: "Administrator role required." };
    const target = state.users.find((u) => u.id === userId);
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
    const admin = requireAdminActor();
    if (!admin) return { ok: false, error: "Administrator role required." };
    const target = state.users.find((u) => u.id === userId);
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

  const adminReviewUserKyc: PlatformServiceContract["adminReviewUserKyc"] = (userId, decision) => {
    const admin = requireAdminActor();
    if (!admin) return { ok: false, error: "Administrator role required." };
    const target = state.users.find((u) => u.id === userId);
    if (!target) return { ok: false, error: "User not found." };

    const now = new Date().toISOString();
    const kycNote =
      decision.note?.trim() ||
      (decision.status === "Active"
        ? `KYC approved at ${decision.kycLevel} by ${admin.fullName}.`
        : `KYC status updated to ${decision.status} (${decision.kycLevel}).`);

    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === userId
          ? {
              ...u,
              status: decision.status,
              kycLevel: decision.kycLevel,
              kycNote,
              kycUpdatedAt: now,
            }
          : u,
      ),
      notifications: [
        {
          id: generateId("NTF"),
          userId: target.id,
          title: `KYC Review Update: ${decision.kycLevel}`,
          message: `Your compliance status is now ${decision.status} (${decision.kycLevel}). ${kycNote}`,
          category: "security",
          createdAt: now,
          read: false,
        },
        ...prev.notifications,
      ],
      auditLogs: appendAudit(prev, {
        actorName: admin.fullName,
        actorRole: "admin",
        action: "USER_KYC_REVIEWED",
        targetType: "User",
        targetId: userId,
        summary: `Reviewed KYC for ${target.fullName}: ${decision.status} · ${decision.kycLevel}. ${kycNote}`,
        severity: decision.status === "Active" ? "Info" : "Review",
      }),
    }));
    return { ok: true };
  };

  const adminCreatePlan: PlatformServiceContract["adminCreatePlan"] = (input: CreatePlanInput) => {
    const admin = requireAdminActor();
    if (!admin) return { ok: false, error: "Administrator role required." };
    if (!input.name.trim() || input.minAmount <= 0 || input.maxAmount <= input.minAmount) {
      return { ok: false, error: "Provide a valid plan name and min/max Naira range." };
    }
    const newPlan: InvestmentPlan = {
      id: `plan-${input.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString().slice(-3)}`,
      ...input,
      status: "Active",
      allocationFocus: [
        "Nigerian Treasury Securities (55%)",
        "Corporate Fixed Income (35%)",
        "Liquidity Buffer (10%)",
      ],
      perks: [
        `${input.durationDays}-day cycle`,
        `${input.payoutFrequency} distribution`,
        "Monthly ledger reporting",
      ],
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
    const admin = requireAdminActor();
    if (!admin) return { ok: false, error: "Administrator role required." };
    const plan = state.plans.find((p) => p.id === planId);
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
    const admin = requireAdminActor();
    if (!admin) return { ok: false, error: "Administrator role required." };
    const plan = state.plans.find((p) => p.id === planId);
    if (!plan) return { ok: false, error: "Plan not found." };

    const nextMin = updates.minAmount ?? plan.minAmount;
    const nextMax = updates.maxAmount ?? plan.maxAmount;
    if (nextMin <= 0 || nextMax <= nextMin) {
      return { ok: false, error: "Maximum allocation must be greater than minimum allocation." };
    }

    setState((prev) => ({
      ...prev,
      plans: prev.plans.map((p) => (p.id === planId ? { ...p, ...updates } : p)),
      auditLogs: appendAudit(prev, {
        actorName: admin.fullName,
        actorRole: "admin",
        action: "PLAN_UPDATED",
        targetType: "Plan",
        targetId: planId,
        summary: `Updated parameters for ${updates.name ?? plan.name}.`,
        severity: "Review",
      }),
    }));
    return { ok: true };
  };

  const adminSendNotification: PlatformServiceContract["adminSendNotification"] = (payload) => {
    const admin = requireAdminActor();
    if (!admin) return { ok: false, error: "Administrator role required." };
    if (!payload.title.trim() || !payload.message.trim()) {
      return { ok: false, error: "Notification title and message are required." };
    }
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
    const admin = requireAdminActor();
    if (!admin) return { ok: false, error: "Administrator role required." };
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
    const admin = requireAdminActor();
    if (!admin) return { ok: false, error: "Administrator role required." };
    const ref = state.referrals.find((r) => r.id === referralId);
    if (!ref) return { ok: false, error: "Referral record not found." };
    if (ref.status === "Paid" || ref.payoutTxnId) {
      return { ok: false, error: "Commission has already been settled for this referral." };
    }
    if (ref.qualifyingInvestment <= 0) {
      return {
        ok: false,
        error: "Cannot settle commission before the referred client completes a qualifying investment.",
      };
    }

    const referrer = state.users.find((u) => u.id === ref.referrerId);
    const payoutAmount =
      ref.commissionEarned > 0
        ? ref.commissionEarned
        : Math.round((ref.qualifyingInvestment * ref.commissionRatePercent) / 100);

    const commissionTxn = referrer
      ? buildTransactionRecord({
          user: referrer,
          type: "Referral Commission",
          amount: payoutAmount,
          status: "Completed",
          channel: `Referral Program (${ref.commissionRatePercent}%)`,
          note: `Commission settled for ${ref.referredUserName}`,
          reviewedBy: admin.fullName,
        })
      : undefined;

    setState((prev) => ({
      ...prev,
      referrals: prev.referrals.map((r) =>
        r.id === referralId
          ? {
              ...r,
              status: "Paid",
              commissionEarned: payoutAmount,
              payoutTxnId: commissionTxn?.id,
            }
          : r,
      ),
      transactions: commissionTxn ? [commissionTxn, ...prev.transactions] : prev.transactions,
      notifications: referrer
        ? [
            {
              id: generateId("NTF"),
              userId: referrer.id,
              title: "Referral Commission Settled",
              message: `${formatNaira(payoutAmount)} referral commission for ${ref.referredUserName} has been credited to your available balance.`,
              category: "referral",
              createdAt: new Date().toISOString(),
              read: false,
            },
            ...prev.notifications,
          ]
        : prev.notifications,
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
    const keepAdmin = authenticatedUser?.role === "admin";
    const fresh = mockDataProvider.clearSnapshot();
    const adminSeed = fresh.users.find((u) => u.role === "admin");
    setState(
      keepAdmin && adminSeed
        ? {
            ...fresh,
            session: { authenticated: true, userId: adminSeed.id, role: "admin" },
          }
        : fresh,
    );
    setResetVersion((v) => v + 1);
  };

  const value: AppStateContextValue = {
    session: state.session,
    currentUser,
    authenticatedUser,
    resetVersion,
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
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    changePassword,
    createDeposit,
    requestWithdrawal,
    subscribeInvestment,
    toggleInvestmentAutoCompound,
    updateProfile,
    updateBankAccount,
    markNotificationRead,
    markAllNotificationsRead,
    adminReviewTransaction,
    adminMatureInvestment,
    adminUpdateUserStatus,
    adminUpdateUserTier,
    adminReviewUserKyc,
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

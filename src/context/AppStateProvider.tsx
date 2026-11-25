import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppStateContext, type AppStateContextValue } from "@/context/AppStateContext";
import {
  createAsyncOperationGuard,
  createEmptyPlatformSnapshot,
  InvalidDataProviderError,
  resolveDataProvider,
  type MockDataSnapshot,
  type PlatformDataProvider,
} from "@/services/dataProvider";
import type { PlatformServiceContract } from "@/services/platformService";
import type { ServiceResult, UserProfile } from "@/types/domain";
import { selectIsolatedAccountView } from "@/utils/mockIntegrity";

type PersistedState = MockDataSnapshot;

const EMPTY_GUEST_PROFILE: UserProfile = {
  id: "",
  fullName: "",
  email: "",
  emailVerified: false,
  phone: "",
  city: "",
  address: "",
  role: "investor",
  tier: "Silver",
  status: "Active",
  kycLevel: "Tier 1",
  referralCode: "",
  joinedAt: "",
  lastLoginAt: "",
  twoFactorEnabled: false,
  emailAlerts: false,
  smsAlerts: false,
  bankAccount: {
    bankName: "",
    bankCode: "",
    accountNumber: "",
    accountName: "",
    verified: false,
    verificationStatus: "Unverified",
  },
};

interface ProviderResolutionResult {
  provider: PlatformDataProvider | null;
  error: string | null;
}

function resolveInitialProvider(): ProviderResolutionResult {
  try {
    return { provider: resolveDataProvider(), error: null };
  } catch (err) {
    if (err instanceof InvalidDataProviderError) {
      return { provider: null, error: err.message };
    }
    return {
      provider: null,
      error:
        err instanceof Error && err.message
          ? err.message
          : "Unable to initialize the configured data provider.",
    };
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [{ provider, error: providerError }] = useState<ProviderResolutionResult>(() =>
    resolveInitialProvider(),
  );

  const [state, setState] = useState<PersistedState>(() =>
    provider ? provider.getState() : createEmptyPlatformSnapshot(),
  );
  const [resetVersion, setResetVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingOperations, setPendingOperations] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string | null>(providerError);

  const guardRef = useRef<ReturnType<typeof createAsyncOperationGuard> | null>(null);
  if (!guardRef.current) {
    guardRef.current = createAsyncOperationGuard((keys) => {
      setPendingOperations(keys);
    });
  }

  useEffect(() => {
    if (!provider) return;
    const unsubscribe = provider.subscribe((nextSnapshot) => {
      setState(nextSnapshot);
    });

    let active = true;
    setIsLoading(true);
    void provider
      .hydrateState()
      .then((hydrated) => {
        if (active) {
          setState(hydrated);
        }
      })
      .catch((err) => {
        if (active) {
          setLastError(
            err instanceof Error && err.message
              ? err.message
              : "Failed to hydrate application state from the active data provider.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [provider]);

  const clearLastError = useCallback(() => {
    setLastError(null);
  }, []);

  const isOperationPending = useCallback(
    (operationKey: string) => pendingOperations.includes(operationKey),
    [pendingOperations],
  );

  const runGuardedResult = useCallback(
    async <T,>(
      operationKey: string,
      action: (activeProvider: PlatformDataProvider) => Promise<ServiceResult<T>>,
    ): Promise<ServiceResult<T>> => {
      if (!provider) {
        const msg =
          providerError ??
          "Data provider configuration is invalid. Unable to execute platform operation.";
        setLastError(msg);
        return { ok: false, error: msg };
      }

      setLastError(null);
      const res = await guardRef.current!.runResult(operationKey, () => action(provider));
      if (!res.ok && res.error) {
        setLastError(res.error);
      }
      return res;
    },
    [provider, providerError],
  );

  const runGuardedVoid = useCallback(
    async (
      operationKey: string,
      action: (activeProvider: PlatformDataProvider) => Promise<void>,
    ): Promise<void> => {
      if (!provider) {
        const msg =
          providerError ??
          "Data provider configuration is invalid. Unable to execute platform operation.";
        setLastError(msg);
        return;
      }

      setLastError(null);
      const outcome = await guardRef.current!.runVoid(operationKey, () => action(provider));
      if (!outcome.ok && outcome.error) {
        setLastError(outcome.error);
      }
    },
    [provider, providerError],
  );

  const authenticatedUser = useMemo(() => {
    if (!state.session.authenticated) return null;
    return state.users.find((u) => u.id === state.session.userId) ?? null;
  }, [state.session.authenticated, state.session.userId, state.users]);

  const currentUser = useMemo(() => {
    return (
      authenticatedUser ??
      state.users.find((u) => u.id === state.session.userId) ??
      EMPTY_GUEST_PROFILE
    );
  }, [authenticatedUser, state.users, state.session.userId]);

  // Strict per-account isolation via centralized pure selector: never inherit another user's records
  const activeAccountId = authenticatedUser?.id ?? "";

  const isolatedAccountView = useMemo(
    () => selectIsolatedAccountView(state, activeAccountId),
    [state, activeAccountId],
  );

  const {
    transactions: userTransactions,
    investments: userInvestments,
    wallet: userWallet,
    referrals: userReferrals,
    notifications: userNotifications,
    unreadNotificationCount,
    kycSubmissions: userKycSubmissions,
  } = isolatedAccountView;

  const pendingVerificationCode = useMemo(() => {
    if (!authenticatedUser) return null;
    return state.verificationCodes[authenticatedUser.email.toLowerCase()] ?? null;
  }, [authenticatedUser, state.verificationCodes]);

  const pendingTwoFactorCode = useMemo(() => {
    if (!authenticatedUser) return null;
    return state.twoFactorCodes[authenticatedUser.id] ?? null;
  }, [authenticatedUser, state.twoFactorCodes]);

  // ── Delegated Async Service Methods (routed via src/services/dataProvider.ts) ──

  const login: PlatformServiceContract["login"] = useCallback(
    (email, password) => runGuardedResult("auth:login", (p) => p.login(email, password)),
    [runGuardedResult],
  );

  const register: PlatformServiceContract["register"] = useCallback(
    (payload) =>
      runGuardedResult("auth:register", async (p) => {
        const res = await p.register(payload);
        // Defense-in-depth invariant: public registration always creates an investor session.
        if (res.ok && res.data) {
          const newUser = res.data;
          setState((prev) => ({
            ...prev,
            session: { authenticated: true, userId: newUser.id, role: "investor" },
          }));
        }
        return res;
      }),
    [runGuardedResult],
  );

  const logout: PlatformServiceContract["logout"] = useCallback(
    () => runGuardedVoid("auth:logout", (p) => p.logout()),
    [runGuardedVoid],
  );

  const switchRoleDemo: PlatformServiceContract["switchRoleDemo"] = useCallback(
    (role) => runGuardedVoid("auth:switchRoleDemo", (p) => p.switchRoleDemo(role)),
    [runGuardedVoid],
  );

  const requestVerificationCode: PlatformServiceContract["requestVerificationCode"] = useCallback(
    () => runGuardedResult("auth:requestVerificationCode", (p) => p.requestVerificationCode()),
    [runGuardedResult],
  );

  const verifyEmail: PlatformServiceContract["verifyEmail"] = useCallback(
    (email, code) => runGuardedResult("auth:verifyEmail", (p) => p.verifyEmail(email, code)),
    [runGuardedResult],
  );

  const requestPasswordReset: PlatformServiceContract["requestPasswordReset"] = useCallback(
    (email) => runGuardedResult("auth:requestPasswordReset", (p) => p.requestPasswordReset(email)),
    [runGuardedResult],
  );

  const resetPassword: PlatformServiceContract["resetPassword"] = useCallback(
    (email, token, newPassword) =>
      runGuardedResult("auth:resetPassword", (p) => p.resetPassword(email, token, newPassword)),
    [runGuardedResult],
  );

  const changePassword: PlatformServiceContract["changePassword"] = useCallback(
    (currentPassword, newPassword) =>
      runGuardedResult("auth:changePassword", (p) =>
        p.changePassword(currentPassword, newPassword),
      ),
    [runGuardedResult],
  );

  const requestTwoFactorChallenge: PlatformServiceContract["requestTwoFactorChallenge"] =
    useCallback(
      (purpose) =>
        runGuardedResult("auth:requestTwoFactorChallenge", (p) =>
          p.requestTwoFactorChallenge(purpose),
        ),
      [runGuardedResult],
    );

  const enableTwoFactor: PlatformServiceContract["enableTwoFactor"] = useCallback(
    (code) => runGuardedResult("auth:enableTwoFactor", (p) => p.enableTwoFactor(code)),
    [runGuardedResult],
  );

  const disableTwoFactor: PlatformServiceContract["disableTwoFactor"] = useCallback(
    (currentPassword) =>
      runGuardedResult("auth:disableTwoFactor", (p) => p.disableTwoFactor(currentPassword)),
    [runGuardedResult],
  );

  const createDeposit: PlatformServiceContract["createDeposit"] = useCallback(
    (input) => runGuardedResult("investor:createDeposit", (p) => p.createDeposit(input)),
    [runGuardedResult],
  );

  const requestWithdrawal: PlatformServiceContract["requestWithdrawal"] = useCallback(
    (input) => runGuardedResult("investor:requestWithdrawal", (p) => p.requestWithdrawal(input)),
    [runGuardedResult],
  );

  const subscribeInvestment: PlatformServiceContract["subscribeInvestment"] = useCallback(
    (input) =>
      runGuardedResult("investor:subscribeInvestment", (p) => p.subscribeInvestment(input)),
    [runGuardedResult],
  );

  const toggleInvestmentAutoCompound: PlatformServiceContract["toggleInvestmentAutoCompound"] =
    useCallback(
      (investmentId) =>
        runGuardedResult(`investor:toggleAutoCompound:${investmentId}`, (p) =>
          p.toggleInvestmentAutoCompound(investmentId),
        ),
      [runGuardedResult],
    );

  const updateProfile: PlatformServiceContract["updateProfile"] = useCallback(
    (updates) => runGuardedResult("investor:updateProfile", (p) => p.updateProfile(updates)),
    [runGuardedResult],
  );

  const updateBankAccount: PlatformServiceContract["updateBankAccount"] = useCallback(
    (bank) => runGuardedResult("investor:updateBankAccount", (p) => p.updateBankAccount(bank)),
    [runGuardedResult],
  );

  const submitKycApplication: PlatformServiceContract["submitKycApplication"] = useCallback(
    (input) =>
      runGuardedResult("investor:submitKycApplication", (p) => p.submitKycApplication(input)),
    [runGuardedResult],
  );

  const markNotificationRead: PlatformServiceContract["markNotificationRead"] = useCallback(
    (id) =>
      runGuardedVoid(`investor:markNotificationRead:${id}`, (p) => p.markNotificationRead(id)),
    [runGuardedVoid],
  );

  const markAllNotificationsRead: PlatformServiceContract["markAllNotificationsRead"] = useCallback(
    () => runGuardedVoid("investor:markAllNotificationsRead", (p) => p.markAllNotificationsRead()),
    [runGuardedVoid],
  );

  const adminReviewTransaction: PlatformServiceContract["adminReviewTransaction"] = useCallback(
    (txnId, status, note) =>
      runGuardedResult(`admin:reviewTransaction:${txnId}`, (p) =>
        p.adminReviewTransaction(txnId, status, note),
      ),
    [runGuardedResult],
  );

  const adminMatureInvestment: PlatformServiceContract["adminMatureInvestment"] = useCallback(
    (investmentId) =>
      runGuardedResult(`admin:matureInvestment:${investmentId}`, (p) =>
        p.adminMatureInvestment(investmentId),
      ),
    [runGuardedResult],
  );

  const adminUpdateUserStatus: PlatformServiceContract["adminUpdateUserStatus"] = useCallback(
    (userId, status) =>
      runGuardedResult(`admin:updateUserStatus:${userId}`, (p) =>
        p.adminUpdateUserStatus(userId, status),
      ),
    [runGuardedResult],
  );

  const adminUpdateUserTier: PlatformServiceContract["adminUpdateUserTier"] = useCallback(
    (userId, tier) =>
      runGuardedResult(`admin:updateUserTier:${userId}`, (p) =>
        p.adminUpdateUserTier(userId, tier),
      ),
    [runGuardedResult],
  );

  const adminReviewUserKyc: PlatformServiceContract["adminReviewUserKyc"] = useCallback(
    (userId, decision) =>
      runGuardedResult(`admin:reviewUserKyc:${userId}`, (p) =>
        p.adminReviewUserKyc(userId, decision),
      ),
    [runGuardedResult],
  );

  const adminVerifyUserBankAccount: PlatformServiceContract["adminVerifyUserBankAccount"] =
    useCallback(
      (userId) =>
        runGuardedResult(`admin:verifyUserBankAccount:${userId}`, (p) =>
          p.adminVerifyUserBankAccount(userId),
        ),
      [runGuardedResult],
    );

  const adminCreatePlan: PlatformServiceContract["adminCreatePlan"] = useCallback(
    (input) => runGuardedResult("admin:createPlan", (p) => p.adminCreatePlan(input)),
    [runGuardedResult],
  );

  const adminTogglePlanStatus: PlatformServiceContract["adminTogglePlanStatus"] = useCallback(
    (planId, status) =>
      runGuardedResult(`admin:togglePlanStatus:${planId}`, (p) =>
        p.adminTogglePlanStatus(planId, status),
      ),
    [runGuardedResult],
  );

  const adminUpdatePlan: PlatformServiceContract["adminUpdatePlan"] = useCallback(
    (planId, updates) =>
      runGuardedResult(`admin:updatePlan:${planId}`, (p) => p.adminUpdatePlan(planId, updates)),
    [runGuardedResult],
  );

  const adminSendNotification: PlatformServiceContract["adminSendNotification"] = useCallback(
    (payload) =>
      runGuardedResult("admin:sendNotification", (p) => p.adminSendNotification(payload)),
    [runGuardedResult],
  );

  const adminUpdateSettings: PlatformServiceContract["adminUpdateSettings"] = useCallback(
    (updates) => runGuardedResult("admin:updateSettings", (p) => p.adminUpdateSettings(updates)),
    [runGuardedResult],
  );

  const adminMarkReferralPaid: PlatformServiceContract["adminMarkReferralPaid"] = useCallback(
    (referralId) =>
      runGuardedResult(`admin:markReferralPaid:${referralId}`, (p) =>
        p.adminMarkReferralPaid(referralId),
      ),
    [runGuardedResult],
  );

  const resetDemoState: PlatformServiceContract["resetDemoState"] = useCallback(
    () =>
      runGuardedVoid("system:resetDemoState", async (p) => {
        await p.resetDemoState();
        setResetVersion((v) => v + 1);
      }),
    [runGuardedVoid],
  );

  const value: AppStateContextValue = {
    activeProvider: provider?.id ?? null,
    providerStandby: provider?.standbyMode ?? false,
    providerError,
    isLoading,
    isMutating: pendingOperations.length > 0,
    pendingOperations,
    isOperationPending,
    lastError,
    clearLastError,
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
    kycSubmissions: state.kycSubmissions,
    userWallet,
    userTransactions,
    userInvestments,
    userReferrals,
    userNotifications,
    userKycSubmissions,
    unreadNotificationCount,
    pendingVerificationCode,
    pendingTwoFactorCode,
    requestVerificationCode,
    requestTwoFactorChallenge,
    enableTwoFactor,
    disableTwoFactor,
    submitKycApplication,
    adminVerifyUserBankAccount,
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

  if (providerError) {
    return (
      <AppStateContext.Provider value={value}>
        <div
          role="alert"
          className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground"
        >
          <div className="surface-card max-w-lg space-y-3 p-6">
            <p className="text-xs font-semibold tracking-wider text-destructive uppercase">
              Data Provider Configuration Error
            </p>
            <h1 className="font-display text-2xl font-medium text-foreground">
              Unsupported Data Provider
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{providerError}</p>
            <p className="text-xs text-muted-foreground">
              SILVER SPOON does not silently fall back to mock data when an unrecognized provider is
              configured. Update <code className="font-mono">VITE_DATA_PROVIDER</code> to{" "}
              <code className="font-mono">mock</code> or omit it to use the default mock provider.
            </p>
          </div>
        </div>
      </AppStateContext.Provider>
    );
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

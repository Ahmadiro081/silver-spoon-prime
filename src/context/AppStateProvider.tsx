import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppStateContext, type AppStateContextValue } from "@/context/AppStateContext";
import {
  createAsyncOperationGuard,
  createEmptyPlatformSnapshot,
  createInitialAdminReadSnapshot,
  createInitialInvestorReadSnapshot,
  createUnauthenticatedOnboardingState,
  InvalidAuthProviderError,
  InvalidDataProviderError,
  isAuthSessionExpired,
  mapMockUserToAuthUser,
  resolveAdminReadOrchestrator,
  resolveAuthAdapter,
  resolveDataProvider,
  resolveInvestorReadOrchestrator,
  type AdminReadOnlyOrchestrator,
  type AdminReadSnapshot,
  type AuthContract,
  type AuthError,
  type AuthEventType,
  type AuthResult,
  type AuthSession,
  type AuthStateModel,
  type InvestorReadOnlyOrchestrator,
  type InvestorReadSnapshot,
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
  authAdapter: AuthContract | null;
  investorOrchestrator: InvestorReadOnlyOrchestrator | null;
  adminOrchestrator: AdminReadOnlyOrchestrator | null;
  error: string | null;
}

function resolveInitialProvider(): ProviderResolutionResult {
  try {
    return {
      provider: resolveDataProvider(),
      authAdapter: resolveAuthAdapter(),
      investorOrchestrator: resolveInvestorReadOrchestrator(),
      adminOrchestrator: resolveAdminReadOrchestrator(),
      error: null,
    };
  } catch (err) {
    if (err instanceof InvalidDataProviderError || err instanceof InvalidAuthProviderError) {
      return {
        provider: null,
        authAdapter: null,
        investorOrchestrator: null,
        adminOrchestrator: null,
        error: err.message,
      };
    }
    return {
      provider: null,
      authAdapter: null,
      investorOrchestrator: null,
      adminOrchestrator: null,
      error:
        err instanceof Error && err.message
          ? err.message
          : "Unable to initialize the configured data provider.",
    };
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [{ provider, authAdapter, investorOrchestrator, adminOrchestrator, error: providerError }] =
    useState<ProviderResolutionResult>(() => resolveInitialProvider());

  const [state, setState] = useState<PersistedState>(() =>
    provider ? provider.getState() : createEmptyPlatformSnapshot(),
  );
  const [investorReadData, setInvestorReadData] = useState<InvestorReadSnapshot>(() =>
    createInitialInvestorReadSnapshot(
      provider?.id ?? null,
      providerError ? "error" : provider?.standbyMode ? "disconnected" : "idle",
      providerError
        ? {
            error: {
              code: "PROVIDER_CONFIG_ERROR",
              message: providerError,
              recoverable: false,
            },
          }
        : undefined,
    ),
  );
  const [adminReadData, setAdminReadData] = useState<AdminReadSnapshot>(() =>
    createInitialAdminReadSnapshot(
      provider?.id ?? null,
      providerError ? "error" : provider?.standbyMode ? "disconnected" : "idle",
      providerError
        ? {
            error: {
              code: "PROVIDER_CONFIG_ERROR",
              message: providerError,
              recoverable: false,
            },
          }
        : undefined,
    ),
  );
  const [resetVersion, setResetVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(!provider);
  const [authError, setAuthError] = useState<AuthError | null>(
    providerError
      ? {
          code: "AUTH_PROVIDER_CONFIG_ERROR",
          message: providerError,
          provider: "mock",
          retryable: false,
        }
      : null,
  );
  const [lastAuthEvent, setLastAuthEvent] = useState<AuthEventType | null>(null);
  const [sessionExpiredFlag, setSessionExpiredFlag] = useState(false);
  const [pendingOperations, setPendingOperations] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string | null>(providerError);

  const guardRef = useRef<ReturnType<typeof createAsyncOperationGuard> | null>(null);
  if (!guardRef.current) {
    guardRef.current = createAsyncOperationGuard((keys) => {
      setPendingOperations(keys);
    });
  }

  useEffect(() => {
    if (!provider) {
      setAuthInitialized(true);
      return;
    }
    const unsubscribeData = provider.subscribe((nextSnapshot) => {
      setState(nextSnapshot);
    });
    const unsubscribeAuth = authAdapter
      ? authAdapter.onAuthStateChange((evt) => {
          setLastAuthEvent(evt.event);
          if (evt.event === "SESSION_EXPIRED") {
            setSessionExpiredFlag(true);
          } else if (evt.event === "SIGNED_IN" || evt.event === "TOKEN_REFRESHED") {
            setSessionExpiredFlag(false);
            setAuthError(null);
          } else if (evt.event === "SIGNED_OUT") {
            setSessionExpiredFlag(false);
          }
        })
      : () => {};

    let active = true;
    setIsLoading(true);
    void provider
      .hydrateState()
      .then((hydrated) => {
        if (active) {
          setState(hydrated);
          setLastAuthEvent("INITIAL_SESSION");
          setAuthInitialized(true);
        }
      })
      .catch((err) => {
        if (active) {
          const message =
            err instanceof Error && err.message
              ? err.message
              : "Failed to hydrate application state from the active data provider.";
          setLastError(message);
          setAuthError({
            code: "AUTH_UNKNOWN_ERROR",
            message,
            provider: provider.id,
            retryable: true,
          });
          setAuthInitialized(true);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      unsubscribeAuth();
      unsubscribeData();
    };
  }, [provider, authAdapter]);

  const refreshInvestorReadData = useCallback(async () => {
    if (!investorOrchestrator) {
      setInvestorReadData(
        createInitialInvestorReadSnapshot(null, "error", {
          error: {
            code: "PROVIDER_CONFIG_ERROR",
            message: providerError ?? "Investor data provider is not configured.",
            recoverable: false,
          },
        }),
      );
      return;
    }
    setInvestorReadData((prev) => ({ ...prev, status: "loading", isLoading: true }));
    try {
      const next = await investorOrchestrator.loadInvestorSnapshot();
      setInvestorReadData(next);
    } catch (err) {
      setInvestorReadData(
        createInitialInvestorReadSnapshot(provider?.id ?? null, "error", {
          error: {
            code: "READ_ERROR",
            message:
              err instanceof Error && err.message
                ? err.message
                : "Unable to refresh investor portfolio data.",
            recoverable: true,
          },
        }),
      );
    }
  }, [investorOrchestrator, provider, providerError]);

  useEffect(() => {
    if (!investorOrchestrator) return;
    let active = true;
    void investorOrchestrator
      .loadInvestorSnapshot()
      .then((next) => {
        if (active) {
          setInvestorReadData(next);
        }
      })
      .catch((err) => {
        if (active) {
          setInvestorReadData(
            createInitialInvestorReadSnapshot(provider?.id ?? null, "error", {
              error: {
                code: "READ_ERROR",
                message:
                  err instanceof Error && err.message
                    ? err.message
                    : "Unable to synchronize investor read-only data.",
                recoverable: true,
              },
            }),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [investorOrchestrator, provider, state, sessionExpiredFlag]);

  const refreshAdminReadData = useCallback(async () => {
    if (!adminOrchestrator) {
      setAdminReadData(
        createInitialAdminReadSnapshot(null, "error", {
          error: {
            code: "PROVIDER_CONFIG_ERROR",
            message: providerError ?? "Administrative data provider is not configured.",
            recoverable: false,
          },
        }),
      );
      return;
    }
    setAdminReadData((prev) => ({ ...prev, status: "loading", isLoading: true }));
    try {
      const next = await adminOrchestrator.loadAdminSnapshot();
      setAdminReadData(next);
    } catch (err) {
      setAdminReadData(
        createInitialAdminReadSnapshot(provider?.id ?? null, "error", {
          error: {
            code: "READ_ERROR",
            message:
              err instanceof Error && err.message
                ? err.message
                : "Unable to refresh administrative read-only data.",
            recoverable: true,
          },
        }),
      );
    }
  }, [adminOrchestrator, provider, providerError]);

  useEffect(() => {
    if (!adminOrchestrator) return;
    let active = true;
    void adminOrchestrator
      .loadAdminSnapshot()
      .then((next) => {
        if (active) {
          setAdminReadData(next);
        }
      })
      .catch((err) => {
        if (active) {
          setAdminReadData(
            createInitialAdminReadSnapshot(provider?.id ?? null, "error", {
              error: {
                code: "READ_ERROR",
                message:
                  err instanceof Error && err.message
                    ? err.message
                    : "Unable to synchronize administrative read-only data.",
                recoverable: true,
              },
            }),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [adminOrchestrator, provider, state, sessionExpiredFlag]);

  const clearLastError = useCallback(() => {
    setLastError(null);
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
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

  const sessionIsExpired = useMemo(() => {
    if (sessionExpiredFlag) return true;
    if (!state.session.authenticated || !state.session.expiresAt) return false;
    return isAuthSessionExpired({ expiresAt: state.session.expiresAt, expired: false });
  }, [sessionExpiredFlag, state.session.authenticated, state.session.expiresAt]);

  const authenticatedUser = useMemo(() => {
    if (!state.session.authenticated || sessionIsExpired) return null;
    const matched = state.users.find((u) => u.id === state.session.userId) ?? null;
    if (!matched || matched.status === "Suspended") return null;
    return matched;
  }, [state.session.authenticated, state.session.userId, state.users, sessionIsExpired]);

  const currentUser = useMemo(() => {
    return (
      authenticatedUser ??
      state.users.find((u) => u.id === state.session.userId) ??
      EMPTY_GUEST_PROFILE
    );
  }, [authenticatedUser, state.users, state.session.userId]);

  const authState: AuthStateModel = useMemo(() => {
    const authLoading =
      isLoading ||
      pendingOperations.some((op) => op.startsWith("auth:"));

    if (!authenticatedUser) {
      return {
        initialized: authInitialized,
        authenticated: false,
        user: null,
        session: null,
        sessionAvailable: false,
        sessionExpired: sessionIsExpired,
        emailVerified: false,
        portalRole: null,
        dbRoles: [],
        roleAuthority: authAdapter?.roleAuthority ?? "mock_local",
        onboarding: createUnauthenticatedOnboardingState(),
        loading: authLoading,
        error: authError,
        provider: provider?.id ?? null,
        standby: authAdapter?.standbyMode ?? provider?.standbyMode ?? false,
        lastEvent: lastAuthEvent,
      };
    }

    const mappedUser = mapMockUserToAuthUser(authenticatedUser);
    const issuedAt = state.session.issuedAt ?? authenticatedUser.lastLoginAt ?? new Date().toISOString();
    const expiresAt =
      state.session.expiresAt ??
      new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    const mappedSession: AuthSession = {
      authenticated: true,
      userId: authenticatedUser.id,
      portalRole: authenticatedUser.role,
      dbRoles: mappedUser.dbRoles,
      roleAuthority: authAdapter?.roleAuthority ?? "mock_local",
      provider: provider?.id ?? "mock",
      issuedAt,
      expiresAt,
      expired: false,
      emailVerified: Boolean(authenticatedUser.emailVerified),
    };

    return {
      initialized: authInitialized,
      authenticated: true,
      user: mappedUser,
      session: mappedSession,
      sessionAvailable: true,
      sessionExpired: false,
      emailVerified: mappedUser.emailVerified,
      portalRole: mappedUser.portalRole,
      dbRoles: mappedUser.dbRoles,
      roleAuthority: authAdapter?.roleAuthority ?? "mock_local",
      onboarding: mappedUser.onboarding,
      loading: authLoading,
      error: authError,
      provider: provider?.id ?? null,
      standby: authAdapter?.standbyMode ?? provider?.standbyMode ?? false,
      lastEvent: lastAuthEvent,
    };
  }, [
    authenticatedUser,
    authInitialized,
    authAdapter,
    authError,
    isLoading,
    lastAuthEvent,
    pendingOperations,
    provider,
    sessionIsExpired,
    state.session.expiresAt,
    state.session.issuedAt,
  ]);

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

  // ── Delegated Async Auth & Service Methods (routed via src/services/dataProvider.ts) ──

  const refreshSession = useCallback(async (): Promise<AuthResult<AuthSession | null>> => {
    if (!authAdapter) {
      const err: AuthError = {
        code: "AUTH_PROVIDER_CONFIG_ERROR",
        message: providerError ?? "Authentication provider is not configured.",
        provider: "mock",
        retryable: false,
      };
      setAuthError(err);
      return { ok: false, data: null, error: err };
    }
    const res = await authAdapter.refreshSession();
    if (!res.ok && res.error) {
      setAuthError(res.error);
      if (res.error.code === "AUTH_SESSION_EXPIRED") {
        setSessionExpiredFlag(true);
      }
    } else {
      setAuthError(null);
      setSessionExpiredFlag(false);
    }
    return res;
  }, [authAdapter, providerError]);

  const login: PlatformServiceContract["login"] = useCallback(
    (email, password) =>
      runGuardedResult("auth:login", async (p) => {
        setAuthError(null);
        if (authAdapter) {
          const authRes = await authAdapter.login({ email, password });
          if (!authRes.ok || !authRes.data) {
            if (authRes.error) setAuthError(authRes.error);
            return {
              ok: false,
              error: authRes.error?.message ?? "Invalid email address or password.",
            };
          }
          setSessionExpiredFlag(false);
          const profile =
            authRes.data.profile ??
            p.getState().users.find((u) => u.id === authRes.data!.user.id);
          return profile ? { ok: true, data: profile } : { ok: false, error: "Profile unavailable." };
        }
        return p.login(email, password);
      }),
    [runGuardedResult, authAdapter],
  );

  const register: PlatformServiceContract["register"] = useCallback(
    (payload) =>
      runGuardedResult("auth:register", async (p) => {
        setAuthError(null);
        if (authAdapter) {
          const authRes = await authAdapter.register(payload);
          if (!authRes.ok || !authRes.data) {
            if (authRes.error) setAuthError(authRes.error);
            return {
              ok: false,
              error: authRes.error?.message ?? "Unable to register account.",
            };
          }
          const newUser =
            authRes.data.profile ??
            p.getState().users.find((u) => u.id === authRes.data!.user.id);
          // Defense-in-depth invariant: public registration always creates an investor session.
          if (newUser) {
            setSessionExpiredFlag(false);
            setState((prev) => ({
              ...prev,
              session: { authenticated: true, userId: newUser.id, role: "investor" },
            }));
            return { ok: true, data: newUser };
          }
          return { ok: false, error: "Registered account profile unavailable." };
        }
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
    [runGuardedResult, authAdapter],
  );

  const logout: PlatformServiceContract["logout"] = useCallback(
    () =>
      runGuardedVoid("auth:logout", async (p) => {
        setAuthError(null);
        setSessionExpiredFlag(false);
        if (authAdapter) {
          await authAdapter.logout();
          return;
        }
        await p.logout();
      }),
    [runGuardedVoid, authAdapter],
  );

  const switchRoleDemo: PlatformServiceContract["switchRoleDemo"] = useCallback(
    (role) => runGuardedVoid("auth:switchRoleDemo", (p) => p.switchRoleDemo(role)),
    [runGuardedVoid],
  );

  const requestVerificationCode: PlatformServiceContract["requestVerificationCode"] = useCallback(
    () =>
      runGuardedResult("auth:requestVerificationCode", async (p) => {
        if (authAdapter) {
          const authRes = await authAdapter.resendVerificationEmail();
          if (!authRes.ok || !authRes.data) {
            if (authRes.error) setAuthError(authRes.error);
            return {
              ok: false,
              error: authRes.error?.message ?? "Unable to request verification code.",
            };
          }
          return { ok: true, data: { code: authRes.data.simulatedCode ?? "" } };
        }
        return p.requestVerificationCode();
      }),
    [runGuardedResult, authAdapter],
  );

  const verifyEmail: PlatformServiceContract["verifyEmail"] = useCallback(
    (email, code) =>
      runGuardedResult("auth:verifyEmail", async (p) => {
        if (authAdapter) {
          const authRes = await authAdapter.verifyEmail({ email, tokenOrCode: code });
          if (!authRes.ok || !authRes.data) {
            if (authRes.error) setAuthError(authRes.error);
            return {
              ok: false,
              error: authRes.error?.message ?? "Unable to verify email address.",
            };
          }
          const updatedProfile = p.getState().users.find((u) => u.id === authRes.data!.id);
          return updatedProfile
            ? { ok: true, data: updatedProfile }
            : { ok: false, error: "Verified user profile unavailable." };
        }
        return p.verifyEmail(email, code);
      }),
    [runGuardedResult, authAdapter],
  );

  const requestPasswordReset: PlatformServiceContract["requestPasswordReset"] = useCallback(
    (email) =>
      runGuardedResult("auth:requestPasswordReset", async (p) => {
        if (authAdapter) {
          const authRes = await authAdapter.requestPasswordReset({ email });
          if (!authRes.ok || !authRes.data) {
            if (authRes.error) setAuthError(authRes.error);
            return {
              ok: false,
              error: authRes.error?.message ?? "Unable to request password recovery.",
            };
          }
          return { ok: true, data: { resetToken: authRes.data.simulatedResetToken ?? "" } };
        }
        return p.requestPasswordReset(email);
      }),
    [runGuardedResult, authAdapter],
  );

  const resetPassword: PlatformServiceContract["resetPassword"] = useCallback(
    (email, token, newPassword) =>
      runGuardedResult("auth:resetPassword", async (p) => {
        if (authAdapter) {
          const authRes = await authAdapter.resetPassword({ email, token, newPassword });
          if (!authRes.ok) {
            if (authRes.error) setAuthError(authRes.error);
            return {
              ok: false,
              error: authRes.error?.message ?? "Unable to reset password.",
            };
          }
          return { ok: true };
        }
        return p.resetPassword(email, token, newPassword);
      }),
    [runGuardedResult, authAdapter],
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
    authState,
    refreshSession,
    clearAuthError,
    investorReadData,
    refreshInvestorReadData,
    adminReadData,
    refreshAdminReadData,
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

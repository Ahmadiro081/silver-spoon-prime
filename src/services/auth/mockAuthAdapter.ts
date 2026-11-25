import {
  DEFAULT_MOCK_SESSION_TTL_MS,
  isAuthSessionExpired,
  validateAuthEmailInput,
  validateAuthPasswordInput,
  type AuthContract,
  type AuthError,
  type AuthErrorCode,
  type AuthEventType,
  type AuthLoginRequest,
  type AuthLoginResponse,
  type AuthPasswordResetRequest,
  type AuthPasswordResetRequestResponse,
  type AuthRegisterRequest,
  type AuthRegisterResponse,
  type AuthResendVerificationResponse,
  type AuthResetPasswordInput,
  type AuthResult,
  type AuthSession,
  type AuthStateChangeEvent,
  type AuthStateChangeListener,
  type AuthUser,
  type AuthVerifyEmailRequest,
  type OnboardingState,
} from "@/services/auth/types";
import { resolveAuthoritativeRoleFromUser } from "@/services/admin/sanitizers";
import {
  mockDataProvider,
  type MockDataProviderContract,
  type MockDataSnapshot,
} from "@/services/mockDataProvider";
import type { DbAccountStatusCode, DbAppRole } from "@/services/supabase/enums";
import type { AccountStatus, SessionState, UserProfile } from "@/types/domain";

/**
 * SILVER SPOON — Phase 6.4 Mock Authentication Provider Adapter
 *
 * Adapts the existing browser-local `mockDataProvider` to the async `AuthContract`
 * while preserving 100% of existing mock authentication behavior, clean empty
 * initial state, route protection, and zero synthetic/demo accounts.
 *
 * Security invariants:
 * - Never exposes passwords or synthetic tokens in `AuthUser` or `AuthSession`.
 * - Tracks session expiry cleanly and purges expired sessions automatically.
 * - Treats frontend roles as `"mock_local"` so mock authority is never confused
 *   with future database-authoritative Supabase RBAC.
 */

export interface MockAuthAdapterOptions {
  readonly dataProvider?: MockDataProviderContract;
  readonly sessionTtlMs?: number;
  readonly now?: () => number;
}

export interface MockAuthAdapterContract extends AuthContract {
  readonly providerId: "mock";
  readonly standbyMode: false;
  readonly roleAuthority: "mock_local";
  /**
   * Forces current session expiration and clears authenticated state cleanly.
   * Useful for inactivity timeouts and deterministic session-expiration verification.
   */
  expireSession(): Promise<AuthResult<void>>;
  /**
   * Projects a `MockDataSnapshot` into sanitized `{ user, session, expired }`.
   */
  inspectSnapshot(snapshot?: MockDataSnapshot): {
    user: AuthUser | null;
    session: AuthSession | null;
    expired: boolean;
  };
}

function mapFrontendStatusToDbStatus(status: AccountStatus): DbAccountStatusCode {
  switch (status) {
    case "Active":
      return "active";
    case "Pending KYC":
      return "pending_verification";
    case "Suspended":
      return "suspended";
  }
}

function mapFrontendRoleToMockDbRoles(user: UserProfile): readonly DbAppRole[] {
  return [resolveAuthoritativeRoleFromUser(user)];
}

export function deriveMockOnboardingState(user: UserProfile): OnboardingState {
  const isSuspended = user.status === "Suspended";
  const emailVerified = Boolean(user.emailVerified);
  const complianceComplete = user.status === "Active" && user.kycLevel !== "Tier 1";

  let stage: OnboardingState["stage"];
  if (isSuspended) {
    stage = "account_restricted";
  } else if (!emailVerified) {
    stage = "awaiting_email_verification";
  } else if (user.status === "Pending KYC") {
    stage = "awaiting_kyc_or_compliance";
  } else {
    stage = "ready";
  }

  return {
    stage,
    authUserCreated: "completed",
    emailVerified: emailVerified ? "completed" : "pending",
    profileCreated: "completed",
    investorRoleAssigned: "completed",
    walletProvisioned: "completed",
    accountStatusChecked: isSuspended ? "blocked" : "completed",
    complianceChecksComplete: complianceComplete ? "completed" : "pending",
    missingBackendArtifacts: [],
    requiresServerProvisioning: false,
  };
}

/**
 * Projects a `UserProfile` into a sanitized `AuthUser` (guaranteed zero password fields).
 */
export function mapMockUserToAuthUser(user: UserProfile): AuthUser {
  const dbRoles = mapFrontendRoleToMockDbRoles(user);
  return {
    id: user.id,
    email: user.email.trim().toLowerCase(),
    fullName: user.fullName,
    emailVerified: Boolean(user.emailVerified),
    portalRole: user.role,
    dbRoles,
    roleAuthority: "mock_local",
    accountStatus: user.status,
    dbAccountStatus: mapFrontendStatusToDbStatus(user.status),
    onboarding: deriveMockOnboardingState(user),
    lastSignInAt: user.lastLoginAt || null,
  };
}

function buildMockAuthSession(
  session: SessionState,
  user: UserProfile,
  sessionTtlMs: number,
  nowMs: number,
): AuthSession {
  const issuedAt = session.issuedAt ?? user.lastLoginAt ?? new Date(nowMs).toISOString();
  const issuedMs = Date.parse(issuedAt);
  const safeIssuedMs = Number.isFinite(issuedMs) ? issuedMs : nowMs;
  const expiresAt =
    session.expiresAt ?? new Date(safeIssuedMs + Math.max(1000, sessionTtlMs)).toISOString();
  const expired = isAuthSessionExpired({ expiresAt, expired: false }, nowMs);

  return {
    authenticated: session.authenticated && !expired && user.status !== "Suspended",
    userId: user.id,
    portalRole: user.role,
    dbRoles: mapFrontendRoleToMockDbRoles(user),
    roleAuthority: "mock_local",
    provider: "mock",
    issuedAt: new Date(safeIssuedMs).toISOString(),
    expiresAt,
    expired,
    emailVerified: Boolean(user.emailVerified),
  };
}

function classifyMockAuthError(message: string, fallback: AuthErrorCode): AuthError {
  const lower = message.toLowerCase();
  let code: AuthErrorCode = fallback;

  if (lower.includes("suspended")) {
    code = "AUTH_ACCOUNT_SUSPENDED";
  } else if (lower.includes("already exists")) {
    code = "AUTH_EMAIL_ALREADY_EXISTS";
  } else if (lower.includes("onboarding is temporarily paused")) {
    code = "AUTH_REGISTRATION_DISABLED";
  } else if (lower.includes("invalid email") || lower.includes("password")) {
    code = "AUTH_INVALID_CREDENTIALS";
  } else if (lower.includes("verification code")) {
    code = "AUTH_INVALID_VERIFICATION_CODE";
  } else if (lower.includes("recovery token")) {
    code = "AUTH_INVALID_RECOVERY_TOKEN";
  } else if (lower.includes("sign in")) {
    code = "AUTH_UNAUTHENTICATED";
  }

  return {
    code,
    message,
    provider: "mock",
    retryable: false,
  };
}

function stripPasswordFromProfile(profile: UserProfile): UserProfile {
  if (!("password" in profile) || profile.password === undefined) {
    return profile;
  }
  const { password: _omitted, ...safeProfile } = profile;
  void _omitted;
  return safeProfile;
}

export function createMockAuthAdapter(
  options: MockAuthAdapterOptions = {},
): MockAuthAdapterContract {
  const provider = options.dataProvider ?? mockDataProvider;
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_MOCK_SESSION_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<AuthStateChangeListener>();

  // Track session timestamps in-memory per user so refresh/expiry works cleanly
  // even when snapshots are mutated via `mockDataProvider` directly.
  let activeSessionWindow: { userId: string; issuedAt: string; expiresAt: string } | null = null;

  const emit = (
    event: AuthEventType,
    session: AuthSession | null,
    user: AuthUser | null,
  ): void => {
    const payload: AuthStateChangeEvent = {
      event,
      session,
      user,
      timestamp: new Date(now()).toISOString(),
    };
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // Isolate subscriber errors so auth state synchronization never breaks
      }
    }
  };

  const inspectSnapshot = (
    snapshot: MockDataSnapshot = provider.getState(),
  ): { user: AuthUser | null; session: AuthSession | null; expired: boolean } => {
    const nowMs = now();
    if (!snapshot.session.authenticated || !snapshot.session.userId) {
      return { user: null, session: null, expired: false };
    }
    const matched = snapshot.users.find((u) => u.id === snapshot.session.userId);
    if (!matched || matched.status === "Suspended") {
      return { user: null, session: null, expired: false };
    }

    const effectiveSessionState: SessionState =
      activeSessionWindow && activeSessionWindow.userId === matched.id
        ? {
            ...snapshot.session,
            issuedAt: activeSessionWindow.issuedAt,
            expiresAt: activeSessionWindow.expiresAt,
          }
        : snapshot.session;

    const authSession = buildMockAuthSession(effectiveSessionState, matched, sessionTtlMs, nowMs);
    if (authSession.expired) {
      return { user: null, session: null, expired: true };
    }
    const authUser = mapMockUserToAuthUser(matched);
    return { user: authUser, session: authSession, expired: false };
  };

  const openSessionWindow = (userId: string): { issuedAt: string; expiresAt: string } => {
    const nowMs = now();
    const window = {
      userId,
      issuedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + Math.max(1000, sessionTtlMs)).toISOString(),
    };
    activeSessionWindow = window;
    return { issuedAt: window.issuedAt, expiresAt: window.expiresAt };
  };

  const clearExpiredSessionIfNeeded = async (): Promise<boolean> => {
    const inspection = inspectSnapshot();
    if (!inspection.expired) return false;
    activeSessionWindow = null;
    await provider.logout();
    emit("SESSION_EXPIRED", null, null);
    return true;
  };

  return {
    providerId: "mock",
    standbyMode: false,
    roleAuthority: "mock_local",

    inspectSnapshot,

    async register(input: AuthRegisterRequest): Promise<AuthResult<AuthRegisterResponse>> {
      const emailCheck = validateAuthEmailInput(input.email);
      if (!emailCheck.valid) {
        return {
          ok: false,
          error: {
            code: "AUTH_INVALID_INPUT",
            message: emailCheck.error ?? "Provide a valid email address.",
            provider: "mock",
            retryable: false,
          },
        };
      }
      const passwordCheck = validateAuthPasswordInput(input.password);
      if (!passwordCheck.valid) {
        return {
          ok: false,
          error: {
            code: "AUTH_INVALID_INPUT",
            message: passwordCheck.error ?? "Invalid password.",
            provider: "mock",
            retryable: false,
          },
        };
      }

      const res = await provider.register({
        fullName: input.fullName,
        email: input.email,
        password: input.password,
        phone: input.phone,
        referralCode: input.referralCode,
      });

      if (!res.ok || !res.data) {
        return {
          ok: false,
          error: classifyMockAuthError(
            res.error ?? "Unable to register account.",
            "AUTH_INVALID_INPUT",
          ),
        };
      }

      const safeProfile = stripPasswordFromProfile(res.data);
      const window = openSessionWindow(safeProfile.id);
      const authUser = mapMockUserToAuthUser(safeProfile);
      const authSession = buildMockAuthSession(
        {
          authenticated: true,
          userId: safeProfile.id,
          role: "investor",
          issuedAt: window.issuedAt,
          expiresAt: window.expiresAt,
        },
        safeProfile,
        sessionTtlMs,
        now(),
      );

      emit("SIGNED_IN", authSession, authUser);
      return {
        ok: true,
        data: {
          user: authUser,
          session: authSession,
          emailVerificationRequired: !authUser.emailVerified,
          profile: safeProfile,
        },
      };
    },

    async login(input: AuthLoginRequest): Promise<AuthResult<AuthLoginResponse>> {
      if (!input.email.trim() || !input.password.trim()) {
        return {
          ok: false,
          error: {
            code: "AUTH_INVALID_INPUT",
            message: "Please enter both email address and password.",
            provider: "mock",
            retryable: false,
          },
        };
      }

      const res = await provider.login(input.email, input.password);
      if (!res.ok || !res.data) {
        return {
          ok: false,
          error: classifyMockAuthError(
            res.error ?? "Invalid email address or password.",
            "AUTH_INVALID_CREDENTIALS",
          ),
        };
      }

      const safeProfile = stripPasswordFromProfile(res.data);
      const window = openSessionWindow(safeProfile.id);
      const authUser = mapMockUserToAuthUser(safeProfile);
      const authSession = buildMockAuthSession(
        {
          authenticated: true,
          userId: safeProfile.id,
          role: safeProfile.role,
          issuedAt: window.issuedAt,
          expiresAt: window.expiresAt,
        },
        safeProfile,
        sessionTtlMs,
        now(),
      );

      emit("SIGNED_IN", authSession, authUser);
      return {
        ok: true,
        data: {
          user: authUser,
          session: authSession,
          profile: safeProfile,
        },
      };
    },

    async logout(): Promise<AuthResult<void>> {
      activeSessionWindow = null;
      await provider.logout();
      emit("SIGNED_OUT", null, null);
      return { ok: true };
    },

    async expireSession(): Promise<AuthResult<void>> {
      activeSessionWindow = null;
      await provider.logout();
      emit("SESSION_EXPIRED", null, null);
      return { ok: true };
    },

    async getSession(): Promise<AuthResult<AuthSession | null>> {
      const wasExpired = await clearExpiredSessionIfNeeded();
      if (wasExpired) {
        return {
          ok: false,
          data: null,
          error: {
            code: "AUTH_SESSION_EXPIRED",
            message: "Your session has expired. Please sign in again.",
            provider: "mock",
            retryable: false,
          },
        };
      }
      const { session } = inspectSnapshot();
      return { ok: true, data: session };
    },

    async getCurrentUser(): Promise<AuthResult<AuthUser | null>> {
      const wasExpired = await clearExpiredSessionIfNeeded();
      if (wasExpired) {
        return {
          ok: false,
          data: null,
          error: {
            code: "AUTH_SESSION_EXPIRED",
            message: "Your session has expired. Please sign in again.",
            provider: "mock",
            retryable: false,
          },
        };
      }
      const { user } = inspectSnapshot();
      return { ok: true, data: user };
    },

    async refreshSession(): Promise<AuthResult<AuthSession | null>> {
      const wasExpired = await clearExpiredSessionIfNeeded();
      if (wasExpired) {
        return {
          ok: false,
          data: null,
          error: {
            code: "AUTH_SESSION_EXPIRED",
            message: "Your session has expired. Please sign in again.",
            provider: "mock",
            retryable: false,
          },
        };
      }
      const snapshot = provider.getState();
      if (!snapshot.session.authenticated || !snapshot.session.userId) {
        return { ok: true, data: null };
      }
      const matched = snapshot.users.find((u) => u.id === snapshot.session.userId);
      if (!matched || matched.status === "Suspended") {
        activeSessionWindow = null;
        await provider.logout();
        emit("SIGNED_OUT", null, null);
        return { ok: true, data: null };
      }

      const window = openSessionWindow(matched.id);
      const authUser = mapMockUserToAuthUser(matched);
      const refreshedSession = buildMockAuthSession(
        {
          authenticated: true,
          userId: matched.id,
          role: matched.role,
          issuedAt: window.issuedAt,
          expiresAt: window.expiresAt,
        },
        matched,
        sessionTtlMs,
        now(),
      );

      emit("TOKEN_REFRESHED", refreshedSession, authUser);
      return { ok: true, data: refreshedSession };
    },

    async verifyEmail(input: AuthVerifyEmailRequest): Promise<AuthResult<AuthUser>> {
      const wasExpired = await clearExpiredSessionIfNeeded();
      if (wasExpired) {
        return {
          ok: false,
          error: {
            code: "AUTH_SESSION_EXPIRED",
            message: "Your session has expired. Sign in again to verify your email.",
            provider: "mock",
            retryable: false,
          },
        };
      }

      const res = await provider.verifyEmail(input.email, input.tokenOrCode);
      if (!res.ok || !res.data) {
        return {
          ok: false,
          error: classifyMockAuthError(
            res.error ?? "Unable to verify email address.",
            "AUTH_INVALID_VERIFICATION_CODE",
          ),
        };
      }

      const authUser = mapMockUserToAuthUser(stripPasswordFromProfile(res.data));
      const { session } = inspectSnapshot();
      emit("EMAIL_VERIFIED", session, authUser);
      return { ok: true, data: authUser };
    },

    async resendVerificationEmail(): Promise<AuthResult<AuthResendVerificationResponse>> {
      const wasExpired = await clearExpiredSessionIfNeeded();
      if (wasExpired) {
        return {
          ok: false,
          error: {
            code: "AUTH_SESSION_EXPIRED",
            message: "Your session has expired. Sign in again to request a verification code.",
            provider: "mock",
            retryable: false,
          },
        };
      }

      const res = await provider.requestVerificationCode();
      if (!res.ok || !res.data) {
        return {
          ok: false,
          error: classifyMockAuthError(
            res.error ?? "Unable to issue verification code.",
            "AUTH_UNAUTHENTICATED",
          ),
        };
      }
      return {
        ok: true,
        data: {
          sent: true,
          simulatedCode: res.data.code,
        },
      };
    },

    async requestPasswordReset(
      input: AuthPasswordResetRequest,
    ): Promise<AuthResult<AuthPasswordResetRequestResponse>> {
      const emailCheck = validateAuthEmailInput(input.email);
      if (!emailCheck.valid) {
        return {
          ok: false,
          error: {
            code: "AUTH_INVALID_INPUT",
            message: emailCheck.error ?? "Provide a valid email address.",
            provider: "mock",
            retryable: false,
          },
        };
      }

      const res = await provider.requestPasswordReset(input.email);
      if (!res.ok || !res.data) {
        return {
          ok: false,
          error: classifyMockAuthError(
            res.error ?? "Unable to issue recovery token.",
            "AUTH_INVALID_INPUT",
          ),
        };
      }
      return {
        ok: true,
        data: {
          dispatched: true,
          simulatedResetToken: res.data.resetToken,
        },
      };
    },

    async resetPassword(input: AuthResetPasswordInput): Promise<AuthResult<void>> {
      const passwordCheck = validateAuthPasswordInput(input.newPassword);
      if (!passwordCheck.valid) {
        return {
          ok: false,
          error: {
            code: "AUTH_INVALID_INPUT",
            message: passwordCheck.error ?? "New password does not meet requirements.",
            provider: "mock",
            retryable: false,
          },
        };
      }

      const res = await provider.resetPassword(input.email, input.token, input.newPassword);
      if (!res.ok) {
        return {
          ok: false,
          error: classifyMockAuthError(
            res.error ?? "Unable to reset password.",
            "AUTH_INVALID_RECOVERY_TOKEN",
          ),
        };
      }
      emit("PASSWORD_RECOVERY", null, null);
      return { ok: true };
    },

    onAuthStateChange(listener: AuthStateChangeListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const mockAuthAdapter: MockAuthAdapterContract = createMockAuthAdapter();

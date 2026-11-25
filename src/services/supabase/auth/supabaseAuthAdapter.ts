import type {
  AuthContract,
  AuthError,
  AuthLoginRequest,
  AuthLoginResponse,
  AuthPasswordResetRequest,
  AuthPasswordResetRequestResponse,
  AuthRegisterRequest,
  AuthRegisterResponse,
  AuthResendVerificationResponse,
  AuthResetPasswordInput,
  AuthResult,
  AuthSession,
  AuthStateChangeListener,
  AuthUser,
  AuthVerifyEmailRequest,
} from "@/services/auth/types";
import type { SupabaseAuthClientAdapter } from "@/services/supabase/auth/types";
import {
  getSupabasePublicConfig,
  SUPABASE_LIVE_ACTIVATION_ALLOWED,
} from "@/services/supabase/config";

/**
 * SILVER SPOON — Phase 6.4 Disconnected Supabase Auth Adapter (Standby Only)
 *
 * Implements `AuthContract` in strict disconnected standby mode:
 * - NEVER constructs a real Supabase client.
 * - NEVER initializes Supabase Auth or opens auth subscriptions.
 * - NEVER executes network requests (`fetch` / WebSocket).
 * - Hard-locked behind `SUPABASE_LIVE_ACTIVATION_ALLOWED === false` until
 *   Phase 5.1B staging isolation and Phase 5.3 backend remediations are complete.
 */

export const SUPABASE_AUTH_STANDBY_MESSAGE =
  "Supabase Authentication is in disconnected standby mode (Phase 6.4). Live Supabase Auth remains disabled until Phase 5.1B staging isolation and Phase 5.3 backend remediations are approved.";

export interface SupabaseAuthAdapterOptions {
  readonly env?: Record<string, unknown>;
  /**
   * Optional future client factory placeholder. Ignored while
   * `SUPABASE_LIVE_ACTIVATION_ALLOWED` is `false` so no live client can be built.
   */
  readonly clientFactory?: () => SupabaseAuthClientAdapter;
}

export interface SupabaseAuthAdapterContract extends AuthContract {
  readonly providerId: "supabase";
  readonly standbyMode: true;
  readonly roleAuthority: "database_authoritative";
  readonly activationAllowed: false;
  getStandbyReason(): string;
}

function createStandbyAuthError(operation: string, reason: string): AuthError {
  return {
    code: "AUTH_STANDBY_DISCONNECTED",
    message: `[SupabaseAuthAdapter:${operation}] ${reason}`,
    provider: "supabase",
    retryable: false,
  };
}

export function createSupabaseAuthAdapter(
  options: SupabaseAuthAdapterOptions = {},
): SupabaseAuthAdapterContract {
  const getStandbyReason = (): string => {
    const cfg = getSupabasePublicConfig(options.env);
    if (!SUPABASE_LIVE_ACTIVATION_ALLOWED) {
      return `${SUPABASE_AUTH_STANDBY_MESSAGE} (${cfg.activationGuard.reason})`;
    }
    return SUPABASE_AUTH_STANDBY_MESSAGE;
  };

  const blocked = <T>(operation: string): Promise<AuthResult<T>> => {
    return Promise.resolve({
      ok: false,
      error: createStandbyAuthError(operation, getStandbyReason()),
    });
  };

  // Deliberately never invokes `options.clientFactory` while standby is locked.
  void options.clientFactory;

  return {
    providerId: "supabase",
    standbyMode: true,
    roleAuthority: "database_authoritative",
    activationAllowed: SUPABASE_LIVE_ACTIVATION_ALLOWED,

    getStandbyReason,

    register(_input: AuthRegisterRequest): Promise<AuthResult<AuthRegisterResponse>> {
      return blocked("register");
    },

    login(_input: AuthLoginRequest): Promise<AuthResult<AuthLoginResponse>> {
      return blocked("login");
    },

    logout(): Promise<AuthResult<void>> {
      return blocked("logout");
    },

    getSession(): Promise<AuthResult<AuthSession | null>> {
      return blocked("getSession");
    },

    getCurrentUser(): Promise<AuthResult<AuthUser | null>> {
      return blocked("getCurrentUser");
    },

    refreshSession(): Promise<AuthResult<AuthSession | null>> {
      return blocked("refreshSession");
    },

    verifyEmail(_input: AuthVerifyEmailRequest): Promise<AuthResult<AuthUser>> {
      return blocked("verifyEmail");
    },

    resendVerificationEmail(): Promise<AuthResult<AuthResendVerificationResponse>> {
      return blocked("resendVerificationEmail");
    },

    requestPasswordReset(
      _input: AuthPasswordResetRequest,
    ): Promise<AuthResult<AuthPasswordResetRequestResponse>> {
      return blocked("requestPasswordReset");
    },

    resetPassword(_input: AuthResetPasswordInput): Promise<AuthResult<void>> {
      return blocked("resetPassword");
    },

    onAuthStateChange(_listener: AuthStateChangeListener): () => void {
      // Disconnected standby: never registers live Supabase listeners or background timers.
      return () => {};
    },
  };
}

export const supabaseAuthAdapter: SupabaseAuthAdapterContract = createSupabaseAuthAdapter();

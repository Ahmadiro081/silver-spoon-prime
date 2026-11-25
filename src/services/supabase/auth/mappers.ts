import type {
  AuthError,
  AuthErrorCode,
  AuthEventType,
  AuthSession,
  AuthUser,
  OnboardingState,
} from "@/services/auth/types";
import type {
  SupabaseAuthErrorPayload,
  SupabaseAuthSessionPayload,
  SupabaseAuthUserPayload,
  SupabaseRawAuthEvent,
} from "@/services/supabase/auth/types";
import type { DbProfileRow, DbWalletRow } from "@/services/supabase/dbTypes";
import {
  normalizeAccountStatus,
  normalizeUserRole,
  resolvePrimaryUserRole,
  type DbAccountStatusCode,
  type DbAppRole,
} from "@/services/supabase/enums";

/**
 * SILVER SPOON — Phase 6.4 Supabase Auth Mapping Layer (Pure & Disconnected)
 *
 * Maps raw Supabase Auth payloads + database-authoritative profile/role/wallet
 * snapshots into sanitized client `AuthUser`, `AuthSession`, `AuthEventType`,
 * `AuthError`, and `OnboardingState` models.
 *
 * Security invariants:
 * - NEVER exposes `access_token`, `refresh_token`, `provider_token`, or `provider_refresh_token`.
 * - NEVER reads or trusts roles from `user_metadata`, `app_metadata`, or browser storage.
 * - Roles are sourced EXCLUSIVELY from database-authoritative `public.user_roles` rows.
 * - Never assumes `auth.users` signup completed `profiles`, `user_roles`, or `wallets` creation.
 */

export interface AuthoritativeDbAuthContext {
  readonly profile?: DbProfileRow | null;
  readonly dbRoles?: readonly (DbAppRole | string)[] | null;
  readonly wallet?: DbWalletRow | null;
  readonly kycApproved?: boolean;
}

export interface EmailVerificationState {
  readonly verified: boolean;
  readonly confirmedAt: string | null;
  readonly pendingVerification: boolean;
}

export interface PasswordRecoveryState {
  readonly inRecoveryMode: boolean;
  readonly requiresPasswordUpdate: boolean;
  readonly lastRecoveryEventAt: string | null;
}

/**
 * Extracts verified email state solely from Supabase Auth's server-set confirmation timestamps.
 */
export function mapSupabaseEmailVerificationState(
  rawUser: SupabaseAuthUserPayload | null | undefined,
): EmailVerificationState {
  if (!rawUser) {
    return {
      verified: false,
      confirmedAt: null,
      pendingVerification: false,
    };
  }
  const confirmedAt = rawUser.email_confirmed_at ?? rawUser.confirmed_at ?? null;
  const verified = Boolean(confirmedAt && confirmedAt.trim().length > 0);
  return {
    verified,
    confirmedAt,
    pendingVerification: !verified,
  };
}

/**
 * Maps Supabase Auth recovery lifecycle events into explicit recovery state.
 */
export function mapSupabasePasswordRecoveryState(
  event: SupabaseRawAuthEvent | AuthEventType | null,
  timestamp: string = new Date().toISOString(),
): PasswordRecoveryState {
  const inRecoveryMode = event === "PASSWORD_RECOVERY";
  return {
    inRecoveryMode,
    requiresPasswordUpdate: inRecoveryMode,
    lastRecoveryEventAt: inRecoveryMode ? timestamp : null,
  };
}

/**
 * Normalizes database-authoritative roles from `public.user_roles`.
 * Ignores unknown/invalid strings and NEVER reads from JWT/user metadata.
 */
export function extractAuthoritativeDbRoles(
  rawDbRoles: readonly (DbAppRole | string)[] | null | undefined,
): readonly DbAppRole[] {
  if (!Array.isArray(rawDbRoles) || rawDbRoles.length === 0) {
    return [];
  }
  const unique = new Set<DbAppRole>();
  for (const candidate of rawDbRoles) {
    const normalized = normalizeUserRole(String(candidate));
    if (normalized.known && normalized.dbValue) {
      unique.add(normalized.dbValue);
    }
  }
  return Array.from(unique);
}

/**
 * Computes multi-step onboarding state for a Supabase-authenticated user.
 * Never assumes signup alone provisioned `profiles`, `user_roles`, or `wallets`.
 */
export function deriveSupabaseOnboardingState(
  rawUser: SupabaseAuthUserPayload,
  dbContext?: AuthoritativeDbAuthContext,
): OnboardingState {
  const verification = mapSupabaseEmailVerificationState(rawUser);
  const profile = dbContext?.profile ?? null;
  const dbRoles = extractAuthoritativeDbRoles(dbContext?.dbRoles);
  const wallet = dbContext?.wallet ?? null;

  const missingBackendArtifacts: string[] = [];
  if (!profile) missingBackendArtifacts.push("public.profiles");
  if (dbRoles.length === 0) missingBackendArtifacts.push("public.user_roles");
  if (!wallet) missingBackendArtifacts.push("public.wallets");

  const statusNorm = profile ? normalizeAccountStatus(profile.status_code) : null;
  const dbStatus: DbAccountStatusCode | null = statusNorm?.dbValue ?? null;

  const isRestricted =
    dbStatus === "suspended" ||
    dbStatus === "frozen" ||
    dbStatus === "closed" ||
    (profile !== null && statusNorm !== null && !statusNorm.known);

  const requiresServerProvisioning = missingBackendArtifacts.length > 0;

  let stage: OnboardingState["stage"];
  if (isRestricted) {
    stage = "account_restricted";
  } else if (!verification.verified) {
    stage = "awaiting_email_verification";
  } else if (requiresServerProvisioning) {
    stage = "awaiting_backend_provisioning";
  } else if (dbStatus === "pending_verification" || dbContext?.kycApproved === false) {
    stage = "awaiting_kyc_or_compliance";
  } else {
    stage = "ready";
  }

  return {
    stage,
    authUserCreated: "completed",
    emailVerified: verification.verified ? "completed" : "pending",
    profileCreated: profile ? "completed" : "requires_backend_trigger",
    investorRoleAssigned: dbRoles.length > 0 ? "completed" : "requires_backend_trigger",
    walletProvisioned: wallet ? "completed" : "requires_backend_trigger",
    accountStatusChecked: !profile ? "pending" : isRestricted ? "blocked" : "completed",
    complianceChecksComplete:
      !profile
        ? "pending"
        : dbStatus === "active" && dbContext?.kycApproved !== false
          ? "completed"
          : "pending",
    missingBackendArtifacts,
    requiresServerProvisioning,
  };
}

/**
 * Maps a raw Supabase Auth user plus optional database-authoritative context
 * into a client-safe `AuthUser`.
 *
 * Security: `rawUser.user_metadata.role` and `rawUser.app_metadata.role` are
 * deliberately IGNORED to prevent client-controlled privilege escalation.
 */
export function mapSupabaseUserToAuthUser(
  rawUser: SupabaseAuthUserPayload,
  dbContext?: AuthoritativeDbAuthContext,
): AuthUser {
  const verification = mapSupabaseEmailVerificationState(rawUser);
  const dbRoles = extractAuthoritativeDbRoles(dbContext?.dbRoles);
  const resolvedRole = resolvePrimaryUserRole(dbRoles);
  const statusNorm = normalizeAccountStatus(dbContext?.profile?.status_code ?? "pending_verification");
  const dbAccountStatus: DbAccountStatusCode = statusNorm.dbValue ?? "suspended";
  const accountStatus = statusNorm.value;

  const fallbackName =
    typeof rawUser.user_metadata?.full_name === "string" &&
    rawUser.user_metadata.full_name.trim().length > 0
      ? rawUser.user_metadata.full_name.trim()
      : "";

  const fullName = dbContext?.profile?.full_name?.trim() || fallbackName;
  const email = (dbContext?.profile?.email ?? rawUser.email ?? "").trim().toLowerCase();

  return {
    id: rawUser.id,
    email,
    fullName,
    emailVerified: verification.verified,
    portalRole: resolvedRole.value,
    dbRoles,
    roleAuthority: "database_authoritative",
    accountStatus,
    dbAccountStatus,
    onboarding: deriveSupabaseOnboardingState(rawUser, dbContext),
    lastSignInAt: rawUser.last_sign_in_at ?? null,
  };
}

/**
 * Maps a raw Supabase Auth session payload into a client-safe `AuthSession`.
 *
 * Security: Explicitly drops `access_token`, `refresh_token`, `provider_token`,
 * and `provider_refresh_token` so tokens never enter UI state.
 */
export function mapSupabaseSessionToAuthSession(
  rawSession: SupabaseAuthSessionPayload,
  dbContext?: AuthoritativeDbAuthContext,
  nowMs: number = Date.now(),
): AuthSession {
  const dbRoles = extractAuthoritativeDbRoles(dbContext?.dbRoles);
  const resolvedRole = resolvePrimaryUserRole(dbRoles);
  const verification = mapSupabaseEmailVerificationState(rawSession.user);

  const expiresAtMs =
    typeof rawSession.expires_at === "number" && Number.isFinite(rawSession.expires_at)
      ? rawSession.expires_at * 1000
      : nowMs + Math.max(0, rawSession.expires_in) * 1000;

  const expiresAtIso = new Date(expiresAtMs).toISOString();
  const issuedAtMs = Math.max(0, expiresAtMs - Math.max(0, rawSession.expires_in) * 1000);
  const issuedAtIso = new Date(issuedAtMs).toISOString();
  const expired = expiresAtMs <= nowMs;

  return {
    authenticated: !expired && Boolean(rawSession.user?.id),
    userId: rawSession.user.id,
    portalRole: resolvedRole.value,
    dbRoles,
    roleAuthority: "database_authoritative",
    provider: "supabase",
    issuedAt: issuedAtIso,
    expiresAt: expiresAtIso,
    expired,
    emailVerified: verification.verified,
  };
}

/**
 * Maps Supabase Auth lifecycle events into SILVER SPOON's normalized `AuthEventType`.
 */
export function mapSupabaseAuthEvent(event: SupabaseRawAuthEvent): AuthEventType {
  switch (event) {
    case "INITIAL_SESSION":
      return "INITIAL_SESSION";
    case "SIGNED_IN":
      return "SIGNED_IN";
    case "SIGNED_OUT":
      return "SIGNED_OUT";
    case "TOKEN_REFRESHED":
      return "TOKEN_REFRESHED";
    case "PASSWORD_RECOVERY":
      return "PASSWORD_RECOVERY";
    case "USER_UPDATED":
    case "MFA_CHALLENGE_VERIFIED":
    default:
      return "USER_UPDATED";
  }
}

/**
 * Maps raw Supabase Auth errors into standardized `AuthError` values without
 * exposing internal stack traces or secret metadata.
 */
export function mapSupabaseAuthError(rawError: SupabaseAuthErrorPayload): AuthError {
  const codeLower = (rawError.code ?? "").toLowerCase();
  const messageLower = rawError.message.toLowerCase();

  let code: AuthErrorCode = "AUTH_UNKNOWN_ERROR";
  let retryable = false;

  if (codeLower === "invalid_credentials" || messageLower.includes("invalid login credentials")) {
    code = "AUTH_INVALID_CREDENTIALS";
  } else if (codeLower === "email_not_confirmed" || messageLower.includes("email not confirmed")) {
    code = "AUTH_EMAIL_NOT_VERIFIED";
  } else if (
    codeLower === "user_already_exists" ||
    codeLower === "email_exists" ||
    messageLower.includes("already registered")
  ) {
    code = "AUTH_EMAIL_ALREADY_EXISTS";
  } else if (
    codeLower === "over_request_rate_limit" ||
    codeLower === "over_email_send_rate_limit" ||
    rawError.status === 429
  ) {
    code = "AUTH_RATE_LIMITED";
    retryable = true;
  } else if (
    codeLower === "session_expired" ||
    codeLower === "refresh_token_not_found" ||
    messageLower.includes("session expired")
  ) {
    code = "AUTH_SESSION_EXPIRED";
  } else if (codeLower === "otp_expired" || messageLower.includes("otp")) {
    code = "AUTH_INVALID_VERIFICATION_CODE";
  } else if (codeLower === "user_banned" || messageLower.includes("banned")) {
    code = "AUTH_ACCOUNT_SUSPENDED";
  } else if (codeLower === "signup_disabled" || messageLower.includes("signups not allowed")) {
    code = "AUTH_REGISTRATION_DISABLED";
  } else if (rawError.status && rawError.status >= 500) {
    retryable = true;
  }

  return {
    code,
    message: rawError.message || "Authentication request failed.",
    provider: "supabase",
    retryable,
  };
}

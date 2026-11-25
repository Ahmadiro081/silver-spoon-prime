import type { DataProviderId } from "@/services/supabase/config";
import type { DbAccountStatusCode, DbAppRole } from "@/services/supabase/enums";
import type { AccountStatus, UserProfile, UserRole } from "@/types/domain";

/**
 * SILVER SPOON — Phase 6.4 Authentication Contract & Session Management Types
 *
 * Establishes a provider-agnostic, asynchronous authentication contract that
 * prepares the frontend for eventual Supabase Auth integration while keeping
 * existing mock authentication active and hosted Supabase completely disabled.
 *
 * Security invariants:
 * - Tokens (access_token, refresh_token, provider_token) are NEVER exposed to UI components.
 * - Passwords are NEVER persisted in localStorage or serialized into client auth state.
 * - Roles are treated as database-authoritative (`public.user_roles`), never browser-writable.
 * - Frontend route guards are UX presentation controls only; server-side RLS & RPC guards
 *   remain the sole authorization authority once backend integration is activated.
 */

export type AuthProviderId = DataProviderId;

export type AuthRoleAuthority = "mock_local" | "database_authoritative";

export type AuthErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_INVALID_INPUT"
  | "AUTH_EMAIL_ALREADY_EXISTS"
  | "AUTH_EMAIL_NOT_VERIFIED"
  | "AUTH_ACCOUNT_SUSPENDED"
  | "AUTH_ACCOUNT_FROZEN"
  | "AUTH_ACCOUNT_CLOSED"
  | "AUTH_UNAUTHENTICATED"
  | "AUTH_SESSION_EXPIRED"
  | "AUTH_INVALID_VERIFICATION_CODE"
  | "AUTH_INVALID_RECOVERY_TOKEN"
  | "AUTH_REGISTRATION_DISABLED"
  | "AUTH_RATE_LIMITED"
  | "AUTH_STANDBY_DISCONNECTED"
  | "AUTH_PROVIDER_CONFIG_ERROR"
  | "AUTH_UNKNOWN_ERROR";

export interface AuthError {
  readonly code: AuthErrorCode;
  readonly message: string;
  readonly provider: AuthProviderId;
  readonly retryable: boolean;
}

export interface AuthResult<T = void> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: AuthError;
}

export type AuthEventType =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "SESSION_EXPIRED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY"
  | "EMAIL_VERIFIED";

export type OnboardingStepStatus =
  | "completed"
  | "pending"
  | "blocked"
  | "requires_backend_trigger";

export type OnboardingStage =
  | "unauthenticated"
  | "awaiting_email_verification"
  | "awaiting_backend_provisioning"
  | "awaiting_kyc_or_compliance"
  | "account_restricted"
  | "ready";

/**
 * Multi-step onboarding state contract.
 *
 * In Supabase production mode, creating an `auth.users` account does NOT imply
 * that `public.profiles`, `public.user_roles`, or `public.wallets` have been
 * provisioned. Backend triggers / server-side RPCs own provisioning, and the
 * frontend must never fabricate profiles, wallets, or DB role assignments.
 */
export interface OnboardingState {
  readonly stage: OnboardingStage;
  readonly authUserCreated: OnboardingStepStatus;
  readonly emailVerified: OnboardingStepStatus;
  readonly profileCreated: OnboardingStepStatus;
  readonly investorRoleAssigned: OnboardingStepStatus;
  readonly walletProvisioned: OnboardingStepStatus;
  readonly accountStatusChecked: OnboardingStepStatus;
  readonly complianceChecksComplete: OnboardingStepStatus;
  readonly missingBackendArtifacts: readonly string[];
  readonly requiresServerProvisioning: boolean;
}

export interface BackendOnboardingDependency {
  readonly step: string;
  readonly dbObject: string;
  readonly authority: "supabase_auth" | "backend_trigger_or_rpc";
  readonly frontendPermittedToWrite: false;
  readonly notes: string;
}

export const BACKEND_ONBOARDING_DEPENDENCIES: readonly BackendOnboardingDependency[] = Object.freeze([
  Object.freeze({
    step: "1. Auth user created",
    dbObject: "auth.users",
    authority: "supabase_auth",
    frontendPermittedToWrite: false,
    notes: "Created exclusively by Supabase Auth signup once hosted activation is approved.",
  }),
  Object.freeze({
    step: "2. Email verified",
    dbObject: "auth.users.email_confirmed_at",
    authority: "supabase_auth",
    frontendPermittedToWrite: false,
    notes: "Verified via Supabase Auth confirmation token; frontend only submits verification input.",
  }),
  Object.freeze({
    step: "3. Profile created",
    dbObject: "public.profiles",
    authority: "backend_trigger_or_rpc",
    frontendPermittedToWrite: false,
    notes: "Must be provisioned by a backend auth trigger or hardened onboarding RPC (Phase 5.3 Package A).",
  }),
  Object.freeze({
    step: "4. Investor role assigned",
    dbObject: "public.user_roles",
    authority: "backend_trigger_or_rpc",
    frontendPermittedToWrite: false,
    notes: "Role is database-authoritative; frontend must never self-assign or elevate roles.",
  }),
  Object.freeze({
    step: "5. Wallet provisioned",
    dbObject: "public.wallets",
    authority: "backend_trigger_or_rpc",
    frontendPermittedToWrite: false,
    notes: "Zero-balance NGN wallet row provisioned server-side atomically with profile.",
  }),
  Object.freeze({
    step: "6. Account status verified",
    dbObject: "public.profiles.status_code",
    authority: "backend_trigger_or_rpc",
    frontendPermittedToWrite: false,
    notes: "Suspended, frozen, and closed accounts must be blocked server-side in RLS & RBAC helpers.",
  }),
  Object.freeze({
    step: "7. Required compliance checks",
    dbObject: "public.kyc_submissions & public.bank_accounts",
    authority: "backend_trigger_or_rpc",
    frontendPermittedToWrite: false,
    notes: "KYC tier progression and bank verification status are server-controlled.",
  }),
]);

/**
 * Client-safe authenticated user model.
 * NEVER contains password fields, access tokens, or refresh tokens.
 */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly emailVerified: boolean;
  readonly portalRole: UserRole;
  readonly dbRoles: readonly DbAppRole[];
  readonly roleAuthority: AuthRoleAuthority;
  readonly accountStatus: AccountStatus;
  readonly dbAccountStatus: DbAccountStatusCode;
  readonly onboarding: OnboardingState;
  readonly lastSignInAt: string | null;
}

/**
 * Client-safe opaque session representation.
 * Explicitly omits raw JWT access tokens and refresh tokens so UI components
 * cannot read, display, persist, or log sensitive bearer credentials.
 */
export interface AuthSession {
  readonly authenticated: boolean;
  readonly userId: string;
  readonly portalRole: UserRole;
  readonly dbRoles: readonly DbAppRole[];
  readonly roleAuthority: AuthRoleAuthority;
  readonly provider: AuthProviderId;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly expired: boolean;
  readonly emailVerified: boolean;
}

export interface AuthStateChangeEvent {
  readonly event: AuthEventType;
  readonly session: AuthSession | null;
  readonly user: AuthUser | null;
  readonly timestamp: string;
}

export type AuthStateChangeListener = (event: AuthStateChangeEvent) => void;

export interface AuthRegisterRequest {
  readonly fullName: string;
  readonly email: string;
  readonly password: string;
  readonly phone: string;
  readonly referralCode?: string;
}

export interface AuthRegisterResponse {
  readonly user: AuthUser;
  readonly session: AuthSession | null;
  readonly emailVerificationRequired: boolean;
  readonly profile?: UserProfile;
}

export interface AuthLoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface AuthLoginResponse {
  readonly user: AuthUser;
  readonly session: AuthSession;
  readonly profile?: UserProfile;
}

export interface AuthVerifyEmailRequest {
  readonly email: string;
  readonly tokenOrCode: string;
}

export interface AuthResendVerificationResponse {
  readonly sent: boolean;
  readonly simulatedCode?: string;
}

export interface AuthPasswordResetRequest {
  readonly email: string;
}

export interface AuthPasswordResetRequestResponse {
  readonly dispatched: boolean;
  readonly simulatedResetToken?: string;
}

export interface AuthResetPasswordInput {
  readonly email: string;
  readonly token: string;
  readonly newPassword: string;
}

/**
 * Centralized frontend authentication state model exposed via `AppStateContext`.
 */
export interface AuthStateModel {
  readonly initialized: boolean;
  readonly authenticated: boolean;
  readonly user: AuthUser | null;
  readonly session: AuthSession | null;
  readonly sessionAvailable: boolean;
  readonly sessionExpired: boolean;
  readonly emailVerified: boolean;
  readonly portalRole: UserRole | null;
  readonly dbRoles: readonly DbAppRole[];
  readonly roleAuthority: AuthRoleAuthority;
  readonly onboarding: OnboardingState;
  readonly loading: boolean;
  readonly error: AuthError | null;
  readonly provider: AuthProviderId | null;
  readonly standby: boolean;
  readonly lastEvent: AuthEventType | null;
}

/**
 * Asynchronous provider-agnostic authentication contract (Phase 6.4).
 *
 * Implemented by:
 * - `mockAuthAdapter` (active default; wraps `mockDataProvider`)
 * - `supabaseAuthAdapter` (disconnected standby; zero live network calls)
 */
export interface AuthContract {
  readonly providerId: AuthProviderId;
  readonly standbyMode: boolean;
  readonly roleAuthority: AuthRoleAuthority;

  register(input: AuthRegisterRequest): Promise<AuthResult<AuthRegisterResponse>>;
  login(input: AuthLoginRequest): Promise<AuthResult<AuthLoginResponse>>;
  logout(): Promise<AuthResult<void>>;
  getSession(): Promise<AuthResult<AuthSession | null>>;
  getCurrentUser(): Promise<AuthResult<AuthUser | null>>;
  refreshSession(): Promise<AuthResult<AuthSession | null>>;
  verifyEmail(input: AuthVerifyEmailRequest): Promise<AuthResult<AuthUser>>;
  resendVerificationEmail(): Promise<AuthResult<AuthResendVerificationResponse>>;
  requestPasswordReset(
    input: AuthPasswordResetRequest,
  ): Promise<AuthResult<AuthPasswordResetRequestResponse>>;
  resetPassword(input: AuthResetPasswordInput): Promise<AuthResult<void>>;
  onAuthStateChange(listener: AuthStateChangeListener): () => void;
}

// ── Security Input Validation & Redaction Helpers ─────────────────────────────

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const DEFAULT_MOCK_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface InputValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

/**
 * Validates email formatting safely on the client before submitting to an auth adapter.
 */
export function validateAuthEmailInput(email: string): InputValidationResult {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { valid: false, error: "Provide a valid email address." };
  }
  if (normalized.length > 254) {
    return { valid: false, error: "Email address exceeds maximum length." };
  }
  return { valid: true };
}

/**
 * Validates password input length bounds without implementing custom password hashing.
 * Real password hashing and policy enforcement belong exclusively to Supabase Auth / backend.
 */
export function validateAuthPasswordInput(password: string): InputValidationResult {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`,
    };
  }
  return { valid: true };
}

const SENSITIVE_AUTH_KEYS = new Set([
  "password",
  "currentpassword",
  "newpassword",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "providertoken",
  "provider_token",
  "providerrefreshtoken",
  "provider_refresh_token",
  "authorization",
  "jwt",
  "token",
  "resettoken",
  "secret",
]);

/**
 * Strips any credential or token fields recursively before diagnostic serialization.
 * Ensures auth diagnostics never leak passwords, JWTs, or refresh tokens.
 */
export function redactAuthPayloadForLogging<T>(input: T): T {
  if (input === null || input === undefined || typeof input !== "object") {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactAuthPayloadForLogging(item)) as unknown as T;
  }
  const source = input as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (SENSITIVE_AUTH_KEYS.has(key.toLowerCase())) {
      clean[key] = "[REDACTED]";
    } else if (value && typeof value === "object") {
      clean[key] = redactAuthPayloadForLogging(value);
    } else {
      clean[key] = value;
    }
  }
  return clean as T;
}

/**
 * Returns an unauthenticated default onboarding state.
 */
export function createUnauthenticatedOnboardingState(): OnboardingState {
  return {
    stage: "unauthenticated",
    authUserCreated: "pending",
    emailVerified: "pending",
    profileCreated: "pending",
    investorRoleAssigned: "pending",
    walletProvisioned: "pending",
    accountStatusChecked: "pending",
    complianceChecksComplete: "pending",
    missingBackendArtifacts: [],
    requiresServerProvisioning: false,
  };
}

/**
 * Checks whether an `AuthSession` has passed its expiration timestamp.
 */
export function isAuthSessionExpired(
  session: Pick<AuthSession, "expiresAt" | "expired"> | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!session) return false;
  if (session.expired) return true;
  const parsed = Date.parse(session.expiresAt);
  if (!Number.isFinite(parsed)) return true;
  return parsed <= nowMs;
}

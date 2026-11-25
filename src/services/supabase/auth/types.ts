/**
 * SILVER SPOON — Phase 6.4 Disconnected Supabase Auth Client Interface & Payloads
 *
 * Pure TypeScript shapes mirroring the future Supabase Auth SDK surface without
 * installing or importing `@supabase/supabase-js`.
 *
 * Security invariants:
 * - Zero network requests are executed by this module.
 * - Tokens present in raw Supabase session payloads are stripped by `mappers.ts`
 *   before reaching frontend auth state or UI components.
 * - `user_metadata` is NEVER trusted for RBAC / role elevation.
 */

export type SupabaseRawAuthEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY"
  | "MFA_CHALLENGE_VERIFIED";

export interface SupabaseAuthErrorPayload {
  readonly message: string;
  readonly status?: number;
  readonly code?: string;
  readonly name?: string;
}

export interface SupabaseAuthUserPayload {
  readonly id: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly email_confirmed_at?: string | null;
  readonly confirmed_at?: string | null;
  readonly last_sign_in_at?: string | null;
  readonly created_at?: string | null;
  readonly updated_at?: string | null;
  readonly user_metadata?: Readonly<Record<string, unknown>> | null;
  readonly app_metadata?: Readonly<Record<string, unknown>> | null;
}

/**
 * Raw Supabase session payload shape (received ONLY inside the adapter boundary).
 * `access_token`, `refresh_token`, and provider tokens MUST be stripped before
 * constructing `AuthSession`.
 */
export interface SupabaseAuthSessionPayload {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
  readonly expires_at?: number;
  readonly token_type: string;
  readonly user: SupabaseAuthUserPayload;
  readonly provider_token?: string | null;
  readonly provider_refresh_token?: string | null;
}

export interface SupabaseAuthSubscription {
  readonly unsubscribe: () => void;
}

/**
 * Injectable client adapter interface for future Supabase Auth integration.
 * Kept strictly uninstantiated while `SUPABASE_LIVE_ACTIVATION_ALLOWED === false`.
 */
export interface SupabaseAuthClientAdapter {
  signUp(params: {
    email: string;
    password: string;
    options?: { data?: Record<string, unknown> };
  }): Promise<{
    data: { user: SupabaseAuthUserPayload | null; session: SupabaseAuthSessionPayload | null };
    error: SupabaseAuthErrorPayload | null;
  }>;

  signInWithPassword(params: {
    email: string;
    password: string;
  }): Promise<{
    data: { user: SupabaseAuthUserPayload | null; session: SupabaseAuthSessionPayload | null };
    error: SupabaseAuthErrorPayload | null;
  }>;

  signOut(): Promise<{ error: SupabaseAuthErrorPayload | null }>;

  getSession(): Promise<{
    data: { session: SupabaseAuthSessionPayload | null };
    error: SupabaseAuthErrorPayload | null;
  }>;

  getUser(): Promise<{
    data: { user: SupabaseAuthUserPayload | null };
    error: SupabaseAuthErrorPayload | null;
  }>;

  refreshSession(): Promise<{
    data: { user: SupabaseAuthUserPayload | null; session: SupabaseAuthSessionPayload | null };
    error: SupabaseAuthErrorPayload | null;
  }>;

  verifyOtp(params: {
    email: string;
    token: string;
    type: "signup" | "email" | "recovery";
  }): Promise<{
    data: { user: SupabaseAuthUserPayload | null; session: SupabaseAuthSessionPayload | null };
    error: SupabaseAuthErrorPayload | null;
  }>;

  resend(params: {
    email: string;
    type: "signup";
  }): Promise<{ error: SupabaseAuthErrorPayload | null }>;

  resetPasswordForEmail(email: string): Promise<{ error: SupabaseAuthErrorPayload | null }>;

  updateUser(attributes: { password?: string }): Promise<{
    data: { user: SupabaseAuthUserPayload | null };
    error: SupabaseAuthErrorPayload | null;
  }>;

  onAuthStateChange(
    callback: (event: SupabaseRawAuthEvent, session: SupabaseAuthSessionPayload | null) => void,
  ): { data: { subscription: SupabaseAuthSubscription } };
}

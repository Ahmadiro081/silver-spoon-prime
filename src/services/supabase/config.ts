/**
 * SILVER SPOON — Modular Supabase Client Configuration (Phase A Preparation)
 *
 * SECURITY BOUNDARY:
 * - Only public browser-safe variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
 *   are ever read in frontend code.
 * - `SUPABASE_SERVICE_ROLE_KEY` and `PAYSTACK_SECRET_KEY` MUST NEVER exist in any
 *   `VITE_*` variable or client bundle.
 * - Phase A keeps `VITE_DATA_PROVIDER=mock` active; this module performs zero network
 *   requests and allows the application to build and run without Supabase credentials.
 */

export type DataProviderId = "mock" | "supabase";

export type SupabaseReadinessStatus =
  | "mock_active"
  | "standby_unconfigured"
  | "standby_configured";

export interface SupabasePublicConfig {
  url: string | null;
  anonKey: string | null;
  configured: boolean;
  requestedProvider: DataProviderId;
  activeProvider: DataProviderId;
  readinessStatus: SupabaseReadinessStatus;
  phaseAActivationLocked: true;
}

function readOptionalEnv(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const env = (import.meta.env ?? {}) as Record<string, unknown>;
  const rawProvider = readOptionalEnv(env.VITE_DATA_PROVIDER)?.toLowerCase();
  const requestedProvider: DataProviderId = rawProvider === "supabase" ? "supabase" : "mock";

  const url = readOptionalEnv(env.VITE_SUPABASE_URL);
  const anonKey = readOptionalEnv(env.VITE_SUPABASE_ANON_KEY);
  const configured = Boolean(url && anonKey);

  // Phase A safeguard: Supabase is intentionally in standby mode until Phases B–I
  // (schema, RLS, auth, and Edge Functions) are reviewed, approved, and deployed.
  const activeProvider: DataProviderId = "mock";

  const readinessStatus: SupabaseReadinessStatus =
    requestedProvider === "mock"
      ? "mock_active"
      : configured
        ? "standby_configured"
        : "standby_unconfigured";

  return {
    url,
    anonKey,
    configured,
    requestedProvider,
    activeProvider,
    readinessStatus,
    phaseAActivationLocked: true,
  };
}

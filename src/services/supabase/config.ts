/**
 * SILVER SPOON — Modular Data Provider & Supabase Standby Configuration (Phase 6.3)
 *
 * SECURITY BOUNDARY:
 * - Only public browser-safe variables (`VITE_DATA_PROVIDER`, `VITE_SUPABASE_URL`,
 *   `VITE_SUPABASE_ANON_KEY`) are ever read in frontend code.
 * - `SUPABASE_SERVICE_ROLE_KEY`, database passwords, and `PAYSTACK_SECRET_KEY` MUST NEVER
 *   exist in any `VITE_*` variable or client bundle.
 * - Default provider remains `mock` when `VITE_DATA_PROVIDER` is unset or empty.
 * - Unknown / invalid `VITE_DATA_PROVIDER` values fail safely and NEVER silently
 *   fall back to `mock`.
 * - Live Supabase activation is HARD-LOCKED DISABLED throughout Phase 6.3.
 */

export type DataProviderId = "mock" | "supabase";

export const SUPPORTED_DATA_PROVIDERS: readonly DataProviderId[] = ["mock", "supabase"] as const;

/**
 * Explicit compile-time and runtime activation lock for Phase 6.3.
 * Live Supabase client construction and network access MUST remain disabled
 * until staging isolation (Phase 5.1B) and backend remediation (Phase 5.3)
 * are verified and explicitly authorized in a later phase.
 */
export const SUPABASE_LIVE_ACTIVATION_ALLOWED = false as const;

export const SUPABASE_ALLOWED_PUBLIC_ENV_KEYS = [
  "VITE_DATA_PROVIDER",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
] as const;

const FORBIDDEN_FRONTEND_ENV_KEY_PATTERNS: readonly RegExp[] = [
  /SERVICE[_-]?ROLE/i,
  /PAYSTACK[_-]?SECRET/i,
  /JWT[_-]?SECRET/i,
  /DB[_-]?PASSWORD/i,
  /DATABASE[_-]?URL/i,
  /POSTGRES[_-]?PASSWORD/i,
];

export type SupabaseReadinessStatus =
  | "mock_active"
  | "standby_unconfigured"
  | "standby_configured"
  | "invalid_provider";

export interface SupabaseActivationGuardState {
  readonly activationAllowed: false;
  readonly phaseLock: "phase_6_3_local_only";
  readonly stagingIsolationGate: "blocked";
  readonly reason: string;
}

export interface SupabaseConfigValidationResult {
  readonly valid: boolean;
  readonly configured: boolean;
  readonly urlValid: boolean;
  readonly anonKeyValid: boolean;
  readonly forbiddenSecretDetected: boolean;
  readonly issues: readonly string[];
}

export interface SupabasePublicConfig {
  url: string | null;
  anonKey: string | null;
  configured: boolean;
  rawRequestedProvider: string | null;
  providerValid: boolean;
  configError: string | null;
  requestedProvider: DataProviderId | null;
  activeProvider: DataProviderId | null;
  readinessStatus: SupabaseReadinessStatus;
  phaseAActivationLocked: true;
  activationGuard: SupabaseActivationGuardState;
}

function readOptionalEnv(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isSupportedDataProviderId(value: string): value is DataProviderId {
  return value === "mock" || value === "supabase";
}

export function getSupabaseActivationGuard(): SupabaseActivationGuardState {
  return {
    activationAllowed: SUPABASE_LIVE_ACTIVATION_ALLOWED,
    phaseLock: "phase_6_3_local_only",
    stagingIsolationGate: "blocked",
    reason:
      "Phase 6.3 is a local foundation milestone. Live Supabase client initialization and network access remain disabled while the Phase 5.1B staging isolation gate is blocked.",
  };
}

function tryDecodeJwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payloadSegment = parts[1];
  if (!payloadSegment) return null;
  try {
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded =
      typeof atob === "function"
        ? atob(padded)
        : typeof Buffer !== "undefined"
          ? Buffer.from(padded, "base64").toString("utf8")
          : null;
    if (!decoded) return null;
    const parsed: unknown = JSON.parse(decoded);
    if (
      parsed &&
      typeof parsed === "object" &&
      "role" in parsed &&
      typeof (parsed as { role: unknown }).role === "string"
    ) {
      return (parsed as { role: string }).role;
    }
    return null;
  } catch {
    return null;
  }
}

export function isForbiddenServiceRoleKey(key: string): boolean {
  const trimmed = key.trim();
  if (/^sb_secret_/i.test(trimmed)) return true;
  if (/service[_-]?role/i.test(trimmed)) return true;
  const jwtRole = tryDecodeJwtRole(trimmed);
  return jwtRole !== null && jwtRole.toLowerCase() === "service_role";
}

export function isValidPublicSupabaseUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (!parsed.hostname || parsed.hostname.length < 3) return false;
    if (parsed.username || parsed.password) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates optional public Supabase configuration without establishing any network
 * connection or exposing secret values.
 */
export function validateSupabasePublicConfig(
  envOverride?: Record<string, unknown>,
): SupabaseConfigValidationResult {
  const env = envOverride ?? ((import.meta.env ?? {}) as Record<string, unknown>);
  const issues: string[] = [];
  let forbiddenSecretDetected = false;

  for (const [envKey, envValue] of Object.entries(env)) {
    if (!envKey.startsWith("VITE_")) continue;
    const hasValue = readOptionalEnv(envValue) !== null;
    if (!hasValue) continue;
    if (FORBIDDEN_FRONTEND_ENV_KEY_PATTERNS.some((pattern) => pattern.test(envKey))) {
      forbiddenSecretDetected = true;
      issues.push(
        `Forbidden secret environment variable "${envKey}" must never be exposed in frontend VITE_* configuration.`,
      );
    }
  }

  const url = readOptionalEnv(env.VITE_SUPABASE_URL);
  const anonKey = readOptionalEnv(env.VITE_SUPABASE_ANON_KEY);
  const configured = Boolean(url && anonKey);

  let urlValid = false;
  if (url !== null) {
    urlValid = isValidPublicSupabaseUrl(url);
    if (!urlValid) {
      issues.push("VITE_SUPABASE_URL must be a valid HTTPS URL without embedded credentials.");
    }
  }

  let anonKeyValid = false;
  if (anonKey !== null) {
    if (isForbiddenServiceRoleKey(anonKey)) {
      forbiddenSecretDetected = true;
      issues.push(
        "VITE_SUPABASE_ANON_KEY appears to contain a privileged service-role or secret key, which is strictly prohibited in frontend code.",
      );
    } else if (anonKey.length < 20) {
      issues.push("VITE_SUPABASE_ANON_KEY is malformed or shorter than a valid public anon key.");
    } else {
      anonKeyValid = true;
    }
  }

  if ((url !== null && anonKey === null) || (url === null && anonKey !== null)) {
    issues.push(
      "Incomplete Supabase configuration: both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be provided together.",
    );
  }

  const valid = !forbiddenSecretDetected && (!configured ? issues.length === 0 : urlValid && anonKeyValid && issues.length === 0);

  return {
    valid,
    configured,
    urlValid,
    anonKeyValid,
    forbiddenSecretDetected,
    issues,
  };
}

export function getSupabasePublicConfig(
  envOverride?: Record<string, unknown>,
): SupabasePublicConfig {
  const env = envOverride ?? ((import.meta.env ?? {}) as Record<string, unknown>);
  const rawProvider = readOptionalEnv(env.VITE_DATA_PROVIDER);
  const normalizedProvider = rawProvider ? rawProvider.toLowerCase() : null;
  const activationGuard = getSupabaseActivationGuard();

  const url = readOptionalEnv(env.VITE_SUPABASE_URL);
  const anonKey = readOptionalEnv(env.VITE_SUPABASE_ANON_KEY);
  const validation = validateSupabasePublicConfig(env);
  const configured = Boolean(url && anonKey && !validation.forbiddenSecretDetected);

  // Unset or empty VITE_DATA_PROVIDER safely defaults to "mock".
  if (normalizedProvider === null) {
    return {
      url,
      anonKey,
      configured,
      rawRequestedProvider: null,
      providerValid: true,
      configError: null,
      requestedProvider: "mock",
      activeProvider: "mock",
      readinessStatus: "mock_active",
      phaseAActivationLocked: true,
      activationGuard,
    };
  }

  // Explicitly configured invalid provider values MUST NOT silently fall back to "mock".
  if (!isSupportedDataProviderId(normalizedProvider)) {
    return {
      url,
      anonKey,
      configured,
      rawRequestedProvider: rawProvider,
      providerValid: false,
      configError: `Unsupported VITE_DATA_PROVIDER value "${rawProvider}". Supported providers are: ${SUPPORTED_DATA_PROVIDERS.join(", ")}.`,
      requestedProvider: null,
      activeProvider: null,
      readinessStatus: "invalid_provider",
      phaseAActivationLocked: true,
      activationGuard,
    };
  }

  const requestedProvider: DataProviderId = normalizedProvider;

  // Phase 6.3: "mock" is active by default; "supabase" resolves to the disconnected
  // non-network standby provider (never silently downgraded to mock).
  const activeProvider: DataProviderId = requestedProvider;
  const readinessStatus: SupabaseReadinessStatus =
    requestedProvider === "mock"
      ? "mock_active"
      : configured && validation.valid
        ? "standby_configured"
        : "standby_unconfigured";

  return {
    url,
    anonKey,
    configured,
    rawRequestedProvider: rawProvider,
    providerValid: true,
    configError: validation.forbiddenSecretDetected ? validation.issues.join(" ") : null,
    requestedProvider,
    activeProvider,
    readinessStatus,
    phaseAActivationLocked: true,
    activationGuard,
  };
}

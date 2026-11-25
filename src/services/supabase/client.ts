import {
  getSupabaseActivationGuard,
  getSupabasePublicConfig,
  SUPABASE_LIVE_ACTIVATION_ALLOWED,
  validateSupabasePublicConfig,
  type SupabaseActivationGuardState,
  type SupabaseConfigValidationResult,
  type SupabasePublicConfig,
} from "@/services/supabase/config";

/**
 * SILVER SPOON — Controlled Supabase Client Foundation & Initialization Boundary (Phase 6.3)
 *
 * SECURITY & ISOLATION BOUNDARY:
 * - Isolates all future `@supabase/supabase-js` SDK initialization behind a single factory.
 * - Never installs, imports, or instantiates a live Supabase SDK client during Phase 6.3.
 * - Performs ZERO HTTP, WebSocket, Auth, Storage, or RPC network calls.
 * - Never auto-initializes during module load or application startup.
 * - Rejects any attempt to construct a live client while `SUPABASE_LIVE_ACTIVATION_ALLOWED` is `false`.
 * - Rejects any service-role or privileged secret key if mistakenly provided in frontend env vars.
 */

export interface SupabaseClientStandbyStatus {
  initialized: false;
  provider: "supabase";
  mode: "standby_disconnected";
  configured: boolean;
  url: string | null;
  activationAllowed: false;
  stagingIsolationGate: "blocked";
  message: string;
}

/**
 * Minimal structural interface representing a future constructed Supabase client
 * behind this service boundary. UI components and React pages MUST never depend
 * on this type or any concrete Supabase SDK type.
 */
export interface SupabaseClientAdapter {
  readonly provider: "supabase";
  readonly url: string;
  readonly mode: "live_authorized";
}

export type SupabaseClientFactoryFailureCode =
  | "ACTIVATION_DISABLED"
  | "FORBIDDEN_SECRET_DETECTED"
  | "NOT_CONFIGURED"
  | "INVALID_CONFIGURATION"
  | "SDK_NOT_BOUND";

export type SupabaseClientConstructionResult =
  | {
      readonly ok: true;
      readonly client: SupabaseClientAdapter;
    }
  | {
      readonly ok: false;
      readonly code: SupabaseClientFactoryFailureCode;
      readonly error: string;
    };

export class SupabaseClientDisabledError extends Error {
  readonly code: SupabaseClientFactoryFailureCode = "ACTIVATION_DISABLED";
  readonly guard: SupabaseActivationGuardState;

  constructor(message?: string) {
    const guard = getSupabaseActivationGuard();
    super(
      message ??
        `Supabase client construction is disabled (${guard.phaseLock}): ${guard.reason}`,
    );
    this.name = "SupabaseClientDisabledError";
    this.guard = guard;
  }
}

export class SupabaseConfigurationError extends Error {
  readonly code: Exclude<SupabaseClientFactoryFailureCode, "ACTIVATION_DISABLED">;
  readonly issues: readonly string[];

  constructor(
    code: Exclude<SupabaseClientFactoryFailureCode, "ACTIVATION_DISABLED">,
    issues: readonly string[],
  ) {
    super(issues.join(" ") || `Invalid Supabase configuration (${code}).`);
    this.name = "SupabaseConfigurationError";
    this.code = code;
    this.issues = issues;
  }
}

export interface SupabaseClientFactoryInspection {
  readonly activationGuard: SupabaseActivationGuardState;
  readonly publicConfig: SupabasePublicConfig;
  readonly validation: SupabaseConfigValidationResult;
  readonly canConstruct: false;
}

export interface SupabaseClientFactory {
  readonly activationAllowed: false;
  inspect: (envOverride?: Record<string, unknown>) => SupabaseClientFactoryInspection;
  canConstructClient: (envOverride?: Record<string, unknown>) => false;
  constructClient: (envOverride?: Record<string, unknown>) => SupabaseClientConstructionResult;
  assertCanConstructClient: (envOverride?: Record<string, unknown>) => never;
}

export interface SupabaseClientFacade {
  getConfig: (envOverride?: Record<string, unknown>) => SupabasePublicConfig;
  getActivationGuard: () => SupabaseActivationGuardState;
  getFactory: () => SupabaseClientFactory;
  isConfigured: (envOverride?: Record<string, unknown>) => boolean;
  getStatus: (envOverride?: Record<string, unknown>) => SupabaseClientStandbyStatus;
  assertNotActivated: (operation: string) => { ok: false; error: string };
}

/**
 * Creates a controlled client factory that validates configuration and enforces
 * the Phase 6.3 activation lock. In Phase 6.3, client construction always fails
 * safely without performing any network access or initializing any SDK instance.
 */
export function createSupabaseClientFactory(): SupabaseClientFactory {
  const inspect = (envOverride?: Record<string, unknown>): SupabaseClientFactoryInspection => {
    const activationGuard = getSupabaseActivationGuard();
    const publicConfig = getSupabasePublicConfig(envOverride);
    const validation = validateSupabasePublicConfig(envOverride);
    return {
      activationGuard,
      publicConfig,
      validation,
      canConstruct: SUPABASE_LIVE_ACTIVATION_ALLOWED,
    };
  };

  const constructClient = (
    envOverride?: Record<string, unknown>,
  ): SupabaseClientConstructionResult => {
    const state = inspect(envOverride);

    if (state.validation.forbiddenSecretDetected) {
      return {
        ok: false,
        code: "FORBIDDEN_SECRET_DETECTED",
        error: state.validation.issues.join(" "),
      };
    }

    if (!state.activationGuard.activationAllowed) {
      return {
        ok: false,
        code: "ACTIVATION_DISABLED",
        error: `Supabase client construction is disabled in Phase 6.3: ${state.activationGuard.reason}`,
      };
    }

    if (!state.validation.configured) {
      return {
        ok: false,
        code: "NOT_CONFIGURED",
        error: "Supabase public configuration (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) is not configured.",
      };
    }

    if (!state.validation.valid) {
      return {
        ok: false,
        code: "INVALID_CONFIGURATION",
        error: state.validation.issues.join(" "),
      };
    }

    return {
      ok: false,
      code: "SDK_NOT_BOUND",
      error: "Supabase SDK adapter is not bound in Phase 6.3.",
    };
  };

  const assertCanConstructClient = (envOverride?: Record<string, unknown>): never => {
    const result = constructClient(envOverride);
    if (!result.ok) {
      if (result.code === "ACTIVATION_DISABLED") {
        throw new SupabaseClientDisabledError(result.error);
      }
      throw new SupabaseConfigurationError(result.code, [result.error]);
    }
    throw new SupabaseClientDisabledError();
  };

  return {
    activationAllowed: SUPABASE_LIVE_ACTIVATION_ALLOWED,
    inspect,
    canConstructClient: () => SUPABASE_LIVE_ACTIVATION_ALLOWED,
    constructClient,
    assertCanConstructClient,
  };
}

let cachedFacade: SupabaseClientFacade | null = null;
let cachedFactory: SupabaseClientFactory | null = null;

export function getSupabaseClient(): SupabaseClientFacade {
  if (cachedFacade) return cachedFacade;
  if (!cachedFactory) {
    cachedFactory = createSupabaseClientFactory();
  }

  const factory = cachedFactory;

  cachedFacade = {
    getConfig: (envOverride) => getSupabasePublicConfig(envOverride),

    getActivationGuard: () => getSupabaseActivationGuard(),

    getFactory: () => factory,

    isConfigured: (envOverride) => getSupabasePublicConfig(envOverride).configured,

    getStatus: (envOverride) => {
      const cfg = getSupabasePublicConfig(envOverride);
      return {
        initialized: false,
        provider: "supabase",
        mode: "standby_disconnected",
        configured: cfg.configured,
        url: cfg.url,
        activationAllowed: SUPABASE_LIVE_ACTIVATION_ALLOWED,
        stagingIsolationGate: cfg.activationGuard.stagingIsolationGate,
        message: cfg.configured
          ? "Supabase public configuration detected, but client initialization remains disabled in Phase 6.3 standby mode with zero network requests."
          : "Supabase credentials are not configured; Supabase provider remains in disconnected standby mode with zero network requests.",
      };
    },

    assertNotActivated: (operation: string) => ({
      ok: false,
      error: `Supabase operation "${operation}" is unavailable while Supabase provider is in disconnected standby mode.`,
    }),
  };

  return cachedFacade;
}

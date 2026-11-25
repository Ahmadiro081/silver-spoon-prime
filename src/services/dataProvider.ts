import {
  createAdminReadOrchestrator,
  createInitialAdminReadSnapshot,
  formatStaffRoleLabel,
  type AdminReadOnlyOrchestrator,
  type AdminReadSnapshot,
  type AdminReportId,
} from "@/services/admin/index";
import {
  authAdapters,
  createUnauthenticatedOnboardingState,
  InvalidAuthProviderError,
  isAuthSessionExpired,
  mapMockUserToAuthUser,
  resolveAuthAdapter,
  type AuthContract,
  type AuthError,
  type AuthEventType,
  type AuthResult,
  type AuthSession,
  type AuthStateModel,
  type AuthUser,
} from "@/services/auth/index";
import {
  createInitialInvestorReadSnapshot,
  createInvestorReadOrchestrator,
  type InvestorReadOnlyOrchestrator,
  type InvestorReadSnapshot,
} from "@/services/investor/index";
import {
  createSeedSnapshot,
  mockDataProvider,
  type MockDataProviderContract,
  type MockDataSnapshot,
  type SnapshotListener,
} from "@/services/mockDataProvider";
import type { PlatformServiceContract } from "@/services/platformService";
import {
  getSupabasePublicConfig,
  SUPPORTED_DATA_PROVIDERS,
  type DataProviderId,
} from "@/services/supabase/config";
import {
  supabaseDataProvider,
  type SupabaseDataProviderContract,
} from "@/services/supabase/supabaseDataProvider";
import type { ServiceResult } from "@/types/domain";

export type {
  AdminReadOnlyOrchestrator,
  AdminReadSnapshot,
  AdminReportId,
  AuthContract,
  AuthError,
  AuthEventType,
  AuthResult,
  AuthSession,
  AuthStateModel,
  AuthUser,
  DataProviderId,
  InvestorReadOnlyOrchestrator,
  InvestorReadSnapshot,
  MockDataSnapshot,
};
export {
  authAdapters,
  createAdminReadOrchestrator,
  createInitialAdminReadSnapshot,
  createInitialInvestorReadSnapshot,
  createInvestorReadOrchestrator,
  createUnauthenticatedOnboardingState,
  formatStaffRoleLabel,
  InvalidAuthProviderError,
  isAuthSessionExpired,
  mapMockUserToAuthUser,
  resolveAuthAdapter,
};
export const createEmptyPlatformSnapshot = createSeedSnapshot;

/**
 * SILVER SPOON — Data Provider Registry & Delegation Layer (Phase 6.2)
 *
 * Central provider selection boundary consumed by `AppStateProvider`.
 * - Defaults to `mockDataProvider` when `VITE_DATA_PROVIDER` is unset or empty.
 * - Resolves `supabaseDataProvider` in disconnected standby mode when explicitly requested.
 * - Fails safely via `InvalidDataProviderError` when an unsupported provider ID is configured
 *   (NEVER silently falls back to `mock`).
 */

export interface PlatformDataProvider extends PlatformServiceContract {
  readonly id: DataProviderId;
  readonly standbyMode: boolean;
  getState: () => MockDataSnapshot;
  hydrateState: () => Promise<MockDataSnapshot>;
  subscribe: (listener: SnapshotListener) => () => void;
}

export class InvalidDataProviderError extends Error {
  readonly requestedProvider: string;
  readonly supportedProviders: readonly DataProviderId[];

  constructor(requestedProvider: string, message?: string) {
    super(
      message ??
        `Unsupported VITE_DATA_PROVIDER value "${requestedProvider}". Supported providers are: ${SUPPORTED_DATA_PROVIDERS.join(", ")}.`,
    );
    this.name = "InvalidDataProviderError";
    this.requestedProvider = requestedProvider;
    this.supportedProviders = SUPPORTED_DATA_PROVIDERS;
  }
}

export interface ProviderRegistrySummary {
  activeProviderId: DataProviderId | null;
  requestedProviderId: DataProviderId | null;
  rawRequestedProvider: string | null;
  providerValid: boolean;
  configError: string | null;
  supabaseConfigured: boolean;
  supabaseStandby: boolean;
  supabaseActivationAllowed: false;
  mockAvailable: true;
}

export const dataProviders: {
  readonly mock: MockDataProviderContract;
  readonly supabase: SupabaseDataProviderContract;
} = {
  mock: mockDataProvider,
  supabase: supabaseDataProvider,
};

export function getActiveDataProviderId(
  envOverride?: Record<string, unknown>,
): DataProviderId | null {
  return getSupabasePublicConfig(envOverride).activeProvider;
}

export function getProviderRegistrySummary(
  envOverride?: Record<string, unknown>,
): ProviderRegistrySummary {
  const cfg = getSupabasePublicConfig(envOverride);
  return {
    activeProviderId: cfg.activeProvider,
    requestedProviderId: cfg.requestedProvider,
    rawRequestedProvider: cfg.rawRequestedProvider,
    providerValid: cfg.providerValid,
    configError: cfg.configError,
    supabaseConfigured: cfg.configured,
    supabaseStandby: supabaseDataProvider.standbyMode,
    supabaseActivationAllowed: cfg.activationGuard.activationAllowed,
    mockAvailable: true,
  };
}

/**
 * Resolves the active `PlatformDataProvider` from environment configuration.
 * Throws `InvalidDataProviderError` for unsupported provider values instead of
 * silently falling back to `mock`.
 */
export function resolveDataProvider(
  envOverride?: Record<string, unknown>,
): PlatformDataProvider {
  const cfg = getSupabasePublicConfig(envOverride);
  if (!cfg.providerValid || !cfg.activeProvider) {
    throw new InvalidDataProviderError(
      cfg.rawRequestedProvider ?? "(unknown)",
      cfg.configError ?? undefined,
    );
  }
  return dataProviders[cfg.activeProvider];
}

/**
 * Resolves the Phase 6.5 Investor Read-Only Orchestrator for the active provider.
 * Throws `InvalidDataProviderError` for unrecognized `VITE_DATA_PROVIDER` values.
 */
export function resolveInvestorReadOrchestrator(
  envOverride?: Record<string, unknown>,
): InvestorReadOnlyOrchestrator {
  const cfg = getSupabasePublicConfig(envOverride);
  if (!cfg.providerValid || !cfg.activeProvider) {
    throw new InvalidDataProviderError(
      cfg.rawRequestedProvider ?? "(unknown)",
      cfg.configError ?? undefined,
    );
  }
  return createInvestorReadOrchestrator({ env: envOverride });
}

/**
 * Resolves the Phase 6.6 Administrative Read-Only Orchestrator for the active provider.
 * Throws `InvalidDataProviderError` for unrecognized `VITE_DATA_PROVIDER` values.
 */
export function resolveAdminReadOrchestrator(
  envOverride?: Record<string, unknown>,
): AdminReadOnlyOrchestrator {
  const cfg = getSupabasePublicConfig(envOverride);
  if (!cfg.providerValid || !cfg.activeProvider) {
    throw new InvalidDataProviderError(
      cfg.rawRequestedProvider ?? "(unknown)",
      cfg.configError ?? undefined,
    );
  }
  return createAdminReadOrchestrator({ env: envOverride });
}

export interface AsyncOperationGuard {
  isPending: (key: string) => boolean;
  getPendingKeys: () => string[];
  runResult: <T>(
    key: string,
    operation: () => Promise<ServiceResult<T>>,
  ) => Promise<ServiceResult<T>>;
  runVoid: (key: string, operation: () => Promise<void>) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Keyed in-flight operation guard used by `AppStateProvider` to prevent
 * duplicate concurrent mutations (double clicks / rapid re-submissions) and
 * normalize unexpected promise rejections into safe `ServiceResult` values.
 */
export function createAsyncOperationGuard(
  onPendingChange?: (pendingKeys: string[]) => void,
): AsyncOperationGuard {
  const inFlight = new Set<string>();

  const notify = () => {
    onPendingChange?.(Array.from(inFlight));
  };

  return {
    isPending: (key: string) => inFlight.has(key),
    getPendingKeys: () => Array.from(inFlight),

    async runResult<T>(
      key: string,
      operation: () => Promise<ServiceResult<T>>,
    ): Promise<ServiceResult<T>> {
      if (inFlight.has(key)) {
        return {
          ok: false,
          error: "This request is already in progress. Please wait for it to complete.",
        };
      }
      inFlight.add(key);
      notify();
      try {
        return await operation();
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "An unexpected error occurred while processing your request.";
        return { ok: false, error: message };
      } finally {
        inFlight.delete(key);
        notify();
      }
    },

    async runVoid(
      key: string,
      operation: () => Promise<void>,
    ): Promise<{ ok: boolean; error?: string }> {
      if (inFlight.has(key)) {
        return {
          ok: false,
          error: "This request is already in progress. Please wait for it to complete.",
        };
      }
      inFlight.add(key);
      notify();
      try {
        await operation();
        return { ok: true };
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "An unexpected error occurred while processing your request.";
        return { ok: false, error: message };
      } finally {
        inFlight.delete(key);
        notify();
      }
    },
  };
}

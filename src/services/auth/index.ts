import { mockAuthAdapter, type MockAuthAdapterContract } from "@/services/auth/mockAuthAdapter";
import type { AuthContract } from "@/services/auth/types";
import {
  supabaseAuthAdapter,
  type SupabaseAuthAdapterContract,
} from "@/services/supabase/auth/supabaseAuthAdapter";
import {
  getSupabasePublicConfig,
  SUPPORTED_DATA_PROVIDERS,
  type DataProviderId,
} from "@/services/supabase/config";

export * from "@/services/auth/types";
export * from "@/services/auth/mockAuthAdapter";

/**
 * Registry of authentication adapters corresponding to supported data providers.
 * - `mock`: active local browser authentication adapter (default)
 * - `supabase`: disconnected standby adapter (zero live network requests)
 */
export const authAdapters: {
  readonly mock: MockAuthAdapterContract;
  readonly supabase: SupabaseAuthAdapterContract;
} = {
  mock: mockAuthAdapter,
  supabase: supabaseAuthAdapter,
};

export class InvalidAuthProviderError extends Error {
  readonly requestedProvider: string;
  readonly supportedProviders: readonly DataProviderId[];

  constructor(requestedProvider: string, message?: string) {
    super(
      message ??
        `Unsupported VITE_DATA_PROVIDER value "${requestedProvider}" for authentication adapter. Supported providers are: ${SUPPORTED_DATA_PROVIDERS.join(", ")}.`,
    );
    this.name = "InvalidAuthProviderError";
    this.requestedProvider = requestedProvider;
    this.supportedProviders = SUPPORTED_DATA_PROVIDERS;
  }
}

/**
 * Resolves the active `AuthContract` from environment configuration.
 * Defaults to `mockAuthAdapter` when `VITE_DATA_PROVIDER` is unset/empty.
 * Resolves disconnected `supabaseAuthAdapter` when `VITE_DATA_PROVIDER=supabase`.
 * Throws `InvalidAuthProviderError` for unrecognized providers (never silently falls back).
 */
export function resolveAuthAdapter(envOverride?: Record<string, unknown>): AuthContract {
  const cfg = getSupabasePublicConfig(envOverride);
  if (!cfg.providerValid || !cfg.activeProvider) {
    throw new InvalidAuthProviderError(
      cfg.rawRequestedProvider ?? "(unknown)",
      cfg.configError ?? undefined,
    );
  }
  return authAdapters[cfg.activeProvider];
}

import { mockDataProvider } from "@/services/mockDataProvider";
import { getSupabasePublicConfig, type DataProviderId } from "@/services/supabase/config";
import { supabaseDataProvider } from "@/services/supabase/supabaseDataProvider";

/**
 * SILVER SPOON — Data Provider Registry (Phase A)
 *
 * Preserves `mockDataProvider` as the active runtime provider while exposing
 * the modular `supabaseDataProvider` placeholder for future phased cutover.
 */

export interface ProviderRegistrySummary {
  activeProviderId: DataProviderId;
  requestedProviderId: DataProviderId;
  supabaseConfigured: boolean;
  supabaseStandby: boolean;
  mockAvailable: true;
}

export function getActiveDataProviderId(): DataProviderId {
  return getSupabasePublicConfig().activeProvider;
}

export function getProviderRegistrySummary(): ProviderRegistrySummary {
  const cfg = getSupabasePublicConfig();
  return {
    activeProviderId: cfg.activeProvider,
    requestedProviderId: cfg.requestedProvider,
    supabaseConfigured: cfg.configured,
    supabaseStandby: supabaseDataProvider.standbyMode,
    mockAvailable: true,
  };
}

export const dataProviders = {
  mock: mockDataProvider,
  supabase: supabaseDataProvider,
} as const;

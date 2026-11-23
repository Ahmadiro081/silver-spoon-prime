import { getSupabasePublicConfig, type SupabasePublicConfig } from "@/services/supabase/config";

/**
 * SILVER SPOON — Modular Supabase Client Facade (Phase A Placeholder)
 *
 * Isolates all future `@supabase/supabase-js` SDK initialization behind a single
 * boundary so UI components and context providers never couple directly to the SDK.
 *
 * Phase A behavior:
 * - Performs ZERO network calls.
 * - Requires ZERO credentials at startup or build time.
 * - Never accepts or stores a service-role key.
 */

export interface SupabaseClientStandbyStatus {
  initialized: false;
  provider: "supabase";
  mode: "phase_a_standby";
  configured: boolean;
  url: string | null;
  message: string;
}

export interface SupabaseClientFacade {
  getConfig: () => SupabasePublicConfig;
  isConfigured: () => boolean;
  getStatus: () => SupabaseClientStandbyStatus;
  assertNotActivated: (operation: string) => { ok: false; error: string };
}

let cachedFacade: SupabaseClientFacade | null = null;

export function getSupabaseClient(): SupabaseClientFacade {
  if (cachedFacade) return cachedFacade;

  cachedFacade = {
    getConfig: () => getSupabasePublicConfig(),

    isConfigured: () => getSupabasePublicConfig().configured,

    getStatus: () => {
      const cfg = getSupabasePublicConfig();
      return {
        initialized: false,
        provider: "supabase",
        mode: "phase_a_standby",
        configured: cfg.configured,
        url: cfg.url,
        message: cfg.configured
          ? "Supabase environment variables detected, but Phase A standby lock keeps VITE_DATA_PROVIDER=mock active."
          : "Supabase credentials are not configured; application is operating cleanly on the mock-data provider.",
      };
    },

    assertNotActivated: (operation: string) => ({
      ok: false,
      error: `Supabase operation "${operation}" is unavailable during Phase A preparation. Active provider remains "mock".`,
    }),
  };

  return cachedFacade;
}

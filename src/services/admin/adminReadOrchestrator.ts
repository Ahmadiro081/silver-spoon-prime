import {
  createMockAdminReadAdapter,
  type MockAdminReadAdapterOptions,
} from "@/services/admin/mockAdminReadAdapter";
import { resolveAuthoritativeRoleFromUser } from "@/services/admin/sanitizers";
import {
  getPermittedDomainsForRole,
  getPermittedReportsForRole,
  isRolePermittedForDomain,
  isStaffRole,
  type AdminActivityFilter,
  type AdminActivitySummaryView,
  type AdminComplianceFilter,
  type AdminComplianceSummaryView,
  type AdminDepositSummaryView,
  type AdminFinancialReportView,
  type AdminInvestmentSummaryView,
  type AdminInvestorFilter,
  type AdminInvestorSummaryView,
  type AdminPlatformOverviewView,
  type AdminReadDataSource,
  type AdminReadDomain,
  type AdminReadError,
  type AdminReadErrorCode,
  type AdminReadOnlyOrchestrator,
  type AdminReadOnlyQueryContract,
  type AdminReadResult,
  type AdminReadSnapshot,
  type AdminStaffSummaryView,
  type AdminSystemStatusView,
  type AdminTransactionSummaryView,
  type AdminWithdrawalSummaryView,
} from "@/services/admin/types";
import type { InvestorPlanView } from "@/services/investor/types";
import { mockDataProvider, type MockDataProviderContract } from "@/services/mockDataProvider";
import {
  getSupabasePublicConfig,
  SUPABASE_LIVE_ACTIVATION_ALLOWED,
  type DataProviderId,
} from "@/services/supabase/config";
import type {
  InvestmentHistoryFilter,
  ReadQueryPagination,
  ReadQueryResult,
  TransactionHistoryFilter,
} from "@/services/supabase/queries";
import { supabaseDataProvider } from "@/services/supabase/supabaseDataProvider";
import type { StaffRole } from "@/types/domain";
import { sanitizeRestoredSession } from "@/utils/mockIntegrity";

/**
 * SILVER SPOON — Phase 6.6 Administrative Read-Only Data Orchestrator
 *
 * Delegates through the unified provider architecture:
 * - Active `mock`: delegates to `createMockAdminReadAdapter` over `mockDataProvider`.
 * - Standby `supabase`: delegates strictly to `supabaseDataProvider.adminReadQueries`
 *   behind `SUPABASE_LIVE_ACTIVATION_ALLOWED = false` (zero network calls).
 *
 * Authorization Guarantees:
 * - Resolves session & authoritative staff role exclusively inside the provider boundary.
 * - Rejects unauthenticated callers, expired sessions, suspended accounts, investors,
 *   and unauthorized staff roles.
 * - Never trusts caller-supplied roles or tampered `localStorage` session metadata.
 */

export interface AdminReadOrchestratorOptions {
  readonly env?: Record<string, unknown>;
  readonly mockProvider?: MockDataProviderContract;
  readonly now?: () => number;
}

function mapAdminQueryError(code: string, message: string): AdminReadError {
  switch (code) {
    case "STANDBY_DISCONNECTED":
    case "ACTIVATION_DISABLED":
      return { code: "STANDBY_DISCONNECTED", message, recoverable: false };
    case "UNAUTHENTICATED":
      return { code: "UNAUTHENTICATED", message, recoverable: false };
    case "FORBIDDEN":
      return { code: "FORBIDDEN", message, recoverable: false };
    case "MAPPING_ERROR":
      return { code: "MAPPING_ERROR", message, recoverable: true };
    default:
      return { code: "READ_ERROR", message, recoverable: true };
  }
}

export function createInitialAdminReadSnapshot(
  provider: DataProviderId | null,
  status: AdminReadSnapshot["status"] = "idle",
  options?: {
    effectiveRole?: StaffRole | null;
    error?: AdminReadError | null;
    disconnectedReason?: string | null;
  },
): AdminReadSnapshot {
  const effectiveRole = options?.effectiveRole ?? null;
  return {
    status,
    provider,
    source:
      provider === "mock"
        ? "mock_admin_readonly"
        : provider === "supabase"
          ? "supabase_admin_readonly"
          : "none",
    effectiveRole,
    permittedDomains: effectiveRole ? getPermittedDomainsForRole(effectiveRole) : [],
    permittedReports: effectiveRole ? getPermittedReportsForRole(effectiveRole) : [],
    isLoading: status === "loading",
    isEmpty: status === "empty",
    isDisconnected: status === "disconnected",
    isForbidden: status === "forbidden",
    error: options?.error ?? null,
    disconnectedReason: options?.disconnectedReason ?? null,
    lastUpdatedAt: null,
    overview: null,
    investors: [],
    staff: [],
    deposits: [],
    withdrawals: [],
    transactions: [],
    investments: [],
    plans: [],
    financialReport: null,
    compliance: [],
    activities: [],
    systemStatus: null,
  };
}

export function createAdminReadOrchestrator(
  options: AdminReadOrchestratorOptions = {},
): AdminReadOnlyOrchestrator {
  const cfg = getSupabasePublicConfig(options.env);
  if (!cfg.providerValid || !cfg.activeProvider) {
    throw new Error(
      cfg.configError ??
        `Unsupported VITE_DATA_PROVIDER "${cfg.rawRequestedProvider ?? "(unknown)"}".`,
    );
  }

  const providerId: DataProviderId = cfg.activeProvider;
  const standbyMode =
    providerId === "supabase" || (!SUPABASE_LIVE_ACTIVATION_ALLOWED && providerId !== "mock");
  const source: AdminReadDataSource =
    providerId === "mock" ? "mock_admin_readonly" : "supabase_admin_readonly";
  const now = options.now ?? (() => Date.now());
  const mockProvider = options.mockProvider ?? mockDataProvider;

  const queryClient: AdminReadOnlyQueryContract =
    providerId === "mock"
      ? createMockAdminReadAdapter({
          dataProvider: mockProvider,
          now,
        } satisfies MockAdminReadAdapterOptions)
      : supabaseDataProvider.adminReadQueries;

  const resolveStaffPrecondition = ():
    | { ok: true; role: StaffRole }
    | { ok: false; errorCode: AdminReadErrorCode; message: string } => {
    if (providerId !== "mock") {
      return {
        ok: false,
        errorCode: "STANDBY_DISCONNECTED",
        message: "Supabase administrative read provider is in disconnected standby mode (Phase 6.6).",
      };
    }

    const state = mockProvider.getState();
    if (!state.session.authenticated || !state.session.userId) {
      return {
        ok: false,
        errorCode: "UNAUTHENTICATED",
        message: "Sign in with an authorized staff account to access administrative data.",
      };
    }

    if (typeof state.session.expiresAt === "string" && state.session.expiresAt.trim().length > 0) {
      const expiresAtMs = Date.parse(state.session.expiresAt);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now()) {
        return {
          ok: false,
          errorCode: "SESSION_EXPIRED",
          message: "Your administrative session has expired. Sign in again to continue.",
        };
      }
    }

    const sanitized = sanitizeRestoredSession(state.session, state.users, now());
    if (!sanitized.authenticated || !sanitized.userId) {
      return {
        ok: false,
        errorCode: "UNAUTHENTICATED",
        message: "Authenticated session could not be verified.",
      };
    }

    const matched = state.users.find((u) => u.id === sanitized.userId);
    if (!matched || matched.status === "Suspended") {
      return {
        ok: false,
        errorCode: "UNAUTHENTICATED",
        message: "Authenticated staff account is unavailable or suspended.",
      };
    }

    const authoritativeRole = resolveAuthoritativeRoleFromUser(matched);
    if (!isStaffRole(authoritativeRole)) {
      return {
        ok: false,
        errorCode: "FORBIDDEN",
        message: "Investor accounts are strictly prohibited from accessing administrative read interfaces.",
      };
    }

    return { ok: true, role: authoritativeRole };
  };

  const guardAdminRead = async <T>(
    domain: AdminReadDomain,
    executor: () => Promise<ReadQueryResult<T>>,
  ): Promise<AdminReadResult<T>> => {
    if (providerId === "supabase" && !SUPABASE_LIVE_ACTIVATION_ALLOWED) {
      const standbyRes = await executor();
      if (!standbyRes.ok) {
        return {
          ok: false,
          error: mapAdminQueryError(standbyRes.code, standbyRes.error),
          source,
        };
      }
    }

    const pre = resolveStaffPrecondition();
    if (!pre.ok) {
      return {
        ok: false,
        error: {
          code: pre.errorCode,
          message: pre.message,
          recoverable: false,
        },
        source,
      };
    }

    if (!isRolePermittedForDomain(pre.role, domain)) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: `Role "${pre.role}" does not have read permission for "${domain}".`,
          recoverable: false,
        },
        source,
      };
    }

    const res = await executor();
    if (!res.ok) {
      return {
        ok: false,
        error: mapAdminQueryError(res.code, res.error),
        source,
      };
    }

    return {
      ok: true,
      data: res.data,
      source,
      effectiveRole: pre.role,
    };
  };

  return {
    providerId,
    standbyMode,

    getPlatformOverview() {
      return guardAdminRead("platform_overview", () => queryClient.getPlatformOverview());
    },

    getInvestorSummaries(filter?: AdminInvestorFilter) {
      return guardAdminRead("investor_summaries", () => queryClient.listInvestorSummaries(filter));
    },

    getStaffSummaries(pagination?: ReadQueryPagination) {
      return guardAdminRead("staff_summaries", () => queryClient.listStaffSummaries(pagination));
    },

    getDepositSummaries(pagination?: ReadQueryPagination) {
      return guardAdminRead("deposit_summaries", () =>
        queryClient.listDepositSummaries(pagination),
      );
    },

    getWithdrawalSummaries(pagination?: ReadQueryPagination) {
      return guardAdminRead("withdrawal_summaries", () =>
        queryClient.listWithdrawalSummaries(pagination),
      );
    },

    getTransactionSummaries(filter?: TransactionHistoryFilter) {
      return guardAdminRead("transaction_summaries", () =>
        queryClient.listTransactionSummaries(filter),
      );
    },

    getInvestmentSummaries(filter?: InvestmentHistoryFilter) {
      return guardAdminRead("investment_summaries", () =>
        queryClient.listInvestmentSummaries(filter),
      );
    },

    getInvestmentPlans() {
      return guardAdminRead("investment_plans", () => queryClient.listInvestmentPlans());
    },

    getFinancialReports() {
      return guardAdminRead("financial_reports", () => queryClient.getFinancialReports());
    },

    getComplianceSummaries(filter?: AdminComplianceFilter) {
      return guardAdminRead("compliance_summaries", () =>
        queryClient.listComplianceSummaries(filter),
      );
    },

    getActivitySummaries(filter?: AdminActivityFilter) {
      return guardAdminRead("activity_summaries", () => queryClient.listActivitySummaries(filter));
    },

    getSystemStatus() {
      return guardAdminRead("system_status", () => queryClient.getSystemStatus());
    },

    async loadAdminSnapshot(): Promise<AdminReadSnapshot> {
      if (providerId === "supabase") {
        const standbyRes = await queryClient.getPlatformOverview();
        const reason = !standbyRes.ok
          ? standbyRes.error
          : "Supabase administrative read-only provider is in disconnected standby mode (Phase 6.6).";
        return createInitialAdminReadSnapshot(providerId, "disconnected", {
          error: { code: "STANDBY_DISCONNECTED", message: reason, recoverable: false },
          disconnectedReason: reason,
        });
      }

      const pre = resolveStaffPrecondition();
      if (!pre.ok) {
        const mappedStatus: AdminReadSnapshot["status"] =
          pre.errorCode === "SESSION_EXPIRED"
            ? "session_expired"
            : pre.errorCode === "FORBIDDEN"
              ? "forbidden"
              : "unauthenticated";
        return createInitialAdminReadSnapshot(providerId, mappedStatus, {
          error: { code: pre.errorCode, message: pre.message, recoverable: false },
        });
      }

      const role = pre.role;
      const can = (domain: AdminReadDomain) => isRolePermittedForDomain(role, domain);

      const [
        overviewRes,
        investorsRes,
        staffRes,
        depositsRes,
        withdrawalsRes,
        transactionsRes,
        investmentsRes,
        plansRes,
        financialReportRes,
        complianceRes,
        activitiesRes,
        systemStatusRes,
      ] = await Promise.all([
        can("platform_overview") ? queryClient.getPlatformOverview() : Promise.resolve(null),
        can("investor_summaries") ? queryClient.listInvestorSummaries() : Promise.resolve(null),
        can("staff_summaries") ? queryClient.listStaffSummaries() : Promise.resolve(null),
        can("deposit_summaries") ? queryClient.listDepositSummaries() : Promise.resolve(null),
        can("withdrawal_summaries") ? queryClient.listWithdrawalSummaries() : Promise.resolve(null),
        can("transaction_summaries")
          ? queryClient.listTransactionSummaries()
          : Promise.resolve(null),
        can("investment_summaries") ? queryClient.listInvestmentSummaries() : Promise.resolve(null),
        can("investment_plans") ? queryClient.listInvestmentPlans() : Promise.resolve(null),
        can("financial_reports") ? queryClient.getFinancialReports() : Promise.resolve(null),
        can("compliance_summaries") ? queryClient.listComplianceSummaries() : Promise.resolve(null),
        can("activity_summaries") ? queryClient.listActivitySummaries() : Promise.resolve(null),
        can("system_status") ? queryClient.getSystemStatus() : Promise.resolve(null),
      ]);

      const allResults = [
        overviewRes,
        investorsRes,
        staffRes,
        depositsRes,
        withdrawalsRes,
        transactionsRes,
        investmentsRes,
        plansRes,
        financialReportRes,
        complianceRes,
        activitiesRes,
        systemStatusRes,
      ];

      const firstFailure = allResults.find((r) => r !== null && !r.ok);
      if (firstFailure && !firstFailure.ok) {
        const mappedError = mapAdminQueryError(firstFailure.code, firstFailure.error);
        const failureStatus: AdminReadSnapshot["status"] =
          mappedError.code === "STANDBY_DISCONNECTED"
            ? "disconnected"
            : mappedError.code === "FORBIDDEN"
              ? "forbidden"
              : mappedError.code === "UNAUTHENTICATED"
                ? "unauthenticated"
                : "error";
        return createInitialAdminReadSnapshot(providerId, failureStatus, {
          effectiveRole: role,
          error: mappedError,
          disconnectedReason: failureStatus === "disconnected" ? mappedError.message : null,
        });
      }

      const overview = overviewRes?.ok ? overviewRes.data : null;
      const investors = investorsRes?.ok ? investorsRes.data : [];
      const staff = staffRes?.ok ? staffRes.data : [];
      const deposits = depositsRes?.ok ? depositsRes.data : [];
      const withdrawals = withdrawalsRes?.ok ? withdrawalsRes.data : [];
      const transactions = transactionsRes?.ok ? transactionsRes.data : [];
      const investments = investmentsRes?.ok ? investmentsRes.data : [];
      const plans = plansRes?.ok ? plansRes.data : [];
      const financialReport = financialReportRes?.ok ? financialReportRes.data : null;
      const compliance = complianceRes?.ok ? complianceRes.data : [];
      const activities = activitiesRes?.ok ? activitiesRes.data : [];
      const systemStatus = systemStatusRes?.ok ? systemStatusRes.data : null;

      const isEmptyDataset =
        (overview?.investorCounts.total ?? 0) === 0 &&
        transactions.length === 0 &&
        investments.length === 0 &&
        compliance.length === 0;

      return {
        status: isEmptyDataset ? "empty" : "ready",
        provider: providerId,
        source,
        effectiveRole: role,
        permittedDomains: getPermittedDomainsForRole(role),
        permittedReports: getPermittedReportsForRole(role),
        isLoading: false,
        isEmpty: isEmptyDataset,
        isDisconnected: false,
        isForbidden: false,
        error: null,
        disconnectedReason: null,
        lastUpdatedAt: new Date(now()).toISOString(),
        overview,
        investors,
        staff,
        deposits,
        withdrawals,
        transactions,
        investments,
        plans,
        financialReport,
        compliance,
        activities,
        systemStatus,
      };
    },
  };
}

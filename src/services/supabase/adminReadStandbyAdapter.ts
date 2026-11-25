import type { AdminReadOnlyQueryContract } from "@/services/admin/types";
import { getSupabaseClient } from "@/services/supabase/client";
import type { ReadQueryResult } from "@/services/supabase/queries";

/**
 * SILVER SPOON — Disconnected Standby Supabase Administrative Read Adapter (Phase 6.6)
 *
 * ZERO NETWORK GUARANTEE:
 * - Does NOT import `@supabase/supabase-js`.
 * - Performs ZERO HTTP, WebSocket, PostgreSQL, or RPC calls.
 * - Deterministically returns `STANDBY_DISCONNECTED` for every administrative read method.
 */

export const ADMIN_READ_ONLY_TABLE_MAP = Object.freeze({
  getPlatformOverview: "public.profiles + public.wallet_balances + public.investments (staff RLS)",
  listInvestorSummaries: "public.profiles + public.wallet_balances (admin/compliance/super_admin RLS)",
  listStaffSummaries: "public.profiles + public.user_roles (super_admin RLS)",
  listDepositSummaries: "public.deposits (finance_officer/admin/super_admin RLS)",
  listWithdrawalSummaries: "public.withdrawals (finance_officer/admin/super_admin RLS)",
  listTransactionSummaries: "public.transactions (finance_officer/admin/super_admin RLS)",
  listInvestmentSummaries: "public.investments (finance_officer/admin/super_admin RLS)",
  listInvestmentPlans: "public.investment_plans (staff RLS via Phase 6.3 query contract)",
  getFinancialReports: "public.wallet_balances + public.journal_entries reconciliation view (finance_officer/super_admin RLS)",
  listComplianceSummaries: "public.kyc_records + public.kyc_documents masked view (compliance_officer/super_admin RLS)",
  listActivitySummaries: "public.audit_logs role-scoped view (staff RLS)",
  getSystemStatus: "public.platform_settings + system_health view (super_admin RLS)",
} as const);

async function standbyAdminReadFailure<T>(queryName: string): Promise<ReadQueryResult<T>> {
  const status = getSupabaseClient().assertNotActivated(`admin_readonly:${queryName}`);
  return {
    ok: false,
    code: "STANDBY_DISCONNECTED",
    error: status.error,
  };
}

export function createStandbyAdminReadOnlyQueryClient(): AdminReadOnlyQueryContract {
  return {
    mode: "standby_disconnected",
    getPlatformOverview: () => standbyAdminReadFailure("getPlatformOverview"),
    listInvestorSummaries: () => standbyAdminReadFailure("listInvestorSummaries"),
    listStaffSummaries: () => standbyAdminReadFailure("listStaffSummaries"),
    listDepositSummaries: () => standbyAdminReadFailure("listDepositSummaries"),
    listWithdrawalSummaries: () => standbyAdminReadFailure("listWithdrawalSummaries"),
    listTransactionSummaries: () => standbyAdminReadFailure("listTransactionSummaries"),
    listInvestmentSummaries: () => standbyAdminReadFailure("listInvestmentSummaries"),
    listInvestmentPlans: () => standbyAdminReadFailure("listInvestmentPlans"),
    getFinancialReports: () => standbyAdminReadFailure("getFinancialReports"),
    listComplianceSummaries: () => standbyAdminReadFailure("listComplianceSummaries"),
    listActivitySummaries: () => standbyAdminReadFailure("listActivitySummaries"),
    getSystemStatus: () => standbyAdminReadFailure("getSystemStatus"),
  };
}

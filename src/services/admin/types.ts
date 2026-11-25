import type { InvestorPlanView } from "@/services/investor/types";
import type { DataProviderId } from "@/services/supabase/config";
import type {
  DbAccountStatusCode,
  DbAppRole,
  DbKycStatus,
  DbKycTier,
  DbWalletStatus,
} from "@/services/supabase/enums";
import type {
  InvestmentHistoryFilter,
  ReadQueryPagination,
  ReadQueryResult,
  TransactionHistoryFilter,
} from "@/services/supabase/queries";
import type {
  AccountStatus,
  AuditLogEntry,
  InvestmentStatus,
  KycSubmissionStatus,
  RiskBand,
  StaffRole,
  TransactionStatus,
  TransactionType,
} from "@/types/domain";

/**
 * SILVER SPOON — Phase 6.6 Administrative & Staff Read-Only Domain Contracts
 *
 * Strictly READ-ONLY staff projections enforcing explicit 5-role RBAC across:
 *   `super_admin`, `admin`, `finance_officer`, `compliance_officer`, `investor`
 *
 * Security & Precision Invariants:
 * - Zero write/mutation methods, zero generic table queries, zero arbitrary caller roles.
 * - Monetary aggregates use exact integer kobo internally alongside Naira display values.
 * - Raw BVN/NIN, document hashes, passwords, tokens, and vendor secrets are NEVER exposed.
 * - Investor accounts receive `FORBIDDEN` on every administrative read interface.
 */

export type AdminReadDataSource = "mock_admin_readonly" | "supabase_admin_readonly" | "none";

export type AdminDataLoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "forbidden"
  | "unauthenticated"
  | "session_expired"
  | "disconnected";

export type AdminReadErrorCode =
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "STANDBY_DISCONNECTED"
  | "PROVIDER_CONFIG_ERROR"
  | "MAPPING_ERROR"
  | "READ_ERROR";

export interface AdminReadError {
  readonly code: AdminReadErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
}

export type AdminReadResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly source: AdminReadDataSource;
      readonly effectiveRole: StaffRole;
    }
  | {
      readonly ok: false;
      readonly error: AdminReadError;
      readonly source: AdminReadDataSource;
    };

// ── Explicit Administrative Read Domains & 5-Role Permission Matrix ──────────

export type AdminReadDomain =
  | "platform_overview"
  | "investor_summaries"
  | "staff_summaries"
  | "deposit_summaries"
  | "withdrawal_summaries"
  | "transaction_summaries"
  | "investment_summaries"
  | "investment_plans"
  | "financial_reports"
  | "compliance_summaries"
  | "activity_summaries"
  | "system_status";

export type AdminReportId =
  | "treasury_cashflow"
  | "investment_allocations"
  | "client_kyc_registry"
  | "referral_and_compliance_audit";

export const ADMIN_ROLE_PERMISSIONS: Readonly<Record<DbAppRole, readonly AdminReadDomain[]>> =
  Object.freeze({
    super_admin: Object.freeze<AdminReadDomain[]>([
      "platform_overview",
      "investor_summaries",
      "staff_summaries",
      "deposit_summaries",
      "withdrawal_summaries",
      "transaction_summaries",
      "investment_summaries",
      "investment_plans",
      "financial_reports",
      "compliance_summaries",
      "activity_summaries",
      "system_status",
    ]),
    admin: Object.freeze<AdminReadDomain[]>([
      "platform_overview",
      "investor_summaries",
      "deposit_summaries",
      "withdrawal_summaries",
      "transaction_summaries",
      "investment_summaries",
      "investment_plans",
      "activity_summaries",
    ]),
    finance_officer: Object.freeze<AdminReadDomain[]>([
      "platform_overview",
      "deposit_summaries",
      "withdrawal_summaries",
      "transaction_summaries",
      "investment_summaries",
      "investment_plans",
      "financial_reports",
      "activity_summaries",
    ]),
    compliance_officer: Object.freeze<AdminReadDomain[]>([
      "platform_overview",
      "investor_summaries",
      "compliance_summaries",
      "activity_summaries",
    ]),
    investor: Object.freeze<AdminReadDomain[]>([]),
  });

export const ADMIN_ROLE_PERMITTED_REPORTS: Readonly<Record<DbAppRole, readonly AdminReportId[]>> =
  Object.freeze({
    super_admin: Object.freeze<AdminReportId[]>([
      "treasury_cashflow",
      "investment_allocations",
      "client_kyc_registry",
      "referral_and_compliance_audit",
    ]),
    admin: Object.freeze<AdminReportId[]>([
      "treasury_cashflow",
      "investment_allocations",
      "client_kyc_registry",
    ]),
    finance_officer: Object.freeze<AdminReportId[]>([
      "treasury_cashflow",
      "investment_allocations",
    ]),
    compliance_officer: Object.freeze<AdminReportId[]>([
      "client_kyc_registry",
      "referral_and_compliance_audit",
    ]),
    investor: Object.freeze<AdminReportId[]>([]),
  });

export function isStaffRole(role: DbAppRole | null | undefined): role is StaffRole {
  return (
    role === "super_admin" ||
    role === "admin" ||
    role === "finance_officer" ||
    role === "compliance_officer"
  );
}

export function isRolePermittedForDomain(
  role: DbAppRole | null | undefined,
  domain: AdminReadDomain,
): boolean {
  if (!role) return false;
  return ADMIN_ROLE_PERMISSIONS[role]?.includes(domain) ?? false;
}

export function getPermittedDomainsForRole(
  role: DbAppRole | null | undefined,
): readonly AdminReadDomain[] {
  if (!role) return [];
  return ADMIN_ROLE_PERMISSIONS[role] ?? [];
}

export function getPermittedReportsForRole(
  role: DbAppRole | null | undefined,
): readonly AdminReportId[] {
  if (!role) return [];
  return ADMIN_ROLE_PERMITTED_REPORTS[role] ?? [];
}

// ── Filter Contracts ──────────────────────────────────────────────────────────

export interface AdminInvestorFilter extends ReadQueryPagination {
  readonly status?: AccountStatus;
  readonly kycLevel?: "Tier 1" | "Tier 2" | "Tier 3";
}

export interface AdminComplianceFilter extends ReadQueryPagination {
  readonly status?: KycSubmissionStatus;
}

export interface AdminActivityFilter extends ReadQueryPagination {
  readonly severity?: AuditLogEntry["severity"];
}

// ── Sanitized Administrative Read View Models ─────────────────────────────────

export interface AdminPlatformOverviewView {
  readonly scopedForRole: StaffRole;
  readonly currency: "NGN";
  readonly investorCounts: {
    readonly total: number;
    readonly active: number;
    readonly pendingKyc: number;
    readonly suspended: number;
  };
  readonly financialTotals: {
    readonly totalAumKobo: number;
    readonly totalAumNaira: number;
    readonly confirmedDepositsKobo: number;
    readonly confirmedDepositsNaira: number;
    readonly completedWithdrawalsKobo: number;
    readonly completedWithdrawalsNaira: number;
    readonly activeMandatesKobo: number;
    readonly activeMandatesNaira: number;
    readonly pendingDepositsAmountKobo: number;
    readonly pendingDepositsAmountNaira: number;
    readonly pendingWithdrawalsAmountKobo: number;
    readonly pendingWithdrawalsAmountNaira: number;
  } | null;
  readonly queueCounts: {
    readonly pendingDeposits: number | null;
    readonly pendingWithdrawals: number | null;
    readonly pendingKycReviews: number | null;
    readonly activeInvestments: number | null;
  };
  readonly activePlansCount: number;
  readonly staffAccountsCount: number | null;
  readonly generatedAt: string;
}

export interface AdminInvestorSummaryView {
  readonly investorId: string;
  readonly fullName: string;
  readonly email: string;
  readonly city: string | null;
  readonly accountStatus: AccountStatus;
  readonly dbAccountStatus: DbAccountStatusCode | null;
  readonly emailVerified: boolean;
  readonly tier: "Silver" | "Platinum" | "Sovereign";
  readonly kycLevel: "Tier 1" | "Tier 2" | "Tier 3";
  readonly bankAccountVerified: boolean;
  readonly walletStatus: DbWalletStatus;
  /** Financial balances are omitted (null) for compliance_officer views. */
  readonly totalBalanceKobo: number | null;
  readonly totalBalanceNaira: number | null;
  readonly activeInvestmentsCount: number | null;
  readonly registeredAt: string;
  readonly lastLoginAt: string;
}

export interface AdminStaffSummaryView {
  readonly staffId: string;
  readonly fullName: string;
  readonly email: string;
  readonly staffRole: StaffRole;
  readonly accountStatus: AccountStatus;
  readonly emailVerified: boolean;
  readonly twoFactorEnabled: boolean;
  readonly joinedAt: string;
  readonly lastLoginAt: string;
}

export interface AdminDepositSummaryView {
  readonly id: string;
  readonly transactionId: string;
  readonly reference: string;
  readonly investorId: string;
  readonly investorName: string;
  readonly amountKobo: number;
  readonly amountNaira: number;
  readonly currency: "NGN";
  readonly channel: string;
  readonly status: TransactionStatus;
  readonly createdAt: string;
  readonly settledAt: string | null;
}

export interface AdminWithdrawalSummaryView {
  readonly id: string;
  readonly transactionId: string;
  readonly reference: string;
  readonly investorId: string;
  readonly investorName: string;
  readonly amountKobo: number;
  readonly feeKobo: number;
  readonly totalReservedKobo: number;
  readonly amountNaira: number;
  readonly feeNaira: number;
  readonly currency: "NGN";
  readonly status: TransactionStatus;
  readonly requestedAt: string;
  readonly processedAt: string | null;
}

export interface AdminTransactionSummaryView {
  readonly id: string;
  readonly reference: string;
  readonly investorId: string;
  readonly investorName: string;
  readonly type: TransactionType;
  readonly amountKobo: number;
  readonly feeKobo: number;
  readonly amountNaira: number;
  readonly feeNaira: number;
  readonly currency: "NGN";
  readonly status: TransactionStatus;
  readonly channel: string;
  readonly createdAt: string;
}

export interface AdminInvestmentSummaryView {
  readonly id: string;
  readonly reference: string;
  readonly investorId: string;
  readonly investorName: string;
  readonly planId: string;
  readonly planName: string;
  readonly principalKobo: number;
  readonly projectedReturnKobo: number;
  readonly accruedReturnKobo: number;
  readonly principalNaira: number;
  readonly projectedReturnNaira: number;
  readonly accruedReturnNaira: number;
  readonly targetReturnPercent: number;
  readonly durationDays: number;
  readonly riskBand: RiskBand;
  readonly status: InvestmentStatus;
  readonly startedAt: string;
  readonly maturesAt: string;
  readonly autoCompound: boolean;
}

export interface AdminReconciliationSummaryView {
  readonly reconciled: boolean;
  readonly totalCustomerLiabilityKobo: number;
  readonly totalCustomerLiabilityNaira: number;
  readonly totalAvailableKobo: number;
  readonly totalLockedPrincipalKobo: number;
  readonly totalPendingWithdrawalKobo: number;
  readonly discrepancyKobo: number;
  readonly negativeLedgerAccountsCount: number;
  readonly investorsAudited: number;
  readonly checkedAt: string;
}

export interface AdminFinancialReportView {
  readonly currency: "NGN";
  readonly totalConfirmedDepositsKobo: number;
  readonly totalConfirmedDepositsNaira: number;
  readonly totalPendingDepositsKobo: number;
  readonly totalPendingDepositsNaira: number;
  readonly totalCompletedWithdrawalsKobo: number;
  readonly totalCompletedWithdrawalsNaira: number;
  readonly totalPendingWithdrawalsKobo: number;
  readonly totalPendingWithdrawalsNaira: number;
  readonly totalWithdrawalFeesKobo: number;
  readonly totalWithdrawalFeesNaira: number;
  readonly totalActivePrincipalKobo: number;
  readonly totalActivePrincipalNaira: number;
  readonly totalRealizedReturnsKobo: number;
  readonly totalRealizedReturnsNaira: number;
  readonly totalReferralCommissionsKobo: number;
  readonly totalReferralCommissionsNaira: number;
  readonly reconciliation: AdminReconciliationSummaryView;
  readonly generatedAt: string;
}

/**
 * Strictly masked compliance record projection.
 * NEVER exposes raw BVN/NIN, document hashes, tokens, vendor secrets, or credentials.
 */
export interface AdminComplianceSummaryView {
  readonly submissionId: string;
  readonly investorId: string;
  readonly investorName: string;
  readonly investorEmail: string;
  readonly accountStatus: AccountStatus;
  readonly currentKycTier: "Tier 1" | "Tier 2" | "Tier 3";
  readonly dbCurrentKycTier: DbKycTier | null;
  readonly targetTier: "Tier 2" | "Tier 3";
  readonly verificationStatus: KycSubmissionStatus;
  readonly dbVerificationStatus: DbKycStatus | null;
  readonly maskedIdLast4: string | null;
  readonly maskedBvnLast4: string | null;
  readonly idDocumentSubmitted: boolean;
  readonly proofOfAddressSubmitted: boolean;
  readonly bankAccountVerified: boolean;
  readonly emailVerified: boolean;
  readonly riskStatus: "Standard" | "Review Required" | "Restricted";
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
}

export interface AdminActivitySummaryView {
  readonly id: string;
  readonly timestamp: string;
  readonly actorName: string;
  readonly actorRole: AuditLogEntry["actorRole"];
  readonly action: string;
  readonly targetType: AuditLogEntry["targetType"];
  readonly targetId: string;
  readonly summary: string;
  readonly severity: AuditLogEntry["severity"];
}

export interface AdminSystemStatusView {
  readonly providerId: DataProviderId;
  readonly standbyMode: boolean;
  readonly supabaseLiveActivationAllowed: false;
  readonly maintenanceMode: boolean;
  readonly allowNewRegistrations: boolean;
  readonly requireKycForWithdrawals: boolean;
  readonly minDepositKobo: number | null;
  readonly maxDailyWithdrawalKobo: number | null;
  readonly datasetIntegrityOk: boolean;
  readonly integrityIssueCount: number;
  readonly checkedAt: string;
}

// ── Typed Administrative Read-Only Query Contract (12 Explicit Methods) ──────

export interface AdminReadOnlyQueryContract {
  readonly mode: "standby_disconnected" | "readonly_authorized";

  readonly getPlatformOverview: () => Promise<ReadQueryResult<AdminPlatformOverviewView>>;
  readonly listInvestorSummaries: (
    filter?: AdminInvestorFilter,
  ) => Promise<ReadQueryResult<readonly AdminInvestorSummaryView[]>>;
  readonly listStaffSummaries: (
    pagination?: ReadQueryPagination,
  ) => Promise<ReadQueryResult<readonly AdminStaffSummaryView[]>>;
  readonly listDepositSummaries: (
    pagination?: ReadQueryPagination,
  ) => Promise<ReadQueryResult<readonly AdminDepositSummaryView[]>>;
  readonly listWithdrawalSummaries: (
    pagination?: ReadQueryPagination,
  ) => Promise<ReadQueryResult<readonly AdminWithdrawalSummaryView[]>>;
  readonly listTransactionSummaries: (
    filter?: TransactionHistoryFilter,
  ) => Promise<ReadQueryResult<readonly AdminTransactionSummaryView[]>>;
  readonly listInvestmentSummaries: (
    filter?: InvestmentHistoryFilter,
  ) => Promise<ReadQueryResult<readonly AdminInvestmentSummaryView[]>>;
  readonly listInvestmentPlans: () => Promise<ReadQueryResult<readonly InvestorPlanView[]>>;
  readonly getFinancialReports: () => Promise<ReadQueryResult<AdminFinancialReportView>>;
  readonly listComplianceSummaries: (
    filter?: AdminComplianceFilter,
  ) => Promise<ReadQueryResult<readonly AdminComplianceSummaryView[]>>;
  readonly listActivitySummaries: (
    filter?: AdminActivityFilter,
  ) => Promise<ReadQueryResult<readonly AdminActivitySummaryView[]>>;
  readonly getSystemStatus: () => Promise<ReadQueryResult<AdminSystemStatusView>>;
}

// ── Aggregated Admin Snapshot & Orchestrator Contract ────────────────────────

export interface AdminReadSnapshot {
  readonly status: AdminDataLoadStatus;
  readonly provider: DataProviderId | null;
  readonly source: AdminReadDataSource;
  readonly effectiveRole: StaffRole | null;
  readonly permittedDomains: readonly AdminReadDomain[];
  readonly permittedReports: readonly AdminReportId[];
  readonly isLoading: boolean;
  readonly isEmpty: boolean;
  readonly isDisconnected: boolean;
  readonly isForbidden: boolean;
  readonly error: AdminReadError | null;
  readonly disconnectedReason: string | null;
  readonly lastUpdatedAt: string | null;
  readonly overview: AdminPlatformOverviewView | null;
  readonly investors: readonly AdminInvestorSummaryView[];
  readonly staff: readonly AdminStaffSummaryView[];
  readonly deposits: readonly AdminDepositSummaryView[];
  readonly withdrawals: readonly AdminWithdrawalSummaryView[];
  readonly transactions: readonly AdminTransactionSummaryView[];
  readonly investments: readonly AdminInvestmentSummaryView[];
  readonly plans: readonly InvestorPlanView[];
  readonly financialReport: AdminFinancialReportView | null;
  readonly compliance: readonly AdminComplianceSummaryView[];
  readonly activities: readonly AdminActivitySummaryView[];
  readonly systemStatus: AdminSystemStatusView | null;
}

/**
 * Strictly read-only administrative orchestrator contract.
 * ZERO methods accept a caller-supplied `role` or `userId` as proof of authorization.
 */
export interface AdminReadOnlyOrchestrator {
  readonly providerId: DataProviderId;
  readonly standbyMode: boolean;

  getPlatformOverview(): Promise<AdminReadResult<AdminPlatformOverviewView>>;
  getInvestorSummaries(
    filter?: AdminInvestorFilter,
  ): Promise<AdminReadResult<readonly AdminInvestorSummaryView[]>>;
  getStaffSummaries(
    pagination?: ReadQueryPagination,
  ): Promise<AdminReadResult<readonly AdminStaffSummaryView[]>>;
  getDepositSummaries(
    pagination?: ReadQueryPagination,
  ): Promise<AdminReadResult<readonly AdminDepositSummaryView[]>>;
  getWithdrawalSummaries(
    pagination?: ReadQueryPagination,
  ): Promise<AdminReadResult<readonly AdminWithdrawalSummaryView[]>>;
  getTransactionSummaries(
    filter?: TransactionHistoryFilter,
  ): Promise<AdminReadResult<readonly AdminTransactionSummaryView[]>>;
  getInvestmentSummaries(
    filter?: InvestmentHistoryFilter,
  ): Promise<AdminReadResult<readonly AdminInvestmentSummaryView[]>>;
  getInvestmentPlans(): Promise<AdminReadResult<readonly InvestorPlanView[]>>;
  getFinancialReports(): Promise<AdminReadResult<AdminFinancialReportView>>;
  getComplianceSummaries(
    filter?: AdminComplianceFilter,
  ): Promise<AdminReadResult<readonly AdminComplianceSummaryView[]>>;
  getActivitySummaries(
    filter?: AdminActivityFilter,
  ): Promise<AdminReadResult<readonly AdminActivitySummaryView[]>>;
  getSystemStatus(): Promise<AdminReadResult<AdminSystemStatusView>>;
  loadAdminSnapshot(): Promise<AdminReadSnapshot>;
}

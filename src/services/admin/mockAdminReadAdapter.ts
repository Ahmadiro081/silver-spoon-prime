import {
  maskLast4Identifier,
  resolveAuthoritativeRoleFromUser,
  sanitizeActivitySummaryText,
  stripForbiddenSensitiveKeys,
} from "@/services/admin/sanitizers";
import {
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
  type AdminReadDomain,
  type AdminReadOnlyQueryContract,
  type AdminStaffSummaryView,
  type AdminSystemStatusView,
  type AdminTransactionSummaryView,
  type AdminWithdrawalSummaryView,
} from "@/services/admin/types";
import { createMockReadOnlyQueryClient } from "@/services/investor/mockInvestorReadAdapter";
import type { InvestorPlanView } from "@/services/investor/types";
import {
  mockDataProvider,
  type MockDataProviderContract,
  type MockDataSnapshot,
} from "@/services/mockDataProvider";
import { SUPABASE_LIVE_ACTIVATION_ALLOWED } from "@/services/supabase/config";
import type { DbAccountStatusCode, DbKycStatus, DbKycTier } from "@/services/supabase/enums";
import { koboToNaira, nairaToKobo, sumKobo } from "@/services/supabase/financial";
import type {
  InvestmentHistoryFilter,
  ReadQueryErrorCode,
  ReadQueryPagination,
  ReadQueryResult,
  TransactionHistoryFilter,
} from "@/services/supabase/queries";
import type { AuditLogEntry, KycSubmissionRecord, StaffRole, UserProfile } from "@/types/domain";
import {
  auditMockDatasetIntegrity,
  calculateRawAvailableBalance,
  sanitizeRestoredSession,
  selectIsolatedAccountView,
} from "@/utils/mockIntegrity";

/**
 * SILVER SPOON — Phase 6.6 Local Mock Administrative Read-Only Adapter
 *
 * Strictly READ-ONLY implementation of `AdminReadOnlyQueryContract` over `mockDataProvider`.
 *
 * Security & Precision Guarantees:
 * - Zero mutations, zero hidden writes, zero synthetic seed records.
 * - Reuses Phase 6.3's `createMockReadOnlyQueryClient` for plans and staff settings
 *   and Phase 6.3's integer-kobo `financial.ts` utilities for all monetary math.
 * - Enforces explicit 5-role RBAC at the adapter boundary; investor accounts ALWAYS
 *   receive `FORBIDDEN`.
 * - Masks BVN/NIN to last-4 only and strips all forbidden sensitive keys.
 */

export interface MockAdminReadAdapterOptions {
  readonly dataProvider?: MockDataProviderContract;
  readonly now?: () => number;
}

function readOk<T>(data: T): ReadQueryResult<T> {
  return {
    ok: true,
    data: stripForbiddenSensitiveKeys(data),
    source: "supabase_readonly",
  };
}

function readErr<T>(code: ReadQueryErrorCode, error: string): ReadQueryResult<T> {
  return { ok: false, code, error };
}

function paginate<T>(items: readonly T[], pagination?: ReadQueryPagination): readonly T[] {
  const offset = Math.max(0, Math.trunc(pagination?.offset ?? 0));
  const limit =
    pagination?.limit !== undefined && pagination.limit >= 0
      ? Math.trunc(pagination.limit)
      : undefined;
  return limit === undefined ? items.slice(offset) : items.slice(offset, offset + limit);
}

function mapFrontendStatusToDbCode(status: UserProfile["status"]): DbAccountStatusCode {
  switch (status) {
    case "Active":
      return "active";
    case "Pending KYC":
      return "pending_verification";
    case "Suspended":
      return "suspended";
  }
}

function mapFrontendKycStatusToDb(status: KycSubmissionRecord["status"]): DbKycStatus {
  switch (status) {
    case "Approved":
      return "approved";
    case "Under Review":
      return "under_review";
    case "Needs Resubmission":
      return "rejected";
  }
}

function isActivityVisibleToRole(entry: AuditLogEntry, role: StaffRole): boolean {
  if (role === "super_admin") return true;
  if (role === "finance_officer") {
    return (
      entry.targetType === "Deposit" ||
      entry.targetType === "Withdrawal" ||
      entry.targetType === "Investment" ||
      entry.targetType === "Plan" ||
      entry.targetType === "Referral"
    );
  }
  if (role === "compliance_officer") {
    return entry.targetType === "User" || entry.targetType === "Security";
  }
  // admin: operational activity without compliance-only Security/KYC detail notes
  return entry.targetType !== "Settings";
}

export function createMockAdminReadAdapter(
  options: MockAdminReadAdapterOptions = {},
): AdminReadOnlyQueryContract {
  const provider = options.dataProvider ?? mockDataProvider;
  const now = options.now ?? (() => Date.now());
  const sharedReadClient = createMockReadOnlyQueryClient({ dataProvider: provider, now });

  const authorizeStaff = (
    domain: AdminReadDomain,
  ):
    | { ok: true; state: MockDataSnapshot; user: UserProfile; role: StaffRole }
    | { ok: false; code: ReadQueryErrorCode; error: string } => {
    const state = provider.getState();
    const sanitized = sanitizeRestoredSession(state.session, state.users, now());
    if (!sanitized.authenticated || !sanitized.userId) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        error: "An active authenticated staff session is required.",
      };
    }

    const matched = state.users.find((u) => u.id === sanitized.userId);
    if (!matched || matched.status === "Suspended") {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        error: "Authenticated account is unavailable or suspended.",
      };
    }

    const authoritativeRole = resolveAuthoritativeRoleFromUser(matched);
    if (!isStaffRole(authoritativeRole)) {
      return {
        ok: false,
        code: "FORBIDDEN",
        error: "Investor accounts are not permitted to access administrative read interfaces.",
      };
    }

    if (!isRolePermittedForDomain(authoritativeRole, domain)) {
      return {
        ok: false,
        code: "FORBIDDEN",
        error: `Staff role "${authoritativeRole}" is not authorized to read "${domain}".`,
      };
    }

    return { ok: true, state, user: matched, role: authoritativeRole };
  };

  return {
    mode: "readonly_authorized",

    async getPlatformOverview(): Promise<ReadQueryResult<AdminPlatformOverviewView>> {
      const auth = authorizeStaff("platform_overview");
      if (!auth.ok) return readErr(auth.code, auth.error);

      try {
        const { state, role } = auth;
        const investors = state.users.filter((u) => u.role === "investor");
        const staffUsers = state.users.filter((u) => u.role === "admin");
        const activePlansCount = state.plans.filter((p) => p.status === "Active").length;

        const includeFinancials = role !== "compliance_officer";
        const includeComplianceQueue = role === "super_admin" || role === "compliance_officer" || role === "admin";
        const includeFinanceQueues = role !== "compliance_officer";

        let financialTotals: AdminPlatformOverviewView["financialTotals"] = null;
        if (includeFinancials) {
          const perInvestorTotalsKobo = investors.map((invUser) => {
            const view = selectIsolatedAccountView(state, invUser.id);
            const availKobo = nairaToKobo(view.wallet.availableBalance, {
              fieldName: "overview.available",
            });
            const lockedKobo = nairaToKobo(view.wallet.activeInvestments, {
              fieldName: "overview.locked",
            });
            const reservedKobo = nairaToKobo(view.wallet.pendingWithdrawals, {
              fieldName: "overview.reserved",
            });
            return sumKobo([availKobo, lockedKobo, reservedKobo], {
              fieldName: "overview.investorLiability",
            });
          });

          const totalAumKobo = sumKobo(perInvestorTotalsKobo, { fieldName: "overview.totalAum" });
          const confirmedDepositsKobo = sumKobo(
            state.transactions
              .filter((t) => t.type === "Deposit" && t.status === "Completed")
              .map((t) => nairaToKobo(t.amount, { fieldName: "overview.confirmedDeposit" })),
            { fieldName: "overview.confirmedDeposits" },
          );
          const completedWithdrawalsKobo = sumKobo(
            state.transactions
              .filter((t) => t.type === "Withdrawal" && t.status === "Completed")
              .map((t) => nairaToKobo(t.amount, { fieldName: "overview.completedWithdrawal" })),
            { fieldName: "overview.completedWithdrawals" },
          );
          const activeMandatesKobo = sumKobo(
            state.investments
              .filter((i) => i.status === "Active")
              .map((i) => nairaToKobo(i.principal, { fieldName: "overview.activePrincipal" })),
            { fieldName: "overview.activeMandates" },
          );
          const pendingDepositsAmountKobo = sumKobo(
            state.transactions
              .filter((t) => t.type === "Deposit" && t.status === "Pending")
              .map((t) => nairaToKobo(t.amount, { fieldName: "overview.pendingDeposit" })),
            { fieldName: "overview.pendingDeposits" },
          );
          const pendingWithdrawalsAmountKobo = sumKobo(
            state.transactions
              .filter((t) => t.type === "Withdrawal" && t.status === "Pending")
              .map((t) => nairaToKobo(t.amount, { fieldName: "overview.pendingWithdrawal" })),
            { fieldName: "overview.pendingWithdrawals" },
          );

          financialTotals = {
            totalAumKobo,
            totalAumNaira: koboToNaira(totalAumKobo),
            confirmedDepositsKobo,
            confirmedDepositsNaira: koboToNaira(confirmedDepositsKobo),
            completedWithdrawalsKobo,
            completedWithdrawalsNaira: koboToNaira(completedWithdrawalsKobo),
            activeMandatesKobo,
            activeMandatesNaira: koboToNaira(activeMandatesKobo),
            pendingDepositsAmountKobo,
            pendingDepositsAmountNaira: koboToNaira(pendingDepositsAmountKobo),
            pendingWithdrawalsAmountKobo,
            pendingWithdrawalsAmountNaira: koboToNaira(pendingWithdrawalsAmountKobo),
          };
        }

        const pendingDeposits = state.transactions.filter(
          (t) => t.type === "Deposit" && t.status === "Pending",
        ).length;
        const pendingWithdrawals = state.transactions.filter(
          (t) => t.type === "Withdrawal" && t.status === "Pending",
        ).length;
        const pendingKycReviews = Math.max(
          investors.filter((u) => u.status === "Pending KYC").length,
          state.kycSubmissions.filter((k) => k.status === "Under Review").length,
        );
        const activeInvestments = state.investments.filter((i) => i.status === "Active").length;

        return readOk<AdminPlatformOverviewView>({
          scopedForRole: role,
          currency: "NGN",
          investorCounts: {
            total: investors.length,
            active: investors.filter((u) => u.status === "Active").length,
            pendingKyc: investors.filter((u) => u.status === "Pending KYC").length,
            suspended: investors.filter((u) => u.status === "Suspended").length,
          },
          financialTotals,
          queueCounts: {
            pendingDeposits: includeFinanceQueues ? pendingDeposits : null,
            pendingWithdrawals: includeFinanceQueues ? pendingWithdrawals : null,
            pendingKycReviews: includeComplianceQueue ? pendingKycReviews : null,
            activeInvestments: includeFinanceQueues ? activeInvestments : null,
          },
          activePlansCount,
          staffAccountsCount: role === "super_admin" ? staffUsers.length : null,
          generatedAt: new Date(now()).toISOString(),
        });
      } catch (err) {
        return readErr(
          "MAPPING_ERROR",
          err instanceof Error ? err.message : "Failed to assemble platform overview.",
        );
      }
    },

    async listInvestorSummaries(
      filter?: AdminInvestorFilter,
    ): Promise<ReadQueryResult<readonly AdminInvestorSummaryView[]>> {
      const auth = authorizeStaff("investor_summaries");
      if (!auth.ok) return readErr(auth.code, auth.error);

      try {
        const { state, role } = auth;
        const includeFinancialBalances = role !== "compliance_officer";

        let investors = state.users.filter((u) => u.role === "investor");
        if (filter?.status) {
          investors = investors.filter((u) => u.status === filter.status);
        }
        if (filter?.kycLevel) {
          investors = investors.filter((u) => u.kycLevel === filter.kycLevel);
        }

        const projected: AdminInvestorSummaryView[] = investors.map((u) => {
          let totalBalanceKobo: number | null = null;
          let totalBalanceNaira: number | null = null;
          let activeInvestmentsCount: number | null = null;

          if (includeFinancialBalances) {
            const view = selectIsolatedAccountView(state, u.id);
            const availKobo = nairaToKobo(view.wallet.availableBalance, {
              fieldName: "investor.available",
            });
            const lockedKobo = nairaToKobo(view.wallet.activeInvestments, {
              fieldName: "investor.locked",
            });
            const reservedKobo = nairaToKobo(view.wallet.pendingWithdrawals, {
              fieldName: "investor.reserved",
            });
            totalBalanceKobo = sumKobo([availKobo, lockedKobo, reservedKobo], {
              fieldName: "investor.totalLiability",
            });
            totalBalanceNaira = koboToNaira(totalBalanceKobo);
            activeInvestmentsCount = view.investments.filter((i) => i.status === "Active").length;
          }

          return {
            investorId: u.id,
            fullName: u.fullName,
            email: u.email,
            city: u.city || null,
            accountStatus: u.status,
            dbAccountStatus: mapFrontendStatusToDbCode(u.status),
            emailVerified: Boolean(u.emailVerified),
            tier: u.tier,
            kycLevel: u.kycLevel,
            bankAccountVerified: Boolean(u.bankAccount?.verified),
            walletStatus: u.status === "Suspended" ? "frozen" : "active",
            totalBalanceKobo,
            totalBalanceNaira,
            activeInvestmentsCount,
            registeredAt: u.joinedAt,
            lastLoginAt: u.lastLoginAt,
          };
        });

        return readOk(paginate(projected, filter));
      } catch (err) {
        return readErr(
          "MAPPING_ERROR",
          err instanceof Error ? err.message : "Failed to project investor summaries.",
        );
      }
    },

    async listStaffSummaries(
      pagination?: ReadQueryPagination,
    ): Promise<ReadQueryResult<readonly AdminStaffSummaryView[]>> {
      const auth = authorizeStaff("staff_summaries");
      if (!auth.ok) return readErr(auth.code, auth.error);

      const staffUsers = auth.state.users.filter((u) => u.role === "admin");
      const projected: AdminStaffSummaryView[] = staffUsers.map((u) => {
        const resolved = resolveAuthoritativeRoleFromUser(u);
        return {
          staffId: u.id,
          fullName: u.fullName,
          email: u.email,
          staffRole: isStaffRole(resolved) ? resolved : "admin",
          accountStatus: u.status,
          emailVerified: Boolean(u.emailVerified),
          twoFactorEnabled: Boolean(u.twoFactorEnabled),
          joinedAt: u.joinedAt,
          lastLoginAt: u.lastLoginAt,
        };
      });

      return readOk(paginate(projected, pagination));
    },

    async listDepositSummaries(
      pagination?: ReadQueryPagination,
    ): Promise<ReadQueryResult<readonly AdminDepositSummaryView[]>> {
      const auth = authorizeStaff("deposit_summaries");
      if (!auth.ok) return readErr(auth.code, auth.error);

      try {
        const deposits = auth.state.transactions
          .filter((t) => t.type === "Deposit")
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .map<AdminDepositSummaryView>((t) => {
            const amountKobo = nairaToKobo(t.amount, { fieldName: "deposit.amount" });
            return {
              id: `DEP-${t.id}`,
              transactionId: t.id,
              reference: t.reference,
              investorId: t.userId,
              investorName: t.userName,
              amountKobo,
              amountNaira: koboToNaira(amountKobo),
              currency: "NGN",
              channel: t.channel,
              status: t.status,
              createdAt: t.createdAt,
              settledAt: t.status === "Completed" ? t.reviewedAt ?? t.createdAt : null,
            };
          });

        return readOk(paginate(deposits, pagination));
      } catch (err) {
        return readErr(
          "MAPPING_ERROR",
          err instanceof Error ? err.message : "Failed to project deposit summaries.",
        );
      }
    },

    async listWithdrawalSummaries(
      pagination?: ReadQueryPagination,
    ): Promise<ReadQueryResult<readonly AdminWithdrawalSummaryView[]>> {
      const auth = authorizeStaff("withdrawal_summaries");
      if (!auth.ok) return readErr(auth.code, auth.error);

      try {
        const withdrawals = auth.state.transactions
          .filter((t) => t.type === "Withdrawal")
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .map<AdminWithdrawalSummaryView>((t) => {
            const amountKobo = nairaToKobo(t.amount, { fieldName: "withdrawal.amount" });
            const feeKobo = nairaToKobo(t.fee, { fieldName: "withdrawal.fee" });
            const totalReservedKobo = sumKobo([amountKobo, feeKobo], {
              fieldName: "withdrawal.totalReserved",
            });
            return {
              id: `WDR-${t.id}`,
              transactionId: t.id,
              reference: t.reference,
              investorId: t.userId,
              investorName: t.userName,
              amountKobo,
              feeKobo,
              totalReservedKobo,
              amountNaira: koboToNaira(amountKobo),
              feeNaira: koboToNaira(feeKobo),
              currency: "NGN",
              status: t.status,
              requestedAt: t.createdAt,
              processedAt: t.status === "Completed" ? t.reviewedAt ?? t.createdAt : null,
            };
          });

        return readOk(paginate(withdrawals, pagination));
      } catch (err) {
        return readErr(
          "MAPPING_ERROR",
          err instanceof Error ? err.message : "Failed to project withdrawal summaries.",
        );
      }
    },

    async listTransactionSummaries(
      filter?: TransactionHistoryFilter,
    ): Promise<ReadQueryResult<readonly AdminTransactionSummaryView[]>> {
      const auth = authorizeStaff("transaction_summaries");
      if (!auth.ok) return readErr(auth.code, auth.error);

      try {
        let txns = [...auth.state.transactions].sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        );
        if (filter?.status) {
          const target = filter.status.trim().toLowerCase();
          txns = txns.filter((t) => t.status.toLowerCase() === target);
        }
        if (filter?.type) {
          const target = filter.type.trim().toLowerCase();
          txns = txns.filter((t) => t.type.toLowerCase() === target);
        }

        const projected: AdminTransactionSummaryView[] = txns.map((t) => {
          const amountKobo = nairaToKobo(t.amount, { fieldName: "txn.amount" });
          const feeKobo = nairaToKobo(t.fee, { fieldName: "txn.fee" });
          return {
            id: t.id,
            reference: t.reference,
            investorId: t.userId,
            investorName: t.userName,
            type: t.type,
            amountKobo,
            feeKobo,
            amountNaira: koboToNaira(amountKobo),
            feeNaira: koboToNaira(feeKobo),
            currency: "NGN",
            status: t.status,
            channel: t.channel,
            createdAt: t.createdAt,
          };
        });

        return readOk(paginate(projected, filter));
      } catch (err) {
        return readErr(
          "MAPPING_ERROR",
          err instanceof Error ? err.message : "Failed to project transaction summaries.",
        );
      }
    },

    async listInvestmentSummaries(
      filter?: InvestmentHistoryFilter,
    ): Promise<ReadQueryResult<readonly AdminInvestmentSummaryView[]>> {
      const auth = authorizeStaff("investment_summaries");
      if (!auth.ok) return readErr(auth.code, auth.error);

      try {
        let invs = [...auth.state.investments].sort(
          (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
        );
        if (filter?.status) {
          const target = filter.status.trim().toLowerCase();
          invs = invs.filter((i) => i.status.toLowerCase() === target);
        }

        const projected: AdminInvestmentSummaryView[] = invs.map((i) => {
          const principalKobo = nairaToKobo(i.principal, { fieldName: "investment.principal" });
          const projectedReturnKobo = nairaToKobo(i.projectedReturn, {
            fieldName: "investment.projectedReturn",
          });
          const accruedReturnKobo = nairaToKobo(i.accruedReturn, {
            fieldName: "investment.accruedReturn",
          });
          return {
            id: i.id,
            reference: i.id,
            investorId: i.userId,
            investorName: i.userName,
            planId: i.planId,
            planName: i.planName,
            principalKobo,
            projectedReturnKobo,
            accruedReturnKobo,
            principalNaira: koboToNaira(principalKobo),
            projectedReturnNaira: koboToNaira(projectedReturnKobo),
            accruedReturnNaira: koboToNaira(accruedReturnKobo),
            targetReturnPercent: i.targetReturnPercent,
            durationDays: i.durationDays,
            riskBand: i.riskBand,
            status: i.status,
            startedAt: i.startedAt,
            maturesAt: i.maturesAt,
            autoCompound: i.autoCompound,
          };
        });

        return readOk(paginate(projected, filter));
      } catch (err) {
        return readErr(
          "MAPPING_ERROR",
          err instanceof Error ? err.message : "Failed to project investment summaries.",
        );
      }
    },

    async listInvestmentPlans(): Promise<ReadQueryResult<readonly InvestorPlanView[]>> {
      const auth = authorizeStaff("investment_plans");
      if (!auth.ok) return readErr(auth.code, auth.error);

      // Reuse Phase 6.3 query contract instead of duplicating plan mapping logic
      const res = await sharedReadClient.plans.listAccessiblePlans();
      if (!res.ok) return res;

      const projected: InvestorPlanView[] = res.data.map((row) => ({
        id: row.plan.id,
        code: row.plan.code,
        name: row.plan.name,
        category: row.plan.category,
        tagline: row.plan.tagline,
        description: row.plan.description,
        minAmountKobo: row.dbMeta.minAmountKobo,
        maxAmountKobo: row.dbMeta.maxAmountKobo,
        minAmount: row.plan.minAmount,
        maxAmount: row.plan.maxAmount,
        durationDays: row.plan.durationDays,
        targetReturnPercent: row.plan.targetReturnPercent,
        riskBand: row.plan.riskBand,
        payoutFrequency: row.plan.payoutFrequency,
        managementFeePercent: row.plan.managementFeePercent,
        status: row.plan.status,
        featured: Boolean(row.plan.featured),
        allocationFocus: [...row.plan.allocationFocus],
        perks: [...row.plan.perks],
        riskNote: row.plan.riskNote,
      }));
      return readOk(projected);
    },

    async getFinancialReports(): Promise<ReadQueryResult<AdminFinancialReportView>> {
      const auth = authorizeStaff("financial_reports");
      if (!auth.ok) return readErr(auth.code, auth.error);

      try {
        const { state } = auth;
        const investors = state.users.filter((u) => u.role === "investor");

        const totalConfirmedDepositsKobo = sumKobo(
          state.transactions
            .filter((t) => t.type === "Deposit" && t.status === "Completed")
            .map((t) => nairaToKobo(t.amount, { fieldName: "report.confirmedDeposit" })),
          { fieldName: "report.totalConfirmedDeposits" },
        );
        const totalPendingDepositsKobo = sumKobo(
          state.transactions
            .filter((t) => t.type === "Deposit" && t.status === "Pending")
            .map((t) => nairaToKobo(t.amount, { fieldName: "report.pendingDeposit" })),
          { fieldName: "report.totalPendingDeposits" },
        );
        const totalCompletedWithdrawalsKobo = sumKobo(
          state.transactions
            .filter((t) => t.type === "Withdrawal" && t.status === "Completed")
            .map((t) => nairaToKobo(t.amount, { fieldName: "report.completedWithdrawal" })),
          { fieldName: "report.totalCompletedWithdrawals" },
        );
        const totalPendingWithdrawalsKobo = sumKobo(
          state.transactions
            .filter((t) => t.type === "Withdrawal" && t.status === "Pending")
            .map((t) => nairaToKobo(t.amount, { fieldName: "report.pendingWithdrawal" })),
          { fieldName: "report.totalPendingWithdrawals" },
        );
        const totalWithdrawalFeesKobo = sumKobo(
          state.transactions
            .filter((t) => t.type === "Withdrawal" && t.status !== "Declined")
            .map((t) => nairaToKobo(t.fee, { fieldName: "report.withdrawalFee" })),
          { fieldName: "report.totalWithdrawalFees" },
        );
        const totalActivePrincipalKobo = sumKobo(
          state.investments
            .filter((i) => i.status === "Active")
            .map((i) => nairaToKobo(i.principal, { fieldName: "report.activePrincipal" })),
          { fieldName: "report.totalActivePrincipal" },
        );
        const totalRealizedReturnsKobo = sumKobo(
          state.transactions
            .filter((t) => t.type === "Realized Return" && t.status === "Completed")
            .map((t) => nairaToKobo(t.amount, { fieldName: "report.realizedReturn" })),
          { fieldName: "report.totalRealizedReturns" },
        );
        const totalReferralCommissionsKobo = sumKobo(
          state.transactions
            .filter((t) => t.type === "Referral Commission" && t.status === "Completed")
            .map((t) => nairaToKobo(t.amount, { fieldName: "report.referralCommission" })),
          { fieldName: "report.totalReferralCommissions" },
        );

        const availList: number[] = [];
        const lockedList: number[] = [];
        const pendingWdrList: number[] = [];
        let negativeLedgerAccountsCount = 0;

        for (const invUser of investors) {
          const view = selectIsolatedAccountView(state, invUser.id);
          const rawAvail = calculateRawAvailableBalance(view.transactions, view.investments);
          if (rawAvail < 0) negativeLedgerAccountsCount += 1;

          availList.push(
            nairaToKobo(view.wallet.availableBalance, { fieldName: "recon.available" }),
          );
          lockedList.push(
            nairaToKobo(view.wallet.activeInvestments, { fieldName: "recon.locked" }),
          );
          pendingWdrList.push(
            nairaToKobo(view.wallet.pendingWithdrawals, { fieldName: "recon.pendingWithdrawal" }),
          );
        }

        const totalAvailableKobo = sumKobo(availList, { fieldName: "recon.totalAvailable" });
        const totalLockedPrincipalKobo = sumKobo(lockedList, { fieldName: "recon.totalLocked" });
        const totalPendingWithdrawalKobo = sumKobo(pendingWdrList, {
          fieldName: "recon.totalPendingWithdrawal",
        });
        const totalCustomerLiabilityKobo = sumKobo(
          [totalAvailableKobo, totalLockedPrincipalKobo, totalPendingWithdrawalKobo],
          { fieldName: "recon.totalLiability" },
        );

        // Expected net customer liability from ledger flows:
        // confirmedDeposits + realizedReturns + referralCommissions - completedWithdrawals - completedWithdrawalFees
        const completedWithdrawalFeesKobo = sumKobo(
          state.transactions
            .filter((t) => t.type === "Withdrawal" && t.status === "Completed")
            .map((t) => nairaToKobo(t.fee, { fieldName: "recon.completedFee" })),
          { fieldName: "recon.totalCompletedFees" },
        );
        const expectedLiabilityBig =
          BigInt(totalConfirmedDepositsKobo) +
          BigInt(totalRealizedReturnsKobo) +
          BigInt(totalReferralCommissionsKobo) -
          BigInt(totalCompletedWithdrawalsKobo) -
          BigInt(completedWithdrawalFeesKobo);
        const discrepancyBig = BigInt(totalCustomerLiabilityKobo) - expectedLiabilityBig;
        const discrepancyKobo = Number(discrepancyBig);

        const nowIso = new Date(now()).toISOString();
        return readOk<AdminFinancialReportView>({
          currency: "NGN",
          totalConfirmedDepositsKobo,
          totalConfirmedDepositsNaira: koboToNaira(totalConfirmedDepositsKobo),
          totalPendingDepositsKobo,
          totalPendingDepositsNaira: koboToNaira(totalPendingDepositsKobo),
          totalCompletedWithdrawalsKobo,
          totalCompletedWithdrawalsNaira: koboToNaira(totalCompletedWithdrawalsKobo),
          totalPendingWithdrawalsKobo,
          totalPendingWithdrawalsNaira: koboToNaira(totalPendingWithdrawalsKobo),
          totalWithdrawalFeesKobo,
          totalWithdrawalFeesNaira: koboToNaira(totalWithdrawalFeesKobo),
          totalActivePrincipalKobo,
          totalActivePrincipalNaira: koboToNaira(totalActivePrincipalKobo),
          totalRealizedReturnsKobo,
          totalRealizedReturnsNaira: koboToNaira(totalRealizedReturnsKobo),
          totalReferralCommissionsKobo,
          totalReferralCommissionsNaira: koboToNaira(totalReferralCommissionsKobo),
          reconciliation: {
            reconciled: discrepancyKobo === 0 && negativeLedgerAccountsCount === 0,
            totalCustomerLiabilityKobo,
            totalCustomerLiabilityNaira: koboToNaira(totalCustomerLiabilityKobo),
            totalAvailableKobo,
            totalLockedPrincipalKobo,
            totalPendingWithdrawalKobo,
            discrepancyKobo,
            negativeLedgerAccountsCount,
            investorsAudited: investors.length,
            checkedAt: nowIso,
          },
          generatedAt: nowIso,
        });
      } catch (err) {
        return readErr(
          "MAPPING_ERROR",
          err instanceof Error ? err.message : "Failed to compute financial report.",
        );
      }
    },

    async listComplianceSummaries(
      filter?: AdminComplianceFilter,
    ): Promise<ReadQueryResult<readonly AdminComplianceSummaryView[]>> {
      const auth = authorizeStaff("compliance_summaries");
      if (!auth.ok) return readErr(auth.code, auth.error);

      const userById = new Map(auth.state.users.map((u) => [u.id, u]));
      let records = [...auth.state.kycSubmissions].sort(
        (a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
      );
      if (filter?.status) {
        records = records.filter((r) => r.status === filter.status);
      }

      const projected: AdminComplianceSummaryView[] = records.map((rec) => {
        const owner = userById.get(rec.userId);
        const accountStatus = owner?.status ?? "Pending KYC";
        const currentKycTier = owner?.kycLevel ?? "Tier 1";
        const riskStatus: AdminComplianceSummaryView["riskStatus"] =
          accountStatus === "Suspended"
            ? "Restricted"
            : rec.status === "Needs Resubmission"
              ? "Review Required"
              : "Standard";

        return {
          submissionId: rec.id,
          investorId: rec.userId,
          investorName: owner?.fullName ?? "Unknown Investor",
          investorEmail: owner?.email ?? "",
          accountStatus,
          currentKycTier,
          dbCurrentKycTier: currentKycTier as DbKycTier,
          targetTier: rec.targetTier,
          verificationStatus: rec.status,
          dbVerificationStatus: mapFrontendKycStatusToDb(rec.status),
          maskedIdLast4: maskLast4Identifier(rec.idNumberLast4),
          maskedBvnLast4: maskLast4Identifier(rec.bvnLast4),
          idDocumentSubmitted: Boolean(rec.idDocumentName?.trim()),
          proofOfAddressSubmitted: Boolean(rec.proofOfAddressName?.trim()),
          bankAccountVerified: Boolean(owner?.bankAccount?.verified),
          emailVerified: Boolean(owner?.emailVerified),
          riskStatus,
          submittedAt: rec.submittedAt,
          reviewedAt: rec.reviewedAt ?? null,
        };
      });

      return readOk(paginate(projected, filter));
    },

    async listActivitySummaries(
      filter?: AdminActivityFilter,
    ): Promise<ReadQueryResult<readonly AdminActivitySummaryView[]>> {
      const auth = authorizeStaff("activity_summaries");
      if (!auth.ok) return readErr(auth.code, auth.error);

      let logs = auth.state.auditLogs
        .filter((entry) => isActivityVisibleToRole(entry, auth.role))
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

      if (filter?.severity) {
        logs = logs.filter((entry) => entry.severity === filter.severity);
      }

      const projected: AdminActivitySummaryView[] = logs.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        actorName: entry.actorName,
        actorRole: entry.actorRole,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        summary: sanitizeActivitySummaryText(entry.summary),
        severity: entry.severity,
      }));

      return readOk(paginate(projected, filter));
    },

    async getSystemStatus(): Promise<ReadQueryResult<AdminSystemStatusView>> {
      const auth = authorizeStaff("system_status");
      if (!auth.ok) return readErr(auth.code, auth.error);

      // Reuse Phase 6.3 query contract for staff platform settings
      const settingsRes = await sharedReadClient.settings.getStaffPlatformSettings();
      const auditResult = auditMockDatasetIntegrity(auth.state);

      return readOk<AdminSystemStatusView>({
        providerId: "mock",
        standbyMode: false,
        supabaseLiveActivationAllowed: SUPABASE_LIVE_ACTIVATION_ALLOWED,
        maintenanceMode: auth.state.settings.maintenanceMode,
        allowNewRegistrations: auth.state.settings.allowNewRegistrations,
        requireKycForWithdrawals: auth.state.settings.requireKycForWithdrawals,
        minDepositKobo: settingsRes.ok ? settingsRes.data.limitsKobo.depositMinKobo : null,
        maxDailyWithdrawalKobo: settingsRes.ok
          ? settingsRes.data.limitsKobo.dailyWithdrawalTier2Kobo
          : null,
        datasetIntegrityOk: auditResult.ok,
        integrityIssueCount: auditResult.issues.length,
        checkedAt: new Date(now()).toISOString(),
      });
    },
  };
}

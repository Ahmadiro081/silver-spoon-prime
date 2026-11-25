import { getSupabaseClient } from "@/services/supabase/client";
import type {
  MappedBankAccount,
  MappedDeposit,
  MappedInvestment,
  MappedInvestmentMaturity,
  MappedInvestmentPayout,
  MappedInvestmentPlan,
  MappedKycRecord,
  MappedNotification,
  MappedNotificationPreferences,
  MappedPlatformSettings,
  MappedProfile,
  MappedReferral,
  MappedReferralSettings,
  MappedTransaction,
  MappedWalletSummary,
  MappedWithdrawal,
} from "@/services/supabase/mappers";

/**
 * SILVER SPOON — Read-Only Supabase Query Interface Foundation (Phase 6.3)
 *
 * ARCHITECTURAL CONTRACT ONLY:
 * - Strictly READ-ONLY (SELECT via future RLS-protected views/tables).
 * - ZERO financial writes, ZERO balance updates, ZERO ledger mutations,
 *   ZERO deposit/withdrawal/investment creation, ZERO admin mutations,
 *   and ZERO RPC calls.
 * - Executes ZERO network requests during Phase 6.3.
 */

export type ReadQueryErrorCode =
  | "STANDBY_DISCONNECTED"
  | "ACTIVATION_DISABLED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "MAPPING_ERROR";

export type ReadQueryResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly source: "supabase_readonly";
    }
  | {
      readonly ok: false;
      readonly code: ReadQueryErrorCode;
      readonly error: string;
    };

export interface ReadQueryPagination {
  readonly limit?: number;
  readonly offset?: number;
}

export interface TransactionHistoryFilter extends ReadQueryPagination {
  readonly status?: string;
  readonly type?: string;
}

export interface InvestmentHistoryFilter extends ReadQueryPagination {
  readonly status?: string;
}

export interface NotificationQueryFilter extends ReadQueryPagination {
  readonly unreadOnly?: boolean;
}

export interface InvestorProfileReadQueries {
  readonly getOwnProfile: () => Promise<ReadQueryResult<MappedProfile | null>>;
  readonly getOwnBankAccounts: () => Promise<ReadQueryResult<readonly MappedBankAccount[]>>;
}

export interface WalletReadQueries {
  readonly getOwnWalletSummary: () => Promise<ReadQueryResult<MappedWalletSummary | null>>;
}

export interface TransactionReadQueries {
  readonly listOwnTransactions: (
    filter?: TransactionHistoryFilter,
  ) => Promise<ReadQueryResult<readonly MappedTransaction[]>>;
  readonly getOwnTransactionById: (
    transactionId: string,
  ) => Promise<ReadQueryResult<MappedTransaction | null>>;
  readonly listOwnDeposits: (
    pagination?: ReadQueryPagination,
  ) => Promise<ReadQueryResult<readonly MappedDeposit[]>>;
  readonly listOwnWithdrawals: (
    pagination?: ReadQueryPagination,
  ) => Promise<ReadQueryResult<readonly MappedWithdrawal[]>>;
}

export interface InvestmentReadQueries {
  readonly listOwnInvestments: (
    filter?: InvestmentHistoryFilter,
  ) => Promise<ReadQueryResult<readonly MappedInvestment[]>>;
  readonly getOwnInvestmentById: (
    investmentId: string,
  ) => Promise<ReadQueryResult<MappedInvestment | null>>;
  readonly listOwnPayouts: (
    investmentId?: string,
  ) => Promise<ReadQueryResult<readonly MappedInvestmentPayout[]>>;
  readonly listOwnMaturities: (
    investmentId?: string,
  ) => Promise<ReadQueryResult<readonly MappedInvestmentMaturity[]>>;
}

export interface InvestmentPlanReadQueries {
  readonly listPublicActivePlans: () => Promise<ReadQueryResult<readonly MappedInvestmentPlan[]>>;
  readonly listAccessiblePlans: () => Promise<ReadQueryResult<readonly MappedInvestmentPlan[]>>;
  readonly getPlanById: (planId: string) => Promise<ReadQueryResult<MappedInvestmentPlan | null>>;
}

export interface NotificationReadQueries {
  readonly listOwnNotifications: (
    filter?: NotificationQueryFilter,
  ) => Promise<ReadQueryResult<readonly MappedNotification[]>>;
  readonly getOwnNotificationPreferences: () => Promise<
    ReadQueryResult<MappedNotificationPreferences | null>
  >;
}

export interface KycReadQueries {
  readonly listOwnKycRecords: () => Promise<ReadQueryResult<readonly MappedKycRecord[]>>;
  readonly getLatestOwnKycStatus: () => Promise<ReadQueryResult<MappedKycRecord | null>>;
}

export interface ReferralReadQueries {
  readonly listOwnReferrals: () => Promise<ReadQueryResult<readonly MappedReferral[]>>;
  readonly getActiveReferralSettings: () => Promise<ReadQueryResult<MappedReferralSettings | null>>;
}

export interface PlatformSettingsReadQueries {
  readonly getStaffPlatformSettings: () => Promise<ReadQueryResult<MappedPlatformSettings>>;
}

/**
 * Aggregated strictly read-only query contract for future Supabase integration.
 * Intentionally omits ALL write, balance-update, ledger, and admin-mutation methods.
 */
export interface SupabaseReadOnlyQueryContract {
  readonly mode: "standby_disconnected" | "readonly_authorized";
  readonly profile: InvestorProfileReadQueries;
  readonly wallet: WalletReadQueries;
  readonly transactions: TransactionReadQueries;
  readonly investments: InvestmentReadQueries;
  readonly plans: InvestmentPlanReadQueries;
  readonly notifications: NotificationReadQueries;
  readonly kyc: KycReadQueries;
  readonly referrals: ReferralReadQueries;
  readonly settings: PlatformSettingsReadQueries;
}

/**
 * Authoritative table-to-query RLS mapping reference for Phase 6.3 documentation.
 */
export const READ_ONLY_QUERY_TABLE_MAP = {
  "profile.getOwnProfile": "public.profiles + public.user_roles (SELECT own via RLS)",
  "profile.getOwnBankAccounts": "public.wallet_accounts (SELECT own via RLS)",
  "wallet.getOwnWalletSummary": "public.wallets + public.wallet_balances (SELECT own via RLS)",
  "transactions.listOwnTransactions": "public.transactions (SELECT own via RLS)",
  "transactions.getOwnTransactionById": "public.transactions (SELECT own via RLS)",
  "transactions.listOwnDeposits": "public.deposits (SELECT own via RLS)",
  "transactions.listOwnWithdrawals": "public.withdrawals (SELECT own via RLS)",
  "investments.listOwnInvestments": "public.investments (SELECT own via RLS)",
  "investments.getOwnInvestmentById": "public.investments (SELECT own via RLS)",
  "investments.listOwnPayouts": "public.investment_payouts (SELECT own via RLS)",
  "investments.listOwnMaturities": "public.investment_maturities (SELECT own via RLS)",
  "plans.listPublicActivePlans": "public.investment_plans (SELECT status='active' via anon/authenticated RLS)",
  "plans.listAccessiblePlans": "public.investment_plans (SELECT active + held positions via authenticated RLS)",
  "plans.getPlanById": "public.investment_plans (SELECT via RLS)",
  "notifications.listOwnNotifications": "public.notifications (SELECT own via RLS)",
  "notifications.getOwnNotificationPreferences": "public.notification_preferences (SELECT own via RLS)",
  "kyc.listOwnKycRecords": "public.kyc_records + public.kyc_documents (SELECT own via RLS)",
  "kyc.getLatestOwnKycStatus": "public.kyc_records (SELECT latest own via RLS)",
  "referrals.listOwnReferrals": "public.referrals + public.referral_commissions (SELECT own via RLS)",
  "referrals.getActiveReferralSettings": "public.referral_settings (SELECT is_active=true via RLS)",
  "settings.getStaffPlatformSettings": "public.platform_settings (SELECT staff-only via RLS)",
} as const;

async function standbyReadFailure<T>(queryName: string): Promise<ReadQueryResult<T>> {
  const status = getSupabaseClient().assertNotActivated(`readonly:${queryName}`);
  return {
    ok: false,
    code: "STANDBY_DISCONNECTED",
    error: status.error,
  };
}

/**
 * Disconnected standby implementation of `SupabaseReadOnlyQueryContract`.
 * Performs ZERO network calls and returns structured standby results for every query.
 */
export function createStandbyReadOnlyQueryClient(): SupabaseReadOnlyQueryContract {
  return {
    mode: "standby_disconnected",
    profile: {
      getOwnProfile: () => standbyReadFailure("profile.getOwnProfile"),
      getOwnBankAccounts: () => standbyReadFailure("profile.getOwnBankAccounts"),
    },
    wallet: {
      getOwnWalletSummary: () => standbyReadFailure("wallet.getOwnWalletSummary"),
    },
    transactions: {
      listOwnTransactions: () => standbyReadFailure("transactions.listOwnTransactions"),
      getOwnTransactionById: () => standbyReadFailure("transactions.getOwnTransactionById"),
      listOwnDeposits: () => standbyReadFailure("transactions.listOwnDeposits"),
      listOwnWithdrawals: () => standbyReadFailure("transactions.listOwnWithdrawals"),
    },
    investments: {
      listOwnInvestments: () => standbyReadFailure("investments.listOwnInvestments"),
      getOwnInvestmentById: () => standbyReadFailure("investments.getOwnInvestmentById"),
      listOwnPayouts: () => standbyReadFailure("investments.listOwnPayouts"),
      listOwnMaturities: () => standbyReadFailure("investments.listOwnMaturities"),
    },
    plans: {
      listPublicActivePlans: () => standbyReadFailure("plans.listPublicActivePlans"),
      listAccessiblePlans: () => standbyReadFailure("plans.listAccessiblePlans"),
      getPlanById: () => standbyReadFailure("plans.getPlanById"),
    },
    notifications: {
      listOwnNotifications: () => standbyReadFailure("notifications.listOwnNotifications"),
      getOwnNotificationPreferences: () =>
        standbyReadFailure("notifications.getOwnNotificationPreferences"),
    },
    kyc: {
      listOwnKycRecords: () => standbyReadFailure("kyc.listOwnKycRecords"),
      getLatestOwnKycStatus: () => standbyReadFailure("kyc.getLatestOwnKycStatus"),
    },
    referrals: {
      listOwnReferrals: () => standbyReadFailure("referrals.listOwnReferrals"),
      getActiveReferralSettings: () => standbyReadFailure("referrals.getActiveReferralSettings"),
    },
    settings: {
      getStaffPlatformSettings: () => standbyReadFailure("settings.getStaffPlatformSettings"),
    },
  };
}

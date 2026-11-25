import type { DataProviderId } from "@/services/supabase/config";
import type {
  DbAccountStatusCode,
  DbKycStatus,
  DbKycTier,
  DbWalletStatus,
} from "@/services/supabase/enums";
import type {
  InvestmentPlan,
  InvestmentStatus,
  KycSubmissionStatus,
  NotificationCategory,
  RiskBand,
  TransactionStatus,
  TransactionType,
  AccountStatus,
} from "@/types/domain";

/**
 * SILVER SPOON — Phase 6.5 Investor Read-Only Domain Contracts
 *
 * Strictly READ-ONLY investor-facing projections backed by:
 * - Phase 6.2 provider registry
 * - Phase 6.3 21-method read-only query contract, mappers, and integer-kobo utilities
 * - Phase 6.4 centralized authentication & session state
 *
 * Security & Precision Invariants:
 * - All financial values preserve exact integer-kobo amounts internally alongside Naira display values.
 * - Zero caller-supplied user IDs are trusted; identity is always derived from the active authenticated session.
 * - KYC views NEVER expose full BVN, full NIN, salted verification hashes, or internal compliance notes.
 * - Zero administrative or compliance-only datasets are exposed.
 */

export type InvestorReadDataSource = "mock_readonly" | "supabase_readonly" | "none";

export type InvestorDataLoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "disconnected"
  | "unauthenticated"
  | "session_expired";

export type InvestorReadErrorCode =
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "STANDBY_DISCONNECTED"
  | "PROVIDER_CONFIG_ERROR"
  | "MAPPING_ERROR"
  | "READ_ERROR";

export interface InvestorReadError {
  readonly code: InvestorReadErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
}

export type InvestorReadResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly source: InvestorReadDataSource;
    }
  | {
      readonly ok: false;
      readonly error: InvestorReadError;
      readonly source: InvestorReadDataSource;
    };

// ── D1 & D10: Investor Profile & Account Status ───────────────────────────────

export interface InvestorAccountStatusView {
  readonly accountStatus: AccountStatus;
  readonly dbAccountStatus: DbAccountStatusCode | null;
  readonly emailVerified: boolean;
  readonly walletStatus: DbWalletStatus;
  readonly canTransact: boolean;
  readonly canWithdraw: boolean;
}

export interface InvestorProfileView {
  readonly investorId: string;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly city: string | null;
  readonly accountStatus: AccountStatus;
  readonly dbAccountStatus: DbAccountStatusCode | null;
  readonly emailVerified: boolean;
  readonly tier: "Silver" | "Platinum" | "Sovereign";
  readonly kycLevel: "Tier 1" | "Tier 2" | "Tier 3";
  readonly referralCode: string;
  readonly registeredAt: string;
  readonly lastLoginAt: string;
}

// ── D2: Wallet Summary (Integer-Kobo Authoritative + Naira Display) ───────────

export interface InvestorWalletSummaryView {
  readonly currency: "NGN";
  readonly walletStatus: DbWalletStatus;
  readonly availableKobo: number;
  readonly lockedKobo: number;
  readonly pendingWithdrawalKobo: number;
  readonly totalKobo: number;
  readonly realizedEarningsKobo: number;
  readonly totalDepositsKobo: number;
  readonly totalWithdrawalsKobo: number;
  readonly referralEarningsKobo: number;
  readonly projectedAccrualKobo: number;
  readonly availableBalance: number;
  readonly lockedBalance: number;
  readonly pendingWithdrawals: number;
  readonly totalBalance: number;
  readonly realizedEarnings: number;
  readonly totalDeposits: number;
  readonly totalWithdrawals: number;
  readonly referralEarnings: number;
  readonly projectedAccrual: number;
  readonly reconciledAt: string;
}

// ── D3: Transactions ──────────────────────────────────────────────────────────

export interface InvestorTransactionView {
  readonly id: string;
  readonly reference: string;
  readonly type: TransactionType;
  readonly amountKobo: number;
  readonly feeKobo: number;
  readonly amount: number;
  readonly fee: number;
  readonly currency: "NGN";
  readonly status: TransactionStatus;
  readonly channel: string;
  readonly createdAt: string;
  readonly description: string | null;
}

// ── D4: Deposits ──────────────────────────────────────────────────────────────

export interface InvestorDepositView {
  readonly id: string;
  readonly reference: string;
  readonly amountKobo: number;
  readonly amount: number;
  readonly currency: "NGN";
  readonly paymentMethod: string | null;
  readonly status: TransactionStatus;
  readonly createdAt: string;
  readonly confirmedAt: string | null;
}

// ── D5: Withdrawals ───────────────────────────────────────────────────────────

export interface InvestorWithdrawalView {
  readonly id: string;
  readonly reference: string;
  readonly amountKobo: number;
  readonly feeKobo: number;
  readonly totalReservedKobo: number;
  readonly amount: number;
  readonly fee: number;
  readonly currency: "NGN";
  readonly status: TransactionStatus;
  readonly requestedAt: string;
  readonly processedAt: string | null;
}

// ── D6: Investments ───────────────────────────────────────────────────────────

export interface InvestorInvestmentView {
  readonly id: string;
  readonly reference: string;
  readonly planId: string;
  readonly planName: string;
  readonly principalKobo: number;
  readonly expectedReturnKobo: number;
  readonly accruedReturnKobo: number;
  readonly principal: number;
  readonly expectedReturn: number;
  readonly accruedReturn: number;
  readonly targetReturnPercent: number;
  readonly durationDays: number;
  readonly riskBand: RiskBand;
  readonly status: InvestmentStatus;
  readonly startedAt: string;
  readonly maturesAt: string;
  readonly autoCompound: boolean;
}

// ── D7: Investment Plans ──────────────────────────────────────────────────────

export interface InvestorPlanView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly tagline: string;
  readonly description: string;
  readonly minAmountKobo: number;
  readonly maxAmountKobo: number | null;
  readonly minAmount: number;
  readonly maxAmount: number;
  readonly durationDays: number;
  readonly targetReturnPercent: number;
  readonly riskBand: RiskBand;
  readonly payoutFrequency: InvestmentPlan["payoutFrequency"];
  readonly managementFeePercent: number;
  readonly status: InvestmentPlan["status"];
  readonly featured: boolean;
  readonly allocationFocus: readonly string[];
  readonly perks: readonly string[];
  readonly riskNote: string;
}

// ── D8: Notifications ─────────────────────────────────────────────────────────

export interface InvestorNotificationView {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly type: NotificationCategory;
  readonly createdAt: string;
  readonly read: boolean;
}

// ── D9: Sanitized Investor-Facing KYC Status ──────────────────────────────────

export interface InvestorKycDocumentStatusView {
  readonly targetTier: "Tier 2" | "Tier 3";
  readonly status: KycSubmissionStatus;
  readonly dbStatus: DbKycStatus | null;
  readonly submittedAt: string;
  readonly verifiedAt: string | null;
  readonly maskedIdLast4: string | null;
  readonly maskedBvnLast4: string | null;
  readonly idDocumentSubmitted: boolean;
  readonly proofOfAddressSubmitted: boolean;
}

/**
 * Strictly sanitized investor KYC projection.
 * Deliberately excludes raw BVN, raw NIN, `bvn_hash`, `nin_hash`,
 * internal vendor references, PEP/sanctions flags, reviewer IDs, and internal compliance notes.
 */
export interface InvestorKycStatusView {
  readonly currentTier: "Tier 1" | "Tier 2" | "Tier 3";
  readonly dbCurrentTier: DbKycTier | null;
  readonly verificationStatus: KycSubmissionStatus | "Not Submitted";
  readonly accountStatus: AccountStatus;
  readonly submissions: readonly InvestorKycDocumentStatusView[];
}

// ── Aggregated Read Snapshot & Orchestrator Interface ─────────────────────────

export interface InvestorReadSnapshot {
  readonly status: InvestorDataLoadStatus;
  readonly provider: DataProviderId | null;
  readonly source: InvestorReadDataSource;
  readonly isLoading: boolean;
  readonly isEmpty: boolean;
  readonly isDisconnected: boolean;
  readonly error: InvestorReadError | null;
  readonly disconnectedReason: string | null;
  readonly lastUpdatedAt: string | null;
  readonly profile: InvestorProfileView | null;
  readonly accountStatus: InvestorAccountStatusView | null;
  readonly wallet: InvestorWalletSummaryView | null;
  readonly transactions: readonly InvestorTransactionView[];
  readonly deposits: readonly InvestorDepositView[];
  readonly withdrawals: readonly InvestorWithdrawalView[];
  readonly investments: readonly InvestorInvestmentView[];
  readonly plans: readonly InvestorPlanView[];
  readonly notifications: readonly InvestorNotificationView[];
  readonly unreadNotificationCount: number;
  readonly kyc: InvestorKycStatusView | null;
}

/**
 * Strictly read-only investor query orchestrator contract.
 * Notice ZERO methods accept a `userId` parameter — identity is ALWAYS resolved
 * exclusively from the authenticated session inside the provider boundary.
 */
export interface InvestorReadOnlyOrchestrator {
  readonly providerId: DataProviderId;
  readonly standbyMode: boolean;

  getInvestorProfile(): Promise<InvestorReadResult<InvestorProfileView | null>>;
  getInvestorAccountStatus(): Promise<InvestorReadResult<InvestorAccountStatusView | null>>;
  getWalletSummary(): Promise<InvestorReadResult<InvestorWalletSummaryView | null>>;
  getTransactionHistory(): Promise<InvestorReadResult<readonly InvestorTransactionView[]>>;
  getDepositHistory(): Promise<InvestorReadResult<readonly InvestorDepositView[]>>;
  getWithdrawalHistory(): Promise<InvestorReadResult<readonly InvestorWithdrawalView[]>>;
  getInvestmentPortfolio(): Promise<InvestorReadResult<readonly InvestorInvestmentView[]>>;
  getAvailableInvestmentPlans(): Promise<InvestorReadResult<readonly InvestorPlanView[]>>;
  getNotifications(): Promise<InvestorReadResult<readonly InvestorNotificationView[]>>;
  getKycStatus(): Promise<InvestorReadResult<InvestorKycStatusView | null>>;
  loadInvestorSnapshot(): Promise<InvestorReadSnapshot>;
}

import type {
  AccountStatus,
  BankVerificationStatus,
  InvestmentPlan,
  InvestmentStatus,
  KycSubmissionStatus,
  NotificationCategory,
  PlanStatus,
  ReferralStatus,
  RiskBand,
  TransactionStatus,
  TransactionType,
  UserProfile,
  UserRole,
} from "@/types/domain";

/**
 * SILVER SPOON — Database Enum Normalization Layer (Phase 6.3)
 *
 * AUTHORITATIVE SCHEMA SOURCE:
 * Frozen PostgreSQL migrations `20261123000100` through `20261123001400`.
 *
 * DESIGN RULES:
 * - Never assume 1:1 equivalence between PostgreSQL enums and Frontend v1.0 unions.
 * - Explicitly document every mismatch in `ENUM_MISMATCH_REGISTRY`.
 * - Handle unknown/unexpected database enum values safely without fabricating valid states
 *   or silently elevating privileges.
 * - Never modify frozen migrations or authorization rules.
 */

// ── Authoritative Database Enum Value Unions (from migrations 0001–0009) ──

export type DbAccountStatusCode =
  | "active"
  | "pending_verification"
  | "frozen"
  | "suspended"
  | "closed";

export type DbAppRole =
  | "super_admin"
  | "admin"
  | "finance_officer"
  | "compliance_officer"
  | "investor";

export type DbClientTier = "Standard" | "Silver" | "Gold" | "Platinum" | "Private";

export type DbInvestorClassification =
  | "retail_individual"
  | "hnw_individual"
  | "corporate"
  | "tax_exempt_entity";

export type DbWalletStatus = "active" | "frozen" | "closed";

export type DbBankVerificationStatus = "pending_approval" | "verified" | "rejected" | "revoked";

export type DbTransactionType =
  | "deposit"
  | "withdrawal"
  | "investment_subscription"
  | "investment_maturity"
  | "investment_payout"
  | "referral_commission"
  | "fee"
  | "tax_withholding"
  | "adjustment"
  | "reversal";

export type DbTransactionStatus =
  | "initiated"
  | "pending"
  | "pending_approval"
  | "approved"
  | "processing"
  | "completed"
  | "failed"
  | "declined"
  | "reversed";

export type DbDepositChannel = "paystack_checkout_card" | "paystack_checkout_bank_transfer";

export type DbWithdrawalBatchStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "disbursing"
  | "settled"
  | "partially_settled"
  | "cancelled";

export type DbPlanStatus = "draft" | "active" | "paused" | "archived";

export type DbPlanRiskBand = "Conservative" | "Moderate" | "Balanced" | "Institutional";

export type DbInstrumentType =
  | "fgn_treasury_bill"
  | "fgn_bond"
  | "corporate_commercial_paper"
  | "private_credit"
  | "money_market_fund";

export type DbInvestmentStatus = "active" | "matured" | "rolled_over" | "cancelled";

export type DbRolloverMode = "none" | "principal_only" | "principal_plus_net_return";

export type DbMaturityDisposition =
  | "settled_to_available"
  | "rolled_principal_only"
  | "rolled_principal_plus_net_return"
  | "settled_to_available_plan_unavailable";

export type DbKycTier = "Tier 0" | "Tier 1" | "Tier 2" | "Tier 3";

export type DbKycStatus =
  | "not_started"
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "expired";

export type DbNotificationCategory =
  | "Account"
  | "Wallet"
  | "Investment"
  | "Compliance"
  | "Security"
  | "System";

export type DbReferralStatus = "pending" | "qualified" | "paid" | "disqualified";

export type DbPaymentReferenceStatus =
  | "initialized"
  | "pending"
  | "succeeded"
  | "failed"
  | "abandoned"
  | "reversed";

export type DbComplianceSeverity = "low" | "medium" | "high" | "critical";

// ── Normalized Result Wrapper ──

export interface EnumNormalizationResult<TFrontend, TDb extends string = string> {
  readonly value: TFrontend;
  readonly raw: string;
  readonly dbValue: TDb | null;
  readonly known: boolean;
  readonly exact: boolean;
  readonly warning: string | null;
}

export interface EnumMismatchSpec {
  readonly domain: string;
  readonly dbEnumName: string;
  readonly migrationRef: string;
  readonly dbValues: readonly string[];
  readonly frontendValues: readonly string[];
  readonly mismatches: readonly string[];
}

function normalizeRaw(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "");
}

function unknownResult<TFrontend, TDb extends string>(
  domain: string,
  raw: string,
  fallback: TFrontend,
): EnumNormalizationResult<TFrontend, TDb> {
  return {
    value: fallback,
    raw,
    dbValue: null,
    known: false,
    exact: false,
    warning: `Unknown database ${domain} value "${raw}"; defaulted safely to "${String(fallback)}" without assuming semantic equivalence.`,
  };
}

// ── 1. Account Status (account_statuses.code -> AccountStatus) ──

export function normalizeAccountStatus(
  value: unknown,
): EnumNormalizationResult<AccountStatus, DbAccountStatusCode> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "active":
      return { value: "Active", raw, dbValue: "active", known: true, exact: true, warning: null };
    case "pending_verification":
      return {
        value: "Pending KYC",
        raw,
        dbValue: "pending_verification",
        known: true,
        exact: false,
        warning:
          'Database status "pending_verification" maps to frontend "Pending KYC" because frontend lacks a dedicated email-verification status.',
      };
    case "frozen":
      return {
        value: "Suspended",
        raw,
        dbValue: "frozen",
        known: true,
        exact: false,
        warning:
          'Database status "frozen" (login allowed, transactions blocked) maps conservatively to frontend "Suspended".',
      };
    case "suspended":
      return {
        value: "Suspended",
        raw,
        dbValue: "suspended",
        known: true,
        exact: true,
        warning: null,
      };
    case "closed":
      return {
        value: "Suspended",
        raw,
        dbValue: "closed",
        known: true,
        exact: false,
        warning:
          'Database status "closed" (NDPA permanent closure) maps conservatively to frontend "Suspended".',
      };
    default:
      // Fail-closed: unknown status must NEVER map to "Active"
      return unknownResult("account_statuses.code", raw, "Suspended");
  }
}

// ── 2. User Roles (app_role_enum -> UserRole) ──

export function normalizeUserRole(
  value: unknown,
): EnumNormalizationResult<UserRole, DbAppRole> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "investor":
      return { value: "investor", raw, dbValue: "investor", known: true, exact: true, warning: null };
    case "admin":
      return { value: "admin", raw, dbValue: "admin", known: true, exact: true, warning: null };
    case "super_admin":
    case "finance_officer":
    case "compliance_officer":
      return {
        value: "admin",
        raw,
        dbValue: raw,
        known: true,
        exact: false,
        warning: `Granular database staff role "${raw}" maps to coarse frontend portal role "admin"; server-side RBAC remains authoritative.`,
      };
    default:
      // Fail-closed least-privilege: unknown role must NEVER map to "admin"
      return unknownResult("app_role_enum", raw, "investor");
  }
}

/**
 * Resolves a set of active database roles from `public.user_roles` into a frontend
 * portal role while preserving the exact database role list for future fine-grained checks.
 */
export function resolvePrimaryUserRole(
  roles: ReadonlyArray<unknown>,
): EnumNormalizationResult<UserRole, DbAppRole> & { readonly dbRoles: readonly DbAppRole[] } {
  const normalized = roles.map((r) => normalizeUserRole(r));
  const dbRoles = normalized
    .map((n) => n.dbValue)
    .filter((r): r is DbAppRole => r !== null);

  const staffPriority: readonly DbAppRole[] = [
    "super_admin",
    "admin",
    "finance_officer",
    "compliance_officer",
  ];
  for (const staffRole of staffPriority) {
    const match = normalized.find((n) => n.dbValue === staffRole);
    if (match) {
      return { ...match, dbRoles };
    }
  }

  const investorMatch = normalized.find((n) => n.dbValue === "investor");
  if (investorMatch) {
    return { ...investorMatch, dbRoles };
  }

  return {
    value: "investor",
    raw: roles.map(normalizeRaw).join(","),
    dbValue: null,
    known: false,
    exact: false,
    warning:
      "No recognized active role found in user_roles; defaulted conservatively to least-privilege investor view.",
    dbRoles,
  };
}

// ── 3. Client Tier (client_tier_enum -> UserProfile["tier"]) ──

export function normalizeClientTier(
  value: unknown,
): EnumNormalizationResult<UserProfile["tier"], DbClientTier> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "Standard":
      return {
        value: "Silver",
        raw,
        dbValue: "Standard",
        known: true,
        exact: false,
        warning: 'Database tier "Standard" maps to frontend entry tier "Silver".',
      };
    case "Silver":
      return { value: "Silver", raw, dbValue: "Silver", known: true, exact: true, warning: null };
    case "Gold":
      return {
        value: "Platinum",
        raw,
        dbValue: "Gold",
        known: true,
        exact: false,
        warning: 'Database tier "Gold" has no distinct frontend tier; mapped to "Platinum".',
      };
    case "Platinum":
      return { value: "Platinum", raw, dbValue: "Platinum", known: true, exact: true, warning: null };
    case "Private":
      return {
        value: "Sovereign",
        raw,
        dbValue: "Private",
        known: true,
        exact: false,
        warning: 'Database tier "Private" maps to frontend top tier "Sovereign".',
      };
    default:
      return unknownResult("client_tier_enum", raw, "Silver");
  }
}

// ── 4. Transaction Type (transaction_type_enum -> TransactionType | null) ──

export function normalizeTransactionType(
  value: unknown,
): EnumNormalizationResult<TransactionType | null, DbTransactionType> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "deposit":
      return { value: "Deposit", raw, dbValue: "deposit", known: true, exact: true, warning: null };
    case "withdrawal":
      return {
        value: "Withdrawal",
        raw,
        dbValue: "withdrawal",
        known: true,
        exact: true,
        warning: null,
      };
    case "investment_subscription":
      return {
        value: "Investment",
        raw,
        dbValue: "investment_subscription",
        known: true,
        exact: true,
        warning: null,
      };
    case "investment_maturity":
      return {
        value: "Realized Return",
        raw,
        dbValue: "investment_maturity",
        known: true,
        exact: false,
        warning:
          'Database type "investment_maturity" includes principal settlement/rollover disposition; mapped to frontend "Realized Return" with raw dbTransactionType preserved.',
      };
    case "investment_payout":
      return {
        value: "Realized Return",
        raw,
        dbValue: "investment_payout",
        known: true,
        exact: true,
        warning: null,
      };
    case "referral_commission":
      return {
        value: "Referral Commission",
        raw,
        dbValue: "referral_commission",
        known: true,
        exact: true,
        warning: null,
      };
    case "fee":
    case "tax_withholding":
    case "adjustment":
    case "reversal":
      return {
        value: null,
        raw,
        dbValue: raw,
        known: true,
        exact: false,
        warning: `Database transaction_type_enum "${raw}" has no direct Frontend v1.0 TransactionType equivalent; preserved as dbTransactionType without silent fabrication.`,
      };
    default:
      return unknownResult("transaction_type_enum", raw, null);
  }
}

// ── 5. Transaction Status (transaction_status_enum -> TransactionStatus) ──

export function normalizeTransactionStatus(
  value: unknown,
): EnumNormalizationResult<TransactionStatus, DbTransactionStatus> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "completed":
      return {
        value: "Completed",
        raw,
        dbValue: "completed",
        known: true,
        exact: true,
        warning: null,
      };
    case "pending":
      return { value: "Pending", raw, dbValue: "pending", known: true, exact: true, warning: null };
    case "initiated":
    case "pending_approval":
    case "approved":
    case "processing":
      return {
        value: "Pending",
        raw,
        dbValue: raw,
        known: true,
        exact: false,
        warning: `Granular database transaction_status_enum "${raw}" maps to frontend "Pending" until final settlement ("completed").`,
      };
    case "declined":
      return {
        value: "Declined",
        raw,
        dbValue: "declined",
        known: true,
        exact: true,
        warning: null,
      };
    case "failed":
    case "reversed":
      return {
        value: "Declined",
        raw,
        dbValue: raw,
        known: true,
        exact: false,
        warning: `Database transaction_status_enum "${raw}" maps to frontend "Declined" with raw dbTransactionStatus preserved.`,
      };
    default:
      // Fail-closed: unknown status must NEVER be treated as "Completed"
      return unknownResult("transaction_status_enum", raw, "Pending");
  }
}

// ── 6. Investment Status (investment_status_enum -> InvestmentStatus) ──

export function normalizeInvestmentStatus(
  value: unknown,
): EnumNormalizationResult<InvestmentStatus, DbInvestmentStatus> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "active":
      return { value: "Active", raw, dbValue: "active", known: true, exact: true, warning: null };
    case "matured":
      return { value: "Matured", raw, dbValue: "matured", known: true, exact: true, warning: null };
    case "rolled_over":
      return {
        value: "Matured",
        raw,
        dbValue: "rolled_over",
        known: true,
        exact: false,
        warning:
          'Database investment_status_enum "rolled_over" maps to frontend "Matured" (linked via rolledOverToInvestmentId).',
      };
    case "cancelled":
      return {
        value: "Cancelled",
        raw,
        dbValue: "cancelled",
        known: true,
        exact: true,
        warning: null,
      };
    default:
      return unknownResult("investment_status_enum", raw, "Cancelled");
  }
}

// ── 7. Investment Plan Status (plan_status_enum -> PlanStatus) ──

export function normalizePlanStatus(
  value: unknown,
): EnumNormalizationResult<PlanStatus, DbPlanStatus> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "active":
      return { value: "Active", raw, dbValue: "active", known: true, exact: true, warning: null };
    case "paused":
      return { value: "Paused", raw, dbValue: "paused", known: true, exact: true, warning: null };
    case "archived":
      return {
        value: "Archived",
        raw,
        dbValue: "archived",
        known: true,
        exact: true,
        warning: null,
      };
    case "draft":
      return {
        value: "Paused",
        raw,
        dbValue: "draft",
        known: true,
        exact: false,
        warning:
          'Database plan_status_enum "draft" maps conservatively to frontend "Paused" so unpublished plans never appear subscribable.',
      };
    default:
      // Fail-closed: unknown plan status must NEVER appear "Active"
      return unknownResult("plan_status_enum", raw, "Paused");
  }
}

// ── 8. Plan Risk Band (investment_plans.risk_band -> RiskBand) ──

export function normalizePlanRiskBand(
  value: unknown,
): EnumNormalizationResult<RiskBand, DbPlanRiskBand> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "Conservative":
      return {
        value: "Low",
        raw,
        dbValue: "Conservative",
        known: true,
        exact: false,
        warning: 'Database risk_band "Conservative" maps to frontend RiskBand "Low".',
      };
    case "Moderate":
      return {
        value: "Moderate",
        raw,
        dbValue: "Moderate",
        known: true,
        exact: true,
        warning: null,
      };
    case "Balanced":
      return {
        value: "Moderate",
        raw,
        dbValue: "Balanced",
        known: true,
        exact: false,
        warning: 'Database risk_band "Balanced" maps to frontend RiskBand "Moderate".',
      };
    case "Institutional":
      return {
        value: "Elevated",
        raw,
        dbValue: "Institutional",
        known: true,
        exact: false,
        warning: 'Database risk_band "Institutional" maps to frontend RiskBand "Elevated".',
      };
    default:
      return unknownResult("investment_plans.risk_band", raw, "Moderate");
  }
}

// ── 9. Rollover Mode (rollover_mode_enum -> boolean autoCompound) ──

export function normalizeRolloverMode(
  value: unknown,
): EnumNormalizationResult<boolean, DbRolloverMode> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "none":
      return { value: false, raw, dbValue: "none", known: true, exact: true, warning: null };
    case "principal_only":
      return {
        value: false,
        raw,
        dbValue: "principal_only",
        known: true,
        exact: false,
        warning:
          'Database rollover_mode_enum "principal_only" (ADR-005 default) rolls principal without compounding returns; maps to autoCompound=false with raw rolloverMode preserved.',
      };
    case "principal_plus_net_return":
      return {
        value: true,
        raw,
        dbValue: "principal_plus_net_return",
        known: true,
        exact: true,
        warning: null,
      };
    default:
      // Fail-closed: unknown rollover mode must NEVER opt into return compounding
      return unknownResult("rollover_mode_enum", raw, false);
  }
}

// ── 10. KYC Tier (kyc_tier_enum -> UserProfile["kycLevel"]) ──

export function normalizeKycTier(
  value: unknown,
): EnumNormalizationResult<UserProfile["kycLevel"], DbKycTier> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "Tier 0":
      return {
        value: "Tier 1",
        raw,
        dbValue: "Tier 0",
        known: true,
        exact: false,
        warning:
          'Database kyc_tier_enum "Tier 0" has no frontend equivalent; mapped conservatively to "Tier 1" with raw dbKycTier preserved.',
      };
    case "Tier 1":
      return { value: "Tier 1", raw, dbValue: "Tier 1", known: true, exact: true, warning: null };
    case "Tier 2":
      return { value: "Tier 2", raw, dbValue: "Tier 2", known: true, exact: true, warning: null };
    case "Tier 3":
      return { value: "Tier 3", raw, dbValue: "Tier 3", known: true, exact: true, warning: null };
    default:
      // Fail-closed: unknown tier must NEVER grant Tier 2/3 privileges
      return unknownResult("kyc_tier_enum", raw, "Tier 1");
  }
}

// ── 11. KYC Status (kyc_status_enum -> KycSubmissionStatus) ──

export function normalizeKycStatus(
  value: unknown,
): EnumNormalizationResult<KycSubmissionStatus, DbKycStatus> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "approved":
      return {
        value: "Approved",
        raw,
        dbValue: "approved",
        known: true,
        exact: true,
        warning: null,
      };
    case "under_review":
      return {
        value: "Under Review",
        raw,
        dbValue: "under_review",
        known: true,
        exact: true,
        warning: null,
      };
    case "submitted":
      return {
        value: "Under Review",
        raw,
        dbValue: "submitted",
        known: true,
        exact: false,
        warning: 'Database kyc_status_enum "submitted" maps to frontend "Under Review".',
      };
    case "rejected":
    case "expired":
    case "not_started":
    case "draft":
      return {
        value: "Needs Resubmission",
        raw,
        dbValue: raw,
        known: true,
        exact: false,
        warning: `Database kyc_status_enum "${raw}" maps to frontend "Needs Resubmission" with raw dbKycStatus preserved.`,
      };
    default:
      return unknownResult("kyc_status_enum", raw, "Needs Resubmission");
  }
}

// ── 12. Notification Category (notification_category_enum -> NotificationCategory) ──

export function normalizeNotificationCategory(
  value: unknown,
): EnumNormalizationResult<NotificationCategory, DbNotificationCategory> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "Investment":
      return {
        value: "investment",
        raw,
        dbValue: "Investment",
        known: true,
        exact: true,
        warning: null,
      };
    case "Security":
      return {
        value: "security",
        raw,
        dbValue: "Security",
        known: true,
        exact: true,
        warning: null,
      };
    case "System":
      return {
        value: "platform",
        raw,
        dbValue: "System",
        known: true,
        exact: false,
        warning: 'Database notification_category_enum "System" maps to frontend "platform".',
      };
    case "Account":
      return {
        value: "platform",
        raw,
        dbValue: "Account",
        known: true,
        exact: false,
        warning: 'Database notification_category_enum "Account" maps to frontend "platform".',
      };
    case "Wallet":
      return {
        value: "deposit",
        raw,
        dbValue: "Wallet",
        known: true,
        exact: false,
        warning:
          'Database notification_category_enum "Wallet" combines deposits and withdrawals; mapped to "deposit" with raw dbCategory preserved.',
      };
    case "Compliance":
      return {
        value: "security",
        raw,
        dbValue: "Compliance",
        known: true,
        exact: false,
        warning: 'Database notification_category_enum "Compliance" maps to frontend "security".',
      };
    default:
      return unknownResult("notification_category_enum", raw, "platform");
  }
}

// ── 13. Payment Reference Status & Deposit Channel ──

export function normalizePaymentStatus(
  value: unknown,
): EnumNormalizationResult<TransactionStatus, DbPaymentReferenceStatus> {
  const raw = normalizeRaw(value).toLowerCase();
  switch (raw) {
    case "initialized":
    case "pending":
      return {
        value: "Pending",
        raw,
        dbValue: raw,
        known: true,
        exact: raw === "pending",
        warning:
          raw === "initialized"
            ? 'Database payment_references.status "initialized" maps to frontend "Pending".'
            : null,
      };
    case "succeeded":
      return {
        value: "Completed",
        raw,
        dbValue: "succeeded",
        known: true,
        exact: false,
        warning: 'Database payment_references.status "succeeded" maps to frontend "Completed".',
      };
    case "failed":
    case "abandoned":
    case "reversed":
      return {
        value: "Declined",
        raw,
        dbValue: raw,
        known: true,
        exact: false,
        warning: `Database payment_references.status "${raw}" maps to frontend "Declined".`,
      };
    default:
      return unknownResult("payment_references.status", raw, "Pending");
  }
}

export function normalizeDepositChannel(
  value: unknown,
): EnumNormalizationResult<string, DbDepositChannel> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "paystack_checkout_card":
      return {
        value: "Paystack Card Checkout",
        raw,
        dbValue: "paystack_checkout_card",
        known: true,
        exact: true,
        warning: null,
      };
    case "paystack_checkout_bank_transfer":
      return {
        value: "Paystack Bank Transfer",
        raw,
        dbValue: "paystack_checkout_bank_transfer",
        known: true,
        exact: true,
        warning: null,
      };
    default:
      return unknownResult("deposit_channel_enum", raw, "Unknown Channel");
  }
}

// ── 14. Bank Verification Status, Referral Status & Wallet Status ──

export function normalizeBankVerificationStatus(
  value: unknown,
): EnumNormalizationResult<BankVerificationStatus, DbBankVerificationStatus> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "pending_approval":
      return {
        value: "Pending Verification",
        raw,
        dbValue: "pending_approval",
        known: true,
        exact: true,
        warning: null,
      };
    case "verified":
      return {
        value: "Simulated Verified",
        raw,
        dbValue: "verified",
        known: true,
        exact: false,
        warning:
          'Database wallet_accounts.verification_status "verified" maps to Frontend v1.0 "Simulated Verified" until a live-verified label is introduced in a future UI phase.',
      };
    case "rejected":
    case "revoked":
      return {
        value: "Unverified",
        raw,
        dbValue: raw,
        known: true,
        exact: false,
        warning: `Database wallet_accounts.verification_status "${raw}" maps conservatively to "Unverified".`,
      };
    default:
      return unknownResult("wallet_accounts.verification_status", raw, "Unverified");
  }
}

export function normalizeReferralStatus(
  value: unknown,
): EnumNormalizationResult<ReferralStatus, DbReferralStatus> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "pending":
      return { value: "Pending", raw, dbValue: "pending", known: true, exact: true, warning: null };
    case "qualified":
      return {
        value: "Active",
        raw,
        dbValue: "qualified",
        known: true,
        exact: false,
        warning: 'Database referrals.status "qualified" maps to frontend ReferralStatus "Active".',
      };
    case "paid":
      return { value: "Paid", raw, dbValue: "paid", known: true, exact: true, warning: null };
    case "disqualified":
      return {
        value: "Pending",
        raw,
        dbValue: "disqualified",
        known: true,
        exact: false,
        warning:
          'Database referrals.status "disqualified" has no frontend equivalent; preserved in dbMeta and never mapped to "Paid".',
      };
    default:
      return unknownResult("referrals.status", raw, "Pending");
  }
}

export function normalizeWalletStatus(
  value: unknown,
): EnumNormalizationResult<DbWalletStatus, DbWalletStatus> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "active":
    case "frozen":
    case "closed":
      return { value: raw, raw, dbValue: raw, known: true, exact: true, warning: null };
    default:
      return unknownResult("wallet_status_enum", raw, "frozen");
  }
}

export function normalizeInstrumentTypeToCategory(
  value: unknown,
): EnumNormalizationResult<string, DbInstrumentType> {
  const raw = normalizeRaw(value);
  switch (raw) {
    case "fgn_treasury_bill":
      return {
        value: "FGN Treasury Bills",
        raw,
        dbValue: "fgn_treasury_bill",
        known: true,
        exact: true,
        warning: null,
      };
    case "fgn_bond":
      return {
        value: "FGN Sovereign Bonds",
        raw,
        dbValue: "fgn_bond",
        known: true,
        exact: true,
        warning: null,
      };
    case "corporate_commercial_paper":
      return {
        value: "Commercial Paper",
        raw,
        dbValue: "corporate_commercial_paper",
        known: true,
        exact: true,
        warning: null,
      };
    case "private_credit":
      return {
        value: "Private Credit",
        raw,
        dbValue: "private_credit",
        known: true,
        exact: true,
        warning: null,
      };
    case "money_market_fund":
      return {
        value: "Money Market",
        raw,
        dbValue: "money_market_fund",
        known: true,
        exact: true,
        warning: null,
      };
    default:
      return unknownResult("investment_plans.instrument_type", raw, "Fixed Income");
  }
}

/**
 * Exhaustive documentation registry of every enum/status discrepancy between
 * frozen PostgreSQL migrations 0001–0014 and Frozen Frontend v1.0 types.
 */
export const ENUM_MISMATCH_REGISTRY: readonly EnumMismatchSpec[] = [
  {
    domain: "Account Status",
    dbEnumName: "public.account_statuses.code",
    migrationRef: "20261123000200_user_management_and_rbac.sql",
    dbValues: ["active", "pending_verification", "frozen", "suspended", "closed"],
    frontendValues: ["Active", "Pending KYC", "Suspended"],
    mismatches: [
      "pending_verification maps to Pending KYC (frontend has no separate email-verification status)",
      "frozen and closed collapse conservatively into Suspended (raw dbStatusCode preserved)",
    ],
  },
  {
    domain: "User Roles",
    dbEnumName: "public.app_role_enum",
    migrationRef: "20261123000100_extensions_and_enums.sql",
    dbValues: ["super_admin", "admin", "finance_officer", "compliance_officer", "investor"],
    frontendValues: ["investor", "admin"],
    mismatches: [
      "4 distinct staff roles (super_admin, admin, finance_officer, compliance_officer) collapse to frontend portal role 'admin'",
      "Frontend cannot enforce fine-grained staff separation; DB RLS and RPCs remain authoritative",
    ],
  },
  {
    domain: "User Tiers",
    dbEnumName: "public.client_tier_enum",
    migrationRef: "20261123000100_extensions_and_enums.sql",
    dbValues: ["Standard", "Silver", "Gold", "Platinum", "Private"],
    frontendValues: ["Silver", "Platinum", "Sovereign"],
    mismatches: [
      "DB 'Standard' maps to 'Silver'; DB 'Gold' maps to 'Platinum'; DB 'Private' maps to 'Sovereign'",
    ],
  },
  {
    domain: "Transaction Types",
    dbEnumName: "public.transaction_type_enum",
    migrationRef: "20261123000100_extensions_and_enums.sql",
    dbValues: [
      "deposit",
      "withdrawal",
      "investment_subscription",
      "investment_maturity",
      "investment_payout",
      "referral_commission",
      "fee",
      "tax_withholding",
      "adjustment",
      "reversal",
    ],
    frontendValues: [
      "Deposit",
      "Withdrawal",
      "Investment",
      "Realized Return",
      "Referral Commission",
    ],
    mismatches: [
      "fee, tax_withholding, adjustment, and reversal have NO Frontend v1.0 TransactionType equivalent (mapped to null with raw dbTransactionType preserved)",
      "investment_maturity and investment_payout both map to Realized Return in frontend summary views",
    ],
  },
  {
    domain: "Transaction Statuses",
    dbEnumName: "public.transaction_status_enum",
    migrationRef: "20261123000100_extensions_and_enums.sql",
    dbValues: [
      "initiated",
      "pending",
      "pending_approval",
      "approved",
      "processing",
      "completed",
      "failed",
      "declined",
      "reversed",
    ],
    frontendValues: ["Completed", "Pending", "Declined"],
    mismatches: [
      "initiated, pending_approval, approved, and processing collapse into Pending",
      "failed and reversed collapse into Declined (raw dbTransactionStatus preserved)",
    ],
  },
  {
    domain: "Investment Statuses",
    dbEnumName: "public.investment_status_enum",
    migrationRef: "20261123000100_extensions_and_enums.sql",
    dbValues: ["active", "matured", "rolled_over", "cancelled"],
    frontendValues: ["Active", "Matured", "Cancelled"],
    mismatches: ["rolled_over maps to Matured with child/rollover linkage preserved"],
  },
  {
    domain: "Investment Plan Statuses",
    dbEnumName: "public.plan_status_enum",
    migrationRef: "20261123000100_extensions_and_enums.sql",
    dbValues: ["draft", "active", "paused", "archived"],
    frontendValues: ["Active", "Paused", "Archived"],
    mismatches: ["draft has no frontend equivalent; maps conservatively to Paused"],
  },
  {
    domain: "Investment Plan Risk Bands",
    dbEnumName: "public.investment_plans.risk_band CHECK",
    migrationRef: "20261123000800_investments_and_referrals.sql",
    dbValues: ["Conservative", "Moderate", "Balanced", "Institutional"],
    frontendValues: ["Low", "Moderate", "Elevated"],
    mismatches: [
      "Conservative -> Low; Balanced -> Moderate; Institutional -> Elevated",
    ],
  },
  {
    domain: "Rollover Settings",
    dbEnumName: "public.rollover_mode_enum",
    migrationRef: "20261123000100_extensions_and_enums.sql",
    dbValues: ["none", "principal_only", "principal_plus_net_return"],
    frontendValues: ["autoCompound: false", "autoCompound: true"],
    mismatches: [
      "DB has 3-state ADR-005 enum defaulting to 'principal_only'; frontend uses 2-state boolean autoCompound",
      "Only 'principal_plus_net_return' maps to autoCompound=true; 'principal_only' maps to false with raw rolloverMode preserved",
    ],
  },
  {
    domain: "KYC Tiers",
    dbEnumName: "public.kyc_tier_enum",
    migrationRef: "20261123000100_extensions_and_enums.sql",
    dbValues: ["Tier 0", "Tier 1", "Tier 2", "Tier 3"],
    frontendValues: ["Tier 1", "Tier 2", "Tier 3"],
    mismatches: ["Tier 0 maps conservatively to Tier 1 with raw dbKycTier preserved"],
  },
  {
    domain: "KYC Statuses",
    dbEnumName: "public.kyc_status_enum",
    migrationRef: "20261123000100_extensions_and_enums.sql",
    dbValues: ["not_started", "draft", "submitted", "under_review", "approved", "rejected", "expired"],
    frontendValues: ["Under Review", "Approved", "Needs Resubmission"],
    mismatches: [
      "submitted collapses into Under Review",
      "not_started, draft, rejected, and expired collapse into Needs Resubmission",
    ],
  },
  {
    domain: "Notification Categories",
    dbEnumName: "public.notification_category_enum",
    migrationRef: "20261123000100_extensions_and_enums.sql",
    dbValues: ["Account", "Wallet", "Investment", "Compliance", "Security", "System"],
    frontendValues: ["deposit", "withdrawal", "investment", "referral", "security", "platform"],
    mismatches: [
      "DB has single 'Wallet' category instead of separate 'deposit'/'withdrawal'",
      "DB has no 'Referral' category; DB 'Account'/'System' map to 'platform'; DB 'Compliance' maps to 'security'",
    ],
  },
  {
    domain: "Payment & Bank Verification Statuses",
    dbEnumName: "public.payment_references.status & public.wallet_accounts.verification_status",
    migrationRef: "20261123000500_wallets_and_balances.sql / 20261123000900_kyc_notifications_and_payments.sql",
    dbValues: [
      "payment_references: initialized|pending|succeeded|failed|abandoned|reversed",
      "wallet_accounts: pending_approval|verified|rejected|revoked",
    ],
    frontendValues: [
      "TransactionStatus: Completed|Pending|Declined",
      "BankVerificationStatus: Unverified|Pending Verification|Simulated Verified",
    ],
    mismatches: [
      "Frontend BankVerificationStatus only has 'Simulated Verified' (no production 'Verified' union member yet)",
      "payment_references.status is unconstrained TEXT defaulting to 'initialized'",
    ],
  },
  {
    domain: "Referral Statuses",
    dbEnumName: "public.referrals.status CHECK",
    migrationRef: "20261123000800_investments_and_referrals.sql",
    dbValues: ["pending", "qualified", "paid", "disqualified"],
    frontendValues: ["Active", "Pending", "Paid"],
    mismatches: [
      "qualified maps to Active; disqualified has no frontend equivalent and maps conservatively to Pending with raw dbStatus preserved",
    ],
  },
] as const;

export type DefaultPayoutFrequency = InvestmentPlan["payoutFrequency"];

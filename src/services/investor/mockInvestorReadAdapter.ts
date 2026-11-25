import {
  mockDataProvider,
  type MockDataProviderContract,
  type MockDataSnapshot,
} from "@/services/mockDataProvider";
import type {
  DbDepositRow,
  DbInvestmentPlanRow,
  DbInvestmentRow,
  DbKycDocumentRow,
  DbKycRecordRow,
  DbNotificationRow,
  DbProfileRow,
  DbReferralRow,
  DbTransactionRow,
  DbWalletAccountRow,
  DbWalletBalanceRow,
  DbWalletRow,
  DbWithdrawalRow,
} from "@/services/supabase/dbTypes";
import { nairaToKobo, sumKobo } from "@/services/supabase/financial";
import {
  mapBankAccountRow,
  mapDepositRow,
  mapInvestmentPlanRow,
  mapInvestmentRow,
  mapKycRecordRow,
  mapNotificationRow,
  mapProfileRow,
  mapReferralRow,
  mapTransactionRow,
  mapWalletSummaryRows,
  mapWithdrawalRow,
  type MappedBankAccount,
  type MappedDeposit,
  type MappedInvestment,
  type MappedInvestmentMaturity,
  type MappedInvestmentPayout,
  type MappedInvestmentPlan,
  type MappedKycRecord,
  type MappedNotification,
  type MappedNotificationPreferences,
  type MappedPlatformSettings,
  type MappedProfile,
  type MappedReferral,
  type MappedReferralSettings,
  type MappedTransaction,
  type MappedWalletSummary,
  type MappedWithdrawal,
} from "@/services/supabase/mappers/index";
import type {
  InvestmentHistoryFilter,
  NotificationQueryFilter,
  ReadQueryErrorCode,
  ReadQueryPagination,
  ReadQueryResult,
  SupabaseReadOnlyQueryContract,
  TransactionHistoryFilter,
} from "@/services/supabase/queries";
import type {
  AccountStatus,
  InvestmentPlan,
  InvestmentRecord,
  KycSubmissionRecord,
  PlanStatus,
  RiskBand,
  TransactionRecord,
  TransactionStatus,
  TransactionType,
  UserNotificationItem,
  UserProfile,
} from "@/types/domain";
import { sanitizeRestoredSession, selectIsolatedAccountView } from "@/utils/mockIntegrity";

/**
 * SILVER SPOON — Mock Implementation of Phase 6.3 21-Method Read-Only Query Contract
 *
 * Adapts the local `mockDataProvider` snapshot into Phase 6.3's canonical `Db*Row`
 * schemas and executes Phase 6.3's authoritative mappers and integer-kobo conversion
 * functions (`nairaToKobo`, `sumKobo`, `mapProfileRow`, `mapWalletSummaryRows`,
 * `mapTransactionRow`, `mapDepositRow`, `mapWithdrawalRow`, `mapInvestmentRow`,
 * `mapInvestmentPlanRow`, `mapNotificationRow`, `mapKycRecordRow`).
 *
 * Security & Isolation Invariants:
 * - Strictly READ-ONLY: ZERO mutations to `mockDataProvider` state or storage.
 * - Identity is resolved EXCLUSIVELY via `sanitizeRestoredSession(state.session, state.users)`.
 * - Tampered storage roles or expired sessions are rejected fail-closed.
 * - Cross-investor IDs passed to `getOwnTransactionById` / `getOwnInvestmentById` return `null`.
 * - Staff-only `settings.getStaffPlatformSettings` rejects investors with `FORBIDDEN`.
 */

function readErr<T>(code: ReadQueryErrorCode, error: string): ReadQueryResult<T> {
  return { ok: false, code, error };
}

function readOk<T>(data: T): ReadQueryResult<T> {
  return { ok: true, data, source: "supabase_readonly" };
}

function paginate<T>(items: readonly T[], pagination?: ReadQueryPagination): readonly T[] {
  const offset = Math.max(0, pagination?.offset ?? 0);
  const limit = pagination?.limit;
  if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
    return items.slice(offset, offset + limit);
  }
  return offset > 0 ? items.slice(offset) : items;
}

function mapFrontendStatusToDbCode(status: AccountStatus): string {
  switch (status) {
    case "Active":
      return "active";
    case "Pending KYC":
      return "pending_verification";
    case "Suspended":
      return "suspended";
  }
}

function mapFrontendTierToDbTier(tier: UserProfile["tier"]): string {
  switch (tier) {
    case "Silver":
      return "Silver";
    case "Platinum":
      return "Platinum";
    case "Sovereign":
      return "Private";
  }
}

function mapFrontendTxnTypeToDb(type: TransactionType): string {
  switch (type) {
    case "Deposit":
      return "deposit";
    case "Withdrawal":
      return "withdrawal";
    case "Investment":
      return "investment_subscription";
    case "Realized Return":
      return "investment_payout";
    case "Referral Commission":
      return "referral_commission";
  }
}

function mapFrontendTxnStatusToDb(status: TransactionStatus): string {
  switch (status) {
    case "Completed":
      return "completed";
    case "Pending":
      return "pending";
    case "Declined":
      return "declined";
  }
}

function mapFrontendPlanStatusToDb(status: PlanStatus): string {
  switch (status) {
    case "Active":
      return "active";
    case "Paused":
      return "paused";
    case "Archived":
      return "archived";
  }
}

function mapFrontendRiskBandToDb(band: RiskBand): string {
  switch (band) {
    case "Low":
      return "Conservative";
    case "Moderate":
      return "Moderate";
    case "Elevated":
      return "Institutional";
  }
}

function mapFrontendCategoryToDbInstrument(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes("treasury")) return "fgn_treasury_bill";
  if (lower.includes("bond")) return "fgn_bond";
  if (lower.includes("commercial")) return "corporate_commercial_paper";
  if (lower.includes("private")) return "private_credit";
  return "money_market_fund";
}

function mapFrontendNotificationCatToDb(cat: UserNotificationItem["category"]): string {
  switch (cat) {
    case "deposit":
    case "withdrawal":
      return "Wallet";
    case "investment":
      return "Investment";
    case "security":
      return "Security";
    case "referral":
    case "platform":
      return "System";
  }
}

function mapFrontendKycStatusToDb(status: KycSubmissionRecord["status"]): string {
  switch (status) {
    case "Approved":
      return "approved";
    case "Under Review":
      return "under_review";
    case "Needs Resubmission":
      return "rejected";
  }
}

function mapChannelToDbDepositChannel(channel: string): string {
  return channel.toLowerCase().includes("card")
    ? "paystack_checkout_card"
    : "paystack_checkout_bank_transfer";
}

function toSafeIso(value: string | undefined, fallback: string): string {
  if (value && Number.isFinite(Date.parse(value))) return value;
  return fallback;
}

function mapMockPlanToMappedPlan(plan: InvestmentPlan): MappedInvestmentPlan {
  const nowIso = "2026-01-01T00:00:00.000Z";
  const minKobo = nairaToKobo(plan.minAmount, { fieldName: "plan.minAmount" });
  const maxKobo =
    plan.maxAmount > 0 ? nairaToKobo(plan.maxAmount, { fieldName: "plan.maxAmount" }) : null;
  const bps = Math.round(plan.targetReturnPercent * 100);
  const row: DbInvestmentPlanRow = {
    id: plan.id,
    plan_code: plan.code,
    slug: plan.id,
    name: plan.name,
    instrument_type: mapFrontendCategoryToDbInstrument(plan.category),
    risk_band: mapFrontendRiskBandToDb(plan.riskBand),
    tenor_days: plan.durationDays,
    min_amount_kobo: minKobo,
    max_amount_kobo: maxKobo,
    illustrative_target_return_bps: bps,
    allows_return_compounding: true,
    status: mapFrontendPlanStatusToDb(plan.status),
    terms_version: "v1.0",
    summary: plan.description,
    created_by: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
  const mapped = mapInvestmentPlanRow(row);
  // Preserve exact frozen v1.0 plan metadata (tagline, payoutFrequency, fee, perks, allocationFocus, riskNote)
  return {
    ...mapped,
    plan: {
      ...mapped.plan,
      category: plan.category,
      tagline: plan.tagline,
      description: plan.description,
      payoutFrequency: plan.payoutFrequency,
      managementFeePercent: plan.managementFeePercent,
      featured: plan.featured,
      allocationFocus: [...plan.allocationFocus],
      perks: [...plan.perks],
      riskNote: plan.riskNote,
    },
  };
}

function mapMockTxnToMappedTxn(
  txn: TransactionRecord,
  user: UserProfile,
): MappedTransaction {
  const amountKobo = nairaToKobo(txn.amount, { fieldName: "transaction.amount" });
  const feeKobo = nairaToKobo(txn.fee, { fieldName: "transaction.fee" });
  const netKobo = Math.max(0, amountKobo - feeKobo);
  const createdAt = toSafeIso(txn.createdAt, new Date().toISOString());
  const row: DbTransactionRow = {
    id: txn.id,
    reference: txn.reference,
    idempotency_key: `mock-idem-${txn.reference}`,
    user_id: user.id,
    wallet_id: `WALLET-${user.id}`,
    transaction_type: mapFrontendTxnTypeToDb(txn.type),
    status: mapFrontendTxnStatusToDb(txn.status),
    amount_kobo: amountKobo,
    fee_kobo: feeKobo,
    tax_kobo: 0,
    net_amount_kobo: netKobo,
    currency: "NGN",
    description: txn.note?.trim() || `${txn.type} via ${txn.channel}`,
    primary_journal_entry_id: null,
    reversal_journal_entry_id: null,
    metadata: { channel: txn.channel },
    created_at: createdAt,
    updated_at: toSafeIso(txn.reviewedAt, createdAt),
  };
  return mapTransactionRow(row, {
    userName: user.fullName,
    userEmail: user.email,
  });
}

function mapMockDepositToMappedDeposit(txn: TransactionRecord, user: UserProfile): MappedDeposit {
  const amountKobo = nairaToKobo(txn.amount, { fieldName: "deposit.amount" });
  const createdAt = toSafeIso(txn.createdAt, new Date().toISOString());
  const settledAt = txn.status === "Completed" ? toSafeIso(txn.reviewedAt, createdAt) : null;
  const row: DbDepositRow = {
    id: `DEP-${txn.id}`,
    transaction_id: txn.id,
    user_id: user.id,
    wallet_id: `WALLET-${user.id}`,
    channel: mapChannelToDbDepositChannel(txn.channel),
    expected_amount_kobo: amountKobo,
    settled_amount_kobo: txn.status === "Completed" ? amountKobo : null,
    paystack_reference: txn.reference,
    status: mapFrontendTxnStatusToDb(txn.status),
    server_verified_at: settledAt,
    server_verification_ref: settledAt ? txn.reference : null,
    settlement_journal_entry_id: null,
    settled_at: settledAt,
    failure_reason: txn.status === "Declined" ? txn.note ?? "Declined" : null,
    created_at: createdAt,
    updated_at: toSafeIso(txn.reviewedAt, createdAt),
  };
  const mapped = mapDepositRow(row);
  return {
    ...mapped,
    channelLabel: txn.channel || mapped.channelLabel,
  };
}

function mapMockWithdrawalToMappedWithdrawal(
  txn: TransactionRecord,
  user: UserProfile,
): MappedWithdrawal {
  const amountKobo = nairaToKobo(txn.amount, { fieldName: "withdrawal.amount" });
  const feeKobo = nairaToKobo(txn.fee, { fieldName: "withdrawal.fee" });
  const totalReservedKobo = sumKobo([amountKobo, feeKobo], {
    fieldName: "withdrawal.total_reserved_kobo",
  });
  const createdAt = toSafeIso(txn.createdAt, new Date().toISOString());
  const settledAt = txn.status === "Completed" ? toSafeIso(txn.reviewedAt, createdAt) : null;
  const row: DbWithdrawalRow = {
    id: `WDR-${txn.id}`,
    transaction_id: txn.id,
    user_id: user.id,
    wallet_id: `WALLET-${user.id}`,
    wallet_account_id: `ACCT-PRIMARY-${user.id}`,
    withdrawal_batch_id: null,
    amount_kobo: amountKobo,
    fee_kobo: feeKobo,
    total_reserved_kobo: totalReservedKobo,
    payout_idempotency_ref: txn.reference,
    status: mapFrontendTxnStatusToDb(txn.status),
    initiated_by: user.id,
    approved_by: txn.reviewedBy ?? null,
    four_eyes_action_id: null,
    reserve_journal_entry_id: `JRN-RES-${txn.id}`,
    settlement_journal_entry_id: txn.status === "Completed" ? `JRN-SET-${txn.id}` : null,
    release_journal_entry_id: txn.status === "Declined" ? `JRN-REL-${txn.id}` : null,
    provider_transfer_ref: settledAt ? txn.reference : null,
    verified_settlement_at: settledAt,
    settled_at: settledAt,
    failure_reason: txn.status === "Declined" ? txn.note ?? "Declined" : null,
    created_at: createdAt,
    updated_at: toSafeIso(txn.reviewedAt, createdAt),
  };
  return mapWithdrawalRow(row);
}

function mapMockInvestmentToMappedInvestment(
  inv: InvestmentRecord,
  user: UserProfile,
): MappedInvestment {
  const startedAt = toSafeIso(inv.startedAt, new Date().toISOString());
  const maturesAt = toSafeIso(inv.maturesAt, startedAt);
  const principalKobo = nairaToKobo(inv.principal, { fieldName: "investment.principal" });
  const projectedKobo = nairaToKobo(inv.projectedReturn, {
    fieldName: "investment.projectedReturn",
  });
  const accruedKobo = nairaToKobo(inv.accruedReturn, { fieldName: "investment.accruedReturn" });

  const dbStatus =
    inv.status === "Active"
      ? "active"
      : inv.status === "Matured"
        ? inv.rolledOverToInvestmentId
          ? "rolled_over"
          : "matured"
        : "cancelled";

  const row: DbInvestmentRow = {
    id: inv.id,
    position_code: inv.id,
    user_id: user.id,
    wallet_id: `WALLET-${user.id}`,
    plan_id: inv.planId,
    subscription_transaction_id: `TXN-SUB-${inv.id}`,
    subscription_journal_entry_id: `JRN-SUB-${inv.id}`,
    principal_kobo: principalKobo,
    illustrative_projected_return_kobo: projectedKobo,
    status: dbStatus,
    rollover_mode: inv.autoCompound ? "principal_plus_net_return" : "none",
    return_compounding_consented_at: inv.autoCompound ? startedAt : null,
    return_compounding_consent_version: inv.autoCompound ? "v1.0" : null,
    parent_investment_id: inv.rolledOverFromInvestmentId ?? null,
    started_at: startedAt,
    matures_at: maturesAt,
    matured_at: inv.settledAt ? toSafeIso(inv.settledAt, maturesAt) : null,
    created_at: startedAt,
    updated_at: inv.settledAt ? toSafeIso(inv.settledAt, startedAt) : startedAt,
  };

  return mapInvestmentRow(row, {
    userName: user.fullName,
    planName: inv.planName,
    targetReturnPercent: inv.targetReturnPercent,
    durationDays: inv.durationDays,
    riskBand: inv.riskBand,
    realizedAccruedReturnKobo: accruedKobo,
    maturityPayoutTxnId: inv.maturityPayoutTxnId,
    rolledOverToInvestmentId: inv.rolledOverToInvestmentId,
    rolloverCycle: inv.rolloverCycle,
    rolloverSkippedReason: inv.rolloverSkippedReason,
  });
}

function mapMockKycToMappedKyc(
  sub: KycSubmissionRecord,
  user: UserProfile,
): MappedKycRecord {
  const submittedAt = toSafeIso(sub.submittedAt, new Date().toISOString());
  const retentionUntil = new Date(
    Date.parse(submittedAt) + 5 * 365 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const docs: DbKycDocumentRow[] = [];
  if (sub.idDocumentName) {
    docs.push({
      id: `DOC-ID-${sub.id}`,
      kyc_record_id: sub.id,
      user_id: user.id,
      document_type: "government_id",
      storage_bucket: "kyc-private",
      storage_path: sub.idDocumentName,
      sha256_checksum: "mock-checksum",
      mime_type: "application/pdf",
      size_bytes: 1024,
      uploaded_at: submittedAt,
      retention_until: retentionUntil,
    });
  }
  if (sub.proofOfAddressName) {
    docs.push({
      id: `DOC-POA-${sub.id}`,
      kyc_record_id: sub.id,
      user_id: user.id,
      document_type: "proof_of_address",
      storage_bucket: "kyc-private",
      storage_path: sub.proofOfAddressName,
      sha256_checksum: "mock-checksum",
      mime_type: "application/pdf",
      size_bytes: 1024,
      uploaded_at: submittedAt,
      retention_until: retentionUntil,
    });
  }

  const row: DbKycRecordRow = {
    id: sub.id,
    user_id: user.id,
    target_tier: sub.targetTier,
    status: mapFrontendKycStatusToDb(sub.status),
    vendor_code: "mock_local",
    vendor_reference: null,
    bvn_hash: null,
    bvn_last4: sub.bvnLast4 ? sub.bvnLast4.slice(-4) : null,
    nin_hash: null,
    nin_last4: sub.idNumberLast4 ? sub.idNumberLast4.slice(-4) : null,
    liveness_status: sub.status === "Approved" ? "passed" : "pending",
    pep_sanctions_status: "clear",
    submitted_at: submittedAt,
    verified_at: sub.status === "Approved" ? toSafeIso(sub.reviewedAt, submittedAt) : null,
    retention_until: retentionUntil,
    metadata: {
      date_of_birth: sub.dateOfBirth,
      residential_address: sub.residentialAddress,
    },
    created_at: submittedAt,
    updated_at: toSafeIso(sub.reviewedAt, submittedAt),
  };

  return mapKycRecordRow(row, { documents: docs });
}

export interface MockReadOnlyQueryOptions {
  readonly dataProvider?: MockDataProviderContract;
  readonly now?: () => number;
}

/**
 * Creates a strictly READ-ONLY implementation of Phase 6.3's 21-method
 * `SupabaseReadOnlyQueryContract` backed by `mockDataProvider`.
 */
export function createMockReadOnlyQueryClient(
  options: MockReadOnlyQueryOptions = {},
): SupabaseReadOnlyQueryContract {
  const provider = options.dataProvider ?? mockDataProvider;
  const now = options.now ?? (() => Date.now());

  const resolveAuthenticatedUser = (): {
    state: MockDataSnapshot;
    user: UserProfile | null;
    errorCode: ReadQueryErrorCode | null;
    errorMessage: string | null;
  } => {
    const state = provider.getState();
    const sanitized = sanitizeRestoredSession(state.session, state.users, now());
    if (!sanitized.authenticated || !sanitized.userId) {
      return {
        state,
        user: null,
        errorCode: "UNAUTHENTICATED",
        errorMessage: "An active authenticated session is required to query account data.",
      };
    }
    const matched = state.users.find((u) => u.id === sanitized.userId) ?? null;
    if (!matched || matched.status === "Suspended") {
      return {
        state,
        user: null,
        errorCode: "UNAUTHENTICATED",
        errorMessage: "Authenticated account is unavailable or restricted.",
      };
    }
    return { state, user: matched, errorCode: null, errorMessage: null };
  };

  return {
    mode: "readonly_authorized",

    profile: {
      async getOwnProfile(): Promise<ReadQueryResult<MappedProfile | null>> {
        const { user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        try {
          const joinedAt = toSafeIso(user.joinedAt, new Date(now()).toISOString());
          const updatedAt = toSafeIso(user.lastLoginAt, joinedAt);
          const row: DbProfileRow = {
            id: user.id,
            client_code: user.id,
            email: user.email,
            full_name: user.fullName,
            phone: user.phone || null,
            city: user.city || null,
            address: user.address || null,
            status_code: mapFrontendStatusToDbCode(user.status),
            tier: mapFrontendTierToDbTier(user.tier),
            investor_classification: "retail_individual",
            kyc_tier: user.kycLevel,
            referral_code: user.referralCode,
            email_verified_at: user.emailVerified ? joinedAt : null,
            closed_at: null,
            created_at: joinedAt,
            updated_at: updatedAt,
          };
          const primaryBank: DbWalletAccountRow | null =
            user.bankAccount.accountNumber && /^[0-9]{10}$/.test(user.bankAccount.accountNumber)
              ? {
                  id: `ACCT-${user.id}`,
                  wallet_id: `WALLET-${user.id}`,
                  user_id: user.id,
                  bank_code: user.bankAccount.bankCode || "058",
                  bank_name: user.bankAccount.bankName || "Guaranty Trust Bank (GTBank)",
                  account_number: user.bankAccount.accountNumber,
                  account_name: user.bankAccount.accountName || user.fullName.toUpperCase(),
                  account_purpose: "withdrawal_payout",
                  is_primary: true,
                  verification_status: user.bankAccount.verified ? "verified" : "pending_approval",
                  change_approval_action_id: null,
                  verified_at: user.bankAccount.verified ? updatedAt : null,
                  revoked_at: null,
                  created_at: joinedAt,
                  updated_at: toSafeIso(user.bankAccount.updatedAt, updatedAt),
                }
              : null;

          const mapped = mapProfileRow(row, {
            roles: [user.role],
            primaryBankAccount: primaryBank,
            referredByCode: user.referredBy ?? null,
            lastLoginAt: updatedAt,
            twoFactorEnabled: user.twoFactorEnabled,
          });
          return readOk(mapped);
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map investor profile.",
          );
        }
      },

      async getOwnBankAccounts(): Promise<ReadQueryResult<readonly MappedBankAccount[]>> {
        const { user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        if (!user.bankAccount.accountNumber || !/^[0-9]{10}$/.test(user.bankAccount.accountNumber)) {
          return readOk([]);
        }
        try {
          const joinedAt = toSafeIso(user.joinedAt, new Date(now()).toISOString());
          const updatedAt = toSafeIso(user.bankAccount.updatedAt, joinedAt);
          const row: DbWalletAccountRow = {
            id: `ACCT-${user.id}`,
            wallet_id: `WALLET-${user.id}`,
            user_id: user.id,
            bank_code: user.bankAccount.bankCode || "058",
            bank_name: user.bankAccount.bankName || "Guaranty Trust Bank (GTBank)",
            account_number: user.bankAccount.accountNumber,
            account_name: user.bankAccount.accountName || user.fullName.toUpperCase(),
            account_purpose: "withdrawal_payout",
            is_primary: true,
            verification_status: user.bankAccount.verified ? "verified" : "pending_approval",
            change_approval_action_id: null,
            verified_at: user.bankAccount.verified ? updatedAt : null,
            revoked_at: null,
            created_at: joinedAt,
            updated_at: updatedAt,
          };
          return readOk([mapBankAccountRow(row)]);
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map bank account.",
          );
        }
      },
    },

    wallet: {
      async getOwnWalletSummary(): Promise<ReadQueryResult<MappedWalletSummary | null>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        try {
          const isolated = selectIsolatedAccountView(state, user.id);
          const w = isolated.wallet;
          const nowIso = new Date(now()).toISOString();

          const availableKobo = nairaToKobo(w.availableBalance, {
            fieldName: "wallet.availableBalance",
          });
          const reservedWithdrawalKobo = nairaToKobo(w.pendingWithdrawals, {
            fieldName: "wallet.pendingWithdrawals",
          });
          const investedPrincipalKobo = nairaToKobo(w.activeInvestments, {
            fieldName: "wallet.activeInvestments",
          });
          const pendingDepositKobo = sumKobo(
            isolated.transactions
              .filter((t) => t.type === "Deposit" && t.status === "Pending")
              .map((t) => nairaToKobo(t.amount, { fieldName: "pendingDeposit.amount" })),
            { fieldName: "wallet.pendingDepositKobo" },
          );
          const realizedEarningsKobo = nairaToKobo(w.realizedEarnings, {
            fieldName: "wallet.realizedEarnings",
          });
          const totalLiabilityKobo = sumKobo(
            [availableKobo, reservedWithdrawalKobo, investedPrincipalKobo],
            { fieldName: "wallet.totalCustomerLiabilityKobo" },
          );

          const walletRow: DbWalletRow = {
            id: `WALLET-${user.id}`,
            user_id: user.id,
            currency: "NGN",
            status: user.status === "Suspended" ? "frozen" : "active",
            available_account_id: `SUB-AVAIL-${user.id}`,
            reserved_account_id: `SUB-RES-${user.id}`,
            invested_account_id: `SUB-INV-${user.id}`,
            frozen_reason: null,
            frozen_by: null,
            frozen_at: null,
            created_at: toSafeIso(user.joinedAt, nowIso),
            updated_at: nowIso,
          };

          const balanceRow: DbWalletBalanceRow = {
            wallet_id: walletRow.id,
            user_id: user.id,
            currency: "NGN",
            available_kobo: availableKobo,
            reserved_withdrawal_kobo: reservedWithdrawalKobo,
            invested_principal_kobo: investedPrincipalKobo,
            pending_deposit_kobo: pendingDepositKobo,
            realized_earnings_kobo: realizedEarningsKobo,
            total_customer_liability_kobo: totalLiabilityKobo,
            last_journal_entry_id: null,
            reconciled_at: nowIso,
            updated_at: nowIso,
          };

          const mapped = mapWalletSummaryRows(balanceRow, walletRow, {
            totalDepositsKobo: nairaToKobo(w.totalDeposits, { fieldName: "wallet.totalDeposits" }),
            totalWithdrawalsKobo: nairaToKobo(w.totalWithdrawals, {
              fieldName: "wallet.totalWithdrawals",
            }),
            referralEarningsKobo: nairaToKobo(w.referralEarnings, {
              fieldName: "wallet.referralEarnings",
            }),
            projectedAccrualKobo: nairaToKobo(w.projectedAccrual, {
              fieldName: "wallet.projectedAccrual",
            }),
          });
          return readOk(mapped);
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map wallet summary.",
          );
        }
      },
    },

    transactions: {
      async listOwnTransactions(
        filter?: TransactionHistoryFilter,
      ): Promise<ReadQueryResult<readonly MappedTransaction[]>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        try {
          const isolated = selectIsolatedAccountView(state, user.id);
          let mapped = isolated.transactions.map((t) => mapMockTxnToMappedTxn(t, user));
          if (filter?.status) {
            const target = filter.status.trim().toLowerCase();
            mapped = mapped.filter(
              (m) =>
                m.frontendStatus.toLowerCase() === target ||
                m.dbMeta.rawTransactionStatus.toLowerCase() === target,
            );
          }
          if (filter?.type) {
            const target = filter.type.trim().toLowerCase();
            mapped = mapped.filter(
              (m) =>
                m.frontendType?.toLowerCase() === target ||
                m.dbMeta.rawTransactionType.toLowerCase() === target,
            );
          }
          return readOk(paginate(mapped, filter));
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map transactions.",
          );
        }
      },

      async getOwnTransactionById(
        transactionId: string,
      ): Promise<ReadQueryResult<MappedTransaction | null>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        const isolated = selectIsolatedAccountView(state, user.id);
        const found = isolated.transactions.find((t) => t.id === transactionId);
        if (!found) return readOk(null);
        try {
          return readOk(mapMockTxnToMappedTxn(found, user));
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map transaction.",
          );
        }
      },

      async listOwnDeposits(
        pagination?: ReadQueryPagination,
      ): Promise<ReadQueryResult<readonly MappedDeposit[]>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        try {
          const isolated = selectIsolatedAccountView(state, user.id);
          const deposits = isolated.transactions
            .filter((t) => t.type === "Deposit")
            .map((t) => mapMockDepositToMappedDeposit(t, user));
          return readOk(paginate(deposits, pagination));
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map deposits.",
          );
        }
      },

      async listOwnWithdrawals(
        pagination?: ReadQueryPagination,
      ): Promise<ReadQueryResult<readonly MappedWithdrawal[]>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        try {
          const isolated = selectIsolatedAccountView(state, user.id);
          const withdrawals = isolated.transactions
            .filter((t) => t.type === "Withdrawal")
            .map((t) => mapMockWithdrawalToMappedWithdrawal(t, user));
          return readOk(paginate(withdrawals, pagination));
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map withdrawals.",
          );
        }
      },
    },

    investments: {
      async listOwnInvestments(
        filter?: InvestmentHistoryFilter,
      ): Promise<ReadQueryResult<readonly MappedInvestment[]>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        try {
          const isolated = selectIsolatedAccountView(state, user.id);
          let mapped = isolated.investments.map((i) => mapMockInvestmentToMappedInvestment(i, user));
          if (filter?.status) {
            const target = filter.status.trim().toLowerCase();
            mapped = mapped.filter(
              (m) =>
                m.investment.status.toLowerCase() === target ||
                m.dbMeta.rawStatus.toLowerCase() === target,
            );
          }
          return readOk(paginate(mapped, filter));
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map investments.",
          );
        }
      },

      async getOwnInvestmentById(
        investmentId: string,
      ): Promise<ReadQueryResult<MappedInvestment | null>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        const isolated = selectIsolatedAccountView(state, user.id);
        const found = isolated.investments.find((i) => i.id === investmentId);
        if (!found) return readOk(null);
        try {
          return readOk(mapMockInvestmentToMappedInvestment(found, user));
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map investment.",
          );
        }
      },

      async listOwnPayouts(
        investmentId?: string,
      ): Promise<ReadQueryResult<readonly MappedInvestmentPayout[]>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        const isolated = selectIsolatedAccountView(state, user.id);
        const matching = isolated.investments.filter(
          (i) =>
            i.status === "Matured" &&
            i.maturityPayoutTxnId &&
            (!investmentId || i.id === investmentId),
        );
        const payouts: MappedInvestmentPayout[] = matching.map((inv, idx) => {
          const grossKobo = nairaToKobo(inv.accruedReturn || inv.projectedReturn, {
            fieldName: "payout.gross",
          });
          const settledIso = toSafeIso(inv.settledAt, inv.maturesAt);
          return {
            id: `PAY-${inv.id}`,
            investmentId: inv.id,
            userId: user.id,
            payoutSequence: idx + 1,
            transactionId: inv.maturityPayoutTxnId!,
            grossAmountKobo: grossKobo,
            feeKobo: 0,
            totalTaxKobo: 0,
            netAmountKobo: grossKobo,
            grossAmountNaira: inv.accruedReturn || inv.projectedReturn,
            feeNaira: 0,
            totalTaxNaira: 0,
            netAmountNaira: inv.accruedReturn || inv.projectedReturn,
            treasuryFundingReference: `MOCK-TRS-${inv.id}`,
            fourEyesActionId: `MOCK-4EYES-${inv.id}`,
            journalEntryId: `MOCK-JRN-${inv.id}`,
            distributedAt: settledIso,
          };
        });
        return readOk(payouts);
      },

      async listOwnMaturities(
        investmentId?: string,
      ): Promise<ReadQueryResult<readonly MappedInvestmentMaturity[]>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        const isolated = selectIsolatedAccountView(state, user.id);
        const matured = isolated.investments.filter(
          (i) => i.status === "Matured" && (!investmentId || i.id === investmentId),
        );
        const maturities: MappedInvestmentMaturity[] = matured.map((inv) => {
          const principalKobo = nairaToKobo(inv.principal, { fieldName: "maturity.principal" });
          const netReturnKobo = nairaToKobo(inv.accruedReturn || inv.projectedReturn, {
            fieldName: "maturity.net",
          });
          const mode = inv.autoCompound ? "principal_plus_net_return" : "none";
          return {
            id: `MAT-${inv.id}`,
            investmentId: inv.id,
            userId: user.id,
            maturityTransactionId: inv.maturityPayoutTxnId ?? `TXN-MAT-${inv.id}`,
            maturityJournalEntryId: `JRN-MAT-${inv.id}`,
            principalKobo,
            netReturnKobo,
            principalNaira: inv.principal,
            netReturnNaira: inv.accruedReturn || inv.projectedReturn,
            requestedRolloverMode: mode,
            rawRequestedRolloverMode: mode,
            appliedRolloverMode: inv.rolledOverToInvestmentId ? mode : "none",
            rawAppliedRolloverMode: inv.rolledOverToInvestmentId ? mode : "none",
            maturityDisposition: inv.rolledOverToInvestmentId
              ? "rolled_principal_plus_net_return"
              : "settled_to_available",
            rawMaturityDisposition: inv.rolledOverToInvestmentId
              ? "rolled_principal_plus_net_return"
              : "settled_to_available",
            childInvestmentId: inv.rolledOverToInvestmentId ?? null,
            processedBy: "system",
            processedAt: toSafeIso(inv.settledAt, inv.maturesAt),
            notes: inv.rolloverSkippedReason ?? null,
            warnings: [],
          };
        });
        return readOk(maturities);
      },
    },

    plans: {
      async listPublicActivePlans(): Promise<ReadQueryResult<readonly MappedInvestmentPlan[]>> {
        const state = provider.getState();
        try {
          const activePlans = state.plans
            .filter((p) => p.status === "Active")
            .map(mapMockPlanToMappedPlan);
          return readOk(activePlans);
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map active investment plans.",
          );
        }
      },

      async listAccessiblePlans(): Promise<ReadQueryResult<readonly MappedInvestmentPlan[]>> {
        const { state, user } = resolveAuthenticatedUser();
        try {
          const heldPlanIds = user
            ? new Set(
                selectIsolatedAccountView(state, user.id).investments.map((i) => i.planId),
              )
            : new Set<string>();
          const accessible = state.plans
            .filter((p) => p.status === "Active" || heldPlanIds.has(p.id))
            .map(mapMockPlanToMappedPlan);
          return readOk(accessible);
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map accessible plans.",
          );
        }
      },

      async getPlanById(planId: string): Promise<ReadQueryResult<MappedInvestmentPlan | null>> {
        const state = provider.getState();
        const found = state.plans.find((p) => p.id === planId);
        if (!found) return readOk(null);
        try {
          return readOk(mapMockPlanToMappedPlan(found));
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map investment plan.",
          );
        }
      },
    },

    notifications: {
      async listOwnNotifications(
        filter?: NotificationQueryFilter,
      ): Promise<ReadQueryResult<readonly MappedNotification[]>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        try {
          const isolated = selectIsolatedAccountView(state, user.id);
          let items = isolated.notifications;
          if (filter?.unreadOnly) {
            items = items.filter((n) => !n.read);
          }
          const mapped = items.map((n) => {
            const row: DbNotificationRow = {
              id: n.id,
              user_id: user.id,
              category: mapFrontendNotificationCatToDb(n.category),
              title: n.title,
              body: n.message,
              is_read: n.read,
              read_at: n.read ? toSafeIso(n.createdAt, new Date(now()).toISOString()) : null,
              metadata: { originalCategory: n.category },
              created_at: toSafeIso(n.createdAt, new Date(now()).toISOString()),
            };
            const result = mapNotificationRow(row);
            return {
              ...result,
              notification: {
                ...result.notification,
                category: n.category,
                readByUserIds: [...n.readByUserIds],
              },
            };
          });
          return readOk(paginate(mapped, filter));
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map notifications.",
          );
        }
      },

      async getOwnNotificationPreferences(): Promise<
        ReadQueryResult<MappedNotificationPreferences | null>
      > {
        const { user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        return readOk({
          userId: user.id,
          emailEnabled: user.emailAlerts,
          inAppEnabled: true,
          securityAlertsEnabled: true,
          marketingOptIn: false,
          updatedAt: toSafeIso(user.lastLoginAt, new Date(now()).toISOString()),
        });
      },
    },

    kyc: {
      async listOwnKycRecords(): Promise<ReadQueryResult<readonly MappedKycRecord[]>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        try {
          const isolated = selectIsolatedAccountView(state, user.id);
          return readOk(isolated.kycSubmissions.map((s) => mapMockKycToMappedKyc(s, user)));
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map KYC records.",
          );
        }
      },

      async getLatestOwnKycStatus(): Promise<ReadQueryResult<MappedKycRecord | null>> {
        const listRes = await this.listOwnKycRecords();
        if (!listRes.ok) return listRes;
        return readOk(listRes.data[0] ?? null);
      },
    },

    referrals: {
      async listOwnReferrals(): Promise<ReadQueryResult<readonly MappedReferral[]>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        try {
          const isolated = selectIsolatedAccountView(state, user.id);
          const mapped = isolated.referrals.map((r) => {
            const joinedIso = toSafeIso(r.joinedAt, new Date(now()).toISOString());
            const row: DbReferralRow = {
              id: r.id,
              referrer_user_id: r.referrerId,
              referred_user_id: r.referredUserId,
              referral_code_used: user.referralCode,
              qualifying_investment_id: r.qualifyingInvestmentId ?? null,
              status:
                r.status === "Paid"
                  ? "paid"
                  : r.status === "Active"
                    ? "qualified"
                    : "pending",
              created_at: joinedIso,
              updated_at: toSafeIso(r.qualifiedAt, joinedIso),
            };
            return mapReferralRow(row, {
              referrerName: r.referrerName,
              referredUserName: r.referredUserName,
              referredUserEmail: r.referredUserEmail,
              qualifyingInvestmentPrincipalKobo: nairaToKobo(r.qualifyingInvestment, {
                fieldName: "referral.qualifyingInvestment",
              }),
              commissionRateBps: Math.round(r.commissionRatePercent * 100),
            });
          });
          return readOk(mapped);
        } catch (err) {
          return readErr(
            "MAPPING_ERROR",
            err instanceof Error ? err.message : "Failed to map referrals.",
          );
        }
      },

      async getActiveReferralSettings(): Promise<ReadQueryResult<MappedReferralSettings | null>> {
        const state = provider.getState();
        const nowIso = new Date(now()).toISOString();
        return readOk({
          id: "mock-ref-settings",
          commissionRateBps: Math.round(state.settings.referralCommissionPercent * 100),
          commissionRatePercent: state.settings.referralCommissionPercent,
          minQualifyingInvestmentKobo: nairaToKobo(state.settings.minDepositAmount, {
            fieldName: "settings.minDepositAmount",
          }),
          minQualifyingInvestmentNaira: state.settings.minDepositAmount,
          isActive: true,
          effectiveFrom: nowIso,
          effectiveTo: null,
          approvalActionId: null,
          createdAt: nowIso,
        });
      },
    },

    settings: {
      async getStaffPlatformSettings(): Promise<ReadQueryResult<MappedPlatformSettings>> {
        const { state, user, errorCode, errorMessage } = resolveAuthenticatedUser();
        if (!user) return readErr(errorCode ?? "UNAUTHENTICATED", errorMessage ?? "Sign in required.");
        if (user.role !== "admin") {
          return readErr(
            "FORBIDDEN",
            "Platform settings are restricted to authorized administrative accounts.",
          );
        }
        return readOk({
          entries: [],
          limitsKobo: {
            depositMinKobo: nairaToKobo(state.settings.minDepositAmount, {
              fieldName: "settings.minDepositAmount",
            }),
            withdrawalMinKobo: null,
            dailyWithdrawalTier2Kobo: nairaToKobo(state.settings.maxDailyWithdrawal, {
              fieldName: "settings.maxDailyWithdrawal",
            }),
            dailyWithdrawalTier3Kobo: null,
            standardWithdrawalFeeKobo: 0,
            highValueWithdrawalThresholdKobo: nairaToKobo(state.settings.withdrawalFeeThreshold, {
              fieldName: "settings.withdrawalFeeThreshold",
            }),
            highValueWithdrawalFeeKobo: nairaToKobo(state.settings.highValueWithdrawalFee, {
              fieldName: "settings.highValueWithdrawalFee",
            }),
          },
          governance: {
            fourEyesRequiredAll: true,
            settlementMode: "manual_treasury_review",
            autoDisbursementEnabled: false,
          },
          frontendSettingsPatch: { ...state.settings },
          unknownKeys: [],
          warnings: [],
        });
      },
    },
  };
}

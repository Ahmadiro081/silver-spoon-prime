import type {
  DbReferralCommissionRow,
  DbReferralRow,
  DbReferralSettingsRow,
} from "@/services/supabase/dbTypes";
import { normalizeReferralStatus, type DbReferralStatus } from "@/services/supabase/enums";
import {
  assertValidKobo,
  basisPointsToPercent,
  koboToNaira,
  koboToNairaNullable,
} from "@/services/supabase/financial";
import {
  assertBoolean,
  assertIsoTimestamp,
  assertNonEmptyString,
  assertNonNegativeInteger,
  assertPlainRecord,
  collectWarnings,
  DbMappingError,
  readNullableIsoTimestamp,
  readNullableString,
} from "@/services/supabase/mappers/shared";
import type { ReferralRecord } from "@/types/domain";

/**
 * SILVER SPOON — Referral Program Database Mappers (Phase 6.3)
 *
 * Maps `public.referrals`, `public.referral_commissions`, and `public.referral_settings`
 * (Migration 0008).
 */

export interface MapReferralContext {
  readonly referrerName?: string;
  readonly referredUserName?: string;
  readonly referredUserEmail?: string;
  readonly qualifyingInvestmentPrincipalKobo?: number | bigint | string | null;
  readonly commissionRateBps?: number;
  readonly commission?: DbReferralCommissionRow | unknown | null;
}

export interface MappedReferralSettings {
  readonly id: string;
  readonly commissionRateBps: number;
  readonly commissionRatePercent: number;
  readonly minQualifyingInvestmentKobo: number;
  readonly minQualifyingInvestmentNaira: number;
  readonly isActive: boolean;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly approvalActionId: string | null;
  readonly createdAt: string;
}

export interface MappedReferral {
  readonly referral: ReferralRecord;
  readonly dbMeta: {
    readonly referralCodeUsed: string;
    readonly dbStatus: DbReferralStatus | null;
    readonly rawStatus: string;
    readonly qualifyingInvestmentId: string | null;
    readonly commissionId: string | null;
    readonly commissionKobo: number | null;
    readonly commissionTransactionId: string | null;
    readonly commissionJournalEntryId: string | null;
    readonly fourEyesActionId: string | null;
    readonly paidAt: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly warnings: readonly string[];
}

export function mapReferralSettingsRow(
  rawRow: DbReferralSettingsRow | unknown,
): MappedReferralSettings {
  const row = assertPlainRecord(rawRow, "referral_settings");

  const id = assertNonEmptyString(row, "id", "referral_settings");
  const commissionRateBps = assertNonNegativeInteger(
    row,
    "commission_rate_bps",
    "referral_settings",
  );
  const minQualifyingInvestmentKobo = assertValidKobo(row.min_qualifying_investment_kobo, {
    fieldName: "referral_settings.min_qualifying_investment_kobo",
  });
  if (minQualifyingInvestmentKobo <= 0) {
    throw new DbMappingError(
      "referral_settings",
      "min_qualifying_investment_kobo",
      "referral_settings.min_qualifying_investment_kobo must be strictly positive.",
    );
  }
  const isActive = assertBoolean(row, "is_active", "referral_settings");
  const effectiveFrom = assertIsoTimestamp(row, "effective_from", "referral_settings");
  const effectiveTo = readNullableIsoTimestamp(row, "effective_to", "referral_settings");
  const approvalActionId = readNullableString(row, "approval_action_id", "referral_settings");
  const createdAt = assertIsoTimestamp(row, "created_at", "referral_settings");

  return {
    id,
    commissionRateBps,
    commissionRatePercent: basisPointsToPercent(
      commissionRateBps,
      "referral_settings.commission_rate_bps",
    ),
    minQualifyingInvestmentKobo,
    minQualifyingInvestmentNaira: koboToNaira(minQualifyingInvestmentKobo),
    isActive,
    effectiveFrom,
    effectiveTo,
    approvalActionId,
    createdAt,
  };
}

export function mapReferralRow(
  rawRow: DbReferralRow | unknown,
  context: MapReferralContext = {},
): MappedReferral {
  const row = assertPlainRecord(rawRow, "referrals");

  const id = assertNonEmptyString(row, "id", "referrals");
  const referrerUserId = assertNonEmptyString(row, "referrer_user_id", "referrals");
  const referredUserId = assertNonEmptyString(row, "referred_user_id", "referrals");
  if (referrerUserId === referredUserId) {
    throw new DbMappingError(
      "referrals",
      "referred_user_id",
      "Self-referral row violates chk_referrals_no_self_referral.",
    );
  }
  const referralCodeUsed = assertNonEmptyString(row, "referral_code_used", "referrals");
  const qualifyingInvestmentId = readNullableString(row, "qualifying_investment_id", "referrals");
  const rawStatus = assertNonEmptyString(row, "status", "referrals");
  const createdAt = assertIsoTimestamp(row, "created_at", "referrals");
  const updatedAt = assertIsoTimestamp(row, "updated_at", "referrals");

  const statusNorm = normalizeReferralStatus(rawStatus);

  let commissionId: string | null = null;
  let commissionKobo: number | null = null;
  let commissionTransactionId: string | null = null;
  let commissionJournalEntryId: string | null = null;
  let fourEyesActionId: string | null = null;
  let paidAt: string | null = null;

  if (context.commission !== null && context.commission !== undefined) {
    const comm = assertPlainRecord(context.commission, "referral_commissions");
    commissionId = assertNonEmptyString(comm, "id", "referral_commissions");
    const commReferralId = assertNonEmptyString(comm, "referral_id", "referral_commissions");
    if (commReferralId !== id) {
      throw new DbMappingError(
        "referral_commissions",
        "referral_id",
        `Commission referral_id (${commReferralId}) does not match referrals.id (${id}).`,
      );
    }
    commissionKobo = assertValidKobo(comm.commission_kobo, {
      fieldName: "referral_commissions.commission_kobo",
    });
    if (commissionKobo <= 0) {
      throw new DbMappingError(
        "referral_commissions",
        "commission_kobo",
        "referral_commissions.commission_kobo must be strictly positive.",
      );
    }
    commissionTransactionId = assertNonEmptyString(comm, "transaction_id", "referral_commissions");
    commissionJournalEntryId = assertNonEmptyString(
      comm,
      "journal_entry_id",
      "referral_commissions",
    );
    fourEyesActionId = assertNonEmptyString(comm, "four_eyes_action_id", "referral_commissions");
    paidAt = assertIsoTimestamp(comm, "paid_at", "referral_commissions");
  }

  const qualifyingInvestmentNaira =
    koboToNairaNullable(context.qualifyingInvestmentPrincipalKobo, {
      fieldName: "qualifyingInvestmentPrincipalKobo",
    }) ?? 0;

  const commissionRatePercent =
    context.commissionRateBps !== undefined
      ? basisPointsToPercent(context.commissionRateBps, "commissionRateBps")
      : 0;

  const referral: ReferralRecord = {
    id,
    referrerId: referrerUserId,
    referrerName: context.referrerName ?? "",
    referredUserId,
    referredUserName: context.referredUserName ?? "",
    referredUserEmail: context.referredUserEmail ?? "",
    joinedAt: createdAt,
    qualifyingInvestment: qualifyingInvestmentNaira,
    qualifyingInvestmentId: qualifyingInvestmentId ?? undefined,
    qualifiedAt: statusNorm.dbValue === "qualified" || statusNorm.dbValue === "paid" ? updatedAt : undefined,
    payoutTxnId: commissionTransactionId ?? undefined,
    commissionRatePercent,
    commissionEarned: koboToNairaNullable(commissionKobo) ?? 0,
    status: statusNorm.value,
  };

  return {
    referral,
    dbMeta: {
      referralCodeUsed,
      dbStatus: statusNorm.dbValue,
      rawStatus: statusNorm.raw,
      qualifyingInvestmentId,
      commissionId,
      commissionKobo,
      commissionTransactionId,
      commissionJournalEntryId,
      fourEyesActionId,
      paidAt,
      createdAt,
      updatedAt,
    },
    warnings: collectWarnings(statusNorm.warning),
  };
}

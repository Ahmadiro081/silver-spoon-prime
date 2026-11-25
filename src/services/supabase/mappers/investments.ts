import type {
  DbInvestmentMaturityRow,
  DbInvestmentPayoutRow,
  DbInvestmentPlanRow,
  DbInvestmentRow,
} from "@/services/supabase/dbTypes";
import {
  normalizeInstrumentTypeToCategory,
  normalizeInvestmentStatus,
  normalizePlanRiskBand,
  normalizePlanStatus,
  normalizeRolloverMode,
  type DbInstrumentType,
  type DbInvestmentStatus,
  type DbMaturityDisposition,
  type DbPlanRiskBand,
  type DbPlanStatus,
  type DbRolloverMode,
} from "@/services/supabase/enums";
import {
  assertValidKobo,
  basisPointsToPercent,
  koboToNaira,
  koboToNairaNullable,
  sumKobo,
} from "@/services/supabase/financial";
import {
  assertBoolean,
  assertIsoTimestamp,
  assertNonEmptyString,
  assertNonNegativeInteger,
  assertPlainRecord,
  assertPositiveInteger,
  collectWarnings,
  DbMappingError,
  readNullableIsoTimestamp,
  readNullableString,
} from "@/services/supabase/mappers/shared";
import type { InvestmentPlan, InvestmentRecord, RiskBand } from "@/types/domain";

/**
 * SILVER SPOON — Investment Plans, Positions, Payouts & Maturities Mappers (Phase 6.3)
 *
 * Maps `public.investment_plans`, `public.investments`, `public.investment_payouts`,
 * and `public.investment_maturities` strictly according to Migration 0008.
 */

const VALID_MATURITY_DISPOSITIONS = new Set<DbMaturityDisposition>([
  "settled_to_available",
  "rolled_principal_only",
  "rolled_principal_plus_net_return",
  "settled_to_available_plan_unavailable",
]);

export interface MappedInvestmentPlan {
  readonly plan: InvestmentPlan;
  readonly dbMeta: {
    readonly slug: string;
    readonly dbInstrumentType: DbInstrumentType | null;
    readonly rawInstrumentType: string;
    readonly dbRiskBand: DbPlanRiskBand | null;
    readonly rawRiskBand: string;
    readonly dbStatus: DbPlanStatus | null;
    readonly rawStatus: string;
    readonly minAmountKobo: number;
    readonly maxAmountKobo: number | null;
    readonly illustrativeTargetReturnBps: number;
    readonly allowsReturnCompounding: boolean;
    readonly termsVersion: string;
    readonly createdBy: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly warnings: readonly string[];
}

export interface MapInvestmentContext {
  readonly userName?: string;
  readonly planName?: string;
  readonly targetReturnPercent?: number;
  readonly durationDays?: number;
  readonly riskBand?: RiskBand;
  readonly realizedAccruedReturnKobo?: number | bigint | string;
  readonly maturityPayoutTxnId?: string;
  readonly rolledOverToInvestmentId?: string;
  readonly rolloverCycle?: number;
  readonly rolloverSkippedReason?: string;
}

export interface MappedInvestment {
  readonly investment: InvestmentRecord;
  readonly dbMeta: {
    readonly positionCode: string;
    readonly walletId: string;
    readonly subscriptionTransactionId: string;
    readonly subscriptionJournalEntryId: string;
    readonly principalKobo: number;
    readonly illustrativeProjectedReturnKobo: number;
    readonly dbStatus: DbInvestmentStatus | null;
    readonly rawStatus: string;
    readonly dbRolloverMode: DbRolloverMode | null;
    readonly rawRolloverMode: string;
    readonly returnCompoundingConsentedAt: string | null;
    readonly returnCompoundingConsentVersion: string | null;
    readonly parentInvestmentId: string | null;
    readonly maturedAt: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly warnings: readonly string[];
}

export interface MappedInvestmentPayout {
  readonly id: string;
  readonly investmentId: string;
  readonly userId: string;
  readonly payoutSequence: number;
  readonly transactionId: string;
  readonly grossAmountKobo: number;
  readonly feeKobo: number;
  readonly totalTaxKobo: number;
  readonly netAmountKobo: number;
  readonly grossAmountNaira: number;
  readonly feeNaira: number;
  readonly totalTaxNaira: number;
  readonly netAmountNaira: number;
  readonly treasuryFundingReference: string;
  readonly fourEyesActionId: string;
  readonly journalEntryId: string;
  readonly distributedAt: string;
}

export interface MappedInvestmentMaturity {
  readonly id: string;
  readonly investmentId: string;
  readonly userId: string;
  readonly maturityTransactionId: string;
  readonly maturityJournalEntryId: string;
  readonly principalKobo: number;
  readonly netReturnKobo: number;
  readonly principalNaira: number;
  readonly netReturnNaira: number;
  readonly requestedRolloverMode: DbRolloverMode | null;
  readonly rawRequestedRolloverMode: string;
  readonly appliedRolloverMode: DbRolloverMode | null;
  readonly rawAppliedRolloverMode: string;
  readonly maturityDisposition: DbMaturityDisposition | null;
  readonly rawMaturityDisposition: string;
  readonly childInvestmentId: string | null;
  readonly processedBy: string;
  readonly processedAt: string;
  readonly notes: string | null;
  readonly warnings: readonly string[];
}

export function mapInvestmentPlanRow(
  rawRow: DbInvestmentPlanRow | unknown,
): MappedInvestmentPlan {
  const row = assertPlainRecord(rawRow, "investment_plans");

  const id = assertNonEmptyString(row, "id", "investment_plans");
  const planCode = assertNonEmptyString(row, "plan_code", "investment_plans");
  const slug = assertNonEmptyString(row, "slug", "investment_plans");
  const name = assertNonEmptyString(row, "name", "investment_plans");
  const rawInstrumentType = assertNonEmptyString(row, "instrument_type", "investment_plans");
  const rawRiskBand = assertNonEmptyString(row, "risk_band", "investment_plans");
  const tenorDays = assertPositiveInteger(row, "tenor_days", "investment_plans");
  const minAmountKobo = assertValidKobo(row.min_amount_kobo, {
    fieldName: "investment_plans.min_amount_kobo",
  });
  if (minAmountKobo <= 0) {
    throw new DbMappingError(
      "investment_plans",
      "min_amount_kobo",
      "investment_plans.min_amount_kobo must be strictly positive.",
    );
  }

  const maxAmountKobo =
    row.max_amount_kobo === null || row.max_amount_kobo === undefined
      ? null
      : assertValidKobo(row.max_amount_kobo, {
          fieldName: "investment_plans.max_amount_kobo",
        });

  if (maxAmountKobo !== null && maxAmountKobo < minAmountKobo) {
    throw new DbMappingError(
      "investment_plans",
      "max_amount_kobo",
      "investment_plans.max_amount_kobo cannot be less than min_amount_kobo.",
    );
  }

  const illustrativeTargetReturnBps = assertNonNegativeInteger(
    row,
    "illustrative_target_return_bps",
    "investment_plans",
  );
  const allowsReturnCompounding = assertBoolean(
    row,
    "allows_return_compounding",
    "investment_plans",
  );
  const rawStatus = assertNonEmptyString(row, "status", "investment_plans");
  const termsVersion = assertNonEmptyString(row, "terms_version", "investment_plans");
  const summary = assertNonEmptyString(row, "summary", "investment_plans");
  const createdBy = readNullableString(row, "created_by", "investment_plans");
  const createdAt = assertIsoTimestamp(row, "created_at", "investment_plans");
  const updatedAt = assertIsoTimestamp(row, "updated_at", "investment_plans");

  const instrumentNorm = normalizeInstrumentTypeToCategory(rawInstrumentType);
  const riskBandNorm = normalizePlanRiskBand(rawRiskBand);
  const statusNorm = normalizePlanStatus(rawStatus);

  const minAmountNaira = koboToNaira(minAmountKobo);
  const maxAmountNaira = koboToNairaNullable(maxAmountKobo) ?? 0;

  const plan: InvestmentPlan = {
    id,
    name,
    code: planCode,
    category: instrumentNorm.value,
    tagline: summary,
    description: summary,
    minAmount: minAmountNaira,
    maxAmount: maxAmountNaira,
    durationDays: tenorDays,
    targetReturnPercent: basisPointsToPercent(
      illustrativeTargetReturnBps,
      "investment_plans.illustrative_target_return_bps",
    ),
    riskBand: riskBandNorm.value,
    payoutFrequency: "At Maturity",
    managementFeePercent: 0,
    status: statusNorm.value,
    allocationFocus: [instrumentNorm.value],
    perks: [],
    riskNote: `Illustrative target only (${termsVersion}). Returns are not guaranteed.`,
  };

  return {
    plan,
    dbMeta: {
      slug,
      dbInstrumentType: instrumentNorm.dbValue,
      rawInstrumentType: instrumentNorm.raw,
      dbRiskBand: riskBandNorm.dbValue,
      rawRiskBand: riskBandNorm.raw,
      dbStatus: statusNorm.dbValue,
      rawStatus: statusNorm.raw,
      minAmountKobo,
      maxAmountKobo,
      illustrativeTargetReturnBps,
      allowsReturnCompounding,
      termsVersion,
      createdBy,
      createdAt,
      updatedAt,
    },
    warnings: collectWarnings(
      instrumentNorm.warning,
      riskBandNorm.warning,
      statusNorm.warning,
      maxAmountKobo === null
        ? "investment_plans.max_amount_kobo is NULL (uncapped in DB); frontend maxAmount set to 0 with null preserved in dbMeta.maxAmountKobo."
        : null,
    ),
  };
}

export function mapInvestmentRow(
  rawRow: DbInvestmentRow | unknown,
  context: MapInvestmentContext = {},
): MappedInvestment {
  const row = assertPlainRecord(rawRow, "investments");

  const id = assertNonEmptyString(row, "id", "investments");
  const positionCode = assertNonEmptyString(row, "position_code", "investments");
  const userId = assertNonEmptyString(row, "user_id", "investments");
  const walletId = assertNonEmptyString(row, "wallet_id", "investments");
  const planId = assertNonEmptyString(row, "plan_id", "investments");
  const subscriptionTransactionId = assertNonEmptyString(
    row,
    "subscription_transaction_id",
    "investments",
  );
  const subscriptionJournalEntryId = assertNonEmptyString(
    row,
    "subscription_journal_entry_id",
    "investments",
  );
  const principalKobo = assertValidKobo(row.principal_kobo, {
    fieldName: "investments.principal_kobo",
  });
  if (principalKobo <= 0) {
    throw new DbMappingError(
      "investments",
      "principal_kobo",
      "investments.principal_kobo must be strictly positive.",
    );
  }
  const illustrativeProjectedReturnKobo = assertValidKobo(
    row.illustrative_projected_return_kobo,
    { fieldName: "investments.illustrative_projected_return_kobo" },
  );
  const rawStatus = assertNonEmptyString(row, "status", "investments");
  const rawRolloverMode = assertNonEmptyString(row, "rollover_mode", "investments");
  const returnCompoundingConsentedAt = readNullableIsoTimestamp(
    row,
    "return_compounding_consented_at",
    "investments",
  );
  const returnCompoundingConsentVersion = readNullableString(
    row,
    "return_compounding_consent_version",
    "investments",
  );
  const parentInvestmentId = readNullableString(row, "parent_investment_id", "investments");
  const startedAt = assertIsoTimestamp(row, "started_at", "investments");
  const maturesAt = assertIsoTimestamp(row, "matures_at", "investments");
  const maturedAt = readNullableIsoTimestamp(row, "matured_at", "investments");
  const createdAt = assertIsoTimestamp(row, "created_at", "investments");
  const updatedAt = assertIsoTimestamp(row, "updated_at", "investments");

  const statusNorm = normalizeInvestmentStatus(rawStatus);
  const rolloverNorm = normalizeRolloverMode(rawRolloverMode);

  const computedDays = Math.max(
    1,
    Math.round((Date.parse(maturesAt) - Date.parse(startedAt)) / (24 * 60 * 60 * 1000)),
  );

  const realizedAccruedKobo =
    context.realizedAccruedReturnKobo !== undefined
      ? assertValidKobo(context.realizedAccruedReturnKobo, {
          fieldName: "realizedAccruedReturnKobo",
        })
      : 0;

  const investment: InvestmentRecord = {
    id,
    userId,
    userName: context.userName ?? "",
    planId,
    planName: context.planName ?? "",
    principal: koboToNaira(principalKobo),
    targetReturnPercent: context.targetReturnPercent ?? 0,
    projectedReturn: koboToNaira(illustrativeProjectedReturnKobo),
    accruedReturn: koboToNaira(realizedAccruedKobo),
    durationDays: context.durationDays ?? computedDays,
    riskBand: context.riskBand ?? "Moderate",
    status: statusNorm.value,
    startedAt,
    maturesAt,
    autoCompound: rolloverNorm.value,
    settledAt: maturedAt ?? undefined,
    maturityPayoutTxnId: context.maturityPayoutTxnId,
    rolledOverFromInvestmentId: parentInvestmentId ?? undefined,
    rolledOverToInvestmentId: context.rolledOverToInvestmentId,
    rolloverCycle: context.rolloverCycle,
    rolloverSkippedReason: context.rolloverSkippedReason,
  };

  return {
    investment,
    dbMeta: {
      positionCode,
      walletId,
      subscriptionTransactionId,
      subscriptionJournalEntryId,
      principalKobo,
      illustrativeProjectedReturnKobo,
      dbStatus: statusNorm.dbValue,
      rawStatus: statusNorm.raw,
      dbRolloverMode: rolloverNorm.dbValue,
      rawRolloverMode: rolloverNorm.raw,
      returnCompoundingConsentedAt,
      returnCompoundingConsentVersion,
      parentInvestmentId,
      maturedAt,
      createdAt,
      updatedAt,
    },
    warnings: collectWarnings(statusNorm.warning, rolloverNorm.warning),
  };
}

export function mapInvestmentPayoutRow(
  rawRow: DbInvestmentPayoutRow | unknown,
): MappedInvestmentPayout {
  const row = assertPlainRecord(rawRow, "investment_payouts");

  const id = assertNonEmptyString(row, "id", "investment_payouts");
  const investmentId = assertNonEmptyString(row, "investment_id", "investment_payouts");
  const userId = assertNonEmptyString(row, "user_id", "investment_payouts");
  const payoutSequence = assertPositiveInteger(row, "payout_sequence", "investment_payouts");
  const transactionId = assertNonEmptyString(row, "transaction_id", "investment_payouts");
  const grossAmountKobo = assertValidKobo(row.gross_amount_kobo, {
    fieldName: "investment_payouts.gross_amount_kobo",
  });
  if (grossAmountKobo <= 0) {
    throw new DbMappingError(
      "investment_payouts",
      "gross_amount_kobo",
      "investment_payouts.gross_amount_kobo must be strictly positive.",
    );
  }
  const feeKobo = assertValidKobo(row.fee_kobo, { fieldName: "investment_payouts.fee_kobo" });
  const totalTaxKobo = assertValidKobo(row.total_tax_kobo, {
    fieldName: "investment_payouts.total_tax_kobo",
  });
  const netAmountKobo = assertValidKobo(row.net_amount_kobo, {
    fieldName: "investment_payouts.net_amount_kobo",
  });

  const deductions = sumKobo([feeKobo, totalTaxKobo], {
    fieldName: "investment_payouts.deductions",
  });
  if (grossAmountKobo - deductions !== netAmountKobo) {
    throw new DbMappingError(
      "investment_payouts",
      "net_amount_kobo",
      `Payout arithmetic mismatch: gross (${grossAmountKobo}) - fee (${feeKobo}) - tax (${totalTaxKobo}) !== net (${netAmountKobo}).`,
    );
  }

  const treasuryFundingReference = assertNonEmptyString(
    row,
    "treasury_funding_reference",
    "investment_payouts",
  );
  const fourEyesActionId = assertNonEmptyString(row, "four_eyes_action_id", "investment_payouts");
  const journalEntryId = assertNonEmptyString(row, "journal_entry_id", "investment_payouts");
  const distributedAt = assertIsoTimestamp(row, "distributed_at", "investment_payouts");

  return {
    id,
    investmentId,
    userId,
    payoutSequence,
    transactionId,
    grossAmountKobo,
    feeKobo,
    totalTaxKobo,
    netAmountKobo,
    grossAmountNaira: koboToNaira(grossAmountKobo),
    feeNaira: koboToNaira(feeKobo),
    totalTaxNaira: koboToNaira(totalTaxKobo),
    netAmountNaira: koboToNaira(netAmountKobo),
    treasuryFundingReference,
    fourEyesActionId,
    journalEntryId,
    distributedAt,
  };
}

export function mapInvestmentMaturityRow(
  rawRow: DbInvestmentMaturityRow | unknown,
): MappedInvestmentMaturity {
  const row = assertPlainRecord(rawRow, "investment_maturities");

  const id = assertNonEmptyString(row, "id", "investment_maturities");
  const investmentId = assertNonEmptyString(row, "investment_id", "investment_maturities");
  const userId = assertNonEmptyString(row, "user_id", "investment_maturities");
  const maturityTransactionId = assertNonEmptyString(
    row,
    "maturity_transaction_id",
    "investment_maturities",
  );
  const maturityJournalEntryId = assertNonEmptyString(
    row,
    "maturity_journal_entry_id",
    "investment_maturities",
  );
  const principalKobo = assertValidKobo(row.principal_kobo, {
    fieldName: "investment_maturities.principal_kobo",
  });
  if (principalKobo <= 0) {
    throw new DbMappingError(
      "investment_maturities",
      "principal_kobo",
      "investment_maturities.principal_kobo must be strictly positive.",
    );
  }
  const netReturnKobo = assertValidKobo(row.net_return_kobo, {
    fieldName: "investment_maturities.net_return_kobo",
  });

  const requestedRolloverNorm = normalizeRolloverMode(
    assertNonEmptyString(row, "requested_rollover_mode", "investment_maturities"),
  );
  const appliedRolloverNorm = normalizeRolloverMode(
    assertNonEmptyString(row, "applied_rollover_mode", "investment_maturities"),
  );

  const rawDisposition = assertNonEmptyString(
    row,
    "maturity_disposition",
    "investment_maturities",
  );
  const maturityDisposition = VALID_MATURITY_DISPOSITIONS.has(
    rawDisposition as DbMaturityDisposition,
  )
    ? (rawDisposition as DbMaturityDisposition)
    : null;

  const childInvestmentId = readNullableString(row, "child_investment_id", "investment_maturities");
  const processedBy = assertNonEmptyString(row, "processed_by", "investment_maturities");
  const processedAt = assertIsoTimestamp(row, "processed_at", "investment_maturities");
  const notes = readNullableString(row, "notes", "investment_maturities");

  return {
    id,
    investmentId,
    userId,
    maturityTransactionId,
    maturityJournalEntryId,
    principalKobo,
    netReturnKobo,
    principalNaira: koboToNaira(principalKobo),
    netReturnNaira: koboToNaira(netReturnKobo),
    requestedRolloverMode: requestedRolloverNorm.dbValue,
    rawRequestedRolloverMode: requestedRolloverNorm.raw,
    appliedRolloverMode: appliedRolloverNorm.dbValue,
    rawAppliedRolloverMode: appliedRolloverNorm.raw,
    maturityDisposition,
    rawMaturityDisposition: rawDisposition,
    childInvestmentId,
    processedBy,
    processedAt,
    notes,
    warnings: collectWarnings(
      requestedRolloverNorm.warning,
      appliedRolloverNorm.warning,
      maturityDisposition === null
        ? `Unknown investment_maturities.maturity_disposition "${rawDisposition}".`
        : null,
    ),
  };
}

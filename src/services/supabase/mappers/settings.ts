import type { DbPlatformSettingRow } from "@/services/supabase/dbTypes";
import { assertValidKobo, koboToNaira } from "@/services/supabase/financial";
import {
  assertBoolean,
  assertIsoTimestamp,
  assertNonEmptyString,
  assertPlainRecord,
  assertPositiveInteger,
  DbMappingError,
  readNullableString,
  readOptionalJsonObject,
} from "@/services/supabase/mappers/shared";
import type { PlatformSettings } from "@/types/domain";

/**
 * SILVER SPOON — Platform Settings Key-Value Mapper (Phase 6.3)
 *
 * Maps `public.platform_settings` rows (Migration 0003) into typed treasury &
 * governance settings plus a partial frontend `PlatformSettings` projection.
 * Unknown setting keys are preserved verbatim without silent deletion.
 */

export interface MappedPlatformSettingEntry {
  readonly key: string;
  readonly category: string;
  readonly valueJson: Record<string, unknown>;
  readonly isSensitive: boolean;
  readonly description: string;
  readonly updatedBy: string | null;
  readonly approvalActionId: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MappedPlatformSettings {
  readonly entries: readonly MappedPlatformSettingEntry[];
  readonly limitsKobo: {
    readonly depositMinKobo: number | null;
    readonly withdrawalMinKobo: number | null;
    readonly dailyWithdrawalTier2Kobo: number | null;
    readonly dailyWithdrawalTier3Kobo: number | null;
    readonly standardWithdrawalFeeKobo: number | null;
    readonly highValueWithdrawalThresholdKobo: number | null;
    readonly highValueWithdrawalFeeKobo: number | null;
  };
  readonly governance: {
    readonly fourEyesRequiredAll: boolean | null;
    readonly settlementMode: string | null;
    readonly autoDisbursementEnabled: boolean | null;
  };
  readonly frontendSettingsPatch: Partial<PlatformSettings>;
  readonly unknownKeys: readonly string[];
  readonly warnings: readonly string[];
}

const KNOWN_SETTING_KEYS = new Set<string>([
  "deposit.min_kobo",
  "withdrawal.min_kobo",
  "withdrawal.daily_limit_tier2_kobo",
  "withdrawal.daily_limit_tier3_kobo",
  "withdrawal.fee_schedule",
  "withdrawal.four_eyes_required_all",
  "withdrawal.settlement_mode",
]);

export function mapPlatformSettingRow(
  rawRow: DbPlatformSettingRow | unknown,
): MappedPlatformSettingEntry {
  const row = assertPlainRecord(rawRow, "platform_settings");

  return {
    key: assertNonEmptyString(row, "key", "platform_settings"),
    category: assertNonEmptyString(row, "category", "platform_settings"),
    valueJson: readOptionalJsonObject(row, "value_json", "platform_settings"),
    isSensitive: assertBoolean(row, "is_sensitive", "platform_settings"),
    description: assertNonEmptyString(row, "description", "platform_settings"),
    updatedBy: readNullableString(row, "updated_by", "platform_settings"),
    approvalActionId: readNullableString(row, "approval_action_id", "platform_settings"),
    version: assertPositiveInteger(row, "version", "platform_settings"),
    createdAt: assertIsoTimestamp(row, "created_at", "platform_settings"),
    updatedAt: assertIsoTimestamp(row, "updated_at", "platform_settings"),
  };
}

export function mapPlatformSettingsRows(
  rawRows: ReadonlyArray<DbPlatformSettingRow | unknown>,
): MappedPlatformSettings {
  if (!Array.isArray(rawRows)) {
    throw new DbMappingError("platform_settings", "rows", "Expected an array of platform_settings rows.");
  }

  const entries = rawRows.map((row) => mapPlatformSettingRow(row));
  const byKey = new Map<string, MappedPlatformSettingEntry>();
  const unknownKeys: string[] = [];
  const warnings: string[] = [];

  for (const entry of entries) {
    byKey.set(entry.key, entry);
    if (!KNOWN_SETTING_KEYS.has(entry.key)) {
      unknownKeys.push(entry.key);
      warnings.push(`Preserved unrecognized platform_settings key "${entry.key}" without discarding.`);
    }
  }

  const readAmountKobo = (key: string): number | null => {
    const entry = byKey.get(key);
    if (!entry) return null;
    if (entry.valueJson.amount_kobo === undefined || entry.valueJson.amount_kobo === null) {
      throw new DbMappingError("platform_settings", key, `Setting "${key}" is missing value_json.amount_kobo.`);
    }
    return assertValidKobo(entry.valueJson.amount_kobo, {
      fieldName: `platform_settings.${key}.amount_kobo`,
    });
  };

  const depositMinKobo = readAmountKobo("deposit.min_kobo");
  const withdrawalMinKobo = readAmountKobo("withdrawal.min_kobo");
  const dailyWithdrawalTier2Kobo = readAmountKobo("withdrawal.daily_limit_tier2_kobo");
  const dailyWithdrawalTier3Kobo = readAmountKobo("withdrawal.daily_limit_tier3_kobo");

  let standardWithdrawalFeeKobo: number | null = null;
  let highValueWithdrawalThresholdKobo: number | null = null;
  let highValueWithdrawalFeeKobo: number | null = null;

  const feeSchedule = byKey.get("withdrawal.fee_schedule");
  if (feeSchedule) {
    standardWithdrawalFeeKobo = assertValidKobo(feeSchedule.valueJson.standard_fee_kobo, {
      fieldName: "platform_settings.withdrawal.fee_schedule.standard_fee_kobo",
    });
    highValueWithdrawalThresholdKobo = assertValidKobo(
      feeSchedule.valueJson.high_value_threshold_kobo,
      {
        fieldName: "platform_settings.withdrawal.fee_schedule.high_value_threshold_kobo",
      },
    );
    highValueWithdrawalFeeKobo = assertValidKobo(feeSchedule.valueJson.high_value_fee_kobo, {
      fieldName: "platform_settings.withdrawal.fee_schedule.high_value_fee_kobo",
    });
  }

  let fourEyesRequiredAll: boolean | null = null;
  const fourEyesEntry = byKey.get("withdrawal.four_eyes_required_all");
  if (fourEyesEntry) {
    fourEyesRequiredAll = assertBoolean(
      fourEyesEntry.valueJson,
      "enabled",
      "platform_settings.withdrawal.four_eyes_required_all",
    );
  }

  let settlementMode: string | null = null;
  let autoDisbursementEnabled: boolean | null = null;
  const settlementEntry = byKey.get("withdrawal.settlement_mode");
  if (settlementEntry) {
    settlementMode = assertNonEmptyString(
      settlementEntry.valueJson,
      "mode",
      "platform_settings.withdrawal.settlement_mode",
    );
    autoDisbursementEnabled = assertBoolean(
      settlementEntry.valueJson,
      "auto_disbursement_enabled",
      "platform_settings.withdrawal.settlement_mode",
    );
  }

  const frontendSettingsPatch: Partial<PlatformSettings> = {};
  if (depositMinKobo !== null) {
    frontendSettingsPatch.minDepositAmount = koboToNaira(depositMinKobo);
  }
  if (dailyWithdrawalTier2Kobo !== null) {
    frontendSettingsPatch.maxDailyWithdrawal = koboToNaira(dailyWithdrawalTier2Kobo);
  }
  if (highValueWithdrawalThresholdKobo !== null) {
    frontendSettingsPatch.withdrawalFeeThreshold = koboToNaira(highValueWithdrawalThresholdKobo);
  }
  if (highValueWithdrawalFeeKobo !== null) {
    frontendSettingsPatch.highValueWithdrawalFee = koboToNaira(highValueWithdrawalFeeKobo);
  }

  return {
    entries,
    limitsKobo: {
      depositMinKobo,
      withdrawalMinKobo,
      dailyWithdrawalTier2Kobo,
      dailyWithdrawalTier3Kobo,
      standardWithdrawalFeeKobo,
      highValueWithdrawalThresholdKobo,
      highValueWithdrawalFeeKobo,
    },
    governance: {
      fourEyesRequiredAll,
      settlementMode,
      autoDisbursementEnabled,
    },
    frontendSettingsPatch,
    unknownKeys,
    warnings,
  };
}

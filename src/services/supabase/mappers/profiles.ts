import type {
  DbNotificationPreferenceRow,
  DbProfileRow,
  DbUserRoleRow,
  DbWalletAccountRow,
} from "@/services/supabase/dbTypes";
import {
  normalizeAccountStatus,
  normalizeBankVerificationStatus,
  normalizeClientTier,
  normalizeKycTier,
  resolvePrimaryUserRole,
  type DbAccountStatusCode,
  type DbAppRole,
  type DbBankVerificationStatus,
  type DbClientTier,
  type DbKycTier,
} from "@/services/supabase/enums";
import {
  assertBoolean,
  assertIsoTimestamp,
  assertNonEmptyString,
  assertPlainRecord,
  collectWarnings,
  DbMappingError,
  readNullableIsoTimestamp,
  readNullableString,
} from "@/services/supabase/mappers/shared";
import type { BankAccountDetails, UserProfile } from "@/types/domain";

/**
 * SILVER SPOON — Profile & Bank Account Database Mappers (Phase 6.3)
 *
 * Maps `public.profiles`, `public.user_roles`, `public.wallet_accounts`, and
 * `public.notification_preferences` into typed frontend structures while preserving
 * nullable database columns and granular DB status/role metadata.
 */

export interface MappedBankAccount {
  readonly bankAccount: BankAccountDetails;
  readonly dbMeta: {
    readonly id: string;
    readonly walletId: string;
    readonly userId: string;
    readonly accountPurpose: string;
    readonly isPrimary: boolean;
    readonly dbVerificationStatus: DbBankVerificationStatus | null;
    readonly rawVerificationStatus: string;
    readonly changeApprovalActionId: string | null;
    readonly verifiedAt: string | null;
    readonly revokedAt: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly warnings: readonly string[];
}

export interface MappedProfile {
  readonly profile: UserProfile;
  readonly dbMeta: {
    readonly clientCode: string;
    readonly dbStatusCode: DbAccountStatusCode | null;
    readonly rawStatusCode: string;
    readonly dbRoles: readonly DbAppRole[];
    readonly dbTier: DbClientTier | null;
    readonly rawTier: string;
    readonly investorClassification: string;
    readonly dbKycTier: DbKycTier | null;
    readonly rawKycTier: string;
    readonly phone: string | null;
    readonly city: string | null;
    readonly address: string | null;
    readonly emailVerifiedAt: string | null;
    readonly closedAt: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly warnings: readonly string[];
}

export interface MapProfileContext {
  readonly roles?: ReadonlyArray<DbUserRoleRow | string>;
  readonly primaryBankAccount?: DbWalletAccountRow | null;
  readonly notificationPreferences?: DbNotificationPreferenceRow | null;
  readonly referredByCode?: string | null;
  readonly lastLoginAt?: string | null;
  readonly twoFactorEnabled?: boolean;
}

const EMPTY_BANK_ACCOUNT: BankAccountDetails = {
  bankName: "",
  bankCode: "",
  accountNumber: "",
  accountName: "",
  verified: false,
  verificationStatus: "Unverified",
};

export function mapBankAccountRow(rawRow: DbWalletAccountRow | unknown): MappedBankAccount {
  const row = assertPlainRecord(rawRow, "wallet_accounts");

  const id = assertNonEmptyString(row, "id", "wallet_accounts");
  const walletId = assertNonEmptyString(row, "wallet_id", "wallet_accounts");
  const userId = assertNonEmptyString(row, "user_id", "wallet_accounts");
  const bankCode = assertNonEmptyString(row, "bank_code", "wallet_accounts");
  const bankName = assertNonEmptyString(row, "bank_name", "wallet_accounts");
  const accountNumber = assertNonEmptyString(row, "account_number", "wallet_accounts");
  const accountName = assertNonEmptyString(row, "account_name", "wallet_accounts");
  const accountPurpose = assertNonEmptyString(row, "account_purpose", "wallet_accounts");
  const isPrimary = assertBoolean(row, "is_primary", "wallet_accounts");
  const rawVerificationStatus = assertNonEmptyString(row, "verification_status", "wallet_accounts");
  const changeApprovalActionId = readNullableString(
    row,
    "change_approval_action_id",
    "wallet_accounts",
  );
  const verifiedAt = readNullableIsoTimestamp(row, "verified_at", "wallet_accounts");
  const revokedAt = readNullableIsoTimestamp(row, "revoked_at", "wallet_accounts");
  const createdAt = assertIsoTimestamp(row, "created_at", "wallet_accounts");
  const updatedAt = assertIsoTimestamp(row, "updated_at", "wallet_accounts");

  if (!/^[0-9]{10}$/.test(accountNumber)) {
    throw new DbMappingError(
      "wallet_accounts",
      "account_number",
      `Nigerian NUBAN account_number must be 10 numeric digits (received length ${accountNumber.length}).`,
    );
  }

  const verificationNorm = normalizeBankVerificationStatus(rawVerificationStatus);
  const verified = verificationNorm.dbValue === "verified" && revokedAt === null;

  return {
    bankAccount: {
      bankName,
      bankCode,
      accountNumber,
      accountName,
      verified,
      verificationStatus: revokedAt !== null ? "Unverified" : verificationNorm.value,
      updatedAt,
    },
    dbMeta: {
      id,
      walletId,
      userId,
      accountPurpose,
      isPrimary,
      dbVerificationStatus: verificationNorm.dbValue,
      rawVerificationStatus: verificationNorm.raw,
      changeApprovalActionId,
      verifiedAt,
      revokedAt,
      createdAt,
      updatedAt,
    },
    warnings: collectWarnings(verificationNorm.warning),
  };
}

export function mapProfileRow(
  rawRow: DbProfileRow | unknown,
  context: MapProfileContext = {},
): MappedProfile {
  const row = assertPlainRecord(rawRow, "profiles");

  const id = assertNonEmptyString(row, "id", "profiles");
  const clientCode = assertNonEmptyString(row, "client_code", "profiles");
  const email = assertNonEmptyString(row, "email", "profiles");
  const fullName = assertNonEmptyString(row, "full_name", "profiles");
  const phone = readNullableString(row, "phone", "profiles");
  const city = readNullableString(row, "city", "profiles");
  const address = readNullableString(row, "address", "profiles");
  const rawStatusCode = assertNonEmptyString(row, "status_code", "profiles");
  const rawTier = assertNonEmptyString(row, "tier", "profiles");
  const investorClassification = assertNonEmptyString(row, "investor_classification", "profiles");
  const rawKycTier = assertNonEmptyString(row, "kyc_tier", "profiles");
  const referralCode = assertNonEmptyString(row, "referral_code", "profiles");
  const emailVerifiedAt = readNullableIsoTimestamp(row, "email_verified_at", "profiles");
  const closedAt = readNullableIsoTimestamp(row, "closed_at", "profiles");
  const createdAt = assertIsoTimestamp(row, "created_at", "profiles");
  const updatedAt = assertIsoTimestamp(row, "updated_at", "profiles");

  const statusNorm = normalizeAccountStatus(rawStatusCode);
  const tierNorm = normalizeClientTier(rawTier);
  const kycTierNorm = normalizeKycTier(rawKycTier);

  const activeRoleStrings: string[] = [];
  if (context.roles && context.roles.length > 0) {
    for (const entry of context.roles) {
      if (typeof entry === "string") {
        activeRoleStrings.push(entry);
      } else {
        const roleRow = assertPlainRecord(entry, "user_roles");
        const revokedAt = readNullableIsoTimestamp(roleRow, "revoked_at", "user_roles");
        if (revokedAt === null) {
          activeRoleStrings.push(assertNonEmptyString(roleRow, "role", "user_roles"));
        }
      }
    }
  }
  const roleNorm =
    activeRoleStrings.length > 0
      ? resolvePrimaryUserRole(activeRoleStrings)
      : {
          value: "investor" as const,
          raw: "",
          dbValue: null,
          known: true,
          exact: false,
          warning:
            "user_roles were not provided alongside profile row; defaulted safely to least-privilege investor portal view.",
          dbRoles: [] as readonly DbAppRole[],
        };

  const mappedBank = context.primaryBankAccount
    ? mapBankAccountRow(context.primaryBankAccount)
    : null;

  const emailAlerts = context.notificationPreferences?.email_enabled ?? true;

  const profile: UserProfile = {
    id,
    fullName,
    email,
    emailVerified: emailVerifiedAt !== null,
    phone: phone ?? "",
    city: city ?? "",
    address: address ?? "",
    role: roleNorm.value,
    tier: tierNorm.value,
    status: statusNorm.value,
    kycLevel: kycTierNorm.value,
    referralCode,
    referredBy: context.referredByCode ?? undefined,
    joinedAt: createdAt,
    lastLoginAt: context.lastLoginAt ?? updatedAt,
    twoFactorEnabled: context.twoFactorEnabled ?? false,
    emailAlerts,
    smsAlerts: false,
    bankAccount: mappedBank ? mappedBank.bankAccount : { ...EMPTY_BANK_ACCOUNT },
  };

  return {
    profile,
    dbMeta: {
      clientCode,
      dbStatusCode: statusNorm.dbValue,
      rawStatusCode: statusNorm.raw,
      dbRoles: roleNorm.dbRoles,
      dbTier: tierNorm.dbValue,
      rawTier: tierNorm.raw,
      investorClassification,
      dbKycTier: kycTierNorm.dbValue,
      rawKycTier: kycTierNorm.raw,
      phone,
      city,
      address,
      emailVerifiedAt,
      closedAt,
      createdAt,
      updatedAt,
    },
    warnings: collectWarnings(
      statusNorm.warning,
      tierNorm.warning,
      kycTierNorm.warning,
      roleNorm.warning,
      ...(mappedBank?.warnings ?? []),
    ),
  };
}

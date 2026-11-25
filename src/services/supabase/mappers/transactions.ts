import type {
  DbDepositRow,
  DbPaymentReferenceRow,
  DbTransactionRow,
  DbWithdrawalRow,
} from "@/services/supabase/dbTypes";
import {
  normalizeDepositChannel,
  normalizePaymentStatus,
  normalizeTransactionStatus,
  normalizeTransactionType,
  type DbDepositChannel,
  type DbPaymentReferenceStatus,
  type DbTransactionStatus,
  type DbTransactionType,
} from "@/services/supabase/enums";
import {
  assertValidKobo,
  koboToNaira,
  koboToNairaNullable,
  sumKobo,
} from "@/services/supabase/financial";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
  assertPlainRecord,
  collectWarnings,
  DbMappingError,
  readNullableIsoTimestamp,
  readNullableString,
  readOptionalJsonObject,
} from "@/services/supabase/mappers/shared";
import type { TransactionRecord, TransactionStatus, TransactionType } from "@/types/domain";

/**
 * SILVER SPOON — Transactions, Deposits, Withdrawals & Payment Reference Mappers (Phase 6.3)
 *
 * Preserves ALL authoritative integer kobo columns (`amount_kobo`, `fee_kobo`, `tax_kobo`,
 * `net_amount_kobo`, `expected_amount_kobo`, `settled_amount_kobo`, `total_reserved_kobo`),
 * journal entry links, four-eyes references, and exact database enums without silent data loss.
 */

export interface TransactionUserContext {
  readonly userName?: string;
  readonly userEmail?: string;
}

export interface MappedTransaction {
  /**
   * Present whenever the database `transaction_type_enum` has a Frontend v1.0 projection.
   * For backend-only accounting rows (`fee`, `tax_withholding`, `adjustment`, `reversal`),
   * `transaction` is `null` so financial records are NEVER silently mislabeled or discarded.
   */
  readonly transaction: TransactionRecord | null;
  readonly id: string;
  readonly reference: string;
  readonly idempotencyKey: string;
  readonly userId: string;
  readonly walletId: string;
  readonly currency: "NGN";
  readonly frontendType: TransactionType | null;
  readonly frontendStatus: TransactionStatus;
  readonly amountsKobo: {
    readonly amountKobo: number;
    readonly feeKobo: number;
    readonly taxKobo: number;
    readonly netAmountKobo: number;
  };
  readonly amountsNaira: {
    readonly amount: number;
    readonly fee: number;
    readonly tax: number;
    readonly netAmount: number;
  };
  readonly dbMeta: {
    readonly dbTransactionType: DbTransactionType | null;
    readonly rawTransactionType: string;
    readonly dbTransactionStatus: DbTransactionStatus | null;
    readonly rawTransactionStatus: string;
    readonly description: string;
    readonly primaryJournalEntryId: string | null;
    readonly reversalJournalEntryId: string | null;
    readonly metadata: Record<string, unknown>;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly warnings: readonly string[];
}

export interface MappedDeposit {
  readonly id: string;
  readonly transactionId: string;
  readonly userId: string;
  readonly walletId: string;
  readonly paystackReference: string;
  readonly channelLabel: string;
  readonly dbChannel: DbDepositChannel | null;
  readonly rawChannel: string;
  readonly frontendStatus: TransactionStatus;
  readonly dbStatus: DbTransactionStatus | null;
  readonly rawStatus: string;
  readonly expectedAmountKobo: number;
  readonly expectedAmountNaira: number;
  readonly settledAmountKobo: number | null;
  readonly settledAmountNaira: number | null;
  readonly serverVerifiedAt: string | null;
  readonly serverVerificationRef: string | null;
  readonly settlementJournalEntryId: string | null;
  readonly settledAt: string | null;
  readonly failureReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly warnings: readonly string[];
}

export interface MappedWithdrawal {
  readonly id: string;
  readonly transactionId: string;
  readonly userId: string;
  readonly walletId: string;
  readonly walletAccountId: string;
  readonly withdrawalBatchId: string | null;
  readonly payoutIdempotencyRef: string;
  readonly frontendStatus: TransactionStatus;
  readonly dbStatus: DbTransactionStatus | null;
  readonly rawStatus: string;
  readonly amountKobo: number;
  readonly feeKobo: number;
  readonly totalReservedKobo: number;
  readonly amountNaira: number;
  readonly feeNaira: number;
  readonly totalReservedNaira: number;
  readonly initiatedBy: string;
  readonly approvedBy: string | null;
  readonly fourEyesActionId: string | null;
  readonly reserveJournalEntryId: string;
  readonly settlementJournalEntryId: string | null;
  readonly releaseJournalEntryId: string | null;
  readonly providerTransferRef: string | null;
  readonly verifiedSettlementAt: string | null;
  readonly settledAt: string | null;
  readonly failureReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly warnings: readonly string[];
}

export interface MappedPaymentReference {
  readonly id: string;
  readonly providerId: string;
  readonly transactionId: string;
  readonly providerReference: string;
  readonly channel: string;
  readonly frontendStatus: TransactionStatus;
  readonly dbStatus: DbPaymentReferenceStatus | null;
  readonly rawStatus: string;
  readonly amountKobo: number;
  readonly amountNaira: number;
  readonly rawSummary: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly warnings: readonly string[];
}

export function mapTransactionRow(
  rawRow: DbTransactionRow | unknown,
  context: TransactionUserContext = {},
): MappedTransaction {
  const row = assertPlainRecord(rawRow, "transactions");

  const id = assertNonEmptyString(row, "id", "transactions");
  const reference = assertNonEmptyString(row, "reference", "transactions");
  const idempotencyKey = assertNonEmptyString(row, "idempotency_key", "transactions");
  const userId = assertNonEmptyString(row, "user_id", "transactions");
  const walletId = assertNonEmptyString(row, "wallet_id", "transactions");
  const rawType = assertNonEmptyString(row, "transaction_type", "transactions");
  const rawStatus = assertNonEmptyString(row, "status", "transactions");
  const currency = assertNonEmptyString(row, "currency", "transactions");
  const description = assertNonEmptyString(row, "description", "transactions");
  const primaryJournalEntryId = readNullableString(row, "primary_journal_entry_id", "transactions");
  const reversalJournalEntryId = readNullableString(
    row,
    "reversal_journal_entry_id",
    "transactions",
  );
  const metadata = readOptionalJsonObject(row, "metadata", "transactions");
  const createdAt = assertIsoTimestamp(row, "created_at", "transactions");
  const updatedAt = assertIsoTimestamp(row, "updated_at", "transactions");

  if (currency !== "NGN") {
    throw new DbMappingError(
      "transactions",
      "currency",
      `Unsupported transaction currency "${currency}"; only NGN is permitted.`,
    );
  }

  const amountKobo = assertValidKobo(row.amount_kobo, {
    fieldName: "transactions.amount_kobo",
  });
  if (amountKobo <= 0) {
    throw new DbMappingError(
      "transactions",
      "amount_kobo",
      "transactions.amount_kobo must be strictly greater than zero.",
    );
  }
  const feeKobo = assertValidKobo(row.fee_kobo, { fieldName: "transactions.fee_kobo" });
  const taxKobo = assertValidKobo(row.tax_kobo, { fieldName: "transactions.tax_kobo" });
  const netAmountKobo = assertValidKobo(row.net_amount_kobo, {
    fieldName: "transactions.net_amount_kobo",
  });

  const typeNorm = normalizeTransactionType(rawType);
  const statusNorm = normalizeTransactionStatus(rawStatus);

  const amount = koboToNaira(amountKobo);
  const fee = koboToNaira(feeKobo);
  const tax = koboToNaira(taxKobo);
  const netAmount = koboToNaira(netAmountKobo);

  const channelRaw =
    typeof metadata.channel === "string" && metadata.channel.trim().length > 0
      ? normalizeDepositChannel(metadata.channel).known
        ? normalizeDepositChannel(metadata.channel).value
        : metadata.channel.trim()
      : "Treasury Subledger";

  const transaction: TransactionRecord | null =
    typeNorm.value !== null
      ? {
          id,
          reference,
          userId,
          userName: context.userName ?? "",
          userEmail: context.userEmail ?? "",
          type: typeNorm.value,
          amount,
          fee,
          status: statusNorm.value,
          channel: channelRaw,
          note: description,
          createdAt,
          reviewedAt: statusNorm.value === "Completed" ? updatedAt : undefined,
        }
      : null;

  return {
    transaction,
    id,
    reference,
    idempotencyKey,
    userId,
    walletId,
    currency: "NGN",
    frontendType: typeNorm.value,
    frontendStatus: statusNorm.value,
    amountsKobo: {
      amountKobo,
      feeKobo,
      taxKobo,
      netAmountKobo,
    },
    amountsNaira: {
      amount,
      fee,
      tax,
      netAmount,
    },
    dbMeta: {
      dbTransactionType: typeNorm.dbValue,
      rawTransactionType: typeNorm.raw,
      dbTransactionStatus: statusNorm.dbValue,
      rawTransactionStatus: statusNorm.raw,
      description,
      primaryJournalEntryId,
      reversalJournalEntryId,
      metadata,
      createdAt,
      updatedAt,
    },
    warnings: collectWarnings(typeNorm.warning, statusNorm.warning),
  };
}

export function mapDepositRow(rawRow: DbDepositRow | unknown): MappedDeposit {
  const row = assertPlainRecord(rawRow, "deposits");

  const id = assertNonEmptyString(row, "id", "deposits");
  const transactionId = assertNonEmptyString(row, "transaction_id", "deposits");
  const userId = assertNonEmptyString(row, "user_id", "deposits");
  const walletId = assertNonEmptyString(row, "wallet_id", "deposits");
  const rawChannel = assertNonEmptyString(row, "channel", "deposits");
  const paystackReference = assertNonEmptyString(row, "paystack_reference", "deposits");
  const rawStatus = assertNonEmptyString(row, "status", "deposits");

  const expectedAmountKobo = assertValidKobo(row.expected_amount_kobo, {
    fieldName: "deposits.expected_amount_kobo",
  });
  if (expectedAmountKobo <= 0) {
    throw new DbMappingError(
      "deposits",
      "expected_amount_kobo",
      "deposits.expected_amount_kobo must be strictly positive.",
    );
  }

  const settledAmountKobo =
    row.settled_amount_kobo === null || row.settled_amount_kobo === undefined
      ? null
      : assertValidKobo(row.settled_amount_kobo, {
          fieldName: "deposits.settled_amount_kobo",
        });

  if (settledAmountKobo !== null && settledAmountKobo <= 0) {
    throw new DbMappingError(
      "deposits",
      "settled_amount_kobo",
      "deposits.settled_amount_kobo must be positive when present.",
    );
  }

  const serverVerifiedAt = readNullableIsoTimestamp(row, "server_verified_at", "deposits");
  const serverVerificationRef = readNullableString(row, "server_verification_ref", "deposits");
  const settlementJournalEntryId = readNullableString(
    row,
    "settlement_journal_entry_id",
    "deposits",
  );
  const settledAt = readNullableIsoTimestamp(row, "settled_at", "deposits");
  const failureReason = readNullableString(row, "failure_reason", "deposits");
  const createdAt = assertIsoTimestamp(row, "created_at", "deposits");
  const updatedAt = assertIsoTimestamp(row, "updated_at", "deposits");

  const channelNorm = normalizeDepositChannel(rawChannel);
  const statusNorm = normalizeTransactionStatus(rawStatus);

  return {
    id,
    transactionId,
    userId,
    walletId,
    paystackReference,
    channelLabel: channelNorm.value,
    dbChannel: channelNorm.dbValue,
    rawChannel: channelNorm.raw,
    frontendStatus: statusNorm.value,
    dbStatus: statusNorm.dbValue,
    rawStatus: statusNorm.raw,
    expectedAmountKobo,
    expectedAmountNaira: koboToNaira(expectedAmountKobo),
    settledAmountKobo,
    settledAmountNaira: koboToNairaNullable(settledAmountKobo),
    serverVerifiedAt,
    serverVerificationRef,
    settlementJournalEntryId,
    settledAt,
    failureReason,
    createdAt,
    updatedAt,
    warnings: collectWarnings(channelNorm.warning, statusNorm.warning),
  };
}

export function mapWithdrawalRow(rawRow: DbWithdrawalRow | unknown): MappedWithdrawal {
  const row = assertPlainRecord(rawRow, "withdrawals");

  const id = assertNonEmptyString(row, "id", "withdrawals");
  const transactionId = assertNonEmptyString(row, "transaction_id", "withdrawals");
  const userId = assertNonEmptyString(row, "user_id", "withdrawals");
  const walletId = assertNonEmptyString(row, "wallet_id", "withdrawals");
  const walletAccountId = assertNonEmptyString(row, "wallet_account_id", "withdrawals");
  const withdrawalBatchId = readNullableString(row, "withdrawal_batch_id", "withdrawals");
  const payoutIdempotencyRef = assertNonEmptyString(row, "payout_idempotency_ref", "withdrawals");
  const rawStatus = assertNonEmptyString(row, "status", "withdrawals");
  const initiatedBy = assertNonEmptyString(row, "initiated_by", "withdrawals");
  const approvedBy = readNullableString(row, "approved_by", "withdrawals");
  const fourEyesActionId = readNullableString(row, "four_eyes_action_id", "withdrawals");
  const reserveJournalEntryId = assertNonEmptyString(
    row,
    "reserve_journal_entry_id",
    "withdrawals",
  );
  const settlementJournalEntryId = readNullableString(
    row,
    "settlement_journal_entry_id",
    "withdrawals",
  );
  const releaseJournalEntryId = readNullableString(
    row,
    "release_journal_entry_id",
    "withdrawals",
  );
  const providerTransferRef = readNullableString(row, "provider_transfer_ref", "withdrawals");
  const verifiedSettlementAt = readNullableIsoTimestamp(
    row,
    "verified_settlement_at",
    "withdrawals",
  );
  const settledAt = readNullableIsoTimestamp(row, "settled_at", "withdrawals");
  const failureReason = readNullableString(row, "failure_reason", "withdrawals");
  const createdAt = assertIsoTimestamp(row, "created_at", "withdrawals");
  const updatedAt = assertIsoTimestamp(row, "updated_at", "withdrawals");

  if (settlementJournalEntryId !== null && releaseJournalEntryId !== null) {
    throw new DbMappingError(
      "withdrawals",
      "settlement_journal_entry_id",
      "Withdrawal cannot have both settlement_journal_entry_id and release_journal_entry_id.",
    );
  }

  const amountKobo = assertValidKobo(row.amount_kobo, { fieldName: "withdrawals.amount_kobo" });
  if (amountKobo <= 0) {
    throw new DbMappingError(
      "withdrawals",
      "amount_kobo",
      "withdrawals.amount_kobo must be strictly positive.",
    );
  }
  const feeKobo = assertValidKobo(row.fee_kobo, { fieldName: "withdrawals.fee_kobo" });
  const expectedReserved = sumKobo([amountKobo, feeKobo], {
    fieldName: "withdrawals.total_reserved_kobo",
  });
  const totalReservedKobo =
    row.total_reserved_kobo !== undefined && row.total_reserved_kobo !== null
      ? assertValidKobo(row.total_reserved_kobo, { fieldName: "withdrawals.total_reserved_kobo" })
      : expectedReserved;

  if (totalReservedKobo !== expectedReserved) {
    throw new DbMappingError(
      "withdrawals",
      "total_reserved_kobo",
      `withdrawals.total_reserved_kobo (${totalReservedKobo}) !== amount_kobo + fee_kobo (${expectedReserved}).`,
    );
  }

  const statusNorm = normalizeTransactionStatus(rawStatus);

  return {
    id,
    transactionId,
    userId,
    walletId,
    walletAccountId,
    withdrawalBatchId,
    payoutIdempotencyRef,
    frontendStatus: statusNorm.value,
    dbStatus: statusNorm.dbValue,
    rawStatus: statusNorm.raw,
    amountKobo,
    feeKobo,
    totalReservedKobo,
    amountNaira: koboToNaira(amountKobo),
    feeNaira: koboToNaira(feeKobo),
    totalReservedNaira: koboToNaira(totalReservedKobo),
    initiatedBy,
    approvedBy,
    fourEyesActionId,
    reserveJournalEntryId,
    settlementJournalEntryId,
    releaseJournalEntryId,
    providerTransferRef,
    verifiedSettlementAt,
    settledAt,
    failureReason,
    createdAt,
    updatedAt,
    warnings: collectWarnings(statusNorm.warning),
  };
}

export function mapPaymentReferenceRow(
  rawRow: DbPaymentReferenceRow | unknown,
): MappedPaymentReference {
  const row = assertPlainRecord(rawRow, "payment_references");

  const id = assertNonEmptyString(row, "id", "payment_references");
  const providerId = assertNonEmptyString(row, "provider_id", "payment_references");
  const transactionId = assertNonEmptyString(row, "transaction_id", "payment_references");
  const providerReference = assertNonEmptyString(row, "provider_reference", "payment_references");
  const channel = assertNonEmptyString(row, "channel", "payment_references");
  const rawStatus = assertNonEmptyString(row, "status", "payment_references");
  const amountKobo = assertValidKobo(row.amount_kobo, {
    fieldName: "payment_references.amount_kobo",
  });
  if (amountKobo <= 0) {
    throw new DbMappingError(
      "payment_references",
      "amount_kobo",
      "payment_references.amount_kobo must be strictly positive.",
    );
  }
  const rawSummary = readOptionalJsonObject(row, "raw_summary", "payment_references");
  const createdAt = assertIsoTimestamp(row, "created_at", "payment_references");
  const updatedAt = assertIsoTimestamp(row, "updated_at", "payment_references");

  const statusNorm = normalizePaymentStatus(rawStatus);

  return {
    id,
    providerId,
    transactionId,
    providerReference,
    channel,
    frontendStatus: statusNorm.value,
    dbStatus: statusNorm.dbValue,
    rawStatus: statusNorm.raw,
    amountKobo,
    amountNaira: koboToNaira(amountKobo),
    rawSummary,
    createdAt,
    updatedAt,
    warnings: collectWarnings(statusNorm.warning),
  };
}

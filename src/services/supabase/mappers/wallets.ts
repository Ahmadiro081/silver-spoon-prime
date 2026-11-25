import type { DbWalletBalanceRow, DbWalletRow } from "@/services/supabase/dbTypes";
import { normalizeWalletStatus, type DbWalletStatus } from "@/services/supabase/enums";
import { assertValidKobo, koboToNaira, sumKobo } from "@/services/supabase/financial";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
  assertPlainRecord,
  collectWarnings,
  DbMappingError,
  readNullableIsoTimestamp,
  readNullableString,
} from "@/services/supabase/mappers/shared";
import type { WalletMetrics } from "@/types/domain";

/**
 * SILVER SPOON — Wallet & Balance Database Mappers (Phase 6.3)
 *
 * Maps `public.wallets` and `public.wallet_balances` (integer kobo BIGINT) into
 * authoritative kobo snapshots + Naira display `WalletMetrics`.
 *
 * Enforces ADR-009 mathematical invariant:
 *   total_customer_liability_kobo === available_kobo + reserved_withdrawal_kobo + invested_principal_kobo
 *   (strictly mutually exclusive sub-ledgers; zero double-counting).
 */

export interface WalletSupplementalTotalsKobo {
  readonly totalDepositsKobo?: number | bigint | string;
  readonly totalWithdrawalsKobo?: number | bigint | string;
  readonly referralEarningsKobo?: number | bigint | string;
  readonly projectedAccrualKobo?: number | bigint | string;
}

export interface MappedWalletSummary {
  readonly walletId: string;
  readonly userId: string;
  readonly currency: "NGN";
  readonly dbWalletStatus: DbWalletStatus | null;
  readonly rawWalletStatus: string;
  readonly metrics: WalletMetrics;
  readonly balancesKobo: {
    readonly availableKobo: number;
    readonly reservedWithdrawalKobo: number;
    readonly investedPrincipalKobo: number;
    readonly pendingDepositKobo: number;
    readonly realizedEarningsKobo: number;
    readonly totalCustomerLiabilityKobo: number;
  };
  readonly dbMeta: {
    readonly availableAccountId: string | null;
    readonly reservedAccountId: string | null;
    readonly investedAccountId: string | null;
    readonly frozenReason: string | null;
    readonly frozenBy: string | null;
    readonly frozenAt: string | null;
    readonly lastJournalEntryId: string | null;
    readonly reconciledAt: string;
    readonly updatedAt: string;
  };
  readonly warnings: readonly string[];
}

export function mapWalletSummaryRows(
  rawBalanceRow: DbWalletBalanceRow | unknown,
  rawWalletRow?: DbWalletRow | unknown | null,
  supplemental: WalletSupplementalTotalsKobo = {},
): MappedWalletSummary {
  const bal = assertPlainRecord(rawBalanceRow, "wallet_balances");

  const walletId = assertNonEmptyString(bal, "wallet_id", "wallet_balances");
  const userId = assertNonEmptyString(bal, "user_id", "wallet_balances");
  const currency = assertNonEmptyString(bal, "currency", "wallet_balances");

  if (currency !== "NGN") {
    throw new DbMappingError(
      "wallet_balances",
      "currency",
      `Only NGN currency is supported by SILVER SPOON (received "${currency}").`,
    );
  }

  const availableKobo = assertValidKobo(bal.available_kobo, {
    fieldName: "wallet_balances.available_kobo",
  });
  const reservedWithdrawalKobo = assertValidKobo(bal.reserved_withdrawal_kobo, {
    fieldName: "wallet_balances.reserved_withdrawal_kobo",
  });
  const investedPrincipalKobo = assertValidKobo(bal.invested_principal_kobo, {
    fieldName: "wallet_balances.invested_principal_kobo",
  });
  const pendingDepositKobo = assertValidKobo(bal.pending_deposit_kobo, {
    fieldName: "wallet_balances.pending_deposit_kobo",
  });
  const realizedEarningsKobo = assertValidKobo(bal.realized_earnings_kobo, {
    fieldName: "wallet_balances.realized_earnings_kobo",
  });

  const computedTotalLiabilityKobo = sumKobo(
    [availableKobo, reservedWithdrawalKobo, investedPrincipalKobo],
    { fieldName: "wallet_balances.total_customer_liability_kobo" },
  );

  const totalCustomerLiabilityKobo =
    bal.total_customer_liability_kobo !== undefined && bal.total_customer_liability_kobo !== null
      ? assertValidKobo(bal.total_customer_liability_kobo, {
          fieldName: "wallet_balances.total_customer_liability_kobo",
        })
      : computedTotalLiabilityKobo;

  if (totalCustomerLiabilityKobo !== computedTotalLiabilityKobo) {
    throw new DbMappingError(
      "wallet_balances",
      "total_customer_liability_kobo",
      `ADR-009 liability invariant violated: stored ${totalCustomerLiabilityKobo} kobo !== sum(available + reserved + invested) ${computedTotalLiabilityKobo} kobo.`,
    );
  }

  const lastJournalEntryId = readNullableString(bal, "last_journal_entry_id", "wallet_balances");
  const reconciledAt = assertIsoTimestamp(bal, "reconciled_at", "wallet_balances");
  const updatedAt = assertIsoTimestamp(bal, "updated_at", "wallet_balances");

  let walletStatusRaw = "active";
  let availableAccountId: string | null = null;
  let reservedAccountId: string | null = null;
  let investedAccountId: string | null = null;
  let frozenReason: string | null = null;
  let frozenBy: string | null = null;
  let frozenAt: string | null = null;

  if (rawWalletRow !== null && rawWalletRow !== undefined) {
    const wallet = assertPlainRecord(rawWalletRow, "wallets");
    const rowWalletId = assertNonEmptyString(wallet, "id", "wallets");
    const rowUserId = assertNonEmptyString(wallet, "user_id", "wallets");
    if (rowWalletId !== walletId || rowUserId !== userId) {
      throw new DbMappingError(
        "wallets",
        "id",
        `Wallet row (${rowWalletId} / ${rowUserId}) does not match wallet_balances row (${walletId} / ${userId}).`,
      );
    }
    walletStatusRaw = assertNonEmptyString(wallet, "status", "wallets");
    availableAccountId = assertNonEmptyString(wallet, "available_account_id", "wallets");
    reservedAccountId = assertNonEmptyString(wallet, "reserved_account_id", "wallets");
    investedAccountId = assertNonEmptyString(wallet, "invested_account_id", "wallets");
    if (
      availableAccountId === reservedAccountId ||
      availableAccountId === investedAccountId ||
      reservedAccountId === investedAccountId
    ) {
      throw new DbMappingError(
        "wallets",
        "available_account_id",
        "Wallet sub-ledger account IDs must be mutually distinct (ADR-009).",
      );
    }
    frozenReason = readNullableString(wallet, "frozen_reason", "wallets");
    frozenBy = readNullableString(wallet, "frozen_by", "wallets");
    frozenAt = readNullableIsoTimestamp(wallet, "frozen_at", "wallets");
  }

  const statusNorm = normalizeWalletStatus(walletStatusRaw);

  const totalDepositsKobo =
    supplemental.totalDepositsKobo !== undefined
      ? assertValidKobo(supplemental.totalDepositsKobo, { fieldName: "totalDepositsKobo" })
      : 0;
  const totalWithdrawalsKobo =
    supplemental.totalWithdrawalsKobo !== undefined
      ? assertValidKobo(supplemental.totalWithdrawalsKobo, { fieldName: "totalWithdrawalsKobo" })
      : 0;
  const referralEarningsKobo =
    supplemental.referralEarningsKobo !== undefined
      ? assertValidKobo(supplemental.referralEarningsKobo, { fieldName: "referralEarningsKobo" })
      : 0;
  const projectedAccrualKobo =
    supplemental.projectedAccrualKobo !== undefined
      ? assertValidKobo(supplemental.projectedAccrualKobo, { fieldName: "projectedAccrualKobo" })
      : 0;

  const metrics: WalletMetrics = {
    totalWalletBalance: koboToNaira(totalCustomerLiabilityKobo),
    availableBalance: koboToNaira(availableKobo),
    activeInvestments: koboToNaira(investedPrincipalKobo),
    pendingWithdrawals: koboToNaira(reservedWithdrawalKobo),
    totalDeposits: koboToNaira(totalDepositsKobo),
    totalWithdrawals: koboToNaira(totalWithdrawalsKobo),
    realizedEarnings: koboToNaira(realizedEarningsKobo),
    referralEarnings: koboToNaira(referralEarningsKobo),
    projectedAccrual: koboToNaira(projectedAccrualKobo),
  };

  return {
    walletId,
    userId,
    currency: "NGN",
    dbWalletStatus: statusNorm.dbValue,
    rawWalletStatus: statusNorm.raw,
    metrics,
    balancesKobo: {
      availableKobo,
      reservedWithdrawalKobo,
      investedPrincipalKobo,
      pendingDepositKobo,
      realizedEarningsKobo,
      totalCustomerLiabilityKobo,
    },
    dbMeta: {
      availableAccountId,
      reservedAccountId,
      investedAccountId,
      frozenReason,
      frozenBy,
      frozenAt,
      lastJournalEntryId,
      reconciledAt,
      updatedAt,
    },
    warnings: collectWarnings(statusNorm.warning),
  };
}

import type {
  AccountStatus,
  BankAccountDetails,
  InvestmentPlan,
  InvestmentRecord,
  KycDocumentType,
  KycSubmissionRecord,
  NotificationCategory,
  NotificationItem,
  PlatformSettings,
  ServiceResult,
  TransactionRecord,
  TransactionStatus,
  UserProfile,
} from "@/types/domain";
import { calculateProjectedReturn } from "@/utils/calculations";

/**
 * Service-layer contract prepared for future Supabase integration.
 *
 * Future Production Mapping:
 * - Auth operations        -> Supabase Auth (`supabase.auth.*`)
 * - Read queries           -> PostgreSQL via Supabase client with Row Level Security (RLS)
 * - Financial mutations    -> Supabase Edge Functions (`supabase.functions.invoke(...)`)
 * - KYC / Report exports   -> Supabase Storage
 */

export interface DepositInput {
  amount: number;
  channel: string;
  note?: string;
}

export interface WithdrawalInput {
  amount: number;
  note?: string;
  twoFactorCode?: string;
}

export interface KycSubmissionInput {
  targetTier: "Tier 2" | "Tier 3";
  idType: KycDocumentType;
  idNumber: string;
  bvn: string;
  dateOfBirth: string;
  residentialAddress: string;
  idDocumentName: string;
  proofOfAddressName?: string;
}

export interface SubscribeInvestmentInput {
  planId: string;
  amount: number;
  autoCompound: boolean;
}

export interface CreatePlanInput {
  name: string;
  code: string;
  category: string;
  tagline: string;
  description: string;
  minAmount: number;
  maxAmount: number;
  durationDays: number;
  targetReturnPercent: number;
  riskBand: InvestmentPlan["riskBand"];
  payoutFrequency: InvestmentPlan["payoutFrequency"];
  managementFeePercent: number;
  riskNote: string;
}

let fallbackSequence = 0;

function getRandomHex(byteCount: number): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(byteCount);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }
  fallbackSequence = (fallbackSequence + 1) % 65_536;
  const timePart = Date.now().toString(16).toUpperCase();
  const seqPart = fallbackSequence.toString(16).padStart(4, "0").toUpperCase();
  const randPart = Math.random().toString(16).slice(2).toUpperCase();
  return `${timePart}${seqPart}${randPart}`.slice(0, byteCount * 2).padEnd(byteCount * 2, "0");
}

/**
 * Generates collision-resistant identifiers while preserving existing prefixes
 * (e.g., TXN-..., INV-..., USR-..., AUD-..., NTF-..., REF-...).
 */
export function generateId(prefix: string): string {
  if (typeof globalThis !== "undefined" && typeof globalThis.crypto?.randomUUID === "function") {
    const compact = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
    return `${prefix}-${compact}`;
  }
  return `${prefix}-${getRandomHex(6)}`;
}

export function generateReference(prefix: string): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `SS-${prefix}-${stamp}-${getRandomHex(4)}`;
}

export function generateNumericCode(digits = 6): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint32Array(1);
    globalThis.crypto.getRandomValues(bytes);
    const mod = 10 ** digits;
    const min = 10 ** (digits - 1);
    return String(min + (bytes[0]! % (mod - min)));
  }
  const min = 10 ** (digits - 1);
  return String(Math.floor(min + Math.random() * (9 * min)));
}

export function generateRecoveryToken(): string {
  return `SS-${getRandomHex(4)}`;
}

export function isSameUtcDay(isoTimestamp: string, referenceDate: Date): boolean {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return false;
  return (
    parsed.getUTCFullYear() === referenceDate.getUTCFullYear() &&
    parsed.getUTCMonth() === referenceDate.getUTCMonth() &&
    parsed.getUTCDate() === referenceDate.getUTCDate()
  );
}

/**
 * Calculates a user's cumulative withdrawal amount for the current UTC day,
 * including both Completed and Pending withdrawal requests (excluding Declined).
 */
export function calculateDailyWithdrawalTotal(
  transactions: TransactionRecord[],
  userId: string,
  referenceDate: Date = new Date(),
): number {
  return transactions.reduce((sum, txn) => {
    if (txn.userId !== userId) return sum;
    if (txn.type !== "Withdrawal") return sum;
    if (txn.status !== "Completed" && txn.status !== "Pending") return sum;
    if (!isSameUtcDay(txn.createdAt, referenceDate)) return sum;
    return sum + txn.amount;
  }, 0);
}

export function validateDeposit(
  input: DepositInput,
  settings: PlatformSettings,
  user?: UserProfile,
): ServiceResult {
  if (user?.status === "Suspended") {
    return {
      ok: false,
      error: "This account is suspended and cannot initiate deposits. Contact compliance support.",
    };
  }
  if (!Number.isFinite(input.amount) || input.amount < settings.minDepositAmount) {
    return {
      ok: false,
      error: `Minimum deposit amount is ₦${settings.minDepositAmount.toLocaleString("en-NG")}.`,
    };
  }
  if (!input.channel.trim()) {
    return { ok: false, error: "Please select a funding channel." };
  }
  return { ok: true };
}

export function validateWithdrawal(
  input: WithdrawalInput,
  availableBalance: number,
  user: UserProfile,
  settings: PlatformSettings,
  userTransactions: TransactionRecord[] = [],
  referenceDate: Date = new Date(),
): ServiceResult<{ fee: number }> {
  if (user.status === "Suspended") {
    return {
      ok: false,
      error: "This account is suspended and cannot request withdrawals. Contact compliance support.",
    };
  }
  if (!Number.isFinite(input.amount) || input.amount < 5_000) {
    return { ok: false, error: "Minimum withdrawal amount is ₦5,000." };
  }
  const usedToday = calculateDailyWithdrawalTotal(userTransactions, user.id, referenceDate);
  if (usedToday + input.amount > settings.maxDailyWithdrawal) {
    const remaining = Math.max(0, settings.maxDailyWithdrawal - usedToday);
    return {
      ok: false,
      error:
        usedToday > 0
          ? `Cumulative daily withdrawal limit exceeded. Today's completed and pending withdrawals total ₦${usedToday.toLocaleString("en-NG")}; remaining allowance is ₦${remaining.toLocaleString("en-NG")} (daily limit: ₦${settings.maxDailyWithdrawal.toLocaleString("en-NG")}).`
          : `Withdrawal exceeds daily limit of ₦${settings.maxDailyWithdrawal.toLocaleString("en-NG")}.`,
    };
  }
  if (
    settings.requireKycForWithdrawals &&
    (user.kycLevel === "Tier 1" || user.status === "Pending KYC")
  ) {
    return {
      ok: false,
      error: "Tier 2 or Tier 3 KYC verification is required before withdrawing funds.",
    };
  }
  if (!user.bankAccount.accountNumber || !user.bankAccount.bankName) {
    return { ok: false, error: "Please configure a destination Nigerian bank account first." };
  }
  const fee = input.amount >= settings.withdrawalFeeThreshold ? settings.highValueWithdrawalFee : 0;
  if (input.amount + fee > availableBalance) {
    return { ok: false, error: "Insufficient available Naira balance for this withdrawal." };
  }
  return { ok: true, data: { fee } };
}

export function validateInvestmentSubscription(
  input: SubscribeInvestmentInput,
  plan: InvestmentPlan | undefined,
  availableBalance: number,
  user?: UserProfile,
): ServiceResult<{ projectedReturn: number }> {
  if (user?.status === "Suspended") {
    return {
      ok: false,
      error:
        "This account is suspended and cannot subscribe to investment mandates. Contact compliance support.",
    };
  }
  if (!plan || plan.status !== "Active") {
    return {
      ok: false,
      error: "Selected investment mandate is not currently open for subscription.",
    };
  }
  if (!Number.isFinite(input.amount) || input.amount < plan.minAmount) {
    return {
      ok: false,
      error: `Minimum allocation for ${plan.name} is ₦${plan.minAmount.toLocaleString("en-NG")}.`,
    };
  }
  if (input.amount > plan.maxAmount) {
    return {
      ok: false,
      error: `Maximum allocation for ${plan.name} is ₦${plan.maxAmount.toLocaleString("en-NG")}.`,
    };
  }
  if (input.amount > availableBalance) {
    return {
      ok: false,
      error: "Insufficient available wallet balance. Fund your wallet before allocating.",
    };
  }
  return {
    ok: true,
    data: { projectedReturn: calculateProjectedReturn(input.amount, plan.targetReturnPercent) },
  };
}

export const SETTINGS_LIMITS = {
  minDepositFloor: 1_000,
  minDepositCeiling: 100_000_000,
  minDailyWithdrawal: 5_000,
  maxDailyWithdrawalCeiling: 1_000_000_000,
  maxAutoApproveDeposit: 500_000_000,
  maxReferralCommissionPercent: 25,
  maxWithdrawalFeeThreshold: 1_000_000_000,
  maxHighValueWithdrawalFee: 500_000,
} as const;

export function validatePlatformSettings(settings: PlatformSettings): ServiceResult {
  if (
    !Number.isFinite(settings.minDepositAmount) ||
    settings.minDepositAmount < SETTINGS_LIMITS.minDepositFloor ||
    settings.minDepositAmount > SETTINGS_LIMITS.minDepositCeiling
  ) {
    return {
      ok: false,
      error: `Minimum deposit amount must be between ₦${SETTINGS_LIMITS.minDepositFloor.toLocaleString("en-NG")} and ₦${SETTINGS_LIMITS.minDepositCeiling.toLocaleString("en-NG")}.`,
    };
  }

  if (
    !Number.isFinite(settings.maxDailyWithdrawal) ||
    settings.maxDailyWithdrawal < SETTINGS_LIMITS.minDailyWithdrawal ||
    settings.maxDailyWithdrawal > SETTINGS_LIMITS.maxDailyWithdrawalCeiling
  ) {
    return {
      ok: false,
      error: `Max daily withdrawal limit must be between ₦${SETTINGS_LIMITS.minDailyWithdrawal.toLocaleString("en-NG")} and ₦${SETTINGS_LIMITS.maxDailyWithdrawalCeiling.toLocaleString("en-NG")}.`,
    };
  }

  if (
    !Number.isFinite(settings.autoApproveDepositsUnder) ||
    settings.autoApproveDepositsUnder < 0 ||
    settings.autoApproveDepositsUnder > SETTINGS_LIMITS.maxAutoApproveDeposit
  ) {
    return {
      ok: false,
      error: `Auto-approve deposit threshold must be between ₦0 and ₦${SETTINGS_LIMITS.maxAutoApproveDeposit.toLocaleString("en-NG")}.`,
    };
  }

  if (
    !Number.isFinite(settings.referralCommissionPercent) ||
    settings.referralCommissionPercent < 0 ||
    settings.referralCommissionPercent > SETTINGS_LIMITS.maxReferralCommissionPercent
  ) {
    return {
      ok: false,
      error: `Referral commission rate must be between 0% and ${SETTINGS_LIMITS.maxReferralCommissionPercent}%.`,
    };
  }

  if (
    !Number.isFinite(settings.withdrawalFeeThreshold) ||
    settings.withdrawalFeeThreshold < 0 ||
    settings.withdrawalFeeThreshold > SETTINGS_LIMITS.maxWithdrawalFeeThreshold
  ) {
    return {
      ok: false,
      error: `Withdrawal fee threshold must be between ₦0 and ₦${SETTINGS_LIMITS.maxWithdrawalFeeThreshold.toLocaleString("en-NG")}.`,
    };
  }

  if (
    !Number.isFinite(settings.highValueWithdrawalFee) ||
    settings.highValueWithdrawalFee < 0 ||
    settings.highValueWithdrawalFee > SETTINGS_LIMITS.maxHighValueWithdrawalFee
  ) {
    return {
      ok: false,
      error: `High-value withdrawal fee must be between ₦0 and ₦${SETTINGS_LIMITS.maxHighValueWithdrawalFee.toLocaleString("en-NG")}.`,
    };
  }

  if (
    settings.withdrawalFeeThreshold > 0 &&
    settings.highValueWithdrawalFee >= settings.withdrawalFeeThreshold
  ) {
    return {
      ok: false,
      error: "High-value withdrawal fee must be less than the withdrawal fee threshold.",
    };
  }

  return { ok: true };
}

export function isNotificationVisibleToUser(item: NotificationItem, userId: string): boolean {
  return Boolean(userId) && (item.userId === userId || item.userId === "ALL");
}

export function isNotificationReadByUser(item: NotificationItem, userId: string): boolean {
  return Boolean(userId) && item.readByUserIds.includes(userId);
}

export function markNotificationReadForUser(
  notifications: NotificationItem[],
  notificationId: string,
  userId: string,
): NotificationItem[] {
  if (!userId) return notifications;
  return notifications.map((item) => {
    if (item.id !== notificationId) return item;
    if (!isNotificationVisibleToUser(item, userId)) return item;
    if (item.readByUserIds.includes(userId)) return item;
    return { ...item, readByUserIds: [...item.readByUserIds, userId] };
  });
}

export function markAllNotificationsReadForUser(
  notifications: NotificationItem[],
  userId: string,
): NotificationItem[] {
  if (!userId) return notifications;
  return notifications.map((item) => {
    if (!isNotificationVisibleToUser(item, userId)) return item;
    if (item.readByUserIds.includes(userId)) return item;
    return { ...item, readByUserIds: [...item.readByUserIds, userId] };
  });
}

export function buildInvestmentRecord(
  user: UserProfile,
  plan: InvestmentPlan,
  amount: number,
  autoCompound: boolean,
): InvestmentRecord {
  const now = new Date();
  const matures = new Date(now.getTime() + plan.durationDays * 86_400_000);
  return {
    id: generateId("INV"),
    userId: user.id,
    userName: user.fullName,
    planId: plan.id,
    planName: plan.name,
    principal: amount,
    targetReturnPercent: plan.targetReturnPercent,
    projectedReturn: calculateProjectedReturn(amount, plan.targetReturnPercent),
    accruedReturn: 0,
    durationDays: plan.durationDays,
    riskBand: plan.riskBand,
    status: "Active",
    startedAt: now.toISOString(),
    maturesAt: matures.toISOString(),
    autoCompound,
  };
}

export function buildTransactionRecord(params: {
  user: UserProfile;
  type: TransactionRecord["type"];
  amount: number;
  fee?: number;
  status: TransactionStatus;
  channel: string;
  note?: string;
  reviewedBy?: string;
}): TransactionRecord {
  const prefixMap: Record<TransactionRecord["type"], string> = {
    Deposit: "DEP",
    Withdrawal: "WDR",
    Investment: "INV",
    "Realized Return": "RET",
    "Referral Commission": "REF",
  };
  const now = new Date().toISOString();
  return {
    id: generateId("TXN"),
    reference: generateReference(prefixMap[params.type]),
    userId: params.user.id,
    userName: params.user.fullName,
    userEmail: params.user.email,
    type: params.type,
    amount: params.amount,
    fee: params.fee ?? 0,
    status: params.status,
    channel: params.channel,
    note: params.note,
    createdAt: now,
    reviewedAt: params.status !== "Pending" ? now : undefined,
    reviewedBy: params.reviewedBy,
  };
}

export function validateBankAccountDetails(
  bank: Pick<BankAccountDetails, "bankCode" | "bankName" | "accountNumber" | "accountName">,
  user?: UserProfile,
): ServiceResult {
  if (user?.status === "Suspended") {
    return {
      ok: false,
      error: "Suspended accounts cannot modify settlement bank details. Contact compliance support.",
    };
  }
  if (!bank.bankCode.trim() || !bank.bankName.trim()) {
    return { ok: false, error: "Please select a valid Nigerian settlement bank." };
  }
  if (!/^\d{10}$/.test(bank.accountNumber.trim())) {
    return { ok: false, error: "Nigerian NUBAN account numbers must be exactly 10 digits." };
  }
  const cleanName = bank.accountName.trim();
  if (cleanName.length < 3 || !/[A-Za-z]{2,}/.test(cleanName)) {
    return { ok: false, error: "Enter the full legal account holder name." };
  }
  return { ok: true };
}

const KYC_TIER_ORDER: Record<UserProfile["kycLevel"], number> = {
  "Tier 1": 1,
  "Tier 2": 2,
  "Tier 3": 3,
};

export function validateKycSubmission(
  input: KycSubmissionInput,
  user: UserProfile,
  existingSubmissions: KycSubmissionRecord[] = [],
  referenceDate: Date = new Date(),
): ServiceResult {
  if (user.status === "Suspended") {
    return {
      ok: false,
      error: "Suspended accounts cannot submit KYC applications. Contact compliance support.",
    };
  }
  const hasPending = existingSubmissions.some(
    (s) => s.userId === user.id && s.status === "Under Review",
  );
  if (hasPending) {
    return {
      ok: false,
      error:
        "You already have a KYC submission under review. Wait for compliance feedback before submitting again.",
    };
  }
  if (
    user.status === "Active" &&
    KYC_TIER_ORDER[input.targetTier] <= KYC_TIER_ORDER[user.kycLevel]
  ) {
    return {
      ok: false,
      error: `Your account is already verified at ${user.kycLevel}. Select a higher tier to upgrade.`,
    };
  }

  const cleanId = input.idNumber.trim();
  if (input.idType === "NIN") {
    if (!/^\d{11}$/.test(cleanId)) {
      return { ok: false, error: "Nigerian NIN must be exactly 11 digits." };
    }
  } else if (!/^[A-Za-z0-9-]{6,20}$/.test(cleanId)) {
    return {
      ok: false,
      error: `Enter a valid ${input.idType} number (6–20 letters or digits).`,
    };
  }

  const cleanBvn = input.bvn.trim();
  if (!/^\d{11}$/.test(cleanBvn)) {
    return { ok: false, error: "Bank Verification Number (BVN) must be exactly 11 digits." };
  }

  const dob = new Date(input.dateOfBirth);
  if (!input.dateOfBirth || Number.isNaN(dob.getTime())) {
    return { ok: false, error: "Provide a valid date of birth." };
  }
  const ageYears =
    (referenceDate.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears < 18 || ageYears > 120) {
    return { ok: false, error: "Account holder must be at least 18 years old." };
  }

  if (input.residentialAddress.trim().length < 10) {
    return {
      ok: false,
      error: "Provide your full residential or corporate address (at least 10 characters).",
    };
  }

  if (!input.idDocumentName.trim()) {
    return {
      ok: false,
      error: "Attach a simulated government ID document file (PDF, JPG, or PNG).",
    };
  }

  if (input.targetTier === "Tier 3" && !input.proofOfAddressName?.trim()) {
    return {
      ok: false,
      error: "Tier 3 applications require a simulated proof of address document.",
    };
  }

  return { ok: true };
}

export interface AutoCompoundRolloverEvaluation {
  eligible: boolean;
  rolloverPrincipal: number;
  reason?: string;
}

/**
 * Determines whether a maturing investment with autoCompound enabled can safely
 * roll over principal + realized return into a new active investment cycle.
 */
export function evaluateAutoCompoundRollover(
  investment: InvestmentRecord,
  plan: InvestmentPlan | undefined,
  investor: UserProfile | undefined,
  realizedReturn: number,
): AutoCompoundRolloverEvaluation {
  const rolloverPrincipal = investment.principal + realizedReturn;

  if (!investment.autoCompound) {
    return {
      eligible: false,
      rolloverPrincipal,
      reason: "Auto-compound is disabled for this mandate.",
    };
  }
  if (investment.rolledOverToInvestmentId) {
    return {
      eligible: false,
      rolloverPrincipal,
      reason: `Already rolled over into ${investment.rolledOverToInvestmentId}.`,
    };
  }
  if (!investor || investor.status === "Suspended") {
    return {
      eligible: false,
      rolloverPrincipal,
      reason: "Investor account is suspended; proceeds settled to available balance instead.",
    };
  }
  if (!plan || plan.status !== "Active") {
    return {
      eligible: false,
      rolloverPrincipal,
      reason: "Underlying investment plan is no longer Active; proceeds settled to available balance.",
    };
  }
  if (rolloverPrincipal < plan.minAmount) {
    return {
      eligible: false,
      rolloverPrincipal,
      reason: `Compounded total (₦${rolloverPrincipal.toLocaleString("en-NG")}) is below plan minimum of ₦${plan.minAmount.toLocaleString("en-NG")}.`,
    };
  }
  if (rolloverPrincipal > plan.maxAmount) {
    return {
      eligible: false,
      rolloverPrincipal,
      reason: `Compounded total (₦${rolloverPrincipal.toLocaleString("en-NG")}) exceeds plan maximum of ₦${plan.maxAmount.toLocaleString("en-NG")}; proceeds settled to available balance.`,
    };
  }

  return {
    eligible: true,
    rolloverPrincipal,
  };
}

export interface MaturitySettlementBundle {
  maturedInvestment: InvestmentRecord;
  realizedReturn: number;
  payoutTransaction: TransactionRecord;
  rolloverInvestment?: InvestmentRecord;
  rolloverTransaction?: TransactionRecord;
  rolloverSkippedReason?: string;
}

/**
 * Pure, duplicate-safe maturity settlement & auto-compound rollover engine.
 * Preserves ledger consistency:
 * - Always settles principal + logs one Completed Realized Return transaction.
 * - Rejects duplicate settlement or duplicate rollover attempts.
 * - If autoCompound is enabled and eligible, creates a linked rollover InvestmentRecord
 *   and matching Investment ledger transaction so Available Balance remains exact.
 */
export function buildMaturitySettlementBundle(params: {
  investment: InvestmentRecord;
  plan: InvestmentPlan | undefined;
  investor: UserProfile | undefined;
  adminName: string;
  existingTransactions: TransactionRecord[];
  referenceDate?: Date;
}): ServiceResult<MaturitySettlementBundle> {
  const { investment, plan, investor, adminName, existingTransactions } = params;
  const now = params.referenceDate ?? new Date();
  const nowIso = now.toISOString();

  if (investment.status !== "Active") {
    return { ok: false, error: "Only active investments can be matured." };
  }
  if (investment.settledAt || investment.maturityPayoutTxnId || investment.rolledOverToInvestmentId) {
    return { ok: false, error: "This investment mandate has already been settled." };
  }
  const duplicateTxn = existingTransactions.some(
    (t) =>
      t.userId === investment.userId &&
      t.type === "Realized Return" &&
      t.status === "Completed" &&
      Boolean(t.note?.includes(investment.id)),
  );
  if (duplicateTxn) {
    return {
      ok: false,
      error: "A completed maturity payout already exists in the ledger for this mandate.",
    };
  }
  if (!investor) {
    return { ok: false, error: "Investor record missing." };
  }

  const realizedReturn = investment.projectedReturn;
  const payoutTransaction: TransactionRecord = {
    ...buildTransactionRecord({
      user: investor,
      type: "Realized Return",
      amount: realizedReturn,
      status: "Completed",
      channel: investment.planName,
      note: `Simulated maturity settlement for ${investment.id}`,
      reviewedBy: adminName,
    }),
    createdAt: nowIso,
    reviewedAt: nowIso,
  };

  let rolloverInvestment: InvestmentRecord | undefined;
  let rolloverTransaction: TransactionRecord | undefined;
  let rolloverSkippedReason: string | undefined;

  if (investment.autoCompound) {
    const evalResult = evaluateAutoCompoundRollover(investment, plan, investor, realizedReturn);
    if (evalResult.eligible && plan) {
      const maturesAt = new Date(now.getTime() + plan.durationDays * 86_400_000).toISOString();
      const nextCycle = (investment.rolloverCycle ?? 1) + 1;
      rolloverInvestment = {
        id: generateId("INV"),
        userId: investor.id,
        userName: investor.fullName,
        planId: plan.id,
        planName: plan.name,
        principal: evalResult.rolloverPrincipal,
        targetReturnPercent: plan.targetReturnPercent,
        projectedReturn: calculateProjectedReturn(
          evalResult.rolloverPrincipal,
          plan.targetReturnPercent,
        ),
        accruedReturn: 0,
        durationDays: plan.durationDays,
        riskBand: plan.riskBand,
        status: "Active",
        startedAt: nowIso,
        maturesAt,
        autoCompound: true,
        rolledOverFromInvestmentId: investment.id,
        rolloverCycle: nextCycle,
      };
      rolloverTransaction = {
        ...buildTransactionRecord({
          user: investor,
          type: "Investment",
          amount: evalResult.rolloverPrincipal,
          status: "Completed",
          channel: plan.name,
          note: `Auto-compound rollover (Cycle #${nextCycle}) from ${investment.id}: ₦${investment.principal.toLocaleString("en-NG")} principal + ₦${realizedReturn.toLocaleString("en-NG")} realized return`,
          reviewedBy: "Auto-Compound Settlement Desk",
        }),
        createdAt: nowIso,
        reviewedAt: nowIso,
      };
    } else {
      rolloverSkippedReason = evalResult.reason;
    }
  }

  const maturedInvestment: InvestmentRecord = {
    ...investment,
    status: "Matured",
    accruedReturn: realizedReturn,
    settledAt: nowIso,
    maturityPayoutTxnId: payoutTransaction.id,
    rolledOverToInvestmentId: rolloverInvestment?.id,
    rolloverSkippedReason,
  };

  return {
    ok: true,
    data: {
      maturedInvestment,
      realizedReturn,
      payoutTransaction,
      rolloverInvestment,
      rolloverTransaction,
      rolloverSkippedReason,
    },
  };
}

export interface PlatformServiceContract {
  login: (email: string, password: string) => ServiceResult<UserProfile>;
  register: (payload: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    referralCode?: string;
  }) => ServiceResult<UserProfile>;
  logout: () => void;
  switchRoleDemo: (role: "investor" | "admin") => void;
  verifyEmail: (email: string, code: string) => ServiceResult<UserProfile>;
  requestPasswordReset: (email: string) => ServiceResult<{ resetToken: string }>;
  resetPassword: (email: string, token: string, newPassword: string) => ServiceResult;
  changePassword: (currentPassword: string, newPassword: string) => ServiceResult;
  createDeposit: (input: DepositInput) => ServiceResult<TransactionRecord>;
  requestWithdrawal: (input: WithdrawalInput) => ServiceResult<TransactionRecord>;
  subscribeInvestment: (input: SubscribeInvestmentInput) => ServiceResult<InvestmentRecord>;
  toggleInvestmentAutoCompound: (investmentId: string) => ServiceResult<InvestmentRecord>;
  updateProfile: (
    updates: Partial<
      Pick<
        UserProfile,
        "fullName" | "phone" | "city" | "address" | "twoFactorEnabled" | "emailAlerts" | "smsAlerts"
      >
    >,
  ) => ServiceResult;
  updateBankAccount: (bank: BankAccountDetails) => ServiceResult;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  // Admin methods
  adminReviewTransaction: (txnId: string, status: TransactionStatus, note?: string) => ServiceResult;
  adminMatureInvestment: (
    investmentId: string,
  ) => ServiceResult<{
    realizedReturn: number;
    rolledOverInvestmentId?: string;
    rolloverPrincipal?: number;
    rolloverSkippedReason?: string;
  }>;
  adminUpdateUserStatus: (userId: string, status: AccountStatus) => ServiceResult;
  adminUpdateUserTier: (userId: string, tier: UserProfile["tier"]) => ServiceResult;
  adminReviewUserKyc: (
    userId: string,
    decision: {
      status: AccountStatus;
      kycLevel: UserProfile["kycLevel"];
      note?: string;
    },
  ) => ServiceResult;
  adminCreatePlan: (input: CreatePlanInput) => ServiceResult<InvestmentPlan>;
  adminTogglePlanStatus: (planId: string, status: InvestmentPlan["status"]) => ServiceResult;
  adminUpdatePlan: (planId: string, updates: Partial<InvestmentPlan>) => ServiceResult;
  adminSendNotification: (payload: {
    userId: string | "ALL";
    title: string;
    message: string;
    category: NotificationCategory;
  }) => ServiceResult;
  adminUpdateSettings: (updates: Partial<PlatformSettings>) => ServiceResult;
  adminMarkReferralPaid: (referralId: string) => ServiceResult;
  resetDemoState: () => void;
}

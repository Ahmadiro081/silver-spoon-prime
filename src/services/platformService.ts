import type {
  AccountStatus,
  BankAccountDetails,
  InvestmentPlan,
  InvestmentRecord,
  NotificationCategory,
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

export function generateId(prefix: string): string {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${random}`;
}

export function generateReference(prefix: string): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SS-${prefix}-${stamp}-${rand}`;
}

export function validateDeposit(
  input: DepositInput,
  settings: PlatformSettings,
): ServiceResult {
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
): ServiceResult<{ fee: number }> {
  if (!Number.isFinite(input.amount) || input.amount < 5_000) {
    return { ok: false, error: "Minimum withdrawal amount is ₦5,000." };
  }
  if (input.amount > settings.maxDailyWithdrawal) {
    return {
      ok: false,
      error: `Single withdrawal exceeds daily limit of ₦${settings.maxDailyWithdrawal.toLocaleString("en-NG")}.`,
    };
  }
  if (settings.requireKycForWithdrawals && user.kycLevel === "Tier 1") {
    return { ok: false, error: "Tier 2 or Tier 3 KYC verification is required before withdrawing funds." };
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
): ServiceResult<{ projectedReturn: number }> {
  if (!plan || plan.status !== "Active") {
    return { ok: false, error: "Selected investment mandate is not currently open for subscription." };
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

export interface PlatformServiceContract {
  login: (email: string, password: string, roleOverride?: "investor" | "admin") => ServiceResult<UserProfile>;
  register: (payload: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    referralCode?: string;
  }) => ServiceResult<UserProfile>;
  logout: () => void;
  switchRoleDemo: (role: "investor" | "admin") => void;
  createDeposit: (input: DepositInput) => ServiceResult<TransactionRecord>;
  requestWithdrawal: (input: WithdrawalInput) => ServiceResult<TransactionRecord>;
  subscribeInvestment: (input: SubscribeInvestmentInput) => ServiceResult<InvestmentRecord>;
  updateProfile: (updates: Partial<Pick<UserProfile, "fullName" | "phone" | "city" | "address" | "twoFactorEnabled" | "emailAlerts" | "smsAlerts">>) => ServiceResult;
  updateBankAccount: (bank: BankAccountDetails) => ServiceResult;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  // Admin methods
  adminReviewTransaction: (txnId: string, status: TransactionStatus, note?: string) => ServiceResult;
  adminMatureInvestment: (investmentId: string) => ServiceResult<{ realizedReturn: number }>;
  adminUpdateUserStatus: (userId: string, status: AccountStatus) => ServiceResult;
  adminUpdateUserTier: (userId: string, tier: UserProfile["tier"]) => ServiceResult;
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

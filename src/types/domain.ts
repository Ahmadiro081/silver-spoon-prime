export type UserRole = "investor" | "admin";
export type AccountStatus = "Active" | "Pending KYC" | "Suspended";
export type RiskBand = "Low" | "Moderate" | "Elevated";
export type PlanStatus = "Active" | "Paused" | "Archived";
export type InvestmentStatus = "Active" | "Matured" | "Cancelled";
export type TransactionType = "Deposit" | "Withdrawal" | "Investment" | "Realized Return" | "Referral Commission";
export type TransactionStatus = "Completed" | "Pending" | "Declined";
export type ReferralStatus = "Active" | "Pending" | "Paid";
export type NotificationCategory = "deposit" | "withdrawal" | "investment" | "referral" | "security" | "platform";

export interface BankAccountDetails {
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  verified: boolean;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  role: UserRole;
  tier: "Silver" | "Platinum" | "Sovereign";
  status: AccountStatus;
  kycLevel: "Tier 1" | "Tier 2" | "Tier 3";
  referralCode: string;
  referredBy?: string;
  joinedAt: string;
  lastLoginAt: string;
  twoFactorEnabled: boolean;
  emailAlerts: boolean;
  smsAlerts: boolean;
  bankAccount: BankAccountDetails;
  avatarUrl?: string;
}

export interface InvestmentPlan {
  id: string;
  name: string;
  code: string;
  category: string;
  tagline: string;
  description: string;
  minAmount: number;
  maxAmount: number;
  durationDays: number;
  targetReturnPercent: number;
  riskBand: RiskBand;
  payoutFrequency: "At Maturity" | "Monthly" | "Quarterly";
  managementFeePercent: number;
  featured?: boolean;
  status: PlanStatus;
  allocationFocus: string[];
  perks: string[];
  riskNote: string;
}

export interface InvestmentRecord {
  id: string;
  userId: string;
  userName: string;
  planId: string;
  planName: string;
  principal: number;
  targetReturnPercent: number;
  projectedReturn: number;
  accruedReturn: number;
  durationDays: number;
  riskBand: RiskBand;
  status: InvestmentStatus;
  startedAt: string;
  maturesAt: string;
  autoCompound: boolean;
}

export interface TransactionRecord {
  id: string;
  reference: string;
  userId: string;
  userName: string;
  userEmail: string;
  type: TransactionType;
  amount: number;
  fee: number;
  status: TransactionStatus;
  channel: string;
  note?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface ReferralRecord {
  id: string;
  referrerId: string;
  referrerName: string;
  referredUserId: string;
  referredUserName: string;
  referredUserEmail: string;
  joinedAt: string;
  qualifyingInvestment: number;
  commissionRatePercent: number;
  commissionEarned: number;
  status: ReferralStatus;
}

export interface NotificationItem {
  id: string;
  userId: string | "ALL";
  title: string;
  message: string;
  category: NotificationCategory;
  createdAt: string;
  read: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: UserRole | "system";
  action: string;
  targetType: "User" | "Deposit" | "Withdrawal" | "Investment" | "Plan" | "Referral" | "Settings" | "Notification";
  targetId: string;
  summary: string;
  severity: "Info" | "Review" | "Critical";
  ipAddress: string;
}

export interface PlatformSettings {
  platformName: string;
  maintenanceMode: boolean;
  allowNewRegistrations: boolean;
  minDepositAmount: number;
  maxDailyWithdrawal: number;
  withdrawalFeeThreshold: number;
  highValueWithdrawalFee: number;
  referralCommissionPercent: number;
  requireKycForWithdrawals: boolean;
  autoApproveDepositsUnder: number;
  supportEmail: string;
}

export interface WalletMetrics {
  totalWalletBalance: number;
  availableBalance: number;
  activeInvestments: number;
  pendingWithdrawals: number;
  totalDeposits: number;
  totalWithdrawals: number;
  realizedEarnings: number;
  referralEarnings: number;
  projectedAccrual: number;
}

export interface MonthlyPerformancePoint {
  month: string;
  deposits: number;
  withdrawals: number;
  portfolioValue: number;
  realizedEarnings: number;
  activeUsers: number;
}

export interface NigerianBank {
  name: string;
  code: string;
}

export interface FaqItem {
  id: string;
  category: "General" | "Wallet & Funding" | "Investments & Risk" | "Referrals & Security";
  question: string;
  answer: string;
}

export interface TestimonialItem {
  id: string;
  name: string;
  role: string;
  organization: string;
  city: string;
  outcome: string;
  quote: string;
}

export interface SessionState {
  authenticated: boolean;
  userId: string;
  role: UserRole;
}

export interface ServiceResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

import { createContext, useContext } from "react";
import type { KycSubmissionInput, PlatformServiceContract } from "@/services/platformService";
import type {
  AuditLogEntry,
  InvestmentPlan,
  InvestmentRecord,
  KycSubmissionRecord,
  NotificationItem,
  PlatformSettings,
  ReferralRecord,
  ServiceResult,
  SessionState,
  TransactionRecord,
  UserNotificationItem,
  UserProfile,
  WalletMetrics,
} from "@/types/domain";

export interface AppStateContextValue extends PlatformServiceContract {
  session: SessionState;
  currentUser: UserProfile;
  authenticatedUser: UserProfile | null;
  resetVersion: number;
  users: UserProfile[];
  plans: InvestmentPlan[];
  investments: InvestmentRecord[];
  transactions: TransactionRecord[];
  referrals: ReferralRecord[];
  notifications: NotificationItem[];
  auditLogs: AuditLogEntry[];
  settings: PlatformSettings;
  kycSubmissions: KycSubmissionRecord[];
  // Strictly isolated derived views for the authenticated account
  userWallet: WalletMetrics;
  userTransactions: TransactionRecord[];
  userInvestments: InvestmentRecord[];
  userReferrals: ReferralRecord[];
  userNotifications: UserNotificationItem[];
  userKycSubmissions: KycSubmissionRecord[];
  unreadNotificationCount: number;
  pendingVerificationCode: string | null;
  pendingTwoFactorCode: string | null;
  requestVerificationCode: () => ServiceResult<{ code: string }>;
  requestTwoFactorChallenge: (purpose?: string) => ServiceResult<{ code: string }>;
  enableTwoFactor: (code: string) => ServiceResult;
  disableTwoFactor: (currentPassword: string) => ServiceResult;
  submitKycApplication: (input: KycSubmissionInput) => ServiceResult<KycSubmissionRecord>;
  adminVerifyUserBankAccount: (userId: string) => ServiceResult;
}

export const AppStateContext = createContext<AppStateContextValue | null>(null);

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return ctx;
}

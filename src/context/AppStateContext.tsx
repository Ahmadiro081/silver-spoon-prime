import { createContext, useContext } from "react";
import type {
  AdminReadSnapshot,
  AuthResult,
  AuthSession,
  AuthStateModel,
  DataProviderId,
  InvestorReadSnapshot,
} from "@/services/dataProvider";
import type { PlatformServiceContract } from "@/services/platformService";
import type {
  AuditLogEntry,
  InvestmentPlan,
  InvestmentRecord,
  KycSubmissionRecord,
  NotificationItem,
  PlatformSettings,
  ReferralRecord,
  SessionState,
  TransactionRecord,
  UserNotificationItem,
  UserProfile,
  WalletMetrics,
} from "@/types/domain";

export interface AppStateContextValue extends PlatformServiceContract {
  // Provider & async execution metadata (Phase 6.2)
  activeProvider: DataProviderId | null;
  providerStandby: boolean;
  providerError: string | null;
  isLoading: boolean;
  isMutating: boolean;
  pendingOperations: string[];
  isOperationPending: (operationKey: string) => boolean;
  lastError: string | null;
  clearLastError: () => void;

  // Centralized authentication & session state model (Phase 6.4)
  authState: AuthStateModel;
  refreshSession: () => Promise<AuthResult<AuthSession | null>>;
  clearAuthError: () => void;

  // Investor read-only orchestrated dataset (Phase 6.5)
  investorReadData: InvestorReadSnapshot;
  refreshInvestorReadData: () => Promise<void>;

  // Administrative & staff read-only orchestrated dataset (Phase 6.6)
  adminReadData: AdminReadSnapshot;
  refreshAdminReadData: () => Promise<void>;

  // Domain state snapshot
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
}

export const AppStateContext = createContext<AppStateContextValue | null>(null);

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return ctx;
}

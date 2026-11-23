import { createContext, useContext } from "react";
import type { PlatformServiceContract } from "@/services/platformService";
import type {
  AuditLogEntry,
  InvestmentPlan,
  InvestmentRecord,
  NotificationItem,
  PlatformSettings,
  ReferralRecord,
  SessionState,
  TransactionRecord,
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
  // Strictly isolated derived views for the authenticated account
  userWallet: WalletMetrics;
  userTransactions: TransactionRecord[];
  userInvestments: InvestmentRecord[];
  userReferrals: ReferralRecord[];
  userNotifications: NotificationItem[];
  unreadNotificationCount: number;
}

export const AppStateContext = createContext<AppStateContextValue | null>(null);

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return ctx;
}

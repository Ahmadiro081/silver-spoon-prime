import {
  INITIAL_AUDIT_LOGS,
  INITIAL_INVESTMENTS,
  INITIAL_NOTIFICATIONS,
  INITIAL_PLANS,
  INITIAL_REFERRALS,
  INITIAL_SETTINGS,
  INITIAL_TRANSACTIONS,
  INITIAL_USERS,
} from "@/data/mockDatabase";
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
} from "@/types/domain";

export interface MockDataSnapshot {
  session: SessionState;
  users: UserProfile[];
  plans: InvestmentPlan[];
  investments: InvestmentRecord[];
  transactions: TransactionRecord[];
  referrals: ReferralRecord[];
  notifications: NotificationItem[];
  auditLogs: AuditLogEntry[];
  settings: PlatformSettings;
  resetTokens: Record<string, string>;
}

const STORAGE_KEY = "silver-spoon-mock-provider-v3";

/**
 * Centralized Mock Data Provider for SILVER SPOON.
 * Supplies all frontend state, persistence, and reset operations with zero
 * external database credentials or backend network dependencies.
 */
export const mockDataProvider = {
  id: "mock" as const,

  getSeedSnapshot(): MockDataSnapshot {
    return {
      session: {
        authenticated: true,
        userId: "USR-1001",
        role: "investor",
      },
      users: INITIAL_USERS.map((u) => ({
        ...u,
        bankAccount: { ...u.bankAccount },
      })),
      plans: INITIAL_PLANS.map((p) => ({
        ...p,
        allocationFocus: [...p.allocationFocus],
        perks: [...p.perks],
      })),
      investments: INITIAL_INVESTMENTS.map((i) => ({ ...i })),
      transactions: INITIAL_TRANSACTIONS.map((t) => ({ ...t })),
      referrals: INITIAL_REFERRALS.map((r) => ({ ...r })),
      notifications: INITIAL_NOTIFICATIONS.map((n) => ({ ...n })),
      auditLogs: INITIAL_AUDIT_LOGS.map((a) => ({ ...a })),
      settings: { ...INITIAL_SETTINGS },
      resetTokens: {},
    };
  },

  loadSnapshot(): MockDataSnapshot {
    if (typeof window === "undefined") return this.getSeedSnapshot();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.getSeedSnapshot();
      const parsed = JSON.parse(raw) as Partial<MockDataSnapshot>;
      if (!parsed.users?.length || !parsed.plans?.length) return this.getSeedSnapshot();

      const seed = this.getSeedSnapshot();
      const hydratedUsers = parsed.users.map((u) => ({
        ...u,
        password: u.password ?? "silverspoon2026",
        emailVerified: u.emailVerified ?? true,
      }));

      return {
        ...seed,
        ...parsed,
        users: hydratedUsers,
        resetTokens: parsed.resetTokens ?? {},
      };
    } catch {
      return this.getSeedSnapshot();
    }
  },

  saveSnapshot(snapshot: MockDataSnapshot): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage quota restrictions in sandboxed environments
    }
  },

  clearSnapshot(): MockDataSnapshot {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
    }
    return this.getSeedSnapshot();
  },
};

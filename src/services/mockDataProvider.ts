import {
  INITIAL_AUDIT_LOGS,
  INITIAL_INVESTMENTS,
  INITIAL_KYC_SUBMISSIONS,
  INITIAL_NOTIFICATIONS,
  INITIAL_PLANS,
  INITIAL_REFERRALS,
  INITIAL_SETTINGS,
  INITIAL_TRANSACTIONS,
  INITIAL_USERS,
} from "@/data/mockDatabase";
import type {
  AuditLogEntry,
  BankAccountDetails,
  BankVerificationStatus,
  InvestmentPlan,
  InvestmentRecord,
  KycSubmissionRecord,
  NotificationItem,
  PlatformSettings,
  ReferralRecord,
  SessionState,
  TransactionRecord,
  UserProfile,
} from "@/types/domain";
import {
  isLegacyUnmigratedSnapshot,
  MOCK_SCHEMA_VERSION,
  sanitizeRestoredSession,
} from "@/utils/mockIntegrity";

export interface MockDataSnapshot {
  schemaVersion: number;
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
  verificationCodes: Record<string, string>;
  twoFactorCodes: Record<string, string>;
  kycSubmissions: KycSubmissionRecord[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const MOCK_STORAGE_KEY = "silver-spoon-mock-provider-v3";

type LegacyNotificationItem = Omit<NotificationItem, "readByUserIds"> & {
  read?: boolean;
  readByUserIds?: string[];
};

function resolveStorage(override?: StorageLike): StorageLike | null {
  if (override) return override;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hydrateNotification(raw: LegacyNotificationItem): NotificationItem {
  const { read, readByUserIds, ...rest } = raw;
  if (Array.isArray(readByUserIds)) {
    return {
      ...rest,
      readByUserIds: Array.from(new Set(readByUserIds.filter((id) => typeof id === "string"))),
    };
  }
  const migratedReadBy = read === true && rest.userId !== "ALL" ? [rest.userId] : [];
  return {
    ...rest,
    readByUserIds: migratedReadBy,
  };
}

function hydrateBankAccount(bank?: Partial<BankAccountDetails>): BankAccountDetails {
  const accountNumber = typeof bank?.accountNumber === "string" ? bank.accountNumber : "";
  const verified = Boolean(bank?.verified);
  const status: BankVerificationStatus =
    bank?.verificationStatus ??
    (!accountNumber
      ? "Unverified"
      : verified
        ? "Simulated Verified"
        : "Pending Verification");
  return {
    bankName: bank?.bankName || "Guaranty Trust Bank (GTBank)",
    bankCode: bank?.bankCode || "058",
    accountNumber,
    accountName: bank?.accountName || "",
    verified,
    verificationStatus: status,
    updatedAt: bank?.updatedAt,
  };
}

function hydrateStringMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Centralized Mock Data Provider for SILVER SPOON.
 * Supplies clean initial frontend state, one-time legacy storage cleanup,
 * localStorage persistence, and reset operations with zero external database
 * credentials or backend network dependencies.
 */
export const mockDataProvider = {
  id: "mock" as const,
  storageKey: MOCK_STORAGE_KEY,
  schemaVersion: MOCK_SCHEMA_VERSION,

  getSeedSnapshot(): MockDataSnapshot {
    return {
      schemaVersion: MOCK_SCHEMA_VERSION,
      session: {
        authenticated: false,
        userId: "",
        role: "investor",
      },
      users: INITIAL_USERS.map((u) => ({
        ...u,
        bankAccount: hydrateBankAccount({ ...u.bankAccount }),
      })),
      plans: INITIAL_PLANS.map((p) => ({
        ...p,
        allocationFocus: [...p.allocationFocus],
        perks: [...p.perks],
      })),
      investments: INITIAL_INVESTMENTS.map((i) => ({ ...i })),
      transactions: INITIAL_TRANSACTIONS.map((t) => ({ ...t })),
      referrals: INITIAL_REFERRALS.map((r) => ({ ...r })),
      notifications: INITIAL_NOTIFICATIONS.map((n) => ({
        ...n,
        readByUserIds: [...n.readByUserIds],
      })),
      auditLogs: INITIAL_AUDIT_LOGS.map((a) => ({ ...a })),
      settings: { ...INITIAL_SETTINGS },
      resetTokens: {},
      verificationCodes: {},
      twoFactorCodes: {},
      kycSubmissions: INITIAL_KYC_SUBMISSIONS.map((k) => ({ ...k })),
    };
  },

  loadSnapshot(storageOverride?: StorageLike): MockDataSnapshot {
    const storage = resolveStorage(storageOverride);
    if (!storage) return this.getSeedSnapshot();

    const raw = storage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return this.getSeedSnapshot();

    try {
      const parsed = JSON.parse(raw) as Partial<
        Omit<MockDataSnapshot, "notifications"> & { notifications?: LegacyNotificationItem[] }
      >;

      // One-time cleanup migration for pre-v4 storage snapshots containing legacy seeded demo records
      if (isLegacyUnmigratedSnapshot(parsed)) {
        const cleanSnapshot = this.getSeedSnapshot();
        this.saveSnapshot(cleanSnapshot, storage);
        return cleanSnapshot;
      }

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray(parsed.users) ||
        !Array.isArray(parsed.plans) ||
        parsed.plans.length === 0
      ) {
        const cleanSnapshot = this.getSeedSnapshot();
        this.saveSnapshot(cleanSnapshot, storage);
        return cleanSnapshot;
      }

      const cleanBase = this.getSeedSnapshot();
      const hydratedUsers = parsed.users
        .filter((u): u is UserProfile =>
          Boolean(u && typeof u.id === "string" && typeof u.email === "string"),
        )
        .map((u) => ({
          ...u,
          password: typeof u.password === "string" ? u.password : "",
          emailVerified: Boolean(u.emailVerified),
          bankAccount: hydrateBankAccount(u.bankAccount),
        }));

      const hydratedNotifications = Array.isArray(parsed.notifications)
        ? parsed.notifications.map(hydrateNotification)
        : [];

      const sanitizedSession = sanitizeRestoredSession(parsed.session, hydratedUsers);

      return {
        ...cleanBase,
        schemaVersion: MOCK_SCHEMA_VERSION,
        session: sanitizedSession,
        users: hydratedUsers,
        plans: parsed.plans.map((p) => ({
          ...p,
          allocationFocus: Array.isArray(p.allocationFocus) ? [...p.allocationFocus] : [],
          perks: Array.isArray(p.perks) ? [...p.perks] : [],
        })),
        investments: Array.isArray(parsed.investments) ? parsed.investments : [],
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        referrals: Array.isArray(parsed.referrals) ? parsed.referrals : [],
        notifications: hydratedNotifications,
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        settings:
          parsed.settings && typeof parsed.settings === "object"
            ? { ...cleanBase.settings, ...parsed.settings }
            : cleanBase.settings,
        resetTokens: hydrateStringMap(parsed.resetTokens),
        verificationCodes: hydrateStringMap(parsed.verificationCodes),
        twoFactorCodes: hydrateStringMap(parsed.twoFactorCodes),
        kycSubmissions: Array.isArray(parsed.kycSubmissions) ? parsed.kycSubmissions : [],
      };
    } catch {
      const cleanSnapshot = this.getSeedSnapshot();
      this.saveSnapshot(cleanSnapshot, storage);
      return cleanSnapshot;
    }
  },

  saveSnapshot(snapshot: MockDataSnapshot, storageOverride?: StorageLike): void {
    const storage = resolveStorage(storageOverride);
    if (!storage) return;
    try {
      const payload: MockDataSnapshot = {
        ...snapshot,
        schemaVersion: MOCK_SCHEMA_VERSION,
      };
      storage.setItem(MOCK_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota restrictions in sandboxed environments
    }
  },

  clearSnapshot(storageOverride?: StorageLike): MockDataSnapshot {
    const storage = resolveStorage(storageOverride);
    const cleanSnapshot = this.getSeedSnapshot();
    if (storage) {
      try {
        storage.removeItem(MOCK_STORAGE_KEY);
        this.saveSnapshot(cleanSnapshot, storage);
      } catch {
        // Ignore storage errors
      }
    }
    return cleanSnapshot;
  },
};

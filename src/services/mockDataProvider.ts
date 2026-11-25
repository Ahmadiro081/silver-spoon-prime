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
import {
  buildInvestmentRecord,
  buildMaturitySettlementBundle,
  buildTransactionRecord,
  generateId,
  generateNumericCode,
  generateRecoveryToken,
  markAllNotificationsReadForUser,
  markNotificationReadForUser,
  validateBankAccountDetails,
  validateDeposit,
  validateInvestmentSubscription,
  validateKycSubmission,
  validatePlatformSettings,
  validateWithdrawal,
  type CreatePlanInput,
  type DepositInput,
  type KycSubmissionInput,
  type PlatformServiceContract,
  type SubscribeInvestmentInput,
  type WithdrawalInput,
} from "@/services/platformService";
import type {
  AccountStatus,
  AuditLogEntry,
  BankAccountDetails,
  BankVerificationStatus,
  InvestmentPlan,
  InvestmentRecord,
  KycSubmissionRecord,
  NotificationCategory,
  NotificationItem,
  PlatformSettings,
  ReferralRecord,
  SessionState,
  TransactionRecord,
  TransactionStatus,
  UserProfile,
} from "@/types/domain";
import { formatNaira, maskAccountNumber } from "@/utils/format";
import {
  isLegacyUnmigratedSnapshot,
  MOCK_SCHEMA_VERSION,
  sanitizeRestoredSession,
  selectIsolatedAccountView,
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

export type SnapshotListener = (snapshot: MockDataSnapshot) => void;

export interface MockDataProviderContract extends PlatformServiceContract {
  readonly id: "mock";
  readonly standbyMode: false;
  readonly storageKey: string;
  readonly schemaVersion: number;
  getSeedSnapshot: () => MockDataSnapshot;
  loadSnapshot: (storageOverride?: StorageLike) => MockDataSnapshot;
  saveSnapshot: (snapshot: MockDataSnapshot, storageOverride?: StorageLike) => void;
  clearSnapshot: (storageOverride?: StorageLike) => MockDataSnapshot;
  getState: () => MockDataSnapshot;
  hydrateState: () => Promise<MockDataSnapshot>;
  subscribe: (listener: SnapshotListener) => () => void;
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

function appendAudit(
  prev: MockDataSnapshot,
  entry: Omit<AuditLogEntry, "id" | "timestamp" | "ipAddress">,
): AuditLogEntry[] {
  return [
    {
      ...entry,
      id: generateId("AUD"),
      timestamp: new Date().toISOString(),
      ipAddress: "102.89.34.18",
    },
    ...prev.auditLogs,
  ];
}

export function createSeedSnapshot(): MockDataSnapshot {
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
}

/**
 * Factory creating an isolated, async-compatible Mock Data Provider instance.
 * Preserves localStorage compatibility, clean empty initial state, and all
 * existing financial/validation business rules without any external network calls.
 */
export function createMockDataProvider(options?: {
  storage?: StorageLike;
}): MockDataProviderContract {
  const defaultStorage = options?.storage;
  const listeners = new Set<SnapshotListener>();
  let currentState: MockDataSnapshot | null = null;

  const getSeedSnapshot = (): MockDataSnapshot => createSeedSnapshot();

  const saveSnapshot = (snapshot: MockDataSnapshot, storageOverride?: StorageLike): void => {
    const storage = resolveStorage(storageOverride ?? defaultStorage);
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
  };

  const loadSnapshot = (storageOverride?: StorageLike): MockDataSnapshot => {
    const storage = resolveStorage(storageOverride ?? defaultStorage);
    if (!storage) return getSeedSnapshot();

    const raw = storage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return getSeedSnapshot();

    try {
      const parsed = JSON.parse(raw) as Partial<
        Omit<MockDataSnapshot, "notifications"> & { notifications?: LegacyNotificationItem[] }
      >;

      // One-time cleanup migration for pre-v4 storage snapshots containing legacy seeded demo records
      if (isLegacyUnmigratedSnapshot(parsed)) {
        const cleanSnapshot = getSeedSnapshot();
        saveSnapshot(cleanSnapshot, storage);
        return cleanSnapshot;
      }

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray(parsed.users) ||
        !Array.isArray(parsed.plans) ||
        parsed.plans.length === 0
      ) {
        const cleanSnapshot = getSeedSnapshot();
        saveSnapshot(cleanSnapshot, storage);
        return cleanSnapshot;
      }

      const cleanBase = getSeedSnapshot();
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
      const cleanSnapshot = getSeedSnapshot();
      saveSnapshot(cleanSnapshot, storage);
      return cleanSnapshot;
    }
  };

  const clearSnapshot = (storageOverride?: StorageLike): MockDataSnapshot => {
    const storage = resolveStorage(storageOverride ?? defaultStorage);
    const cleanSnapshot = getSeedSnapshot();
    if (storage) {
      try {
        storage.removeItem(MOCK_STORAGE_KEY);
        saveSnapshot(cleanSnapshot, storage);
      } catch {
        // Ignore storage errors
      }
    }
    if (!storageOverride) {
      currentState = cleanSnapshot;
      for (const listener of listeners) {
        listener(cleanSnapshot);
      }
    }
    return cleanSnapshot;
  };

  const ensureState = (): MockDataSnapshot => {
    if (!currentState) {
      currentState = loadSnapshot();
    }
    return currentState;
  };

  const commitState = (next: MockDataSnapshot): MockDataSnapshot => {
    currentState = next;
    saveSnapshot(next);
    for (const listener of listeners) {
      listener(next);
    }
    return next;
  };

  const getAuthenticatedUser = (state: MockDataSnapshot): UserProfile | null => {
    if (!state.session.authenticated) return null;
    return state.users.find((u) => u.id === state.session.userId) ?? null;
  };

  const requireAdminActor = (state: MockDataSnapshot): UserProfile | null => {
    const actor = getAuthenticatedUser(state);
    if (!actor || actor.role !== "admin") return null;
    return actor;
  };

  return {
    id: "mock",
    standbyMode: false,
    storageKey: MOCK_STORAGE_KEY,
    schemaVersion: MOCK_SCHEMA_VERSION,

    getSeedSnapshot,
    loadSnapshot,
    saveSnapshot,
    clearSnapshot,

    getState(): MockDataSnapshot {
      return ensureState();
    },

    async hydrateState(): Promise<MockDataSnapshot> {
      const loaded = loadSnapshot();
      currentState = loaded;
      for (const listener of listeners) {
        listener(loaded);
      }
      return loaded;
    },

    subscribe(listener: SnapshotListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    // ── Authentication & Account Management ──

    async login(email: string, password: string) {
      const state = ensureState();
      if (!email.trim() || !password.trim()) {
        return { ok: false, error: "Please enter both email address and password." };
      }
      const normalized = email.trim().toLowerCase();
      const matched = state.users.find((u) => u.email.toLowerCase() === normalized);

      if (!matched || !matched.password || password !== matched.password) {
        return {
          ok: false,
          error:
            "Invalid email address or password. Verify your credentials or open a new account.",
        };
      }

      if (matched.status === "Suspended") {
        return {
          ok: false,
          error: "This account is currently suspended. Contact compliance support.",
        };
      }

      const now = new Date().toISOString();
      const updatedUser: UserProfile = { ...matched, lastLoginAt: now };

      commitState({
        ...state,
        session: { authenticated: true, userId: matched.id, role: matched.role },
        users: state.users.map((u) => (u.id === matched.id ? updatedUser : u)),
      });
      return { ok: true, data: updatedUser };
    },

    async register(payload) {
      const state = ensureState();
      if (!state.settings.allowNewRegistrations) {
        return {
          ok: false,
          error: "New client onboarding is temporarily paused by administration.",
        };
      }
      const emailNormalized = payload.email.trim().toLowerCase();
      if (
        !payload.fullName.trim() ||
        !emailNormalized.includes("@") ||
        !emailNormalized.includes(".") ||
        payload.password.length < 8
      ) {
        return {
          ok: false,
          error:
            "Provide full name, a valid email address, and a password of at least 8 characters.",
        };
      }
      const exists = state.users.some((u) => u.email.toLowerCase() === emailNormalized);
      if (exists) {
        return { ok: false, error: "An account with this email already exists." };
      }

      const firstWord =
        payload.fullName
          .trim()
          .split(/\s+/)[0]
          ?.replace(/[^a-zA-Z0-9]/g, "")
          .toUpperCase()
          .slice(0, 6) || "CLIENT";

      const now = new Date().toISOString();
      const newUser: UserProfile = {
        id: generateId("USR"),
        fullName: payload.fullName.trim(),
        email: emailNormalized,
        password: payload.password,
        emailVerified: false,
        phone: payload.phone.trim() || "+234 800 000 0000",
        city: "Lagos",
        address: "Victoria Island, Lagos",
        role: "investor",
        tier: "Silver",
        status: "Active",
        kycLevel: "Tier 2",
        kycNote: "Standard onboarding Tier 2 profile (simulated).",
        referralCode: `SS-${firstWord}${Math.floor(10 + Math.random() * 89)}`,
        referredBy: payload.referralCode?.trim() || undefined,
        joinedAt: now,
        lastLoginAt: now,
        twoFactorEnabled: false,
        emailAlerts: true,
        smsAlerts: false,
        bankAccount: {
          bankName: "Guaranty Trust Bank (GTBank)",
          bankCode: "058",
          accountNumber: "",
          accountName: payload.fullName.trim().toUpperCase(),
          verified: false,
          verificationStatus: "Unverified",
        },
      };

      const referrer = payload.referralCode
        ? state.users.find(
            (u) =>
              u.role === "investor" &&
              u.referralCode.toLowerCase() === payload.referralCode!.trim().toLowerCase(),
          )
        : undefined;

      const initialVerificationCode = generateNumericCode(6);

      commitState({
        ...state,
        session: { authenticated: true, userId: newUser.id, role: "investor" },
        users: [newUser, ...state.users],
        verificationCodes: {
          ...state.verificationCodes,
          [emailNormalized]: initialVerificationCode,
        },
        referrals: referrer
          ? [
              {
                id: generateId("REF"),
                referrerId: referrer.id,
                referrerName: referrer.fullName,
                referredUserId: newUser.id,
                referredUserName: newUser.fullName,
                referredUserEmail: newUser.email,
                joinedAt: newUser.joinedAt,
                qualifyingInvestment: 0,
                commissionRatePercent: state.settings.referralCommissionPercent,
                commissionEarned: 0,
                status: "Pending",
              },
              ...state.referrals,
            ]
          : state.referrals,
        notifications: [
          {
            id: generateId("NTF"),
            userId: newUser.id,
            title: "Welcome to SILVER SPOON",
            message:
              "Your independent Naira wealth account is ready. Complete email verification and fund your wallet to allocate into mandates.",
            category: "platform",
            createdAt: now,
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: newUser.fullName,
          actorRole: "investor",
          action: "ACCOUNT_REGISTERED",
          targetType: "User",
          targetId: newUser.id,
          summary: `New investor account registered (${newUser.email})${referrer ? ` via referral ${referrer.referralCode}` : ""}.`,
          severity: "Info",
        }),
      });

      return { ok: true, data: newUser };
    },

    async logout() {
      const state = ensureState();
      commitState({
        ...state,
        session: { authenticated: false, userId: "", role: "investor" },
      });
    },

    async switchRoleDemo() {
      // Retained as a safe async no-op to preserve PlatformServiceContract compatibility;
      // seeded demo accounts and demo role switching have been removed.
      return;
    },

    async requestVerificationCode() {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser) {
        return {
          ok: false,
          error: "Sign in to your account to request an email verification code.",
        };
      }
      if (authenticatedUser.emailVerified) {
        return { ok: false, error: "Your email address is already verified." };
      }
      const normalized = authenticatedUser.email.toLowerCase();
      const code = generateNumericCode(6);
      commitState({
        ...state,
        verificationCodes: { ...state.verificationCodes, [normalized]: code },
        auditLogs: appendAudit(state, {
          actorName: authenticatedUser.fullName,
          actorRole: authenticatedUser.role,
          action: "EMAIL_VERIFICATION_CODE_ISSUED",
          targetType: "Security",
          targetId: authenticatedUser.id,
          summary: `Issued simulated 6-digit email verification code for ${authenticatedUser.email}.`,
          severity: "Info",
        }),
      });
      return { ok: true, data: { code } };
    },

    async verifyEmail(email: string, code: string) {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser) {
        return {
          ok: false,
          error: "Sign in to your account before verifying your email address.",
        };
      }
      const normalized = email.trim().toLowerCase();
      if (authenticatedUser.email.toLowerCase() !== normalized) {
        return {
          ok: false,
          error: "You can only verify the email address belonging to your signed-in account.",
        };
      }
      const trimmedCode = code.trim();
      if (!/^\d{6}$/.test(trimmedCode)) {
        return { ok: false, error: "Enter a valid 6-digit verification code." };
      }
      const expectedCode = state.verificationCodes[normalized];
      if (!expectedCode) {
        return {
          ok: false,
          error: "No active verification code has been issued. Request a verification code first.",
        };
      }
      if (trimmedCode !== expectedCode) {
        return {
          ok: false,
          error: "The verification code does not match the issued code.",
        };
      }

      const updatedUser: UserProfile = { ...authenticatedUser, emailVerified: true };
      const nextCodes = { ...state.verificationCodes };
      delete nextCodes[normalized];

      commitState({
        ...state,
        verificationCodes: nextCodes,
        users: state.users.map((u) => (u.id === authenticatedUser.id ? updatedUser : u)),
        auditLogs: appendAudit(state, {
          actorName: authenticatedUser.fullName,
          actorRole: authenticatedUser.role,
          action: "EMAIL_VERIFIED",
          targetType: "Security",
          targetId: authenticatedUser.id,
          summary: `Simulated email address verification completed for ${authenticatedUser.email}.`,
          severity: "Info",
        }),
      });
      return { ok: true, data: updatedUser };
    },

    async requestPasswordReset(email: string) {
      const state = ensureState();
      const normalized = email.trim().toLowerCase();
      const target = state.users.find((u) => u.email.toLowerCase() === normalized);
      if (!target) {
        return { ok: false, error: "No registered account was found with that email address." };
      }
      const resetToken = generateRecoveryToken();
      commitState({
        ...state,
        resetTokens: { ...state.resetTokens, [normalized]: resetToken },
        auditLogs: appendAudit(state, {
          actorName: target.fullName,
          actorRole: target.role,
          action: "PASSWORD_RESET_REQUESTED",
          targetType: "Security",
          targetId: target.id,
          summary: `Simulated password recovery token issued for ${target.email}.`,
          severity: "Review",
        }),
      });
      return { ok: true, data: { resetToken } };
    },

    async resetPassword(email: string, token: string, newPassword: string) {
      const state = ensureState();
      const normalized = email.trim().toLowerCase();
      const target = state.users.find((u) => u.email.toLowerCase() === normalized);
      if (!target) {
        return { ok: false, error: "Account not found for the specified email." };
      }
      const expectedToken = state.resetTokens[normalized];
      const trimmedToken = token.trim();
      if (!expectedToken) {
        return {
          ok: false,
          error: "No active recovery token exists for this account. Request a recovery token first.",
        };
      }
      if (!trimmedToken || trimmedToken !== expectedToken) {
        return { ok: false, error: "The recovery token does not match the issued code." };
      }
      if (newPassword.length < 8) {
        return { ok: false, error: "New password must be at least 8 characters." };
      }

      const nextTokens = { ...state.resetTokens };
      delete nextTokens[normalized];

      commitState({
        ...state,
        resetTokens: nextTokens,
        users: state.users.map((u) => (u.id === target.id ? { ...u, password: newPassword } : u)),
        notifications: [
          {
            id: generateId("NTF"),
            userId: target.id,
            title: "Password Reset Confirmed",
            message: "Your simulated account password was updated via recovery reset.",
            category: "security",
            createdAt: new Date().toISOString(),
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: target.fullName,
          actorRole: target.role,
          action: "PASSWORD_RESET_COMPLETED",
          targetType: "Security",
          targetId: target.id,
          summary: `Password reset completed for ${target.email}.`,
          severity: "Review",
        }),
      });
      return { ok: true };
    },

    async changePassword(currentPassword: string, newPassword: string) {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser) {
        return { ok: false, error: "You must be signed in to update your password." };
      }
      if (!authenticatedUser.password || currentPassword !== authenticatedUser.password) {
        return { ok: false, error: "Current password is incorrect." };
      }
      if (newPassword.length < 8) {
        return { ok: false, error: "New password must be at least 8 characters long." };
      }
      if (newPassword === currentPassword) {
        return { ok: false, error: "New password must differ from your current password." };
      }

      commitState({
        ...state,
        users: state.users.map((u) =>
          u.id === authenticatedUser.id ? { ...u, password: newPassword } : u,
        ),
        notifications: [
          {
            id: generateId("NTF"),
            userId: authenticatedUser.id,
            title: "Account Password Updated",
            message: "Your SILVER SPOON password was changed in Account Security Settings.",
            category: "security",
            createdAt: new Date().toISOString(),
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: authenticatedUser.fullName,
          actorRole: authenticatedUser.role,
          action: "PASSWORD_CHANGED",
          targetType: "Security",
          targetId: authenticatedUser.id,
          summary: `${authenticatedUser.fullName} updated their account password.`,
          severity: "Review",
        }),
      });
      return { ok: true };
    },

    async requestTwoFactorChallenge(purpose = "security action") {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser) {
        return { ok: false, error: "Sign in to request a simulated 2FA confirmation code." };
      }
      const code = generateNumericCode(6);
      commitState({
        ...state,
        twoFactorCodes: { ...state.twoFactorCodes, [authenticatedUser.id]: code },
        auditLogs: appendAudit(state, {
          actorName: authenticatedUser.fullName,
          actorRole: authenticatedUser.role,
          action: "TWO_FACTOR_CHALLENGE_ISSUED",
          targetType: "Security",
          targetId: authenticatedUser.id,
          summary: `Issued simulated 6-digit 2FA confirmation code for ${purpose}.`,
          severity: "Info",
        }),
      });
      return { ok: true, data: { code } };
    },

    async enableTwoFactor(code: string) {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser) {
        return { ok: false, error: "Sign in to configure two-factor authentication." };
      }
      if (authenticatedUser.twoFactorEnabled) {
        return { ok: false, error: "Simulated two-factor authentication is already enabled." };
      }
      const trimmed = code.trim();
      if (!/^\d{6}$/.test(trimmed)) {
        return { ok: false, error: "Enter the 6-digit simulated confirmation code." };
      }
      const expected = state.twoFactorCodes[authenticatedUser.id];
      if (!expected) {
        return {
          ok: false,
          error: "No active 2FA setup code was issued. Generate a code first.",
        };
      }
      if (trimmed !== expected) {
        return { ok: false, error: "The 2FA confirmation code does not match the issued code." };
      }

      const nextCodes = { ...state.twoFactorCodes };
      delete nextCodes[authenticatedUser.id];

      commitState({
        ...state,
        twoFactorCodes: nextCodes,
        users: state.users.map((u) =>
          u.id === authenticatedUser.id ? { ...u, twoFactorEnabled: true } : u,
        ),
        notifications: [
          {
            id: generateId("NTF"),
            userId: authenticatedUser.id,
            title: "Simulated 2FA Enabled",
            message:
              "Withdrawal requests now require a simulated 6-digit confirmation code before submission.",
            category: "security",
            createdAt: new Date().toISOString(),
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: authenticatedUser.fullName,
          actorRole: authenticatedUser.role,
          action: "TWO_FACTOR_ENABLED",
          targetType: "Security",
          targetId: authenticatedUser.id,
          summary: `Enabled simulated 2FA withdrawal confirmation for ${authenticatedUser.email}.`,
          severity: "Review",
        }),
      });
      return { ok: true };
    },

    async disableTwoFactor(currentPassword: string) {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser) {
        return { ok: false, error: "Sign in to update two-factor authentication." };
      }
      if (!authenticatedUser.twoFactorEnabled) {
        return { ok: false, error: "Simulated two-factor authentication is already disabled." };
      }
      if (
        !authenticatedUser.password ||
        !currentPassword.trim() ||
        currentPassword !== authenticatedUser.password
      ) {
        return {
          ok: false,
          error: "Current password is incorrect. Password confirmation is required to disable 2FA.",
        };
      }

      const nextCodes = { ...state.twoFactorCodes };
      delete nextCodes[authenticatedUser.id];

      commitState({
        ...state,
        twoFactorCodes: nextCodes,
        users: state.users.map((u) =>
          u.id === authenticatedUser.id ? { ...u, twoFactorEnabled: false } : u,
        ),
        notifications: [
          {
            id: generateId("NTF"),
            userId: authenticatedUser.id,
            title: "Simulated 2FA Disabled",
            message:
              "Simulated two-factor withdrawal confirmation was turned off in Account Settings.",
            category: "security",
            createdAt: new Date().toISOString(),
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: authenticatedUser.fullName,
          actorRole: authenticatedUser.role,
          action: "TWO_FACTOR_DISABLED",
          targetType: "Security",
          targetId: authenticatedUser.id,
          summary: `Disabled simulated 2FA safeguard for ${authenticatedUser.email}.`,
          severity: "Review",
        }),
      });
      return { ok: true };
    },

    // ── Investor Financial, Profile, KYC & Notification Operations ──

    async createDeposit(input: DepositInput) {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser || authenticatedUser.role !== "investor") {
        return { ok: false, error: "Sign in with an investor account to initiate deposits." };
      }
      const investor = authenticatedUser;
      if (investor.status === "Suspended") {
        return {
          ok: false,
          error: "This account is suspended and cannot initiate deposits. Contact compliance support.",
        };
      }
      const validation = validateDeposit(input, state.settings, investor);
      if (!validation.ok) return { ok: false, error: validation.error };

      const autoApprove = input.amount <= state.settings.autoApproveDepositsUnder;
      const status: TransactionStatus = autoApprove ? "Completed" : "Pending";

      const txn = buildTransactionRecord({
        user: investor,
        type: "Deposit",
        amount: input.amount,
        status,
        channel: input.channel,
        note:
          input.note?.trim() ||
          (autoApprove
            ? "Simulated instant credit under auto-approval threshold"
            : "Queued for treasury confirmation in Admin Console"),
        reviewedBy: autoApprove ? "Auto-Settlement Engine" : undefined,
      });

      commitState({
        ...state,
        transactions: [txn, ...state.transactions],
        notifications: [
          {
            id: generateId("NTF"),
            userId: investor.id,
            title: autoApprove ? "Simulated Deposit Credited" : "Deposit Submitted for Review",
            message: autoApprove
              ? `${formatNaira(input.amount)} via ${input.channel} has been credited to your available balance.`
              : `${formatNaira(input.amount)} via ${input.channel} is pending treasury confirmation.`,
            category: "deposit",
            createdAt: txn.createdAt,
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: investor.fullName,
          actorRole: "investor",
          action: autoApprove ? "DEPOSIT_COMPLETED" : "DEPOSIT_SUBMITTED",
          targetType: "Deposit",
          targetId: txn.id,
          summary: `Simulated deposit of ${formatNaira(input.amount)} via ${input.channel} (${status}).`,
          severity: autoApprove ? "Info" : "Review",
        }),
      });

      return { ok: true, data: txn };
    },

    async requestWithdrawal(input: WithdrawalInput) {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser || authenticatedUser.role !== "investor") {
        return { ok: false, error: "Sign in with an investor account to request withdrawals." };
      }
      const investor = authenticatedUser;
      if (investor.status === "Suspended") {
        return {
          ok: false,
          error:
            "This account is suspended and cannot request withdrawals. Contact compliance support.",
        };
      }
      const isolated = selectIsolatedAccountView(state, investor.id);
      const validation = validateWithdrawal(
        input,
        isolated.wallet.availableBalance,
        investor,
        state.settings,
        isolated.transactions,
      );
      if (!validation.ok) return { ok: false, error: validation.error };

      if (investor.twoFactorEnabled) {
        const expectedCode = state.twoFactorCodes[investor.id];
        const submittedCode = input.twoFactorCode?.trim() ?? "";
        if (!expectedCode) {
          return {
            ok: false,
            error:
              "Simulated 2FA confirmation is enabled on this account. Request and enter a 6-digit confirmation code to continue.",
          };
        }
        if (submittedCode !== expectedCode) {
          return {
            ok: false,
            error:
              "Invalid simulated 2FA confirmation code. Check the issued 6-digit code and try again.",
          };
        }
      }

      const fee = validation.data?.fee ?? 0;
      const channel = `${investor.bankAccount.bankName} ${maskAccountNumber(investor.bankAccount.accountNumber)}`;
      const txn = buildTransactionRecord({
        user: investor,
        type: "Withdrawal",
        amount: input.amount,
        fee,
        status: "Pending",
        channel,
        note: input.note?.trim() || "Simulated payout request awaiting treasury review",
      });

      const nextTwoFactorCodes = { ...state.twoFactorCodes };
      if (investor.twoFactorEnabled) {
        delete nextTwoFactorCodes[investor.id];
      }

      commitState({
        ...state,
        twoFactorCodes: nextTwoFactorCodes,
        transactions: [txn, ...state.transactions],
        notifications: [
          {
            id: generateId("NTF"),
            userId: investor.id,
            title: "Withdrawal Request Submitted",
            message: `Your withdrawal request of ${formatNaira(input.amount)} to ${channel} is pending review.`,
            category: "withdrawal",
            createdAt: txn.createdAt,
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: investor.fullName,
          actorRole: "investor",
          action: "WITHDRAWAL_REQUESTED",
          targetType: "Withdrawal",
          targetId: txn.id,
          summary: `Requested withdrawal of ${formatNaira(input.amount)} to ${channel}${investor.twoFactorEnabled ? " (confirmed via simulated 2FA)" : ""}.`,
          severity: "Review",
        }),
      });

      return { ok: true, data: txn };
    },

    async subscribeInvestment(input: SubscribeInvestmentInput) {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser || authenticatedUser.role !== "investor") {
        return { ok: false, error: "Sign in with an investor account to allocate investments." };
      }
      const investor = authenticatedUser;
      if (investor.status === "Suspended") {
        return {
          ok: false,
          error:
            "This account is suspended and cannot subscribe to investment mandates. Contact compliance support.",
        };
      }
      const isolated = selectIsolatedAccountView(state, investor.id);
      const plan = state.plans.find((p) => p.id === input.planId);
      const validation = validateInvestmentSubscription(
        input,
        plan,
        isolated.wallet.availableBalance,
        investor,
      );
      if (!validation.ok || !plan) return { ok: false, error: validation.error };

      const investment = buildInvestmentRecord(investor, plan, input.amount, input.autoCompound);
      const txn = buildTransactionRecord({
        user: investor,
        type: "Investment",
        amount: input.amount,
        status: "Completed",
        channel: plan.name,
        note: `Allocated for ${plan.durationDays} days (target ${plan.targetReturnPercent}%, illustrative & non-guaranteed)`,
        reviewedBy: "Portfolio Allocation Desk",
      });

      const pendingReferral = state.referrals.find(
        (r) =>
          r.referredUserId === investor.id &&
          r.status === "Pending" &&
          !r.qualifyingInvestmentId &&
          !r.payoutTxnId,
      );

      let nextReferrals = state.referrals;
      let extraTxns: TransactionRecord[] = [];
      let extraNotifs: NotificationItem[] = [];
      let nextAudit = appendAudit(state, {
        actorName: investor.fullName,
        actorRole: "investor",
        action: "INVESTMENT_ALLOCATED",
        targetType: "Investment",
        targetId: investment.id,
        summary: `Subscribed ${formatNaira(input.amount)} to ${plan.name}.`,
        severity: "Info",
      });

      if (pendingReferral) {
        const referrer = state.users.find((u) => u.id === pendingReferral.referrerId);
        const commissionEarned = Math.round(
          (input.amount * pendingReferral.commissionRatePercent) / 100,
        );

        if (referrer && commissionEarned > 0) {
          const commissionTxn = buildTransactionRecord({
            user: referrer,
            type: "Referral Commission",
            amount: commissionEarned,
            status: "Completed",
            channel: `Referral Program (${pendingReferral.commissionRatePercent}%)`,
            note: `Simulated qualifying commission for ${investor.fullName} (${investment.id})`,
            reviewedBy: "Referral Settlement Engine",
          });

          nextReferrals = state.referrals.map((r) =>
            r.id === pendingReferral.id
              ? {
                  ...r,
                  qualifyingInvestment: input.amount,
                  qualifyingInvestmentId: investment.id,
                  qualifiedAt: investment.startedAt,
                  payoutTxnId: commissionTxn.id,
                  commissionEarned,
                  status: "Paid",
                }
              : r,
          );

          extraTxns = [commissionTxn];
          extraNotifs = [
            {
              id: generateId("NTF"),
              userId: referrer.id,
              title: "Referral Commission Credited",
              message: `${investor.fullName} completed a qualifying allocation of ${formatNaira(input.amount)}. ${formatNaira(commissionEarned)} (${pendingReferral.commissionRatePercent}%) has been credited to your wallet.`,
              category: "referral",
              createdAt: investment.startedAt,
              readByUserIds: [],
            },
          ];

          nextAudit = [
            {
              id: generateId("AUD"),
              timestamp: new Date().toISOString(),
              ipAddress: "102.89.34.18",
              actorName: "Referral Settlement Engine",
              actorRole: "system",
              action: "REFERRAL_QUALIFIED_AND_CREDITED",
              targetType: "Referral",
              targetId: pendingReferral.id,
              summary: `Qualified referral ${pendingReferral.id} from ${investment.id}; credited ${formatNaira(commissionEarned)} to ${referrer.fullName}.`,
              severity: "Info",
            },
            ...nextAudit,
          ];
        }
      }

      commitState({
        ...state,
        investments: [investment, ...state.investments],
        transactions: [txn, ...extraTxns, ...state.transactions],
        referrals: nextReferrals,
        notifications: [
          {
            id: generateId("NTF"),
            userId: investor.id,
            title: "Investment Mandate Activated",
            message: `Allocated ${formatNaira(input.amount)} into ${plan.name} (${plan.durationDays} days).`,
            category: "investment",
            createdAt: investment.startedAt,
            readByUserIds: [],
          },
          ...extraNotifs,
          ...state.notifications,
        ],
        auditLogs: nextAudit,
      });

      return { ok: true, data: investment };
    },

    async toggleInvestmentAutoCompound(investmentId: string) {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser) {
        return { ok: false, error: "Sign in required." };
      }
      const target = state.investments.find(
        (i) => i.id === investmentId && i.userId === authenticatedUser.id,
      );
      if (!target) {
        return { ok: false, error: "Investment mandate not found." };
      }
      if (target.status !== "Active") {
        return {
          ok: false,
          error: "Auto-compound preference can only be changed on active mandates.",
        };
      }
      const updated: InvestmentRecord = { ...target, autoCompound: !target.autoCompound };
      commitState({
        ...state,
        investments: state.investments.map((i) => (i.id === investmentId ? updated : i)),
        auditLogs: appendAudit(state, {
          actorName: authenticatedUser.fullName,
          actorRole: "investor",
          action: "INVESTMENT_AUTOCOMPOUND_UPDATED",
          targetType: "Investment",
          targetId: investmentId,
          summary: `Set auto-compound preference on ${target.planName} (${investmentId}) to ${updated.autoCompound ? "Enabled" : "Disabled"}.`,
          severity: "Info",
        }),
      });
      return { ok: true, data: updated };
    },

    async updateProfile(updates) {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser) return { ok: false, error: "Not authenticated." };
      if ("twoFactorEnabled" in updates) {
        return {
          ok: false,
          error: "Use the Two-Factor Authentication enrollment or disable flow to change 2FA settings.",
        };
      }
      commitState({
        ...state,
        users: state.users.map((u) => (u.id === authenticatedUser.id ? { ...u, ...updates } : u)),
      });
      return { ok: true };
    },

    async updateBankAccount(bank: BankAccountDetails) {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser) return { ok: false, error: "Not authenticated." };
      const validation = validateBankAccountDetails(bank, authenticatedUser);
      if (!validation.ok) return { ok: false, error: validation.error };

      const now = new Date().toISOString();
      const sanitizedBank: BankAccountDetails = {
        bankCode: bank.bankCode.trim(),
        bankName: bank.bankName.trim(),
        accountNumber: bank.accountNumber.trim(),
        accountName: bank.accountName.trim().toUpperCase(),
        verified: false,
        verificationStatus: "Pending Verification",
        updatedAt: now,
      };

      commitState({
        ...state,
        users: state.users.map((u) =>
          u.id === authenticatedUser.id ? { ...u, bankAccount: sanitizedBank } : u,
        ),
        notifications: [
          {
            id: generateId("NTF"),
            userId: authenticatedUser.id,
            title: "Settlement Bank Account Saved",
            message: `Saved ${sanitizedBank.bankName} (${maskAccountNumber(sanitizedBank.accountNumber)}). Live NIBSS name-enquiry verification is pending backend integration.`,
            category: "security",
            createdAt: now,
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: authenticatedUser.fullName,
          actorRole: authenticatedUser.role,
          action: "BANK_ACCOUNT_UPDATED",
          targetType: "User",
          targetId: authenticatedUser.id,
          summary: `Saved settlement NUBAN account (${sanitizedBank.bankName} ${maskAccountNumber(sanitizedBank.accountNumber)}) — status set to Pending Verification.`,
          severity: "Review",
        }),
      });
      return { ok: true };
    },

    async submitKycApplication(input: KycSubmissionInput) {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser || authenticatedUser.role !== "investor") {
        return { ok: false, error: "Sign in with an investor account to submit KYC documents." };
      }
      const validation = validateKycSubmission(input, authenticatedUser, state.kycSubmissions);
      if (!validation.ok) return { ok: false, error: validation.error };

      const now = new Date().toISOString();
      const record: KycSubmissionRecord = {
        id: generateId("KYC"),
        userId: authenticatedUser.id,
        targetTier: input.targetTier,
        idType: input.idType,
        idNumberLast4: input.idNumber.trim().slice(-4),
        bvnLast4: input.bvn.trim().slice(-4),
        dateOfBirth: input.dateOfBirth,
        residentialAddress: input.residentialAddress.trim(),
        idDocumentName: input.idDocumentName.trim(),
        proofOfAddressName: input.proofOfAddressName?.trim() || undefined,
        submittedAt: now,
        status: "Under Review",
      };

      const nextAccountStatus: AccountStatus =
        authenticatedUser.kycLevel === "Tier 1" ? "Pending KYC" : authenticatedUser.status;
      const submissionSummary = `Simulated ${input.targetTier} KYC package submitted (${input.idType} ••••${record.idNumberLast4}, BVN ••••${record.bvnLast4}) — awaiting compliance review in Admin Console.`;

      commitState({
        ...state,
        kycSubmissions: [record, ...state.kycSubmissions],
        users: state.users.map((u) =>
          u.id === authenticatedUser.id
            ? {
                ...u,
                address: input.residentialAddress.trim(),
                status: nextAccountStatus,
                kycNote: submissionSummary,
                kycUpdatedAt: now,
              }
            : u,
        ),
        notifications: [
          {
            id: generateId("NTF"),
            userId: authenticatedUser.id,
            title: `KYC Submission Received (${input.targetTier})`,
            message: `Your simulated ${input.targetTier} compliance application (${record.id}) has been queued for review.`,
            category: "security",
            createdAt: now,
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: authenticatedUser.fullName,
          actorRole: "investor",
          action: "KYC_SUBMISSION_RECEIVED",
          targetType: "User",
          targetId: authenticatedUser.id,
          summary: `Submitted simulated ${input.targetTier} KYC application (${record.id}) with ${input.idType} and BVN ending ${record.bvnLast4}.`,
          severity: "Review",
        }),
      });

      return { ok: true, data: record };
    },

    async markNotificationRead(id: string) {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser) return;
      commitState({
        ...state,
        notifications: markNotificationReadForUser(state.notifications, id, authenticatedUser.id),
      });
    },

    async markAllNotificationsRead() {
      const state = ensureState();
      const authenticatedUser = getAuthenticatedUser(state);
      if (!authenticatedUser) return;
      commitState({
        ...state,
        notifications: markAllNotificationsReadForUser(state.notifications, authenticatedUser.id),
      });
    },

    // ── Administrator, Finance & Compliance Operations ──

    async adminReviewTransaction(txnId: string, status: TransactionStatus, note?: string) {
      const state = ensureState();
      const actor = requireAdminActor(state);
      if (!actor) return { ok: false, error: "Administrator role required." };
      const target = state.transactions.find((t) => t.id === txnId);
      if (!target) return { ok: false, error: "Transaction record not found." };
      if (target.status !== "Pending") {
        return { ok: false, error: "This transaction has already been reviewed." };
      }

      const reviewNote = note?.trim() || target.note;

      commitState({
        ...state,
        transactions: state.transactions.map((t) =>
          t.id === txnId
            ? {
                ...t,
                status,
                note: reviewNote,
                reviewedAt: new Date().toISOString(),
                reviewedBy: actor.fullName,
              }
            : t,
        ),
        notifications: [
          {
            id: generateId("NTF"),
            userId: target.userId,
            title: `${target.type} ${status}`,
            message: `Your ${target.type.toLowerCase()} of ${formatNaira(target.amount)} (${target.reference}) was marked ${status.toLowerCase()}.${reviewNote ? ` Note: ${reviewNote}` : ""}`,
            category: target.type === "Deposit" ? "deposit" : "withdrawal",
            createdAt: new Date().toISOString(),
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: actor.fullName,
          actorRole: "admin",
          action: `${target.type.toUpperCase()}_${status.toUpperCase()}`,
          targetType: target.type === "Deposit" ? "Deposit" : "Withdrawal",
          targetId: target.id,
          summary: `Marked ${target.type} ${target.reference} (${formatNaira(target.amount)}) as ${status}.${reviewNote ? ` Reason: ${reviewNote}` : ""}`,
          severity: status === "Declined" ? "Critical" : "Info",
        }),
      });
      return { ok: true };
    },

    async adminMatureInvestment(investmentId: string) {
      const state = ensureState();
      const admin = requireAdminActor(state);
      if (!admin) return { ok: false, error: "Administrator role required." };
      const inv = state.investments.find((i) => i.id === investmentId);
      if (!inv) return { ok: false, error: "Investment not found." };

      const investor = state.users.find((u) => u.id === inv.userId);
      const plan = state.plans.find((p) => p.id === inv.planId);

      const bundleResult = buildMaturitySettlementBundle({
        investment: inv,
        plan,
        investor,
        adminName: admin.fullName,
        existingTransactions: state.transactions,
      });
      if (!bundleResult.ok || !bundleResult.data || !investor) {
        return { ok: false, error: bundleResult.error ?? "Unable to settle investment." };
      }

      const {
        maturedInvestment,
        realizedReturn,
        payoutTransaction,
        rolloverInvestment,
        rolloverTransaction,
        rolloverSkippedReason,
      } = bundleResult.data;

      const notifMessage = rolloverInvestment
        ? `${inv.planName} (${inv.id}) matured with ${formatNaira(realizedReturn)} realized return. Auto-compound rolled over ${formatNaira(rolloverInvestment.principal)} into new Cycle #${rolloverInvestment.rolloverCycle ?? 2} (${rolloverInvestment.id}).`
        : rolloverSkippedReason && inv.autoCompound
          ? `${inv.planName} (${inv.id}) matured. Principal (${formatNaira(inv.principal)}) and realized return (${formatNaira(realizedReturn)}) were credited to Available Balance because auto-compound could not run: ${rolloverSkippedReason}`
          : `${inv.planName} (${inv.id}) matured. Principal of ${formatNaira(inv.principal)} returned to available balance with ${formatNaira(realizedReturn)} realized return.`;

      commitState({
        ...state,
        investments: [
          ...(rolloverInvestment ? [rolloverInvestment] : []),
          ...state.investments.map((i) => (i.id === investmentId ? maturedInvestment : i)),
        ],
        transactions: [
          ...(rolloverTransaction ? [rolloverTransaction] : []),
          payoutTransaction,
          ...state.transactions,
        ],
        notifications: [
          {
            id: generateId("NTF"),
            userId: investor.id,
            title: rolloverInvestment
              ? "Investment Matured & Auto-Compounded"
              : "Investment Mandate Matured",
            message: notifMessage,
            category: "investment",
            createdAt: maturedInvestment.settledAt ?? new Date().toISOString(),
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: admin.fullName,
          actorRole: "admin",
          action: rolloverInvestment ? "INVESTMENT_MATURED_AND_ROLLED_OVER" : "INVESTMENT_MATURED",
          targetType: "Investment",
          targetId: inv.id,
          summary: rolloverInvestment
            ? `Matured ${inv.id} for ${inv.userName} (+${formatNaira(realizedReturn)}) and auto-compounded ${formatNaira(rolloverInvestment.principal)} into ${rolloverInvestment.id}.`
            : `Matured ${inv.id} for ${inv.userName}; credited ${formatNaira(realizedReturn)} realized return to available balance.${rolloverSkippedReason && inv.autoCompound ? ` Rollover skipped: ${rolloverSkippedReason}` : ""}`,
          severity: "Info",
        }),
      });

      return {
        ok: true,
        data: {
          realizedReturn,
          rolledOverInvestmentId: rolloverInvestment?.id,
          rolloverPrincipal: rolloverInvestment?.principal,
          rolloverSkippedReason,
        },
      };
    },

    async adminUpdateUserStatus(userId: string, status: AccountStatus) {
      const state = ensureState();
      const admin = requireAdminActor(state);
      if (!admin) return { ok: false, error: "Administrator role required." };
      const target = state.users.find((u) => u.id === userId);
      if (!target) return { ok: false, error: "User not found." };

      commitState({
        ...state,
        users: state.users.map((u) => (u.id === userId ? { ...u, status } : u)),
        auditLogs: appendAudit(state, {
          actorName: admin.fullName,
          actorRole: "admin",
          action: "USER_STATUS_UPDATED",
          targetType: "User",
          targetId: userId,
          summary: `Updated ${target.fullName} account status to ${status}.`,
          severity: status === "Suspended" ? "Critical" : "Info",
        }),
      });
      return { ok: true };
    },

    async adminUpdateUserTier(userId: string, tier: UserProfile["tier"]) {
      const state = ensureState();
      const admin = requireAdminActor(state);
      if (!admin) return { ok: false, error: "Administrator role required." };
      const target = state.users.find((u) => u.id === userId);
      if (!target) return { ok: false, error: "User not found." };

      commitState({
        ...state,
        users: state.users.map((u) => (u.id === userId ? { ...u, tier } : u)),
        auditLogs: appendAudit(state, {
          actorName: admin.fullName,
          actorRole: "admin",
          action: "USER_TIER_UPDATED",
          targetType: "User",
          targetId: userId,
          summary: `Changed ${target.fullName} wealth tier to ${tier}.`,
          severity: "Info",
        }),
      });
      return { ok: true };
    },

    async adminReviewUserKyc(userId, decision) {
      const state = ensureState();
      const admin = requireAdminActor(state);
      if (!admin) return { ok: false, error: "Administrator role required." };
      const target = state.users.find((u) => u.id === userId);
      if (!target) return { ok: false, error: "User not found." };

      const now = new Date().toISOString();
      const kycNote =
        decision.note?.trim() ||
        (decision.status === "Active"
          ? `KYC approved at ${decision.kycLevel} by ${admin.fullName} (simulated review).`
          : `KYC status updated to ${decision.status} (${decision.kycLevel}).`);

      const tierRank: Record<UserProfile["kycLevel"], number> = {
        "Tier 1": 1,
        "Tier 2": 2,
        "Tier 3": 3,
      };

      commitState({
        ...state,
        kycSubmissions: state.kycSubmissions.map((sub) => {
          if (sub.userId !== userId || sub.status !== "Under Review") return sub;
          const approved =
            decision.status === "Active" &&
            tierRank[decision.kycLevel] >= tierRank[sub.targetTier];
          return {
            ...sub,
            status: approved ? "Approved" : "Needs Resubmission",
            reviewerNote: kycNote,
            reviewedAt: now,
            reviewedBy: admin.fullName,
          };
        }),
        users: state.users.map((u) =>
          u.id === userId
            ? {
                ...u,
                status: decision.status,
                kycLevel: decision.kycLevel,
                kycNote,
                kycUpdatedAt: now,
              }
            : u,
        ),
        notifications: [
          {
            id: generateId("NTF"),
            userId: target.id,
            title: `KYC Review Update: ${decision.kycLevel}`,
            message: `Your compliance status is now ${decision.status} (${decision.kycLevel}). ${kycNote}`,
            category: "security",
            createdAt: now,
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: admin.fullName,
          actorRole: "admin",
          action: "USER_KYC_REVIEWED",
          targetType: "User",
          targetId: userId,
          summary: `Reviewed KYC for ${target.fullName}: ${decision.status} · ${decision.kycLevel}. ${kycNote}`,
          severity: decision.status === "Active" ? "Info" : "Review",
        }),
      });
      return { ok: true };
    },

    async adminVerifyUserBankAccount(userId: string) {
      const state = ensureState();
      const admin = requireAdminActor(state);
      if (!admin) return { ok: false, error: "Administrator role required." };
      const target = state.users.find((u) => u.id === userId);
      if (!target) return { ok: false, error: "User not found." };
      if (!/^\d{10}$/.test(target.bankAccount.accountNumber)) {
        return { ok: false, error: "Client has not saved a valid 10-digit NUBAN account yet." };
      }

      const now = new Date().toISOString();
      commitState({
        ...state,
        users: state.users.map((u) =>
          u.id === userId
            ? {
                ...u,
                bankAccount: {
                  ...u.bankAccount,
                  verified: true,
                  verificationStatus: "Simulated Verified",
                  updatedAt: now,
                },
              }
            : u,
        ),
        notifications: [
          {
            id: generateId("NTF"),
            userId: target.id,
            title: "Settlement Bank Account Reviewed (Simulated)",
            message: `Your ${target.bankAccount.bankName} account (${maskAccountNumber(target.bankAccount.accountNumber)}) has been marked Simulated Verified by operations.`,
            category: "security",
            createdAt: now,
            readByUserIds: [],
          },
          ...state.notifications,
        ],
        auditLogs: appendAudit(state, {
          actorName: admin.fullName,
          actorRole: "admin",
          action: "BANK_ACCOUNT_SIMULATED_VERIFIED",
          targetType: "User",
          targetId: userId,
          summary: `Marked settlement bank account (${target.bankAccount.bankName} ${maskAccountNumber(target.bankAccount.accountNumber)}) as Simulated Verified.`,
          severity: "Info",
        }),
      });
      return { ok: true };
    },

    async adminCreatePlan(input: CreatePlanInput) {
      const state = ensureState();
      const admin = requireAdminActor(state);
      if (!admin) return { ok: false, error: "Administrator role required." };
      if (!input.name.trim() || input.minAmount <= 0 || input.maxAmount <= input.minAmount) {
        return { ok: false, error: "Provide a valid plan name and min/max Naira range." };
      }
      const newPlan: InvestmentPlan = {
        id: `plan-${input.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString().slice(-3)}`,
        ...input,
        status: "Active",
        allocationFocus: [
          "Nigerian Treasury Securities (55%)",
          "Corporate Fixed Income (35%)",
          "Liquidity Buffer (10%)",
        ],
        perks: [
          `${input.durationDays}-day cycle`,
          `${input.payoutFrequency} distribution`,
          "Monthly ledger reporting",
        ],
      };

      commitState({
        ...state,
        plans: [newPlan, ...state.plans],
        auditLogs: appendAudit(state, {
          actorName: admin.fullName,
          actorRole: "admin",
          action: "PLAN_CREATED",
          targetType: "Plan",
          targetId: newPlan.id,
          summary: `Created investment plan ${newPlan.name} (${newPlan.durationDays}d, ${newPlan.targetReturnPercent}% target).`,
          severity: "Review",
        }),
      });
      return { ok: true, data: newPlan };
    },

    async adminTogglePlanStatus(planId: string, status: InvestmentPlan["status"]) {
      const state = ensureState();
      const admin = requireAdminActor(state);
      if (!admin) return { ok: false, error: "Administrator role required." };
      const plan = state.plans.find((p) => p.id === planId);
      if (!plan) return { ok: false, error: "Plan not found." };

      commitState({
        ...state,
        plans: state.plans.map((p) => (p.id === planId ? { ...p, status } : p)),
        auditLogs: appendAudit(state, {
          actorName: admin.fullName,
          actorRole: "admin",
          action: "PLAN_STATUS_CHANGED",
          targetType: "Plan",
          targetId: planId,
          summary: `Set plan ${plan.name} status to ${status}.`,
          severity: "Review",
        }),
      });
      return { ok: true };
    },

    async adminUpdatePlan(planId: string, updates: Partial<InvestmentPlan>) {
      const state = ensureState();
      const admin = requireAdminActor(state);
      if (!admin) return { ok: false, error: "Administrator role required." };
      const plan = state.plans.find((p) => p.id === planId);
      if (!plan) return { ok: false, error: "Plan not found." };

      const nextMin = updates.minAmount ?? plan.minAmount;
      const nextMax = updates.maxAmount ?? plan.maxAmount;
      if (nextMin <= 0 || nextMax <= nextMin) {
        return { ok: false, error: "Maximum allocation must be greater than minimum allocation." };
      }

      commitState({
        ...state,
        plans: state.plans.map((p) => (p.id === planId ? { ...p, ...updates } : p)),
        auditLogs: appendAudit(state, {
          actorName: admin.fullName,
          actorRole: "admin",
          action: "PLAN_UPDATED",
          targetType: "Plan",
          targetId: planId,
          summary: `Updated parameters for ${updates.name ?? plan.name}.`,
          severity: "Review",
        }),
      });
      return { ok: true };
    },

    async adminSendNotification(payload) {
      const state = ensureState();
      const admin = requireAdminActor(state);
      if (!admin) return { ok: false, error: "Administrator role required." };
      if (!payload.title.trim() || !payload.message.trim()) {
        return { ok: false, error: "Notification title and message are required." };
      }
      const item: NotificationItem = {
        id: generateId("NTF"),
        userId: payload.userId,
        title: payload.title.trim(),
        message: payload.message.trim(),
        category: payload.category as NotificationCategory,
        createdAt: new Date().toISOString(),
        readByUserIds: [],
      };

      commitState({
        ...state,
        notifications: [item, ...state.notifications],
        auditLogs: appendAudit(state, {
          actorName: admin.fullName,
          actorRole: "admin",
          action: "NOTIFICATION_SENT",
          targetType: "Notification",
          targetId: item.id,
          summary: `Dispatched "${item.title}" to ${payload.userId === "ALL" ? "all clients" : payload.userId}.`,
          severity: "Info",
        }),
      });
      return { ok: true };
    },

    async adminUpdateSettings(updates: Partial<PlatformSettings>) {
      const state = ensureState();
      const admin = requireAdminActor(state);
      if (!admin) return { ok: false, error: "Administrator role required." };
      const candidate = { ...state.settings, ...updates };
      const validation = validatePlatformSettings(candidate);
      if (!validation.ok) {
        return { ok: false, error: validation.error };
      }
      commitState({
        ...state,
        settings: { ...state.settings, ...updates },
        auditLogs: appendAudit(state, {
          actorName: admin.fullName,
          actorRole: "admin",
          action: "PLATFORM_SETTINGS_UPDATED",
          targetType: "Settings",
          targetId: "GLOBAL",
          summary: `Updated platform configuration keys: ${Object.keys(updates).join(", ")}.`,
          severity: "Review",
        }),
      });
      return { ok: true };
    },

    async adminMarkReferralPaid(referralId: string) {
      const state = ensureState();
      const admin = requireAdminActor(state);
      if (!admin) return { ok: false, error: "Administrator role required." };
      const ref = state.referrals.find((r) => r.id === referralId);
      if (!ref) return { ok: false, error: "Referral record not found." };
      if (ref.status === "Paid" || ref.payoutTxnId) {
        return { ok: false, error: "Commission has already been settled for this referral." };
      }
      if (ref.qualifyingInvestment <= 0) {
        return {
          ok: false,
          error:
            "Cannot settle commission before the referred client completes a qualifying investment.",
        };
      }

      const referrer = state.users.find((u) => u.id === ref.referrerId);
      const payoutAmount =
        ref.commissionEarned > 0
          ? ref.commissionEarned
          : Math.round((ref.qualifyingInvestment * ref.commissionRatePercent) / 100);

      const commissionTxn = referrer
        ? buildTransactionRecord({
            user: referrer,
            type: "Referral Commission",
            amount: payoutAmount,
            status: "Completed",
            channel: `Referral Program (${ref.commissionRatePercent}%)`,
            note: `Commission settled for ${ref.referredUserName}`,
            reviewedBy: admin.fullName,
          })
        : undefined;

      commitState({
        ...state,
        referrals: state.referrals.map((r) =>
          r.id === referralId
            ? {
                ...r,
                status: "Paid",
                commissionEarned: payoutAmount,
                payoutTxnId: commissionTxn?.id,
              }
            : r,
        ),
        transactions: commissionTxn ? [commissionTxn, ...state.transactions] : state.transactions,
        notifications: referrer
          ? [
              {
                id: generateId("NTF"),
                userId: referrer.id,
                title: "Referral Commission Settled",
                message: `${formatNaira(payoutAmount)} referral commission for ${ref.referredUserName} has been credited to your available balance.`,
                category: "referral",
                createdAt: new Date().toISOString(),
                readByUserIds: [],
              },
              ...state.notifications,
            ]
          : state.notifications,
        auditLogs: appendAudit(state, {
          actorName: admin.fullName,
          actorRole: "admin",
          action: "REFERRAL_COMMISSION_PAID",
          targetType: "Referral",
          targetId: ref.id,
          summary: `Settled ${formatNaira(payoutAmount)} referral commission to ${ref.referrerName}.`,
          severity: "Info",
        }),
      });
      return { ok: true };
    },

    async resetDemoState() {
      clearSnapshot();
    },
  };
}

/**
 * Centralized Mock Data Provider singleton for SILVER SPOON.
 * Supplies clean initial frontend state, one-time legacy storage cleanup,
 * localStorage persistence, and async PlatformServiceContract operations with
 * zero external database credentials or backend network dependencies.
 */
export const mockDataProvider: MockDataProviderContract = createMockDataProvider();

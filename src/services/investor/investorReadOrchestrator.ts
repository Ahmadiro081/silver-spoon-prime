import {
  createMockReadOnlyQueryClient,
  type MockReadOnlyQueryOptions,
} from "@/services/investor/mockInvestorReadAdapter";
import type {
  InvestorAccountStatusView,
  InvestorDepositView,
  InvestorInvestmentView,
  InvestorKycDocumentStatusView,
  InvestorKycStatusView,
  InvestorNotificationView,
  InvestorPlanView,
  InvestorProfileView,
  InvestorReadDataSource,
  InvestorReadError,
  InvestorReadErrorCode,
  InvestorReadOnlyOrchestrator,
  InvestorReadResult,
  InvestorReadSnapshot,
  InvestorTransactionView,
  InvestorWalletSummaryView,
  InvestorWithdrawalView,
} from "@/services/investor/types";
import { mockDataProvider, type MockDataProviderContract } from "@/services/mockDataProvider";
import {
  getSupabasePublicConfig,
  SUPABASE_LIVE_ACTIVATION_ALLOWED,
  type DataProviderId,
} from "@/services/supabase/config";
import type {
  MappedDeposit,
  MappedInvestment,
  MappedInvestmentPlan,
  MappedKycRecord,
  MappedNotification,
  MappedProfile,
  MappedTransaction,
  MappedWalletSummary,
  MappedWithdrawal,
} from "@/services/supabase/mappers/index";
import type { ReadQueryResult, SupabaseReadOnlyQueryContract } from "@/services/supabase/queries";
import { supabaseDataProvider } from "@/services/supabase/supabaseDataProvider";
import { nairaToKobo } from "@/services/supabase/financial";
import { sanitizeRestoredSession } from "@/utils/mockIntegrity";

/**
 * SILVER SPOON — Phase 6.5 Investor Read-Only Data Orchestration Layer
 *
 * Orchestrates investor-facing read-only data retrieval across:
 * - Active Mock provider (`mockInvestorReadAdapter` implementing Phase 6.3's 21-method query contract)
 * - Disconnected Standby Supabase provider (`supabaseDataProvider.readQueries`, zero network calls)
 *
 * Security & Privacy Guarantees:
 * - Never accepts arbitrary caller-supplied `userId`; identity is strictly resolved from active session.
 * - Rejects unauthenticated, expired, suspended, or admin-role callers on investor-scoped reads.
 * - Sanitizes KYC views to strip BVN/NIN values, hashes, vendor references, PEP flags, and compliance notes.
 * - Preserves `SUPABASE_LIVE_ACTIVATION_ALLOWED === false` hard lock.
 */

export interface InvestorReadOrchestratorOptions {
  readonly env?: Record<string, unknown>;
  readonly mockProvider?: MockDataProviderContract;
  readonly now?: () => number;
}

function mapQueryError(code: string, message: string): InvestorReadError {
  switch (code) {
    case "STANDBY_DISCONNECTED":
    case "ACTIVATION_DISABLED":
      return { code: "STANDBY_DISCONNECTED", message, recoverable: false };
    case "UNAUTHENTICATED":
      return { code: "UNAUTHENTICATED", message, recoverable: false };
    case "FORBIDDEN":
      return { code: "FORBIDDEN", message, recoverable: false };
    case "MAPPING_ERROR":
      return { code: "MAPPING_ERROR", message, recoverable: true };
    default:
      return { code: "READ_ERROR", message, recoverable: true };
  }
}

function maskLast4(last4: string | null | undefined): string | null {
  if (!last4 || !last4.trim()) return null;
  const digits = last4.replace(/\D/g, "").slice(-4);
  return digits.length > 0 ? `••••${digits}` : null;
}

function projectProfile(mapped: MappedProfile): InvestorProfileView {
  return {
    investorId: mapped.profile.id,
    fullName: mapped.profile.fullName,
    email: mapped.profile.email,
    phone: mapped.dbMeta.phone,
    city: mapped.dbMeta.city,
    accountStatus: mapped.profile.status,
    dbAccountStatus: mapped.dbMeta.dbStatusCode,
    emailVerified: Boolean(mapped.profile.emailVerified),
    tier: mapped.profile.tier,
    kycLevel: mapped.profile.kycLevel,
    referralCode: mapped.profile.referralCode,
    registeredAt: mapped.dbMeta.createdAt,
    lastLoginAt: mapped.profile.lastLoginAt,
  };
}

function projectAccountStatus(
  profile: MappedProfile,
  wallet: MappedWalletSummary | null,
): InvestorAccountStatusView {
  const walletStatus = wallet?.dbWalletStatus ?? "active";
  const dbStatus = profile.dbMeta.dbStatusCode;
  const isActive = dbStatus === "active" && walletStatus === "active";
  return {
    accountStatus: profile.profile.status,
    dbAccountStatus: dbStatus,
    emailVerified: Boolean(profile.profile.emailVerified),
    walletStatus,
    canTransact: isActive && Boolean(profile.profile.emailVerified),
    canWithdraw: isActive && Boolean(profile.profile.emailVerified) && profile.profile.kycLevel !== "Tier 1",
  };
}

function projectWallet(mapped: MappedWalletSummary): InvestorWalletSummaryView {
  return {
    currency: mapped.currency,
    walletStatus: mapped.dbWalletStatus ?? "frozen",
    availableKobo: mapped.balancesKobo.availableKobo,
    lockedKobo: mapped.balancesKobo.investedPrincipalKobo,
    pendingWithdrawalKobo: mapped.balancesKobo.reservedWithdrawalKobo,
    totalKobo: mapped.balancesKobo.totalCustomerLiabilityKobo,
    realizedEarningsKobo: mapped.balancesKobo.realizedEarningsKobo,
    totalDepositsKobo: nairaToKobo(mapped.metrics.totalDeposits, {
      fieldName: "wallet.totalDeposits",
    }),
    totalWithdrawalsKobo: nairaToKobo(mapped.metrics.totalWithdrawals, {
      fieldName: "wallet.totalWithdrawals",
    }),
    referralEarningsKobo: nairaToKobo(mapped.metrics.referralEarnings, {
      fieldName: "wallet.referralEarnings",
    }),
    projectedAccrualKobo: nairaToKobo(mapped.metrics.projectedAccrual, {
      fieldName: "wallet.projectedAccrual",
    }),
    availableBalance: mapped.metrics.availableBalance,
    lockedBalance: mapped.metrics.activeInvestments,
    pendingWithdrawals: mapped.metrics.pendingWithdrawals,
    totalBalance: mapped.metrics.totalWalletBalance,
    realizedEarnings: mapped.metrics.realizedEarnings,
    totalDeposits: mapped.metrics.totalDeposits,
    totalWithdrawals: mapped.metrics.totalWithdrawals,
    referralEarnings: mapped.metrics.referralEarnings,
    projectedAccrual: mapped.metrics.projectedAccrual,
    reconciledAt: mapped.dbMeta.reconciledAt,
  };
}

function projectTransactions(
  rows: readonly MappedTransaction[],
): readonly InvestorTransactionView[] {
  const result: InvestorTransactionView[] = [];
  for (const row of rows) {
    if (!row.transaction || !row.frontendType) continue;
    result.push({
      id: row.id,
      reference: row.reference,
      type: row.frontendType,
      amountKobo: row.amountsKobo.amountKobo,
      feeKobo: row.amountsKobo.feeKobo,
      amount: row.amountsNaira.amount,
      fee: row.amountsNaira.fee,
      currency: row.currency,
      status: row.frontendStatus,
      channel: row.transaction.channel,
      createdAt: row.dbMeta.createdAt,
      description: row.dbMeta.description || null,
    });
  }
  return result;
}

function projectDeposits(rows: readonly MappedDeposit[]): readonly InvestorDepositView[] {
  return rows.map((row) => ({
    id: row.id,
    reference: row.paystackReference,
    amountKobo: row.settledAmountKobo ?? row.expectedAmountKobo,
    amount: row.settledAmountNaira ?? row.expectedAmountNaira,
    currency: "NGN",
    paymentMethod: row.channelLabel || null,
    status: row.frontendStatus,
    createdAt: row.createdAt,
    confirmedAt: row.settledAt ?? row.serverVerifiedAt,
  }));
}

function projectWithdrawals(rows: readonly MappedWithdrawal[]): readonly InvestorWithdrawalView[] {
  return rows.map((row) => ({
    id: row.id,
    reference: row.payoutIdempotencyRef,
    amountKobo: row.amountKobo,
    feeKobo: row.feeKobo,
    totalReservedKobo: row.totalReservedKobo,
    amount: row.amountNaira,
    fee: row.feeNaira,
    currency: "NGN",
    status: row.frontendStatus,
    requestedAt: row.createdAt,
    processedAt: row.settledAt ?? row.verifiedSettlementAt,
  }));
}

function projectInvestments(rows: readonly MappedInvestment[]): readonly InvestorInvestmentView[] {
  return rows.map((row) => ({
    id: row.investment.id,
    reference: row.dbMeta.positionCode,
    planId: row.investment.planId,
    planName: row.investment.planName,
    principalKobo: row.dbMeta.principalKobo,
    expectedReturnKobo: row.dbMeta.illustrativeProjectedReturnKobo,
    accruedReturnKobo: nairaToKobo(row.investment.accruedReturn, {
      fieldName: "investment.accruedReturn",
    }),
    principal: row.investment.principal,
    expectedReturn: row.investment.projectedReturn,
    accruedReturn: row.investment.accruedReturn,
    targetReturnPercent: row.investment.targetReturnPercent,
    durationDays: row.investment.durationDays,
    riskBand: row.investment.riskBand,
    status: row.investment.status,
    startedAt: row.investment.startedAt,
    maturesAt: row.investment.maturesAt,
    autoCompound: row.investment.autoCompound,
  }));
}

function projectPlans(rows: readonly MappedInvestmentPlan[]): readonly InvestorPlanView[] {
  return rows.map((row) => ({
    id: row.plan.id,
    code: row.plan.code,
    name: row.plan.name,
    category: row.plan.category,
    tagline: row.plan.tagline,
    description: row.plan.description,
    minAmountKobo: row.dbMeta.minAmountKobo,
    maxAmountKobo: row.dbMeta.maxAmountKobo,
    minAmount: row.plan.minAmount,
    maxAmount: row.plan.maxAmount,
    durationDays: row.plan.durationDays,
    targetReturnPercent: row.plan.targetReturnPercent,
    riskBand: row.plan.riskBand,
    payoutFrequency: row.plan.payoutFrequency,
    managementFeePercent: row.plan.managementFeePercent,
    status: row.plan.status,
    featured: Boolean(row.plan.featured),
    allocationFocus: [...row.plan.allocationFocus],
    perks: [...row.plan.perks],
    riskNote: row.plan.riskNote,
  }));
}

function projectNotifications(
  rows: readonly MappedNotification[],
): readonly InvestorNotificationView[] {
  return rows.map((row) => ({
    id: row.notification.id,
    title: row.notification.title,
    message: row.notification.message,
    type: row.notification.category,
    createdAt: row.notification.createdAt,
    read: row.notification.read,
  }));
}

/**
 * Strictly sanitizes KYC records for investor consumption:
 * - Exposes ONLY verification status, target tier, masked last-4 suffixes, and boolean doc presence.
 * - NEVER exposes raw BVN/NIN, salted hashes, vendor refs, PEP/sanctions flags, reviewer IDs, or internal notes.
 */
export function projectSanitizedInvestorKyc(
  profile: MappedProfile,
  records: readonly MappedKycRecord[],
): InvestorKycStatusView {
  const submissions: InvestorKycDocumentStatusView[] = [];
  for (const rec of records) {
    const targetTier: "Tier 2" | "Tier 3" =
      rec.dbMeta.dbTargetTier === "Tier 3" ? "Tier 3" : "Tier 2";
    const hasGovId =
      rec.dbMeta.documents.some((d) => d.documentType === "government_id") ||
      Boolean(rec.submission?.idDocumentName);
    const hasPoa =
      rec.dbMeta.documents.some((d) => d.documentType === "proof_of_address") ||
      Boolean(rec.submission?.proofOfAddressName);

    submissions.push({
      targetTier,
      status: rec.frontendStatus,
      dbStatus: rec.dbMeta.dbStatus,
      submittedAt: rec.dbMeta.submittedAt ?? rec.dbMeta.createdAt,
      verifiedAt: rec.dbMeta.verifiedAt,
      maskedIdLast4: maskLast4(rec.dbMeta.ninLast4),
      maskedBvnLast4: maskLast4(rec.dbMeta.bvnLast4),
      idDocumentSubmitted: hasGovId,
      proofOfAddressSubmitted: hasPoa,
    });
  }

  const latest = submissions[0] ?? null;
  return {
    currentTier: profile.profile.kycLevel,
    dbCurrentTier: profile.dbMeta.dbKycTier,
    verificationStatus: latest ? latest.status : "Not Submitted",
    accountStatus: profile.profile.status,
    submissions,
  };
}

export function createInitialInvestorReadSnapshot(
  provider: DataProviderId | null,
  status: InvestorReadSnapshot["status"] = "idle",
  options?: {
    error?: InvestorReadError | null;
    disconnectedReason?: string | null;
    plans?: readonly InvestorPlanView[];
  },
): InvestorReadSnapshot {
  const plans = options?.plans ?? [];
  return {
    status,
    provider,
    source:
      provider === "mock"
        ? "mock_readonly"
        : provider === "supabase"
          ? "supabase_readonly"
          : "none",
    isLoading: status === "loading",
    isEmpty: status === "empty",
    isDisconnected: status === "disconnected",
    error: options?.error ?? null,
    disconnectedReason: options?.disconnectedReason ?? null,
    lastUpdatedAt: null,
    profile: null,
    accountStatus: null,
    wallet: null,
    transactions: [],
    deposits: [],
    withdrawals: [],
    investments: [],
    plans,
    notifications: [],
    unreadNotificationCount: 0,
    kyc: null,
  };
}

/**
 * Resolves the Phase 6.5 Investor Read-Only Orchestrator for the configured provider.
 *
 * - Default (`mock`): delegates to `createMockReadOnlyQueryClient` over `mockDataProvider`.
 * - Standby (`supabase`): delegates strictly to `supabaseDataProvider.readQueries`
 *   (hard-locked behind `SUPABASE_LIVE_ACTIVATION_ALLOWED === false`, zero network calls).
 */
export function createInvestorReadOrchestrator(
  options: InvestorReadOrchestratorOptions = {},
): InvestorReadOnlyOrchestrator {
  const cfg = getSupabasePublicConfig(options.env);
  if (!cfg.providerValid || !cfg.activeProvider) {
    throw new Error(
      cfg.configError ??
        `Unsupported VITE_DATA_PROVIDER "${cfg.rawRequestedProvider ?? "(unknown)"}".`,
    );
  }

  const providerId: DataProviderId = cfg.activeProvider;
  const standbyMode = providerId === "supabase" || !SUPABASE_LIVE_ACTIVATION_ALLOWED && providerId !== "mock";
  const source: InvestorReadDataSource =
    providerId === "mock" ? "mock_readonly" : "supabase_readonly";
  const now = options.now ?? (() => Date.now());
  const mockProvider = options.mockProvider ?? mockDataProvider;

  const queryClient: SupabaseReadOnlyQueryContract =
    providerId === "mock"
      ? createMockReadOnlyQueryClient({
          dataProvider: mockProvider,
          now,
        } satisfies MockReadOnlyQueryOptions)
      : supabaseDataProvider.readQueries;

  const checkMockSessionPrecondition = (): {
    allowed: boolean;
    errorCode?: InvestorReadErrorCode;
    message?: string;
  } => {
    if (providerId !== "mock") {
      return { allowed: true };
    }
    const state = mockProvider.getState();
    if (!state.session.authenticated || !state.session.userId) {
      return {
        allowed: false,
        errorCode: "UNAUTHENTICATED",
        message: "Sign in to your investor account to view portfolio data.",
      };
    }
    if (typeof state.session.expiresAt === "string" && state.session.expiresAt.trim().length > 0) {
      const expiresAtMs = Date.parse(state.session.expiresAt);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now()) {
        return {
          allowed: false,
          errorCode: "SESSION_EXPIRED",
          message: "Your session has expired. Sign in again to continue.",
        };
      }
    }
    const sanitized = sanitizeRestoredSession(state.session, state.users, now());
    if (!sanitized.authenticated || !sanitized.userId) {
      return {
        allowed: false,
        errorCode: "UNAUTHENTICATED",
        message: "Authenticated investor session could not be verified.",
      };
    }
    const matched = state.users.find((u) => u.id === sanitized.userId);
    if (!matched) {
      return {
        allowed: false,
        errorCode: "UNAUTHENTICATED",
        message: "Authenticated investor account not found.",
      };
    }
    if (matched.role !== "investor") {
      return {
        allowed: false,
        errorCode: "FORBIDDEN",
        message: "Investor read-only datasets are isolated from administrative sessions.",
      };
    }
    return { allowed: true };
  };

  const guardInvestorRead = async <TRaw, TOut>(
    executor: () => Promise<ReadQueryResult<TRaw>>,
    projector: (raw: TRaw) => TOut,
  ): Promise<InvestorReadResult<TOut>> => {
    if (providerId === "supabase" && !SUPABASE_LIVE_ACTIVATION_ALLOWED) {
      const standbyRes = await executor();
      if (!standbyRes.ok) {
        return {
          ok: false,
          error: mapQueryError(standbyRes.code, standbyRes.error),
          source,
        };
      }
    }

    const pre = checkMockSessionPrecondition();
    if (!pre.allowed) {
      return {
        ok: false,
        error: {
          code: pre.errorCode ?? "UNAUTHENTICATED",
          message: pre.message ?? "Authentication required.",
          recoverable: false,
        },
        source,
      };
    }

    const res = await executor();
    if (!res.ok) {
      return {
        ok: false,
        error: mapQueryError(res.code, res.error),
        source,
      };
    }
    try {
      return { ok: true, data: projector(res.data), source };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "MAPPING_ERROR",
          message: err instanceof Error ? err.message : "Failed to project investor data.",
          recoverable: true,
        },
        source,
      };
    }
  };

  return {
    providerId,
    standbyMode,

    getInvestorProfile() {
      return guardInvestorRead(
        () => queryClient.profile.getOwnProfile(),
        (mapped) => (mapped ? projectProfile(mapped) : null),
      );
    },

    async getInvestorAccountStatus(): Promise<InvestorReadResult<InvestorAccountStatusView | null>> {
      const pre = checkMockSessionPrecondition();
      if (!pre.allowed) {
        return {
          ok: false,
          error: {
            code: pre.errorCode ?? "UNAUTHENTICATED",
            message: pre.message ?? "Authentication required.",
            recoverable: false,
          },
          source,
        };
      }
      const [profileRes, walletRes] = await Promise.all([
        queryClient.profile.getOwnProfile(),
        queryClient.wallet.getOwnWalletSummary(),
      ]);
      if (!profileRes.ok) {
        return { ok: false, error: mapQueryError(profileRes.code, profileRes.error), source };
      }
      if (!profileRes.data) {
        return { ok: true, data: null, source };
      }
      return {
        ok: true,
        data: projectAccountStatus(profileRes.data, walletRes.ok ? walletRes.data : null),
        source,
      };
    },

    getWalletSummary() {
      return guardInvestorRead(
        () => queryClient.wallet.getOwnWalletSummary(),
        (mapped) => (mapped ? projectWallet(mapped) : null),
      );
    },

    getTransactionHistory() {
      return guardInvestorRead(
        () => queryClient.transactions.listOwnTransactions(),
        projectTransactions,
      );
    },

    getDepositHistory() {
      return guardInvestorRead(() => queryClient.transactions.listOwnDeposits(), projectDeposits);
    },

    getWithdrawalHistory() {
      return guardInvestorRead(
        () => queryClient.transactions.listOwnWithdrawals(),
        projectWithdrawals,
      );
    },

    getInvestmentPortfolio() {
      return guardInvestorRead(
        () => queryClient.investments.listOwnInvestments(),
        projectInvestments,
      );
    },

    async getAvailableInvestmentPlans(): Promise<InvestorReadResult<readonly InvestorPlanView[]>> {
      const res = await queryClient.plans.listPublicActivePlans();
      if (!res.ok) {
        return { ok: false, error: mapQueryError(res.code, res.error), source };
      }
      return { ok: true, data: projectPlans(res.data), source };
    },

    getNotifications() {
      return guardInvestorRead(
        () => queryClient.notifications.listOwnNotifications(),
        projectNotifications,
      );
    },

    async getKycStatus(): Promise<InvestorReadResult<InvestorKycStatusView | null>> {
      const pre = checkMockSessionPrecondition();
      if (!pre.allowed) {
        return {
          ok: false,
          error: {
            code: pre.errorCode ?? "UNAUTHENTICATED",
            message: pre.message ?? "Authentication required.",
            recoverable: false,
          },
          source,
        };
      }
      const [profileRes, kycRes] = await Promise.all([
        queryClient.profile.getOwnProfile(),
        queryClient.kyc.listOwnKycRecords(),
      ]);
      if (!profileRes.ok) {
        return { ok: false, error: mapQueryError(profileRes.code, profileRes.error), source };
      }
      if (!kycRes.ok) {
        return { ok: false, error: mapQueryError(kycRes.code, kycRes.error), source };
      }
      if (!profileRes.data) {
        return { ok: true, data: null, source };
      }
      return {
        ok: true,
        data: projectSanitizedInvestorKyc(profileRes.data, kycRes.data),
        source,
      };
    },

    async loadInvestorSnapshot(): Promise<InvestorReadSnapshot> {
      const plansRes = await queryClient.plans.listPublicActivePlans();
      const loadedPlans = plansRes.ok ? projectPlans(plansRes.data) : [];

      if (providerId === "supabase") {
        const reason = !plansRes.ok
          ? plansRes.error
          : "Supabase read-only data provider is in disconnected standby mode (Phase 6.5).";
        return createInitialInvestorReadSnapshot(providerId, "disconnected", {
          error: { code: "STANDBY_DISCONNECTED", message: reason, recoverable: false },
          disconnectedReason: reason,
          plans: loadedPlans,
        });
      }

      const pre = checkMockSessionPrecondition();
      if (!pre.allowed) {
        if (pre.errorCode === "SESSION_EXPIRED") {
          return createInitialInvestorReadSnapshot(providerId, "session_expired", {
            error: {
              code: "SESSION_EXPIRED",
              message: pre.message ?? "Your session has expired.",
              recoverable: false,
            },
            plans: loadedPlans,
          });
        }
        return createInitialInvestorReadSnapshot(providerId, "unauthenticated", {
          plans: loadedPlans,
        });
      }

      const [
        profileRes,
        walletRes,
        txnsRes,
        depositsRes,
        withdrawalsRes,
        investmentsRes,
        notificationsRes,
        kycRes,
      ] = await Promise.all([
        queryClient.profile.getOwnProfile(),
        queryClient.wallet.getOwnWalletSummary(),
        queryClient.transactions.listOwnTransactions(),
        queryClient.transactions.listOwnDeposits(),
        queryClient.transactions.listOwnWithdrawals(),
        queryClient.investments.listOwnInvestments(),
        queryClient.notifications.listOwnNotifications(),
        queryClient.kyc.listOwnKycRecords(),
      ]);

      const firstFailure = [
        profileRes,
        walletRes,
        txnsRes,
        depositsRes,
        withdrawalsRes,
        investmentsRes,
        notificationsRes,
        kycRes,
      ].find((r) => !r.ok);

      if (firstFailure && !firstFailure.ok) {
        const mappedError = mapQueryError(firstFailure.code, firstFailure.error);
        const failureStatus =
          mappedError.code === "STANDBY_DISCONNECTED"
            ? "disconnected"
            : mappedError.code === "UNAUTHENTICATED"
              ? "unauthenticated"
              : "error";
        return createInitialInvestorReadSnapshot(providerId, failureStatus, {
          error: mappedError,
          disconnectedReason:
            failureStatus === "disconnected" ? mappedError.message : null,
          plans: loadedPlans,
        });
      }

      const mappedProfile = profileRes.ok ? profileRes.data : null;
      const mappedWallet = walletRes.ok ? walletRes.data : null;
      const transactions = txnsRes.ok ? projectTransactions(txnsRes.data) : [];
      const deposits = depositsRes.ok ? projectDeposits(depositsRes.data) : [];
      const withdrawals = withdrawalsRes.ok ? projectWithdrawals(withdrawalsRes.data) : [];
      const investments = investmentsRes.ok ? projectInvestments(investmentsRes.data) : [];
      const notifications = notificationsRes.ok ? projectNotifications(notificationsRes.data) : [];
      const kyc =
        mappedProfile && kycRes.ok
          ? projectSanitizedInvestorKyc(mappedProfile, kycRes.data)
          : null;

      const walletView = mappedWallet ? projectWallet(mappedWallet) : null;
      const isEmptyAccount =
        transactions.length === 0 &&
        investments.length === 0 &&
        (walletView?.totalKobo ?? 0) === 0;

      return {
        status: isEmptyAccount ? "empty" : "ready",
        provider: providerId,
        source,
        isLoading: false,
        isEmpty: isEmptyAccount,
        isDisconnected: false,
        error: null,
        disconnectedReason: null,
        lastUpdatedAt: new Date(now()).toISOString(),
        profile: mappedProfile ? projectProfile(mappedProfile) : null,
        accountStatus: mappedProfile ? projectAccountStatus(mappedProfile, mappedWallet) : null,
        wallet: walletView,
        transactions,
        deposits,
        withdrawals,
        investments,
        plans: loadedPlans,
        notifications,
        unreadNotificationCount: notifications.filter((n) => !n.read).length,
        kyc,
      };
    },
  };
}

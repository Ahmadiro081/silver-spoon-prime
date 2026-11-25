import type { AdminReadOnlyQueryContract } from "@/services/admin/types";
import {
  createSeedSnapshot,
  type MockDataSnapshot,
  type SnapshotListener,
} from "@/services/mockDataProvider";
import type { PlatformServiceContract } from "@/services/platformService";
import { createStandbyAdminReadOnlyQueryClient } from "@/services/supabase/adminReadStandbyAdapter";
import { getSupabaseClient, type SupabaseClientFactory } from "@/services/supabase/client";
import type { SupabaseActivationGuardState } from "@/services/supabase/config";
import {
  createStandbyReadOnlyQueryClient,
  type SupabaseReadOnlyQueryContract,
} from "@/services/supabase/queries";
import { createStandbyFinancialWriteAdapter } from "@/services/supabase/writeStandbyAdapter";
import type { FinancialWriteStandbyContract } from "@/services/writes/types";
import type { ServiceResult } from "@/types/domain";

/**
 * SILVER SPOON — Disconnected Standby Supabase Data Provider (Phase 6.3)
 *
 * Implements the async `PlatformServiceContract` in strictly disconnected standby
 * mode and attaches the Phase 6.3 client factory, activation guard, and read-only
 * query contract foundation behind the Supabase service boundary.
 *
 * ZERO NETWORK GUARANTEE:
 * - Does NOT import `@supabase/supabase-js`.
 * - Performs ZERO HTTP, WebSocket, or RPC network calls.
 * - Never falls back silently to `mockDataProvider`.
 */

export const SUPABASE_RPC_BINDING_MAP: Record<keyof PlatformServiceContract, string> = {
  login: "supabase.auth.signInWithPassword + profiles/user_roles lookup",
  register: "supabase.auth.signUp + handle_new_user onboarding trigger",
  logout: "supabase.auth.signOut + user_sessions revocation",
  switchRoleDemo: "N/A (disabled in production Supabase mode)",
  requestVerificationCode: "supabase.auth.resend (type: signup)",
  verifyEmail: "supabase.auth.verifyOtp (type: email)",
  requestPasswordReset: "supabase.auth.resetPasswordForEmail",
  resetPassword: "supabase.auth.updateUser (recovery session)",
  changePassword: "supabase.auth.updateUser (re-authenticated session)",
  requestTwoFactorChallenge: "supabase.auth.mfa.challenge",
  enableTwoFactor: "supabase.auth.mfa.enroll + verify",
  disableTwoFactor: "supabase.auth.mfa.unenroll",
  createDeposit:
    "Edge Function: paystack-init-checkout (card/bank transfer only) -> RPC: initialize_deposit",
  requestWithdrawal:
    "RPC: request_withdrawal (reserves available_kobo -> reserved_withdrawal_kobo for scheduled treasury batch)",
  subscribeInvestment:
    "RPC: create_investment (available_kobo -> invested_principal_kobo; default rollover_mode = principal_only)",
  toggleInvestmentAutoCompound:
    "RPC: update_investment_rollover_mode (enforces plan eligibility, active status & explicit consent)",
  updateProfile: "RPC: update_own_profile (non-privileged fields only)",
  updateBankAccount:
    "Edge Function: paystack-resolve-bank -> RPC: request_bank_account_change (four-eyes approval required)",
  submitKycApplication: "RPC: submit_kyc_application (private storage + compliance queue)",
  markNotificationRead: "RPC: mark_notification_read",
  markAllNotificationsRead: "RPC: mark_all_notifications_read",
  adminReviewTransaction:
    "RPC: approve_withdrawal_four_eyes / manual_deposit_review (independent approver required; scheduled treasury settlement)",
  adminMatureInvestment:
    "RPC: mature_investment + distribute_investment_payout (four-eyes approval + configurable tax_rules)",
  adminUpdateUserStatus: "RPC: set_account_status (compliance_officer/super_admin)",
  adminUpdateUserTier: "RPC: set_client_tier (admin/super_admin)",
  adminReviewUserKyc:
    "RPC: submit_kyc_review (compliance_officer/super_admin; vendor-agnostic KYC record)",
  adminVerifyUserBankAccount:
    "RPC: approve_bank_account_change (four-eyes compliance_officer/super_admin)",
  adminCreatePlan: "RPC: create_investment_plan (admin/super_admin)",
  adminTogglePlanStatus:
    "RPC: set_investment_plan_status (admin/super_admin; paused/archived blocks rollover)",
  adminUpdatePlan: "RPC: update_investment_plan (admin/super_admin)",
  adminSendNotification: "RPC: dispatch_platform_notification (admin/super_admin)",
  adminUpdateSettings:
    "RPC: request_treasury_setting_change + approve_admin_action (four-eyes super_admin governance)",
  adminMarkReferralPaid: "RPC: process_referral_commission (four-eyes finance_officer/super_admin)",
  resetDemoState: "N/A (disabled in production Supabase mode)",
};

async function standbyFailure<T = undefined>(
  method: keyof PlatformServiceContract,
): Promise<ServiceResult<T>> {
  return getSupabaseClient().assertNotActivated(`${method} -> ${SUPABASE_RPC_BINDING_MAP[method]}`);
}

export interface SupabaseDataProviderContract extends PlatformServiceContract {
  readonly id: "supabase";
  readonly standbyMode: true;
  readonly rpcBindingMap: Record<keyof PlatformServiceContract, string>;
  readonly readQueries: SupabaseReadOnlyQueryContract;
  readonly adminReadQueries: AdminReadOnlyQueryContract;
  readonly writeStandby: FinancialWriteStandbyContract;
  getActivationGuard: () => SupabaseActivationGuardState;
  getClientFactory: () => SupabaseClientFactory;
  isConfigured: () => boolean;
  getState: () => MockDataSnapshot;
  hydrateState: () => Promise<MockDataSnapshot>;
  subscribe: (listener: SnapshotListener) => () => void;
}

const standbySnapshot: MockDataSnapshot = createSeedSnapshot();
const standbyReadQueries: SupabaseReadOnlyQueryContract = createStandbyReadOnlyQueryClient();
const standbyAdminReadQueries: AdminReadOnlyQueryContract = createStandbyAdminReadOnlyQueryClient();
const standbyWriteAdapter: FinancialWriteStandbyContract = createStandbyFinancialWriteAdapter();

export const supabaseDataProvider: SupabaseDataProviderContract = {
  id: "supabase",
  standbyMode: true,
  rpcBindingMap: SUPABASE_RPC_BINDING_MAP,
  readQueries: standbyReadQueries,
  adminReadQueries: standbyAdminReadQueries,
  writeStandby: standbyWriteAdapter,
  getActivationGuard: () => getSupabaseClient().getActivationGuard(),
  getClientFactory: () => getSupabaseClient().getFactory(),
  isConfigured: () => getSupabaseClient().isConfigured(),

  getState: () => standbySnapshot,
  hydrateState: async () => standbySnapshot,
  subscribe: () => () => {
    // Disconnected standby mode emits no live backend state updates.
  },

  // Authentication & Account Management
  login: () => standbyFailure("login"),
  register: () => standbyFailure("register"),
  logout: async () => {
    getSupabaseClient().assertNotActivated("logout");
  },
  switchRoleDemo: async () => {
    getSupabaseClient().assertNotActivated("switchRoleDemo");
  },
  requestVerificationCode: () => standbyFailure("requestVerificationCode"),
  verifyEmail: () => standbyFailure("verifyEmail"),
  requestPasswordReset: () => standbyFailure("requestPasswordReset"),
  resetPassword: () => standbyFailure("resetPassword"),
  changePassword: () => standbyFailure("changePassword"),
  requestTwoFactorChallenge: () => standbyFailure("requestTwoFactorChallenge"),
  enableTwoFactor: () => standbyFailure("enableTwoFactor"),
  disableTwoFactor: () => standbyFailure("disableTwoFactor"),

  // Investor Financial, Profile, KYC & Notification Operations
  createDeposit: () => standbyFailure("createDeposit"),
  requestWithdrawal: () => standbyFailure("requestWithdrawal"),
  subscribeInvestment: () => standbyFailure("subscribeInvestment"),
  toggleInvestmentAutoCompound: () => standbyFailure("toggleInvestmentAutoCompound"),
  updateProfile: () => standbyFailure("updateProfile"),
  updateBankAccount: () => standbyFailure("updateBankAccount"),
  submitKycApplication: () => standbyFailure("submitKycApplication"),
  markNotificationRead: async () => {
    getSupabaseClient().assertNotActivated("markNotificationRead");
  },
  markAllNotificationsRead: async () => {
    getSupabaseClient().assertNotActivated("markAllNotificationsRead");
  },

  // Administrator, Finance & Compliance Operations
  adminReviewTransaction: () => standbyFailure("adminReviewTransaction"),
  adminMatureInvestment: () => standbyFailure("adminMatureInvestment"),
  adminUpdateUserStatus: () => standbyFailure("adminUpdateUserStatus"),
  adminUpdateUserTier: () => standbyFailure("adminUpdateUserTier"),
  adminReviewUserKyc: () => standbyFailure("adminReviewUserKyc"),
  adminVerifyUserBankAccount: () => standbyFailure("adminVerifyUserBankAccount"),
  adminCreatePlan: () => standbyFailure("adminCreatePlan"),
  adminTogglePlanStatus: () => standbyFailure("adminTogglePlanStatus"),
  adminUpdatePlan: () => standbyFailure("adminUpdatePlan"),
  adminSendNotification: () => standbyFailure("adminSendNotification"),
  adminUpdateSettings: () => standbyFailure("adminUpdateSettings"),
  adminMarkReferralPaid: () => standbyFailure("adminMarkReferralPaid"),
  resetDemoState: async () => {
    getSupabaseClient().assertNotActivated("resetDemoState");
  },
};

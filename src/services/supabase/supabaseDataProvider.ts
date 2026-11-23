import type { PlatformServiceContract } from "@/services/platformService";
import { getSupabaseClient } from "@/services/supabase/client";
import type { ServiceResult } from "@/types/domain";

/**
 * SILVER SPOON — Placeholder Supabase Data Provider (Phase A)
 *
 * Implements `PlatformServiceContract` in standby mode so the future Supabase
 * backend can replace `mockDataProvider` cleanly without refactoring UI pages.
 *
 * TARGET BACKEND BINDING MAP (for Phases C–I after architecture approval):
 * - Auth flows            -> `supabase.auth.*` (signInWithPassword, signUp, verifyOtp, resetPasswordForEmail, updateUser)
 * - Investor mutations    -> PostgreSQL `SECURITY DEFINER` RPCs + Paystack Edge Functions
 * - Admin/Staff mutations -> Authenticated staff JWT invoking role-checked PostgreSQL RPCs
 * - Real-money safeguards -> Integer kobo (`BIGINT`), immutable double-entry ledger, row locks (`FOR UPDATE`)
 */

export const SUPABASE_RPC_BINDING_MAP: Record<keyof PlatformServiceContract, string> = {
  login: "supabase.auth.signInWithPassword + profiles/user_roles lookup",
  register: "supabase.auth.signUp + handle_new_user onboarding trigger",
  logout: "supabase.auth.signOut + user_sessions revocation",
  switchRoleDemo: "N/A (disabled in production Supabase mode)",
  verifyEmail: "supabase.auth.verifyOtp (type: email)",
  requestPasswordReset: "supabase.auth.resetPasswordForEmail",
  resetPassword: "supabase.auth.updateUser (recovery session)",
  changePassword: "supabase.auth.updateUser (re-authenticated session)",
  createDeposit: "Edge Function: paystack-init-checkout (card/bank transfer only) -> RPC: initialize_deposit",
  requestWithdrawal: "RPC: request_withdrawal (reserves available_kobo -> reserved_withdrawal_kobo for scheduled treasury batch)",
  subscribeInvestment: "RPC: create_investment (available_kobo -> invested_principal_kobo; default rollover_mode = principal_only)",
  toggleInvestmentAutoCompound: "RPC: update_investment_rollover_mode (enforces plan eligibility, active status & explicit consent)",
  updateProfile: "RPC: update_own_profile (non-privileged fields only)",
  updateBankAccount: "Edge Function: paystack-resolve-bank -> RPC: request_bank_account_change (four-eyes approval required)",
  markNotificationRead: "RPC: mark_notification_read",
  markAllNotificationsRead: "RPC: mark_all_notifications_read",
  adminReviewTransaction: "RPC: approve_withdrawal_four_eyes / manual_deposit_review (independent approver required; scheduled treasury settlement)",
  adminMatureInvestment: "RPC: mature_investment + distribute_investment_payout (four-eyes approval + configurable tax_rules)",
  adminUpdateUserStatus: "RPC: set_account_status (compliance_officer/super_admin)",
  adminUpdateUserTier: "RPC: set_client_tier (admin/super_admin)",
  adminReviewUserKyc: "RPC: submit_kyc_review (compliance_officer/super_admin; vendor-agnostic KYC record)",
  adminCreatePlan: "RPC: create_investment_plan (admin/super_admin)",
  adminTogglePlanStatus: "RPC: set_investment_plan_status (admin/super_admin; paused/archived blocks rollover)",
  adminUpdatePlan: "RPC: update_investment_plan (admin/super_admin)",
  adminSendNotification: "RPC: dispatch_platform_notification (admin/super_admin)",
  adminUpdateSettings: "RPC: request_treasury_setting_change + approve_admin_action (four-eyes super_admin governance)",
  adminMarkReferralPaid: "RPC: process_referral_commission (four-eyes finance_officer/super_admin)",
  resetDemoState: "N/A (disabled in production Supabase mode)",
};

function standbyFailure<T = undefined>(method: keyof PlatformServiceContract): ServiceResult<T> {
  return getSupabaseClient().assertNotActivated(`${method} -> ${SUPABASE_RPC_BINDING_MAP[method]}`);
}

export interface SupabaseDataProviderContract extends PlatformServiceContract {
  readonly id: "supabase";
  readonly standbyMode: true;
  readonly rpcBindingMap: Record<keyof PlatformServiceContract, string>;
  isConfigured: () => boolean;
}

export const supabaseDataProvider: SupabaseDataProviderContract = {
  id: "supabase",
  standbyMode: true,
  rpcBindingMap: SUPABASE_RPC_BINDING_MAP,
  isConfigured: () => getSupabaseClient().isConfigured(),

  // Authentication & Account Management
  login: () => standbyFailure("login"),
  register: () => standbyFailure("register"),
  logout: () => {
    getSupabaseClient().assertNotActivated("logout");
  },
  switchRoleDemo: () => {
    getSupabaseClient().assertNotActivated("switchRoleDemo");
  },
  verifyEmail: () => standbyFailure("verifyEmail"),
  requestPasswordReset: () => standbyFailure("requestPasswordReset"),
  resetPassword: () => standbyFailure("resetPassword"),
  changePassword: () => standbyFailure("changePassword"),

  // Investor Financial & Profile Actions
  createDeposit: () => standbyFailure("createDeposit"),
  requestWithdrawal: () => standbyFailure("requestWithdrawal"),
  subscribeInvestment: () => standbyFailure("subscribeInvestment"),
  toggleInvestmentAutoCompound: () => standbyFailure("toggleInvestmentAutoCompound"),
  updateProfile: () => standbyFailure("updateProfile"),
  updateBankAccount: () => standbyFailure("updateBankAccount"),
  markNotificationRead: () => {
    getSupabaseClient().assertNotActivated("markNotificationRead");
  },
  markAllNotificationsRead: () => {
    getSupabaseClient().assertNotActivated("markAllNotificationsRead");
  },

  // Administrator, Finance & Compliance Actions
  adminReviewTransaction: () => standbyFailure("adminReviewTransaction"),
  adminMatureInvestment: () => standbyFailure("adminMatureInvestment"),
  adminUpdateUserStatus: () => standbyFailure("adminUpdateUserStatus"),
  adminUpdateUserTier: () => standbyFailure("adminUpdateUserTier"),
  adminReviewUserKyc: () => standbyFailure("adminReviewUserKyc"),
  adminCreatePlan: () => standbyFailure("adminCreatePlan"),
  adminTogglePlanStatus: () => standbyFailure("adminTogglePlanStatus"),
  adminUpdatePlan: () => standbyFailure("adminUpdatePlan"),
  adminSendNotification: () => standbyFailure("adminSendNotification"),
  adminUpdateSettings: () => standbyFailure("adminUpdateSettings"),
  adminMarkReferralPaid: () => standbyFailure("adminMarkReferralPaid"),
  resetDemoState: () => {
    getSupabaseClient().assertNotActivated("resetDemoState");
  },
};

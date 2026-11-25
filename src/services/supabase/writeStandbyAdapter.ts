import { getSupabaseClient } from "@/services/supabase/client";
import { SUPABASE_LIVE_ACTIVATION_ALLOWED } from "@/services/supabase/config";
import type {
  BaseWriteOperationRequest,
  FinancialWriteStandbyContract,
  WriteOperationCategory,
  WriteStandbyResult,
} from "@/services/writes/types";

/**
 * SILVER SPOON — Disconnected Supabase Write-Adapter Standby Implementation (Phase 6.6)
 *
 * ZERO EXECUTION GUARANTEE:
 * - `SUPABASE_LIVE_ACTIVATION_ALLOWED` is hard-locked to `false`.
 * - Performs ZERO network requests, ZERO database writes, ZERO RPC invocations,
 *   ZERO Edge Function calls, ZERO payment operations, and ZERO mock mutations.
 * - Every write operation deterministically returns `STANDBY_NOT_ENABLED`.
 */

export const WRITE_STANDBY_BINDING_MAP = Object.freeze({
  "deposits.initiateDeposit": "Edge Function: paystack-init-checkout -> RPC: initialize_deposit",
  "deposits.confirmDeposit": "Edge Function: paystack-webhook -> RPC: settle_verified_deposit",
  "deposits.reconcileDeposit": "RPC: reconcile_deposit_settlement (finance_officer/super_admin)",
  "withdrawals.submitWithdrawalRequest": "RPC: request_withdrawal",
  "withdrawals.approveWithdrawal": "RPC: approve_withdrawal_four_eyes (distinct approver required)",
  "withdrawals.rejectWithdrawal": "RPC: reject_withdrawal_release_reserve",
  "withdrawals.executeWithdrawal": "RPC: execute_scheduled_withdrawal_batch (four-eyes treasury)",
  "withdrawals.reconcileWithdrawal": "RPC: reconcile_withdrawal_settlement",
  "investments.createInvestment": "RPC: create_investment",
  "investments.matureInvestment": "RPC: mature_investment (four-eyes required)",
  "investments.processMaturity": "RPC: distribute_investment_payout (four-eyes + tax_rules)",
  "investments.applyRolloverInstruction": "RPC: update_investment_rollover_mode",
  "kyc.submitVerification": "RPC: submit_kyc_application (private storage)",
  "kyc.approveVerification": "RPC: submit_kyc_review (compliance_officer/super_admin)",
  "kyc.rejectVerification": "RPC: submit_kyc_review (compliance_officer/super_admin)",
  "kyc.requestAdditionalInformation": "RPC: request_kyc_additional_info",
  "administration.createStaffAccount": "RPC: provision_staff_account (four-eyes super_admin)",
  "administration.changeStaffRole": "RPC: change_staff_role (four-eyes super_admin)",
  "administration.suspendAccount": "RPC: set_account_status (compliance_officer/super_admin)",
  "administration.reactivateAccount": "RPC: reactivate_account (four-eyes super_admin)",
  "administration.updatePermittedPlatformSettings":
    "RPC: request_treasury_setting_change + approve_admin_action (four-eyes super_admin)",
} as const);

async function standbyWriteBlocked<TExpected>(
  category: WriteOperationCategory,
  operationKey: keyof typeof WRITE_STANDBY_BINDING_MAP,
  request: BaseWriteOperationRequest,
): Promise<WriteStandbyResult<TExpected>> {
  const targetBinding = WRITE_STANDBY_BINDING_MAP[operationKey];
  // Assert live activation guard remains disabled; performs zero network calls.
  getSupabaseClient().assertNotActivated(`write_standby:${operationKey}`);

  return {
    ok: false,
    status: "STANDBY_NOT_ENABLED",
    code: "STANDBY_NOT_ENABLED",
    executed: false,
    mutated: false,
    category,
    operation: operationKey,
    provider: "supabase",
    operationReference: request.operationReference || null,
    idempotencyKey: request.idempotencyKey || null,
    auditReference: null,
    error: {
      code: "STANDBY_NOT_ENABLED",
      message: `Write operation "${operationKey}" is in disconnected standby mode and is not enabled in Phase 6.6 (SUPABASE_LIVE_ACTIVATION_ALLOWED=${String(SUPABASE_LIVE_ACTIVATION_ALLOWED)}).`,
      retryable: false,
      targetBinding,
    },
  };
}

/**
 * Creates a strictly disconnected standby implementation of `FinancialWriteStandbyContract`.
 * Every operation resolves cleanly with `STANDBY_NOT_ENABLED` and performs zero side effects.
 */
export function createStandbyFinancialWriteAdapter(): FinancialWriteStandbyContract {
  return {
    mode: "standby_disabled",
    provider: "supabase",
    activationAllowed: SUPABASE_LIVE_ACTIVATION_ALLOWED,

    deposits: {
      initiateDeposit: (req) => standbyWriteBlocked("deposits", "deposits.initiateDeposit", req),
      confirmDeposit: (req) => standbyWriteBlocked("deposits", "deposits.confirmDeposit", req),
      reconcileDeposit: (req) => standbyWriteBlocked("deposits", "deposits.reconcileDeposit", req),
    },

    withdrawals: {
      submitWithdrawalRequest: (req) =>
        standbyWriteBlocked("withdrawals", "withdrawals.submitWithdrawalRequest", req),
      approveWithdrawal: (req) =>
        standbyWriteBlocked("withdrawals", "withdrawals.approveWithdrawal", req),
      rejectWithdrawal: (req) =>
        standbyWriteBlocked("withdrawals", "withdrawals.rejectWithdrawal", req),
      executeWithdrawal: (req) =>
        standbyWriteBlocked("withdrawals", "withdrawals.executeWithdrawal", req),
      reconcileWithdrawal: (req) =>
        standbyWriteBlocked("withdrawals", "withdrawals.reconcileWithdrawal", req),
    },

    investments: {
      createInvestment: (req) =>
        standbyWriteBlocked("investments", "investments.createInvestment", req),
      matureInvestment: (req) =>
        standbyWriteBlocked("investments", "investments.matureInvestment", req),
      processMaturity: (req) =>
        standbyWriteBlocked("investments", "investments.processMaturity", req),
      applyRolloverInstruction: (req) =>
        standbyWriteBlocked("investments", "investments.applyRolloverInstruction", req),
    },

    kyc: {
      submitVerification: (req) => standbyWriteBlocked("kyc", "kyc.submitVerification", req),
      approveVerification: (req) => standbyWriteBlocked("kyc", "kyc.approveVerification", req),
      rejectVerification: (req) => standbyWriteBlocked("kyc", "kyc.rejectVerification", req),
      requestAdditionalInformation: (req) =>
        standbyWriteBlocked("kyc", "kyc.requestAdditionalInformation", req),
    },

    administration: {
      createStaffAccount: (req) =>
        standbyWriteBlocked("administration", "administration.createStaffAccount", req),
      changeStaffRole: (req) =>
        standbyWriteBlocked("administration", "administration.changeStaffRole", req),
      suspendAccount: (req) =>
        standbyWriteBlocked("administration", "administration.suspendAccount", req),
      reactivateAccount: (req) =>
        standbyWriteBlocked("administration", "administration.reactivateAccount", req),
      updatePermittedPlatformSettings: (req) =>
        standbyWriteBlocked("administration", "administration.updatePermittedPlatformSettings", req),
    },
  };
}

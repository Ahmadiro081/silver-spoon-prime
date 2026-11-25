import type { KoboInput } from "@/services/supabase/financial";

/**
 * SILVER SPOON — Authoritative PostgreSQL Row Type Definitions (Phase 6.3)
 *
 * Derived directly from frozen migrations `20261123000100` through `20261123000900`.
 * - Every column name matches the exact SQL schema (snake_case).
 * - Nullable SQL columns are explicitly typed as `T | null`.
 * - `BIGINT` kobo columns use `KoboInput` (`number | bigint | string`) because PostgreSQL
 *   drivers and PostgREST may return 64-bit integers as numbers or numeric strings.
 * - Enum columns accept `string` at the raw row boundary so mappers can safely validate
 *   and handle unknown database enum values at runtime without trusting untyped JSON.
 */

export interface DbAccountStatusRow {
  code: string;
  label: string;
  can_login: boolean;
  can_transact: boolean;
  can_withdraw: boolean;
  description: string;
  created_at: string;
}

export interface DbProfileRow {
  id: string;
  client_code: string;
  email: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  status_code: string;
  tier: string;
  investor_classification: string;
  kyc_tier: string;
  referral_code: string;
  email_verified_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbUserRoleRow {
  id: string;
  user_id: string;
  role: string;
  granted_by: string | null;
  granted_action_id: string | null;
  granted_at: string;
  revoked_by: string | null;
  revoked_action_id: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
}

export interface DbWalletRow {
  id: string;
  user_id: string;
  currency: string;
  status: string;
  available_account_id: string;
  reserved_account_id: string;
  invested_account_id: string;
  frozen_reason: string | null;
  frozen_by: string | null;
  frozen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbWalletAccountRow {
  id: string;
  wallet_id: string;
  user_id: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  account_purpose: string;
  is_primary: boolean;
  verification_status: string;
  change_approval_action_id: string | null;
  verified_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbWalletBalanceRow {
  wallet_id: string;
  user_id: string;
  currency: string;
  available_kobo: KoboInput;
  reserved_withdrawal_kobo: KoboInput;
  invested_principal_kobo: KoboInput;
  pending_deposit_kobo: KoboInput;
  realized_earnings_kobo: KoboInput;
  total_customer_liability_kobo: KoboInput;
  last_journal_entry_id: string | null;
  reconciled_at: string;
  updated_at: string;
}

export interface DbTransactionRow {
  id: string;
  reference: string;
  idempotency_key: string;
  user_id: string;
  wallet_id: string;
  transaction_type: string;
  status: string;
  amount_kobo: KoboInput;
  fee_kobo: KoboInput;
  tax_kobo: KoboInput;
  net_amount_kobo: KoboInput;
  currency: string;
  description: string;
  primary_journal_entry_id: string | null;
  reversal_journal_entry_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DbDepositRow {
  id: string;
  transaction_id: string;
  user_id: string;
  wallet_id: string;
  channel: string;
  expected_amount_kobo: KoboInput;
  settled_amount_kobo: KoboInput | null;
  paystack_reference: string;
  status: string;
  server_verified_at: string | null;
  server_verification_ref: string | null;
  settlement_journal_entry_id: string | null;
  settled_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbWithdrawalRow {
  id: string;
  transaction_id: string;
  user_id: string;
  wallet_id: string;
  wallet_account_id: string;
  withdrawal_batch_id: string | null;
  amount_kobo: KoboInput;
  fee_kobo: KoboInput;
  total_reserved_kobo: KoboInput;
  payout_idempotency_ref: string;
  status: string;
  initiated_by: string;
  approved_by: string | null;
  four_eyes_action_id: string | null;
  reserve_journal_entry_id: string;
  settlement_journal_entry_id: string | null;
  release_journal_entry_id: string | null;
  provider_transfer_ref: string | null;
  verified_settlement_at: string | null;
  settled_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbInvestmentPlanRow {
  id: string;
  plan_code: string;
  slug: string;
  name: string;
  instrument_type: string;
  risk_band: string;
  tenor_days: number;
  min_amount_kobo: KoboInput;
  max_amount_kobo: KoboInput | null;
  illustrative_target_return_bps: number;
  allows_return_compounding: boolean;
  status: string;
  terms_version: string;
  summary: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbInvestmentRow {
  id: string;
  position_code: string;
  user_id: string;
  wallet_id: string;
  plan_id: string;
  subscription_transaction_id: string;
  subscription_journal_entry_id: string;
  principal_kobo: KoboInput;
  illustrative_projected_return_kobo: KoboInput;
  status: string;
  rollover_mode: string;
  return_compounding_consented_at: string | null;
  return_compounding_consent_version: string | null;
  parent_investment_id: string | null;
  started_at: string;
  matures_at: string;
  matured_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbInvestmentPayoutRow {
  id: string;
  investment_id: string;
  user_id: string;
  payout_sequence: number;
  transaction_id: string;
  gross_amount_kobo: KoboInput;
  fee_kobo: KoboInput;
  total_tax_kobo: KoboInput;
  net_amount_kobo: KoboInput;
  treasury_funding_reference: string;
  four_eyes_action_id: string;
  journal_entry_id: string;
  distributed_at: string;
}

export interface DbInvestmentMaturityRow {
  id: string;
  investment_id: string;
  user_id: string;
  maturity_transaction_id: string;
  maturity_journal_entry_id: string;
  principal_kobo: KoboInput;
  net_return_kobo: KoboInput;
  requested_rollover_mode: string;
  applied_rollover_mode: string;
  maturity_disposition: string;
  child_investment_id: string | null;
  processed_by: string;
  processed_at: string;
  notes: string | null;
}

export interface DbNotificationRow {
  id: string;
  user_id: string;
  category: string;
  title: string;
  body: string;
  is_read: boolean;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DbNotificationPreferenceRow {
  user_id: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  security_alerts_enabled: boolean;
  marketing_opt_in: boolean;
  updated_at: string;
}

export interface DbKycRecordRow {
  id: string;
  user_id: string;
  target_tier: string;
  status: string;
  vendor_code: string | null;
  vendor_reference: string | null;
  bvn_hash: string | null;
  bvn_last4: string | null;
  nin_hash: string | null;
  nin_last4: string | null;
  liveness_status: string;
  pep_sanctions_status: string;
  submitted_at: string | null;
  verified_at: string | null;
  retention_until: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DbKycDocumentRow {
  id: string;
  kyc_record_id: string;
  user_id: string;
  document_type: string;
  storage_bucket: string;
  storage_path: string;
  sha256_checksum: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  retention_until: string;
}

export interface DbKycReviewRow {
  id: string;
  kyc_record_id: string;
  subject_user_id: string;
  reviewer_user_id: string;
  decision: string;
  notes: string;
  reviewed_at: string;
}

export interface DbReferralSettingsRow {
  id: string;
  commission_rate_bps: number;
  min_qualifying_investment_kobo: KoboInput;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  approval_action_id: string | null;
  created_at: string;
}

export interface DbReferralRow {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  referral_code_used: string;
  qualifying_investment_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DbReferralCommissionRow {
  id: string;
  referral_id: string;
  qualifying_investment_id: string;
  referrer_user_id: string;
  transaction_id: string;
  journal_entry_id: string;
  commission_kobo: KoboInput;
  four_eyes_action_id: string;
  paid_at: string;
}

export interface DbPlatformSettingRow {
  key: string;
  category: string;
  value_json: Record<string, unknown>;
  is_sensitive: boolean;
  description: string;
  updated_by: string | null;
  approval_action_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DbPaymentReferenceRow {
  id: string;
  provider_id: string;
  transaction_id: string;
  provider_reference: string;
  channel: string;
  status: string;
  amount_kobo: KoboInput;
  raw_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

-- ============================================================================
-- SILVER SPOON — Phase B Migration 0011
-- Governance, Maker-Checker RBAC, Bank Details, Tax Rules, Profile & KYC RPCs
-- Security Standard: SECURITY DEFINER + SET search_path = public, pg_temp
--                    Strict auth.uid() + user_roles validation + four-eyes enforcement
-- ============================================================================

-- 1. Bank Detail Change Workflow (ADR-003: Four-Eyes Approval Required)
CREATE OR REPLACE FUNCTION public.request_bank_account_change(
  p_bank_code TEXT,
  p_bank_name TEXT,
  p_account_number TEXT,
  p_account_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_wallet_id UUID;
  v_action_id UUID;
  v_bank_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_role(v_user_id, 'investor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Investor role required' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = v_user_id AND currency = 'NGN';
  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_actions (
    action_type, status, target_table, subject_user_id, initiator_user_id, payload, justification
  )
  VALUES (
    'bank_detail_change', 'pending_approval', 'wallet_accounts', v_user_id, v_user_id,
    jsonb_build_object(
      'wallet_id', v_wallet_id,
      'bank_code', p_bank_code,
      'bank_name', p_bank_name,
      'account_number', p_account_number,
      'account_name', p_account_name
    ),
    'Payout NUBAN change requires independent four-eyes verification (ADR-003)'
  )
  RETURNING id INTO v_action_id;

  INSERT INTO public.wallet_accounts (
    wallet_id, user_id, bank_code, bank_name, account_number, account_name,
    is_primary, verification_status, change_approval_action_id
  )
  VALUES (
    v_wallet_id, v_user_id, p_bank_code, p_bank_name, p_account_number, p_account_name,
    false, 'pending_approval', v_action_id
  )
  RETURNING id INTO v_bank_id;

  UPDATE public.admin_actions SET target_id = v_bank_id WHERE id = v_action_id;

  RETURN v_bank_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_bank_account_change(
  p_wallet_account_id UUID,
  p_notes TEXT DEFAULT 'Verified NUBAN name match and approved'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id UUID := auth.uid();
  v_bank RECORD;
  v_action RECORD;
  v_log_id UUID;
BEGIN
  IF v_approver_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_approver_id, ARRAY['finance_officer', 'compliance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Finance, compliance, or super_admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bank FROM public.wallet_accounts WHERE id = p_wallet_account_id FOR UPDATE;
  IF NOT FOUND OR v_bank.verification_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'INVALID_BANK_CHANGE_REQUEST' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_action FROM public.admin_actions WHERE id = v_bank.change_approval_action_id FOR UPDATE;
  IF v_approver_id = v_bank.user_id OR v_approver_id = v_action.initiator_user_id THEN
    RAISE EXCEPTION 'FOUR_EYES_VIOLATION: Initiator or owner cannot approve own bank detail change' USING ERRCODE = '42501';
  END IF;

  -- Demote any prior verified primary account
  UPDATE public.wallet_accounts
  SET is_primary = false
  WHERE wallet_id = v_bank.wallet_id AND is_primary = true AND id <> v_bank.id;

  UPDATE public.wallet_accounts
  SET verification_status = 'verified',
      is_primary = true,
      verified_at = now()
  WHERE id = p_wallet_account_id;

  v_log_id := public.internal_write_audit_log(
    v_approver_id, 'finance_officer', 'BANK_ACCOUNT_CHANGE_APPROVED', 'wallet_account', p_wallet_account_id::text, 'high',
    jsonb_build_object('verification_status', 'pending_approval'),
    jsonb_build_object('verification_status', 'verified', 'bank_code', v_bank.bank_code),
    p_notes
  );

  UPDATE public.admin_actions
  SET status = 'executed', approver_user_id = v_approver_id, decided_at = now(), executed_at = now(), audit_log_id = v_log_id
  WHERE id = v_bank.change_approval_action_id;

  RETURN p_wallet_account_id;
END;
$$;

-- 2. Four-Eyes Role Grant & Revoke Workflow (ADR-003: Anti-Privilege-Escalation)
CREATE OR REPLACE FUNCTION public.request_role_change(
  p_target_user_id UUID,
  p_role public.app_role_enum,
  p_operation TEXT, -- 'grant' | 'revoke'
  p_justification TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_initiator_id UUID := auth.uid();
  v_action_type public.admin_action_type_enum;
  v_action_id UUID;
BEGIN
  IF v_initiator_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_role(v_initiator_id, 'super_admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE_ESCALATION: Only super_admin may initiate role changes' USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = v_initiator_id THEN
    RAISE EXCEPTION 'SELF_ESCALATION_BLOCKED: Cannot initiate a role change for your own account' USING ERRCODE = '42501';
  END IF;

  IF p_operation = 'grant' THEN
    v_action_type := 'role_grant';
  ELSIF p_operation = 'revoke' THEN
    v_action_type := 'role_revoke';
  ELSE
    RAISE EXCEPTION 'INVALID_OPERATION: Must be grant or revoke' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_actions (
    action_type, status, target_table, subject_user_id, initiator_user_id, payload, justification
  )
  VALUES (
    v_action_type, 'pending_approval', 'user_roles', p_target_user_id, v_initiator_id,
    jsonb_build_object('target_user_id', p_target_user_id, 'role', p_role, 'operation', p_operation),
    p_justification
  )
  RETURNING id INTO v_action_id;

  RETURN v_action_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_role_change(p_admin_action_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id UUID := auth.uid();
  v_action RECORD;
  v_target_user_id UUID;
  v_role public.app_role_enum;
  v_role_row_id UUID;
  v_log_id UUID;
BEGIN
  IF v_approver_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_role(v_approver_id, 'super_admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE_ESCALATION: Second super_admin required to approve role changes' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_action FROM public.admin_actions WHERE id = p_admin_action_id FOR UPDATE;
  IF NOT FOUND OR v_action.action_type NOT IN ('role_grant', 'role_revoke') OR v_action.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'INVALID_ROLE_ACTION' USING ERRCODE = '22023';
  END IF;

  IF v_approver_id = v_action.initiator_user_id OR v_approver_id = v_action.subject_user_id THEN
    RAISE EXCEPTION 'FOUR_EYES_VIOLATION: Initiator or subject cannot approve role change' USING ERRCODE = '42501';
  END IF;

  v_target_user_id := (v_action.payload ->> 'target_user_id')::UUID;
  v_role := (v_action.payload ->> 'role')::public.app_role_enum;

  IF v_action.action_type = 'role_grant' THEN
    INSERT INTO public.user_roles (user_id, role, granted_by, granted_action_id)
    VALUES (v_target_user_id, v_role, v_approver_id, p_admin_action_id)
    RETURNING id INTO v_role_row_id;
  ELSE
    UPDATE public.user_roles
    SET revoked_by = v_approver_id,
        revoked_action_id = p_admin_action_id,
        revoked_at = now(),
        revocation_reason = v_action.justification
    WHERE user_id = v_target_user_id AND role = v_role AND revoked_at IS NULL
    RETURNING id INTO v_role_row_id;
  END IF;

  v_log_id := public.internal_write_audit_log(
    v_approver_id, 'super_admin', upper(v_action.action_type::text) || '_EXECUTED', 'user_roles', COALESCE(v_role_row_id::text, v_target_user_id::text), 'high',
    NULL, jsonb_build_object('target_user_id', v_target_user_id, 'role', v_role),
    v_action.justification
  );

  UPDATE public.admin_actions
  SET status = 'executed', approver_user_id = v_approver_id, decided_at = now(), executed_at = now(), target_id = v_role_row_id, audit_log_id = v_log_id
  WHERE id = p_admin_action_id;

  RETURN v_role_row_id;
END;
$$;

-- 3. Four-Eyes Sensitive Treasury / Platform Configuration & Tax Rule Governance (ADR-003 / ADR-004)
CREATE OR REPLACE FUNCTION public.request_platform_setting_change(
  p_key TEXT,
  p_new_value JSONB,
  p_justification TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_initiator_id UUID := auth.uid();
  v_action_id UUID;
BEGIN
  IF v_initiator_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_role(v_initiator_id, 'super_admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: super_admin required for treasury/platform configuration changes' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = p_key) THEN
    RAISE EXCEPTION 'SETTING_NOT_FOUND: Key % does not exist', p_key USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_actions (
    action_type, status, target_table, initiator_user_id, payload, justification
  )
  VALUES (
    'treasury_config_change', 'pending_approval', 'platform_settings', v_initiator_id,
    jsonb_build_object('key', p_key, 'new_value', p_new_value),
    p_justification
  )
  RETURNING id INTO v_action_id;

  RETURN v_action_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_platform_setting_change(p_admin_action_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id UUID := auth.uid();
  v_action RECORD;
  v_key TEXT;
  v_old_val JSONB;
  v_log_id UUID;
BEGIN
  IF v_approver_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_role(v_approver_id, 'super_admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Independent super_admin required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_action FROM public.admin_actions WHERE id = p_admin_action_id FOR UPDATE;
  IF NOT FOUND OR v_action.action_type <> 'treasury_config_change' OR v_action.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'INVALID_CONFIG_ACTION' USING ERRCODE = '22023';
  END IF;

  IF v_approver_id = v_action.initiator_user_id THEN
    RAISE EXCEPTION 'FOUR_EYES_VIOLATION: Initiator cannot approve own platform setting change' USING ERRCODE = '42501';
  END IF;

  v_key := v_action.payload ->> 'key';
  SELECT value_json INTO v_old_val FROM public.platform_settings WHERE key = v_key FOR UPDATE;

  UPDATE public.platform_settings
  SET value_json = v_action.payload -> 'new_value',
      updated_by = v_approver_id,
      approval_action_id = p_admin_action_id,
      version = version + 1
  WHERE key = v_key;

  v_log_id := public.internal_write_audit_log(
    v_approver_id, 'super_admin', 'PLATFORM_SETTING_UPDATED', 'platform_settings', v_key, 'high',
    jsonb_build_object('value_json', v_old_val),
    jsonb_build_object('value_json', v_action.payload -> 'new_value'),
    v_action.justification
  );

  UPDATE public.admin_actions
  SET status = 'executed', approver_user_id = v_approver_id, decided_at = now(), executed_at = now(), audit_log_id = v_log_id
  WHERE id = p_admin_action_id;

  RETURN v_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_tax_rule_change(
  p_rule_payload JSONB,
  p_justification TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_initiator_id UUID := auth.uid();
  v_action_id UUID;
BEGIN
  IF v_initiator_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_initiator_id, ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.admin_actions (
    action_type, status, target_table, initiator_user_id, payload, justification
  )
  VALUES (
    'tax_rule_change', 'pending_approval', 'tax_rules', v_initiator_id,
    p_rule_payload, p_justification
  )
  RETURNING id INTO v_action_id;

  RETURN v_action_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_tax_rule_change(p_admin_action_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id UUID := auth.uid();
  v_action RECORD;
  v_p JSONB;
  v_rule_id UUID;
  v_log_id UUID;
BEGIN
  IF v_approver_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_role(v_approver_id, 'super_admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: super_admin required to approve tax rules' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_action FROM public.admin_actions WHERE id = p_admin_action_id FOR UPDATE;
  IF NOT FOUND OR v_action.action_type <> 'tax_rule_change' OR v_action.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'INVALID_TAX_RULE_ACTION' USING ERRCODE = '22023';
  END IF;

  IF v_approver_id = v_action.initiator_user_id THEN
    RAISE EXCEPTION 'FOUR_EYES_VIOLATION: Initiator cannot approve own tax rule change' USING ERRCODE = '42501';
  END IF;

  v_p := v_action.payload;

  INSERT INTO public.tax_rules (
    rule_code, tax_code, instrument_type, investor_classification,
    exemption_code, is_exempt, rate_bps, fixed_amount_kobo, min_threshold_kobo,
    effective_from, effective_to, legal_basis, is_active, created_by, approval_action_id
  )
  VALUES (
    v_p ->> 'rule_code',
    v_p ->> 'tax_code',
    v_p ->> 'instrument_type',
    (v_p ->> 'investor_classification')::public.investor_classification_enum,
    v_p ->> 'exemption_code',
    COALESCE((v_p ->> 'is_exempt')::BOOLEAN, false),
    COALESCE((v_p ->> 'rate_bps')::INTEGER, 0),
    COALESCE((v_p ->> 'fixed_amount_kobo')::BIGINT, 0),
    COALESCE((v_p ->> 'min_threshold_kobo')::BIGINT, 0),
    (v_p ->> 'effective_from')::TIMESTAMPTZ,
    NULLIF(v_p ->> 'effective_to', '')::TIMESTAMPTZ,
    v_p ->> 'legal_basis',
    true,
    v_action.initiator_user_id,
    p_admin_action_id
  )
  RETURNING id INTO v_rule_id;

  v_log_id := public.internal_write_audit_log(
    v_approver_id, 'super_admin', 'TAX_RULE_APPROVED', 'tax_rules', v_rule_id::text, 'high',
    NULL, v_p, v_action.justification
  );

  UPDATE public.admin_actions
  SET status = 'executed', approver_user_id = v_approver_id, decided_at = now(), executed_at = now(), target_id = v_rule_id, audit_log_id = v_log_id
  WHERE id = p_admin_action_id;

  RETURN v_rule_id;
END;
$$;

-- 4. Safe Investor Profile Update (non-privileged fields only; never modifies tier/kyc/status)
CREATE OR REPLACE FUNCTION public.update_own_profile(
  p_full_name TEXT,
  p_phone TEXT,
  p_city TEXT,
  p_address TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
      phone = p_phone,
      city = p_city,
      address = p_address
  WHERE id = v_user_id;

  RETURN v_user_id;
END;
$$;

-- 5. KYC Metadata Submission & Compliance Review (Vendor-Agnostic; Self-Review Prohibited)
CREATE OR REPLACE FUNCTION public.submit_kyc_record(
  p_target_tier public.kyc_tier_enum,
  p_bvn_hash TEXT DEFAULT NULL,
  p_bvn_last4 CHAR(4) DEFAULT NULL,
  p_nin_hash TEXT DEFAULT NULL,
  p_nin_last4 CHAR(4) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_kyc_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_role(v_user_id, 'investor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.kyc_records (
    user_id, target_tier, status, bvn_hash, bvn_last4, nin_hash, nin_last4, submitted_at
  )
  VALUES (
    v_user_id, p_target_tier, 'submitted', p_bvn_hash, p_bvn_last4, p_nin_hash, p_nin_last4, now()
  )
  RETURNING id INTO v_kyc_id;

  RETURN v_kyc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_kyc_record(
  p_kyc_record_id UUID,
  p_decision TEXT,
  p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reviewer_id UUID := auth.uid();
  v_rec RECORD;
  v_review_id UUID;
BEGIN
  IF v_reviewer_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_reviewer_id, ARRAY['compliance_officer', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Compliance officer or super_admin required for KYC reviews' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rec FROM public.kyc_records WHERE id = p_kyc_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KYC_RECORD_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF v_reviewer_id = v_rec.user_id THEN
    RAISE EXCEPTION 'SELF_REVIEW_PROHIBITED: Reviewer cannot review their own KYC record' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.kyc_reviews (kyc_record_id, subject_user_id, reviewer_user_id, decision, notes)
  VALUES (p_kyc_record_id, v_rec.user_id, v_reviewer_id, p_decision, p_notes)
  RETURNING id INTO v_review_id;

  IF p_decision = 'approved' THEN
    UPDATE public.kyc_records SET status = 'approved', verified_at = now() WHERE id = p_kyc_record_id;
    UPDATE public.profiles SET kyc_tier = v_rec.target_tier WHERE id = v_rec.user_id;
  ELSIF p_decision = 'rejected' THEN
    UPDATE public.kyc_records SET status = 'rejected' WHERE id = p_kyc_record_id;
  END IF;

  PERFORM public.internal_write_audit_log(
    v_reviewer_id, 'compliance_officer', 'KYC_REVIEW_' || upper(p_decision), 'kyc_record', p_kyc_record_id::text, 'medium',
    jsonb_build_object('status', v_rec.status),
    jsonb_build_object('decision', p_decision, 'target_tier', v_rec.target_tier),
    p_notes
  );

  RETURN v_review_id;
END;
$$;

-- 6. Investment Plan Lifecycle Status Management (Admin / Super Admin)
CREATE OR REPLACE FUNCTION public.set_investment_plan_status(
  p_plan_id UUID,
  p_status public.plan_status_enum,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_old_status public.plan_status_enum;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.app_has_any_role(v_caller_id, ARRAY['admin', 'super_admin']::public.app_role_enum[]) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Admin or super_admin required' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_old_status FROM public.investment_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  UPDATE public.investment_plans SET status = p_status WHERE id = p_plan_id;

  PERFORM public.internal_write_audit_log(
    v_caller_id, 'admin', 'INVESTMENT_PLAN_STATUS_CHANGED', 'investment_plan', p_plan_id::text, 'medium',
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_status),
    p_reason
  );

  RETURN p_plan_id;
END;
$$;

-- 7. Mark Own Notification Read
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.notifications
  SET is_read = true, read_at = now()
  WHERE id = p_notification_id AND user_id = v_user_id;
END;
$$;

-- ============================================================================
-- SILVER SPOON — Phase B Migration 0003
-- Module J: Governance, Universal Four-Eyes Controls & Immutable Audit Logs (Tables 5-7)
-- Tables: platform_settings, audit_logs, admin_actions
-- ============================================================================

-- 5. platform_settings (versioned key-value treasury & platform configuration; NO hard-coded universal WHT/EMTL)
CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_.]{1,79}$'),
  category TEXT NOT NULL CHECK (category IN ('treasury', 'limits', 'fees', 'settlement', 'compliance', 'general')),
  value_json JSONB NOT NULL,
  is_sensitive BOOLEAN NOT NULL DEFAULT true,
  description TEXT NOT NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approval_action_id UUID, -- FK added below -> admin_actions(id)
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Default non-production staging configuration (configurable; four-eyes required for changes)
INSERT INTO public.platform_settings (key, category, value_json, is_sensitive, description)
VALUES
  ('deposit.min_kobo', 'limits', '{"amount_kobo": 1000000}'::jsonb, true, 'Minimum Paystack Checkout deposit amount in kobo (NGN 10,000.00).'),
  ('withdrawal.min_kobo', 'limits', '{"amount_kobo": 500000}'::jsonb, true, 'Minimum investor withdrawal request in kobo (NGN 5,000.00).'),
  ('withdrawal.daily_limit_tier2_kobo', 'limits', '{"amount_kobo": 500000000}'::jsonb, true, 'Daily withdrawal cap for KYC Tier 2 accounts (NGN 5,000,000.00).'),
  ('withdrawal.daily_limit_tier3_kobo', 'limits', '{"amount_kobo": 5000000000}'::jsonb, true, 'Daily withdrawal cap for KYC Tier 3 accounts (NGN 50,000,000.00).'),
  ('withdrawal.fee_schedule', 'fees', '{"standard_fee_kobo": 0, "high_value_threshold_kobo": 1000000000, "high_value_fee_kobo": 250000}'::jsonb, true, 'Platform withdrawal processing fee schedule in kobo.'),
  ('withdrawal.four_eyes_required_all', 'treasury', '{"enabled": true, "exemption_threshold_kobo": 0}'::jsonb, true, 'ADR-003: Universal four-eyes approval required for all withdrawals and payouts.'),
  ('withdrawal.settlement_mode', 'settlement', '{"mode": "scheduled_treasury_batch", "auto_disbursement_enabled": false}'::jsonb, true, 'ADR-007: Scheduled treasury batch settlement only; auto-disbursement disabled.')
ON CONFLICT (key) DO NOTHING;

-- 6. audit_logs (strictly append-only immutable audit trail)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL CHECK (length(trim(action)) >= 3),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  severity public.compliance_severity_enum NOT NULL DEFAULT 'low',
  before_state JSONB,
  after_state JSONB,
  justification TEXT,
  ip_address INET,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_user_id, created_at DESC);
CREATE INDEX idx_audit_logs_target ON public.audit_logs(target_type, target_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_immutable_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: % operations are strictly prohibited on table %.%',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

-- 7. admin_actions (universal maker-checker / four-eyes governance table — ADR-003)
CREATE TABLE public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type public.admin_action_type_enum NOT NULL,
  status public.admin_action_status_enum NOT NULL DEFAULT 'pending_approval',
  target_table TEXT NOT NULL,
  target_id UUID,
  subject_user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  initiator_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approver_user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  justification TEXT NOT NULL CHECK (length(trim(justification)) >= 5),
  rejection_reason TEXT,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  audit_log_id UUID REFERENCES public.audit_logs(id) ON DELETE RESTRICT,
  -- Structural Four-Eyes Enforcement: initiator can NEVER approve own operation
  CONSTRAINT chk_admin_actions_four_eyes
    CHECK (approver_user_id IS NULL OR approver_user_id <> initiator_user_id),
  -- Approver can NEVER approve an operation affecting their own account/withdrawal/role
  CONSTRAINT chk_admin_actions_not_subject
    CHECK (approver_user_id IS NULL OR subject_user_id IS NULL OR approver_user_id <> subject_user_id),
  CONSTRAINT chk_admin_actions_decision_fields
    CHECK (
      (status = 'pending_approval' AND approver_user_id IS NULL AND decided_at IS NULL)
      OR (status IN ('approved', 'rejected', 'executed') AND approver_user_id IS NOT NULL AND decided_at IS NOT NULL)
      OR (status = 'expired')
    )
);

CREATE INDEX idx_admin_actions_status ON public.admin_actions(status, action_type, initiated_at DESC);
CREATE INDEX idx_admin_actions_initiator ON public.admin_actions(initiator_user_id);
CREATE INDEX idx_admin_actions_subject ON public.admin_actions(subject_user_id);

-- Wire deferred governance FKs now that admin_actions exists
ALTER TABLE public.user_roles
  ADD CONSTRAINT fk_user_roles_granted_action
    FOREIGN KEY (granted_action_id) REFERENCES public.admin_actions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_user_roles_revoked_action
    FOREIGN KEY (revoked_action_id) REFERENCES public.admin_actions(id) ON DELETE RESTRICT;

ALTER TABLE public.platform_settings
  ADD CONSTRAINT fk_platform_settings_approval_action
    FOREIGN KEY (approval_action_id) REFERENCES public.admin_actions(id) ON DELETE RESTRICT;

-- Internal audit logger (only invoked from controlled SECURITY DEFINER RPCs)
CREATE OR REPLACE FUNCTION public.internal_write_audit_log(
  p_actor_user_id UUID,
  p_actor_role TEXT,
  p_action TEXT,
  p_target_type TEXT,
  p_target_id TEXT,
  p_severity public.compliance_severity_enum DEFAULT 'low',
  p_before_state JSONB DEFAULT NULL,
  p_after_state JSONB DEFAULT NULL,
  p_justification TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    severity,
    before_state,
    after_state,
    justification
  )
  VALUES (
    p_actor_user_id,
    p_actor_role,
    p_action,
    p_target_type,
    p_target_id,
    p_severity,
    p_before_state,
    p_after_state,
    p_justification
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

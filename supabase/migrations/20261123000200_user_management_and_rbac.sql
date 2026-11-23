-- ============================================================================
-- SILVER SPOON — Phase B Migration 0002
-- Module A: User Management & 5-Role RBAC (Tables 1-4)
-- Tables: account_statuses, profiles, user_roles, user_sessions
-- ============================================================================

-- 1. account_statuses
CREATE TABLE public.account_statuses (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  label TEXT NOT NULL,
  can_login BOOLEAN NOT NULL DEFAULT false,
  can_transact BOOLEAN NOT NULL DEFAULT false,
  can_withdraw BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.account_statuses (code, label, can_login, can_transact, can_withdraw, description)
VALUES
  ('active', 'Active', true, true, true, 'Standard active account permitted to authenticate and transact within KYC limits.'),
  ('pending_verification', 'Pending Verification', true, false, false, 'Newly registered account awaiting email/onboarding verification.'),
  ('frozen', 'Frozen', true, false, false, 'Wallet and transactional operations frozen pending compliance or security review.'),
  ('suspended', 'Suspended', false, false, false, 'Authentication and all transactional capabilities suspended.'),
  ('closed', 'Closed', false, false, false, 'Account permanently closed under NDPA 2023 closure workflow; statutory records retained.')
ON CONFLICT (code) DO NOTHING;

-- 2. profiles (1:1 with auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_code TEXT NOT NULL UNIQUE CHECK (client_code ~ '^SS-[A-Z0-9-]{4,24}$'),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) >= 2),
  phone TEXT,
  city TEXT,
  address TEXT,
  status_code TEXT NOT NULL DEFAULT 'pending_verification' REFERENCES public.account_statuses(code) ON DELETE RESTRICT,
  tier public.client_tier_enum NOT NULL DEFAULT 'Standard',
  investor_classification public.investor_classification_enum NOT NULL DEFAULT 'retail_individual',
  kyc_tier public.kyc_tier_enum NOT NULL DEFAULT 'Tier 0',
  referral_code TEXT NOT NULL UNIQUE CHECK (referral_code ~ '^[A-Z0-9-]{5,24}$'),
  email_verified_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_status_code ON public.profiles(status_code);
CREATE INDEX idx_profiles_kyc_tier ON public.profiles(kyc_tier);
CREATE INDEX idx_profiles_investor_classification ON public.profiles(investor_classification);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. user_roles (authoritative 5-role RBAC table — never client-editable)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role public.app_role_enum NOT NULL,
  granted_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  granted_action_id UUID, -- FK added in migration 0003 -> admin_actions(id)
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  revoked_action_id UUID, -- FK added in migration 0003 -> admin_actions(id)
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE UNIQUE INDEX uq_user_roles_active
  ON public.user_roles(user_id, role)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role_active ON public.user_roles(role) WHERE revoked_at IS NULL;

-- 4. user_sessions (session & revocation audit log)
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  session_token_hash TEXT NOT NULL UNIQUE,
  ip_address INET,
  user_agent TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);

CREATE INDEX idx_user_sessions_user_active
  ON public.user_sessions(user_id, started_at DESC)
  WHERE revoked_at IS NULL;

-- ============================================================================
-- Authoritative RBAC & Account Status Helper Functions (SECURITY DEFINER)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_has_role(p_user_id UUID, p_role public.app_role_enum)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role = p_role
      AND ur.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.app_has_any_role(p_user_id UUID, p_roles public.app_role_enum[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role = ANY(p_roles)
      AND ur.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.app_is_staff(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_has_any_role(
    p_user_id,
    ARRAY['super_admin', 'admin', 'finance_officer', 'compliance_officer']::public.app_role_enum[]
  );
$$;

CREATE OR REPLACE FUNCTION public.app_account_can_transact(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.account_statuses s ON s.code = p.status_code
    WHERE p.id = p_user_id
      AND s.can_login = true
      AND s.can_transact = true
  );
$$;

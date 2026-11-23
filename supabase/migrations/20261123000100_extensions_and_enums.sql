-- ============================================================================
-- SILVER SPOON — Phase B Migration 0001
-- Extensions, Shared Utility Triggers & Foundational Domain Enums
-- Target: Non-production PostgreSQL 15+ (Supabase Staging)
-- Currency Standard: NGN only (Integer Kobo BIGINT)
-- ============================================================================

-- PostgreSQL 15+ provides gen_random_uuid() natively in pg_catalog.
-- Install pgcrypto automatically on Supabase / full PostgreSQL distributions where available.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgcrypto') THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;
END $$;

-- Shared updated_at trigger function with pinned search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 5-role RBAC enum (ADR-003)
DO $$ BEGIN
  CREATE TYPE public.app_role_enum AS ENUM (
    'super_admin',
    'admin',
    'finance_officer',
    'compliance_officer',
    'investor'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.client_tier_enum AS ENUM (
    'Standard',
    'Silver',
    'Gold',
    'Platinum',
    'Private'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Investor classification for configurable statutory tax rules (ADR-004)
DO $$ BEGIN
  CREATE TYPE public.investor_classification_enum AS ENUM (
    'retail_individual',
    'hnw_individual',
    'corporate',
    'tax_exempt_entity'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ledger_account_type_enum AS ENUM (
    'asset',
    'liability',
    'equity',
    'revenue',
    'expense'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.journal_direction_enum AS ENUM (
    'debit',
    'credit'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.financial_period_status_enum AS ENUM (
    'open',
    'closing',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.wallet_status_enum AS ENUM (
    'active',
    'frozen',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.transaction_type_enum AS ENUM (
    'deposit',
    'withdrawal',
    'investment_subscription',
    'investment_maturity',
    'investment_payout',
    'referral_commission',
    'fee',
    'tax_withholding',
    'adjustment',
    'reversal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.transaction_status_enum AS ENUM (
    'initiated',
    'pending',
    'pending_approval',
    'approved',
    'processing',
    'completed',
    'failed',
    'declined',
    'reversed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Initial payment scope: Paystack Checkout (card & bank transfer) only; DVAs deferred (ADR-002)
DO $$ BEGIN
  CREATE TYPE public.deposit_channel_enum AS ENUM (
    'paystack_checkout_card',
    'paystack_checkout_bank_transfer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Scheduled treasury settlement batch states (ADR-007)
DO $$ BEGIN
  CREATE TYPE public.withdrawal_batch_status_enum AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'disbursing',
    'settled',
    'partially_settled',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.plan_status_enum AS ENUM (
    'draft',
    'active',
    'paused',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.investment_status_enum AS ENUM (
    'active',
    'matured',
    'rolled_over',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Rollover policy (ADR-005): default principal_only; return compounding requires explicit consent & plan approval
DO $$ BEGIN
  CREATE TYPE public.rollover_mode_enum AS ENUM (
    'none',
    'principal_only',
    'principal_plus_net_return'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.kyc_tier_enum AS ENUM (
    'Tier 0',
    'Tier 1',
    'Tier 2',
    'Tier 3'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.kyc_status_enum AS ENUM (
    'not_started',
    'draft',
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.compliance_severity_enum AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Universal four-eyes governance actions (ADR-003)
DO $$ BEGIN
  CREATE TYPE public.admin_action_type_enum AS ENUM (
    'withdrawal_approval',
    'withdrawal_batch_approval',
    'manual_ledger_adjustment',
    'transaction_reversal',
    'realized_return_distribution',
    'bank_detail_change',
    'role_grant',
    'role_revoke',
    'treasury_config_change',
    'tax_rule_change',
    'financial_period_close',
    'referral_commission_payout'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.admin_action_status_enum AS ENUM (
    'pending_approval',
    'approved',
    'rejected',
    'executed',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_category_enum AS ENUM (
    'Account',
    'Wallet',
    'Investment',
    'Compliance',
    'Security',
    'System'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

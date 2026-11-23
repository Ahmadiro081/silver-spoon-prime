-- ============================================================================
-- SILVER SPOON — Phase B Migration 0012
-- Database Roles, Least-Privilege Grants (REVOKE ALL) & Table-Specific Forced RLS
-- Covers ALL 40 public schema tables (ADR-009)
-- ============================================================================

-- 1. Dedicated internal NOLOGIN roles for backend treasury and reconciliation workers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'silver_spoon_treasury_worker') THEN
    CREATE ROLE silver_spoon_treasury_worker NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'silver_spoon_reconciler') THEN
    CREATE ROLE silver_spoon_reconciler NOLOGIN;
  END IF;
END $$;

-- 2. Deny-by-Default Privilege Revocation across schema public
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, silver_spoon_treasury_worker, silver_spoon_reconciler;

-- 3. Enable AND Force Row Level Security on ALL 40 tables
DO $$
DECLARE
  v_tbl TEXT;
  v_tables TEXT[] := ARRAY[
    'account_statuses', 'profiles', 'user_roles', 'user_sessions',
    'platform_settings', 'audit_logs', 'admin_actions',
    'financial_periods', 'ledger_accounts', 'journal_entries', 'journal_lines',
    'wallets', 'wallet_accounts', 'wallet_balances',
    'transactions', 'transaction_references', 'transaction_fees', 'deposits', 'withdrawal_batches', 'withdrawals',
    'tax_rules', 'tax_applications',
    'investment_plans', 'investments', 'investment_allocations', 'investment_payouts', 'investment_maturities',
    'referral_settings', 'referrals', 'referral_commissions',
    'kyc_records', 'kyc_documents', 'kyc_reviews', 'compliance_events',
    'notifications', 'notification_preferences',
    'payment_providers', 'payment_references', 'payment_events', 'webhook_logs'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_tbl);
  END LOOP;
END $$;

-- ============================================================================
-- 4. Table-Specific RLS Policies (Zero direct client INSERT/UPDATE/DELETE)
-- ============================================================================

-- Module A: User Management & RBAC
CREATE POLICY rls_account_statuses_read ON public.account_statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY rls_profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY rls_profiles_select_staff ON public.profiles
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

CREATE POLICY rls_user_roles_select_own ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_user_roles_select_admin ON public.user_roles
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['admin', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_user_sessions_select_own ON public.user_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_user_sessions_select_security_staff ON public.user_sessions
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['compliance_officer', 'super_admin']::public.app_role_enum[]));

-- Module J: Governance & Audit
CREATE POLICY rls_platform_settings_select_staff ON public.platform_settings
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

CREATE POLICY rls_audit_logs_select_staff ON public.audit_logs
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['compliance_officer', 'finance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_admin_actions_select_staff ON public.admin_actions
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'compliance_officer', 'super_admin']::public.app_role_enum[]));

-- Module C: Financial Ledger (Strictly Finance Officer & Super Admin read-only)
CREATE POLICY rls_financial_periods_select_finance ON public.financial_periods
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_ledger_accounts_select_finance ON public.ledger_accounts
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_journal_entries_select_finance ON public.journal_entries
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_journal_lines_select_finance ON public.journal_lines
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]));

-- Module B: Wallets & Balances (Strict Owner Isolation + Scoped Staff)
CREATE POLICY rls_wallets_select_own ON public.wallets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_wallets_select_staff ON public.wallets
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

CREATE POLICY rls_wallet_accounts_select_own ON public.wallet_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_wallet_accounts_select_staff ON public.wallet_accounts
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'compliance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_wallet_balances_select_own ON public.wallet_balances
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_wallet_balances_select_staff ON public.wallet_balances
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

-- Module D: Transactions, Deposits, Withdrawals & Batches
CREATE POLICY rls_transactions_select_own ON public.transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_transactions_select_staff ON public.transactions
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

CREATE POLICY rls_transaction_references_select_own ON public.transaction_references
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid())
  );
CREATE POLICY rls_transaction_references_select_staff ON public.transaction_references
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'compliance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_transaction_fees_select_own ON public.transaction_fees
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid())
  );
CREATE POLICY rls_transaction_fees_select_staff ON public.transaction_fees
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

CREATE POLICY rls_deposits_select_own ON public.deposits
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_deposits_select_staff ON public.deposits
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

-- Withdrawal batches: strictly Finance Officer & Super Admin (zero investor visibility)
CREATE POLICY rls_withdrawal_batches_select_finance ON public.withdrawal_batches
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_withdrawals_select_own ON public.withdrawals
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_withdrawals_select_staff ON public.withdrawals
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

-- Module E: Tax Rules & Applications
CREATE POLICY rls_tax_rules_select_active ON public.tax_rules
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY rls_tax_rules_select_finance ON public.tax_rules
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_tax_applications_select_own ON public.tax_applications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_tax_applications_select_finance ON public.tax_applications
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]));

-- Module F: Investments
CREATE POLICY rls_investment_plans_select_public ON public.investment_plans
  FOR SELECT TO anon, authenticated USING (status IN ('active', 'paused'));
CREATE POLICY rls_investment_plans_select_staff ON public.investment_plans
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

CREATE POLICY rls_investments_select_own ON public.investments
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_investments_select_staff ON public.investments
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

CREATE POLICY rls_investment_allocations_select_staff ON public.investment_allocations
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'admin', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_investment_payouts_select_own ON public.investment_payouts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_investment_payouts_select_staff ON public.investment_payouts
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

CREATE POLICY rls_investment_maturities_select_own ON public.investment_maturities
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_investment_maturities_select_staff ON public.investment_maturities
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

-- Module G: Referrals
CREATE POLICY rls_referral_settings_select_auth ON public.referral_settings
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY rls_referral_settings_select_staff ON public.referral_settings
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

CREATE POLICY rls_referrals_select_own ON public.referrals
  FOR SELECT TO authenticated USING (referrer_user_id = auth.uid());
CREATE POLICY rls_referrals_select_staff ON public.referrals
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

CREATE POLICY rls_referral_commissions_select_own ON public.referral_commissions
  FOR SELECT TO authenticated USING (referrer_user_id = auth.uid());
CREATE POLICY rls_referral_commissions_select_staff ON public.referral_commissions
  FOR SELECT TO authenticated USING (public.app_is_staff(auth.uid()));

-- Module H: KYC & Compliance (Strictly Owner + Compliance Officer / Super Admin — Admin & Finance BLOCKED)
CREATE POLICY rls_kyc_records_select_own ON public.kyc_records
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_kyc_records_select_compliance ON public.kyc_records
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['compliance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_kyc_documents_select_own ON public.kyc_documents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rls_kyc_documents_select_compliance ON public.kyc_documents
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['compliance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_kyc_reviews_select_compliance ON public.kyc_reviews
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['compliance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_compliance_events_select_compliance ON public.compliance_events
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['compliance_officer', 'super_admin']::public.app_role_enum[]));

-- Module I: Notifications
CREATE POLICY rls_notifications_select_own ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY rls_notification_preferences_select_own ON public.notification_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Module K: Payment Audit Tables (Strictly Finance Officer & Super Admin; zero investor visibility)
CREATE POLICY rls_payment_providers_select_finance ON public.payment_providers
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_payment_references_select_finance ON public.payment_references
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_payment_events_select_finance ON public.payment_events
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]));

CREATE POLICY rls_webhook_logs_select_finance ON public.webhook_logs
  FOR SELECT TO authenticated USING (public.app_has_any_role(auth.uid(), ARRAY['finance_officer', 'super_admin']::public.app_role_enum[]));

-- ============================================================================
-- 5. Least-Privilege Explicit Grants (Zero direct INSERT/UPDATE/DELETE for anon/authenticated)
-- ============================================================================

-- Public anon read ONLY on active/paused investment_plans (filtered by RLS)
GRANT SELECT ON public.investment_plans TO anon;

-- Authenticated SELECT only on RLS-protected tables (still filtered by every table's RLS policy!)
GRANT SELECT ON
  public.account_statuses,
  public.profiles,
  public.user_roles,
  public.user_sessions,
  public.platform_settings,
  public.audit_logs,
  public.admin_actions,
  public.financial_periods,
  public.ledger_accounts,
  public.journal_entries,
  public.journal_lines,
  public.wallets,
  public.wallet_accounts,
  public.wallet_balances,
  public.transactions,
  public.transaction_references,
  public.transaction_fees,
  public.deposits,
  public.withdrawal_batches,
  public.withdrawals,
  public.tax_rules,
  public.tax_applications,
  public.investment_plans,
  public.investments,
  public.investment_allocations,
  public.investment_payouts,
  public.investment_maturities,
  public.referral_settings,
  public.referrals,
  public.referral_commissions,
  public.kyc_records,
  public.kyc_documents,
  public.kyc_reviews,
  public.compliance_events,
  public.notifications,
  public.notification_preferences,
  public.payment_providers,
  public.payment_references,
  public.payment_events,
  public.webhook_logs
TO authenticated;

-- Service role full backend table privileges (for Edge Functions / reconciliation workers)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Explicit EXECUTE grants ONLY on approved client & staff RPCs (NEVER internal_* or settlement-only functions!)
GRANT EXECUTE ON FUNCTION
  public.app_has_role(UUID, public.app_role_enum),
  public.app_has_any_role(UUID, public.app_role_enum[]),
  public.app_is_staff(UUID),
  public.app_account_can_transact(UUID),
  public.resolve_applicable_tax_rule(TEXT, TEXT, public.investor_classification_enum, TIMESTAMPTZ),
  public.initialize_deposit(BIGINT, public.deposit_channel_enum, TEXT, TEXT),
  public.request_withdrawal(BIGINT, UUID, TEXT),
  public.approve_withdrawal_four_eyes(UUID, TEXT),
  public.create_withdrawal_batch(TEXT, TIMESTAMPTZ, UUID[]),
  public.approve_withdrawal_batch_four_eyes(UUID, TEXT),
  public.fail_or_decline_withdrawal(UUID, TEXT, public.transaction_status_enum, TEXT),
  public.create_investment(UUID, BIGINT, TEXT, public.rollover_mode_enum, BOOLEAN, TEXT),
  public.update_investment_rollover_mode(UUID, public.rollover_mode_enum, BOOLEAN, TEXT),
  public.request_realized_return_distribution(UUID, BIGINT, BIGINT, TEXT, TEXT),
  public.approve_and_distribute_investment_payout(UUID, TEXT, TIMESTAMPTZ),
  public.mature_investment(UUID, TEXT),
  public.request_transaction_reversal(UUID, TEXT),
  public.approve_and_post_reversal(UUID, TEXT),
  public.request_manual_ledger_adjustment(JSONB, TEXT, TEXT),
  public.approve_and_post_manual_adjustment(UUID, TEXT),
  public.reconcile_wallet_balance(UUID),
  public.request_bank_account_change(TEXT, TEXT, TEXT, TEXT),
  public.approve_bank_account_change(UUID, TEXT),
  public.request_role_change(UUID, public.app_role_enum, TEXT, TEXT),
  public.approve_role_change(UUID),
  public.request_platform_setting_change(TEXT, JSONB, TEXT),
  public.approve_platform_setting_change(UUID),
  public.request_tax_rule_change(JSONB, TEXT),
  public.approve_tax_rule_change(UUID),
  public.update_own_profile(TEXT, TEXT, TEXT, TEXT),
  public.submit_kyc_record(public.kyc_tier_enum, TEXT, CHAR(4), TEXT, CHAR(4)),
  public.review_kyc_record(UUID, TEXT, TEXT),
  public.set_investment_plan_status(UUID, public.plan_status_enum, TEXT),
  public.mark_notification_read(UUID)
TO authenticated;

-- Restricted backend worker execution grants (NEVER granted to anon or authenticated)
GRANT EXECUTE ON FUNCTION
  public.internal_provision_investor_wallet(UUID),
  public.settle_verified_deposit(TEXT, BIGINT, TEXT, TEXT),
  public.settle_withdrawal(UUID, TEXT, TEXT),
  public.fail_or_decline_withdrawal(UUID, TEXT, public.transaction_status_enum, TEXT),
  public.reconcile_wallet_balance(UUID)
TO service_role, silver_spoon_treasury_worker;

GRANT EXECUTE ON FUNCTION
  public.reconcile_wallet_balance(UUID)
TO silver_spoon_reconciler;

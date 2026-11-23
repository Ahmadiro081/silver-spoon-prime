-- ============================================================================
-- SILVER SPOON — Non-Production Synthetic Staging Seed
-- STRICT BOUNDARY: Synthetic test personas only (.invalid RFC 2606 addresses).
-- Zero real customer information, zero real BVN/NIN, zero real bank accounts.
-- ============================================================================

-- Synthetic test user UUIDs (deterministic for automated test reproducibility)
-- Investor 1 (Retail, Tier 2):       11111111-1111-4111-8111-111111111111
-- Investor 2 (Corporate, Tier 3):    22222222-2222-4222-8222-222222222222
-- Finance Officer A:                 33333333-3333-4333-8333-333333333333
-- Finance Officer B:                 44444444-4444-4444-8444-444444444444
-- Compliance Officer:                55555555-5555-4555-8555-555555555555
-- Admin Officer:                     66666666-6666-4666-8666-666666666666
-- Super Admin A:                     77777777-7777-4777-8777-777777777777
-- Super Admin B:                     88888888-8888-4888-8888-888888888888

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'investor.one@staging.silverspoon.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'investor.two@staging.silverspoon.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'finance.a@staging.silverspoon.invalid'),
  ('44444444-4444-4444-8444-444444444444', 'finance.b@staging.silverspoon.invalid'),
  ('55555555-5555-4555-8555-555555555555', 'compliance.a@staging.silverspoon.invalid'),
  ('66666666-6666-4666-8666-666666666666', 'admin.a@staging.silverspoon.invalid'),
  ('77777777-7777-4777-8777-777777777777', 'superadmin.a@staging.silverspoon.invalid'),
  ('88888888-8888-4888-8888-888888888888', 'superadmin.b@staging.silverspoon.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (
  id, client_code, email, full_name, phone, city, status_code, tier, investor_classification, kyc_tier, referral_code, email_verified_at
) VALUES
  ('11111111-1111-4111-8111-111111111111', 'SS-INV-0001', 'investor.one@staging.silverspoon.invalid', 'Synthetic Investor One', '+2348000000001', 'Lagos', 'active', 'Gold', 'retail_individual', 'Tier 2', 'SSREF001', now()),
  ('22222222-2222-4222-8222-222222222222', 'SS-INV-0002', 'investor.two@staging.silverspoon.invalid', 'Synthetic Corporate Two', '+2348000000002', 'Abuja', 'active', 'Platinum', 'corporate', 'Tier 3', 'SSREF002', now()),
  ('33333333-3333-4333-8333-333333333333', 'SS-FIN-0001', 'finance.a@staging.silverspoon.invalid', 'Synthetic Finance Officer A', '+2348000000003', 'Lagos', 'active', 'Private', 'retail_individual', 'Tier 3', 'SSFIN001', now()),
  ('44444444-4444-4444-8444-444444444444', 'SS-FIN-0002', 'finance.b@staging.silverspoon.invalid', 'Synthetic Finance Officer B', '+2348000000004', 'Lagos', 'active', 'Private', 'retail_individual', 'Tier 3', 'SSFIN002', now()),
  ('55555555-5555-4555-8555-555555555555', 'SS-CMP-0001', 'compliance.a@staging.silverspoon.invalid', 'Synthetic Compliance Officer', '+2348000000005', 'Abuja', 'active', 'Private', 'retail_individual', 'Tier 3', 'SSCMP001', now()),
  ('66666666-6666-4666-8666-666666666666', 'SS-ADM-0001', 'admin.a@staging.silverspoon.invalid', 'Synthetic Admin Officer', '+2348000000006', 'Lagos', 'active', 'Private', 'retail_individual', 'Tier 3', 'SSADM001', now()),
  ('77777777-7777-4777-8777-777777777777', 'SS-SUP-0001', 'superadmin.a@staging.silverspoon.invalid', 'Synthetic Super Admin A', '+2348000000007', 'Lagos', 'active', 'Private', 'retail_individual', 'Tier 3', 'SSSUP001', now()),
  ('88888888-8888-4888-8888-888888888888', 'SS-SUP-0002', 'superadmin.b@staging.silverspoon.invalid', 'Synthetic Super Admin B', '+2348000000008', 'Abuja', 'active', 'Private', 'retail_individual', 'Tier 3', 'SSSUP002', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role, granted_by) VALUES
  ('11111111-1111-4111-8111-111111111111', 'investor', '77777777-7777-4777-8777-777777777777'),
  ('22222222-2222-4222-8222-222222222222', 'investor', '77777777-7777-4777-8777-777777777777'),
  ('33333333-3333-4333-8333-333333333333', 'finance_officer', '77777777-7777-4777-8777-777777777777'),
  ('44444444-4444-4444-8444-444444444444', 'finance_officer', '77777777-7777-4777-8777-777777777777'),
  ('55555555-5555-4555-8555-555555555555', 'compliance_officer', '77777777-7777-4777-8777-777777777777'),
  ('66666666-6666-4666-8666-666666666666', 'admin', '77777777-7777-4777-8777-777777777777'),
  ('77777777-7777-4777-8777-777777777777', 'super_admin', '88888888-8888-4888-8888-888888888888'),
  ('88888888-8888-4888-8888-888888888888', 'super_admin', '77777777-7777-4777-8777-777777777777')
ON CONFLICT DO NOTHING;

-- Provision synthetic wallets via internal service function
SELECT public.internal_provision_investor_wallet('11111111-1111-4111-8111-111111111111');
SELECT public.internal_provision_investor_wallet('22222222-2222-4222-8222-222222222222');

-- Synthetic Investment Plans (testing compounding eligibility & paused/archived guards)
INSERT INTO public.investment_plans (
  id, plan_code, slug, name, instrument_type, risk_band, tenor_days,
  min_amount_kobo, max_amount_kobo, illustrative_target_return_bps,
  allows_return_compounding, status, terms_version, summary
) VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'PLN-TBILL-90',
    'silver-treasury-90',
    'Silver Treasury Reserve 90D (Staging)',
    'fgn_treasury_bill',
    'Conservative',
    90,
    5000000, -- NGN 50,000
    5000000000,
    1450,
    false, -- Product terms restrict to principal-only rollover
    'active',
    'v1.0-staging',
    'Synthetic staging FGN Treasury Bill mandate; principal-only rollover permitted.'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'PLN-CP-180',
    'platinum-cp-180',
    'Platinum Commercial Paper 180D (Staging)',
    'corporate_commercial_paper',
    'Moderate',
    180,
    10000000, -- NGN 100,000
    10000000000,
    1800,
    true, -- Product terms permit return compounding WITH explicit investor consent
    'active',
    'v1.0-staging',
    'Synthetic staging corporate commercial paper mandate permitting consented net-return compounding.'
  )
ON CONFLICT (id) DO NOTHING;

-- Synthetic Effective-Dated Configurable Tax Rules (ADR-004: NO hard-coded universal rates)
INSERT INTO public.tax_rules (
  rule_code, tax_code, instrument_type, investor_classification,
  exemption_code, is_exempt, rate_bps, fixed_amount_kobo, min_threshold_kobo,
  effective_from, effective_to, legal_basis, is_active
) VALUES
  (
    'STG_WHT_FGNTB_RETAIL_EXEMPT',
    'WHT',
    'fgn_treasury_bill',
    'retail_individual',
    'FGN_SEC_EXEMPTION',
    true,
    0,
    0,
    0,
    '2025-01-01T00:00:00Z',
    NULL,
    'Synthetic Staging Rule: Eligible FGN Treasury Bill statutory exemption placeholder pending tax counsel sign-off.',
    true
  ),
  (
    'STG_WHT_CP_RETAIL_V1',
    'WHT',
    'corporate_commercial_paper',
    'retail_individual',
    NULL,
    false,
    1000, -- 10.00% during historical window
    0,
    0,
    '2025-01-01T00:00:00Z',
    '2026-06-01T00:00:00Z',
    'Synthetic Staging Historical Rule (v1) for effective-date resolution testing.',
    true
  ),
  (
    'STG_WHT_CP_RETAIL_V2',
    'WHT',
    'corporate_commercial_paper',
    'retail_individual',
    NULL,
    false,
    750, -- 7.50% effective from 2026-06-01 onward
    0,
    0,
    '2026-06-01T00:00:00Z',
    NULL,
    'Synthetic Staging Updated Rule (v2) demonstrating configurable effective-date rate transitions.',
    true
  )
ON CONFLICT (rule_code) DO NOTHING;

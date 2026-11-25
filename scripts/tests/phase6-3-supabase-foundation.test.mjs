import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SRC_ROOT = path.resolve(ROOT, "src");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = path.join(SRC_ROOT, specifier.slice(2));
      for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), base]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (/\.(png|jpe?g|webp|svg)$/i.test(url)) {
      return {
        format: "module",
        shortCircuit: true,
        source: `export default ${JSON.stringify(url)};`,
      };
    }
    return nextLoad(url, context);
  },
});

const {
  SUPABASE_LIVE_ACTIVATION_ALLOWED,
  getSupabaseActivationGuard,
  getSupabasePublicConfig,
  isForbiddenServiceRoleKey,
  isValidPublicSupabaseUrl,
  validateSupabasePublicConfig,
} = await import("@/services/supabase/config");

const {
  SupabaseClientDisabledError,
  SupabaseConfigurationError,
  createSupabaseClientFactory,
  getSupabaseClient,
} = await import("@/services/supabase/client");

const {
  FinancialUnitError,
  KOBO_PER_NAIRA,
  MAX_SAFE_KOBO,
  assertValidKobo,
  basisPointsToPercent,
  isValidKobo,
  koboToNaira,
  koboToNairaNullable,
  koboToNairaString,
  nairaToKobo,
  nairaToKoboNullable,
  sumKobo,
} = await import("@/services/supabase/financial");

const {
  ENUM_MISMATCH_REGISTRY,
  normalizeAccountStatus,
  normalizeBankVerificationStatus,
  normalizeClientTier,
  normalizeDepositChannel,
  normalizeInstrumentTypeToCategory,
  normalizeInvestmentStatus,
  normalizeKycStatus,
  normalizeKycTier,
  normalizeNotificationCategory,
  normalizePaymentStatus,
  normalizePlanRiskBand,
  normalizePlanStatus,
  normalizeReferralStatus,
  normalizeRolloverMode,
  normalizeTransactionStatus,
  normalizeTransactionType,
  normalizeUserRole,
  normalizeWalletStatus,
  resolvePrimaryUserRole,
} = await import("@/services/supabase/enums");

const {
  DbMappingError,
  mapBankAccountRow,
  mapDepositRow,
  mapInvestmentMaturityRow,
  mapInvestmentPayoutRow,
  mapInvestmentPlanRow,
  mapInvestmentRow,
  mapKycRecordRow,
  mapNotificationPreferenceRow,
  mapNotificationRow,
  mapPaymentReferenceRow,
  mapPlatformSettingsRows,
  mapProfileRow,
  mapReferralRow,
  mapReferralSettingsRow,
  mapTransactionRow,
  mapWalletSummaryRows,
  mapWithdrawalRow,
} = await import("@/services/supabase/mappers");

const { createStandbyReadOnlyQueryClient, READ_ONLY_QUERY_TABLE_MAP } = await import(
  "@/services/supabase/queries"
);
const { supabaseDataProvider } = await import("@/services/supabase/supabaseDataProvider");
const { createMockDataProvider } = await import("@/services/mockDataProvider");
const {
  InvalidDataProviderError,
  getProviderRegistrySummary,
  resolveDataProvider,
} = await import("@/services/dataProvider");

function collectSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function createFakeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.synthetic_signature_not_real`;
}

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    keys: () => Array.from(store.keys()),
  };
}

// ============================================================================
// A. CONFIGURATION SAFETY
// ============================================================================
describe("Phase 6.3 — A. Configuration Safety", () => {
  it("defaults safely to mock when VITE_DATA_PROVIDER and Supabase config are missing", () => {
    const cfg = getSupabasePublicConfig({});
    assert.equal(cfg.activeProvider, "mock");
    assert.equal(cfg.requestedProvider, "mock");
    assert.equal(cfg.providerValid, true);
    assert.equal(cfg.configured, false);
    assert.equal(cfg.url, null);
    assert.equal(cfg.anonKey, null);
    assert.equal(cfg.readinessStatus, "mock_active");
    assert.equal(cfg.activationGuard.activationAllowed, false);

    const validation = validateSupabasePublicConfig({});
    assert.equal(validation.valid, true);
    assert.equal(validation.configured, false);
    assert.equal(validation.forbiddenSecretDetected, false);
    assert.equal(validation.issues.length, 0);
  });

  it("keeps the explicit activation guard permanently disabled in Phase 6.3", () => {
    assert.equal(SUPABASE_LIVE_ACTIVATION_ALLOWED, false);
    const guard = getSupabaseActivationGuard();
    assert.equal(guard.activationAllowed, false);
    assert.equal(guard.phaseLock, "phase_6_3_local_only");
    assert.equal(guard.stagingIsolationGate, "blocked");
    assert.match(guard.reason, /Phase 6\.3/i);
  });

  it("rejects invalid VITE_DATA_PROVIDER values and never silently falls back to mock", () => {
    for (const bad of ["postgres", "firebase", "supabase-live", "prod", "invalid"]) {
      const cfg = getSupabasePublicConfig({ VITE_DATA_PROVIDER: bad });
      assert.equal(cfg.providerValid, false);
      assert.equal(cfg.activeProvider, null);
      assert.equal(cfg.requestedProvider, null);
      assert.equal(cfg.readinessStatus, "invalid_provider");
      assert.throws(() => resolveDataProvider({ VITE_DATA_PROVIDER: bad }), InvalidDataProviderError);
    }
  });

  it("validates public HTTPS URLs and rejects service-role / forbidden secret credentials", () => {
    assert.equal(isValidPublicSupabaseUrl("https://example-staging.supabase.co"), true);
    assert.equal(isValidPublicSupabaseUrl("http://insecure.supabase.co"), false);
    assert.equal(isValidPublicSupabaseUrl("https://user:pass@example.supabase.co"), false);
    assert.equal(isValidPublicSupabaseUrl("not-a-url"), false);

    const fakeAnonJwt = createFakeJwt({ role: "anon", ref: "example-only" });
    const fakeServiceRoleJwt = createFakeJwt({ role: "service_role", ref: "example-only" });

    assert.equal(isForbiddenServiceRoleKey(fakeAnonJwt), false);
    assert.equal(isForbiddenServiceRoleKey(fakeServiceRoleJwt), true);
    assert.equal(isForbiddenServiceRoleKey("sb_secret_fake_placeholder"), true);

    const badEnvValidation = validateSupabasePublicConfig({
      VITE_SUPABASE_URL: "https://example-only.supabase.co",
      VITE_SUPABASE_ANON_KEY: fakeServiceRoleJwt,
    });
    assert.equal(badEnvValidation.valid, false);
    assert.equal(badEnvValidation.forbiddenSecretDetected, true);

    const badVarNameValidation = validateSupabasePublicConfig({
      VITE_SUPABASE_SERVICE_ROLE_KEY: "anything",
    });
    assert.equal(badVarNameValidation.valid, false);
    assert.equal(badVarNameValidation.forbiddenSecretDetected, true);

    const partialValidation = validateSupabasePublicConfig({
      VITE_SUPABASE_URL: "https://example-only.supabase.co",
    });
    assert.equal(partialValidation.valid, false);
    assert.equal(partialValidation.configured, false);
  });
});

// ============================================================================
// B. CLIENT SAFETY
// ============================================================================
describe("Phase 6.3 — B. Client Safety & Boundary Isolation", () => {
  it("never auto-initializes, never performs network calls, and blocks live client construction", () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = () => {
      fetchCalls += 1;
      throw new Error("Network call MUST NOT occur in Phase 6.3");
    };

    try {
      const facade = getSupabaseClient();
      const status = facade.getStatus({});
      assert.equal(status.initialized, false);
      assert.equal(status.mode, "standby_disconnected");
      assert.equal(status.activationAllowed, false);
      assert.equal(status.stagingIsolationGate, "blocked");

      const factory = createSupabaseClientFactory();
      assert.equal(factory.activationAllowed, false);
      assert.equal(factory.canConstructClient(), false);

      const fakeAnonJwt = createFakeJwt({ role: "anon", ref: "synthetic-only" });
      const constructWithValidPublic = factory.constructClient({
        VITE_DATA_PROVIDER: "supabase",
        VITE_SUPABASE_URL: "https://synthetic-placeholder.supabase.co",
        VITE_SUPABASE_ANON_KEY: fakeAnonJwt,
      });
      assert.equal(constructWithValidPublic.ok, false);
      assert.equal(constructWithValidPublic.code, "ACTIVATION_DISABLED");

      assert.throws(
        () =>
          factory.assertCanConstructClient({
            VITE_SUPABASE_URL: "https://synthetic-placeholder.supabase.co",
            VITE_SUPABASE_ANON_KEY: fakeAnonJwt,
          }),
        SupabaseClientDisabledError,
      );

      const fakeServiceRoleJwt = createFakeJwt({ role: "service_role", ref: "synthetic-only" });
      const constructWithSecret = factory.constructClient({
        VITE_SUPABASE_URL: "https://synthetic-placeholder.supabase.co",
        VITE_SUPABASE_ANON_KEY: fakeServiceRoleJwt,
      });
      assert.equal(constructWithSecret.ok, false);
      assert.equal(constructWithSecret.code, "FORBIDDEN_SECRET_DETECTED");
      assert.throws(
        () =>
          factory.assertCanConstructClient({
            VITE_SUPABASE_URL: "https://synthetic-placeholder.supabase.co",
            VITE_SUPABASE_ANON_KEY: fakeServiceRoleJwt,
          }),
        SupabaseConfigurationError,
      );

      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("contains zero hardcoded live Supabase project URLs, zero service-role keys, and zero UI coupling", () => {
    const srcFiles = collectSourceFiles(SRC_ROOT);
    for (const file of srcFiles) {
      const rel = path.relative(SRC_ROOT, file);
      const content = readFileSync(file, "utf8");

      assert.doesNotMatch(
        content,
        /https:\/\/[a-z0-9]{10,}\.supabase\.co/i,
        `${rel} must not contain any hardcoded live Supabase project URL`,
      );
      assert.doesNotMatch(
        content,
        /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/,
        `${rel} must not contain any hardcoded JWT API key`,
      );
      assert.doesNotMatch(
        content,
        /from\s+["']@supabase\/supabase-js["']/,
        `${rel} must not import @supabase/supabase-js in Phase 6.3`,
      );

      // UI pages and components must never import from @/services/supabase/*
      if (rel.startsWith("pages/") || rel.startsWith("components/") || rel.startsWith("layouts/")) {
        assert.doesNotMatch(
          content,
          /@\/services\/supabase/,
          `UI file ${rel} must never import directly from @/services/supabase/*`,
        );
      }
    }
  });
});

// ============================================================================
// C. FINANCIAL UNIT NORMALIZATION (KOBO <-> NAIRA)
// ============================================================================
describe("Phase 6.3 — C. Financial Unit Normalization (Integer Kobo <-> Naira)", () => {
  it("converts kobo to Naira and Naira to kobo accurately using integer arithmetic", () => {
    assert.equal(KOBO_PER_NAIRA, 100);

    // Classic binary floating-point edge cases (19.99 * 100 = 1998.9999999999998 in IEEE-754)
    assert.equal(nairaToKobo(19.99), 1999);
    assert.equal(nairaToKobo("19.99"), 1999);
    assert.equal(nairaToKobo("10.500"), 1050);
    assert.equal(nairaToKobo("250000"), 25_000_000);
    assert.equal(nairaToKobo("250000.05"), 25_000_005);

    assert.equal(koboToNaira(1999), 19.99);
    assert.equal(koboToNaira(1), 0.01);
    assert.equal(koboToNaira(100), 1);
    assert.equal(koboToNaira("25000005"), 250_000.05);
    assert.equal(koboToNaira(5_000_000_000n), 50_000_000);
    assert.equal(koboToNairaString(123_456n), "1234.56");
    assert.equal(koboToNairaString("99999999999999999999"), "999999999999999999.99");
  });

  it("handles zero, nullable, large safe integers, and basis points accurately", () => {
    assert.equal(koboToNaira(0), 0);
    assert.equal(koboToNaira(-0), 0);
    assert.equal(koboToNaira("0"), 0);
    assert.equal(koboToNairaString(0), "0.00");
    assert.equal(nairaToKobo(0), 0);
    assert.equal(nairaToKobo("0.00"), 0);
    assert.equal(koboToNairaNullable(null), null);
    assert.equal(koboToNairaNullable(undefined), null);
    assert.equal(nairaToKoboNullable(null), null);
    assert.equal(nairaToKoboNullable(undefined), null);

    // Large safe values (₦50,000,000 = 5,000,000,000 kobo and near MAX_SAFE_INTEGER)
    assert.equal(nairaToKobo(50_000_000), 5_000_000_000);
    assert.equal(koboToNaira(5_000_000_000), 50_000_000);
    assert.equal(assertValidKobo(MAX_SAFE_KOBO), MAX_SAFE_KOBO);
    assert.equal(koboToNairaString(MAX_SAFE_KOBO), "90071992547409.91");
    assert.equal(sumKobo([100_000, "250000", 50_000n]), 400_000);

    // Negative when explicitly permitted
    assert.equal(koboToNaira(-15050, { allowNegative: true }), -150.5);
    assert.equal(nairaToKobo("-150.50", { allowNegative: true }), -15050);

    // Basis points
    assert.equal(basisPointsToPercent(1450), 14.5);
    assert.equal(basisPointsToPercent(0), 0);
    assert.equal(basisPointsToPercent(250), 2.5);
  });

  it("rejects invalid inputs, non-finite values, unsafe integers, and fractional kobo", () => {
    // Fractional kobo MUST be rejected
    assert.equal(isValidKobo(100.5), false);
    assert.throws(() => assertValidKobo(100.5), (err) => err instanceof FinancialUnitError && err.code === "FRACTIONAL_KOBO");
    assert.throws(() => assertValidKobo("100.5"), (err) => err instanceof FinancialUnitError && err.code === "FRACTIONAL_KOBO");
    assert.throws(() => koboToNaira(0.1), FinancialUnitError);
    assert.throws(() => nairaToKobo(10.005), (err) => err instanceof FinancialUnitError && err.code === "SUB_KOBO_PRECISION");
    assert.throws(() => nairaToKobo("10.123"), (err) => err instanceof FinancialUnitError && err.code === "SUB_KOBO_PRECISION");

    // Non-finite, negative (by default), unsafe integers, and malformed strings MUST be rejected
    for (const bad of [NaN, Infinity, -Infinity, "", "abc", "12,000", null, undefined, {}, []]) {
      assert.throws(() => assertValidKobo(bad), FinancialUnitError);
    }
    assert.throws(() => assertValidKobo(-100), (err) => err instanceof FinancialUnitError && err.code === "NEGATIVE_DISALLOWED");
    assert.throws(() => nairaToKobo(-1), (err) => err instanceof FinancialUnitError && err.code === "NEGATIVE_DISALLOWED");
    assert.throws(() => assertValidKobo(BigInt(MAX_SAFE_KOBO) + 1n), (err) => err instanceof FinancialUnitError && err.code === "UNSAFE_INTEGER");
    assert.throws(() => nairaToKobo(1e-7), FinancialUnitError);
    assert.throws(() => nairaToKobo("90071992547410.00"), (err) => err instanceof FinancialUnitError && err.code === "UNSAFE_INTEGER");
    assert.throws(() => basisPointsToPercent(12.5), FinancialUnitError);
    assert.throws(() => basisPointsToPercent(-1), FinancialUnitError);
  });
});

// ============================================================================
// D. DATABASE & ENUM MAPPING LAYER
// ============================================================================
describe("Phase 6.3 — D. Database-to-Frontend Mapping & Enum Normalization", () => {
  it("normalizes known database enums, documents mismatches, and fails closed on unknown values", () => {
    assert.ok(ENUM_MISMATCH_REGISTRY.length >= 10);

    // Account statuses (unknown fails closed -> Suspended, never Active)
    assert.equal(normalizeAccountStatus("active").value, "Active");
    assert.equal(normalizeAccountStatus("frozen").value, "Suspended");
    assert.equal(normalizeAccountStatus("frozen").exact, false);
    const unknownAcc = normalizeAccountStatus("alien_status");
    assert.equal(unknownAcc.known, false);
    assert.equal(unknownAcc.value, "Suspended");

    // Roles (unknown fails closed -> investor, never admin)
    assert.equal(normalizeUserRole("finance_officer").value, "admin");
    assert.equal(normalizeUserRole("finance_officer").exact, false);
    assert.equal(normalizeUserRole("unknown_superuser").value, "investor");
    assert.equal(normalizeUserRole("unknown_superuser").known, false);
    const primaryRole = resolvePrimaryUserRole(["investor", "compliance_officer"]);
    assert.equal(primaryRole.value, "admin");
    assert.deepEqual(primaryRole.dbRoles, ["investor", "compliance_officer"]);

    // Tiers & KYC tiers (Tier 0 -> Tier 1 conservatively; unknown -> Tier 1)
    assert.equal(normalizeClientTier("Private").value, "Sovereign");
    assert.equal(normalizeKycTier("Tier 0").value, "Tier 1");
    assert.equal(normalizeKycTier("Tier 99").value, "Tier 1");
    assert.equal(normalizeKycTier("Tier 99").known, false);

    // Transaction types (accounting-only types map to null without fabrication)
    assert.equal(normalizeTransactionType("deposit").value, "Deposit");
    assert.equal(normalizeTransactionType("tax_withholding").value, null);
    assert.equal(normalizeTransactionType("tax_withholding").known, true);
    assert.equal(normalizeTransactionType("fee").value, null);
    assert.equal(normalizeTransactionType("unknown_type").value, null);
    assert.equal(normalizeTransactionType("unknown_type").known, false);

    // Transaction status (unknown fails closed -> Pending, never Completed)
    assert.equal(normalizeTransactionStatus("pending_approval").value, "Pending");
    assert.equal(normalizeTransactionStatus("completed").value, "Completed");
    assert.equal(normalizeTransactionStatus("reversed").value, "Declined");
    assert.equal(normalizeTransactionStatus("mystery_state").value, "Pending");

    // Rollover mode (ADR-005: principal_only -> false, principal_plus_net_return -> true, unknown -> false)
    assert.equal(normalizeRolloverMode("principal_only").value, false);
    assert.equal(normalizeRolloverMode("principal_only").exact, false);
    assert.equal(normalizeRolloverMode("principal_plus_net_return").value, true);
    assert.equal(normalizeRolloverMode("bogus_rollover").value, false);

    // Plans, investments, KYC, notifications, payments, channels, referrals, wallets
    assert.equal(normalizePlanStatus("draft").value, "Paused");
    assert.equal(normalizePlanStatus("unknown").value, "Paused");
    assert.equal(normalizePlanRiskBand("Conservative").value, "Low");
    assert.equal(normalizeInvestmentStatus("rolled_over").value, "Matured");
    assert.equal(normalizeKycStatus("expired").value, "Needs Resubmission");
    assert.equal(normalizeNotificationCategory("Compliance").value, "security");
    assert.equal(normalizePaymentStatus("succeeded").value, "Completed");
    assert.equal(normalizeDepositChannel("paystack_checkout_card").value, "Paystack Card Checkout");
    assert.equal(normalizeBankVerificationStatus("verified").value, "Simulated Verified");
    assert.equal(normalizeReferralStatus("qualified").value, "Active");
    assert.equal(normalizeWalletStatus("unknown").value, "frozen");
    assert.equal(normalizeInstrumentTypeToCategory("fgn_treasury_bill").value, "FGN Treasury Bills");
  });

  it("maps valid profiles, bank accounts, wallets, transactions, deposits, withdrawals, and payment references", () => {
    const bank = mapBankAccountRow({
      id: "ba-1",
      wallet_id: "wal-1",
      user_id: "usr-1",
      bank_code: "058",
      bank_name: "GTBank",
      account_number: "0123456789",
      account_name: "CHIOMA NWOSU",
      account_purpose: "payout_nuban",
      is_primary: true,
      verification_status: "verified",
      change_approval_action_id: "act-1",
      verified_at: "2026-11-20T10:00:00.000Z",
      revoked_at: null,
      created_at: "2026-11-19T10:00:00.000Z",
      updated_at: "2026-11-20T10:00:00.000Z",
    });
    assert.equal(bank.bankAccount.verified, true);
    assert.equal(bank.bankAccount.accountNumber, "0123456789");

    const profile = mapProfileRow(
      {
        id: "usr-1",
        client_code: "SS-INV-0001",
        email: "chioma@example.ng",
        full_name: "Chioma Nwosu",
        phone: null,
        city: null,
        address: null,
        status_code: "pending_verification",
        tier: "Private",
        investor_classification: "hnw_individual",
        kyc_tier: "Tier 0",
        referral_code: "SS-CHIOMA01",
        email_verified_at: null,
        closed_at: null,
        created_at: "2026-11-20T10:00:00.000Z",
        updated_at: "2026-11-20T10:00:00.000Z",
      },
      { roles: ["investor"] },
    );
    assert.equal(profile.profile.tier, "Sovereign");
    assert.equal(profile.profile.status, "Pending KYC");
    assert.equal(profile.profile.kycLevel, "Tier 1");
    assert.equal(profile.profile.emailVerified, false);
    assert.equal(profile.dbMeta.phone, null);
    assert.equal(profile.dbMeta.dbKycTier, "Tier 0");
    assert.ok(profile.warnings.length >= 3);

    const wallet = mapWalletSummaryRows(
      {
        wallet_id: "wal-1",
        user_id: "usr-1",
        currency: "NGN",
        available_kobo: "15000000", // ₦150,000.00
        reserved_withdrawal_kobo: 5_000_000, // ₦50,000.00
        invested_principal_kobo: 20_000_000, // ₦200,000.00
        pending_deposit_kobo: 2_500_000,
        realized_earnings_kobo: 1_250_050, // ₦12,500.50
        total_customer_liability_kobo: 40_000_000, // ₦400,000.00
        last_journal_entry_id: "je-1",
        reconciled_at: "2026-11-24T12:00:00.000Z",
        updated_at: "2026-11-24T12:00:00.000Z",
      },
      {
        id: "wal-1",
        user_id: "usr-1",
        currency: "NGN",
        status: "active",
        available_account_id: "la-avail",
        reserved_account_id: "la-resv",
        invested_account_id: "la-inv",
        frozen_reason: null,
        frozen_by: null,
        frozen_at: null,
        created_at: "2026-11-20T10:00:00.000Z",
        updated_at: "2026-11-24T12:00:00.000Z",
      },
    );
    assert.equal(wallet.metrics.availableBalance, 150_000);
    assert.equal(wallet.metrics.pendingWithdrawals, 50_000);
    assert.equal(wallet.metrics.activeInvestments, 200_000);
    assert.equal(wallet.metrics.totalWalletBalance, 400_000);
    assert.equal(wallet.metrics.realizedEarnings, 12_500.5);
    assert.equal(wallet.balancesKobo.pendingDepositKobo, 2_500_000);

    // Standard transaction + backend-only tax_withholding transaction
    const depTxn = mapTransactionRow({
      id: "txn-1",
      reference: "SS-DEP-20261124-ABCD",
      idempotency_key: "idem-dep-1",
      user_id: "usr-1",
      wallet_id: "wal-1",
      transaction_type: "deposit",
      status: "completed",
      amount_kobo: 25_000_000,
      fee_kobo: 0,
      tax_kobo: 0,
      net_amount_kobo: 25_000_000,
      currency: "NGN",
      description: "Verified Paystack deposit",
      primary_journal_entry_id: "je-dep-1",
      reversal_journal_entry_id: null,
      metadata: { channel: "paystack_checkout_bank_transfer" },
      created_at: "2026-11-24T10:00:00.000Z",
      updated_at: "2026-11-24T10:05:00.000Z",
    });
    assert.equal(depTxn.transaction?.type, "Deposit");
    assert.equal(depTxn.transaction?.amount, 250_000);
    assert.equal(depTxn.transaction?.channel, "Paystack Bank Transfer");

    const taxTxn = mapTransactionRow({
      id: "txn-tax-1",
      reference: "SS-TAX-20261124-0001",
      idempotency_key: "idem-tax-1",
      user_id: "usr-1",
      wallet_id: "wal-1",
      transaction_type: "tax_withholding",
      status: "completed",
      amount_kobo: 50_000,
      fee_kobo: 0,
      tax_kobo: 50_000,
      net_amount_kobo: 0,
      currency: "NGN",
      description: "Statutory WHT deduction",
      primary_journal_entry_id: "je-tax-1",
      reversal_journal_entry_id: null,
      metadata: null,
      created_at: "2026-11-24T10:00:00.000Z",
      updated_at: "2026-11-24T10:00:00.000Z",
    });
    assert.equal(taxTxn.transaction, null);
    assert.equal(taxTxn.dbMeta.dbTransactionType, "tax_withholding");
    assert.equal(taxTxn.amountsKobo.taxKobo, 50_000);

    const dep = mapDepositRow({
      id: "dep-1",
      transaction_id: "txn-1",
      user_id: "usr-1",
      wallet_id: "wal-1",
      channel: "paystack_checkout_card",
      expected_amount_kobo: 25_000_000,
      settled_amount_kobo: null,
      paystack_reference: "PSK-REF-1001",
      status: "pending",
      server_verified_at: null,
      server_verification_ref: null,
      settlement_journal_entry_id: null,
      settled_at: null,
      failure_reason: null,
      created_at: "2026-11-24T10:00:00.000Z",
      updated_at: "2026-11-24T10:00:00.000Z",
    });
    assert.equal(dep.expectedAmountNaira, 250_000);
    assert.equal(dep.settledAmountNaira, null);

    const wd = mapWithdrawalRow({
      id: "wd-1",
      transaction_id: "txn-wd-1",
      user_id: "usr-1",
      wallet_id: "wal-1",
      wallet_account_id: "ba-1",
      withdrawal_batch_id: null,
      amount_kobo: 10_000_000,
      fee_kobo: 250_000,
      total_reserved_kobo: 10_250_000,
      payout_idempotency_ref: "PAYOUT-WDR-001",
      status: "pending_approval",
      initiated_by: "usr-1",
      approved_by: null,
      four_eyes_action_id: "act-wd-1",
      reserve_journal_entry_id: "je-resv-1",
      settlement_journal_entry_id: null,
      release_journal_entry_id: null,
      provider_transfer_ref: null,
      verified_settlement_at: null,
      settled_at: null,
      failure_reason: null,
      created_at: "2026-11-24T11:00:00.000Z",
      updated_at: "2026-11-24T11:00:00.000Z",
    });
    assert.equal(wd.amountNaira, 100_000);
    assert.equal(wd.feeNaira, 2_500);
    assert.equal(wd.totalReservedNaira, 102_500);
    assert.equal(wd.frontendStatus, "Pending");

    const payRef = mapPaymentReferenceRow({
      id: "pr-1",
      provider_id: "prov-1",
      transaction_id: "txn-1",
      provider_reference: "PSK-REF-1001",
      channel: "paystack_checkout_card",
      status: "initialized",
      amount_kobo: 25_000_000,
      raw_summary: null,
      created_at: "2026-11-24T10:00:00.000Z",
      updated_at: "2026-11-24T10:00:00.000Z",
    });
    assert.equal(payRef.frontendStatus, "Pending");
    assert.equal(payRef.amountNaira, 250_000);
  });

  it("maps investment plans, positions, payouts, maturities, notifications, KYC, referrals, and settings", () => {
    const plan = mapInvestmentPlanRow({
      id: "plan-1",
      plan_code: "PLN-TBILL-90",
      slug: "fgn-tbill-90",
      name: "FGN Treasury Bill 90-Day",
      instrument_type: "fgn_treasury_bill",
      risk_band: "Conservative",
      tenor_days: 90,
      min_amount_kobo: 10_000_000,
      max_amount_kobo: null,
      illustrative_target_return_bps: 1450,
      allows_return_compounding: false,
      status: "draft",
      terms_version: "v1.0",
      summary: "Short-duration FGN Treasury Bill mandate.",
      created_by: null,
      created_at: "2026-11-20T00:00:00.000Z",
      updated_at: "2026-11-20T00:00:00.000Z",
    });
    assert.equal(plan.plan.minAmount, 100_000);
    assert.equal(plan.plan.targetReturnPercent, 14.5);
    assert.equal(plan.plan.riskBand, "Low");
    assert.equal(plan.plan.status, "Paused");
    assert.equal(plan.dbMeta.maxAmountKobo, null);
    assert.equal(plan.dbMeta.dbStatus, "draft");

    const inv = mapInvestmentRow({
      id: "inv-1",
      position_code: "INV-20261124-01",
      user_id: "usr-1",
      wallet_id: "wal-1",
      plan_id: "plan-1",
      subscription_transaction_id: "txn-sub-1",
      subscription_journal_entry_id: "je-sub-1",
      principal_kobo: 20_000_000,
      illustrative_projected_return_kobo: 725_000,
      status: "active",
      rollover_mode: "principal_only",
      return_compounding_consented_at: null,
      return_compounding_consent_version: null,
      parent_investment_id: null,
      started_at: "2026-11-24T00:00:00.000Z",
      matures_at: "2027-02-22T00:00:00.000Z",
      matured_at: null,
      created_at: "2026-11-24T00:00:00.000Z",
      updated_at: "2026-11-24T00:00:00.000Z",
    });
    assert.equal(inv.investment.principal, 200_000);
    assert.equal(inv.investment.projectedReturn, 7_250);
    assert.equal(inv.investment.autoCompound, false);
    assert.equal(inv.dbMeta.dbRolloverMode, "principal_only");

    const payout = mapInvestmentPayoutRow({
      id: "pay-1",
      investment_id: "inv-1",
      user_id: "usr-1",
      payout_sequence: 1,
      transaction_id: "txn-pay-1",
      gross_amount_kobo: 725_000,
      fee_kobo: 25_000,
      total_tax_kobo: 70_000,
      net_amount_kobo: 630_000,
      treasury_funding_reference: "TRS-YLD-0001",
      four_eyes_action_id: "act-pay-1",
      journal_entry_id: "je-pay-1",
      distributed_at: "2027-02-22T12:00:00.000Z",
    });
    assert.equal(payout.grossAmountNaira, 7_250);
    assert.equal(payout.netAmountNaira, 6_300);

    const maturity = mapInvestmentMaturityRow({
      id: "mat-1",
      investment_id: "inv-1",
      user_id: "usr-1",
      maturity_transaction_id: "txn-mat-1",
      maturity_journal_entry_id: "je-mat-1",
      principal_kobo: 20_000_000,
      net_return_kobo: 630_000,
      requested_rollover_mode: "principal_only",
      applied_rollover_mode: "principal_only",
      maturity_disposition: "rolled_principal_only",
      child_investment_id: "inv-2",
      processed_by: "adm-1",
      processed_at: "2027-02-22T12:00:00.000Z",
      notes: null,
    });
    assert.equal(maturity.principalNaira, 200_000);
    assert.equal(maturity.maturityDisposition, "rolled_principal_only");

    const notif = mapNotificationRow({
      id: "ntf-1",
      user_id: "usr-1",
      category: "Wallet",
      title: "Deposit settled",
      body: "Your deposit has settled.",
      is_read: false,
      read_at: null,
      metadata: null,
      created_at: "2026-11-24T10:05:00.000Z",
    });
    assert.equal(notif.notification.read, false);
    assert.equal(notif.dbMeta.dbCategory, "Wallet");

    const notifPref = mapNotificationPreferenceRow({
      user_id: "usr-1",
      email_enabled: true,
      in_app_enabled: true,
      security_alerts_enabled: true,
      marketing_opt_in: false,
      updated_at: "2026-11-24T10:05:00.000Z",
    });
    assert.equal(notifPref.securityAlertsEnabled, true);

    const kyc = mapKycRecordRow({
      id: "kyc-1",
      user_id: "usr-1",
      target_tier: "Tier 2",
      status: "submitted",
      vendor_code: null,
      vendor_reference: null,
      bvn_hash: "deadbeef_must_not_leak",
      bvn_last4: "4321",
      nin_hash: "cafebabe_must_not_leak",
      nin_last4: "8765",
      liveness_status: "not_checked",
      pep_sanctions_status: "not_checked",
      submitted_at: "2026-11-24T09:00:00.000Z",
      verified_at: null,
      retention_until: "2031-11-24T09:00:00.000Z",
      metadata: {},
      created_at: "2026-11-24T09:00:00.000Z",
      updated_at: "2026-11-24T09:00:00.000Z",
    });
    assert.equal(kyc.submission?.status, "Under Review");
    assert.equal(kyc.submission?.bvnLast4, "4321");
    assert.equal("bvnHash" in kyc.dbMeta, false);
    assert.equal("ninHash" in kyc.dbMeta, false);

    const refSettings = mapReferralSettingsRow({
      id: "rs-1",
      commission_rate_bps: 150,
      min_qualifying_investment_kobo: 10_000_000,
      is_active: true,
      effective_from: "2026-11-01T00:00:00.000Z",
      effective_to: null,
      approval_action_id: null,
      created_at: "2026-11-01T00:00:00.000Z",
    });
    assert.equal(refSettings.commissionRatePercent, 1.5);
    assert.equal(refSettings.minQualifyingInvestmentNaira, 100_000);

    const ref = mapReferralRow(
      {
        id: "ref-1",
        referrer_user_id: "usr-1",
        referred_user_id: "usr-2",
        referral_code_used: "SS-CHIOMA01",
        qualifying_investment_id: "inv-2",
        status: "paid",
        created_at: "2026-11-21T00:00:00.000Z",
        updated_at: "2026-11-24T00:00:00.000Z",
      },
      {
        qualifyingInvestmentPrincipalKobo: 20_000_000,
        commissionRateBps: 150,
        commission: {
          id: "rc-1",
          referral_id: "ref-1",
          qualifying_investment_id: "inv-2",
          referrer_user_id: "usr-1",
          transaction_id: "txn-ref-1",
          journal_entry_id: "je-ref-1",
          commission_kobo: 300_000,
          four_eyes_action_id: "act-ref-1",
          paid_at: "2026-11-24T00:00:00.000Z",
        },
      },
    );
    assert.equal(ref.referral.commissionEarned, 3_000);
    assert.equal(ref.referral.status, "Paid");

    const settings = mapPlatformSettingsRows([
      {
        key: "deposit.min_kobo",
        category: "limits",
        value_json: { amount_kobo: 1_000_000 },
        is_sensitive: true,
        description: "Min deposit",
        updated_by: null,
        approval_action_id: null,
        version: 1,
        created_at: "2026-11-20T00:00:00.000Z",
        updated_at: "2026-11-20T00:00:00.000Z",
      },
      {
        key: "withdrawal.fee_schedule",
        category: "fees",
        value_json: {
          standard_fee_kobo: 0,
          high_value_threshold_kobo: 1_000_000_000,
          high_value_fee_kobo: 250_000,
        },
        is_sensitive: true,
        description: "Fee schedule",
        updated_by: null,
        approval_action_id: null,
        version: 1,
        created_at: "2026-11-20T00:00:00.000Z",
        updated_at: "2026-11-20T00:00:00.000Z",
      },
      {
        key: "custom.future_flag",
        category: "general",
        value_json: { enabled: true },
        is_sensitive: false,
        description: "Future key",
        updated_by: null,
        approval_action_id: null,
        version: 1,
        created_at: "2026-11-20T00:00:00.000Z",
        updated_at: "2026-11-20T00:00:00.000Z",
      },
    ]);
    assert.equal(settings.frontendSettingsPatch.minDepositAmount, 10_000);
    assert.equal(settings.frontendSettingsPatch.highValueWithdrawalFee, 2_500);
    assert.deepEqual(settings.unknownKeys, ["custom.future_flag"]);
  });

  it("rejects invalid record structures and financial invariant violations explicitly", () => {
    assert.throws(() => mapProfileRow(null), DbMappingError);
    assert.throws(() => mapProfileRow({}), DbMappingError);

    // Invalid NUBAN length
    assert.throws(
      () =>
        mapBankAccountRow({
          id: "ba-bad",
          wallet_id: "wal-1",
          user_id: "usr-1",
          bank_code: "058",
          bank_name: "GTBank",
          account_number: "12345",
          account_name: "BAD NUBAN",
          account_purpose: "payout_nuban",
          is_primary: true,
          verification_status: "pending_approval",
          change_approval_action_id: null,
          verified_at: null,
          revoked_at: null,
          created_at: "2026-11-20T00:00:00.000Z",
          updated_at: "2026-11-20T00:00:00.000Z",
        }),
      DbMappingError,
    );

    // ADR-009 liability mismatch (available + reserved + invested != total_customer_liability_kobo)
    assert.throws(
      () =>
        mapWalletSummaryRows({
          wallet_id: "wal-1",
          user_id: "usr-1",
          currency: "NGN",
          available_kobo: 100_000,
          reserved_withdrawal_kobo: 50_000,
          invested_principal_kobo: 200_000,
          pending_deposit_kobo: 0,
          realized_earnings_kobo: 0,
          total_customer_liability_kobo: 999_999,
          last_journal_entry_id: null,
          reconciled_at: "2026-11-24T00:00:00.000Z",
          updated_at: "2026-11-24T00:00:00.000Z",
        }),
      DbMappingError,
    );

    // Non-NGN currency rejected
    assert.throws(
      () =>
        mapWalletSummaryRows({
          wallet_id: "wal-1",
          user_id: "usr-1",
          currency: "USD",
          available_kobo: 0,
          reserved_withdrawal_kobo: 0,
          invested_principal_kobo: 0,
          pending_deposit_kobo: 0,
          realized_earnings_kobo: 0,
          total_customer_liability_kobo: 0,
          last_journal_entry_id: null,
          reconciled_at: "2026-11-24T00:00:00.000Z",
          updated_at: "2026-11-24T00:00:00.000Z",
        }),
      DbMappingError,
    );

    // Payout net formula mismatch
    assert.throws(
      () =>
        mapInvestmentPayoutRow({
          id: "pay-bad",
          investment_id: "inv-1",
          user_id: "usr-1",
          payout_sequence: 1,
          transaction_id: "txn-1",
          gross_amount_kobo: 100_000,
          fee_kobo: 10_000,
          total_tax_kobo: 10_000,
          net_amount_kobo: 95_000, // should be 80_000
          treasury_funding_reference: "TRS-001",
          four_eyes_action_id: "act-1",
          journal_entry_id: "je-1",
          distributed_at: "2026-11-24T00:00:00.000Z",
        }),
      DbMappingError,
    );

    // Self-referral rejected
    assert.throws(
      () =>
        mapReferralRow({
          id: "ref-bad",
          referrer_user_id: "usr-1",
          referred_user_id: "usr-1",
          referral_code_used: "SS-SELF01",
          qualifying_investment_id: null,
          status: "pending",
          created_at: "2026-11-24T00:00:00.000Z",
          updated_at: "2026-11-24T00:00:00.000Z",
        }),
      DbMappingError,
    );
  });
});

// ============================================================================
// E. PROVIDER REGRESSION & READ-ONLY QUERY STANDBY
// ============================================================================
describe("Phase 6.3 — E. Provider Regression & Read-Only Query Standby", () => {
  it("preserves mock provider workflows, disconnected Supabase standby, and read-only query contracts", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = () => {
      fetchCalls += 1;
      throw new Error("Network call MUST NOT occur in Phase 6.3");
    };

    try {
      // Registry summary includes disabled activation flag
      const summary = getProviderRegistrySummary({});
      assert.equal(summary.activeProviderId, "mock");
      assert.equal(summary.providerValid, true);
      assert.equal(summary.supabaseStandby, true);
      assert.equal(summary.supabaseActivationAllowed, false);

      // Mock provider still operates normally
      const mock = createMockDataProvider({ storage: createMemoryStorage() });
      const reg = await mock.register({
        fullName: "Tunde Bakare",
        email: "tunde.bakare@example.ng",
        phone: "+234 803 555 6677",
        password: "Password2026!",
      });
      assert.equal(reg.ok, true);
      assert.equal(reg.data?.role, "investor");

      // Supabase standby remains strictly disconnected and exposes read-only query contract
      const resolvedSupabase = resolveDataProvider({ VITE_DATA_PROVIDER: "supabase" });
      assert.equal(resolvedSupabase, supabaseDataProvider);
      assert.equal(resolvedSupabase.standbyMode, true);
      assert.equal(supabaseDataProvider.getActivationGuard().activationAllowed, false);
      assert.equal(supabaseDataProvider.getClientFactory().canConstructClient(), false);

      const readQueries = createStandbyReadOnlyQueryClient();
      assert.equal(readQueries.mode, "standby_disconnected");
      assert.equal(Object.keys(READ_ONLY_QUERY_TABLE_MAP).length, 21);

      const readChecks = await Promise.all([
        readQueries.profile.getOwnProfile(),
        readQueries.profile.getOwnBankAccounts(),
        readQueries.wallet.getOwnWalletSummary(),
        readQueries.transactions.listOwnTransactions(),
        readQueries.transactions.listOwnDeposits(),
        readQueries.transactions.listOwnWithdrawals(),
        readQueries.investments.listOwnInvestments(),
        readQueries.investments.listOwnPayouts(),
        readQueries.investments.listOwnMaturities(),
        readQueries.plans.listPublicActivePlans(),
        readQueries.notifications.listOwnNotifications(),
        readQueries.kyc.getLatestOwnKycStatus(),
        readQueries.referrals.listOwnReferrals(),
        readQueries.settings.getStaffPlatformSettings(),
      ]);

      for (const result of readChecks) {
        assert.equal(result.ok, false);
        assert.equal(result.code, "STANDBY_DISCONNECTED");
      }

      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

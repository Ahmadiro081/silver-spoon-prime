/**
 * SILVER SPOON — Phase 6.5 Pre-Flight Auth Regression & Investor Read-Only Data Integration Tests
 *
 * Covers:
 * - H1 / Part A: All 10 authentication pre-flight scenarios across simulated browser refreshes
 * - H2: Provider orchestration, 21-method query contract reuse, and disconnected Supabase standby
 * - H3: All 10 investor read-only data domains (profile, account status, wallet, transactions,
 *       deposits, withdrawals, investments, 4 unchanged plans, notifications, masked KYC)
 * - H4: Strict investor identity scoping, cross-investor isolation, unauthenticated/expired guards,
 *       and tampered localStorage role protection
 * - H5: Integer-kobo financial precision & ADR-009 liability invariant
 * - H7: Zero network requests, zero Supabase SDK install, 14 frozen migrations intact
 *
 * Run: node --test scripts/tests/phase6-5-investor-readonly.test.mjs
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SRC_DIR = path.join(ROOT, "src");

function resolveLocalFile(base) {
  const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), base];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const resolved = resolveLocalFile(path.join(SRC_DIR, specifier.slice(2)));
      if (resolved) return { url: resolved, shortCircuit: true };
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file://")
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const resolved = resolveLocalFile(path.resolve(parentDir, specifier));
      if (resolved) return { url: resolved, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (/\.(jpg|jpeg|png|webp|svg)(\?.*)?$/i.test(url)) {
      return {
        format: "module",
        source: `export default ${JSON.stringify(url)};`,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const authIndex = await import("../../src/services/auth/index.ts");
const verifierMod = await import("../../src/services/auth/mockCredentialVerifier.ts");
const dataProviderMod = await import("../../src/services/dataProvider.ts");
const investorMod = await import("../../src/services/investor/index.ts");
const mockProviderMod = await import("../../src/services/mockDataProvider.ts");
const supabaseConfig = await import("../../src/services/supabase/config.ts");
const financial = await import("../../src/services/supabase/financial.ts");
const queriesMod = await import("../../src/services/supabase/queries.ts");

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _dump: () => Object.fromEntries(map.entries()),
  };
}

function walkTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkTsFiles(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// ── H1 / Part A: Mandatory Authentication Pre-Flight Scenarios (1–10) ────────

describe("Phase 6.5 Part A / H1 — Authentication Persistence & Refresh Regression", () => {
  it("completes all 10 pre-flight auth scenarios across simulated browser refreshes with zero plaintext password persistence", async () => {
    const storage = createMemoryStorage();
    const initialPw = "InvestorPass#2026";
    const resetPw = "RecoveredPass#2026";
    const changedPw = "ChangedPass#2026!";

    // Browser session #1: Register (1) & Verify email (2)
    const provider1 = mockProviderMod.createMockDataProvider({ storage });
    const adapter1 = authIndex.createMockAuthAdapter({ dataProvider: provider1 });

    const reg = await adapter1.register({
      fullName: "Chinedu Okafor",
      email: "chinedu@example.ng",
      password: initialPw,
      phone: "+2348012345678",
    });
    assert.equal(reg.ok, true);
    assert.equal(reg.data.user.emailVerified, false);

    const codeRes = await adapter1.resendVerificationEmail();
    assert.equal(codeRes.ok, true);
    const verifyRes = await adapter1.verifyEmail({
      email: "chinedu@example.ng",
      tokenOrCode: codeRes.data.simulatedCode,
    });
    assert.equal(verifyRes.ok, true);
    assert.equal(verifyRes.data.emailVerified, true);

    // (3) Simulated browser refresh #1 (fresh provider & auth adapter over same storage)
    const provider2 = mockProviderMod.createMockDataProvider({ storage });
    const adapter2 = authIndex.createMockAuthAdapter({ dataProvider: provider2 });
    await provider2.hydrateState();

    // (4) Confirm existing session is restored correctly
    const restoredSession = await adapter2.getSession();
    const restoredUser = await adapter2.getCurrentUser();
    assert.equal(restoredSession.ok, true);
    assert.equal(restoredSession.data?.authenticated, true);
    assert.equal(restoredUser.data?.email, "chinedu@example.ng");
    assert.equal(restoredUser.data?.emailVerified, true);

    // (5) Log out
    const logoutRes = await adapter2.logout();
    assert.equal(logoutRes.ok, true);
    assert.equal((await adapter2.getSession()).data, null);

    // (6) Attempt login again using same credentials AFTER browser refresh
    const badRelogin = await adapter2.login({
      email: "chinedu@example.ng",
      password: "WrongPassword#999",
    });
    assert.equal(badRelogin.ok, false);
    assert.equal(badRelogin.error?.code, "AUTH_INVALID_CREDENTIALS");

    const relogin = await adapter2.login({
      email: "chinedu@example.ng",
      password: initialPw,
    });
    assert.equal(relogin.ok, true, "Login after browser refresh must succeed via PBKDF2 verifier");
    assert.equal(relogin.data.user.email, "chinedu@example.ng");

    // (7) Password recovery & (8) Password reset
    await adapter2.logout();
    const recovery = await adapter2.requestPasswordReset({ email: "chinedu@example.ng" });
    assert.equal(recovery.ok, true);
    assert.ok(recovery.data.simulatedResetToken);

    const resetRes = await adapter2.resetPassword({
      email: "chinedu@example.ng",
      token: recovery.data.simulatedResetToken,
      newPassword: resetPw,
    });
    assert.equal(resetRes.ok, true);

    // Simulated browser refresh #2 after password reset
    const provider3 = mockProviderMod.createMockDataProvider({ storage });
    const adapter3 = authIndex.createMockAuthAdapter({ dataProvider: provider3 });
    await provider3.hydrateState();

    const oldPwAttempt = await adapter3.login({ email: "chinedu@example.ng", password: initialPw });
    assert.equal(oldPwAttempt.ok, false);
    const resetPwLogin = await adapter3.login({ email: "chinedu@example.ng", password: resetPw });
    assert.equal(resetPwLogin.ok, true);

    // (9) Password change after refresh
    const chgBad = await provider3.changePassword("WrongCurrent#1", changedPw);
    assert.equal(chgBad.ok, false);
    const chgOk = await provider3.changePassword(resetPw, changedPw);
    assert.equal(chgOk.ok, true);

    // (10) Refresh #3 and repeat auth operations (session restore -> logout -> re-login with changed password)
    const provider4 = mockProviderMod.createMockDataProvider({ storage });
    const adapter4 = authIndex.createMockAuthAdapter({ dataProvider: provider4 });
    await provider4.hydrateState();

    assert.equal((await adapter4.getSession()).data?.authenticated, true);
    await adapter4.logout();
    assert.equal((await adapter4.login({ email: "chinedu@example.ng", password: resetPw })).ok, false);
    const finalLogin = await adapter4.login({ email: "chinedu@example.ng", password: changedPw });
    assert.equal(finalLogin.ok, true);

    // Verify ZERO plaintext passwords exist anywhere in storage (all keys)
    const dump = storage._dump();
    const fullSerialized = JSON.stringify(dump);
    assert.equal(fullSerialized.includes(initialPw), false);
    assert.equal(fullSerialized.includes(resetPw), false);
    assert.equal(fullSerialized.includes(changedPw), false);
    assert.equal((dump[provider1.storageKey] ?? "").includes('"password"'), false);

    // Verify PBKDF2-SHA256 verifier structure
    const verifiers = JSON.parse(dump[verifierMod.MOCK_VERIFIER_STORAGE_KEY]);
    const userVerifier = verifiers[reg.data.user.id];
    assert.equal(userVerifier.alg, "PBKDF2-SHA256");
    assert.ok(userVerifier.iterations >= 100_000);
    assert.ok(userVerifier.salt.length >= 16);
    assert.ok(userVerifier.derivedKey.length >= 32);

    // Clean reset clears verifiers too
    provider4.clearSnapshot();
    assert.equal(storage.getItem(verifierMod.MOCK_VERIFIER_STORAGE_KEY), null);
  });
});

// ── H2: Provider Orchestration & Disconnected Standby ─────────────────────────

describe("Phase 6.5 H2 — Provider Orchestration & Disconnected Supabase Standby", () => {
  it("resolves mock by default, keeps Supabase standby disconnected, and rejects invalid providers", async () => {
    const mockOrch = dataProviderMod.resolveInvestorReadOrchestrator({});
    assert.equal(mockOrch.providerId, "mock");
    assert.equal(mockOrch.standbyMode, false);

    const supabaseOrch = dataProviderMod.resolveInvestorReadOrchestrator({
      VITE_DATA_PROVIDER: "supabase",
    });
    assert.equal(supabaseOrch.providerId, "supabase");
    assert.equal(supabaseOrch.standbyMode, true);
    assert.equal(supabaseConfig.SUPABASE_LIVE_ACTIVATION_ALLOWED, false);

    assert.throws(
      () => dataProviderMod.resolveInvestorReadOrchestrator({ VITE_DATA_PROVIDER: "invalid_db" }),
      (err) => err instanceof dataProviderMod.InvalidDataProviderError,
    );

    // Verify all 21 Phase 6.3 query methods exist on createMockReadOnlyQueryClient
    const mockQueryClient = investorMod.createMockReadOnlyQueryClient();
    const tableMapKeys = Object.keys(queriesMod.READ_ONLY_QUERY_TABLE_MAP);
    assert.equal(tableMapKeys.length, 21);
    for (const dotted of tableMapKeys) {
      const [ns, method] = dotted.split(".");
      assert.equal(typeof mockQueryClient[ns][method], "function", `Missing ${dotted}`);
    }
  });

  it("executes zero network requests in Supabase standby mode across all read methods", async () => {
    let fetchCount = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCount += 1;
      throw new Error("Live network calls are strictly prohibited in Phase 6.5");
    };

    try {
      const orch = investorMod.createInvestorReadOrchestrator({
        env: {
          VITE_DATA_PROVIDER: "supabase",
          VITE_SUPABASE_URL: "https://staging-placeholder.supabase.co",
          VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.stub",
        },
      });

      const results = await Promise.all([
        orch.getInvestorProfile(),
        orch.getInvestorAccountStatus(),
        orch.getWalletSummary(),
        orch.getTransactionHistory(),
        orch.getDepositHistory(),
        orch.getWithdrawalHistory(),
        orch.getInvestmentPortfolio(),
        orch.getAvailableInvestmentPlans(),
        orch.getNotifications(),
        orch.getKycStatus(),
      ]);

      for (const res of results) {
        assert.equal(res.ok, false);
        assert.equal(res.error.code, "STANDBY_DISCONNECTED");
      }

      const snap = await orch.loadInvestorSnapshot();
      assert.equal(snap.status, "disconnected");
      assert.equal(snap.isDisconnected, true);
      assert.ok(snap.disconnectedReason);
      assert.equal(fetchCount, 0, "Expected zero fetch calls in Supabase standby mode");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ── H3: All 10 Investor Read-Only Domains ─────────────────────────────────────

describe("Phase 6.5 H3 — Investor Read-Only Domains & KYC Masking", () => {
  it("returns empty initial state with 4 unchanged plans for a newly registered investor, then reads all 10 domains accurately", async () => {
    const storage = createMemoryStorage();
    const provider = mockProviderMod.createMockDataProvider({ storage });
    const orch = investorMod.createInvestorReadOrchestrator({ mockProvider: provider });

    // Unauthenticated baseline
    const unauthSnap = await orch.loadInvestorSnapshot();
    assert.equal(unauthSnap.status, "unauthenticated");
    assert.equal(unauthSnap.profile, null);
    assert.equal(unauthSnap.wallet, null);
    assert.equal(unauthSnap.plans.length, 4);

    // Register investor
    const reg = await provider.register({
      fullName: "Ngozi Eze",
      email: "ngozi@example.ng",
      password: "PortfolioPass#2026",
      phone: "+2348090001111",
    });
    assert.equal(reg.ok, true);

    // Empty funded state immediately after registration
    const emptySnap = await orch.loadInvestorSnapshot();
    assert.equal(emptySnap.status, "empty");
    assert.equal(emptySnap.isEmpty, true);
    assert.equal(emptySnap.wallet.totalKobo, 0);
    assert.equal(emptySnap.wallet.availableKobo, 0);
    assert.equal(emptySnap.wallet.lockedKobo, 0);
    assert.equal(emptySnap.transactions.length, 0);
    assert.equal(emptySnap.deposits.length, 0);
    assert.equal(emptySnap.withdrawals.length, 0);
    assert.equal(emptySnap.investments.length, 0);
    assert.equal(emptySnap.plans.length, 4);

    // Perform existing mock workflows: verify email, set bank account, deposits (< 250k auto-approve threshold), invest, withdraw, submit KYC
    const code = (await provider.requestVerificationCode()).data.code;
    await provider.verifyEmail("ngozi@example.ng", code);
    await provider.updateBankAccount({
      bankName: "Guaranty Trust Bank (GTBank)",
      bankCode: "058",
      accountNumber: "0123456789",
      accountName: "NGOZI EZE",
    });

    const dep1 = await provider.createDeposit({
      amount: 200_000,
      channel: "NIP Bank Transfer",
      note: "Initial capital tranche 1",
    });
    assert.equal(dep1.ok, true);

    const dep2 = await provider.createDeposit({
      amount: 200_000,
      channel: "NIP Bank Transfer",
      note: "Initial capital tranche 2",
    });
    assert.equal(dep2.ok, true);

    const inv = await provider.subscribeInvestment({
      planId: emptySnap.plans[0].id,
      amount: 200_000,
      autoCompound: true,
    });
    assert.equal(inv.ok, true);

    const wdr = await provider.requestWithdrawal({
      amount: 50_000,
      note: "Liquidity draw",
    });
    assert.equal(wdr.ok, true);

    const rawNin = "12345678901";
    const rawBvn = "22233344455";
    const kycRes = await provider.submitKycApplication({
      targetTier: "Tier 3",
      idType: "NIN",
      idNumber: rawNin,
      bvn: rawBvn,
      dateOfBirth: "1991-04-12",
      residentialAddress: "14 Adeola Odeku, VI, Lagos",
      idDocumentName: "nin-slip.pdf",
      proofOfAddressName: "utility-bill.pdf",
    });
    assert.equal(kycRes.ok, true);

    // Load full read-only snapshot & validate all 10 domains
    const snap = await orch.loadInvestorSnapshot();
    assert.equal(snap.status, "ready");
    assert.equal(snap.isEmpty, false);

    // 1. Profile & 10. Account status
    assert.equal(snap.profile.fullName, "Ngozi Eze");
    assert.equal(snap.profile.email, "ngozi@example.ng");
    assert.equal(snap.profile.emailVerified, true);
    assert.equal(snap.accountStatus.accountStatus, "Active");
    assert.equal(snap.accountStatus.walletStatus, "active");

    // 2. Wallet summary (integer kobo + ADR-009 invariant)
    assert.equal(snap.wallet.currency, "NGN");
    assert.equal(snap.wallet.lockedKobo, 200_000 * 100);
    assert.equal(snap.wallet.pendingWithdrawalKobo, 50_000 * 100);
    assert.equal(snap.wallet.availableKobo, 150_000 * 100);
    assert.equal(
      snap.wallet.totalKobo,
      snap.wallet.availableKobo + snap.wallet.lockedKobo + snap.wallet.pendingWithdrawalKobo,
    );
    assert.equal(snap.wallet.totalBalance, 400_000);

    // 3. Transactions, 4. Deposits, 5. Withdrawals
    assert.equal(snap.transactions.length, 4);
    assert.equal(snap.deposits.length, 2);
    assert.equal(snap.deposits[0].amountKobo, 200_000 * 100);
    assert.equal(snap.deposits[0].status, "Completed");
    assert.equal(snap.withdrawals.length, 1);
    assert.equal(snap.withdrawals[0].amountKobo, 50_000 * 100);
    assert.equal(snap.withdrawals[0].status, "Pending");

    // 6. Investments
    assert.equal(snap.investments.length, 1);
    assert.equal(snap.investments[0].principalKobo, 200_000 * 100);
    assert.equal(snap.investments[0].status, "Active");
    assert.equal(snap.investments[0].planId, emptySnap.plans[0].id);

    // 7. Investment plans (4 unchanged plans)
    assert.equal(snap.plans.length, 4);

    // 8. Notifications
    assert.ok(snap.notifications.length >= 1);
    assert.equal(typeof snap.notifications[0].read, "boolean");

    // 9. KYC status (strictly masked — ZERO raw BVN/NIN, ZERO hashes, ZERO internal compliance notes)
    assert.equal(snap.kyc.submissions.length, 1);
    assert.equal(snap.kyc.submissions[0].maskedIdLast4, "••••8901");
    assert.equal(snap.kyc.submissions[0].maskedBvnLast4, "••••4455");
    assert.equal(snap.kyc.submissions[0].idDocumentSubmitted, true);
    assert.equal(snap.kyc.submissions[0].proofOfAddressSubmitted, true);

    const kycJson = JSON.stringify(snap.kyc);
    assert.equal(kycJson.includes(rawNin), false, "Full NIN must never appear in investor KYC view");
    assert.equal(kycJson.includes(rawBvn), false, "Full BVN must never appear in investor KYC view");
    assert.equal(kycJson.includes("bvn_hash"), false);
    assert.equal(kycJson.includes("nin_hash"), false);
    assert.equal(kycJson.includes("pepSanctionsStatus"), false);
    assert.equal(kycJson.includes("reviewerNote"), false);
    assert.equal(kycJson.includes("latestReview"), false);
  });
});

// ── H4: Identity & Data Isolation ─────────────────────────────────────────────

describe("Phase 6.5 H4 — Investor Data Isolation, Expired Sessions & Tampered Storage Protection", () => {
  it("prevents Investor A from accessing Investor B's records and blocks unauthenticated, expired, and tampered-role access", async () => {
    let clockMs = Date.parse("2026-11-25T10:00:00.000Z");
    const storage = createMemoryStorage();
    const provider = mockProviderMod.createMockDataProvider({ storage });
    const queryClient = investorMod.createMockReadOnlyQueryClient({
      dataProvider: provider,
      now: () => clockMs,
    });
    const orch = investorMod.createInvestorReadOrchestrator({
      mockProvider: provider,
      now: () => clockMs,
    });

    // Register & fund Investor A (deposits < 250k auto-approve threshold)
    await provider.register({
      fullName: "Investor Alpha",
      email: "alpha@example.ng",
      password: "AlphaPassword#2026",
      phone: "+2348011110001",
    });
    const depA = await provider.createDeposit({ amount: 200_000, channel: "NIP Bank Transfer" });
    assert.equal(depA.ok, true);
    const invA = await provider.subscribeInvestment({
      planId: provider.getState().plans[0].id,
      amount: 100_000,
      autoCompound: false,
    });
    assert.equal(invA.ok, true);
    await provider.logout();

    // Register & fund Investor B
    await provider.register({
      fullName: "Investor Beta",
      email: "beta@example.ng",
      password: "BetaPassword#2026",
      phone: "+2348011110002",
    });
    const depB = await provider.createDeposit({ amount: 240_000, channel: "NIP Bank Transfer" });
    assert.equal(depB.ok, true);
    const invB = await provider.subscribeInvestment({
      planId: provider.getState().plans[0].id,
      amount: 150_000,
      autoCompound: false,
    });
    assert.equal(invB.ok, true);
    await provider.logout();

    // Unauthenticated access denied
    assert.equal((await orch.getWalletSummary()).ok, false);
    assert.equal((await orch.getTransactionHistory()).error?.code, "UNAUTHENTICATED");

    // Sign back in as Investor A
    const loginA = await provider.login("alpha@example.ng", "AlphaPassword#2026");
    assert.equal(loginA.ok, true);

    const snapA = await orch.loadInvestorSnapshot();
    assert.equal(snapA.profile.email, "alpha@example.ng");
    assert.equal(snapA.wallet.totalBalance, 200_000);
    assert.equal(snapA.transactions.some((t) => t.id === depB.data.id), false);
    assert.equal(snapA.investments.some((i) => i.id === invB.data.id), false);

    // Attempting to fetch Investor B's transaction or investment by ID returns null (zero leakage)
    const crossTxn = await queryClient.transactions.getOwnTransactionById(depB.data.id);
    assert.equal(crossTxn.ok, true);
    assert.equal(crossTxn.data, null);
    const ownTxn = await queryClient.transactions.getOwnTransactionById(depA.data.id);
    assert.equal(ownTxn.ok, true);
    assert.equal(ownTxn.data?.id, depA.data.id);

    const crossInv = await queryClient.investments.getOwnInvestmentById(invB.data.id);
    assert.equal(crossInv.ok, true);
    assert.equal(crossInv.data, null);
    const ownInv = await queryClient.investments.getOwnInvestmentById(invA.data.id);
    assert.equal(ownInv.ok, true);
    assert.equal(ownInv.data?.investment.id, invA.data.id);

    // Investor cannot access staff platform settings
    const staffSettings = await queryClient.settings.getStaffPlatformSettings();
    assert.equal(staffSettings.ok, false);
    assert.equal(staffSettings.code, "FORBIDDEN");

    // Tampered localStorage role ("admin") for Investor A cannot elevate privileges
    const rawStored = JSON.parse(storage.getItem(provider.storageKey));
    rawStored.session.role = "admin";
    storage.setItem(provider.storageKey, JSON.stringify(rawStored));
    const reloaded = mockProviderMod.createMockDataProvider({ storage });
    await reloaded.hydrateState();
    assert.equal(reloaded.getState().session.role, "investor");
    const reloadedQuery = investorMod.createMockReadOnlyQueryClient({
      dataProvider: reloaded,
      now: () => clockMs,
    });
    const tamperedStaffCheck = await reloadedQuery.settings.getStaffPlatformSettings();
    assert.equal(tamperedStaffCheck.ok, false);
    assert.equal(tamperedStaffCheck.code, "FORBIDDEN");

    // Expired session rejects investor reads cleanly with SESSION_EXPIRED
    const expiredClockMs = Date.parse(reloaded.getState().session.expiresAt) + 60_000;
    const expiredOrch = investorMod.createInvestorReadOrchestrator({
      mockProvider: reloaded,
      now: () => expiredClockMs,
    });
    const expiredSnap = await expiredOrch.loadInvestorSnapshot();
    assert.equal(expiredSnap.status, "session_expired");
    assert.equal((await expiredOrch.getWalletSummary()).error?.code, "SESSION_EXPIRED");
  });
});

// ── H5 & H7: Financial Precision, Network Isolation & Project Protection ──────

describe("Phase 6.5 H5 & H7 — Financial Precision & Project Protection Guarantees", () => {
  it("preserves exact integer-kobo math and rejects fractional kobo or unsafe integers", () => {
    assert.equal(financial.nairaToKobo(250_000.5), 25_000_050);
    assert.equal(financial.koboToNaira(25_000_050), 250_000.5);
    assert.equal(financial.sumKobo([10_000_000, 5_000_000, 2_500_000]), 17_500_000);

    assert.throws(() => financial.assertValidKobo(100.5));
    assert.throws(() => financial.assertValidKobo(Number.NaN));
    assert.throws(() => financial.assertValidKobo(Number.POSITIVE_INFINITY));
    assert.throws(() => financial.assertValidKobo(Number.MAX_SAFE_INTEGER + 10));
    assert.throws(() => financial.nairaToKobo(12.345));
  });

  it("keeps 14 frozen migrations untouched, zero Supabase SDK installed, and zero UI->Supabase imports", () => {
    const migrations = readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) =>
      f.endsWith(".sql"),
    );
    assert.equal(migrations.length, 14);
    assert.equal(
      migrations.every((m) => /^2026112300(0[1-9]|1[0-4])00_/.test(m)),
      true,
      "Only frozen migrations 0001–0014 may exist; Migration 0015+ must not exist",
    );

    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.dependencies?.["@supabase/supabase-js"], undefined);
    assert.equal(pkg.devDependencies?.["@supabase/supabase-js"], undefined);

    for (const dir of ["pages", "components", "layouts"]) {
      for (const file of walkTsFiles(path.join(SRC_DIR, dir))) {
        const src = readFileSync(file, "utf8");
        assert.equal(
          src.includes("@/services/supabase"),
          false,
          `UI file ${path.relative(ROOT, file)} must not import @/services/supabase`,
        );
        assert.equal(
          src.includes("mockDataProvider"),
          false,
          `UI file ${path.relative(ROOT, file)} must not import mockDataProvider`,
        );
      }
    }
  });
});

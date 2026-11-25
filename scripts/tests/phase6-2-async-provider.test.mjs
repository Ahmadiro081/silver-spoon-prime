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
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (existsSync(candidate)) {
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

const { createMockDataProvider, MOCK_STORAGE_KEY } = await import("@/services/mockDataProvider");
const {
  createAsyncOperationGuard,
  dataProviders,
  getActiveDataProviderId,
  getProviderRegistrySummary,
  InvalidDataProviderError,
  resolveDataProvider,
} = await import("@/services/dataProvider");
const { getSupabasePublicConfig } = await import("@/services/supabase/config");
const { supabaseDataProvider } = await import("@/services/supabase/supabaseDataProvider");
const integrity = await import("@/utils/mockIntegrity");

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    keys() {
      return Array.from(store.keys());
    },
  };
}

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

describe("Phase 6.2 — Asynchronous Mock Data Provider Behavior", () => {
  it("executes investor registration, verification, deposits, investments, 2FA withdrawals, KYC, and reset asynchronously", async () => {
    const storage = createMemoryStorage();
    const provider = createMockDataProvider({ storage });

    // Clean initial state: 0 users, 4 plans, unauthenticated
    const initial = await provider.hydrateState();
    assert.equal(initial.users.length, 0);
    assert.equal(initial.plans.length, 4);
    assert.equal(initial.session.authenticated, false);

    // 1. Async register returns a Promise and creates investor role with ₦0 wallet
    const regPromise = provider.register({
      fullName: "Kemi Adeola",
      email: "kemi.adeola@example.ng",
      phone: "+234 803 111 2233",
      password: "Password2026!",
    });
    assert.ok(regPromise instanceof Promise);
    const regRes = await regPromise;
    assert.equal(regRes.ok, true);
    assert.ok(regRes.data);
    assert.equal(regRes.data.role, "investor");
    assert.equal(regRes.data.emailVerified, false);

    const viewAfterReg = integrity.selectIsolatedAccountView(provider.getState(), regRes.data.id);
    assert.equal(viewAfterReg.wallet.availableBalance, 0);
    assert.equal(viewAfterReg.wallet.totalWalletBalance, 0);

    // 2. Async email verification
    const codeRes = await provider.requestVerificationCode();
    assert.equal(codeRes.ok, true);
    assert.match(codeRes.data.code, /^\d{6}$/);
    const verifyRes = await provider.verifyEmail(regRes.data.email, codeRes.data.code);
    assert.equal(verifyRes.ok, true);
    assert.equal(verifyRes.data.emailVerified, true);

    // 3. Async simulated deposit (auto-approved under threshold)
    const depRes = await provider.createDeposit({
      amount: 250_000,
      channel: "NIP Bank Transfer",
      note: "Async funding",
    });
    assert.equal(depRes.ok, true);
    assert.equal(depRes.data.status, "Completed");

    // 4. Async investment subscription + auto-compound toggle
    const plan = provider.getState().plans.find((p) => p.id === "plan-silver-liquidity");
    assert.ok(plan);
    const subRes = await provider.subscribeInvestment({
      planId: plan.id,
      amount: 150_000,
      autoCompound: true,
    });
    assert.equal(subRes.ok, true);
    assert.equal(subRes.data.principal, 150_000);

    const toggleRes = await provider.toggleInvestmentAutoCompound(subRes.data.id);
    assert.equal(toggleRes.ok, true);
    assert.equal(toggleRes.data.autoCompound, false);

    // 5. Async bank account update + 2FA enrollment + withdrawal request
    const bankRes = await provider.updateBankAccount({
      bankCode: "058",
      bankName: "Guaranty Trust Bank (GTBank)",
      accountNumber: "0123456789",
      accountName: "KEMI ADEOLA",
      verified: false,
      verificationStatus: "Pending Verification",
    });
    assert.equal(bankRes.ok, true);

    const twoFaInit = await provider.requestTwoFactorChallenge("2FA setup");
    assert.equal(twoFaInit.ok, true);
    const enable2Fa = await provider.enableTwoFactor(twoFaInit.data.code);
    assert.equal(enable2Fa.ok, true);

    // Withdrawal without 2FA code fails cleanly
    const wdrMissing2Fa = await provider.requestWithdrawal({ amount: 50_000 });
    assert.equal(wdrMissing2Fa.ok, false);

    const wdrChallenge = await provider.requestTwoFactorChallenge("withdrawal");
    assert.equal(wdrChallenge.ok, true);
    const wdrRes = await provider.requestWithdrawal({
      amount: 50_000,
      twoFactorCode: wdrChallenge.data.code,
    });
    assert.equal(wdrRes.ok, true);
    assert.equal(wdrRes.data.status, "Pending");

    // Verify exact ledger math: 250k deposit - 150k invested - 50k pending withdrawal = 50k available
    const walletAfterWdr = integrity.selectIsolatedAccountView(
      provider.getState(),
      regRes.data.id,
    ).wallet;
    assert.equal(walletAfterWdr.availableBalance, 50_000);
    assert.equal(walletAfterWdr.activeInvestments, 150_000);
    assert.equal(walletAfterWdr.pendingWithdrawals, 50_000);
    assert.equal(walletAfterWdr.totalWalletBalance, 200_000);

    // 6. Async password change + logout + re-login with new password
    const pwdRes = await provider.changePassword("Password2026!", "UpdatedPass2026!");
    assert.equal(pwdRes.ok, true);
    await provider.logout();
    assert.equal(provider.getState().session.authenticated, false);

    const badLogin = await provider.login(regRes.data.email, "Password2026!");
    assert.equal(badLogin.ok, false);
    const goodLogin = await provider.login(regRes.data.email, "UpdatedPass2026!");
    assert.equal(goodLogin.ok, true);

    // 7. Async notification read & resetDemoState
    await provider.markAllNotificationsRead();
    const afterRead = integrity.selectIsolatedAccountView(provider.getState(), regRes.data.id);
    assert.equal(afterRead.unreadNotificationCount, 0);

    const audit = integrity.auditMockDatasetIntegrity(provider.getState());
    assert.equal(audit.ok, true, `Unexpected audit issues: ${JSON.stringify(audit.issues)}`);

    await provider.resetDemoState();
    assert.equal(provider.getState().users.length, 0);
    assert.equal(provider.getState().transactions.length, 0);
    assert.equal(provider.getState().session.authenticated, false);
  });
});

describe("Phase 6.2 — Provider Registry Selection & Standby Safety", () => {
  it("defaults safely to mock provider when VITE_DATA_PROVIDER is unset or empty", () => {
    const unsetProvider = resolveDataProvider({});
    assert.equal(unsetProvider.id, "mock");
    assert.equal(unsetProvider, dataProviders.mock);
    assert.equal(getActiveDataProviderId({}), "mock");

    const emptyProvider = resolveDataProvider({ VITE_DATA_PROVIDER: "   " });
    assert.equal(emptyProvider.id, "mock");

    const explicitMock = resolveDataProvider({ VITE_DATA_PROVIDER: "MOCK" });
    assert.equal(explicitMock.id, "mock");
  });

  it("resolves supabase provider in disconnected standby mode with ZERO network calls", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = () => {
      fetchCalls += 1;
      throw new Error("Network call must not occur in Phase 6.2 standby mode");
    };

    try {
      const provider = resolveDataProvider({ VITE_DATA_PROVIDER: "supabase" });
      assert.equal(provider.id, "supabase");
      assert.equal(provider, supabaseDataProvider);
      assert.equal(provider.standbyMode, true);

      const summary = getProviderRegistrySummary({ VITE_DATA_PROVIDER: "supabase" });
      assert.equal(summary.activeProviderId, "supabase");
      assert.equal(summary.providerValid, true);
      assert.equal(summary.supabaseStandby, true);

      const loginRes = await provider.login("user@example.ng", "Password2026!");
      assert.equal(loginRes.ok, false);
      assert.match(loginRes.error ?? "", /standby/i);

      const depRes = await provider.createDeposit({ amount: 50_000, channel: "NIP" });
      assert.equal(depRes.ok, false);
      assert.match(depRes.error ?? "", /standby/i);

      const kycRes = await provider.submitKycApplication({
        targetTier: "Tier 2",
        idType: "NIN",
        idNumber: "12345678901",
        bvn: "22123456789",
        dateOfBirth: "1990-01-01",
        residentialAddress: "Lagos",
        idDocumentName: "nin.pdf",
      });
      assert.equal(kycRes.ok, false);

      const hydrated = await provider.hydrateState();
      assert.equal(hydrated.users.length, 0);
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails safely on invalid VITE_DATA_PROVIDER values and NEVER silently falls back to mock", () => {
    for (const invalidValue of ["invalid", "postgres", "firebase", "local", "supabase-live"]) {
      const cfg = getSupabasePublicConfig({ VITE_DATA_PROVIDER: invalidValue });
      assert.equal(cfg.providerValid, false);
      assert.equal(cfg.activeProvider, null);
      assert.equal(cfg.requestedProvider, null);
      assert.equal(cfg.readinessStatus, "invalid_provider");
      assert.match(cfg.configError ?? "", /Unsupported VITE_DATA_PROVIDER/i);

      const summary = getProviderRegistrySummary({ VITE_DATA_PROVIDER: invalidValue });
      assert.equal(summary.providerValid, false);
      assert.equal(summary.activeProviderId, null);

      assert.throws(
        () => resolveDataProvider({ VITE_DATA_PROVIDER: invalidValue }),
        (err) => {
          assert.ok(err instanceof InvalidDataProviderError);
          assert.equal(err.requestedProvider, invalidValue);
          return true;
        },
      );
    }
  });

  it("delegates AppStateProvider through dataProvider.ts without importing mockDataProvider or Supabase SDK", () => {
    const appStateProviderSource = readFileSync(
      path.join(SRC_ROOT, "context/AppStateProvider.tsx"),
      "utf8",
    );
    assert.match(appStateProviderSource, /from\s+["']@\/services\/dataProvider["']/);
    assert.doesNotMatch(appStateProviderSource, /mockDataProvider/);

    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.dependencies?.["@supabase/supabase-js"], undefined);
    assert.equal(pkg.devDependencies?.["@supabase/supabase-js"], undefined);

    for (const file of collectSourceFiles(SRC_ROOT)) {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(
        content,
        /from\s+["']@supabase\/supabase-js["']/,
        `${path.relative(SRC_ROOT, file)} must not import @supabase/supabase-js in Phase 6.2`,
      );
    }
  });
});

describe("Phase 6.2 — Persistence Across Provider Reloads", () => {
  it("persists async mutations under silver-spoon-mock-provider-v3 and hydrates cleanly into a new provider instance", async () => {
    const storage = createMemoryStorage();
    const firstSession = createMockDataProvider({ storage });

    const reg = await firstSession.register({
      fullName: "Damilola Ogunleye",
      email: "damilola@example.ng",
      phone: "+234 809 222 3344",
      password: "Password2026!",
    });
    assert.equal(reg.ok, true);

    const dep = await firstSession.createDeposit({
      amount: 200_000,
      channel: "NIP Bank Transfer",
    });
    assert.equal(dep.ok, true);

    assert.ok(storage.getItem(MOCK_STORAGE_KEY));

    // Fresh provider instance simulating full browser reload
    const reloadedSession = createMockDataProvider({ storage });
    const hydrated = await reloadedSession.hydrateState();
    assert.equal(hydrated.users.length, 1);
    assert.equal(hydrated.session.authenticated, true);
    assert.equal(hydrated.session.userId, reg.data.id);

    const view = integrity.selectIsolatedAccountView(hydrated, reg.data.id);
    assert.equal(view.wallet.availableBalance, 200_000);
    assert.equal(view.transactions.length, 1);
  });
});

describe("Phase 6.2 — Duplicate-Submission Protection & Rejection Safety", () => {
  it("blocks concurrent duplicate submissions for the same operation key and safely catches rejected promises", async () => {
    const pendingSnapshots = [];
    const guard = createAsyncOperationGuard((keys) => {
      pendingSnapshots.push([...keys]);
    });

    let releaseFirst;
    const firstBlocker = new Promise((resolve) => {
      releaseFirst = resolve;
    });

    let executionCount = 0;
    const call1 = guard.runResult("investor:createDeposit", async () => {
      executionCount += 1;
      await firstBlocker;
      return { ok: true, data: { id: "TXN-1" } };
    });

    // While call1 is still pending, a second call with the same key must be rejected cleanly
    assert.equal(guard.isPending("investor:createDeposit"), true);
    const call2 = await guard.runResult("investor:createDeposit", async () => {
      executionCount += 1;
      return { ok: true, data: { id: "TXN-2" } };
    });
    assert.equal(call2.ok, false);
    assert.match(call2.error ?? "", /already in progress/i);
    assert.equal(executionCount, 1);

    // Different operation key can run concurrently
    const independentCall = await guard.runResult("investor:updateProfile", async () => ({
      ok: true,
    }));
    assert.equal(independentCall.ok, true);

    // Release first operation and confirm lock is cleared
    releaseFirst();
    const res1 = await call1;
    assert.equal(res1.ok, true);
    assert.equal(guard.isPending("investor:createDeposit"), false);

    // Unexpected thrown errors / rejected promises convert to safe ServiceResult and release lock
    const failedRes = await guard.runResult("investor:createDeposit", async () => {
      throw new Error("Simulated transient storage fault");
    });
    assert.equal(failedRes.ok, false);
    assert.equal(failedRes.error, "Simulated transient storage fault");
    assert.equal(guard.isPending("investor:createDeposit"), false);
    assert.ok(pendingSnapshots.some((list) => list.includes("investor:createDeposit")));
  });
});

describe("Phase 6.2 — Role Separation & Route Guard Regressions", () => {
  it("enforces investor-only public registration and blocks investors from every admin async method", async () => {
    const storage = createMemoryStorage();
    const provider = createMockDataProvider({ storage });

    const reg = await provider.register({
      fullName: "Ibrahim Musa",
      email: "ibrahim.musa@example.ng",
      phone: "+234 805 000 1122",
      password: "Password2026!",
    });
    assert.equal(reg.ok, true);
    assert.equal(reg.data.role, "investor");
    assert.equal(provider.getState().session.role, "investor");

    const adminChecks = await Promise.all([
      provider.adminReviewTransaction("TXN-1", "Completed"),
      provider.adminMatureInvestment("INV-1"),
      provider.adminUpdateUserStatus(reg.data.id, "Suspended"),
      provider.adminUpdateUserTier(reg.data.id, "Platinum"),
      provider.adminReviewUserKyc(reg.data.id, { status: "Active", kycLevel: "Tier 3" }),
      provider.adminVerifyUserBankAccount(reg.data.id),
      provider.adminCreatePlan({
        name: "Unauthorized Plan",
        code: "SS-UNAUTH",
        category: "Fixed Income",
        tagline: "Blocked",
        description: "Blocked",
        minAmount: 100_000,
        maxAmount: 500_000,
        durationDays: 30,
        targetReturnPercent: 5,
        riskBand: "Conservative",
        payoutFrequency: "At Maturity",
        managementFeePercent: 0.5,
        riskNote: "Blocked",
      }),
      provider.adminTogglePlanStatus("plan-silver-liquidity", "Paused"),
      provider.adminUpdatePlan("plan-silver-liquidity", { name: "Tampered" }),
      provider.adminSendNotification({
        userId: "ALL",
        title: "Tampered",
        message: "Blocked",
        category: "platform",
      }),
      provider.adminUpdateSettings({ minDepositAmount: 50_000 }),
      provider.adminMarkReferralPaid("REF-1"),
    ]);

    for (const res of adminChecks) {
      assert.equal(res.ok, false);
      assert.match(res.error ?? "", /Administrator role required/i);
    }

    // Verify route guard exports remain intact
    const guardsSource = readFileSync(
      path.join(SRC_ROOT, "components/auth/RouteGuards.tsx"),
      "utf8",
    );
    assert.match(guardsSource, /export function ProtectedRoute/);
    assert.match(guardsSource, /export function InvestorRoute/);
    assert.match(guardsSource, /export function AdminRoute/);
    assert.match(guardsSource, /await logout\(\)/);
  });

  it("allows an authorized admin session to execute async treasury, maturity rollover, and KYC operations", async () => {
    const storage = createMemoryStorage();
    const provider = createMockDataProvider({ storage });

    // Register investor and submit a large deposit (> autoApprove threshold) + active investment
    const invReg = await provider.register({
      fullName: "Nkechi Eze",
      email: "nkechi.eze@example.ng",
      phone: "+234 802 999 4455",
      password: "Password2026!",
    });
    assert.equal(invReg.ok, true);

    const instantDep = await provider.createDeposit({
      amount: 200_000,
      channel: "NIP Bank Transfer",
    });
    assert.equal(instantDep.ok, true);
    assert.equal(instantDep.data.status, "Completed");

    const pendingDep = await provider.createDeposit({
      amount: 1_500_000,
      channel: "NIP Bank Transfer",
    });
    assert.equal(pendingDep.ok, true);
    assert.equal(pendingDep.data.status, "Pending");

    const sub = await provider.subscribeInvestment({
      planId: "plan-silver-liquidity",
      amount: 150_000,
      autoCompound: true,
    });
    assert.equal(sub.ok, true);

    // Inject a local test admin user into memory storage to exercise async admin actions
    const snap = provider.getState();
    const testAdmin = {
      ...invReg.data,
      id: "ADM-TEST-9001",
      fullName: "Treasury Reviewer",
      email: "reviewer@example.ng",
      password: "AdminPassword2026!",
      role: "admin",
      referralCode: "SS-ADMIN99",
    };
    snap.users.push(testAdmin);
    provider.saveSnapshot(snap, storage);
    await provider.hydrateState();

    const adminLogin = await provider.login(testAdmin.email, testAdmin.password);
    assert.equal(adminLogin.ok, true);
    assert.equal(adminLogin.data.role, "admin");

    const reviewRes = await provider.adminReviewTransaction(
      pendingDep.data.id,
      "Completed",
      "Reconciled in async test",
    );
    assert.equal(reviewRes.ok, true);

    const matureRes = await provider.adminMatureInvestment(sub.data.id);
    assert.equal(matureRes.ok, true);
    assert.ok(matureRes.data.rolledOverInvestmentId);
    assert.equal(matureRes.data.rolloverPrincipal, 153_300);

    const suspendRes = await provider.adminUpdateUserStatus(invReg.data.id, "Suspended");
    assert.equal(suspendRes.ok, true);

    await provider.logout();
    const suspendedLogin = await provider.login(invReg.data.email, "Password2026!");
    assert.equal(suspendedLogin.ok, false);
    assert.match(suspendedLogin.error ?? "", /suspended/i);

    const finalAudit = integrity.auditMockDatasetIntegrity(provider.getState());
    assert.equal(finalAudit.ok, true, `Expected clean audit: ${JSON.stringify(finalAudit.issues)}`);
  });
});

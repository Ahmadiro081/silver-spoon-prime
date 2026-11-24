import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SRC_ROOT = path.resolve(ROOT, "src");

// Resolve `@/*` aliases and stub static image asset imports for Node's native TS runner.
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

const { mockDataProvider, MOCK_STORAGE_KEY } = await import("@/services/mockDataProvider");
const integrity = await import("@/utils/mockIntegrity");
const platform = await import("@/services/platformService");

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
    size() {
      return store.size;
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

function createRegisteredInvestor({
  id,
  fullName,
  email,
  password = "StrongPassword2026!",
  referralCode,
  referredBy,
  status = "Active",
  kycLevel = "Tier 2",
}) {
  const now = new Date().toISOString();
  return {
    id,
    fullName,
    email,
    password,
    emailVerified: true,
    phone: "+234 803 000 0000",
    city: "Lagos",
    address: "Victoria Island, Lagos",
    role: "investor",
    tier: "Silver",
    status,
    kycLevel,
    referralCode,
    referredBy,
    joinedAt: now,
    lastLoginAt: now,
    twoFactorEnabled: false,
    emailAlerts: true,
    smsAlerts: false,
    bankAccount: {
      bankName: "Guaranty Trust Bank (GTBank)",
      bankCode: "058",
      accountNumber: "0123456789",
      accountName: fullName.toUpperCase(),
      verified: false,
      verificationStatus: "Pending Verification",
    },
  };
}

describe("Phase 4 (Clean State): Empty Initial State & Zero Seeded Demo Records", () => {
  it("initializes with zero users, zero admins, empty financial collections, and unauthenticated session", () => {
    const clean = mockDataProvider.getSeedSnapshot();
    const audit = integrity.auditMockDatasetIntegrity(clean);

    assert.equal(mockDataProvider.id, "mock");
    assert.equal(MOCK_STORAGE_KEY, "silver-spoon-mock-provider-v3");
    assert.equal(clean.schemaVersion, integrity.MOCK_SCHEMA_VERSION);

    // 1. Zero seeded users & no preloaded administrator account
    assert.equal(clean.users.length, 0);
    assert.equal(clean.users.filter((u) => u.role === "admin").length, 0);
    assert.equal(clean.session.authenticated, false);
    assert.equal(clean.session.userId, "");

    // 2. Empty financial and user-specific collections
    assert.equal(clean.investments.length, 0);
    assert.equal(clean.transactions.length, 0);
    assert.equal(clean.referrals.length, 0);
    assert.equal(clean.notifications.length, 0);
    assert.equal(clean.auditLogs.length, 0);
    assert.equal(clean.kycSubmissions.length, 0);
    assert.deepEqual(clean.resetTokens, {});
    assert.deepEqual(clean.verificationCodes, {});
    assert.deepEqual(clean.twoFactorCodes, {});

    // Product catalog and baseline settings remain available for registration/investments
    assert.equal(clean.plans.length, 4);
    assert.equal(clean.settings.allowNewRegistrations, true);
    assert.equal(clean.settings.minDepositAmount, 10_000);

    // 3. Zero initial balances
    const emptyView = integrity.selectIsolatedAccountView(clean, "");
    assert.equal(emptyView.wallet.totalWalletBalance, 0);
    assert.equal(emptyView.wallet.availableBalance, 0);
    assert.equal(emptyView.wallet.activeInvestments, 0);
    assert.equal(emptyView.wallet.pendingWithdrawals, 0);
    assert.equal(emptyView.wallet.totalDeposits, 0);
    assert.equal(emptyView.wallet.realizedEarnings, 0);
    assert.equal(emptyView.wallet.referralEarnings, 0);

    // Relational audit passes cleanly on empty dataset
    assert.equal(audit.ok, true);
    assert.equal(audit.issues.length, 0);
    assert.equal(audit.summary.users, 0);
    assert.equal(audit.summary.admins, 0);
    assert.equal(audit.summary.plans, 4);
  });
});

describe("Phase 4 (Clean State): Registration, Persistence, Ledger Workflows & Account Isolation", () => {
  it("supports registering new investors, persisting across refreshes, and isolating two accounts", () => {
    const storage = createMemoryStorage();
    const state = mockDataProvider.loadSnapshot(storage);

    const investorA = createRegisteredInvestor({
      id: platform.generateId("USR"),
      fullName: "Tunde Balogun",
      email: "tunde.balogun@example.ng",
      referralCode: "SS-TUNDE41",
    });
    const investorB = createRegisteredInvestor({
      id: platform.generateId("USR"),
      fullName: "Hauwa Ibrahim",
      email: "hauwa.ibrahim@example.ng",
      referralCode: "SS-HAUWA82",
      referredBy: investorA.referralCode,
    });

    // Newly registered accounts are always investors (never admin)
    assert.equal(investorA.role, "investor");
    assert.equal(investorB.role, "investor");

    state.users.unshift(investorB, investorA);
    state.session = { authenticated: true, userId: investorA.id, role: "investor" };

    // Before funding, newly registered investor has strictly ₦0 balances
    const initialViewA = integrity.selectIsolatedAccountView(state, investorA.id);
    assert.equal(initialViewA.wallet.availableBalance, 0);
    assert.equal(initialViewA.wallet.totalWalletBalance, 0);

    // Simulated Deposit -> Investment -> Maturity Rollover for investor A
    const silverPlan = state.plans.find((p) => p.id === "plan-silver-liquidity");
    assert.ok(silverPlan);

    const depA = platform.buildTransactionRecord({
      user: investorA,
      type: "Deposit",
      amount: 250_000,
      status: "Completed",
      channel: "NIP Bank Transfer",
      note: "Initial wallet funding",
    });
    state.transactions.unshift(depA);

    const invA = platform.buildInvestmentRecord(investorA, silverPlan, 150_000, true);
    const invTxnA = platform.buildTransactionRecord({
      user: investorA,
      type: "Investment",
      amount: 150_000,
      status: "Completed",
      channel: silverPlan.name,
      note: `Principal allocated (${invA.id})`,
    });
    state.investments.unshift(invA);
    state.transactions.unshift(invTxnA);

    // Independent deposit & private notification for investor B
    const depB = platform.buildTransactionRecord({
      user: investorB,
      type: "Deposit",
      amount: 100_000,
      status: "Completed",
      channel: "NIP Bank Transfer",
      note: "Investor B funding",
    });
    state.transactions.unshift(depB);
    state.notifications.unshift({
      id: platform.generateId("NTF"),
      userId: investorB.id,
      title: "Deposit Credited",
      message: "Private notice for Investor B.",
      category: "deposit",
      createdAt: new Date().toISOString(),
      readByUserIds: [],
    });

    // Save and simulate full page refresh
    mockDataProvider.saveSnapshot(state, storage);
    const reloaded = mockDataProvider.loadSnapshot(storage);

    // Newly registered accounts & session survive refresh intact
    assert.equal(reloaded.users.length, 2);
    assert.equal(reloaded.session.authenticated, true);
    assert.equal(reloaded.session.userId, investorA.id);
    assert.equal(reloaded.session.role, "investor");

    // Verify strict isolation and exact ledger balances for both accounts
    const viewA = integrity.selectIsolatedAccountView(reloaded, investorA.id);
    const viewB = integrity.selectIsolatedAccountView(reloaded, investorB.id);

    assert.equal(viewA.wallet.availableBalance, 100_000);
    assert.equal(viewA.wallet.activeInvestments, 150_000);
    assert.equal(viewA.wallet.totalWalletBalance, 250_000);
    assert.ok(viewA.transactions.every((t) => t.userId === investorA.id));
    assert.ok(viewA.investments.every((i) => i.userId === investorA.id));
    assert.equal(viewA.notifications.length, 0);

    assert.equal(viewB.wallet.availableBalance, 100_000);
    assert.equal(viewB.wallet.activeInvestments, 0);
    assert.equal(viewB.wallet.totalWalletBalance, 100_000);
    assert.ok(viewB.transactions.every((t) => t.userId === investorB.id));
    assert.equal(viewB.notifications.length, 1);

    // Auto-compound maturity settlement preserves solvency & audit cleanliness
    const bundleRes = platform.buildMaturitySettlementBundle({
      investment: invA,
      investor: investorA,
      plan: silverPlan,
      adminName: "Treasury Desk",
      existingTransactions: reloaded.transactions,
    });
    assert.equal(bundleRes.ok, true);
    const bundle = bundleRes.data;
    assert.ok(bundle && bundle.rolloverInvestment && bundle.rolloverTransaction);

    reloaded.investments = [
      bundle.rolloverInvestment,
      ...reloaded.investments.map((i) => (i.id === invA.id ? bundle.maturedInvestment : i)),
    ];
    reloaded.transactions = [
      bundle.rolloverTransaction,
      bundle.payoutTransaction,
      ...reloaded.transactions,
    ];

    const finalAudit = integrity.auditMockDatasetIntegrity(reloaded);
    assert.equal(
      finalAudit.ok,
      true,
      `Expected clean audit after rollover, got: ${JSON.stringify(finalAudit.issues)}`,
    );

    const postMaturityViewA = integrity.selectIsolatedAccountView(reloaded, investorA.id);
    assert.equal(postMaturityViewA.wallet.availableBalance, 100_000);
    assert.equal(postMaturityViewA.wallet.activeInvestments, 153_300);
    assert.equal(postMaturityViewA.wallet.realizedEarnings, 3_300);
  });

  it("actively detects injected negative-balance and orphaned relational defects", () => {
    const snap = mockDataProvider.getSeedSnapshot();
    const investor = createRegisteredInvestor({
      id: "USR-TEST-01",
      fullName: "Sadiq Bello",
      email: "sadiq.bello@example.ng",
      referralCode: "SS-SADIQ10",
    });
    const plan = snap.plans[0];
    const inv = platform.buildInvestmentRecord(investor, plan, 100_000, false);

    // Inject investment without funding deposit or matching ledger entry
    snap.users.push(investor);
    snap.investments.push(inv);

    const audit = integrity.auditMockDatasetIntegrity(snap);
    assert.equal(audit.ok, false);
    const codes = new Set(audit.issues.map((i) => i.code));
    assert.ok(codes.has("NEGATIVE_RAW_LEDGER_BALANCE"));
    assert.ok(codes.has("INVESTMENT_WITHOUT_FUNDING"));
    assert.ok(codes.has("MISSING_INVESTMENT_LEDGER_ENTRY"));
  });
});

describe("Phase 4 (Clean State): One-Time Legacy localStorage Migration & Recovery", () => {
  it("cleans legacy pre-v4 seeded localStorage once, persists clean schemaVersion 4, and never wipes subsequent user registrations", () => {
    const storage = createMemoryStorage();

    // Simulate an existing browser still holding old v3 seeded demo records (without schemaVersion: 4)
    const legacySeededPayload = {
      session: { authenticated: true, userId: "USR-LEGACY-1", role: "investor" },
      users: [
        createRegisteredInvestor({
          id: "USR-LEGACY-1",
          fullName: "Legacy Demo User",
          email: "legacy.demo@example.ng",
          referralCode: "SS-LEGACY01",
        }),
        {
          ...createRegisteredInvestor({
            id: "ADM-LEGACY-1",
            fullName: "Legacy Admin",
            email: "legacy.admin@example.ng",
            referralCode: "SS-LEGADM",
          }),
          role: "admin",
        },
      ],
      plans: mockDataProvider.getSeedSnapshot().plans,
      investments: [{ id: "INV-LEGACY-1", userId: "USR-LEGACY-1", principal: 500_000 }],
      transactions: [{ id: "TXN-LEGACY-1", userId: "USR-LEGACY-1", amount: 500_000 }],
      referrals: [{ id: "REF-LEGACY-1" }],
      notifications: [{ id: "NTF-LEGACY-1", userId: "USR-LEGACY-1" }],
      auditLogs: [{ id: "AUD-LEGACY-1" }],
      kycSubmissions: [{ id: "KYC-LEGACY-1", userId: "USR-LEGACY-1" }],
      resetTokens: { "legacy.demo@example.ng": "SS-OLDTOKEN" },
      verificationCodes: { "legacy.demo@example.ng": "123456" },
      twoFactorCodes: { "USR-LEGACY-1": "654321" },
    };

    assert.equal(integrity.isLegacyUnmigratedSnapshot(legacySeededPayload), true);
    storage.setItem(MOCK_STORAGE_KEY, JSON.stringify(legacySeededPayload));

    // Startup 1: detects legacy dataset, strips all old records & transient codes, initializes empty v4 state
    const migrated = mockDataProvider.loadSnapshot(storage);
    assert.equal(migrated.schemaVersion, integrity.MOCK_SCHEMA_VERSION);
    assert.equal(migrated.users.length, 0);
    assert.equal(migrated.investments.length, 0);
    assert.equal(migrated.transactions.length, 0);
    assert.equal(migrated.referrals.length, 0);
    assert.equal(migrated.notifications.length, 0);
    assert.equal(migrated.auditLogs.length, 0);
    assert.equal(migrated.kycSubmissions.length, 0);
    assert.deepEqual(migrated.resetTokens, {});
    assert.deepEqual(migrated.verificationCodes, {});
    assert.deepEqual(migrated.twoFactorCodes, {});
    assert.equal(migrated.session.authenticated, false);
    assert.equal(migrated.session.userId, "");

    // Persisted storage is now marked with schemaVersion 4
    const storedAfterMigration = JSON.parse(storage.getItem(MOCK_STORAGE_KEY));
    assert.equal(storedAfterMigration.schemaVersion, integrity.MOCK_SCHEMA_VERSION);
    assert.equal(storedAfterMigration.users.length, 0);

    // User registers a new account after migration and deposits funds
    const realNewUser = createRegisteredInvestor({
      id: platform.generateId("USR"),
      fullName: "Chisom Nwosu",
      email: "chisom.nwosu@example.ng",
      referralCode: "SS-CHISOM22",
    });
    const newDeposit = platform.buildTransactionRecord({
      user: realNewUser,
      type: "Deposit",
      amount: 180_000,
      status: "Completed",
      channel: "NIP Bank Transfer",
      note: "Post-migration funding",
    });
    migrated.users.unshift(realNewUser);
    migrated.transactions.unshift(newDeposit);
    migrated.session = { authenticated: true, userId: realNewUser.id, role: "investor" };
    mockDataProvider.saveSnapshot(migrated, storage);

    // Startup 2 & Startup 3 (subsequent refreshes): migration must NOT repeat destructively
    const reload1 = mockDataProvider.loadSnapshot(storage);
    const reload2 = mockDataProvider.loadSnapshot(storage);
    for (const snap of [reload1, reload2]) {
      assert.equal(snap.schemaVersion, integrity.MOCK_SCHEMA_VERSION);
      assert.equal(snap.users.length, 1);
      assert.equal(snap.users[0].email, "chisom.nwosu@example.ng");
      assert.equal(snap.session.authenticated, true);
      assert.equal(snap.session.userId, realNewUser.id);
      assert.equal(
        integrity.selectIsolatedAccountView(snap, realNewUser.id).wallet.availableBalance,
        180_000,
      );
    }
  });

  it("safely recovers from corrupted JSON, suspended sessions, role tampering, and clearSnapshot resets", () => {
    const storage = createMemoryStorage();

    // 1. Corrupted JSON recovers cleanly to empty v4 state
    storage.setItem(MOCK_STORAGE_KEY, "{not-valid-json");
    const recovered = mockDataProvider.loadSnapshot(storage);
    assert.equal(recovered.schemaVersion, integrity.MOCK_SCHEMA_VERSION);
    assert.equal(recovered.users.length, 0);
    assert.equal(recovered.session.authenticated, false);

    // 2. Suspended user session forced unauthenticated on reload
    const suspendedUser = createRegisteredInvestor({
      id: "USR-SUSP-1",
      fullName: "Suspended Account",
      email: "suspended@example.ng",
      referralCode: "SS-SUSP01",
      status: "Suspended",
    });
    const activeUser = createRegisteredInvestor({
      id: "USR-ACT-1",
      fullName: "Active Account",
      email: "active@example.ng",
      referralCode: "SS-ACT01",
    });
    const snap = mockDataProvider.getSeedSnapshot();
    snap.users = [activeUser, suspendedUser];
    snap.session = { authenticated: true, userId: suspendedUser.id, role: "investor" };
    mockDataProvider.saveSnapshot(snap, storage);
    assert.equal(mockDataProvider.loadSnapshot(storage).session.authenticated, false);

    // 3. Tampered session role (investor claiming admin in storage) corrected back to investor
    snap.session = { authenticated: true, userId: activeUser.id, role: "admin" };
    mockDataProvider.saveSnapshot(snap, storage);
    const reloadedTampered = mockDataProvider.loadSnapshot(storage);
    assert.equal(reloadedTampered.session.authenticated, true);
    assert.equal(reloadedTampered.session.role, "investor");

    // 4. clearSnapshot resets to clean empty unauthenticated state
    const cleared = mockDataProvider.clearSnapshot(storage);
    assert.equal(cleared.users.length, 0);
    assert.equal(cleared.session.authenticated, false);
    assert.equal(cleared.schemaVersion, integrity.MOCK_SCHEMA_VERSION);
  });
});

describe("Phase 4 (Clean State): Demo UI Removal, Transparency Labels & RBAC Enforcement", () => {
  it("contains zero seeded demo identities, hardcoded demo passwords, or demo login/switching controls in src/", () => {
    const forbiddenPatterns = [
      /\bUSR-100[1-6]\b/,
      /\bADM-0001\b/,
      /silverspoon2026/i,
      /Adaeze Okafor/i,
      /Ngozi Achebe/i,
      /Kunle Adebayo/i,
      /Amara Uche/i,
      /Ifeoma Okonkwo/i,
      /Zainab Yusuf/i,
      /Oluwaseun Adeyemi/i,
      /Switch to Admin Demo/i,
      /Switch to Investor Demo/i,
      /DemoModeBanner/,
      /switchDemoAccount/,
    ];

    const files = collectSourceFiles(SRC_ROOT);
    const violations = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const regex of forbiddenPatterns) {
        if (regex.test(content)) {
          violations.push(`${path.relative(SRC_ROOT, file)} matched ${regex}`);
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Found prohibited demo/seeded references in src/:\n${violations.join("\n")}`,
    );
    assert.equal(
      existsSync(path.join(SRC_ROOT, "components/common/DemoModeBanner.tsx")),
      false,
      "Legacy DemoModeBanner.tsx should be removed",
    );
  });

  it("displays clear TEST ENVIRONMENT and NOT A REAL BANK TRANSACTION disclosures across layouts, receipts, and CSV exports", () => {
    const bannerSource = readFileSync(
      path.join(SRC_ROOT, "components/common/TestEnvironmentBanner.tsx"),
      "utf8",
    );
    assert.match(bannerSource, /Test Environment/i);
    assert.match(bannerSource, /NOT A REAL BANK TRANSACTION/);
    assert.match(bannerSource, /SIMULATED TRANSACTION/i);

    for (const relLayout of [
      "layouts/UserDashboardLayout.tsx",
      "layouts/AdminDashboardLayout.tsx",
      "layouts/PublicLayout.tsx",
      "layouts/AuthLayout.tsx",
    ]) {
      const content = readFileSync(path.join(SRC_ROOT, relLayout), "utf8");
      assert.match(
        content,
        /TestEnvironmentBanner/,
        `${relLayout} must render TestEnvironmentBanner`,
      );
    }

    const receiptSource = readFileSync(
      path.join(SRC_ROOT, "components/common/TransactionReceiptModal.tsx"),
      "utf8",
    );
    assert.match(receiptSource, /TEST ENVIRONMENT/i);
    assert.match(receiptSource, /SIMULATED TRANSACTION/i);
    assert.match(receiptSource, /NOT A REAL BANK TRANSACTION/);
    assert.match(receiptSource, /SIMULATED-\$\{transaction\.reference\}\.txt/);

    for (const relPage of [
      "pages/dashboard/TransactionsPage.tsx",
      "pages/admin/AdminTransactionsPage.tsx",
      "pages/admin/AdminReportsPage.tsx",
    ]) {
      const content = readFileSync(path.join(SRC_ROOT, relPage), "utf8");
      assert.match(
        content,
        /SIMULATED TRANSACTION \(TEST ENVIRONMENT\)/,
        `${relPage} CSV export must label records as SIMULATED TRANSACTION (TEST ENVIRONMENT)`,
      );
    }
  });

  it("preserves Investor/Admin role restrictions and ensures public registration never assigns admin role", () => {
    const guardsSource = readFileSync(
      path.join(SRC_ROOT, "components/auth/RouteGuards.tsx"),
      "utf8",
    );
    assert.match(guardsSource, /export function ProtectedRoute/);
    assert.match(guardsSource, /export function InvestorRoute/);
    assert.match(guardsSource, /export function AdminRoute/);
    assert.doesNotMatch(guardsSource, /switchRoleDemo/);

    const providerSource = readFileSync(
      path.join(SRC_ROOT, "context/AppStateProvider.tsx"),
      "utf8",
    );
    // Registration explicitly sets role: "investor" and session role: "investor"
    assert.match(providerSource, /role:\s*"investor"/);
    assert.match(providerSource, /session:\s*\{\s*authenticated:\s*true,\s*userId:\s*newUser\.id,\s*role:\s*"investor"\s*\}/);

    // Login page starts with empty credentials and contains no demo quick-login buttons
    const loginSource = readFileSync(path.join(SRC_ROOT, "pages/auth/LoginPage.tsx"), "utf8");
    assert.match(loginSource, /useState\(""\)/);
    assert.doesNotMatch(loginSource, /enterDemo/);
    assert.doesNotMatch(loginSource, /switchRoleDemo/);
  });
});

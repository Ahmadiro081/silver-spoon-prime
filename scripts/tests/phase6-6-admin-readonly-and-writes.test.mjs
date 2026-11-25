/**
 * SILVER SPOON — Phase 6.6 Automated Test Suite
 *
 * Covers:
 * - Section 10.1: 5-role administrative read isolation (super_admin, admin, finance_officer, compliance_officer, investor) + unauthenticated, expired, suspended
 * - Section 10.2: Tampering protection (modified localStorage role, forged staffRole, orphaned session, direct adapter invocation)
 * - Section 10.3: Strict data masking (raw BVN/NIN, hashes, tokens, vendor secrets, internal notes, post-hydration persistence)
 * - Section 10.4: Write-adapter standby contracts (all 21 operations across 5 categories -> STANDBY_NOT_ENABLED) & four-eyes separation-of-duties validation
 * - Section 10.5 & 11: Integer-kobo financial reconciliation, empty initial state, zero-network Supabase standby, 14 frozen migrations, zero UI->writes/Supabase imports
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SRC_DIR = path.join(ROOT, "src");

function resolveTsTarget(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // continue
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/\.(jpg|jpeg|png|webp|svg|gif|css)$/i.test(specifier)) {
      const target = specifier.startsWith("@/")
        ? path.join(SRC_DIR, specifier.slice(2))
        : path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const resolved = resolveTsTarget(path.join(SRC_DIR, specifier.slice(2)));
      if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const resolved = resolveTsTarget(path.resolve(parentDir, specifier));
      if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (/\.(jpg|jpeg|png|webp|svg|gif|css)$/i.test(url)) {
      return { format: "module", source: `export default ${JSON.stringify(url)};`, shortCircuit: true };
    }
    if (url.endsWith(".ts") || url.endsWith(".tsx")) {
      const filename = fileURLToPath(url);
      const source = readFileSync(filename, "utf8");
      const { outputText } = ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      });
      return { format: "module", source: outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const mockProviderMod = await import(pathToFileURL(path.join(SRC_DIR, "services/mockDataProvider.ts")).href);
const adminMod = await import(pathToFileURL(path.join(SRC_DIR, "services/admin/index.ts")).href);
const writesMod = await import(pathToFileURL(path.join(SRC_DIR, "services/writes/index.ts")).href);
const supabaseConfig = await import(pathToFileURL(path.join(SRC_DIR, "services/supabase/config.ts")).href);
const supabaseProviderMod = await import(
  pathToFileURL(path.join(SRC_DIR, "services/supabase/supabaseDataProvider.ts")).href
);
const authMod = await import(pathToFileURL(path.join(SRC_DIR, "services/auth/index.ts")).href);
const investorMod = await import(pathToFileURL(path.join(SRC_DIR, "services/investor/index.ts")).href);

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

function walkTsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Helper to create a controlled local test scenario with:
 * - 1 investor who registers, verifies email, adds bank account, deposits, invests, withdraws, and submits KYC
 * - 4 distinct staff accounts (super_admin, admin, finance_officer, compliance_officer)
 */
async function buildRoleTestScenario(storage, nowFn) {
  const provider = mockProviderMod.createMockDataProvider({ storage });

  // 1. Register investor via standard mock workflow
  const reg = await provider.register({
    fullName: "Chidi Nwosu",
    email: "chidi@example.ng",
    password: "InvestorPass#2026",
    phone: "+2348091234567",
  });
  assert.equal(reg.ok, true);
  const investorId = reg.data.id;

  const code = (await provider.requestVerificationCode()).data.code;
  await provider.verifyEmail("chidi@example.ng", code);
  await provider.updateBankAccount({
    bankName: "Guaranty Trust Bank (GTBank)",
    bankCode: "058",
    accountNumber: "0123456789",
    accountName: "CHIDI NWOSU",
  });
  // Two deposits below 250k auto-approve threshold -> 400k available
  assert.equal((await provider.createDeposit({ amount: 200_000, channel: "NIP Bank Transfer" })).ok, true);
  assert.equal((await provider.createDeposit({ amount: 200_000, channel: "NIP Bank Transfer" })).ok, true);
  assert.equal(
    (
      await provider.subscribeInvestment({
        planId: provider.getState().plans[0].id,
        amount: 200_000,
        autoCompound: false,
      })
    ).ok,
    true,
  );
  assert.equal((await provider.requestWithdrawal({ amount: 50_000, note: "Partial draw" })).ok, true);

  const rawNin = "12345678901";
  const rawBvn = "22233344455";
  assert.equal(
    (
      await provider.submitKycApplication({
        targetTier: "Tier 3",
        idType: "NIN",
        idNumber: rawNin,
        bvn: rawBvn,
        dateOfBirth: "1990-06-15",
        residentialAddress: "21 Bourdillon Road, Ikoyi, Lagos",
        idDocumentName: "nin-slip.pdf",
        proofOfAddressName: "utility-bill.pdf",
      })
    ).ok,
    true,
  );
  await provider.logout();

  // 2. Add 4 local test staff profiles into snapshot (no preloaded production seed data; strictly inside test storage)
  const baseTime = new Date(nowFn()).toISOString();
  const makeStaff = (id, fullName, email, staffRole, status = "Active") => ({
    id,
    fullName,
    email,
    emailVerified: true,
    phone: "+2348000000000",
    city: "Lagos",
    address: "Victoria Island, Lagos",
    role: "admin",
    staffRole,
    tier: "Sovereign",
    status,
    kycLevel: "Tier 3",
    referralCode: `SS-${id}`,
    joinedAt: baseTime,
    lastLoginAt: baseTime,
    twoFactorEnabled: true,
    emailAlerts: true,
    smsAlerts: false,
    bankAccount: {
      bankName: "",
      bankCode: "",
      accountNumber: "",
      accountName: "",
      verified: false,
      verificationStatus: "Unverified",
    },
  });

  const staffProfiles = {
    super_admin: makeStaff("STF-SUPER", "Amina Bello", "super@silverspoon.ng", "super_admin"),
    admin: makeStaff("STF-ADMIN", "Tunde Adeyemi", "admin@silverspoon.ng", "admin"),
    finance_officer: makeStaff("STF-FIN", "Kemi Okafor", "finance@silverspoon.ng", "finance_officer"),
    compliance_officer: makeStaff(
      "STF-COMP",
      "Yusuf Ibrahim",
      "compliance@silverspoon.ng",
      "compliance_officer",
    ),
    suspended_staff: makeStaff(
      "STF-SUSP",
      "Suspended Officer",
      "suspended@silverspoon.ng",
      "admin",
      "Suspended",
    ),
  };

  const snap = provider.getState();
  const updatedSnap = {
    ...snap,
    users: [...snap.users, ...Object.values(staffProfiles)],
    auditLogs: [
      {
        id: "AUD-TEST-FIN",
        timestamp: baseTime,
        actorName: "Kemi Okafor",
        actorRole: "admin",
        action: "DEPOSIT_REVIEW",
        targetType: "Deposit",
        targetId: "DEP-1",
        summary: "Deposit verified with Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig and ID 12345678901",
        severity: "Info",
        ipAddress: "10.0.0.15",
      },
      {
        id: "AUD-TEST-COMP",
        timestamp: baseTime,
        actorName: "Yusuf Ibrahim",
        actorRole: "admin",
        action: "KYC_PACKET_LOGGED",
        targetType: "Security",
        targetId: investorId,
        summary: "Compliance screening logged for investor account",
        severity: "Review",
        ipAddress: "10.0.0.16",
      },
      ...snap.auditLogs,
    ],
  };
  provider.saveSnapshot(updatedSnap);
  await provider.hydrateState();

  const setActiveUser = async (userId) => {
    const current = provider.getState();
    const u = current.users.find((x) => x.id === userId);
    const issued = new Date(nowFn()).toISOString();
    const expires = new Date(nowFn() + 8 * 60 * 60 * 1000).toISOString();
    provider.saveSnapshot({
      ...current,
      session: {
        authenticated: true,
        userId: u.id,
        role: u.role,
        issuedAt: issued,
        expiresAt: expires,
      },
    });
    await provider.hydrateState();
  };

  return { provider, investorId, staffProfiles, rawNin, rawBvn, setActiveUser };
}

// ── 10.1 Role Isolation Across All 5 Roles ───────────────────────────────────

describe("Phase 6.6 — 10.1 Five-Role Administrative Read Isolation", () => {
  it("enforces exact domain & report boundaries for super_admin, admin, finance_officer, compliance_officer, investor, unauthenticated, expired, and suspended", async () => {
    let clockMs = Date.now();
    const storage = createMemoryStorage();
    const { provider, investorId, staffProfiles, setActiveUser } = await buildRoleTestScenario(
      storage,
      () => clockMs,
    );
    const orch = adminMod.createAdminReadOrchestrator({
      mockProvider: provider,
      now: () => clockMs,
    });

    // 1. Unauthenticated caller -> UNAUTHENTICATED
    const unauthSnap = await orch.loadAdminSnapshot();
    assert.equal(unauthSnap.status, "unauthenticated");
    assert.equal((await orch.getPlatformOverview()).error?.code, "UNAUTHENTICATED");
    assert.equal((await orch.getFinancialReports()).error?.code, "UNAUTHENTICATED");

    // 2. Investor -> FORBIDDEN on ALL 12 admin read domains
    await setActiveUser(investorId);
    const invSnap = await orch.loadAdminSnapshot();
    assert.equal(invSnap.status, "forbidden");
    assert.equal(invSnap.isForbidden, true);
    assert.equal(invSnap.permittedDomains.length, 0);
    assert.equal(invSnap.permittedReports.length, 0);
    const allOrchCalls = [
      orch.getPlatformOverview(),
      orch.getInvestorSummaries(),
      orch.getStaffSummaries(),
      orch.getDepositSummaries(),
      orch.getWithdrawalSummaries(),
      orch.getTransactionSummaries(),
      orch.getInvestmentSummaries(),
      orch.getInvestmentPlans(),
      orch.getFinancialReports(),
      orch.getComplianceSummaries(),
      orch.getActivitySummaries(),
      orch.getSystemStatus(),
    ];
    for (const res of await Promise.all(allOrchCalls)) {
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, "FORBIDDEN");
    }

    // 3. Super Admin -> permitted on ALL 12 read-only domains & all 4 reports
    await setActiveUser(staffProfiles.super_admin.id);
    const superSnap = await orch.loadAdminSnapshot();
    assert.equal(superSnap.status, "ready");
    assert.equal(superSnap.effectiveRole, "super_admin");
    assert.equal(superSnap.permittedDomains.length, 12);
    assert.equal(superSnap.permittedReports.length, 4);
    assert.equal(superSnap.overview.investorCounts.total, 1);
    assert.equal(superSnap.overview.financialTotals.totalAumKobo, 400_000 * 100);
    assert.equal(superSnap.investors.length, 1);
    assert.equal(superSnap.staff.length, 5);
    assert.equal(superSnap.deposits.length, 2);
    assert.equal(superSnap.withdrawals.length, 1);
    assert.equal(superSnap.investments.length, 1);
    assert.equal(superSnap.plans.length, 4);
    assert.equal(superSnap.financialReport.reconciliation.reconciled, true);
    assert.equal(superSnap.financialReport.reconciliation.discrepancyKobo, 0);
    assert.equal(superSnap.compliance.length, 1);
    assert.equal(superSnap.systemStatus.supabaseLiveActivationAllowed, false);

    // 4. Admin -> permitted ops reads; FORBIDDEN on staff, financial_reports, compliance, system_status
    await setActiveUser(staffProfiles.admin.id);
    const adminSnap = await orch.loadAdminSnapshot();
    assert.equal(adminSnap.status, "ready");
    assert.equal(adminSnap.effectiveRole, "admin");
    assert.equal(adminSnap.overview.staffAccountsCount, null);
    assert.equal(adminSnap.investors.length, 1);
    assert.equal(adminSnap.deposits.length, 2);
    assert.equal(adminSnap.withdrawals.length, 1);
    assert.equal(adminSnap.investments.length, 1);
    assert.equal(adminSnap.staff.length, 0);
    assert.equal(adminSnap.financialReport, null);
    assert.equal(adminSnap.compliance.length, 0);
    assert.equal(adminSnap.systemStatus, null);
    assert.equal((await orch.getStaffSummaries()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getFinancialReports()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getComplianceSummaries()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getSystemStatus()).error?.code, "FORBIDDEN");

    // 5. Finance Officer -> financial reads + reconciliation; FORBIDDEN on compliance, investor directory, staff, system_status
    await setActiveUser(staffProfiles.finance_officer.id);
    const finSnap = await orch.loadAdminSnapshot();
    assert.equal(finSnap.status, "ready");
    assert.equal(finSnap.effectiveRole, "finance_officer");
    assert.equal(finSnap.financialReport.totalConfirmedDepositsKobo, 400_000 * 100);
    assert.equal(finSnap.financialReport.totalActivePrincipalKobo, 200_000 * 100);
    assert.equal(finSnap.financialReport.totalPendingWithdrawalsKobo, 50_000 * 100);
    assert.equal(finSnap.financialReport.reconciliation.reconciled, true);
    assert.deepEqual(finSnap.permittedReports, ["treasury_cashflow", "investment_allocations"]);
    assert.equal(finSnap.compliance.length, 0);
    assert.equal(finSnap.investors.length, 0);
    assert.equal(finSnap.activities.some((a) => a.targetType === "Security"), false);
    assert.equal((await orch.getComplianceSummaries()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getInvestorSummaries()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getStaffSummaries()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getSystemStatus()).error?.code, "FORBIDDEN");

    // 6. Compliance Officer -> masked KYC & investor verification; FORBIDDEN on financial reports, deposits, withdrawals, transactions, investments, plans, staff, system_status
    await setActiveUser(staffProfiles.compliance_officer.id);
    const compSnap = await orch.loadAdminSnapshot();
    assert.equal(compSnap.status, "ready");
    assert.equal(compSnap.effectiveRole, "compliance_officer");
    assert.equal(compSnap.overview.financialTotals, null);
    assert.equal(compSnap.investors.length, 1);
    assert.equal(compSnap.investors[0].totalBalanceKobo, null);
    assert.equal(compSnap.investors[0].totalBalanceNaira, null);
    assert.equal(compSnap.compliance.length, 1);
    assert.equal(compSnap.compliance[0].maskedIdLast4, "••••8901");
    assert.equal(compSnap.compliance[0].maskedBvnLast4, "••••4455");
    assert.deepEqual(compSnap.permittedReports, [
      "client_kyc_registry",
      "referral_and_compliance_audit",
    ]);
    assert.equal(compSnap.activities.some((a) => a.targetType === "Deposit"), false);
    assert.equal((await orch.getFinancialReports()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getDepositSummaries()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getWithdrawalSummaries()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getTransactionSummaries()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getInvestmentSummaries()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getInvestmentPlans()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getStaffSummaries()).error?.code, "FORBIDDEN");
    assert.equal((await orch.getSystemStatus()).error?.code, "FORBIDDEN");

    // 7. Suspended staff account fails closed
    await setActiveUser(staffProfiles.suspended_staff.id);
    const suspSnap = await orch.loadAdminSnapshot();
    assert.equal(suspSnap.status, "unauthenticated");
    assert.equal((await orch.getPlatformOverview()).ok, false);

    // 8. Expired staff session fails closed with SESSION_EXPIRED
    await setActiveUser(staffProfiles.super_admin.id);
    clockMs += 9 * 60 * 60 * 1000; // past 8h TTL
    const expSnap = await orch.loadAdminSnapshot();
    assert.equal(expSnap.status, "session_expired");
    assert.equal((await orch.getPlatformOverview()).error?.code, "SESSION_EXPIRED");
  });
});

// ── 10.2 Tampering & Direct Invocation Protection ────────────────────────────

describe("Phase 6.6 — 10.2 Tampering, Forged Metadata & Direct Adapter Invocation", () => {
  it("blocks modified localStorage roles, forged staffRole on investor profiles, unknown staffRole elevation, and direct adapter bypasses", async () => {
    const clockMs = Date.now();
    const storage = createMemoryStorage();
    const { provider, investorId, staffProfiles, setActiveUser } = await buildRoleTestScenario(
      storage,
      () => clockMs,
    );

    // Sign in as investor, then tamper localStorage with session.role="admin" AND investor.staffRole="super_admin"
    await setActiveUser(investorId);
    const raw = JSON.parse(storage.getItem(provider.storageKey));
    raw.session.role = "admin";
    raw.users = raw.users.map((u) =>
      u.id === investorId ? { ...u, staffRole: "super_admin" } : u,
    );
    storage.setItem(provider.storageKey, JSON.stringify(raw));

    const reloaded = mockProviderMod.createMockDataProvider({ storage });
    await reloaded.hydrateState();
    assert.equal(reloaded.getState().session.role, "investor");

    // Even mockAuthAdapter must resolve dbRoles strictly as ["investor"]
    const investorUser = reloaded.getState().users.find((u) => u.id === investorId);
    assert.deepEqual(authMod.mapMockUserToAuthUser(investorUser).dbRoles, ["investor"]);

    // Direct adapter invocation (bypassing UI guards and orchestrator) STILL returns FORBIDDEN
    const directAdapter = adminMod.createMockAdminReadAdapter({
      dataProvider: reloaded,
      now: () => clockMs,
    });
    assert.equal((await directAdapter.getPlatformOverview()).code, "FORBIDDEN");
    assert.equal((await directAdapter.listStaffSummaries()).code, "FORBIDDEN");
    assert.equal((await directAdapter.getFinancialReports()).code, "FORBIDDEN");
    assert.equal((await directAdapter.listComplianceSummaries()).code, "FORBIDDEN");

    // Tampered unknown staffRole on admin account must default conservatively to "admin" (never super_admin)
    await setActiveUser(staffProfiles.admin.id);
    const rawAdmin = JSON.parse(storage.getItem(provider.storageKey));
    rawAdmin.users = rawAdmin.users.map((u) =>
      u.id === staffProfiles.admin.id ? { ...u, staffRole: "root_override" } : u,
    );
    storage.setItem(provider.storageKey, JSON.stringify(rawAdmin));

    const reloadedAdmin = mockProviderMod.createMockDataProvider({ storage });
    await reloadedAdmin.hydrateState();
    const adminOrch = adminMod.createAdminReadOrchestrator({
      mockProvider: reloadedAdmin,
      now: () => clockMs,
    });
    const overview = await adminOrch.getPlatformOverview();
    assert.equal(overview.ok, true);
    assert.equal(overview.effectiveRole, "admin");
    assert.equal((await adminOrch.getStaffSummaries()).error?.code, "FORBIDDEN");
    assert.equal((await adminOrch.getSystemStatus()).error?.code, "FORBIDDEN");

    // Invalid / orphaned session userId fails closed
    const rawOrphan = JSON.parse(storage.getItem(provider.storageKey));
    rawOrphan.session = {
      authenticated: true,
      userId: "USR-NONEXISTENT",
      role: "admin",
      issuedAt: new Date(clockMs).toISOString(),
      expiresAt: new Date(clockMs + 3_600_000).toISOString(),
    };
    storage.setItem(provider.storageKey, JSON.stringify(rawOrphan));
    const orphanProvider = mockProviderMod.createMockDataProvider({ storage });
    await orphanProvider.hydrateState();
    const orphanOrch = adminMod.createAdminReadOrchestrator({
      mockProvider: orphanProvider,
      now: () => clockMs,
    });
    assert.equal((await orphanOrch.loadAdminSnapshot()).status, "unauthenticated");
  });
});

// ── 10.3 Data Masking & Post-Hydration Sanitization ──────────────────────────

describe("Phase 6.6 — 10.3 Data Masking & Sensitive Field Stripping", () => {
  it("never exposes raw BVN/NIN, document hashes, auth tokens, vendor secrets, IP addresses, or internal notes across serialization and hydration", async () => {
    const clockMs = Date.now();
    const storage = createMemoryStorage();
    const { provider, staffProfiles, rawNin, rawBvn, setActiveUser } = await buildRoleTestScenario(
      storage,
      () => clockMs,
    );

    // Activate super_admin first, then inject synthetic sensitive fields into stored snapshot
    // to verify sanitization survives hydration without being overwritten
    await setActiveUser(staffProfiles.super_admin.id);
    const raw = JSON.parse(storage.getItem(provider.storageKey));
    raw.kycSubmissions = raw.kycSubmissions.map((k) => ({
      ...k,
      reviewerNote: "INTERNAL_COMPLIANCE_SECRET_NOTE",
      bvn_hash: "sha256-bvn-hash-secret",
      nin_hash: "sha256-nin-hash-secret",
      vendor_secret: "vendor-top-secret-key",
    }));
    storage.setItem(provider.storageKey, JSON.stringify(raw));

    const rehydrated = mockProviderMod.createMockDataProvider({ storage });
    await rehydrated.hydrateState();

    const orch = adminMod.createAdminReadOrchestrator({
      mockProvider: rehydrated,
      now: () => clockMs,
    });
    const snap = await orch.loadAdminSnapshot();
    const serialized = JSON.stringify(snap);

    assert.equal(serialized.includes(rawNin), false, "Full NIN must never appear in admin snapshot");
    assert.equal(serialized.includes(rawBvn), false, "Full BVN must never appear in admin snapshot");
    assert.equal(serialized.includes("sha256-bvn-hash-secret"), false);
    assert.equal(serialized.includes("sha256-nin-hash-secret"), false);
    assert.equal(serialized.includes("vendor-top-secret-key"), false);
    assert.equal(serialized.includes("INTERNAL_COMPLIANCE_SECRET_NOTE"), false);
    assert.equal(serialized.includes("eyJhbGciOiJIUzI1NiJ9"), false, "JWT token must be redacted in activity summary");
    assert.equal(serialized.includes("10.0.0.15"), false, "Raw IP addresses should not leak in sanitized activity view");
    assert.equal(serialized.includes("InvestorPass#2026"), false);

    assert.equal(snap.compliance[0].maskedIdLast4, "••••8901");
    assert.equal(snap.compliance[0].maskedBvnLast4, "••••4455");
    assert.equal(snap.compliance[0].idDocumentSubmitted, true);
    assert.equal(snap.compliance[0].proofOfAddressSubmitted, true);
  });
});

// ── 10.4 Write Standby Contracts & Four-Eyes Validation ──────────────────────

describe("Phase 6.6 — 10.4 Financial Write-Adapter Standby & Four-Eyes Contracts", () => {
  it("returns STANDBY_NOT_ENABLED with zero mutations and zero network calls for ALL 21 write operations across 5 categories", async () => {
    const adapter = supabaseProviderMod.supabaseDataProvider.writeStandby;
    assert.equal(adapter.mode, "standby_disabled");
    assert.equal(adapter.activationAllowed, false);

    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("Network call prohibited in standby write adapter!");
    };

    const validApproval = {
      actionId: "ACT-001",
      initiatingActor: { actorId: "STF-INIT", role: "admin" },
      firstApprover: { actorId: "STF-FIN-1", role: "finance_officer" },
      secondApprover: { actorId: "STF-SUPER-2", role: "super_admin" },
      approvalState: "pending_second_approval",
      rejectionState: null,
      separationOfDuties: writesMod.FOUR_EYES_PRESETS.withdrawalApproval,
      auditReference: null,
    };

    const base = {
      actor: { actorId: "STF-INIT", role: "super_admin" },
      targetEntity: { entityType: "withdrawal", entityId: "ENT-1" },
      operationReference: "OP-REF-001",
      idempotencyKey: "IDEM-001",
      expectedState: "pending_approval",
      approval: validApproval,
    };

    try {
      const results = await Promise.all([
        // Deposits (3)
        adapter.deposits.initiateDeposit({
          ...base,
          amountKobo: 100_000_00,
          currency: "NGN",
          channel: "paystack_checkout_bank_transfer",
        }),
        adapter.deposits.confirmDeposit({
          ...base,
          amountKobo: 100_000_00,
          serverVerificationRef: "PSK-REF-1",
        }),
        adapter.deposits.reconcileDeposit({
          ...base,
          settledAmountKobo: 100_000_00,
          providerSettlementRef: "SET-1",
        }),
        // Withdrawals (5)
        adapter.withdrawals.submitWithdrawalRequest({
          ...base,
          amountKobo: 50_000_00,
          destinationBankAccountId: "BANK-1",
          currency: "NGN",
        }),
        adapter.withdrawals.approveWithdrawal({ ...base, approval: validApproval }),
        adapter.withdrawals.rejectWithdrawal({ ...base, reason: "Policy hold" }),
        adapter.withdrawals.executeWithdrawal({
          ...base,
          approval: validApproval,
          withdrawalBatchId: "BATCH-1",
          payoutIdempotencyRef: "PAY-1",
        }),
        adapter.withdrawals.reconcileWithdrawal({
          ...base,
          providerTransferRef: "TRF-1",
          settledAmountKobo: 50_000_00,
        }),
        // Investments (4)
        adapter.investments.createInvestment({
          ...base,
          planId: "plan-silver-liquidity",
          principalKobo: 200_000_00,
          rolloverMode: "principal_only",
        }),
        adapter.investments.matureInvestment({
          ...base,
          approval: validApproval,
          realizedReturnKobo: 4_400_00,
        }),
        adapter.investments.processMaturity({
          ...base,
          approval: validApproval,
          disposition: "settle_to_available",
        }),
        adapter.investments.applyRolloverInstruction({
          ...base,
          rolloverMode: "principal_plus_net_return",
          consentVersion: "v1.0",
        }),
        // KYC (4)
        adapter.kyc.submitVerification({
          ...base,
          targetTier: "Tier 3",
          documentStoragePaths: ["kyc-private/doc1.pdf"],
        }),
        adapter.kyc.approveVerification({
          ...base,
          approvedTier: "Tier 3",
          approval: validApproval,
        }),
        adapter.kyc.rejectVerification({
          ...base,
          reasonCode: "DOCUMENT_BLURRY",
          investorSafeSummary: "Please re-upload a clearer document.",
        }),
        adapter.kyc.requestAdditionalInformation({
          ...base,
          requestedDocuments: ["proof_of_address"],
          investorSafeSummary: "Upload a recent utility bill.",
        }),
        // Administration (5)
        adapter.administration.createStaffAccount({
          ...base,
          email: "newstaff@silverspoon.ng",
          fullName: "New Officer",
          assignedRole: "finance_officer",
          approval: validApproval,
        }),
        adapter.administration.changeStaffRole({
          ...base,
          previousRole: "admin",
          nextRole: "finance_officer",
          approval: validApproval,
        }),
        adapter.administration.suspendAccount({
          ...base,
          targetStatus: "suspended",
          reason: "Compliance review",
        }),
        adapter.administration.reactivateAccount({
          ...base,
          approval: validApproval,
          reason: "Cleared by compliance",
        }),
        adapter.administration.updatePermittedPlatformSettings({
          ...base,
          settingKey: "deposit.min_kobo",
          valueJson: { amount_kobo: 1_000_000 },
          approval: validApproval,
        }),
      ]);

      assert.equal(results.length, 21);
      for (const res of results) {
        assert.equal(res.ok, false);
        assert.equal(res.status, "STANDBY_NOT_ENABLED");
        assert.equal(res.code, "STANDBY_NOT_ENABLED");
        assert.equal(res.executed, false);
        assert.equal(res.mutated, false);
        assert.equal(res.auditReference, null);
        assert.equal(res.error.code, "STANDBY_NOT_ENABLED");
        assert.equal(res.error.retryable, false);
      }
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("enforces four-eyes distinct-actor separation-of-duties validation boundaries", () => {
    const preset = writesMod.FOUR_EYES_PRESETS.withdrawalApproval;

    // 1. Self-approval rejected
    const selfRes = writesMod.validateFourEyesApprovalBoundary({
      actionId: "ACT-SELF",
      initiatingActor: { actorId: "STF-1", role: "finance_officer" },
      firstApprover: { actorId: "STF-1", role: "finance_officer" },
      secondApprover: null,
      approvalState: "pending_second_approval",
      rejectionState: null,
      separationOfDuties: preset,
      auditReference: null,
    });
    assert.equal(selfRes.valid, false);
    assert.ok(selfRes.violations.some((v) => v.code === "SELF_APPROVAL_PROHIBITED"));

    // 2. Same actor for first & second approval rejected
    const dupRes = writesMod.validateFourEyesApprovalBoundary({
      actionId: "ACT-DUP",
      initiatingActor: { actorId: "STF-1", role: "admin" },
      firstApprover: { actorId: "STF-2", role: "finance_officer" },
      secondApprover: { actorId: "STF-2", role: "finance_officer" },
      approvalState: "approved",
      rejectionState: null,
      separationOfDuties: preset,
      auditReference: null,
    });
    assert.equal(dupRes.valid, false);
    assert.ok(dupRes.violations.some((v) => v.code === "DUPLICATE_APPROVER_PROHIBITED"));

    // 3. Unauthorized role rejected
    const badRoleRes = writesMod.validateFourEyesApprovalBoundary({
      actionId: "ACT-ROLE",
      initiatingActor: { actorId: "STF-1", role: "admin" },
      firstApprover: { actorId: "STF-2", role: "compliance_officer" },
      secondApprover: null,
      approvalState: "pending_second_approval",
      rejectionState: null,
      separationOfDuties: preset,
      auditReference: null,
    });
    assert.equal(badRoleRes.valid, false);
    assert.ok(badRoleRes.violations.some((v) => v.code === "UNAUTHORIZED_FIRST_APPROVER_ROLE"));

    // 4. Valid 3-distinct-actor approval passes structural check
    const okRes = writesMod.validateFourEyesApprovalBoundary({
      actionId: "ACT-OK",
      initiatingActor: { actorId: "STF-1", role: "admin" },
      firstApprover: { actorId: "STF-2", role: "finance_officer" },
      secondApprover: { actorId: "STF-3", role: "super_admin" },
      approvalState: "approved",
      rejectionState: null,
      separationOfDuties: preset,
      auditReference: "AUD-123",
    });
    assert.equal(okRes.valid, true);
    assert.equal(okRes.violations.length, 0);
  });
});

// ── 10.5 & 11: Empty State, Supabase Disconnected Standby, Network Isolation & Protections ─

describe("Phase 6.6 — 10.5 & 11 Empty State, Network Isolation, Investor Regression & Project Protections", () => {
  it("preserves clean empty initial state for staff and executes zero network calls in Supabase standby mode", async () => {
    const storage = createMemoryStorage();
    const provider = mockProviderMod.createMockDataProvider({ storage });
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresIso = new Date(nowMs + 8 * 60 * 60 * 1000).toISOString();

    // Seed ONLY one staff user inside test storage with zero investors/transactions/investments
    const base = provider.getState();
    provider.saveSnapshot({
      ...base,
      users: [
        {
          id: "STF-EMPTY",
          fullName: "Super Admin",
          email: "empty-super@silverspoon.ng",
          emailVerified: true,
          phone: "+2348000000000",
          city: "Lagos",
          address: "VI, Lagos",
          role: "admin",
          staffRole: "super_admin",
          tier: "Sovereign",
          status: "Active",
          kycLevel: "Tier 3",
          referralCode: "SS-EMPTY",
          joinedAt: nowIso,
          lastLoginAt: nowIso,
          twoFactorEnabled: true,
          emailAlerts: true,
          smsAlerts: false,
          bankAccount: {
            bankName: "",
            bankCode: "",
            accountNumber: "",
            accountName: "",
            verified: false,
            verificationStatus: "Unverified",
          },
        },
      ],
      session: {
        authenticated: true,
        userId: "STF-EMPTY",
        role: "admin",
        issuedAt: nowIso,
        expiresAt: expiresIso,
      },
    });
    await provider.hydrateState();

    const mockOrch = adminMod.createAdminReadOrchestrator({
      mockProvider: provider,
      now: () => nowMs,
    });
    const emptySnap = await mockOrch.loadAdminSnapshot();
    assert.equal(emptySnap.status, "empty");
    assert.equal(emptySnap.isEmpty, true);
    assert.equal(emptySnap.overview.investorCounts.total, 0);
    assert.equal(emptySnap.overview.financialTotals.totalAumKobo, 0);
    assert.equal(emptySnap.plans.length, 4);
    assert.equal(emptySnap.financialReport.reconciliation.reconciled, true);
    assert.equal(emptySnap.financialReport.reconciliation.totalCustomerLiabilityKobo, 0);

    // Supabase standby mode executes ZERO network calls across all 12 admin read methods + loadAdminSnapshot
    assert.equal(supabaseConfig.SUPABASE_LIVE_ACTIVATION_ALLOWED, false);
    let fetchCount = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCount += 1;
      throw new Error("Network call forbidden in Supabase standby mode!");
    };
    try {
      const supaOrch = adminMod.createAdminReadOrchestrator({
        env: { VITE_DATA_PROVIDER: "supabase" },
      });
      assert.equal(supaOrch.providerId, "supabase");
      assert.equal(supaOrch.standbyMode, true);
      const supaSnap = await supaOrch.loadAdminSnapshot();
      assert.equal(supaSnap.status, "disconnected");
      assert.equal(supaSnap.isDisconnected, true);

      const calls = await Promise.all([
        supaOrch.getPlatformOverview(),
        supaOrch.getInvestorSummaries(),
        supaOrch.getStaffSummaries(),
        supaOrch.getDepositSummaries(),
        supaOrch.getWithdrawalSummaries(),
        supaOrch.getTransactionSummaries(),
        supaOrch.getInvestmentSummaries(),
        supaOrch.getInvestmentPlans(),
        supaOrch.getFinancialReports(),
        supaOrch.getComplianceSummaries(),
        supaOrch.getActivitySummaries(),
        supaOrch.getSystemStatus(),
      ]);
      for (const r of calls) {
        assert.equal(r.ok, false);
        assert.equal(r.error?.code, "STANDBY_DISCONNECTED");
      }
      assert.equal(fetchCount, 0);
    } finally {
      globalThis.fetch = origFetch;
    }

    // Existing investor orchestrator still rejects admin sessions cleanly (investor regression check)
    const invOrch = investorMod.createInvestorReadOrchestrator({
      mockProvider: provider,
      now: () => Date.parse(nowIso),
    });
    assert.equal((await invOrch.getWalletSummary()).error?.code, "FORBIDDEN");
  });

  it("keeps 14 frozen migrations untouched, zero Supabase SDK installed, and zero UI imports of writes/Supabase/mockDataProvider", () => {
    const migrations = readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) =>
      f.endsWith(".sql"),
    );
    assert.equal(migrations.length, 14);
    assert.equal(
      migrations.every((m) => /^2026112300(0[1-9]|1[0-4])00_/.test(m)),
      true,
      "Only frozen migrations 0001–0014 may exist",
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
        assert.equal(
          src.includes("@/services/writes"),
          false,
          `UI file ${path.relative(ROOT, file)} must not expose standby write adapters`,
        );
      }
    }
  });
});

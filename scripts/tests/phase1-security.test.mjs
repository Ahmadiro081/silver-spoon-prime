import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC_ROOT = path.resolve(process.cwd(), "src");

// Resolve `@/*` TypeScript path aliases directly for Node's built-in TypeScript loader.
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
});

const csv = await import("@/utils/csv");
const platform = await import("@/services/platformService");

const BASE_SETTINGS = {
  minDepositAmount: 25_000,
  maxDailyWithdrawal: 5_000_000,
  autoApproveDepositsUnder: 250_000,
  referralCommissionPercent: 2.5,
  withdrawalFeeThreshold: 2_000_000,
  highValueWithdrawalFee: 2_500,
  maintenanceMode: false,
  requireKycForWithdrawals: true,
};

const ACTIVE_INVESTOR = {
  id: "USR-1001",
  role: "investor",
  fullName: "Adaeze Okonkwo",
  email: "adaeze.okonkwo@silverspoon.ng",
  phone: "+234 809 412 8830",
  tier: "Private Wealth",
  kycLevel: "Tier 3",
  status: "Active",
  emailVerified: true,
  twoFactorEnabled: true,
  referralCode: "SS-ADAEZE88",
  joinedAt: "2025-01-12T09:00:00.000Z",
  city: "Ikoyi, Lagos",
  address: "14 Bourdillon Road, Ikoyi, Lagos",
  bankAccount: {
    bankName: "Guaranty Trust Bank (GTBank)",
    accountName: "Adaeze Okonkwo",
    accountNumber: "0148294021",
    bvnLast4: "4821",
  },
  emailAlerts: true,
  smsAlerts: true,
};

const SUSPENDED_INVESTOR = {
  ...ACTIVE_INVESTOR,
  id: "USR-1005",
  status: "Suspended",
};

const ACTIVE_PLAN = {
  id: "PLAN-FIXED",
  name: "Silver Sovereign Fixed Note",
  code: "SS-FIXED",
  category: "Fixed Income",
  tagline: "Treasury-backed quarterly yield.",
  description: "Fixed-income note.",
  targetReturnPercent: 14.5,
  durationDays: 90,
  minAmount: 100_000,
  maxAmount: 25_000_000,
  riskBand: "Conservative",
  payoutSchedule: "At Maturity",
  status: "Active",
  liquidityNote: "90-day lock.",
  highlights: ["NGN denominated"],
};

describe("Phase 1: CSV Sanitization & Export Formatting", () => {
  it("neutralizes spreadsheet formula injection prefixes including leading whitespace", () => {
    assert.equal(csv.sanitizeCsvCell("=CMD|' /C calc'!A0"), `"'=CMD|' /C calc'!A0"`);
    assert.equal(csv.sanitizeCsvCell("+SUM(A1:A5)"), `"'+SUM(A1:A5)"`);
    assert.equal(csv.sanitizeCsvCell("-100+200"), `"'-100+200"`);
    assert.equal(csv.sanitizeCsvCell("@SUM(1,2)"), `"'@SUM(1,2)"`);
    assert.equal(csv.sanitizeCsvCell("  =HYPERLINK(\"http://example.com\")"), `"'  =HYPERLINK(""http://example.com"")"`);
    assert.equal(csv.sanitizeCsvCell("\t+1+1"), `"'\t+1+1"`);
  });

  it("escapes embedded quotes, commas, and line breaks per RFC-4180", () => {
    assert.equal(csv.sanitizeCsvCell(`Note: "Priority, VIP"`), `"Note: ""Priority, VIP"""`);
    assert.equal(csv.sanitizeCsvCell("Line 1\nLine 2"), `"Line 1\nLine 2"`);
    assert.equal(csv.sanitizeCsvCell(250000), "250000");
    assert.equal(csv.sanitizeCsvCell(null), "");
    assert.equal(csv.sanitizeCsvCell(undefined), "");
  });

  it("builds clearly separated, labeled multi-section CSV reports", () => {
    const output = csv.buildMultiSectionCsv([
      {
        title: "SECTION 1: REFERRAL COMMISSION RECORDS",
        headers: ["Referral ID", "Commission"],
        rows: [["REF-1", 25000]],
      },
      {
        title: "SECTION 2: COMPLIANCE AUDIT TRAIL",
        headers: ["Audit ID", "Details"],
        rows: [["AUD-1", "=malicious"]],
      },
    ]);

    assert.ok(output.includes("SECTION 1: REFERRAL COMMISSION RECORDS"));
    assert.ok(output.includes("SECTION 2: COMPLIANCE AUDIT TRAIL"));
    assert.ok(output.includes("\r\n\r\nSECTION 2: COMPLIANCE AUDIT TRAIL\r\n"));
    assert.ok(output.includes(`"'=malicious"`));
  });
});

describe("Phase 1: Collision-Resistant ID & Code Generation", () => {
  it("preserves prefixes and generates high-entropy collision-free IDs", () => {
    const generated = new Set();
    for (let i = 0; i < 1000; i += 1) {
      const id = platform.generateId("TXN");
      assert.match(id, /^TXN-[A-F0-9]{12}$/);
      generated.add(id);
    }
    assert.equal(generated.size, 1000);
  });

  it("generates properly formatted references, numeric codes, and recovery tokens", () => {
    assert.match(platform.generateReference("DEP"), /^SS-DEP-\d{8}-[A-F0-9]{8}$/);
    assert.match(platform.generateNumericCode(6), /^\d{6}$/);
    assert.match(platform.generateRecoveryToken(), /^SS-[A-F0-9]{8}$/);
  });
});

describe("Phase 1: Suspended Account Protection", () => {
  it("blocks suspended investors from deposits, withdrawals, and investment subscriptions", () => {
    const depositRes = platform.validateDeposit(
      { amount: 100_000, channel: "Bank Transfer (NIP)" },
      BASE_SETTINGS,
      SUSPENDED_INVESTOR,
    );
    assert.equal(depositRes.ok, false);
    assert.match(depositRes.error ?? "", /suspended/i);

    const withdrawalRes = platform.validateWithdrawal(
      { amount: 50_000 },
      1_000_000,
      SUSPENDED_INVESTOR,
      BASE_SETTINGS,
      [],
    );
    assert.equal(withdrawalRes.ok, false);
    assert.match(withdrawalRes.error ?? "", /suspended/i);

    const subscribeRes = platform.validateInvestmentSubscription(
      { planId: ACTIVE_PLAN.id, amount: 250_000, autoCompound: true },
      ACTIVE_PLAN,
      1_000_000,
      SUSPENDED_INVESTOR,
    );
    assert.equal(subscribeRes.ok, false);
    assert.match(subscribeRes.error ?? "", /suspended/i);
  });
});

describe("Phase 1: Cumulative Daily Withdrawal Limit Enforcement", () => {
  it("sums same-UTC-day Completed and Pending withdrawals while excluding Declined and prior days", () => {
    const today = new Date("2026-03-10T14:00:00.000Z");
    const txns = [
      {
        id: "TXN-1",
        reference: "SS-WDR-1",
        userId: ACTIVE_INVESTOR.id,
        userName: ACTIVE_INVESTOR.fullName,
        userEmail: ACTIVE_INVESTOR.email,
        type: "Withdrawal",
        amount: 2_500_000,
        fee: 2_500,
        status: "Completed",
        channel: "Bank Transfer (NIP)",
        createdAt: "2026-03-10T08:30:00.000Z",
      },
      {
        id: "TXN-2",
        reference: "SS-WDR-2",
        userId: ACTIVE_INVESTOR.id,
        userName: ACTIVE_INVESTOR.fullName,
        userEmail: ACTIVE_INVESTOR.email,
        type: "Withdrawal",
        amount: 2_000_000,
        fee: 2_500,
        status: "Pending",
        channel: "Bank Transfer (NIP)",
        createdAt: "2026-03-10T11:00:00.000Z",
      },
      {
        id: "TXN-3",
        reference: "SS-WDR-3",
        userId: ACTIVE_INVESTOR.id,
        userName: ACTIVE_INVESTOR.fullName,
        userEmail: ACTIVE_INVESTOR.email,
        type: "Withdrawal",
        amount: 4_000_000,
        fee: 2_500,
        status: "Declined",
        channel: "Bank Transfer (NIP)",
        createdAt: "2026-03-10T09:00:00.000Z",
      },
      {
        id: "TXN-4",
        reference: "SS-WDR-4",
        userId: ACTIVE_INVESTOR.id,
        userName: ACTIVE_INVESTOR.fullName,
        userEmail: ACTIVE_INVESTOR.email,
        type: "Withdrawal",
        amount: 3_000_000,
        fee: 2_500,
        status: "Completed",
        channel: "Bank Transfer (NIP)",
        createdAt: "2026-03-09T23:59:59.000Z",
      },
    ];

    assert.equal(platform.calculateDailyWithdrawalTotal(txns, ACTIVE_INVESTOR.id, today), 4_500_000);

    // 4.5M used + 600k requested > 5M limit -> must reject
    const rejected = platform.validateWithdrawal(
      { amount: 600_000 },
      10_000_000,
      ACTIVE_INVESTOR,
      BASE_SETTINGS,
      txns,
      today,
    );
    assert.equal(rejected.ok, false);
    assert.match(rejected.error ?? "", /Cumulative daily withdrawal limit exceeded/i);

    // 4.5M used + 500k requested === 5M limit -> must allow
    const allowed = platform.validateWithdrawal(
      { amount: 500_000 },
      10_000_000,
      ACTIVE_INVESTOR,
      BASE_SETTINGS,
      txns,
      today,
    );
    assert.equal(allowed.ok, true);
  });
});

describe("Phase 1: Admin Financial Settings Validation", () => {
  it("accepts valid baseline financial settings", () => {
    assert.equal(platform.validatePlatformSettings(BASE_SETTINGS).ok, true);
  });

  it("rejects NaN, negative values, invalid percentages, and contradictory fee thresholds", () => {
    assert.equal(platform.validatePlatformSettings({ ...BASE_SETTINGS, minDepositAmount: Number.NaN }).ok, false);
    assert.equal(platform.validatePlatformSettings({ ...BASE_SETTINGS, minDepositAmount: -500 }).ok, false);
    assert.equal(platform.validatePlatformSettings({ ...BASE_SETTINGS, maxDailyWithdrawal: 1_000 }).ok, false);
    assert.equal(platform.validatePlatformSettings({ ...BASE_SETTINGS, autoApproveDepositsUnder: -1 }).ok, false);
    assert.equal(platform.validatePlatformSettings({ ...BASE_SETTINGS, referralCommissionPercent: -0.5 }).ok, false);
    assert.equal(platform.validatePlatformSettings({ ...BASE_SETTINGS, referralCommissionPercent: 30 }).ok, false);
    assert.equal(
      platform.validatePlatformSettings({
        ...BASE_SETTINGS,
        withdrawalFeeThreshold: 2_000,
        highValueWithdrawalFee: 2_500,
      }).ok,
      false,
    );
  });
});

describe("Phase 1: Per-User Notification Read Isolation", () => {
  it("isolates broadcast read state between investors and blocks cross-user read tampering", () => {
    const initial = [
      {
        id: "NTF-BROADCAST",
        userId: "ALL",
        title: "Market Update",
        message: "Treasury yields updated.",
        category: "System",
        readByUserIds: [],
        createdAt: "2026-03-10T09:00:00.000Z",
      },
      {
        id: "NTF-USER1",
        userId: "USR-1001",
        title: "Deposit Credited",
        message: "Wallet funded.",
        category: "Transaction",
        readByUserIds: [],
        createdAt: "2026-03-10T10:00:00.000Z",
      },
    ];

    // USR-1001 marks broadcast read -> must NOT mark it read for USR-1002
    const afterUser1 = platform.markNotificationReadForUser(initial, "NTF-BROADCAST", "USR-1001");
    assert.equal(platform.isNotificationReadByUser(afterUser1[0], "USR-1001"), true);
    assert.equal(platform.isNotificationReadByUser(afterUser1[0], "USR-1002"), false);

    // USR-1002 tries to mark USR-1001's private notification read -> must be ignored
    const afterTamperAttempt = platform.markNotificationReadForUser(afterUser1, "NTF-USER1", "USR-1002");
    assert.equal(platform.isNotificationReadByUser(afterTamperAttempt[1], "USR-1001"), false);
    assert.equal(platform.isNotificationReadByUser(afterTamperAttempt[1], "USR-1002"), false);

    // USR-1002 marks all visible notifications read -> only broadcast changes for USR-1002
    const afterUser2All = platform.markAllNotificationsReadForUser(afterTamperAttempt, "USR-1002");
    assert.equal(platform.isNotificationReadByUser(afterUser2All[0], "USR-1001"), true);
    assert.equal(platform.isNotificationReadByUser(afterUser2All[0], "USR-1002"), true);
    assert.equal(platform.isNotificationReadByUser(afterUser2All[1], "USR-1001"), false);
    assert.equal(platform.isNotificationReadByUser(afterUser2All[1], "USR-1002"), false);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC_ROOT = path.resolve(process.cwd(), "src");

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

const platform = await import("@/services/platformService");
const calc = await import("@/utils/calculations");

const INVESTOR = {
  id: "USR-2001",
  fullName: "Adaeze Okafor",
  email: "adaeze.okafor@silverspoon.ng",
  phone: "+234 803 555 0142",
  city: "Lagos",
  address: "18 Bourdillon Road, Ikoyi, Lagos",
  role: "investor",
  tier: "Platinum",
  status: "Active",
  kycLevel: "Tier 2",
  emailVerified: true,
  referralCode: "SS-ADAEZE24",
  joinedAt: "2025-11-12T09:15:00Z",
  lastLoginAt: "2026-11-22T14:20:00Z",
  twoFactorEnabled: true,
  emailAlerts: true,
  smsAlerts: true,
  bankAccount: {
    bankName: "Guaranty Trust Bank (GTBank)",
    bankCode: "058",
    accountNumber: "0123454521",
    accountName: "ADAEZE OLUCHI OKAFOR",
    verified: false,
    verificationStatus: "Pending Verification",
  },
};

const TIER1_INVESTOR = {
  ...INVESTOR,
  id: "USR-2006",
  status: "Pending KYC",
  kycLevel: "Tier 1",
};

const SUSPENDED_INVESTOR = {
  ...INVESTOR,
  id: "USR-2005",
  status: "Suspended",
};

const PLAN_QUARTERLY = {
  id: "plan-platinum-income",
  name: "Platinum Fixed Income",
  code: "SS-INCOME-90",
  category: "Balanced Yield",
  tagline: "Diversified quarterly Naira income allocation",
  description: "Balanced institutional portfolio.",
  minAmount: 500_000,
  maxAmount: 15_000_000,
  durationDays: 180,
  targetReturnPercent: 10,
  riskBand: "Moderate",
  payoutFrequency: "Quarterly",
  managementFeePercent: 0.5,
  status: "Active",
  allocationFocus: ["FGN Bonds (60%)", "Commercial Paper (40%)"],
  perks: ["180-day cycle"],
  riskNote: "Illustrative target only.",
};

describe("Phase 2: Auto-Compound Maturity Rollover & Ledger Consistency", () => {
  it("rolls over principal + realized return on eligible auto-compound mandates while preserving exact wallet balance math", () => {
    const depositTxn = {
      id: "TXN-DEP-1",
      reference: "SS-DEP-20260101-AAA1",
      userId: INVESTOR.id,
      userName: INVESTOR.fullName,
      userEmail: INVESTOR.email,
      type: "Deposit",
      amount: 1_000_000,
      fee: 0,
      status: "Completed",
      channel: "NIP Bank Transfer",
      createdAt: "2026-01-01T10:00:00.000Z",
    };

    const allocTxn = {
      id: "TXN-INV-1",
      reference: "SS-INV-20260101-BBB1",
      userId: INVESTOR.id,
      userName: INVESTOR.fullName,
      userEmail: INVESTOR.email,
      type: "Investment",
      amount: 1_000_000,
      fee: 0,
      status: "Completed",
      channel: PLAN_QUARTERLY.name,
      createdAt: "2026-01-01T10:05:00.000Z",
    };

    const activeInv = {
      id: "INV-ACTIVE-1",
      userId: INVESTOR.id,
      userName: INVESTOR.fullName,
      planId: PLAN_QUARTERLY.id,
      planName: PLAN_QUARTERLY.name,
      principal: 1_000_000,
      targetReturnPercent: 10,
      projectedReturn: 100_000,
      accruedReturn: 45_000,
      durationDays: 180,
      riskBand: "Moderate",
      status: "Active",
      startedAt: "2026-01-01T10:05:00.000Z",
      maturesAt: "2026-06-30T10:05:00.000Z",
      autoCompound: true,
    };

    const beforeMetrics = calc.calculateUserWalletMetrics([depositTxn, allocTxn], [activeInv]);
    assert.equal(beforeMetrics.availableBalance, 0);
    assert.equal(beforeMetrics.activeInvestments, 1_000_000);
    assert.equal(beforeMetrics.totalWalletBalance, 1_000_000);

    const res = platform.buildMaturitySettlementBundle({
      investment: activeInv,
      plan: PLAN_QUARTERLY,
      investor: INVESTOR,
      adminName: "Oluwaseun Adeyemi",
      existingTransactions: [depositTxn, allocTxn],
      referenceDate: new Date("2026-06-30T12:00:00.000Z"),
    });

    assert.equal(res.ok, true);
    assert.ok(res.data);
    assert.equal(res.data.maturedInvestment.status, "Matured");
    assert.equal(res.data.realizedReturn, 100_000);
    assert.ok(res.data.rolloverInvestment);
    assert.ok(res.data.rolloverTransaction);
    assert.equal(res.data.rolloverInvestment.principal, 1_100_000);
    assert.equal(res.data.rolloverInvestment.rolledOverFromInvestmentId, activeInv.id);
    assert.equal(res.data.rolloverInvestment.rolloverCycle, 2);
    assert.equal(
      res.data.maturedInvestment.rolledOverToInvestmentId,
      res.data.rolloverInvestment.id,
    );

    const nextTxns = [
      res.data.rolloverTransaction,
      res.data.payoutTransaction,
      depositTxn,
      allocTxn,
    ];
    const nextInvs = [res.data.rolloverInvestment, res.data.maturedInvestment];
    const afterMetrics = calc.calculateUserWalletMetrics(nextTxns, nextInvs);

    // Exact ledger invariant: 1,000,000 deposit + 100,000 realized - 1,100,000 active = 0 available
    assert.equal(afterMetrics.availableBalance, 0);
    assert.equal(afterMetrics.realizedEarnings, 100_000);
    assert.equal(afterMetrics.activeInvestments, 1_100_000);
    assert.equal(afterMetrics.totalWalletBalance, 1_100_000);
  });

  it("settles proceeds to available balance when auto-compound is disabled or ineligible (paused plan / max exceeded)", () => {
    const baseInv = {
      id: "INV-ACTIVE-2",
      userId: INVESTOR.id,
      userName: INVESTOR.fullName,
      planId: PLAN_QUARTERLY.id,
      planName: PLAN_QUARTERLY.name,
      principal: 14_500_000,
      targetReturnPercent: 10,
      projectedReturn: 1_450_000,
      accruedReturn: 0,
      durationDays: 180,
      riskBand: "Moderate",
      status: "Active",
      startedAt: "2026-01-01T10:05:00.000Z",
      maturesAt: "2026-06-30T10:05:00.000Z",
      autoCompound: true,
    };

    // 14.5M + 1.45M = 15.95M > 15M maxAmount -> must skip rollover and credit cash
    const maxExceededRes = platform.buildMaturitySettlementBundle({
      investment: baseInv,
      plan: PLAN_QUARTERLY,
      investor: INVESTOR,
      adminName: "Admin",
      existingTransactions: [],
    });
    assert.equal(maxExceededRes.ok, true);
    assert.equal(maxExceededRes.data?.rolloverInvestment, undefined);
    assert.match(maxExceededRes.data?.rolloverSkippedReason ?? "", /exceeds plan maximum/i);

    // Paused plan -> must skip rollover
    const pausedRes = platform.buildMaturitySettlementBundle({
      investment: { ...baseInv, id: "INV-ACTIVE-3", principal: 1_000_000, projectedReturn: 100_000 },
      plan: { ...PLAN_QUARTERLY, status: "Paused" },
      investor: INVESTOR,
      adminName: "Admin",
      existingTransactions: [],
    });
    assert.equal(pausedRes.ok, true);
    assert.equal(pausedRes.data?.rolloverInvestment, undefined);
    assert.match(pausedRes.data?.rolloverSkippedReason ?? "", /no longer Active/i);
  });

  it("prevents duplicate maturity settlement and duplicate rollover processing", () => {
    const settledInv = {
      id: "INV-ALREADY-DONE",
      userId: INVESTOR.id,
      userName: INVESTOR.fullName,
      planId: PLAN_QUARTERLY.id,
      planName: PLAN_QUARTERLY.name,
      principal: 1_000_000,
      targetReturnPercent: 10,
      projectedReturn: 100_000,
      accruedReturn: 100_000,
      durationDays: 180,
      riskBand: "Moderate",
      status: "Matured",
      startedAt: "2026-01-01T10:05:00.000Z",
      maturesAt: "2026-06-30T10:05:00.000Z",
      autoCompound: true,
      settledAt: "2026-06-30T12:00:00.000Z",
    };

    const dupStatus = platform.buildMaturitySettlementBundle({
      investment: settledInv,
      plan: PLAN_QUARTERLY,
      investor: INVESTOR,
      adminName: "Admin",
      existingTransactions: [],
    });
    assert.equal(dupStatus.ok, false);

    // Even if status were tampered back to Active, existing completed payout txn blocks duplicate payout
    const dupLedger = platform.buildMaturitySettlementBundle({
      investment: { ...settledInv, status: "Active", settledAt: undefined },
      plan: PLAN_QUARTERLY,
      investor: INVESTOR,
      adminName: "Admin",
      existingTransactions: [
        {
          id: "TXN-RET-1",
          reference: "SS-RET-1",
          userId: INVESTOR.id,
          userName: INVESTOR.fullName,
          userEmail: INVESTOR.email,
          type: "Realized Return",
          amount: 100_000,
          fee: 0,
          status: "Completed",
          channel: PLAN_QUARTERLY.name,
          note: "Simulated maturity settlement for INV-ALREADY-DONE",
          createdAt: "2026-06-30T12:00:00.000Z",
        },
      ],
    });
    assert.equal(dupLedger.ok, false);
    assert.match(dupLedger.error ?? "", /already exists/i);
  });
});

describe("Phase 2: Payout Schedule Accuracy", () => {
  it("never marks interim dates on Active mandates as Settled", () => {
    const activeQuarterly = {
      id: "INV-Q-1",
      userId: INVESTOR.id,
      userName: INVESTOR.fullName,
      planId: PLAN_QUARTERLY.id,
      planName: PLAN_QUARTERLY.name,
      principal: 1_000_000,
      targetReturnPercent: 10,
      projectedReturn: 100_000,
      accruedReturn: 50_000,
      durationDays: 180,
      riskBand: "Moderate",
      status: "Active",
      startedAt: "2026-01-01T00:00:00.000Z",
      maturesAt: "2026-06-30T00:00:00.000Z",
      autoCompound: false,
    };

    // Reference date is AFTER midpoint (April 15), BEFORE maturity (June 30)
    const schedule = calc.buildInvestmentPayoutSchedule(
      activeQuarterly,
      PLAN_QUARTERLY,
      new Date("2026-04-15T00:00:00.000Z"),
    );

    assert.equal(schedule.length, 2);
    assert.equal(schedule[0].status, "Pending Settlement");
    assert.equal(schedule[1].status, "Scheduled");
    assert.equal(
      schedule.some((row) => row.status === "Settled"),
      false,
    );

    // Once matured, all rows accurately reflect Settled
    const maturedSchedule = calc.buildInvestmentPayoutSchedule(
      { ...activeQuarterly, status: "Matured", rolledOverToInvestmentId: "INV-NEXT-1" },
      PLAN_QUARTERLY,
      new Date("2026-07-01T00:00:00.000Z"),
    );
    assert.equal(
      maturedSchedule.every((row) => row.status === "Settled"),
      true,
    );
    assert.match(maturedSchedule[1].label, /INV-NEXT-1/);

    // Cancelled mandates mark rows Cancelled
    const cancelledSchedule = calc.buildInvestmentPayoutSchedule(
      { ...activeQuarterly, status: "Cancelled" },
      PLAN_QUARTERLY,
    );
    assert.equal(
      cancelledSchedule.every((row) => row.status === "Cancelled"),
      true,
    );
  });
});

describe("Phase 2: Bank Account & KYC Submission Validation", () => {
  it("validates bank account format and blocks suspended accounts", () => {
    assert.equal(
      platform.validateBankAccountDetails(
        {
          bankCode: "058",
          bankName: "Guaranty Trust Bank (GTBank)",
          accountNumber: "0123456789",
          accountName: "ADAEZE OKAFOR",
        },
        INVESTOR,
      ).ok,
      true,
    );
    assert.equal(
      platform.validateBankAccountDetails(
        {
          bankCode: "058",
          bankName: "GTBank",
          accountNumber: "12345",
          accountName: "ADAEZE OKAFOR",
        },
        INVESTOR,
      ).ok,
      false,
    );
    assert.equal(
      platform.validateBankAccountDetails(
        {
          bankCode: "058",
          bankName: "GTBank",
          accountNumber: "0123456789",
          accountName: "ADAEZE OKAFOR",
        },
        SUSPENDED_INVESTOR,
      ).ok,
      false,
    );
  });

  it("enforces complete KYC submission validation rules and duplicate-submission guard", () => {
    const validTier2 = {
      targetTier: "Tier 2",
      idType: "NIN",
      idNumber: "12345678901",
      bvn: "22123456789",
      dateOfBirth: "1992-03-14",
      residentialAddress: "11 Maitama Close, Maitama, Abuja",
      idDocumentName: "nin-slip.pdf",
    };

    const refDate = new Date("2026-11-24T00:00:00.000Z");
    assert.equal(platform.validateKycSubmission(validTier2, TIER1_INVESTOR, [], refDate).ok, true);

    // Duplicate under-review submission blocked
    const dupRes = platform.validateKycSubmission(
      validTier2,
      TIER1_INVESTOR,
      [{ id: "KYC-1", userId: TIER1_INVESTOR.id, status: "Under Review" }],
      refDate,
    );
    assert.equal(dupRes.ok, false);
    assert.match(dupRes.error ?? "", /already have a KYC submission under review/i);

    // Tier 3 requires proof of address
    const missingPoa = platform.validateKycSubmission(
      { ...validTier2, targetTier: "Tier 3" },
      INVESTOR,
      [],
      refDate,
    );
    assert.equal(missingPoa.ok, false);
    assert.match(missingPoa.error ?? "", /proof of address/i);

    // Valid Tier 3 upgrade for Active Tier 2 investor
    const validTier3 = platform.validateKycSubmission(
      { ...validTier2, targetTier: "Tier 3", proofOfAddressName: "utility-bill.pdf" },
      INVESTOR,
      [],
      refDate,
    );
    assert.equal(validTier3.ok, true);

    // Already Active Tier 2 cannot re-submit Tier 2
    assert.equal(platform.validateKycSubmission(validTier2, INVESTOR, [], refDate).ok, false);

    // Underage applicant rejected
    assert.equal(
      platform.validateKycSubmission(
        { ...validTier2, dateOfBirth: "2015-01-01" },
        TIER1_INVESTOR,
        [],
        refDate,
      ).ok,
      false,
    );

    // Invalid BVN rejected
    assert.equal(
      platform.validateKycSubmission({ ...validTier2, bvn: "12345" }, TIER1_INVESTOR, [], refDate)
        .ok,
      false,
    );
  });
});

describe("Phase 2: Transaction Ledger Impact Consistency", () => {
  it("computes accurate wallet balance impacts for Declined, Pending, Investment, and Completed entries", () => {
    const base = {
      id: "TXN-X",
      reference: "SS-X",
      userId: INVESTOR.id,
      userName: INVESTOR.fullName,
      userEmail: INVESTOR.email,
      channel: "NIP",
      createdAt: "2026-11-20T00:00:00.000Z",
    };

    const declined = calc.getTransactionLedgerImpact({
      ...base,
      type: "Withdrawal",
      amount: 500_000,
      fee: 2_500,
      status: "Declined",
    });
    assert.equal(declined.netWalletImpact, 0);
    assert.equal(declined.sign, "");

    const pendingDep = calc.getTransactionLedgerImpact({
      ...base,
      type: "Deposit",
      amount: 400_000,
      fee: 0,
      status: "Pending",
    });
    assert.equal(pendingDep.netWalletImpact, 0);

    const pendingWdr = calc.getTransactionLedgerImpact({
      ...base,
      type: "Withdrawal",
      amount: 2_000_000,
      fee: 2_500,
      status: "Pending",
    });
    assert.equal(pendingWdr.netWalletImpact, -2_002_500);

    const completedReturn = calc.getTransactionLedgerImpact({
      ...base,
      type: "Realized Return",
      amount: 100_000,
      fee: 0,
      status: "Completed",
    });
    assert.equal(completedReturn.netWalletImpact, 100_000);
    assert.equal(completedReturn.sign, "+");
  });
});

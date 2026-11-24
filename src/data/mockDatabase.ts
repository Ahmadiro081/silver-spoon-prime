import type {
  AuditLogEntry,
  InvestmentPlan,
  InvestmentRecord,
  KycSubmissionRecord,
  NotificationItem,
  PlatformSettings,
  ReferralRecord,
  TransactionRecord,
  UserProfile,
} from "@/types/domain";

/**
 * Clean initial state for the standalone mock-data provider.
 * No demo users, administrator accounts, balances, or sample financial records
 * are preloaded. Accounts and ledger records are created solely through
 * standard application workflows.
 */
export const INITIAL_USERS: UserProfile[] = [];

/**
 * Product catalog of structured Naira investment mandates available for
 * simulated subscriptions once an investor registers and funds their wallet.
 */
export const INITIAL_PLANS: InvestmentPlan[] = [
  {
    id: "plan-silver-liquidity",
    name: "Silver Treasury Reserve",
    code: "SS-TREASURY-30",
    category: "Short-Term Liquidity",
    tagline: "Capital preservation focused Naira money-market portfolio",
    description:
      "Designed for operating reserves and near-term liquidity goals. Allocates across high-grade Nigerian Treasury Bills and short-tenor commercial paper.",
    minAmount: 50_000,
    maxAmount: 2_500_000,
    durationDays: 30,
    targetReturnPercent: 2.2,
    riskBand: "Low",
    payoutFrequency: "At Maturity",
    managementFeePercent: 0.25,
    status: "Active",
    allocationFocus: [
      "Nigerian Treasury Bills (65%)",
      "Tier-1 Bank Fixed Placements (25%)",
      "Cash Liquidity Buffer (10%)",
    ],
    perks: [
      "30-day short cycle",
      "Automated maturity settlement to wallet",
      "Transparent monthly allocation memo",
    ],
    riskNote:
      "Low-volatility target. Yield depends on prevailing CBN treasury rates and is not guaranteed.",
  },
  {
    id: "plan-platinum-income",
    name: "Platinum Fixed Income",
    code: "SS-INCOME-90",
    category: "Balanced Yield",
    tagline: "Diversified quarterly Naira income allocation",
    description:
      "Balanced institutional portfolio combining sovereign FGN bonds, investment-grade corporate notes, and short-term commercial paper for disciplined quarterly growth.",
    minAmount: 500_000,
    maxAmount: 15_000_000,
    durationDays: 90,
    targetReturnPercent: 6.5,
    riskBand: "Moderate",
    payoutFrequency: "At Maturity",
    managementFeePercent: 0.5,
    featured: true,
    status: "Active",
    allocationFocus: [
      "FGN Sovereign Bonds (45%)",
      "Investment-Grade Corporate Notes (40%)",
      "Money Market Instruments (15%)",
    ],
    perks: [
      "Optional auto-compounding on maturity",
      "Priority settlement review",
      "Quarterly portfolio review note",
    ],
    riskNote:
      "Moderate interest-rate and credit exposure. Projected returns are illustrative targets and capital remains at risk.",
  },
  {
    id: "plan-sovereign-private",
    name: "Sovereign Private Credit",
    code: "SS-CREDIT-180",
    category: "Structured Growth",
    tagline: "Bespoke semi-annual private debt & infrastructure mandate",
    description:
      "Built for high-net-worth individuals and family treasuries seeking higher target yields through vetted Nigerian commercial credit and asset-backed structured notes.",
    minAmount: 5_000_000,
    maxAmount: 100_000_000,
    durationDays: 180,
    targetReturnPercent: 14.0,
    riskBand: "Elevated",
    payoutFrequency: "Quarterly",
    managementFeePercent: 0.75,
    status: "Active",
    allocationFocus: [
      "Asset-Backed Private Credit (50%)",
      "Infrastructure Debt Notes (30%)",
      "Sovereign Liquidity Sleeve (20%)",
    ],
    perks: [
      "Dedicated Lagos/Abuja relationship advisor",
      "Quarterly distribution schedule",
      "Bespoke tax & audit statements",
    ],
    riskNote:
      "Elevated credit and liquidity risk over a 180-day lock-in horizon. Target returns are not guaranteed.",
  },
  {
    id: "plan-heritage-annual",
    name: "Heritage Capital Mandate",
    code: "SS-HERITAGE-365",
    category: "Long-Term Preservation",
    tagline: "12-month multi-asset Naira wealth compounding strategy",
    description:
      "A disciplined annual mandate blending long-dated sovereign securities, blue-chip dividend equities, and commercial real-estate income trusts.",
    minAmount: 2_000_000,
    maxAmount: 50_000_000,
    durationDays: 365,
    targetReturnPercent: 22.5,
    riskBand: "Elevated",
    payoutFrequency: "Quarterly",
    managementFeePercent: 0.85,
    status: "Active",
    allocationFocus: [
      "Long-Dated FGN Bonds (40%)",
      "Blue-Chip NGX Dividend Equities (35%)",
      "Commercial REIT Income (25%)",
    ],
    perks: [
      "Quarterly performance attribution report",
      "Rebalancing governance",
      "Dedicated concierge desk",
    ],
    riskNote:
      "Subject to market price fluctuations across equity and bond holdings. Projected returns are illustrative only.",
  },
];

export const INITIAL_INVESTMENTS: InvestmentRecord[] = [];

export const INITIAL_TRANSACTIONS: TransactionRecord[] = [];

export const INITIAL_REFERRALS: ReferralRecord[] = [];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [];

export const INITIAL_SETTINGS: PlatformSettings = {
  platformName: "SILVER SPOON",
  maintenanceMode: false,
  allowNewRegistrations: true,
  minDepositAmount: 10_000,
  maxDailyWithdrawal: 25_000_000,
  withdrawalFeeThreshold: 10_000_000,
  highValueWithdrawalFee: 2_500,
  referralCommissionPercent: 3.0,
  requireKycForWithdrawals: true,
  autoApproveDepositsUnder: 250_000,
  supportEmail: "concierge@silverspoon.ng",
};

export const INITIAL_KYC_SUBMISSIONS: KycSubmissionRecord[] = [];

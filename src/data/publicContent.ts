import type { FaqItem } from "@/types/domain";

export interface PublicStatItem {
  value: string;
  label: string;
  detail: string;
}

export interface GovernancePillarItem {
  id: string;
  label: string;
  title: string;
  description: string;
  metric: string;
}

/**
 * Static public-facing product parameters and editorial governance content.
 * Contains no preloaded client identities, fabricated AUM metrics, or
 * sample investor financial figures.
 */
export const PUBLIC_STATS: PublicStatItem[] = [
  { value: "₦50,000", label: "Entry Allocation Minimum", detail: "Zero Account Maintenance Fee" },
  { value: "4 Mandates", label: "Structured Naira Portfolios", detail: "Treasury, Income, Credit & Heritage" },
  { value: "30 – 365 Days", label: "Defined Mandate Tenors", detail: "Clear Maturity & Payout Schedules" },
  { value: "3.0%", label: "Qualifying Referral Share", detail: "Ledger-Tracked Commission Payouts" },
];

export const GOVERNANCE_PILLARS: GovernancePillarItem[] = [
  {
    id: "gov-1",
    label: "Ledger Accounting",
    title: "Single-Source Derived Balances",
    description:
      "Every available balance, active allocation, and realized distribution is computed directly from recorded ledger entries so statements reconcile cleanly.",
    metric: "100% Ledger-Derived",
  },
  {
    id: "gov-2",
    label: "Mandate Clarity",
    title: "Explicit Risk Bands & Lock-In Horizons",
    description:
      "Each Naira mandate discloses target projections, fee schedules, underlying instrument focus, and maturity dates upfront before principal is committed.",
    metric: "30 · 90 · 180 · 365 Days",
  },
  {
    id: "gov-3",
    label: "Access Governance",
    title: "Account Isolation & KYC Controls",
    description:
      "Investor portfolios remain isolated per account with tiered KYC review, two-factor authentication controls, and auditable withdrawal verification.",
    metric: "Tier 1 – Tier 3 KYC",
  },
];

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "faq-1",
    category: "General",
    question: "What is SILVER SPOON?",
    answer:
      "SILVER SPOON is a Naira-native private wealth and structured investment platform designed for Nigerian individuals, professionals, and corporate treasuries seeking disciplined portfolio allocation and transparent ledger reporting.",
  },
  {
    id: "faq-2",
    category: "Investments & Risk",
    question: "Are the target returns shown on investment plans guaranteed?",
    answer:
      "No. All investment returns presented on SILVER SPOON are illustrative target projections based on underlying fixed-income, treasury, and private-credit models. Every investment carries risk, and actual realized performance depends on prevailing market conditions.",
  },
  {
    id: "faq-3",
    category: "Wallet & Funding",
    question: "What is the minimum amount required to start investing?",
    answer:
      "You can fund your Naira wallet starting from ₦10,000 and open your first allocation on the Silver Treasury Reserve plan starting from ₦50,000.",
  },
  {
    id: "faq-4",
    category: "Wallet & Funding",
    question: "How do withdrawals and settlement fees work?",
    answer:
      "Withdrawals from your available Naira balance are routed to your verified Nigerian bank account after treasury verification. Standard withdrawals attract zero platform fees; high-value wire settlements above ₦10,000,000 carry a flat ₦2,500 transfer fee.",
  },
  {
    id: "faq-5",
    category: "Referrals & Security",
    question: "How does the SILVER SPOON Referral Program calculate commissions?",
    answer:
      "When an invited client opens an account with your unique referral link and completes a qualifying investment allocation, you earn a 3% commission credited to your referral earnings ledger.",
  },
  {
    id: "faq-6",
    category: "Referrals & Security",
    question: "How are client accounts and financial operations protected in production?",
    answer:
      "The production architecture is designed around PostgreSQL with strict access control, authenticated sessions, and server-side settlement validation so all balance mutations, deposit confirmations, and payout disbursements are verified before settlement.",
  },
  {
    id: "faq-7",
    category: "Investments & Risk",
    question: "Can I liquidate an active fixed-tenor investment before maturity?",
    answer:
      "Each mandate has a defined tenor (30, 90, 180, or 365 days). Funds committed to an active mandate remain locked until maturity so underlying instruments are not disrupted; once matured, principal and realized returns settle to your available balance.",
  },
];

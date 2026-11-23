import type { FaqItem, TestimonialItem } from "@/types/domain";

export interface PublicStatItem {
  value: string;
  label: string;
  detail: string;
}

/**
 * Static public-facing editorial content and illustrative showcase figures.
 * Kept separate from transactional mock seed records (`mockDatabase.ts`).
 */
export const PUBLIC_STATS: PublicStatItem[] = [
  { value: "₦4.89B", label: "Simulated Assets Under Administration", detail: "Q4 2026 Ledger Snapshot" },
  { value: "12,640", label: "Active Client Accounts", detail: "Lagos · Abuja · Port Harcourt" },
  { value: "4 Mandates", label: "Structured Naira Portfolios", detail: "30 to 365 Day Tenors" },
  { value: "₦50,000", label: "Entry Allocation Minimum", detail: "Zero Account Maintenance Fee" },
];

export const TESTIMONIALS: TestimonialItem[] = [
  {
    id: "t1",
    name: "Ngozi Achebe",
    role: "Managing Director",
    organization: "Meridian Foods Nigeria Ltd.",
    city: "Lagos",
    outcome: "Consolidated ₦18M in seasonal treasury reserves across 90-day mandates",
    quote:
      "We moved our idle quarterly supplier reserves into SILVER SPOON's Platinum Fixed Income mandate. Every maturity schedule, risk disclosure, and ledger entry is clear enough for our external auditors.",
  },
  {
    id: "t2",
    name: "Kunle Adebayo",
    role: "Principal Software Architect",
    organization: "PayGrid Systems",
    city: "Abuja",
    outcome: "Structured monthly Naira allocations with zero spreadsheet tracking",
    quote:
      "Most investment apps hide behind vague return promises. SILVER SPOON treats me like an adult — clear risk bands, honest projections, and an uncluttered wallet ledger.",
  },
  {
    id: "t3",
    name: "Dr. Amara Uche",
    role: "Chief Medical Director",
    organization: "Oakbridge Specialist Clinic",
    city: "Port Harcourt",
    outcome: "Built a disciplined 180-day capital reserve for medical equipment expansion",
    quote:
      "The Sovereign Private Credit reporting gives me complete visibility into lock-in dates and accrued performance while I focus on running my hospital.",
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
      "The production architecture is designed around PostgreSQL with Supabase Authentication, strict Row Level Security (RLS), and server-side Edge Functions so all balance mutations, deposit verifications, and payout disbursements are validated on the server.",
  },
  {
    id: "faq-7",
    category: "Investments & Risk",
    question: "Can I liquidate an active fixed-tenor investment before maturity?",
    answer:
      "Each mandate has a defined tenor (30, 90, 180, or 365 days). Funds committed to an active mandate remain locked until maturity so underlying instruments are not disrupted; once matured, principal and realized returns settle to your available balance.",
  },
];

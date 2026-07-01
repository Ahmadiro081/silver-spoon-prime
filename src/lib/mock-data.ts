// All mock/demo data for SILVER SPOON.
// Frontend-only prototype — no backend calls.

export type Plan = {
  id: string;
  name: string;
  tagline: string;
  min: number;
  max: number;
  duration: string;
  roi: string;
  risk: "Low" | "Moderate" | "High";
  featured?: boolean;
  perks: string[];
};

export const plans: Plan[] = [
  {
    id: "silver-starter",
    name: "Silver Starter",
    tagline: "Begin your wealth journey",
    min: 50_000,
    max: 499_000,
    duration: "30 days",
    roi: "8% ROI",
    risk: "Low",
    perks: ["Daily interest accrual", "Instant maturity payout", "Zero management fee"],
  },
  {
    id: "platinum-growth",
    name: "Platinum Growth",
    tagline: "Balanced compounding portfolio",
    min: 500_000,
    max: 4_999_000,
    duration: "90 days",
    roi: "18% ROI",
    risk: "Moderate",
    featured: true,
    perks: ["Auto-compound option", "Priority withdrawals", "Quarterly strategy call"],
  },
  {
    id: "sovereign-elite",
    name: "Sovereign Elite",
    tagline: "Private wealth allocation",
    min: 5_000_000,
    max: 100_000_000,
    duration: "180 days",
    roi: "32% ROI",
    risk: "High",
    perks: ["Dedicated portfolio manager", "Bespoke reporting", "Concierge banking"],
  },
];

export type Transaction = {
  id: string;
  date: string;
  type: "Deposit" | "Withdrawal" | "Investment" | "Profit" | "Referral";
  amount: number;
  status: "Completed" | "Pending" | "Failed";
  method?: string;
};

export const transactions: Transaction[] = [
  { id: "TXN-1042", date: "2026-06-28", type: "Deposit", amount: 250_000, status: "Completed", method: "Bank Transfer" },
  { id: "TXN-1041", date: "2026-06-27", type: "Investment", amount: 500_000, status: "Completed", method: "Platinum Growth" },
  { id: "TXN-1040", date: "2026-06-25", type: "Profit", amount: 42_500, status: "Completed", method: "Platinum Growth" },
  { id: "TXN-1039", date: "2026-06-22", type: "Withdrawal", amount: 120_000, status: "Pending", method: "GTBank ****4521" },
  { id: "TXN-1038", date: "2026-06-19", type: "Referral", amount: 15_000, status: "Completed", method: "Bonus" },
  { id: "TXN-1037", date: "2026-06-15", type: "Deposit", amount: 750_000, status: "Completed", method: "Card" },
  { id: "TXN-1036", date: "2026-06-12", type: "Withdrawal", amount: 60_000, status: "Failed", method: "Access ****9012" },
  { id: "TXN-1035", date: "2026-06-10", type: "Profit", amount: 28_750, status: "Completed", method: "Silver Starter" },
  { id: "TXN-1034", date: "2026-06-05", type: "Investment", amount: 1_000_000, status: "Completed", method: "Sovereign Elite" },
  { id: "TXN-1033", date: "2026-06-01", type: "Referral", amount: 25_000, status: "Completed", method: "Bonus" },
  { id: "TXN-1032", date: "2026-05-28", type: "Deposit", amount: 400_000, status: "Completed", method: "Bank Transfer" },
  { id: "TXN-1031", date: "2026-05-24", type: "Withdrawal", amount: 200_000, status: "Completed", method: "GTBank ****4521" },
];

export type Notification = {
  id: string;
  title: string;
  body: string;
  time: string;
  kind: "deposit" | "withdrawal" | "investment" | "referral" | "system";
  unread?: boolean;
};

export const notifications: Notification[] = [
  { id: "n1", title: "Deposit approved", body: "Your deposit of ₦250,000 has been credited.", time: "2h ago", kind: "deposit", unread: true },
  { id: "n2", title: "Withdrawal processed", body: "₦120,000 sent to GTBank ****4521.", time: "5h ago", kind: "withdrawal", unread: true },
  { id: "n3", title: "Investment started", body: "Platinum Growth plan is now active.", time: "Yesterday", kind: "investment" },
  { id: "n4", title: "Referral bonus received", body: "You earned ₦15,000 from Chidera A.", time: "2d ago", kind: "referral" },
  { id: "n5", title: "Investment matured", body: "Silver Starter completed — ₦28,750 profit.", time: "4d ago", kind: "investment" },
  { id: "n6", title: "Security alert", body: "New device signed in from Lagos.", time: "1w ago", kind: "system" },
];

export const walletStats = {
  walletBalance: 1_845_500,
  available: 685_500,
  activeInvestments: 1_250_000,
  totalProfit: 342_750,
  totalDeposits: 4_100_000,
  totalWithdrawals: 1_260_000,
  referralEarnings: 96_500,
};

export const growthChart = [
  { month: "Jan", deposits: 320_000, withdrawals: 80_000, profit: 24_000 },
  { month: "Feb", deposits: 410_000, withdrawals: 120_000, profit: 38_000 },
  { month: "Mar", deposits: 520_000, withdrawals: 90_000, profit: 51_000 },
  { month: "Apr", deposits: 480_000, withdrawals: 150_000, profit: 44_000 },
  { month: "May", deposits: 640_000, withdrawals: 220_000, profit: 62_500 },
  { month: "Jun", deposits: 820_000, withdrawals: 300_000, profit: 88_250 },
  { month: "Jul", deposits: 910_000, withdrawals: 260_000, profit: 96_500 },
];

export type Referral = {
  name: string;
  joined: string;
  invested: number;
  bonus: number;
  status: "Active" | "Pending";
};

export const referrals: Referral[] = [
  { name: "Chidera Ade­yemi", joined: "2026-06-18", invested: 300_000, bonus: 15_000, status: "Active" },
  { name: "Ifeoma Okonkwo", joined: "2026-06-02", invested: 750_000, bonus: 37_500, status: "Active" },
  { name: "Emeka Balogun", joined: "2026-05-22", invested: 120_000, bonus: 6_000, status: "Active" },
  { name: "Zainab Yusuf", joined: "2026-05-14", invested: 0, bonus: 0, status: "Pending" },
  { name: "Tunde Ojo", joined: "2026-04-30", invested: 480_000, bonus: 24_000, status: "Active" },
];

export const testimonials = [
  { name: "Ngozi Achebe", role: "Business Owner, Lagos", quote: "SILVER SPOON turned my idle capital into predictable monthly income. The dashboard is spotless." },
  { name: "Kunle Adebayo", role: "Software Engineer, Abuja", quote: "I have tried three platforms — none felt this trustworthy. Withdrawals hit my GTBank in minutes." },
  { name: "Amara Uche", role: "Doctor, Port Harcourt", quote: "The Platinum Growth plan compounded quietly while I focused on patients. Exactly what I needed." },
];

export const faqs = [
  { q: "Is SILVER SPOON regulated?", a: "Yes. We operate under Nigerian fintech guidelines with segregated custodial accounts and quarterly independent audits." },
  { q: "What is the minimum I can invest?", a: "You can start with ₦50,000 on the Silver Starter plan and scale up as your confidence grows." },
  { q: "How fast are withdrawals?", a: "Available balance withdrawals are processed to any Nigerian bank within 15 minutes on business days." },
  { q: "Can I lose money?", a: "Every investment carries risk. We diversify across low-volatility instruments and clearly label the risk band on each plan." },
  { q: "How do referrals work?", a: "Share your unique link. You earn 5% of each referred user's first investment, credited instantly to your wallet." },
  { q: "Are there hidden fees?", a: "No. We charge zero deposit or maintenance fees. Withdrawals above ₦10m attract a flat ₦2,500 wire fee." },
];

// ── Admin mock data ──
export const adminUsers = [
  { id: "U-2041", name: "Ngozi Achebe", email: "ngozi@example.com", tier: "Platinum", balance: 2_450_000, status: "Active" },
  { id: "U-2040", name: "Kunle Adebayo", email: "kunle@example.com", tier: "Silver", balance: 320_000, status: "Active" },
  { id: "U-2039", name: "Amara Uche", email: "amara@example.com", tier: "Sovereign", balance: 12_800_000, status: "Active" },
  { id: "U-2038", name: "Ifeoma Okonkwo", email: "ifeoma@example.com", tier: "Platinum", balance: 780_000, status: "Suspended" },
  { id: "U-2037", name: "Tunde Ojo", email: "tunde@example.com", tier: "Silver", balance: 145_000, status: "Active" },
  { id: "U-2036", name: "Zainab Yusuf", email: "zainab@example.com", tier: "Silver", balance: 0, status: "Pending" },
];

export const adminKpis = {
  users: 12_486,
  aum: 4_820_000_000, // Assets under management
  monthlyRevenue: 82_400_000,
  pendingWithdrawals: 14,
};

export const userGrowth = [
  { month: "Jan", users: 4200 },
  { month: "Feb", users: 5100 },
  { month: "Mar", users: 6300 },
  { month: "Apr", users: 7800 },
  { month: "May", users: 9500 },
  { month: "Jun", users: 11200 },
  { month: "Jul", users: 12486 },
];

export const revenueBreakdown = [
  { name: "Silver Starter", value: 18 },
  { name: "Platinum Growth", value: 46 },
  { name: "Sovereign Elite", value: 36 },
];

export const currentUser = {
  name: "Adaeze Okafor",
  email: "adaeze.okafor@silverspoon.ng",
  phone: "+234 803 555 0142",
  address: "12 Marina Avenue, Lagos Island, Lagos",
  bank: "GTBank",
  account: "0123456789",
  accountName: "Adaeze O. Okafor",
  referralCode: "SS-ADAEZE24",
};

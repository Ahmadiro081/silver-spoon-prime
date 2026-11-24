import heroSuiteImg from "@/assets/images/hero_private_wealth_1795406518874.jpg";
import aboutBuildingImg from "@/assets/images/about_architecture_1795406520117.jpg";
import { getSupabasePublicConfig } from "@/services/supabase/config";

export const APP_CONFIG = {
  name: "SILVER SPOON",
  legalName: "SILVER SPOON Wealth Management Ltd.",
  tagline: "Private Wealth & Naira Portfolio Architecture",
  currency: {
    code: "NGN",
    symbol: "₦",
    locale: "en-NG",
  },
  dataProvider: getSupabasePublicConfig().activeProvider,
  futureBackend: {
    database: "PostgreSQL (planned — Phase A preparation)",
    authentication: "Server-side Auth + Row Level Security (planned)",
    storage: "Private Object Storage (planned)",
    serverLogic: "Server-side Edge Functions (planned)",
    mode: "Standalone Mock Data Provider (Supabase Standby)",
  },
  support: {
    email: "concierge@silverspoon.ng",
    complianceEmail: "compliance@silverspoon.ng",
    phone: "+234 (0) 1 888 4920",
    headquarters: "14 Adeola Odeku Street, Victoria Island, Lagos, Nigeria",
    branches: ["Lagos", "Abuja", "Port Harcourt"],
    hours: "Monday – Friday, 08:00 – 18:00 WAT",
  },
  disclosures: {
    investmentRisk:
      "Illustrative target returns are projections based on historical asset allocation models and are not guaranteed profits. Capital is at risk; past performance does not guarantee future results.",
    simulationNotice:
      "TEST ENVIRONMENT — NOT A REAL BANK TRANSACTION. Balances, deposits, withdrawals, and portfolio allocations operate on local browser mock storage only. No live NIBSS, Paystack, or bank transfers occur.",
  },
  assets: {
    heroSuite: heroSuiteImg,
    aboutBuilding: aboutBuildingImg,
  },
} as const;

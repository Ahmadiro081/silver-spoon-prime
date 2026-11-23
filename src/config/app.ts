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
      "Frontend simulation mode: balances, deposits, withdrawals, and portfolio allocations operate on local mock data. Production financial execution will run server-side via PostgreSQL and Supabase Edge Functions.",
  },
  assets: {
    heroSuite: "/src/assets/images/hero_private_wealth_1795406518874.jpg",
    aboutBuilding: "/src/assets/images/about_architecture_1795406520117.jpg",
    clientAvatar: "/src/assets/images/avatar_adaeze_1795406520834.jpg",
  },
} as const;

import type { NigerianBank } from "@/types/domain";

/**
 * Static reference directory of Nigerian commercial and microfinance banks
 * with Central Bank of Nigeria (CBN) institution codes.
 *
 * Kept separate from transactional mock seed data (`mockDatabase.ts`).
 * In future backend phases, this catalog serves as a read-only fallback
 * alongside server-resolved bank lists.
 */
export const NIGERIAN_BANKS: NigerianBank[] = [
  { name: "Guaranty Trust Bank (GTBank)", code: "058" },
  { name: "Zenith Bank", code: "057" },
  { name: "Access Bank", code: "044" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "United Bank for Africa (UBA)", code: "033" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First City Monument Bank (FCMB)", code: "214" },
  { name: "Wema Bank", code: "035" },
  { name: "Providus Bank", code: "101" },
  { name: "Sterling Bank", code: "232" },
  { name: "Kuda Microfinance Bank", code: "50211" },
];

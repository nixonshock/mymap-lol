import type { StateMeta } from "./types";

// All 16 Malaysian divisions (13 states + 3 federal territories).
export const STATES: StateMeta[] = [
  { code: "MY-01", name: "Johor" },
  { code: "MY-02", name: "Kedah" },
  { code: "MY-03", name: "Kelantan" },
  { code: "MY-04", name: "Melaka" },
  { code: "MY-05", name: "Negeri Sembilan" },
  { code: "MY-06", name: "Pahang" },
  { code: "MY-07", name: "Penang" },
  { code: "MY-08", name: "Perak" },
  { code: "MY-09", name: "Perlis" },
  { code: "MY-10", name: "Selangor" },
  { code: "MY-11", name: "Terengganu" },
  { code: "MY-12", name: "Sabah" },
  { code: "MY-13", name: "Sarawak" },
  { code: "MY-14", name: "Kuala Lumpur" },
  { code: "MY-15", name: "Labuan" },
  { code: "MY-16", name: "Putrajaya" },
];

export const stateCodeToName = (code: string) =>
  STATES.find((s) => s.code === code)?.name ?? code;

// Pricing (stake units = US dollars). Tune this to your revenue model.
export const PRICING = {
  /** minimum to claim an empty state */
  minClaim: 10,
  /** $ amount must exceed the incumbent #1 by at least this to take the top spot */
  minToOvertake: 1,
  /** fixed platform fee kept on every payment (revenue). 0 = keep 100% of stake. */
  fee: 0,
  currency: "$",
} as const;

export const money = (n: number) =>
  `${PRICING.currency}${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/**
 * Billing is in USD; the ringgit equivalent is shown next to it everywhere a
 * price is quoted. Set NEXT_PUBLIC_USD_MYR to the current rate (default 4.04,
 * mid-market Sep 2026) — no live FX feed, so revisit it now and then.
 */
export const USD_MYR = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_USD_MYR);
  return Number.isFinite(raw) && raw > 0 ? raw : 4.04;
})();

export const moneyMyr = (usd: number) =>
  `RM${(usd * USD_MYR).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;

/** "$10 ≈ RM40" — the standard price label. */
export const moneyBoth = (usd: number) => `${money(usd)} ≈ ${moneyMyr(usd)}`;

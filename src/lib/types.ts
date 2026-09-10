// Core domain types for mymap.lol

export interface StateMeta {
  code: string; // ISO 3166-2 like "MY-01"
  name: string; // display name
}

// A single stake placed by an org — on a state, or on one city inside a state.
export interface Claim {
  id: string;
  stateCode: string;
  /** Set when the stake is for a city: it then counts against the city only and
   *  never colours / claims the state it sits in. */
  cityId?: string;
  cityName?: string;
  orgName: string;
  pitch: string;
  link?: string;
  amount: number; // in "dollars" (stake units)
  at: number; // epoch ms
  txId?: string;
  status: "paid" | "pending";
}

/** What a stake modal is open for. */
export type StakeTarget =
  | { kind: "state"; code: string }
  | { kind: "city"; id: string; name: string; stateCode: string };

// Per-state (or per-city) leaderboard entry, aggregated by org across claims.
export interface HolderRow {
  orgName: string;
  pitch: string;
  link?: string;
  total: number; // sum of that org's stakes
  claims: number;
  isTop: boolean;
}

export interface StateLeaderboard {
  /** state code, or city id when the leaderboard is for a city */
  code: string;
  name: string;
  holders: HolderRow[]; // sorted by total desc
  totalStake: number; // sum across all holders
  isEmpty: boolean;
}

// Result of attempting a claim / stake.
export interface StakeResult {
  ok: boolean;
  message: string;
  stateCode?: string;
  leaderboard?: StateLeaderboard;
}

// Payment abstraction. In DEMO mode we simulate a successful checkout;
// in LIVE mode this is backed by a real provider (Bitcoin Lightning / card).
export interface CheckoutRequest {
  stateCode: string;
  cityId?: string;
  cityName?: string;
  orgName: string;
  pitch: string;
  link?: string;
  amount: number; // dollars to pay
}

export interface CheckoutResult {
  status: "paid" | "pending" | "failed";
  txId?: string;
  message: string;
}

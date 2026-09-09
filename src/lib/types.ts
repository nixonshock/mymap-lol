// Core domain types for mymap.lol

export interface StateMeta {
  code: string; // ISO 3166-2 like "MY-01"
  name: string; // display name
}

// A single stake placed by an org on a state.
export interface Claim {
  id: string;
  stateCode: string;
  orgName: string;
  pitch: string;
  link?: string;
  amount: number; // in "dollars" (stake units)
  at: number; // epoch ms
  txId?: string;
  status: "paid" | "pending";
}

// Per-state leaderboard entry, aggregated by org across claims.
export interface HolderRow {
  orgName: string;
  pitch: string;
  link?: string;
  total: number; // sum of that org's stakes on this state
  claims: number;
  isTop: boolean;
}

export interface StateLeaderboard {
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

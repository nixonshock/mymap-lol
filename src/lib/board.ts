// Shared board shape: what /api/board returns and what the client store holds.
// Amounts travel in dollars (integers at our price point) — the DB stores cents.

export interface BoardHolder {
  orgName: string;
  pitch: string;
  link?: string;
  total: number;
  claims: number;
}

export interface BoardState {
  code: string;
  name: string;
  total: number;
  count: number;
  holders: BoardHolder[]; // sorted by total desc, leader first
}

/** A city someone has staked on. City stakes never colour the state they sit in. */
export interface BoardCity {
  id: string;
  name: string;
  stateCode: string;
  stateName: string;
  total: number;
  count: number;
  holders: BoardHolder[]; // sorted by total desc, leader first
}

export interface BoardActivity {
  stateCode: string;
  stateName: string;
  /** set when the stake was placed on a city rather than the state */
  cityId?: string;
  cityName?: string;
  orgName: string;
  amount: number;
  at: number; // epoch ms
}

export interface BoardStats {
  statesClaimed: number;
  statesTotal: number;
  citiesClaimed: number;
  totalStaked: number;
  totalClaims: number;
}

export interface BoardOrg {
  orgName: string;
  total: number;
  states: number;
}

export interface BoardSnapshot {
  /** "live" = shared Supabase data, "local" = this browser only (demo/offline) */
  mode: "live" | "local";
  at: number;
  states: BoardState[];
  cities: BoardCity[];
  activity: BoardActivity[];
  stats: BoardStats;
  topOrgs: BoardOrg[];
}

export function emptySnapshot(mode: "live" | "local" = "local"): BoardSnapshot {
  return {
    mode,
    at: 0,
    states: [],
    cities: [],
    activity: [],
    stats: {
      statesClaimed: 0,
      statesTotal: 16,
      citiesClaimed: 0,
      totalStaked: 0,
      totalClaims: 0,
    },
    topOrgs: [],
  };
}

/**
 * GET the shared board. Returns null when the backend isn't configured (demo).
 *
 * `bust` appends a throwaway query param: the route is edge-cached for a few
 * seconds (stale-while-revalidate longer), and a buyer who just paid must not be
 * handed a snapshot taken before their claim existed.
 */
export async function fetchBoard(bust = false): Promise<BoardSnapshot | null> {
  try {
    const res = await fetch(bust ? `/api/board?t=${Date.now()}` : "/api/board", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as BoardSnapshot & { mode?: string };
    if (!data || data.mode !== "live") return null;
    return data;
  } catch {
    return null;
  }
}

import type { Claim, HolderRow, StateLeaderboard, StakeResult } from "./types";
import { PRICING, STATES, stateCodeToName } from "./states";
import { emptySnapshot, fetchBoard, type BoardHolder, type BoardSnapshot, type BoardState } from "./board";

/**
 * Board store.
 *
 * LIVE mode  — /api/board answers with mode:"live" (Supabase configured):
 *              this module holds the shared snapshot, polls it, and writes
 *              stakes through /api/stake.
 * LOCAL mode — no backend yet (or the API is unreachable): identical query
 *              surface, but the data lives in this browser's localStorage, so
 *              the product keeps working end-to-end before launch.
 *
 * Components only use the exported queries below, so the two modes are
 * interchangeable from their point of view.
 */

const KEY = "mymap:claims:v1";

// ---------------------------------------------------------------- local storage
function loadLocal(): Claim[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { claims: Claim[] };
    return Array.isArray(parsed.claims) ? parsed.claims : [];
  } catch {
    return [];
  }
}

function saveLocal(claims: Claim[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, claims }));
  } catch {
    /* storage full / blocked — the in-memory copy still works */
  }
}

/** Aggregate browser-local claims into the same shape /api/board returns. */
function buildLocalSnapshot(claims: Claim[]): BoardSnapshot {
  const paid = claims.filter((c) => c.status === "paid");
  const byState = new Map<string, Map<string, HolderRow>>();

  for (const c of paid) {
    const perOrg = byState.get(c.stateCode) ?? new Map<string, HolderRow>();
    const cur =
      perOrg.get(c.orgName) ??
      ({ orgName: c.orgName, pitch: c.pitch, link: c.link, total: 0, claims: 0, isTop: false } as HolderRow);
    cur.total += c.amount;
    cur.claims += 1;
    if (c.pitch) cur.pitch = c.pitch;
    perOrg.set(c.orgName, cur);
    byState.set(c.stateCode, perOrg);
  }

  const states: BoardState[] = STATES.map((s) => {
    const perOrg = byState.get(s.code);
    const holders = perOrg ? [...perOrg.values()].sort((a, b) => b.total - a.total) : [];
    return {
      code: s.code,
      name: s.name,
      total: holders.reduce((sum, h) => sum + h.total, 0),
      count: holders.reduce((sum, h) => sum + h.claims, 0),
      holders: holders.map((h) => ({ ...h, isTop: false })),
    };
  });

  const claimed = states.filter((s) => s.count > 0);
  const byOrg = new Map<string, { total: number; states: Set<string> }>();
  for (const c of paid) {
    const cur = byOrg.get(c.orgName) ?? { total: 0, states: new Set<string>() };
    cur.total += c.amount;
    cur.states.add(c.stateCode);
    byOrg.set(c.orgName, cur);
  }

  return {
    mode: "local",
    at: Date.now(),
    states,
    activity: [...paid]
      .sort((a, b) => b.at - a.at)
      .slice(0, 30)
      .map((c) => ({
        stateCode: c.stateCode,
        stateName: stateCodeToName(c.stateCode),
        orgName: c.orgName,
        amount: c.amount,
        at: c.at,
      })),
    stats: {
      statesClaimed: claimed.length,
      statesTotal: STATES.length,
      totalStaked: claimed.reduce((sum, s) => sum + s.total, 0),
      totalClaims: claimed.reduce((sum, s) => sum + s.count, 0),
    },
    topOrgs: [...byOrg.entries()]
      .map(([orgName, v]) => ({ orgName, total: v.total, states: v.states.size }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20),
  };
}

// ---------------------------------------------------------------- module state
let localClaims: Claim[] = typeof window !== "undefined" ? loadLocal() : [];
let snapshot: BoardSnapshot = localClaims.length ? buildLocalSnapshot(localClaims) : emptySnapshot("local");
let version = 0;
let pollMs = 60_000;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function getVersion() {
  return version;
}

export const isLive = () => snapshot.mode === "live";

/** The #1 holder on a state — the org the map credits for owning it. */
export function topHolder(code: string): BoardHolder | null {
  const state = snapshot.states.find((s) => s.code === code);
  return state?.holders?.[0] ?? null;
}

// ---------------------------------------------------------------- server sync
async function refreshBoard(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const live = await fetchBoard();
    if (live) {
      snapshot = live;
      pollMs = 15_000;
      emit();
    } else if (snapshot.mode === "live") {
      // Backend went away — keep the last snapshot, slow the polling down.
      pollMs = 60_000;
    }
  } finally {
    inFlight = false;
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      await refreshBoard();
    }
    schedule();
  }, pollMs);
}

/** Start polling the shared board. Safe to call on every mount. */
export function startBoardSync() {
  if (typeof window === "undefined" || timer) return;
  void refreshBoard();
  schedule();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshBoard();
  });
}

// ---------------------------------------------------------------- queries
export function stateLeaderboard(code: string): StateLeaderboard {
  const state = snapshot.states.find((s) => s.code === code);
  const holders = (state?.holders ?? []).map((h) => ({ ...h, isTop: false }));
  if (holders[0]) holders[0].isTop = true;
  return {
    code,
    name: stateCodeToName(code),
    holders,
    totalStake: holders.reduce((sum, h) => sum + h.total, 0),
    isEmpty: holders.length === 0,
  };
}

export function allTotals(): Record<string, { total: number; count: number }> {
  const out: Record<string, { total: number; count: number }> = {};
  for (const s of snapshot.states) {
    if (s.count > 0) out[s.code] = { total: s.total, count: s.count };
  }
  return out;
}

export function globalStats() {
  return { ...snapshot.stats };
}

export function openStateCount() {
  const totals = allTotals();
  return STATES.filter((s) => !totals[s.code]).length;
}

export function recentClaims(n = 8) {
  return snapshot.activity.slice(0, n);
}

/** Leaderboard of states by total stake, each carrying its current top holder. */
export function worldOrder(n = 10) {
  return Object.entries(allTotals())
    .map(([code, v]) => {
      const leader = topHolder(code);
      return {
        code,
        name: stateCodeToName(code),
        ...v,
        leader: leader?.orgName ?? "",
        leaderLink: leader?.link,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

export function globalTopOrgs(n = 10) {
  return snapshot.topOrgs.slice(0, n);
}

/** Minimum you must pay now so that `orgName`'s total takes the #1 spot on this state. */
export function minimumToOvertake(lb: StateLeaderboard, orgName: string): number {
  if (lb.isEmpty) return PRICING.minClaim;
  const mine = lb.holders.find((h) => h.orgName === orgName)?.total ?? 0;
  const leader = lb.holders[0]?.total ?? 0;
  if (mine >= leader) return PRICING.minClaim; // already #1 → any add keeps it
  return leader - mine + PRICING.minToOvertake;
}

// ---------------------------------------------------------------- mutations
/**
 * Record a stake that has already been paid for (checkout returned "paid").
 * LIVE: POST /api/stake, then refresh the shared board.
 * LOCAL: append to localStorage and rebuild the local snapshot.
 */
export async function applyPaidClaim(
  claim: Omit<Claim, "id" | "at" | "status">,
  opts?: { email?: string },
): Promise<StakeResult> {
  if (isLive()) {
    try {
      const res = await fetch("/api/stake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...claim, email: opts?.email }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!res.ok || !data?.ok) {
        return { ok: false, message: data?.message ?? "Could not record the stake." };
      }
      await refreshBoard();
      return {
        ok: true,
        message: data.message ?? "Stake applied.",
        stateCode: claim.stateCode,
        leaderboard: stateLeaderboard(claim.stateCode),
      };
    } catch {
      return { ok: false, message: "Network problem — the stake was not recorded." };
    }
  }

  const full: Claim = {
    ...claim,
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    status: "paid",
  };
  localClaims = [...localClaims, full];
  saveLocal(localClaims);
  snapshot = buildLocalSnapshot(localClaims);
  emit();
  return {
    ok: true,
    message: "Stake applied.",
    stateCode: full.stateCode,
    leaderboard: stateLeaderboard(full.stateCode),
  };
}

import type { Claim, HolderRow, StateLeaderboard, StakeResult } from "./types";
import { PRICING, STATES, stateCodeToName } from "./states";
import { nameSlug, slugOf } from "./links";
import { CITIES, cityId, type City } from "./cities";
import {
  emptySnapshot,
  fetchBoard,
  type BoardCity,
  type BoardHolder,
  type BoardSnapshot,
  type BoardState,
} from "./board";

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
 * Two kinds of stake live in the same collection:
 *   • state stakes  (no cityId) — they colour the state and drive World Order.
 *   • city  stakes  (with cityId) — they belong to that city only and are
 *     listed in the Cities panel; they never claim the surrounding state.
 *
 * Components only use the exported queries below, so the two modes are
 * interchangeable from their point of view.
 */

const KEY = "mymap:claims:v1";
const CITY_KEY = "mymap:cities:v1";

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

/** Cities a visitor added themselves (no coordinates, so no map pin). */
function loadCustomCities(): City[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CITY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { cities: { name: string; state: string }[] };
    if (!Array.isArray(parsed.cities)) return [];
    return parsed.cities
      .filter((c) => c && typeof c.name === "string" && typeof c.state === "string")
      .map((c) => ({
        id: cityId(c.name, c.state),
        name: c.name,
        state: c.state,
        custom: true,
      }));
  } catch {
    return [];
  }
}

function saveCustomCities(cities: City[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CITY_KEY,
      JSON.stringify({ version: 1, cities: cities.map((c) => ({ name: c.name, state: c.state })) }),
    );
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- aggregation
function addToOrg(perOrg: Map<string, HolderRow>, c: Claim) {
  const cur =
    perOrg.get(c.orgName) ??
    ({ orgName: c.orgName, pitch: c.pitch, link: c.link, total: 0, claims: 0, isTop: false } as HolderRow);
  cur.total += c.amount;
  cur.claims += 1;
  if (c.pitch) cur.pitch = c.pitch;
  if (c.link) cur.link = c.link;
  perOrg.set(c.orgName, cur);
}

const topDown = (rows: HolderRow[]) => [...rows].sort((a, b) => b.total - a.total);

/** Aggregate browser-local claims into the same shape /api/board returns. */
function buildLocalSnapshot(claims: Claim[]): BoardSnapshot {
  const paid = claims.filter((c) => c.status === "paid");
  const stateStakes = paid.filter((c) => !c.cityId);
  const cityStakes = paid.filter((c) => c.cityId);

  // --- states (state-level stakes only: a city stake never claims a state)
  const byState = new Map<string, Map<string, HolderRow>>();
  for (const c of stateStakes) {
    const perOrg = byState.get(c.stateCode) ?? new Map<string, HolderRow>();
    addToOrg(perOrg, c);
    byState.set(c.stateCode, perOrg);
  }

  const states: BoardState[] = STATES.map((s) => {
    const perOrg = byState.get(s.code);
    const holders = perOrg ? topDown([...perOrg.values()]) : [];
    return {
      code: s.code,
      name: s.name,
      total: holders.reduce((sum, h) => sum + h.total, 0),
      count: holders.reduce((sum, h) => sum + h.claims, 0),
      holders: holders.map((h) => ({ ...h, isTop: false })),
    };
  });

  // --- cities
  const byCity = new Map<string, { name: string; stateCode: string; perOrg: Map<string, HolderRow> }>();
  for (const c of cityStakes) {
    const id = c.cityId as string;
    const entry =
      byCity.get(id) ??
      { name: c.cityName || id, stateCode: c.stateCode, perOrg: new Map<string, HolderRow>() };
    addToOrg(entry.perOrg, c);
    byCity.set(id, entry);
  }

  const cities: BoardCity[] = [...byCity.entries()]
    .map(([id, e]) => {
      const holders = topDown([...e.perOrg.values()]);
      return {
        id,
        name: e.name,
        stateCode: e.stateCode,
        stateName: stateCodeToName(e.stateCode),
        total: holders.reduce((sum, h) => sum + h.total, 0),
        count: holders.reduce((sum, h) => sum + h.claims, 0),
        holders: holders.map((h) => ({ ...h, isTop: false })),
      };
    })
    .sort((a, b) => b.total - a.total);

  const claimedStates = states.filter((s) => s.count > 0);

  const byOrg = new Map<string, { total: number; states: Set<string> }>();
  for (const c of paid) {
    const cur = byOrg.get(c.orgName) ?? { total: 0, states: new Set<string>() };
    cur.total += c.amount;
    cur.states.add(c.cityId ?? c.stateCode);
    byOrg.set(c.orgName, cur);
  }

  return {
    mode: "local",
    at: Date.now(),
    states,
    cities,
    activity: [...paid]
      .sort((a, b) => b.at - a.at)
      .slice(0, 30)
      .map((c) => ({
        stateCode: c.stateCode,
        stateName: stateCodeToName(c.stateCode),
        cityId: c.cityId,
        cityName: c.cityName,
        orgName: c.orgName,
        amount: c.amount,
        at: c.at,
      })),
    stats: {
      statesClaimed: claimedStates.length,
      statesTotal: STATES.length,
      citiesClaimed: cities.length,
      totalStaked: paid.reduce((sum, c) => sum + c.amount, 0),
      totalClaims: paid.length,
    },
    topOrgs: [...byOrg.entries()]
      .map(([orgName, v]) => ({ orgName, total: v.total, states: v.states.size }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20),
  };
}

// ---------------------------------------------------------------- module state
let localClaims: Claim[] = typeof window !== "undefined" ? loadLocal() : [];
let customCities: City[] = typeof window !== "undefined" ? loadCustomCities() : [];
let snapshot: BoardSnapshot = localClaims.length ? buildLocalSnapshot(localClaims) : emptySnapshot("local");
let version = 0;
let pollMs = 60_000;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

const listeners = new Set<() => void>();

function emit() {
  version++;
  pinCache = null;
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

/** The #1 holder on a city, or null when nobody has staked it yet. */
export function topHolderForCity(id: string): BoardHolder | null {
  const city = snapshot.cities.find((c) => c.id === id);
  return city?.holders?.[0] ?? null;
}

// ---------------------------------------------------------------- cities
/** The city catalogue: built-ins, plus this visitor's own cities, plus any
 *  city that exists in the shared board (someone else may have added it). */
export function allCities(): City[] {
  const out = new Map<string, City>();
  for (const c of CITIES) out.set(c.id, c);
  for (const c of customCities) if (!out.has(c.id)) out.set(c.id, c);
  for (const c of snapshot.cities) {
    if (!out.has(c.id)) {
      out.set(c.id, { id: c.id, name: c.name, state: c.stateCode, custom: true });
    }
  }
  return [...out.values()];
}

export function cityById(id: string): City | null {
  return allCities().find((c) => c.id === id) ?? null;
}

/**
 * Add a city a visitor wants to stake on. Returns the city (existing one if it
 * is already in the catalogue) or null when the name is unusable.
 */
export function addCity(name: string, stateCode: string): City | null {
  const clean = name
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  if (clean.length < 2) return null;
  if (!STATES.some((s) => s.code === stateCode)) return null;

  const id = cityId(clean, stateCode);
  const existing = allCities().find((c) => c.id === id);
  if (existing) return existing;

  const city: City = { id, name: clean, state: stateCode, custom: true };
  customCities = [...customCities, city];
  saveCustomCities(customCities);
  emit();
  return city;
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

/** Same shape as a state leaderboard, but for one city (code = city id). */
export function cityLeaderboard(id: string): StateLeaderboard {
  const board = snapshot.cities.find((c) => c.id === id);
  const holders = (board?.holders ?? []).map((h) => ({ ...h, isTop: false }));
  if (holders[0]) holders[0].isTop = true;
  return {
    code: id,
    // Before anyone stakes it, the name comes from the city catalogue.
    name: board?.name ?? cityById(id)?.name ?? id,
    holders,
    totalStake: holders.reduce((sum, h) => sum + h.total, 0),
    isEmpty: holders.length === 0,
  };
}

/** State totals only — what colours the map (city stakes are excluded). */
export function allTotals(): Record<string, { total: number; count: number }> {
  const out: Record<string, { total: number; count: number }> = {};
  for (const s of snapshot.states) {
    if (s.count > 0) out[s.code] = { total: s.total, count: s.count };
  }
  return out;
}

/** Totals per city id, for the Cities panel and the map pins. */
export function cityTotals(extraIds: string[] = []): Record<string, { total: number; count: number }> {
  const out: Record<string, { total: number; count: number }> = {};
  for (const c of snapshot.cities) out[c.id] = { total: c.total, count: c.count };
  for (const id of extraIds) if (!out[id]) out[id] = { total: 0, count: 0 };
  return out;
}

export function cityBoard(): BoardCity[] {
  return snapshot.cities;
}

/** Cities inside a state that someone has staked on (for the map tooltip). */
export function citiesInState(stateCode: string): { id: string; name: string; total: number }[] {
  return snapshot.cities
    .filter((c) => c.stateCode === stateCode)
    .map((c) => ({ id: c.id, name: c.name, total: c.total }));
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
  const stateTotals = allTotals();
  return Object.entries(stateTotals)
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

/* ------------------------------------------------------- bidder profile (pin) */

/** A place a bidder holds — a state or a city inside one. */
export interface PinTerritory {
  kind: "state" | "city";
  /** state code, or city id */
  code: string;
  name: string;
  /** "Pahang" for a city, empty for a state */
  sub: string;
  rank: number;
  total: number;
  claims: number;
  isTop: boolean;
}

export interface PinProfile {
  slug: string;
  orgName: string;
  link?: string;
  pitch: string;
  /** total staked across every territory */
  total: number;
  /** how many payments make it up */
  placements: number;
  /** territories where this name holds #1 */
  crowns: number;
  territories: PinTerritory[];
}

/** Every holder row on the board flattened, with its rank and place name. */
function allHolderRows(): {
  holder: BoardHolder;
  kind: "state" | "city";
  code: string;
  name: string;
  sub: string;
  rank: number;
}[] {
  const rows: {
    holder: BoardHolder;
    kind: "state" | "city";
    code: string;
    name: string;
    sub: string;
    rank: number;
  }[] = [];
  for (const s of snapshot.states) {
    s.holders.forEach((h, i) => rows.push({ holder: h, kind: "state", code: s.code, name: s.name, sub: "", rank: i + 1 }));
  }
  for (const c of snapshot.cities) {
    c.holders.forEach((h, i) =>
      rows.push({ holder: h, kind: "city", code: c.id, name: c.name, sub: c.stateName, rank: i + 1 }),
    );
  }
  return rows;
}

/** The link a name is currently linked to (holders can stake several times). */
export function linkForOrg(orgName: string): string | undefined {
  return allHolderRows().find((r) => r.holder.orgName === orgName && r.holder.link)?.holder.link;
}

/**
 * The public profile behind /pin/<slug>.
 *
 * A listing is identified by its link (worldmap.lol's rule — "there are no
 * accounts, your listing is identified by its link"). Slugs that aren't a link
 * fall back to the holder name, so a demo board without links still has pages.
 */
export function pinBySlug(slug: string): PinProfile | null {
  const want = slug.trim().toLowerCase();
  if (!want) return null;

  const rows = allHolderRows();
  let matches = rows.filter((r) => slugOf(r.holder.link) === want);
  if (matches.length === 0) {
    matches = rows.filter((r) => nameSlug(r.holder.orgName) === want);
  }
  if (matches.length === 0) return null;

  // One link can be staked by several names — the biggest spender owns the page.
  const totals = new Map<string, number>();
  for (const r of matches) totals.set(r.holder.orgName, (totals.get(r.holder.orgName) ?? 0) + r.holder.total);
  const orgName = [...totals.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const mine = matches.filter((r) => r.holder.orgName === orgName);
  const territories: PinTerritory[] = mine
    .map((r) => ({
      kind: r.kind,
      code: r.code,
      name: r.name,
      sub: r.sub,
      rank: r.rank,
      total: r.holder.total,
      claims: r.holder.claims,
      isTop: r.rank === 1,
    }))
    .sort((a, b) => b.total - a.total);

  const withLink = mine.find((r) => r.holder.link);
  const withPitch = mine.find((r) => r.holder.pitch);

  return {
    slug: want,
    orgName,
    link: withLink?.holder.link,
    pitch: withPitch?.holder.pitch ?? "",
    total: territories.reduce((sum, t) => sum + t.total, 0),
    placements: territories.reduce((sum, t) => sum + t.claims, 0),
    crowns: territories.filter((t) => t.isTop).length,
    territories,
  };
}

/** Last profile we built, kept stable so useSyncExternalStore doesn't loop. */
let pinCache: { slug: string; at: number; value: PinProfile | null } | null = null;

/**
 * `pinBySlug`, but referentially stable for a given (slug, board version) —
 * what `useSyncExternalStore` in the profile page needs.
 */
export function pinSnapshot(slug: string): PinProfile | null {
  if (pinCache && pinCache.slug === slug && pinCache.at === version) return pinCache.value;
  const value = pinBySlug(slug);
  pinCache = { slug, at: version, value };
  return value;
}

/** Minimum you must pay now so that `orgName`'s total takes the #1 spot. */
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
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        checkoutUrl?: string;
        pending?: boolean;
      } | null;
      if (!res.ok || !data?.ok) {
        return { ok: false, message: data?.message ?? "Could not record the stake." };
      }
      // Live payments: the stake is parked as `pending` and the buyer goes to
      // Whop's hosted checkout. The board only shows it once the webhook lands.
      if (data.pending && data.checkoutUrl) {
        return {
          ok: true,
          pending: true,
          checkoutUrl: data.checkoutUrl,
          message: data.message ?? "Opening secure checkout…",
          stateCode: claim.stateCode,
        };
      }
      await refreshBoard();
      return {
        ok: true,
        message: data.message ?? "Stake applied.",
        stateCode: claim.stateCode,
        leaderboard: claim.cityId ? cityLeaderboard(claim.cityId) : stateLeaderboard(claim.stateCode),
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
    leaderboard: full.cityId ? cityLeaderboard(full.cityId) : stateLeaderboard(full.stateCode),
  };
}

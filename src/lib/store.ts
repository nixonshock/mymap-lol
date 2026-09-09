import { useSyncExternalStore } from "react";
import type { Claim, StateLeaderboard, HolderRow, StakeResult } from "./types";
import { PRICING, STATES, stateCodeToName } from "./states";

const KEY = "mymap:claims:v1";

// ---- persistence (DEMO: browser-local). Swap this adapter to Supabase for
// ---- a shared, multi-user leaderboard; see src/lib/db.ts for the adapter + schema.

function load(): Claim[] {
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

function save(claims: Claim[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify({ version: 1, claims }));
}

// ---- module state + subscription (drives React re-renders)
let claims: Claim[] = typeof window !== "undefined" ? load() : [];
let version = 0;
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

// ---- queries
export function stateLeaderboard(code: string): StateLeaderboard {
  const scoped = claims.filter((c) => c.stateCode === code);
  const byOrg = new Map<string, HolderRow>();
  for (const c of scoped) {
    const cur = byOrg.get(c.orgName) ?? {
      orgName: c.orgName,
      pitch: c.pitch,
      link: c.link,
      total: 0,
      claims: 0,
      isTop: false,
    };
    cur.total += c.amount;
    cur.claims += 1;
    byOrg.set(c.orgName, cur);
  }
  const holders = [...byOrg.values()].sort((a, b) => b.total - a.total);
  const totalStake = holders.reduce((s, h) => s + h.total, 0);
  if (holders[0]) holders[0].isTop = true;
  return {
    code,
    name: stateCodeToName(code),
    holders,
    totalStake,
    isEmpty: holders.length === 0,
  };
}

export function allTotals() {
  const out: Record<string, { total: number; count: number }> = {};
  for (const c of claims) {
    const cur = out[c.stateCode] ?? { total: 0, count: 0 };
    cur.total += c.amount;
    cur.count += 1;
    out[c.stateCode] = cur;
  }
  return out;
}

export function globalStats() {
  const totals = allTotals();
  const states = Object.keys(totals);
  const staked = states.reduce((s, k) => s + totals[k].total, 0);
  return {
    statesClaimed: states.length,
    statesTotal: 16,
    totalStaked: staked,
    totalClaims: claims.length,
  };
}

/** Minimum you must pay now so that `orgName`'s total takes the #1 spot on this state. */
export function minimumToOvertake(lb: StateLeaderboard, orgName: string): number {
  if (lb.isEmpty) return PRICING.minClaim;
  const mine = lb.holders.find((h) => h.orgName === orgName)?.total ?? 0;
  const leader = lb.holders[0]?.total ?? 0;
  if (mine >= leader) return PRICING.minClaim; // already #1 → any add keeps it
  return leader - mine + PRICING.minToOvertake;
}

// ---- mutations (demo: payment already "paid" by the fake checkout)
export function applyPaidClaim(claim: Omit<Claim, "id" | "at" | "status">): StakeResult {
  const full: Claim = {
    ...claim,
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    status: "paid",
  };
  claims = [...claims, full];
  save(claims);
  emit();
  return { ok: true, message: "Stake applied.", stateCode: full.stateCode, leaderboard: stateLeaderboard(full.stateCode) };
}

// ---- worldmap.lol-style dashboard queries ----

/** Most recent claimed/staked activities, newest first. */
export function recentClaims(n = 8) {
  return [...claims]
    .sort((a, b) => b.at - a.at)
    .slice(0, n)
    .map((c) => ({
      stateCode: c.stateCode,
      stateName: stateCodeToName(c.stateCode),
      orgName: c.orgName,
      amount: c.amount,
      at: c.at,
    }));
}

/** Top states by total stake (the "World Order" list). */
export function worldOrder(n = 10) {
  return Object.entries(allTotals())
    .map(([code, v]) => ({ code, name: stateCodeToName(code), ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

/** Number of states with no holder yet (still open). */
export function openStateCount() {
  const t = allTotals();
  return STATES.filter((s) => !t[s.code]).length;
}

/** Top organizations aggregated across every state (the "board"). */
export function globalTopOrgs(n = 10) {
  const byOrg = new Map<string, { total: number; states: Set<string> }>();
  for (const c of claims) {
    const cur = byOrg.get(c.orgName) ?? { total: 0, states: new Set<string>() };
    cur.total += c.amount;
    cur.states.add(c.stateCode);
    byOrg.set(c.orgName, cur);
  }
  return [...byOrg.entries()]
    .map(([orgName, v]) => ({ orgName, total: v.total, states: v.states.size }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

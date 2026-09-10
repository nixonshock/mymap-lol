import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoardSnapshot, BoardState, BoardHolder } from "@/lib/board";

const usd = (cents: number | string | null | undefined) => Number(cents ?? 0) / 100;

/**
 * Read the whole shared board from Supabase (views defined in supabase/schema.sql).
 * One round of parallel queries; the aggregation happens in SQL, so the payload
 * we hand the browser stays small even as claims pile up.
 */
export async function buildSnapshot(sb: SupabaseClient): Promise<BoardSnapshot> {
  const [totalsRes, holdersRes, activityRes, orgsRes] = await Promise.all([
    sb.from("state_totals").select("code,name,ordinal,total_cents,claims,top_org").order("ordinal"),
    sb
      .from("state_holders")
      .select("state_code,org_name,total_cents,claims,pitch,link")
      .order("total_cents", { ascending: false }),
    sb
      .from("recent_activity")
      .select("state_code,state_name,org_name,amount_cents,created_at")
      .limit(30),
    sb.from("top_orgs").select("org_name,total_cents,states").limit(20),
  ]);

  const err = totalsRes.error ?? holdersRes.error ?? activityRes.error ?? orgsRes.error;
  if (err) throw new Error(err.message);

  const holdersByState = new Map<string, BoardHolder[]>();
  for (const h of holdersRes.data ?? []) {
    const list = holdersByState.get(h.state_code) ?? [];
    list.push({
      orgName: h.org_name,
      pitch: h.pitch ?? "",
      link: h.link ?? undefined,
      total: usd(h.total_cents),
      claims: h.claims ?? 0,
    });
    holdersByState.set(h.state_code, list);
  }

  const states: BoardState[] = (totalsRes.data ?? []).map((s) => ({
    code: s.code,
    name: s.name,
    total: usd(s.total_cents),
    count: s.claims ?? 0,
    holders: holdersByState.get(s.code) ?? [],
  }));

  const claimed = states.filter((s) => s.count > 0);

  return {
    mode: "live",
    at: Date.now(),
    states,
    activity: (activityRes.data ?? []).map((a) => ({
      stateCode: a.state_code,
      stateName: a.state_name,
      orgName: a.org_name,
      amount: usd(a.amount_cents),
      at: new Date(a.created_at).getTime(),
    })),
    stats: {
      statesClaimed: claimed.length,
      statesTotal: states.length || 16,
      totalStaked: claimed.reduce((sum, s) => sum + s.total, 0),
      totalClaims: claimed.reduce((sum, s) => sum + s.count, 0),
    },
    topOrgs: (orgsRes.data ?? []).map((o) => ({
      orgName: o.org_name,
      total: usd(o.total_cents),
      states: o.states ?? 0,
    })),
  };
}

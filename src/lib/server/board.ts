import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoardActivity, BoardCity, BoardHolder, BoardSnapshot, BoardState } from "@/lib/board";

const usd = (cents: number | string | null | undefined) => Number(cents ?? 0) / 100;

/**
 * Read the whole shared board from Supabase (views defined in supabase/schema.sql).
 * One round of parallel queries; the aggregation happens in SQL, so the payload
 * we hand the browser stays small even as claims pile up.
 *
 * The city views are read defensively: a database created before the city
 * columns existed still serves the state board (with no staked cities) instead
 * of failing the whole request.
 */
export async function buildSnapshot(sb: SupabaseClient): Promise<BoardSnapshot> {
  const [totalsRes, holdersRes, activityRes, orgsRes, cityTotalsRes, cityHoldersRes] =
    await Promise.all([
      sb.from("state_totals").select("code,name,ordinal,total_cents,claims,top_org").order("ordinal"),
      sb
        .from("state_holders")
        .select("state_code,org_name,total_cents,claims,pitch,link")
        .order("total_cents", { ascending: false }),
      sb
        .from("recent_activity")
        .select("state_code,state_name,city_id,city_name,org_name,amount_cents,created_at")
        .limit(30),
      sb.from("top_orgs").select("org_name,total_cents,states").limit(20),
      sb
        .from("city_totals")
        .select("id,name,state_code,state_name,total_cents,claims")
        .order("total_cents", { ascending: false })
        .limit(200),
      sb
        .from("city_holders")
        .select("city_id,org_name,total_cents,claims,pitch,link")
        .order("total_cents", { ascending: false }),
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

  // --- cities (missing view / older schema → simply no staked cities)
  let cityRows: {
    id: string;
    name: string;
    state_code: string;
    state_name: string;
    total_cents: number | string | null;
    claims: number | null;
  }[] = [];
  if (cityTotalsRes.error) {
    console.warn("[server/board] city totals unavailable:", cityTotalsRes.error.message);
  } else {
    cityRows = cityTotalsRes.data ?? [];
  }

  const cityHoldersByCity = new Map<string, BoardHolder[]>();
  if (!cityHoldersRes.error) {
    for (const h of cityHoldersRes.data ?? []) {
      const list = cityHoldersByCity.get(h.city_id) ?? [];
      list.push({
        orgName: h.org_name,
        pitch: h.pitch ?? "",
        link: h.link ?? undefined,
        total: usd(h.total_cents),
        claims: h.claims ?? 0,
      });
      cityHoldersByCity.set(h.city_id, list);
    }
  }

  const cities: BoardCity[] = cityRows.map((c) => ({
    id: c.id,
    name: c.name,
    stateCode: c.state_code,
    stateName: c.state_name,
    total: usd(c.total_cents),
    count: c.claims ?? 0,
    holders: cityHoldersByCity.get(c.id) ?? [],
  }));

  const activity = (activityRes.data ?? []).map((a) => {
    const raw = a as typeof a & { city_id?: string | null; city_name?: string | null };
    return {
      stateCode: a.state_code,
      stateName: a.state_name,
      cityId: raw.city_id ?? undefined,
      cityName: raw.city_name ?? undefined,
      orgName: a.org_name,
      amount: usd(a.amount_cents),
      at: new Date(a.created_at).getTime(),
    } satisfies BoardActivity;
  });

  const claimed = states.filter((s) => s.count > 0);

  return {
    mode: "live",
    at: Date.now(),
    states,
    cities,
    activity,
    stats: {
      statesClaimed: claimed.length,
      statesTotal: states.length || 16,
      citiesClaimed: cities.length,
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

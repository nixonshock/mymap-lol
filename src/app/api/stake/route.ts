import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/server/supabase";
import {
  createWhopCheckout,
  whopChargeAmount,
  whopConfigured,
  whopCurrency,
  whopReturnUrl,
} from "@/lib/payments/whop";
import { PRICING, STATES, stateCodeToName } from "@/lib/states";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS_PER_HOUR = 30;
const MAX_AMOUNT = 50_000; // $ — sanity ceiling per stake

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * The paragraph Whop shows on the hosted checkout page (worldmap.lol wording,
 * adapted): say plainly what is being bought, that it is an ad buy and not a
 * bet, and where to complain before disputing.
 */
function whopDescription({
  orgName,
  link,
  targetLabel,
}: {
  orgName: string;
  link: string | null;
  targetLabel: string;
}): string {
  const support = process.env.WHOP_SUPPORT_EMAIL;
  return [
    `Advertising placement for ${link ?? orgName} on the ${targetLabel} board at mymap.lol.`,
    "Rank is the bid; your listing holds its rank until someone outbids it.",
    "This is an ad buy — no refunds, no payouts.",
    "By completing this purchase you confirm you have reviewed the placement and pricing and authorize the payment.",
    support ? `For any issue, contact ${support} before initiating a dispute or chargeback.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}


function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // strip control chars, collapse whitespace, cap length
  return v
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function parseLink(v: unknown): string | null {
  const raw = clean(v, 200);
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * POST /api/stake — record a stake.
 *
 * A stake is either for a whole state or for one city inside it (`cityId` +
 * `cityName`). City stakes are stored with the city on the row, and the state
 * views ignore them, so a city stake never claims the surrounding state.
 *
 * Payment mode "demo" (default): the claim is written straight in as paid, so
 * the whole funnel keeps working end-to-end. Once a live provider is wired
 * (Phase 2) this writes a `pending` claim and returns the checkout to send the
 * buyer to; the provider webhook then flips it to `paid`.
 */
export async function POST(req: NextRequest) {
  const sb = serviceClient();
  const paymentMode = process.env.NEXT_PUBLIC_PAYMENT_MODE ?? "demo";

  /**
   * Sandbox dry run — Whop sandbox testing before Supabase is wired.
   *
   * It requires `WHOP_SANDBOX=true`, which pins the API base to Whop's sandbox
   * (a promise that no real money moves), and it stores nothing: the buyer is
   * still handed to a real hosted checkout, but with no claim row no webhook can
   * ever flip a stake to `paid`. Delete the flags (and this branch) once
   * Supabase is configured — then the row-parking path below takes over.
   */
  const sandboxDryRun = !sb && paymentMode === "live" && process.env.WHOP_SANDBOX === "true";
  if (!sb && !sandboxDryRun) {
    return json(
      { ok: false, mode: "demo", message: "Shared backend not configured yet." },
      503,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, message: "Malformed request." }, 400);
  }

  const stateCode = clean(body.stateCode, 8).toUpperCase();
  const rawCityId = clean(body.cityId, 80).toLowerCase();
  const rawCityName = clean(body.cityName, 60);
  const orgName = clean(body.orgName, 60);
  const pitch = clean(body.pitch, 140);
  const link = parseLink(body.link);
  const email = clean(body.email, 120);
  const amountUsd = Math.round(Number(body.amount));
  const amountCents = amountUsd * 100;

  if (!/^MY-\d{2}$/.test(stateCode)) return json({ ok: false, message: "Unknown state." }, 400);
  if (orgName.length < 2) return json({ ok: false, message: "A name is required." }, 400);
  if (!pitch) return json({ ok: false, message: "A one-line pitch is required." }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, message: "That email doesn't look right." }, 400);
  }
  if (!Number.isFinite(amountUsd) || amountUsd < PRICING.minClaim || amountUsd > MAX_AMOUNT) {
    return json(
      { ok: false, message: `Amount must be between $${PRICING.minClaim} and $${MAX_AMOUNT}.` },
      400,
    );
  }

  // City extra: "<state code>:<slug>" — anything else is dropped rather than
  // stored, and a city stake without a name is not a city stake.
  const cityId = rawCityId && /^my-\d{2}:[a-z0-9-]{2,60}$/.test(rawCityId) ? rawCityId : null;
  const cityName = cityId ? rawCityName || null : null;
  if (cityId && !cityName) {
    return json({ ok: false, message: "City stakes need a city name." }, 400);
  }
  if (cityId && !cityId.startsWith(stateCode.toLowerCase() + ":")) {
    return json({ ok: false, message: "That city doesn't belong to that state." }, 400);
  }

  // The state must exist (FK would also catch it; this gives a clean error).
  if (sb) {
    const { data: state, error: stateErr } = await sb
      .from("states")
      .select("code")
      .eq("code", stateCode)
      .maybeSingle();
    if (stateErr) {
      console.error("[api/stake] state lookup failed:", stateErr.message);
      return json({ ok: false, message: "Backend unavailable — try again." }, 503);
    }
    if (!state) return json({ ok: false, message: "Unknown state." }, 400);
  } else if (!STATES.some((s) => s.code === stateCode)) {
    return json({ ok: false, message: "Unknown state." }, 400);
  }

  // --- abuse control: hashed IP, never the raw address
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipHash = sha256(`${process.env.IP_SALT ?? "mymap-lol"}:${ip}`);

  if (sb) {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await sb
      .from("stake_events")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
      return json({ ok: false, message: "Too many attempts from this connection — try later." }, 429);
    }
    await sb.from("stake_events").insert({ ip_hash: ipHash, kind: "stake" });
  }

  // --- payment path
  const editToken = randomBytes(18).toString("base64url");
  if (sandboxDryRun) {
    console.warn("[api/stake] Whop SANDBOX dry run — no claim stored for", stateCode, orgName);
  }
  const targetLabel = cityName
    ? `${cityName} · ${stateCodeToName(stateCode)}`
    : stateCodeToName(stateCode);

  // The amount the buyer is actually charged, in the plan's currency. With the
  // default WHOP_CURRENCY=usd the plan is denominated in dollars, so a "$32"
  // stake charges $32 — the "≈ RM129" the UI showed beside it is the display
  // conversion (NEXT_PUBLIC_USD_MYR), not a charge in ringgit.
  const chargeMajor = whopChargeAmount(amountUsd);
  const currency = whopCurrency().toUpperCase();
  const chargeCents = chargeMajor * 100;

  if (paymentMode === "live") {
    if (!whopConfigured()) {
      return json(
        { ok: false, message: "Live payments aren't configured yet — no payment was taken." },
        503,
      );
    }

    // 1. Park the stake as `pending` — the webhook is what flips it to `paid`.
    //    A sandbox dry run has no database, so it only mints the reference id
    //    that gets stamped on the plan; the row arrives with Supabase.
    let claimId: string;
    if (sb) {
      const { data: pending, error: pendingErr } = await sb
        .from("claims")
        .insert({
          state_code: stateCode,
          city_id: cityId,
          city_name: cityName,
          org_name: orgName,
          pitch,
          link,
          amount_cents: chargeCents,
          currency,
          status: "pending",
          provider: "whop",
          org_email: email || null,
          edit_token_hash: sha256(editToken),
          ip_hash: ipHash,
        })
        .select("id")
        .single();

      if (pendingErr || !pending) {
        console.error("[api/stake] pending insert failed:", pendingErr?.message);
        return json({ ok: false, message: "Could not open the checkout — try again." }, 503);
      }
      claimId = pending.id;
    } else {
      claimId = `sandbox_${randomBytes(6).toString("hex")}`;
    }

    // 2. One one-time plan for this exact stake → Whop's hosted checkout, wrapped
    //    in a checkout configuration that returns the buyer to the site. The
    //    stake facts ride on the return URL: with no database yet (sandbox dry
    //    run) that is what lets the map colour the state when they come back.
    const back = new URL(whopReturnUrl());
    back.searchParams.set("paid", claimId);
    back.searchParams.set("state", stateCode);
    back.searchParams.set("org", orgName);
    back.searchParams.set("amount", String(chargeMajor));
    if (pitch) back.searchParams.set("pitch", pitch);
    if (link) back.searchParams.set("link", link);
    if (cityId) {
      back.searchParams.set("city", cityId);
      if (cityName) back.searchParams.set("cityname", cityName);
    }

    try {
      const checkout = await createWhopCheckout({
        amountMajor: chargeMajor,
        title: `${targetLabel} — ${currency} ${chargeMajor} placement`,
        description: whopDescription({ orgName, link, targetLabel }),
        returnUrl: back.toString(),
        metadata: {
          claim_id: claimId,
          state_code: stateCode,
          city_id: cityId ?? "",
          org_name: orgName,
        },
      });

      // Remember the plan id so a webhook can still find this row if metadata
      // ever comes through empty.
      if (sb) {
        await sb.from("claims").update({ tx_id: checkout.planId || null }).eq("id", claimId);
      }

      return json({
        ok: true,
        mode: "live",
        pending: true,
        sandboxTest: sandboxDryRun || undefined,
        checkoutUrl: checkout.purchaseUrl,
        id: claimId,
        stateCode,
        cityId,
        cityName,
        currency,
        amount: chargeMajor,
        editToken,
        message: "Opening secure checkout…",
      });
    } catch (err) {
      if (sb) await sb.from("claims").delete().eq("id", claimId);
      console.error("[api/stake] whop checkout failed:", err);
      return json({ ok: false, message: "Could not open the checkout — try again." }, 502);
    }
  }

  // Unreachable in practice: without Supabase the only way past the guard at the
  // top is the live sandbox dry run, which returned above. This keeps the demo
  // write below honest about needing a database.
  if (!sb) {
    return json({ ok: false, mode: "demo", message: "Shared backend not configured yet." }, 503);
  }

  const { data, error } = await sb
    .from("claims")
    .insert({
      state_code: stateCode,
      city_id: cityId,
      city_name: cityName,
      org_name: orgName,
      pitch,
      link,
      amount_cents: amountCents,
      currency: "USD",
      status: "paid",
      provider: "demo",
      tx_id: `demo_${randomBytes(6).toString("hex")}`,
      org_email: email || null,
      edit_token_hash: sha256(editToken),
      ip_hash: ipHash,
      paid_at: new Date().toISOString(),
    })
    .select("id,created_at")
    .single();

  if (error) {
    console.error("[api/stake] insert failed:", error.message);
    return json({ ok: false, message: "Could not record the stake — try again." }, 503);
  }

  return json({
    ok: true,
    mode: "live",
    demoPayment: true,
    id: data.id,
    stateCode,
    cityId,
    cityName,
    amount: amountUsd,
    /** private link the buyer can use to edit their card (UI in Phase 3) */
    editToken,
    message: cityName ? `Stake applied to ${cityName}.` : "Stake applied.",
  });
}

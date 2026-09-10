import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/server/supabase";
import { claimIdFromEvent, planIdFromEvent, verifyWhopWebhook } from "@/lib/payments/whop";

export const dynamic = "force-dynamic";

/**
 * POST /api/whop/webhook — Whop tells us a payment landed.
 *
 * Whop signs every request (Standard Webhooks): HMAC-SHA256 over
 * `{webhook-id}.{webhook-timestamp}.{raw body}`, base64, in `webhook-signature`.
 * Verify first, then flip the pending claim to `paid`. Anything we can't tie to
 * a claim is logged and acknowledged (a 500 here would just make Whop retry a
 * request we can never fulfil).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  const verified = verifyWhopWebhook(raw, req.headers);
  if (!verified.ok) {
    console.warn("[whop/webhook] rejected:", verified.reason);
    return NextResponse.json({ ok: false, message: verified.reason }, { status: 401 });
  }

  const event = verified.event;
  const type = event.type ?? "";
  const paymentId = event.data?.id ?? null;

  if (type !== "payment.succeeded" && type !== "payment.failed" && type !== "payment.canceled") {
    return NextResponse.json({ ok: true, ignored: type });
  }

  const sb = serviceClient();
  if (!sb) {
    console.error("[whop/webhook] no backend configured — cannot record payment", paymentId);
    return NextResponse.json({ ok: false, message: "Backend not configured." }, { status: 503 });
  }

  const claimId = claimIdFromEvent(event);
  const planId = planIdFromEvent(event);

  // Prefer the claim id we stamped into the plan metadata; fall back to the plan
  // id we stored on the pending row right after creating the checkout.
  let match = sb.from("claims").select("id,status").limit(1);
  match = claimId
    ? match.eq("id", claimId)
    : planId
      ? match.eq("tx_id", planId)
      : match;
  if (!claimId && !planId) {
    console.warn("[whop/webhook] no claim reference on event", event.id);
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const { data: row, error: lookupErr } = await match.maybeSingle();
  if (lookupErr) {
    console.error("[whop/webhook] claim lookup failed:", lookupErr.message);
    return NextResponse.json({ ok: false, message: "Lookup failed." }, { status: 503 });
  }
  if (!row) {
    console.warn("[whop/webhook] no claim for", { claimId, planId, paymentId });
    return NextResponse.json({ ok: true, unmatched: true });
  }

  if (type === "payment.succeeded") {
    if (row.status === "paid") return NextResponse.json({ ok: true, already: true });

    const { error } = await sb
      .from("claims")
      .update({
        status: "paid",
        provider: "whop",
        tx_id: paymentId ?? planId ?? null,
        paid_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) {
      console.error("[whop/webhook] paid update failed:", error.message);
      return NextResponse.json({ ok: false, message: "Update failed." }, { status: 503 });
    }
    console.log("[whop/webhook] claim paid:", row.id, paymentId);
    return NextResponse.json({ ok: true, paid: row.id });
  }

  // failed / canceled — leave the claim pending but record what happened
  const { error } = await sb
    .from("claims")
    .update({ provider: "whop", tx_id: paymentId ?? planId ?? null })
    .eq("id", row.id);
  if (error) console.error("[whop/webhook] failure note failed:", error.message);
  console.log("[whop/webhook]", type, "for claim", row.id);
  return NextResponse.json({ ok: true, status: type });
}

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/server/supabase";
import { nameSlug, safeHref, slugOf } from "@/lib/links";

export const dynamic = "force-dynamic";

/**
 * Link clicks for a listing.
 *
 * POST /api/click  { link, orgName, source }  → counts one click (204)
 * GET  /api/click?slug=<slug>                 → { clicks, clicks7d, visitors }
 *
 * The bidder paid for a spot on the map, so this is the number that tells them
 * whether the spot is earning its keep. Counting is best-effort by design: the
 * link still opens if this route is slow, missing or unconfigured, and the
 * visitor is never asked to wait for a metric.
 *
 * The slug is derived **server-side** with the same rule `/pin/<slug>` uses
 * (`slugOf(link) ?? nameSlug(orgName)`), so a client cannot credit clicks to
 * someone else's listing.
 */

const MAX_SLUG = 200;

const json = (body: unknown, status = 200, cache = "no-store") =>
  NextResponse.json(body, { status, headers: { "cache-control": cache } });

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max) : "";

export async function POST(req: NextRequest) {
  // A beacon may arrive as JSON (our own client) or as text/plain (a fallback
  // fetch); accept both rather than losing the click.
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  const link = clean(body.link, 300);
  const orgName = clean(body.orgName, 60);
  const source = clean(body.source, 20) || "unknown";

  const slug = (slugOf(link) ?? nameSlug(orgName)).slice(0, MAX_SLUG);
  if (!slug) return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });

  const sb = serviceClient();
  if (!sb) {
    // No shared board → nothing to count against. Still a 204: a metric must
    // never turn into an error the visitor can see.
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipHash = createHash("sha256").update(`${process.env.IP_SALT ?? "mymap-lol"}:${ip}`).digest("hex");

  const { error } = await sb.from("link_clicks").insert({
    slug,
    org_name: orgName || null,
    link: safeHref(link),
    source,
    ip_hash: ipHash,
  });
  if (error) {
    console.error(
      "[api/click] insert failed (has supabase/migrations/003-link-clicks.sql been applied?):",
      error.message,
    );
  }

  return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const slug = clean(req.nextUrl.searchParams.get("slug"), MAX_SLUG);
  if (!slug) return json({ ok: false, message: "A slug is required." }, 400);

  const sb = serviceClient();
  if (!sb) return json({ ok: true, mode: "demo", slug, clicks: 0, clicks7d: 0, visitors: 0, lastAt: null });

  const { data, error } = await sb
    .from("link_click_totals")
    .select("clicks, clicks_7d, visitors, last_click_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[api/click] read failed:", error.message);
    // A missing view (DB not migrated yet) must not break the profile page.
    return json({ ok: true, mode: "unavailable", slug, clicks: 0, clicks7d: 0, visitors: 0, lastAt: null });
  }

  return json(
    {
      ok: true,
      mode: "live",
      slug,
      clicks: Number(data?.clicks ?? 0),
      clicks7d: Number(data?.clicks_7d ?? 0),
      visitors: Number(data?.visitors ?? 0),
      lastAt: data?.last_click_at ?? null,
    },
    200,
    "public, s-maxage=15, stale-while-revalidate=45",
  );
}

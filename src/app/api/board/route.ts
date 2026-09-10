import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/supabase";
import { buildSnapshot } from "@/lib/server/board";

export const dynamic = "force-dynamic";

/** GET /api/board → the shared map state (or {mode:"demo"} when unconfigured). */
export async function GET() {
  const sb = serviceClient();
  if (!sb) {
    return NextResponse.json(
      { mode: "demo" },
      { headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const snapshot = await buildSnapshot(sb);
    return NextResponse.json(snapshot, {
      headers: { "cache-control": "public, s-maxage=5, stale-while-revalidate=25" },
    });
  } catch (e) {
    console.error("[api/board] read failed:", e);
    return NextResponse.json(
      { mode: "demo", error: e instanceof Error ? e.message : "board_unavailable" },
      { headers: { "cache-control": "no-store" } },
    );
  }
}

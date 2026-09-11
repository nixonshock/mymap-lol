import type { Metadata } from "next";
import PinProfile from "@/components/PinProfile";

export const metadata: Metadata = {
  title: "Listing — mymap.lol",
  description: "A listing on mymap.lol: what it holds on the Malaysia map and what it has staked.",
};

/**
 * /pin/<slug> — the public page for one listing (slug = "acme.com" or
 * "x.com/handle"). The board lives in the client store, so the profile is
 * rendered client-side from the same snapshot every panel reads.
 */
export default async function PinPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  // Social slugs carry an "@" (x.com/@handle) — the router hands segments back
  // percent-encoded, so decode before matching against the board.
  const parts = (slug ?? []).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  return <PinProfile slug={parts.join("/")} />;
}

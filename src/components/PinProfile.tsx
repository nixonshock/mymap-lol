"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { pinSnapshot, startBoardSync, subscribe, type PinProfile as PinProfileData } from "@/lib/store";
import { PRICING, money, moneyBoth } from "@/lib/states";
import { LinkPreviewCard } from "@/components/LinkPreview";
import { linkLabel, outboundHref, pinHref } from "@/lib/links";

/**
 * The public page every listing gets — worldmap.lol's `/pin/<site>` idea.
 *
 * Clicking a bidder's name anywhere on the board lands here: a link preview of
 * that listing, what it holds, and how much it has staked. The page is public
 * and standalone, so a listing can be shared on its own.
 */

const TIERS: { min: number; label: string }[] = [
  { min: 8, label: "Emperor" },
  { min: 4, label: "Warlord" },
  { min: 2, label: "Conqueror" },
  { min: 1, label: "Sovereign" },
];

const tierFor = (territories: number) =>
  TIERS.find((t) => territories >= t.min)?.label ?? "Newcomer";

/** undefined = board not readable yet (server render) · null = nothing staked here */
type PinProfileValue = PinProfileData | null | undefined;

export default function PinProfile({ slug }: { slug: string }) {
  // SSR has no board → `undefined` (loading). Once hydrated the store answers
  // with the profile, or null when nothing is staked under this slug.
  const pin = useSyncExternalStore(
    subscribe,
    () => pinSnapshot(slug),
    () => undefined as PinProfileValue,
  );

  useEffect(() => {
    startBoardSync();
  }, []);

  if (pin === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-[13px] font-semibold text-[#8494ab]">Loading…</p>
      </main>
    );
  }

  if (pin === null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-5 py-6">
        <TopBar />
        <div className="rounded-[22px] bg-white p-8 text-center shadow-[0_18px_50px_-18px_rgba(31,43,62,0.35)] ring-1 ring-[#e5edf5]">
          <div className="text-3xl">🗺️</div>
          <h1 className="font-display mt-2 text-[22px] font-bold text-[#3a2418]">Not on the map yet</h1>
          <p className="mx-auto mt-2 max-w-[42ch] text-[13px] font-semibold leading-relaxed text-[#8494ab]">
            Nothing has been staked under <span className="text-[#1f2b3e]">{slug}</span> on this board.
          </p>
          <Link
            href="/"
            className="font-display mt-4 inline-block rounded-2xl bg-[#ffc93c] px-5 py-2.5 text-[14px] font-semibold text-[#4a3400] transition hover:brightness-95"
          >
            Back to the map
          </Link>
        </div>
      </main>
    );
  }

  const link = outboundHref(pin.link);
  const site = linkLabel(pin.link);
  const states = pin.territories.filter((t) => t.kind === "state");
  const cities = pin.territories.filter((t) => t.kind === "city");
  const firstClaim = [...pin.territories].sort((a, b) => b.rank - a.rank).find((t) => t.rank === 1);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6">
      <TopBar />

      {/* badge */}
      <div className="mt-6 text-center">
        <div className="text-[11px] font-extrabold uppercase tracking-[2.2px] text-[#b8860b]">
          ✦ officially on the malaysia map ✦
        </div>
        <h1 className="font-display mt-2 text-[28px] font-bold leading-tight text-[#3a2418]">
          {pin.orgName} is on the map
        </h1>
        <div className="mt-1.5 text-[12.5px] font-extrabold uppercase tracking-[1.2px] text-[#8494ab]">
          {tierFor(pin.territories.length)} · {pin.territories.length}{" "}
          {pin.territories.length === 1 ? "territory" : "territories"} held
        </div>
      </div>

      {/* the listing, unfurled */}
      <div className="mt-5">
        <LinkPreviewCard link={pin.link} name={pin.orgName} pitch={pin.pitch} />
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-display mt-3 block w-full rounded-2xl bg-[#ffc93c] py-3 text-center text-[15px] font-semibold text-[#4a3400] transition hover:brightness-95"
          >
            Visit site ↗
          </a>
        )}
      </div>

      {/* badges */}
      <div className="mt-4 flex flex-wrap gap-2">
        {pin.crowns > 0 && <Badge emoji="👑" text={`${pin.crowns} ${pin.crowns === 1 ? "crown" : "crowns"}`} />}
        {firstClaim && <Badge emoji="🚩" text={`First to claim ${firstClaim.name}`} />}
        <Badge
          emoji="🌍"
          text={`Present in ${pin.territories.length} ${pin.territories.length === 1 ? "place" : "places"}`}
        />
        <Badge emoji="💰" text={`${moneyBoth(pin.total)} staked`} />
      </div>

      {/* numbers */}
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <Stat value={states.length} label={states.length === 1 ? "state" : "states"} />
        <Stat value={pin.crowns} label="#1 spots" />
        <Stat value={pin.placements} label={pin.placements === 1 ? "placement" : "placements"} />
      </div>

      {/* territories */}
      <section className="mt-6">
        <h2 className="text-[12px] font-extrabold uppercase tracking-[1.4px] text-[#b8860b]">Territories held</h2>
        <ol className="mt-2 space-y-1.5">
          {pin.territories.map((t) => (
            <li
              key={`${t.kind}-${t.code}`}
              className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 ${
                t.rank === 1 ? "bg-[#fff7e0] ring-1 ring-[#ffe3a1]" : "bg-[#f2f7fc]"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[13.5px] font-bold text-[#1f2b3e]">
                  <span className="truncate">
                    {t.kind === "city" ? `🏙️ ${t.name}` : `🚩 ${t.name}`}
                  </span>
                  {t.rank === 1 && <span aria-label="top holder">👑</span>}
                </div>
                <div className="truncate text-[11px] font-semibold text-[#8494ab]">
                  {t.sub ? `${t.sub} · ` : ""}
                  {t.claims} {t.claims === 1 ? "bidding" : "biddings"}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[13px] font-extrabold tabular-nums text-[#1f7a55]">{money(t.total)}</div>
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-[#8494ab]">
                  {t.rank === 1 ? "#1" : `#${t.rank}`}
                </div>
              </div>
            </li>
          ))}
        </ol>
        {cities.length > 0 && (
          <p className="mt-2 text-[11px] font-semibold text-[#8494ab]">
            City stakes stay on the city — they never claim the state around it.
          </p>
        )}
        {site && (
          <p className="mt-2 text-[11px] font-semibold text-[#8494ab]">
            Listing: <span className="text-[#1f7a55]">{site}</span>
          </p>
        )}
      </section>

      {/* CTA */}
      <section className="mt-6 rounded-[22px] bg-white p-5 text-center shadow-[0_18px_50px_-18px_rgba(31,43,62,0.35)] ring-1 ring-[#e5edf5]">
        <h2 className="font-display text-[18px] font-bold text-[#3a2418]">Start your own empire</h2>
        <p className="mt-1 text-[12.5px] font-semibold text-[#8494ab]">
          Claim any open state — from {moneyBoth(PRICING.minClaim)}.
        </p>
        <Link
          href="/"
          className="font-display mt-3 inline-block rounded-2xl bg-[#ffc93c] px-6 py-2.5 text-[14px] font-semibold text-[#4a3400] transition hover:brightness-95"
        >
          Claim →
        </Link>
      </section>

      <p className="mt-4 pb-6 text-center text-[11px] font-semibold leading-relaxed text-[#b0bed0]">
        Public page · standings are live. Anyone can list any link — a listing doesn&apos;t imply the
        company added it.
        {pin.link ? (
          <>
            {" "}
            <Link href={pinHref(pin.orgName, pin.link)} className="underline decoration-dotted underline-offset-2">
              permalink
            </Link>
          </>
        ) : null}
      </p>
    </main>
  );
}

function TopBar() {
  return (
    <div className="flex items-center justify-between">
      <Link
        href="/"
        className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-extrabold text-[#3a4a5e] shadow ring-1 ring-[#e5edf5] transition hover:bg-[#e6eef7]"
      >
        ← the malaysia map
      </Link>
      <Link href="/" className="font-display text-[17px] font-bold tracking-tight text-[#1f2b3e]">
        mymap.lol
      </Link>
    </div>
  );
}

function Badge({ emoji, text }: { emoji: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11.5px] font-extrabold text-[#3a4a5e] ring-1 ring-[#e5edf5]">
      <span aria-hidden>{emoji}</span>
      {text}
    </span>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-3 text-center ring-1 ring-[#e5edf5]">
      <div className="font-display text-[20px] font-bold leading-none text-[#1f2b3e]">{value}</div>
      <div className="mt-1 text-[10.5px] font-extrabold uppercase tracking-wide text-[#8494ab]">{label}</div>
    </div>
  );
}

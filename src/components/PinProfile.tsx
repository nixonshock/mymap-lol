"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  cityLeaderboard,
  getVersion,
  pinSnapshot,
  startBoardSync,
  stateLeaderboard,
  subscribe,
  type PinProfile as PinProfileData,
  type PinTerritory,
} from "@/lib/store";
import { stateHue } from "@/lib/geo";
import { PRICING, STATES, money, moneyBoth } from "@/lib/states";
import { iconUrl, linkLabel, outboundHref, pinHref } from "@/lib/links";
import { Favicon, useLinkPreview } from "@/components/LinkPreview";
import { PinMap, StateShape } from "@/components/PinMap";

/**
 * The public page every listing gets — worldmap.lol's `/pin/<site>`.
 *
 * Clicking a bidder's name anywhere on the board lands here: a ticket that says
 * the listing is on the map, the map itself with the held states picked out
 * (beside the profile card), every territory held with its live standings, and
 * the way in for a visitor who wants one too. Public and standalone, so a
 * listing can be shared on its own.
 */

const TIERS: { min: number; label: string }[] = [
  { min: 8, label: "Emperor" },
  { min: 4, label: "Warlord" },
  { min: 2, label: "Conqueror" },
  { min: 1, label: "Sovereign" },
];

const tierFor = (territories: number) =>
  TIERS.find((t) => territories >= t.min)?.label ?? "Newcomer";

/** A territory's own hue (a city borrows the hue of the state it sits in). */
const hueOf = (t: PinTerritory) => {
  if (t.kind === "state") return stateHue(t.code);
  return stateHue(STATES.find((s) => s.name === t.sub)?.code ?? STATES[0].code);
};
const barColor = (t: PinTerritory) => `hsl(${hueOf(t)} 62% 66%)`;
const shapeFill = (t: PinTerritory) => `hsl(${hueOf(t)} 55% 88%)`;
const shapeStroke = (t: PinTerritory) => `hsl(${hueOf(t)} 55% 46%)`;
const accentOf = (t: PinTerritory) => `hsl(${hueOf(t)} 78% 82%)`;

/** undefined = board not readable yet (server render) · null = nothing staked here */
type PinProfileValue = PinProfileData | null | undefined;

const GOLD_PILL =
  "inline-flex items-center gap-1.5 rounded-full bg-[linear-gradient(90deg,#FFF1C9,#FFE39B)] px-3 py-1.5 text-[11px] font-extrabold text-[#5a4a2a] shadow-[inset_0_0_0_1px_rgba(232,172,18,0.35)] md:text-[12px]";

export default function PinProfile({ slug }: { slug: string }) {
  // SSR has no board → `undefined` (loading). Once hydrated the store answers
  // with the profile, or null when nothing is staked under this slug.
  const pin = useSyncExternalStore(
    subscribe,
    () => pinSnapshot(slug),
    () => undefined as PinProfileValue,
  );
  // The standings under each held territory re-read whenever the poll lands.
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const { data: preview } = useLinkPreview(pin?.link);

  useEffect(() => {
    startBoardSync();
  }, []);

  const boards = useMemo(
    () =>
      (pin?.territories ?? []).map((t) => ({
        t,
        lb: t.kind === "city" ? cityLeaderboard(t.code) : stateLeaderboard(t.code),
      })),
    [pin, version],
  );

  if (pin === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-[13px] font-semibold text-[#8494ab]">Loading…</p>
      </main>
    );
  }

  if (pin === null) {
    return (
      <Page>
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
      </Page>
    );
  }

  const link = outboundHref(pin.link);
  const site = linkLabel(pin.link);
  const n = pin.territories.length;
  const here = pinHref(pin.orgName, pin.link);
  const top = pin.territories.find((t) => t.rank === 1) ?? pin.territories[0];
  const bio = preview?.description || pin.pitch || "";
  const heldCodes = pin.territories.filter((t) => t.kind === "state").map((t) => t.code);

  const badges = [
    ...pin.territories.slice(0, 3).map((t) => ({
      ico: t.rank === 1 ? "👑" : `#${t.rank}`,
      text: t.rank === 1 ? `Rules ${t.name}` : `on ${t.name}`,
    })),
    ...(n > 3 ? [{ ico: "✚", text: `${n - 3} more` }] : []),
    { ico: "💰", text: `${moneyBoth(pin.total)} staked` },
  ];

  const stats = [
    { value: String(n), label: n === 1 ? "territory" : "territories" },
    { value: String(pin.crowns), label: "👑 #1 spots" },
    { value: String(pin.placements), label: pin.placements === 1 ? "placement" : "placements" },
    { value: money(pin.total), label: "staked" },
  ];

  return (
    <Page>
      <TopBar />

      {/* the ticket — you are officially on the map */}
      <div className="flex items-stretch overflow-hidden rounded-[18px] bg-[linear-gradient(120deg,#FFE9A6,#FFC93C)] shadow-[0_14px_34px_rgba(232,172,18,0.3)]">
        <div className="relative flex flex-col items-center justify-center gap-1.5 border-r-2 border-dashed border-[rgba(122,80,0,0.45)] bg-white/30 px-3.5 py-3 md:px-5 md:py-4">
          <span className="text-[22px] leading-none md:text-[26px]">🇲🇾</span>
          <span className="font-display whitespace-nowrap text-[12.5px] font-bold text-[#5a3d00]">
            mymap<b className="text-[#8a2b00]">.lol</b>
          </span>
          {/* the ticket's punch holes */}
          <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-[#e9f2fb]" aria-hidden />
          <span className="absolute -right-2 -bottom-2 h-4 w-4 rounded-full bg-[#e9f2fb]" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center px-3.5 py-3 md:px-5 md:py-4">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[#9a6200]">
            ✦ officially on the malaysia map ✦
          </div>
          <h1 className="font-display mt-1 text-[clamp(19px,3.4vw,27px)] font-bold leading-[1.06] break-words text-[#3a2400]">
            {pin.orgName} is on the map
          </h1>
          <div className="mt-1 text-[12.5px] font-extrabold text-[#7a5200]">
            {tierFor(n)} · {n} {n === 1 ? "territory" : "territories"} conquered
          </div>
        </div>
      </div>

      {/* the map, and the listing that holds part of it */}
      <div className="mt-1 grid gap-4 md:grid-cols-2 md:items-stretch">
        <div className="relative min-h-[300px] overflow-hidden rounded-[26px] bg-[linear-gradient(180deg,#0b1622,#20415c)] shadow-[0_20px_50px_rgba(45,80,130,0.16)] md:min-h-[340px]">
          <PinMap held={heldCodes} />
          <div className="font-display absolute bottom-3.5 left-3.5 z-[2] flex items-center gap-1.5 rounded-full bg-[rgba(10,20,32,0.55)] px-3.5 py-2 text-[12px] font-semibold text-white backdrop-blur-[8px] md:text-[13px]">
            <b className="font-bold text-[#ffc93c]">{n}</b>
            {n === 1 ? "territory" : "territories"} conquered
          </div>
        </div>

        <section className="relative overflow-hidden rounded-[26px] bg-white shadow-[0_20px_50px_rgba(45,80,130,0.16)]">
          <div className="flex items-center justify-between gap-3 px-[18px] pt-[18px] md:px-[22px] md:pt-[22px]">
            <span className="flex h-[62px] w-[62px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] border-4 border-white bg-[#f2f7fc] text-[22px] font-extrabold text-[#8494ab] shadow-[0_10px_24px_rgba(45,80,130,0.2)] md:h-[88px] md:w-[88px] md:rounded-[22px] md:text-[30px]">
              <Avatar link={pin.link} name={pin.orgName} />
            </span>
            <span
              className="font-display inline-flex items-center gap-1.5 rounded-full px-[13px] py-1.5 text-[12px] font-bold text-[#3a2f0c] shadow-[0_6px_16px_rgba(0,0,0,0.12)] md:px-[15px] md:py-2 md:text-[13.5px]"
              style={{ background: top ? accentOf(top) : "#FFD98E" }}
            >
              {pin.crowns > 0 ? "👑" : "🚩"} {tierFor(n)}
            </span>
          </div>

          <div className="flex flex-col gap-3 px-[18px] pt-3 pb-1 md:px-6 md:pt-3.5">
            {preview?.image && <Thumb src={preview.image} />}
            <div className="min-w-0">
              <h2 className="font-display text-[clamp(20px,7vw,26px)] font-bold leading-[1.05] break-words text-[#1f2b3e] md:text-[clamp(24px,5vw,34px)]">
                {pin.orgName}
              </h2>
              {bio && (
                <p className="mt-1.5 line-clamp-3 max-w-[52ch] text-[13px] font-bold leading-relaxed text-[#8494ab] md:text-[14px]">
                  {bio}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-[7px]">
                {badges.map((b) => (
                  <span key={`${b.ico}-${b.text}`} className={GOLD_PILL}>
                    <span aria-hidden>{b.ico}</span>
                    {b.text}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3.5">
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display inline-flex items-center gap-1.5 rounded-full bg-[#1f2b3e] px-5 py-3 text-[15px] font-semibold text-white shadow-[0_8px_22px_rgba(31,43,62,0.28)] transition hover:-translate-y-0.5"
                  >
                    Visit site <span className="text-[17px] font-black">↗</span>
                  </a>
                )}
                {site && <span className="min-w-0 truncate text-[12.5px] font-bold text-[#9aa6b6]">{site}</span>}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-px border-t border-[#e5edf5] bg-[#e5edf5]">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col gap-1 bg-white px-1 py-3 text-center md:py-4">
                <b className="font-display text-[18px] font-bold leading-none text-[#1f2b3e] md:text-[22px]">
                  {s.value}
                </b>
                <span className="text-[9.5px] font-bold text-[#8494ab] md:text-[11px]">{s.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* every territory it holds, with the live standings under it */}
      <h2 className="font-display mt-[30px] mb-3 text-[19px] font-bold text-[#1f2b3e]">Territories held</h2>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
        {boards.map(({ t, lb }) => (
          <div
            key={`${t.kind}-${t.code}`}
            className="rounded-[18px] bg-white px-[18px] py-4 shadow-[0_10px_26px_rgba(45,80,130,0.1)]"
            style={{ borderLeft: `5px solid ${barColor(t)}` }}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-[46px] w-[56px] shrink-0 items-center justify-center rounded-[12px] bg-[#f2f7fc]">
                {t.kind === "state" ? (
                  <StateShape
                    code={t.code}
                    fill={shapeFill(t)}
                    stroke={shapeStroke(t)}
                    className="h-10 w-[46px]"
                  />
                ) : (
                  <span className="text-[24px]" aria-hidden>
                    🏙️
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-extrabold text-[#1f2b3e]">
                  {t.kind === "city" ? "🏙️" : "🚩"} {t.name}
                </span>
                <small className="mt-px block text-[11.5px] font-bold text-[#8494ab]">
                  {t.sub ? `${t.sub} · ` : ""}
                  {lb.holders.length} {lb.holders.length === 1 ? "bid" : "bids"}
                </small>
              </div>
              <span
                className={`font-display shrink-0 text-[15px] font-bold ${
                  t.rank === 1 ? "text-[#b8860b]" : "text-[#8494ab]"
                }`}
              >
                {t.rank === 1 ? "👑 #1" : `#${t.rank}`}
              </span>
            </div>

            {lb.holders.length > 0 && (
              <div className="mt-3 flex flex-col gap-0.5 border-t border-[#e5edf5] pt-2.5">
                {lb.holders.slice(0, 5).map((h, i) => {
                  const isHere = pinHref(h.orgName, h.link) === here;
                  return (
                    <Link
                      key={`${h.orgName}-${i}`}
                      href={pinHref(h.orgName, h.link)}
                      title={`${h.orgName} — listing page`}
                      className={`flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[13px] font-extrabold text-[#1f2b3e] transition ${
                        isHere
                          ? "bg-[linear-gradient(90deg,rgba(255,201,60,0.2),transparent)] shadow-[inset_2px_0_0_#e0a900]"
                          : "hover:bg-[#f2f7fc]"
                      }`}
                    >
                      <span className="font-display w-[26px] shrink-0 text-[12.5px] font-bold text-[#8494ab]">
                        {i === 0 ? "👑" : `#${i + 1}`}
                      </span>
                      <Favicon link={h.link} size={18} />
                      <span className="min-w-0 truncate">{h.orgName}</span>
                    </Link>
                  );
                })}
                {lb.holders.length > 5 && (
                  <span className="px-2 text-center text-[12px] font-extrabold tracking-[2px] text-[#c4cfdd]">
                    · · ·
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* the way in for a visitor */}
      <Link
        href="/"
        className="mt-3.5 flex items-center justify-between gap-3.5 rounded-[18px] bg-[linear-gradient(120deg,#FFF2CC,#FFE49B)] px-[22px] py-[18px] shadow-[0_10px_26px_rgba(232,172,18,0.22)]"
      >
        <div>
          <b className="font-display text-[17px] font-bold text-[#1f2b3e]">Start your own empire</b>
          <p className="mt-0.5 text-[12.5px] font-bold text-[#8a6508]">
            Grab any open state — from {moneyBoth(PRICING.minClaim)}.
          </p>
        </div>
        <span className="font-display shrink-0 text-[15px] font-bold text-[#8a6508]">Claim →</span>
      </Link>

      <p className="mt-[26px] pb-2 text-center text-[11.5px] font-bold leading-relaxed text-[#8a8a92]">
        Public page · standings are live. Anyone can list any link — a listing doesn&apos;t imply the
        company added it.
        {pin.link ? (
          <>
            {" "}
            <Link href={pinHref(pin.orgName, pin.link)} className="text-[#b8860b] underline decoration-dotted underline-offset-2">
              permalink
            </Link>
          </>
        ) : null}
      </p>
    </Page>
  );
}

/** The page's own background + measure (worldmap.lol's profile shell). */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="min-h-dvh"
      style={{ background: "radial-gradient(120% 80% at 50% 0, #E7F1FB, var(--bg) 55%)" }}
    >
      <div className="mx-auto w-full max-w-[860px] px-3 pb-16 md:px-4">{children}</div>
    </main>
  );
}

function TopBar() {
  return (
    <div className="flex items-center justify-between py-5">
      <Link
        href="/"
        className="font-display text-[14px] font-semibold text-[#8494ab] transition hover:text-[#1f2b3e]"
      >
        ← the malaysia map
      </Link>
      <Link href="/" className="font-display text-[18px] font-bold tracking-tight text-[#1f2b3e]">
        mymap<span className="text-[#b8860b]">.lol</span>
      </Link>
    </div>
  );
}

/** The listing's site icon, falling back to its initial. */
function Avatar({ link, name }: { link?: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  const src = iconUrl(link);
  if (!src || broken) return <>{name.replace(/^@/, "").slice(0, 1).toUpperCase()}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setBroken(true)} className="h-full w-full object-cover" />
  );
}

/** The listing's own image, when its page has one. */
function Thumb({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <span className="block overflow-hidden rounded-[14px] bg-[#EAF1F8] shadow-[0_8px_20px_rgba(45,80,130,0.14)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onError={() => setBroken(true)}
        className="block w-full object-cover"
        style={{ aspectRatio: "16 / 10" }}
      />
    </span>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Favicon, useLinkPreview } from "@/components/LinkPreview";
import { linkLabel, outboundHref, pinHref } from "@/lib/links";
import { money } from "@/lib/states";

/**
 * The owner behind a name, as a floating preview card.
 *
 * worldmap.lol shows one when you hover a bidder in its leaderboard; this is the
 * same idea in mymap.lol's palette. Rows wrap their name in `<OwnerHover>` and
 * the card is portalled to the body and positioned next to the row (right of it
 * when there's room, otherwise on its left), so it works in either rail and on
 * top of the stake dialog.
 *
 * The card carries what we know about the holder (name, pitch, where they hold
 * it, what they staked) plus the unfurled link preview from `/api/preview` — and
 * a link to their `/pin/<slug>` listing, which is the whole point of hovering.
 */

export interface OwnerPreviewData {
  orgName: string;
  pitch?: string;
  link?: string | null;
  total?: number;
  claims?: number;
  /** the state or city they hold it on */
  where?: string;
  rank?: number;
  /** overrides the staked line (used by the live-activity rows) */
  stat?: string;
}

const CARD_W = 300;
const OPEN_DELAY = 170;
const CLOSE_DELAY = 150;
/** Rough card height, only used to keep it inside the viewport. */
const CARD_H = 300;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * The card's contents, without positioning — shared by the hover card and by the
 * map's city tooltip.
 */
export function OwnerCardContent({ data }: { data: OwnerPreviewData }) {
  const { data: preview } = useLinkPreview(data.link);
  const [imageBroken, setImageBroken] = useState(false);

  const host = linkLabel(data.link);
  const href = outboundHref(data.link);
  const description = data.pitch || preview?.description || "";
  const extra = data.pitch && preview?.description && preview.description !== data.pitch ? preview.description : "";

  return (
    <>
      <div className="bg-[#1f2b3e] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-[11px] font-extrabold text-white/85">
            {data.link ? <Favicon link={data.link} size={14} /> : data.orgName.replace(/^@/, "").slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-white">{data.orgName}</span>
          {data.rank === 1 && <span aria-label="top holder">👑</span>}
        </div>
        {data.where && (
          <div className="mt-1 truncate text-[10px] font-extrabold uppercase tracking-[1.2px] text-white/55">
            {data.rank ? `#${data.rank} on ` : ""}
            {data.where}
          </div>
        )}
      </div>

      {preview?.image && !imageBroken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image}
          alt=""
          onError={() => setImageBroken(true)}
          className="h-[104px] w-full object-cover"
        />
      )}

      <div className="px-3.5 py-3">
        {description && (
          <p className="line-clamp-2 text-[12px] font-semibold leading-relaxed text-[#1f2b3e]">{description}</p>
        )}
        {extra && (
          <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-relaxed text-[#8494ab]">{extra}</p>
        )}
        {host && (
          <a
            href={href ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1.5 text-[11.5px] font-bold text-[#166d4a] transition hover:text-[#0f5c3c]"
          >
            <span aria-hidden>🔗</span>
            <span className="truncate">{host}</span>
          </a>
        )}

        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[#eef3f9] pt-2.5">
          <span className="min-w-0 truncate text-[11px] font-bold tabular-nums text-[#1f7a55]">
            {data.stat ??
              (typeof data.total === "number"
                ? `${money(data.total)} staked${data.claims ? ` · ${data.claims} claim${data.claims === 1 ? "" : "s"}` : ""}`
                : "no stake yet")}
          </span>
          <Link
            href={pinHref(data.orgName, data.link)}
            className="shrink-0 text-[11.5px] font-extrabold text-[#b8860b] transition hover:text-[#8a6508]"
          >
            View profile →
          </Link>
        </div>
      </div>
    </>
  );
}

function OwnerCard({
  data,
  pos,
  onEnter,
  onLeave,
}: {
  data: OwnerPreviewData;
  pos: { top: number; left: number };
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      style={{ top: pos.top, left: pos.left, width: CARD_W }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="pointer-events-auto fixed z-[80] overflow-hidden rounded-2xl bg-white text-left shadow-[0_18px_50px_-10px_rgba(31,43,62,0.45)] ring-1 ring-[#dfe7f0]"
      role="tooltip"
    >
      <OwnerCardContent data={data} />
    </div>
  );
}

/**
 * Wrap a name so hovering (or focusing) it previews the owner.
 *
 * Pass an object, or a getter when the data is worth computing only on hover —
 * and `null`/`false` when there is no owner behind the element yet.
 */
export function OwnerHover({
  owner,
  children,
  className = "inline-flex min-w-0 max-w-full align-baseline",
}: {
  owner: OwnerPreviewData | null | (() => OwnerPreviewData | null);
  children: ReactNode;
  /** lets a caller make the hover target a whole row instead of an inline name */
  className?: string;
}) {
  const anchor = useRef<HTMLSpanElement | null>(null);
  const [data, setData] = useState<OwnerPreviewData | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (openTimer.current) window.clearTimeout(openTimer.current);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const cancelClose = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  const place = useCallback(() => {
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = r.right + 12 + CARD_W <= window.innerWidth ? r.right + 12 : Math.max(8, r.left - CARD_W - 12);
    setPos({ left, top: clamp(r.top - 10, 8, Math.max(8, window.innerHeight - CARD_H - 8)) });
  }, []);

  const show = useCallback(() => {
    cancelClose();
    if (openTimer.current) window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => {
      const next = typeof owner === "function" ? owner() : owner;
      if (!next) return;
      place();
      setData(next);
    }, OPEN_DELAY);
  }, [owner, place, cancelClose]);

  const hide = useCallback(() => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    closeTimer.current = window.setTimeout(() => setData(null), CLOSE_DELAY);
  }, []);

  // A moving page would leave the card behind — drop it instead.
  useEffect(() => {
    if (!data) return;
    const close = () => setData(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setData(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [data]);

  return (
    <>
      <span
        ref={anchor}
        className={className}
        onPointerEnter={(e) => {
          // A finger is not a hover: on touch the row's own tap is the way in, and
          // a tap would otherwise flash the card open just before navigating.
          if (e.pointerType === "touch") return;
          show();
        }}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {data && pos && typeof document !== "undefined"
        ? createPortal(
            <OwnerCard data={data} pos={pos} onEnter={cancelClose} onLeave={hide} />,
            document.body,
          )
        : null}
    </>
  );
}

export default OwnerHover;

"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  subscribe,
  getVersion,
  minimumToOvertake,
  stateLeaderboard,
  worldOrder,
} from "@/lib/store";
import OwnerHover from "@/components/OwnerPreview";
import { pinHref } from "@/lib/links";
import { PRICING, money, moneyBoth } from "@/lib/states";
import type { HolderRow } from "@/lib/types";

/**
 * The board under the map.
 *
 * Two views in one panel:
 *   • nothing selected — the TOP 10 · MOST SPENT ranking of states, each row
 *     naming its #1 bidder (the fastest read of "who owns Malaysia");
 *   • a state selected — every bid on that state, ranked, with a
 *     "Claim a spot — for $X" button into the bidding window.
 *
 * Selecting never spends money: the panel is where visitors browse bidders
 * (worldmap.lol's claimed-territory panel does the same), and the CTA is the
 * only way into the stake dialog from here.
 */

interface Props {
  /** state code whose bids to list; null/undefined = the top-10 board */
  code?: string | null;
  /** a state row was clicked → show its bids */
  onSelect: (code: string) => void;
  /** the CTA → open the bidding window for that state */
  onClaim: (code: string) => void;
  /** back to the top-10 board */
  onBack: () => void;
  onClose?: () => void;
}

export default function WorldOrder({ code, onSelect, onClaim, onBack, onClose }: Props) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const list = useMemo(() => worldOrder(10), [version]);
  const [expanded, setExpanded] = useState(false);

  const board = useMemo(() => (code ? stateLeaderboard(code) : null), [code, version]);
  /** what it costs this visitor to take #1 here (the $10 floor when empty) */
  const claimAmount = useMemo(() => (board ? minimumToOvertake(board, "") : PRICING.minClaim), [board]);

  // Escape collapses the expanded board.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const collapse = () => setExpanded(false);

  /** One bidder row: rank, name (hover = owner preview, click = their listing), pitch, staked. */
  const bidRow = (h: HolderRow, rank: number, where: string, onPick?: () => void) => {
    const top = rank === 1;
    return (
      <div
        key={`${where}:${h.orgName}`}
        role={onPick ? "button" : undefined}
        tabIndex={onPick ? 0 : undefined}
        aria-label={onPick ? `Claim a spot on ${where}` : undefined}
        onClick={onPick}
        onKeyDown={
          onPick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  collapse();
                  onPick();
                }
              }
            : undefined
        }
        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
          top ? "bg-[#fff7e0] ring-1 ring-[#ffe3a1]" : "bg-[#f2f7fc] " + (onPick ? "hover:bg-[#e9f1f9]" : "")
        }`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            top ? "bg-[#ffc93c] text-[#4a3400]" : "bg-white text-[#8494ab] ring-1 ring-[#e5edf5]"
          }`}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate text-[13px] font-bold text-[#1f2b3e]">
            <OwnerHover
              owner={{
                orgName: h.orgName,
                pitch: h.pitch,
                link: h.link,
                total: h.total,
                claims: h.claims,
                where,
                rank,
              }}
            >
              <Link
                href={pinHref(h.orgName, h.link)}
                onClick={(e) => e.stopPropagation()}
                title={`${h.orgName} — listing page`}
                className="truncate font-bold text-[#166d4a] underline decoration-[#9fd0b9] underline-offset-2 transition hover:text-[#0f5c3c]"
              >
                {h.orgName}
              </Link>
            </OwnerHover>
            {top && <span aria-label="top holder">👑</span>}
          </div>
          <div className="truncate text-[11px] font-semibold text-[#8494ab]">
            {[h.pitch, h.link ? h.link.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : null]
              .filter(Boolean)
              .join(" · ") || "no pitch yet"}
          </div>
        </div>
        <div className="shrink-0 text-[13px] font-extrabold tabular-nums text-[#1f7a55]">{money(h.total)}</div>
      </div>
    );
  };

  const body = (
    <>
      {/* header */}
      <div className="flex items-start justify-between gap-2 px-6 pt-5">
        <div className="min-w-0">
          <div className="text-[11px] font-extrabold uppercase tracking-[1.54px] text-[#8494ab]">
            the malaysia map · live
          </div>

          {board ? (
            <>
              <button
                type="button"
                onClick={onBack}
                className="mt-1.5 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wide text-[#3f7dd6] transition hover:text-[#2f63ad]"
              >
                ← Top 10 board
              </button>
              <div className="font-display mt-1 truncate text-[21px] font-bold leading-none text-[#3a2418]">
                {board.name}
              </div>
              <div className="mt-1.5 text-[11.5px] font-bold text-[#8494ab]">
                {board.holders.length === 1 ? "1 bid" : `${board.holders.length} bids`} ·{" "}
                {money(board.totalStake)} staked
                {board.isEmpty ? "" : ` · #1 pays ${money(board.holders[0]?.total ?? 0)}`}
              </div>
            </>
          ) : (
            <div className="mt-2 text-[12px] font-extrabold tracking-wide text-[#b8860b]">
              TOP 10 · MOST SPENT
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2f7fc] text-[14px] font-bold text-[#3a4a5e] ring-1 ring-[#e5edf5] transition hover:bg-[#e6eef7]"
          >
            {expanded ? "⤡" : "⤢"}
          </button>
          {onClose && !expanded && (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef3f9] text-[14px] text-[#8494ab] ring-1 ring-[#e5edf5] transition hover:bg-[#e6eef7]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* list */}
      <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto px-4 pb-4">
        {board ? (
          board.holders.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="text-2xl">🚩</div>
              <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#8494ab]">
                No bids on {board.name} yet — be the first and hold #1 outright.
              </p>
            </div>
          ) : (
            board.holders.map((h, i) => bidRow(h, i + 1, board.name, () => onClaim(board.code)))
          )
        ) : list.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="text-2xl">🛰️</div>
            <p className="mt-2 text-[13px] font-semibold text-[#8494ab]">
              No stakes yet. Claim the first state and start the leaderboard.
            </p>
          </div>
        ) : (
          list.map((s, i) => {
            const top = i === 0;
            return (
              <div
                key={s.code}
                role="button"
                tabIndex={0}
                aria-label={`See the bids on ${s.name}`}
                onClick={() => {
                  collapse();
                  onSelect(s.code);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    collapse();
                    onSelect(s.code);
                  }
                }}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${
                  top ? "bg-[#fff7e0] ring-1 ring-[#ffe3a1]" : "bg-[#f2f7fc] hover:bg-[#e9f1f9]"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                    top ? "bg-[#ffc93c] text-[#4a3400]" : "bg-white text-[#8494ab] ring-1 ring-[#e5edf5]"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-[14px] font-bold text-[#1f2b3e]">
                    {s.name}
                    {top && <span aria-label="top state">👑</span>}
                  </div>
                  <div className="truncate text-[11px] font-semibold text-[#8494ab]">
                    {s.leader ? (
                      <>
                        {/* the bidder's name opens their listing page (link preview) */}
                        <OwnerHover
                          owner={() => {
                            const h = stateLeaderboard(s.code).holders[0];
                            return h
                              ? {
                                  orgName: h.orgName,
                                  pitch: h.pitch,
                                  link: h.link,
                                  total: h.total,
                                  claims: h.claims,
                                  where: s.name,
                                  rank: 1,
                                }
                              : null;
                          }}
                        >
                          <Link
                            href={pinHref(s.leader, s.leaderLink)}
                            onClick={(e) => e.stopPropagation()}
                            title={`${s.leader} — listing page`}
                            className="font-extrabold text-[#1f7a55] underline decoration-[#9fd0b9] underline-offset-2 transition hover:text-[#0f5c3c]"
                          >
                            {s.leader}
                          </Link>
                        </OwnerHover>
                        <span className="text-[#b0bed0]"> · </span>
                      </>
                    ) : null}
                    {s.count} claim{s.count === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="shrink-0 text-[14px] font-extrabold tabular-nums text-[#1f7a55]">
                  {money(s.total)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* footer */}
      {board ? (
        <div className="border-t border-[#eef3f9] px-5 pb-4 pt-3.5">
          <button
            type="button"
            onClick={() => {
              collapse();
              onClaim(board.code);
            }}
            className="font-display w-full rounded-2xl bg-[#ffc93c] py-3 text-center text-[15px] font-semibold text-[#4a3400] transition hover:brightness-95"
          >
            Claim a spot — for {moneyBoth(claimAmount)}
          </button>
          <p className="mt-2 text-center text-[10.5px] font-semibold text-[#b0bed0]">
            rank is your total stake · top up to climb
          </p>
        </div>
      ) : (
        <div className="border-t border-[#eef3f9] px-6 py-3 text-center text-[11px] font-semibold text-[#8494ab]">
          total staked across every state · click one to see its bids
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="pointer-events-auto flex h-full flex-col rounded-[22px] bg-white shadow-[0_18px_50px_-18px_rgba(31,43,62,0.35)] ring-1 ring-[#e5edf5]">
        {body}
      </div>

      {/* expanded board — the ⤢ button blows the panel up to a full view.
          Bottom sheet on phones, centred card from sm up (same shell as the
          info / board / search modals). Backdrop or Escape collapses it. */}
      {expanded && (
        <div
          className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-[rgba(30,45,70,0.4)] p-0 sm:items-center sm:p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[26px] bg-white shadow-2xl sm:rounded-[26px]"
            onClick={(e) => e.stopPropagation()}
          >
            {body}
          </div>
        </div>
      )}
    </>
  );
}

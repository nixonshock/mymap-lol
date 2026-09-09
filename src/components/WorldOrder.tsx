"use client";

import { useMemo, useSyncExternalStore } from "react";
import { subscribe, getVersion, worldOrder, openStateCount } from "@/lib/store";
import { money } from "@/lib/states";

interface Props {
  onPick: (code: string) => void;
  onClose?: () => void;
}

export default function WorldOrder({ onPick, onClose }: Props) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const list = useMemo(() => worldOrder(10), [version]);
  const open = useMemo(() => openStateCount(), [version]);

  return (
    <div className="pointer-events-auto flex h-full flex-col rounded-[22px] bg-white shadow-[0_18px_50px_-18px_rgba(31,43,62,0.35)] ring-1 ring-[#e5edf5]">
      {/* header */}
      <div className="flex items-start justify-between px-6 pt-5">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[1.54px] text-[#8494ab]">
            the malaysia map · live
          </div>
          <h2 className="font-display mt-1 text-[31px] font-bold leading-none text-[#3a2418]">
            🇲🇾 World Order
          </h2>
          <div className="mt-2 text-[12px] font-extrabold tracking-wide text-[#b8860b]">
            TOP 10 · MOST SPENT
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Expand"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2f7fc] text-[14px] font-bold text-[#3a4a5e] ring-1 ring-[#e5edf5] transition hover:bg-[#e6eef7]"
          >
            ⤢
          </button>
          {onClose && (
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
      <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto px-4 pb-5">
        {list.length === 0 ? (
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
              <button
                key={s.code}
                type="button"
                onClick={() => onPick(s.code)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${
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
                  <div className="text-[11px] font-semibold text-[#8494ab]">
                    {s.count} claim{s.count === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="shrink-0 text-[14px] font-extrabold tabular-nums text-[#1f7a55]">
                  {money(s.total)}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* footer */}
      <div className="border-t border-[#eef3f9] px-6 py-3 text-center text-[11px] font-semibold text-[#8494ab]">
        total staked across every state · click one to stake
      </div>
    </div>
  );
}

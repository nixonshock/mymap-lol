"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { subscribe, getVersion, linkForOrg, recentClaims } from "@/lib/store";
import { pinHref } from "@/lib/links";
import { money } from "@/lib/states";
import type { StakeTarget } from "@/lib/types";

interface Props {
  onPick: (target: StakeTarget) => void;
  onClose?: () => void;
}

const fmt = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default function LiveActivity({ onPick, onClose }: Props) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const items = useMemo(() => recentClaims(6), [version]);

  return (
    <div className="pointer-events-auto flex h-full flex-col rounded-[16px] bg-white shadow-[0_18px_50px_-18px_rgba(31,43,62,0.35)] ring-1 ring-[#e5edf5]">
      <div className="flex items-center justify-between border-b border-[#eef3f9] px-5 py-3.5">
        <div className="text-[13px] font-extrabold text-[#1f2b3e]">Live activity</div>
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#eef3f9] text-[12px] text-[#8494ab] transition hover:bg-[#e6eef7]"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <div className="text-2xl">🕊️</div>
            <p className="mt-2 text-[12px] font-semibold text-[#8494ab]">
              No activity yet. Stake something to see it here.
            </p>
          </div>
        ) : (
          items.map((it, i) => {
            const target: StakeTarget = it.cityId
              ? { kind: "city", id: it.cityId, name: it.cityName || it.cityId, stateCode: it.stateCode }
              : { kind: "state", code: it.stateCode };
            return (
              <div
                key={`${it.stateCode}-${it.cityId ?? ""}-${i}`}
                role="button"
                tabIndex={0}
                aria-label={`Stake on ${it.cityName || it.stateName}`}
                onClick={() => onPick(target)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPick(target);
                  }
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-[#f2f7fc]"
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    it.cityId ? "bg-[#1f2b3e]" : "bg-[#1f7a55]"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1 truncate text-[12px] font-bold text-[#1f2b3e]">
                    <Link
                      href={pinHref(it.orgName, linkForOrg(it.orgName))}
                      onClick={(e) => e.stopPropagation()}
                      title={`${it.orgName} — listing page`}
                      className="truncate text-[#1f7a55] underline decoration-[#9fd0b9] underline-offset-2 transition hover:text-[#0f5c3c]"
                    >
                      {it.orgName}
                    </Link>
                    <span className="shrink-0 text-[#8494ab]">· {money(it.amount)}</span>
                  </div>
                  <div className="truncate text-[11px] font-semibold text-[#8494ab]">
                    {it.cityId ? `${it.cityName || it.cityId} · ${it.stateName}` : it.stateName} · {fmt(it.at)}
                  </div>
                </div>
                <span className="shrink-0 text-[12px] text-[#8494ab]">→</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

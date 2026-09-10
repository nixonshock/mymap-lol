"use client";

import { useMemo, useSyncExternalStore } from "react";
import { subscribe, getVersion, globalStats, openStateCount, isLive } from "@/lib/store";
import { PRICING, money, moneyBoth } from "@/lib/states";

export default function StatsBar() {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const stats = useMemo(() => globalStats(), [version]);
  const open = useMemo(() => openStateCount(), [version]);
  const shared = isLive();

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1.5 text-[12.5px] font-bold text-[#8494ab]">
      <div
        className="text-[10.5px] font-extrabold uppercase tracking-[1.2px]"
        title={
          shared
            ? "Everyone sees these numbers — they come from the shared board."
            : "Demo board: these numbers live in this browser only."
        }
      >
        <span className={shared ? "text-[#1f7a55]" : "text-[#b0bed0]"}>●</span>{" "}
        {shared ? "shared board" : "demo board"}
      </div>
      <div>
        <span className="mr-1">🌍</span>
        {stats.statesClaimed} states live
        {stats.citiesClaimed > 0 && <span className="text-[#1f7a55]"> · {stats.citiesClaimed} cities</span>}
      </div>
      <div>
        <span className="mr-1">💰</span>
        {money(stats.totalStaked)} in bids
      </div>
      <div className="text-[#c76a3a]">
        <span className="mr-1">🔥</span>
        {open} open · {moneyBoth(PRICING.minClaim)}
      </div>
    </div>
  );
}

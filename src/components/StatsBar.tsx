"use client";

import { useMemo, useSyncExternalStore } from "react";
import { subscribe, getVersion, globalStats, openStateCount } from "@/lib/store";
import { PRICING, money } from "@/lib/states";

export default function StatsBar() {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const stats = useMemo(() => globalStats(), [version]);
  const open = useMemo(() => openStateCount(), [version]);

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1.5 text-[12.5px] font-bold text-[#8494ab]">
      <div>
        <span className="mr-1">🌍</span>
        {stats.statesClaimed} states live
      </div>
      <div>
        <span className="mr-1">💰</span>
        {money(stats.totalStaked)} in bids
      </div>
      <div className="text-[#c76a3a]">
        <span className="mr-1">🔥</span>
        {open} open · {money(PRICING.minClaim)}
      </div>
    </div>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { subscribe, getVersion, allTotals } from "@/lib/store";
import { useMemo } from "react";
import { STATES, money } from "@/lib/states";

export default function StateChips({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const totals = useMemo(() => allTotals(), [version]);
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {STATES.map((s) => {
        const t = totals[s.code];
        const active = selected === s.code;
        return (
          <button
            key={s.code}
            onClick={() => onSelect(s.code)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
              active
                ? "bg-emerald-500 text-zinc-950"
                : t
                  ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {s.name}
            {t && <span className="ml-1.5 opacity-70">{money(t.total)}</span>}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { CITIES } from "@/lib/cities";
import { stateCodeToName } from "@/lib/states";

interface Props {
  onPick: (code: string) => void;
  onClose?: () => void;
}

/** Cities live in a list panel (not as labels on the map) so they stay legible
 *  and so new cities can be added by editing lib/cities.ts only. */
export default function CitiesPanel({ onPick, onClose }: Props) {
  const sorted = [...CITIES].sort(
    (a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name),
  );

  return (
    <div className="pointer-events-auto flex h-full w-full flex-col rounded-[22px] bg-white shadow-[0_18px_50px_-18px_rgba(31,43,62,0.35)] ring-1 ring-[#e5edf5]">
      <div className="flex items-center justify-between border-b border-[#eef3f9] px-5 py-3.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-extrabold text-[#1f2b3e]">Cities</span>
          <span className="text-[11px] font-bold text-[#8494ab]">
            {CITIES.length} on the map
          </span>
        </div>
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

      <div className="flex-1 space-y-1 overflow-y-auto p-2.5">
        {sorted.map((c) => (
          <button
            key={`${c.state}-${c.name}`}
            type="button"
            onClick={() => onPick(c.state)}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-[#f2f7fc]"
            title={`Stake on ${stateCodeToName(c.state)}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#f2a13c] ring-2 ring-white" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[#1f2b3e]">
              {c.name}
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-[#8494ab]">
              {stateCodeToName(c.state)}
            </span>
          </button>
        ))}
      </div>

      <div className="border-t border-[#eef3f9] px-5 py-3 text-center text-[11px] font-semibold text-[#8494ab]">
        click a city to stake on its state
      </div>
    </div>
  );
}

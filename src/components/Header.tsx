"use client";

import { PRICING, money } from "@/lib/states";

interface Props {
  onOpen: (key: "info" | "board" | "search") => void;
  onClaim: () => void;
}

export default function Header({ onOpen, onClaim }: Props) {
  return (
    <div className="pointer-events-auto w-[290px]">
      {/* brand pill */}
      <div className="inline-block rounded-full bg-white px-5 py-3 shadow-lg ring-1 ring-[#e5edf5]">
        <div className="font-display text-[22px] font-bold leading-tight tracking-tight text-[#1f2b3e]">
          mymap.lol
        </div>
        <div className="font-display text-[15px] font-semibold text-[#1f2b3e]">
          Own the Malaysia map. Literally.
        </div>
      </div>

      {/* CTA + icon buttons */}
      <div className="mt-3 flex items-center gap-2.5">
        <button
          type="button"
          onClick={onClaim}
          className="font-display rounded-full bg-[#ffc93c] px-4 py-2 text-[14px] font-semibold text-[#4a3400] shadow-md transition hover:brightness-95"
        >
          Claim a state · from {money(PRICING.minClaim)}
        </button>
        <button
          type="button"
          aria-label="The board"
          onClick={() => onOpen("board")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f2f7fc] text-[15px] shadow ring-1 ring-[#e5edf5] transition hover:bg-[#e6eef7]"
        >
          🏆
        </button>
        <button
          type="button"
          aria-label="How it works"
          onClick={() => onOpen("info")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f2f7fc] shadow ring-1 ring-[#e5edf5] transition hover:bg-[#e6eef7]"
        >
          <span className="font-display text-[16px] font-bold">i</span>
        </button>
        <button
          type="button"
          aria-label="Find a state"
          onClick={() => onOpen("search")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f2f7fc] text-[15px] shadow ring-1 ring-[#e5edf5] transition hover:bg-[#e6eef7]"
        >
          🔍
        </button>
      </div>
    </div>
  );
}

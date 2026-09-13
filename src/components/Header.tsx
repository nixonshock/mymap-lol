"use client";

import { PRICING, moneyBoth } from "@/lib/states";

interface Props {
  onOpen: (key: "info" | "board" | "search") => void;
  onClaim: () => void;
}

/** The 32px circular icon buttons worldmap.lol puts in its header. */
const ICON_BTN =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[15px] font-bold text-[#8494ab] ring-2 ring-[#e5edf5] ring-inset shadow-[0_6px_18px_rgba(45,80,130,0.16)] transition hover:text-[#1f2b3e] hover:ring-[#ffc93c]";

/**
 * The floating header, in worldmap.lol's compact shape: a slim brand pill
 * (with the icon buttons on the same line) over one white card that holds the
 * tagline and a full-width "Claim a state" button — instead of a fat two-line
 * pill with the icons on a third row of their own.
 */
export default function Header({ onOpen, onClaim }: Props) {
  return (
    <div className="pointer-events-auto w-[288px] max-w-full">
      {/* brand pill + the icon buttons, one line */}
      <div className="flex items-center justify-between gap-2">
        <div className="font-display rounded-full bg-white px-[18px] py-2 text-[22px] font-bold leading-tight tracking-tight text-[#1f2b3e] shadow-[0_8px_24px_rgba(45,80,130,0.12)]">
          mymap.lol
        </div>
        <div className="flex items-center gap-[7px]">
          <button
            type="button"
            aria-label="The board"
            onClick={() => onOpen("board")}
            className={ICON_BTN}
          >
            🏆
          </button>
          <button
            type="button"
            aria-label="How it works"
            onClick={() => onOpen("info")}
            className={`${ICON_BTN} font-display text-[16px]`}
          >
            i
          </button>
          <button
            type="button"
            aria-label="Find a state"
            onClick={() => onOpen("search")}
            className={ICON_BTN}
          >
            🔍
          </button>
        </div>
      </div>

      {/* tagline + the claim button, in one card */}
      <div className="mt-2.5 rounded-[18px] bg-white px-4 py-[14px] shadow-[0_8px_24px_rgba(45,80,130,0.12)]">
        <p className="font-display whitespace-nowrap text-[16px] font-bold leading-[1.15] text-[#1f2b3e]">
          Own the Malaysia map. Literally.
        </p>
        <button
          type="button"
          onClick={onClaim}
          className="font-display mt-[13px] w-full rounded-full bg-[#ffc93c] px-[18px] py-2.5 text-[14px] font-semibold text-[#4a3400] shadow-[0_3px_0_#e0a900] transition hover:-translate-y-px active:translate-y-0.5 active:shadow-none"
        >
          Claim a state · from {moneyBoth(PRICING.minClaim)}
        </button>
      </div>
    </div>
  );
}

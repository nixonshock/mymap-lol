"use client";

import { useState } from "react";
import MalaysiaMap from "@/components/MalaysiaMap";
import Header from "@/components/Header";
import StatsBar from "@/components/StatsBar";
import WorldOrder from "@/components/WorldOrder";
import LiveActivity from "@/components/LiveActivity";
import StakeModal from "@/components/StakeModal";
import { BoardModal, InfoModal, SearchModal } from "@/components/Modals";

export default function Home() {
  const [stakeCode, setStakeCode] = useState<string | null>(null);
  const [modal, setModal] = useState<"info" | "board" | "search" | null>(null);
  const [mobileOrder, setMobileOrder] = useState(false);

  return (
    <div className="map-stage">
      {/* full-bleed Malaysia map */}
      <div className="absolute inset-0">
        <MalaysiaMap selectedCode={stakeCode} onSelect={(code) => setStakeCode(code)} />
      </div>

      {/* overlay UI */}
      <div className="pointer-events-none absolute inset-0">
        {/* top-left brand + CTA + icons */}
        <div className="absolute left-4 top-4">
          <Header onOpen={setModal} onClaim={() => setModal("search")} />
        </div>

        {/* top-right stats */}
        <div className="absolute right-4 top-4">
          <StatsBar />
        </div>

        {/* sea-column HUD (desktop): the South China Sea gap between the
            peninsula and Borneo is the only land-free corridor, so the
            floating cards live there instead of on top of the states. */}
        <div
          className="pointer-events-none absolute left-[37.5%] top-4 hidden w-[320px] -translate-x-1/2 flex-col gap-3 xl:flex"
          style={{ height: "calc(100dvh - 2rem)" }}
        >
          <div className="h-[150px] shrink-0">
            <LiveActivity onPick={setStakeCode} />
          </div>
          <div className="min-h-0 flex-1">
            <WorldOrder onPick={setStakeCode} />
          </div>
        </div>

        {/* narrow screens: open World Order as a sheet */}
        <button
          type="button"
          onClick={() => setMobileOrder(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-[13px] font-bold text-[#1f2b3e] shadow-lg ring-1 ring-[#e5edf5] xl:hidden"
        >
          🇲🇾 World Order
        </button>
      </div>

      {/* World Order sheet (narrow screens) */}
      {mobileOrder && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-[rgba(30,45,70,0.4)] xl:hidden">
          <div className="h-[86dvh] w-full max-w-md rounded-t-[22px] bg-white p-3 shadow-2xl">
            <WorldOrder onPick={setStakeCode} onClose={() => setMobileOrder(false)} />
          </div>
        </div>
      )}

      {/* stakeholder / stake modal */}
      {stakeCode && <StakeModal code={stakeCode} onClose={() => setStakeCode(null)} />}

      {/* icon modals */}
      {modal === "info" && <InfoModal onClose={() => setModal(null)} />}
      {modal === "board" && <BoardModal onClose={() => setModal(null)} />}
      {modal === "search" && <SearchModal onClose={() => setModal(null)} onPick={setStakeCode} />}
    </div>
  );
}

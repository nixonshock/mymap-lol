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

        {/* right leaderboard panel (desktop) */}
        <div className="absolute right-4 top-1/2 hidden h-[max(70dvh,480px)] w-[380px] -translate-y-1/2 lg:block">
          <WorldOrder onPick={setStakeCode} />
        </div>

        {/* left live activity (desktop) */}
        <div className="absolute left-4 top-[168px] hidden h-[300px] w-[300px] lg:block">
          <LiveActivity onPick={setStakeCode} />
        </div>

        {/* mobile: open World Order */}
        <button
          type="button"
          onClick={() => setMobileOrder(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-[13px] font-bold text-[#1f2b3e] shadow-lg ring-1 ring-[#e5edf5] lg:hidden"
        >
          🇲🇾 World Order
        </button>
      </div>

      {/* mobile World Order sheet */}
      {mobileOrder && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-[rgba(30,45,70,0.4)] lg:hidden">
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

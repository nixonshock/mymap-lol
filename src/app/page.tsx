"use client";

import { useCallback, useEffect, useState } from "react";
import MalaysiaMap from "@/components/MalaysiaMap";
import Header from "@/components/Header";
import WorldOrder from "@/components/WorldOrder";
import LiveActivity from "@/components/LiveActivity";
import CitiesPanel from "@/components/CitiesPanel";
import StakeModal from "@/components/StakeModal";
import { BoardModal, InfoModal, SearchModal } from "@/components/Modals";
import PaymentCelebration from "@/components/PaymentCelebration";
import { consumePaidReturn, startBoardSync, type PaidReturn } from "@/lib/store";
import type { StakeTarget } from "@/lib/types";

/** Desktop shell: left rail (brand → live activity → world order), the map
 *  centred in its own column, right rail (stats → cities list). Below xl the
 *  rails collapse and the panels become sheets, leaving a full-bleed map.
 *  Rail width / gutter are kept in sync with the xl:left-[312px] map insets. */
export default function Home() {
  const [target, setTarget] = useState<StakeTarget | null>(null);
  const [modal, setModal] = useState<"info" | "board" | "search" | null>(null);
  const [sheet, setSheet] = useState<"order" | "cities" | null>(null);
  /** set when we just came back from a paid checkout — drives the celebration */
  const [paid, setPaid] = useState<PaidReturn | null>(null);

  // Poll the shared board (no-op while the backend is unconfigured).
  useEffect(() => {
    // Coming back from Whop: consume ?paid=… (which also mirrors the stake into
    // this browser's board while there is no database) and celebrate it.
    setPaid(consumePaidReturn());
    startBoardSync();
  }, []);

  const pickState = useCallback((code: string) => setTarget({ kind: "state", code }), []);

  return (
    <div className="map-stage">
      {/* full-bleed ocean; the map is centred in the middle column on desktop
          (left/right insets = gutter + rail width + gap) and full-bleed below xl */}
      <div className="absolute inset-0 flex items-center justify-center xl:bottom-3 xl:left-[312px] xl:right-[312px] xl:top-3">
        <MalaysiaMap selectedCode={target?.kind === "state" ? target.code : null} onSelect={pickState} />
      </div>

      {/* overlay UI */}
      <div className="pointer-events-none absolute inset-0">
        {/* left rail */}
        <div className="absolute left-4 right-4 top-4 flex flex-col gap-3 xl:bottom-3 xl:left-3 xl:right-auto xl:top-3 xl:w-[288px]">
          <Header onOpen={setModal} onClaim={() => setModal("search")} />
          <div className="hidden min-h-[140px] flex-[3] xl:block">
            <LiveActivity onPick={setTarget} />
          </div>
          <div className="hidden min-h-0 flex-[6] xl:block">
            <WorldOrder onPick={pickState} />
          </div>
        </div>

        {/* right rail */}
        <div className="absolute right-4 top-4 flex w-[calc(100%-2rem)] flex-col items-end gap-3 xl:bottom-3 xl:right-3 xl:top-3 xl:w-[288px]">
          <div className="hidden min-h-0 w-full flex-1 xl:flex">
            <CitiesPanel onPick={setTarget} />
          </div>
        </div>

        {/* narrow screens: panel sheets */}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 xl:hidden">
          <button
            type="button"
            onClick={() => setSheet("order")}
            className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-bold text-[#1f2b3e] shadow-lg ring-1 ring-[#e5edf5]"
          >
            🇲🇾 MY ORDER
          </button>
          <button
            type="button"
            onClick={() => setSheet("cities")}
            className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-bold text-[#1f2b3e] shadow-lg ring-1 ring-[#e5edf5]"
          >
            🏙️ Cities
          </button>
        </div>
      </div>

      {/* sheets (narrow screens) */}
      {sheet && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-[rgba(30,45,70,0.4)] xl:hidden">
          <div className="h-[86dvh] w-full max-w-md rounded-t-[22px] bg-white p-3 shadow-2xl">
            {sheet === "order" ? (
              <WorldOrder onPick={pickState} onClose={() => setSheet(null)} />
            ) : (
              <CitiesPanel
                onPick={(t) => {
                  setSheet(null);
                  setTarget(t);
                }}
                onClose={() => setSheet(null)}
              />
            )}
          </div>
        </div>
      )}

      {/* stake modal */}
      {target && (
        <StakeModal
          target={target}
          onClose={() => setTarget(null)}
          onOpenRules={() => {
            setTarget(null);
            setModal("info");
          }}
        />
      )}

      {/* icon modals */}
      {modal === "info" && <InfoModal onClose={() => setModal(null)} />}
      {modal === "board" && <BoardModal onClose={() => setModal(null)} />}
      {modal === "search" && <SearchModal onClose={() => setModal(null)} onPick={pickState} />}

      {/* payment received */}
      {paid && <PaymentCelebration facts={paid} onClose={() => setPaid(null)} />}
    </div>
  );
}

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
import { cityById, consumePaidReturn, startBoardSync, type PaidReturn } from "@/lib/store";
import { stateCodeToName } from "@/lib/states";
import type { StakeTarget } from "@/lib/types";

/** Desktop shell: left rail (brand → live activity → world order), the map
 *  centred in its own column, right rail (stats → cities list). Below xl the
 *  rails collapse and the panels become sheets, leaving a full-bleed map.
 *  Rail width / gutter are kept in sync with the xl:left-[312px] map insets. */
export default function Home() {
  const [target, setTarget] = useState<StakeTarget | null>(null);
  const [modal, setModal] = useState<"info" | "board" | "search" | null>(null);
  const [sheet, setSheet] = useState<"order" | "cities" | null>(null);
  /**
   * The territory whose bids the board is showing (null = the ranking).
   * Selecting is free — it never opens the payment dialog, it just lets visitors
   * read every bid there; the panel's CTA is what opens the dialog.
   */
  const [selection, setSelection] = useState<{ kind: "state" | "city"; code: string } | null>(null);
  /** set when we just came back from a paid checkout — drives the celebration */
  const [paid, setPaid] = useState<PaidReturn | null>(null);

  // Poll the shared board (no-op while the backend is unconfigured).
  useEffect(() => {
    // Coming back from Whop: consume ?paid=… (which also mirrors the stake into
    // this browser's board while there is no database) and celebrate it. Read
    // once from the URL on mount — a lazy useState initialiser would run during
    // the server render too, and the URL is only meaningful in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaid(consumePaidReturn());
    startBoardSync();
  }, []);

  /** Show a territory's bids in the board. Below xl the board lives in a sheet. */
  const showBids = useCallback((sel: { kind: "state" | "city"; code: string }) => {
    setSelection(sel);
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1280px)").matches) {
      setSheet("order");
    }
  }, []);

  const pickState = useCallback((code: string) => showBids({ kind: "state", code }), [showBids]);
  const selectCity = useCallback((id: string) => showBids({ kind: "city", code: id }), [showBids]);

  /** The board's CTA: this is the only way into the bidding window from there. */
  const openStake = useCallback((sel: { kind: "state" | "city"; code: string }) => {
    setSheet(null);
    if (sel.kind === "city") {
      const city = cityById(sel.code);
      if (!city) return;
      setTarget({ kind: "city", id: city.id, name: city.name, stateCode: city.state });
      return;
    }
    setTarget({ kind: "state", code: sel.code });
  }, []);

  return (
    <div className="map-stage">
      {/* full-bleed ocean; the map is centred in the middle column on desktop
          (left/right insets = gutter + rail width + gap) and full-bleed below xl */}
      <div className="absolute inset-0 flex items-center justify-center xl:bottom-3 xl:left-[312px] xl:right-[312px] xl:top-3">
        <MalaysiaMap
          selectedCode={selection?.kind === "state" ? selection.code : null}
          onSelect={pickState}
          selectedCityId={selection?.kind === "city" ? selection.code : null}
          onSelectCity={selectCity}
        />
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
            <WorldOrder
              selection={selection}
              onSelect={showBids}
              onClaim={openStake}
              onBack={() => setSelection(null)}
            />
          </div>
        </div>

        {/* right rail */}
        <div className="absolute right-4 top-4 flex w-[calc(100%-2rem)] flex-col items-end gap-3 xl:bottom-3 xl:right-3 xl:top-3 xl:w-[288px]">
          <div className="hidden min-h-0 w-full flex-1 xl:flex">
            <CitiesPanel onSelect={selectCity} onStake={(t) => setTarget(t)} />
          </div>
        </div>

        {/* narrow screens: panel sheets */}
        <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 xl:hidden">
          <button
            type="button"
            onClick={() => setSheet("order")}
            className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-bold text-[#1f2b3e] shadow-lg ring-1 ring-[#e5edf5]"
          >
            {selection
              ? `🏳️ ${
                  selection.kind === "city"
                    ? (cityById(selection.code)?.name ?? "City")
                    : stateCodeToName(selection.code)
                } bids`
              : "🇲🇾 MY ORDER"}
          </button>
          {selection && (
            <button
              type="button"
              onClick={() => openStake(selection)}
              className="rounded-full bg-[#ffc93c] px-4 py-2 text-[13px] font-bold text-[#4a3400] shadow-lg transition hover:brightness-95"
            >
              Claim a spot
            </button>
          )}
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
              <WorldOrder
                selection={selection}
                onSelect={showBids}
                onClaim={openStake}
                onBack={() => setSelection(null)}
                onClose={() => setSheet(null)}
              />
            ) : (
              <CitiesPanel
                onSelect={(id) => {
                  setSelection({ kind: "city", code: id });
                  setSheet("order");
                }}
                onStake={(t) => {
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

"use client";

import { useState, useSyncExternalStore, useMemo } from "react";
import MalaysiaMap from "@/components/MalaysiaMap";
import ClaimPanel from "@/components/ClaimPanel";
import StateChips from "@/components/StateChips";
import HowItWorks from "@/components/HowItWorks";
import { subscribe, getVersion, globalStats } from "@/lib/store";
import { money, PRICING } from "@/lib/states";

export default function Home() {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const [selected, setSelected] = useState<string | null>(null);
  const stats = useMemo(() => globalStats(), [version]);

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-[15px] font-black text-zinc-950">
            MY
          </span>
          <div className="leading-tight">
            <div className="text-[17px] font-bold tracking-tight text-zinc-50">mymap.lol</div>
            <div className="text-[11px] text-zinc-500">own the Malaysia map</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HowItWorks />
          <a
            href="#map"
            className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-[13px] font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            Claim a state
          </a>
        </div>
      </header>

      {/* stats strip */}
      <section className="mx-auto max-w-6xl px-5">
        <div className="grid grid-cols-3 gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
          <Stat label="Total staked" value={money(stats.totalStaked)} accent />
          <Stat label="States claimed" value={`${stats.statesClaimed}/${stats.statesTotal}`} />
          <Stat label="Claims" value={String(stats.totalClaims)} />
        </div>
      </section>

      {/* hero line */}
      <section className="mx-auto max-w-6xl px-5 pt-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          Every state is an open leaderboard.
        </h1>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-zinc-400">
          Stake your organization on any of Malaysia&apos;s states. Your rank is your total stake —
          top up to take the top spot. Claim from {money(PRICING.minClaim)}.
        </p>
      </section>

      {/* chips */}
      <section id="map" className="mx-auto max-w-6xl scroll-mt-24 px-5 pt-5">
        <StateChips selected={selected} onSelect={setSelected} />
      </section>

      {/* map + panel */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-3">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="map-stage flex items-center justify-center rounded-2xl border border-zinc-800 p-4">
            <MalaysiaMap selectedCode={selected} onSelect={setSelected} />
          </div>
          <div className="min-h-[520px]">
            {selected ? (
              <ClaimPanel code={selected} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-8 text-center">
                <div className="text-3xl">🗺️</div>
                <h2 className="mt-3 text-lg font-semibold text-zinc-100">Pick a state</h2>
                <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-zinc-500">
                  Click a state on the map or a chip above to see its leaderboard and claim it.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-zinc-800/70 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 text-[12px] text-zinc-600 sm:flex-row">
          <span>mymap.lol — own the Malaysia map</span>
          <span>Map data: Malaysia administrative boundaries · It&apos;s an ad buy, not a bet</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center sm:text-left">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-xl font-bold sm:text-2xl ${accent ? "text-emerald-400" : "text-zinc-100"}`}>
        {value}
      </div>
    </div>
  );
}

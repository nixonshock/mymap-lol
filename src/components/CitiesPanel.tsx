"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { STATES, money, stateCodeToName } from "@/lib/states";
import { subscribe, getVersion, addCity, allCities, cityTotals, topHolderForCity } from "@/lib/store";
import { linkLabel, pinHref, safeHref } from "@/lib/links";
import OwnerHover from "@/components/OwnerPreview";
import type { City } from "@/lib/cities";
import type { StakeTarget } from "@/lib/types";

interface Props {
  /** a city row was clicked → the board shows that city's bids */
  onSelect: (cityId: string) => void;
  /** a brand-new city was just added → open the bidding window for it */
  onStake: (target: StakeTarget) => void;
  onClose?: () => void;
}

/** Cities live in a list panel (not as labels on the map) so they stay legible
 *  and so visitors can add their own. A city stake is counted against the city
 *  only — it never claims the state it sits in. */
export default function CitiesPanel({ onSelect, onStake, onClose }: Props) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftState, setDraftState] = useState(STATES[0].code);
  const [error, setError] = useState<string | null>(null);

  const cities = useMemo(() => allCities(), [version]);
  const totals = useMemo(() => cityTotals(), [version]);

  /** Staked cities first (biggest first), then the rest by state + name. */
  const sorted = useMemo(() => {
    return [...cities].sort((a, b) => {
      const ta = totals[a.id]?.total ?? 0;
      const tb = totals[b.id]?.total ?? 0;
      if (ta !== tb) return tb - ta;
      return a.state.localeCompare(b.state) || a.name.localeCompare(b.name);
    });
  }, [cities, totals]);

  const stakedCount = cities.filter((c) => (totals[c.id]?.total ?? 0) > 0).length;

  function submitCity() {
    const city = addCity(draftName, draftState);
    if (!city) {
      setError("Give the city a name (at least 2 characters).");
      return;
    }
    setDraftName("");
    setError(null);
    setAdding(false);
    onStake({ kind: "city", id: city.id, name: city.name, stateCode: city.state });
  }

  return (
    <div className="pointer-events-auto flex h-full w-full flex-col rounded-[22px] bg-white shadow-[0_18px_50px_-18px_rgba(31,43,62,0.35)] ring-1 ring-[#e5edf5]">
      <div className="flex items-center justify-between border-b border-[#eef3f9] px-5 py-3.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-extrabold text-[#1f2b3e]">Cities</span>
          <span className="text-[11px] font-bold text-[#8494ab]">
            {cities.length} listed{stakedCount > 0 ? ` · ${stakedCount} staked` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setAdding((v) => !v);
              setError(null);
            }}
            className="rounded-full bg-[#f2f7fc] px-2.5 py-1 text-[11px] font-extrabold text-[#3a4a5e] ring-1 ring-[#e5edf5] transition hover:bg-[#e6eef7]"
          >
            {adding ? "Cancel" : "+ Add a city"}
          </button>
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
      </div>

      {adding && (
        <div className="border-b border-[#eef3f9] bg-[#fbfdff] px-4 py-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-[#8494ab]">
            Add a city to stake
          </div>
          <div className="mt-2 flex gap-2">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCity();
              }}
              placeholder="City / town name"
              className="min-w-0 flex-1 rounded-xl border border-[#dfe7f0] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#1f2b3e] outline-none transition focus:border-[#b9cde0]"
            />
            <select
              value={draftState}
              onChange={(e) => setDraftState(e.target.value)}
              aria-label="State"
              className="w-[110px] shrink-0 rounded-xl border border-[#dfe7f0] bg-white px-2 py-2 text-[12.5px] font-semibold text-[#1f2b3e] outline-none transition focus:border-[#b9cde0]"
            >
              {STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={submitCity}
              className="shrink-0 rounded-xl bg-[#ffc93c] px-3 py-2 text-[12.5px] font-extrabold text-[#4a3400] transition hover:brightness-95"
            >
              Add
            </button>
          </div>
          {error ? (
            <div className="mt-1.5 text-[11px] font-bold text-[#c0392b]">{error}</div>
          ) : (
            <div className="mt-1.5 text-[11px] font-semibold text-[#8494ab]">
              It joins the list here and can be staked on like any other city.
            </div>
          )}
        </div>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto p-2.5">
        {sorted.map((c) => (
          <CityRow
            key={c.id}
            city={c}
            total={totals[c.id]?.total ?? 0}
            onSelect={() => onSelect(c.id)}
          />
        ))}
      </div>

      <div className="border-t border-[#eef3f9] px-5 py-3 text-center text-[11px] font-semibold text-[#8494ab]">
        click a city to see its bids · a city stake never claims the state
      </div>
    </div>
  );
}

function CityRow({
  city,
  total,
  onSelect,
}: {
  city: City;
  total: number;
  onSelect: () => void;
}) {
  // The parent re-renders whenever the board version changes, so reading the
  // holder straight from the store here stays in sync.
  const holder = total > 0 ? topHolderForCity(city.id) : null;
  const href = safeHref(holder?.link);
  const site = linkLabel(holder?.link);

  const open = () => onSelect();

  return (
    <OwnerHover
      className="block w-full"
      owner={
        holder
          ? {
              orgName: holder.orgName,
              pitch: holder.pitch,
              link: holder.link,
              total,
              claims: holder.claims,
              where: city.name,
              rank: 1,
            }
          : null
      }
    >
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
        total > 0 ? "bg-[#f0f8f3] ring-1 ring-[#cfe8d9] hover:bg-[#e8f4ee]" : "hover:bg-[#f2f7fc]"
      }`}
      title={`See the bids on ${city.name}`}
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white ${
          total > 0 ? "bg-[#1f7a55]" : "bg-[#f2a13c]"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-[12.5px] font-bold text-[#1f2b3e]">{city.name}</span>
          {city.custom && (
            <span className="shrink-0 rounded-full bg-[#eef3f9] px-1.5 py-[1px] text-[9.5px] font-extrabold uppercase tracking-wide text-[#8494ab]">
              added
            </span>
          )}
        </span>
        {total > 0 && holder && (
          <span className="mt-0.5 flex items-baseline gap-1.5">
            {/* the row itself is the hover target (see OwnerHover above) */}
            <Link
              href={pinHref(holder.orgName, holder.link)}
              onClick={(e) => e.stopPropagation()}
              title={`${holder.orgName} — listing page`}
              className="truncate text-[11px] font-extrabold text-[#1f7a55] underline decoration-[#9fd0b9] underline-offset-2 transition hover:text-[#0f5c3c]"
            >
              {holder.orgName}
            </Link>
            {site && (
              <span className="truncate text-[10.5px] font-semibold text-[#8494ab]">· {site}</span>
            )}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[11px] font-semibold text-[#8494ab]">
          {stateCodeToName(city.state)}
        </span>
        {total > 0 && (
          <span className="block text-[11.5px] font-extrabold tabular-nums text-[#1f7a55]">
            {money(total)}
          </span>
        )}
      </span>
      {total > 0 && href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open ${holder?.orgName}'s site`}
          title={href}
          className="shrink-0 rounded-full bg-white px-2 py-1 text-[10.5px] font-extrabold text-[#166d4a] ring-1 ring-[#cfe8d9] transition hover:bg-[#e7f7ef]"
        >
          ↗
        </a>
      )}
    </div>
    </OwnerHover>
  );
}

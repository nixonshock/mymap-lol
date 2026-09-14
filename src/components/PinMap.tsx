"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { FeatureCollection, Feature } from "geojson";
import { buildMapGeom, stateFill, type MapFeature } from "@/lib/geo";
import { allTotals, getVersion, subscribe } from "@/lib/store";

/**
 * The Malaysia map as it appears on a listing's page (`/pin/<slug>`).
 *
 * Same geometry and the same colour rule as the big map — a held state takes
 * its own hue, an open one stays white — but static and fitted to a card, the
 * way worldmap.lol shows its globe on a profile page.
 */

let geojsonPromise: Promise<FeatureCollection | null> | null = null;

/** The state outlines: fetched once per page load, then shared by every shape. */
export function useMalaysiaGeojson(): FeatureCollection | null {
  const [data, setData] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    if (!geojsonPromise) {
      geojsonPromise = fetch("/malaysia-states.geojson")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    let alive = true;
    geojsonPromise.then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  return data;
}

const codeOf = (f: Feature) => (f.properties as { code?: string } | null)?.code ?? null;

/** One state's silhouette, fitted into a small box — built once per state. */
const shapeCache = new Map<string, { d: string; viewBox: string } | null>();

export function StateShape({
  code,
  fill,
  stroke,
  className,
}: {
  code: string;
  fill: string;
  stroke: string;
  className?: string;
}) {
  const geojson = useMalaysiaGeojson();

  const shape = useMemo(() => {
    if (!geojson) return undefined;
    if (shapeCache.has(code)) return shapeCache.get(code);
    const feature = (geojson.features as Feature[]).find((f) => codeOf(f) === code);
    const built = feature
      ? (() => {
          const geom = buildMapGeom(
            { type: "FeatureCollection", features: [feature] } as FeatureCollection,
            46,
            40,
            3,
          );
          return { d: geom.path(feature as MapFeature), viewBox: geom.viewBox };
        })()
      : null;
    shapeCache.set(code, built);
    return built;
  }, [geojson, code]);

  if (!shape) return <span className={className} aria-hidden />;

  return (
    <svg viewBox={shape.viewBox} className={className} aria-hidden>
      <path
        d={shape.d}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Deep navy behind an unheld state on the profile card (worldmap's globe look). */
const OPEN_FILL = "#16293c";

/**
 * Outline of a state this listing does *not* hold. It used to be
 * `rgba(255,255,255,0.13)` — on the navy card that is a 30-unit luminance step
 * over the fill, so the country's shape all but vanished and Jerry asked for it
 * back ("i want the map outline to be visible / more obvious — perhaps a grey or
 * color close to white"). A near-white at half strength keeps the held state's
 * gold the loudest thing on the card while the geography stays legible.
 */
const OPEN_STROKE = "rgba(255,255,255,0.52)";
const OPEN_STROKE_W = 1.1;

export function PinMap({ held }: { held: string[] }) {
  const geojson = useMalaysiaGeojson();
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const totals = useMemo(() => allTotals(), [version]);
  const geom = useMemo(() => (geojson ? buildMapGeom(geojson, 720, 520, 14) : null), [geojson]);
  const max = Math.max(1, ...Object.values(totals).map((v) => v.total));

  if (!geojson || !geom) {
    return <div className="absolute inset-0" aria-hidden />;
  }

  return (
    <svg
      viewBox={geom.viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full p-3"
      role="img"
      aria-label="Malaysia, with the states this listing holds coloured in"
    >
      {(geojson.features as Feature[]).map((f, i) => {
        const code = codeOf(f) ?? "";
        const total = totals[code]?.total ?? 0;
        const mine = held.includes(code);
        return (
          <path
            key={code || i}
            d={geom.path(f as MapFeature)}
            fill={total > 0 ? stateFill(code, total, max) : OPEN_FILL}
            stroke={mine ? "#ffc93c" : OPEN_STROKE}
            strokeWidth={mine ? 1.8 : OPEN_STROKE_W}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

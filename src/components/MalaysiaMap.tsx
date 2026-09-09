"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import { buildMapGeom, colorForTotal } from "@/lib/geo";
import { useSyncExternalStore } from "react";
import { subscribe, getVersion, allTotals, stateLeaderboard } from "@/lib/store";
import { money, stateCodeToName } from "@/lib/states";

interface Props {
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

interface FeatureWithProps {
  properties: { name: string; code: string };
  type: string;
  geometry: unknown;
}

export default function MalaysiaMap({ selectedCode, onSelect }: Props) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const totals = useMemo(() => allTotals(), [version]);
  const maxTotal = useMemo(
    () => Math.max(1, ...Object.values(totals).map((t) => t.total)),
    [totals],
  );

  useEffect(() => {
    fetch("/malaysia-states.geojson")
      .then((r) => r.json())
      .then(setGeojson)
      .catch(() => setGeojson(null));
  }, []);

  const geom = useMemo(() => (geojson ? buildMapGeom(geojson) : null), [geojson]);

  function handleMove(e: React.MouseEvent<SVGPathElement>) {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    setMouse({ x: e.clientX - box.left, y: e.clientY - box.top });
  }

  if (!geom) {
    return (
      <div className="flex h-[420px] w-full items-center justify-center text-sm text-zinc-500">
        Loading map…
      </div>
    );
  }

  const features = (geojson as FeatureCollection).features as FeatureWithProps[];

  return (
    <div ref={boxRef} className="relative w-full">
      <svg
        viewBox={geom.viewBox}
        className="block h-auto w-full"
        role="img"
        aria-label="Map of Malaysia states"
      >
        {features.map((f) => {
          const d = geom.path(f as never) ?? "";
          const code = f.properties.code;
          const total = totals[code]?.total ?? 0;
          const isSel = code === selectedCode;
          const isHover = code === hovered;
          return (
            <path
              key={code}
              d={d}
              fill={colorForTotal(total, maxTotal)}
              stroke={isSel || isHover ? "#ffffff" : "#1a2027"}
              strokeWidth={isSel ? 1.8 : isHover ? 1.2 : 0.9}
              className="cursor-pointer transition-[fill] duration-150"
              onMouseMove={handleMove}
              onMouseEnter={() => setHovered(code)}
              onMouseLeave={() => {
                setHovered(null);
                setMouse(null);
              }}
              onClick={() => onSelect(code)}
            />
          );
        })}
        {geom.layout
          .filter((l) => l.area >= 200)
          .map((l) => {
            const size = Math.max(8.5, Math.min(16, Math.round(Math.sqrt(l.area) / 9)));
            return (
              <text
                key={`l-${l.code}`}
                x={l.centroid[0]}
                y={l.centroid[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none"
                fontSize={size}
                fill="#c8ced6"
                fontWeight={600}
                style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.65)", strokeWidth: 2 }}
              >
                {stateCodeToName(l.code)}
              </text>
            );
          })}
      </svg>

      {hovered && mouse && (
        <HoverTip
          x={mouse.x}
          y={mouse.y}
          name={stateLeaderboard(hovered).name}
          total={totals[hovered]?.total ?? 0}
          isEmpty={!totals[hovered]}
        />
      )}
    </div>
  );
}

function HoverTip({
  x,
  y,
  name,
  total,
  isEmpty,
}: {
  x: number;
  y: number;
  name: string;
  total: number;
  isEmpty: boolean;
}) {
  const left = Math.min(x + 14, typeof window !== "undefined" ? window.innerWidth - 220 : x);
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-y-1/2 rounded-lg border border-zinc-700 bg-zinc-950/95 px-3 py-2 text-[13px] shadow-xl"
      style={{ left, top: y }}
    >
      <div className="font-semibold text-zinc-100">{name}</div>
      <div className="mt-0.5 text-zinc-400">
        {isEmpty ? (
          "Open for claiming · from " + money(10)
        ) : (
          <>
            <span className="text-emerald-400">{money(total)}</span> staked
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import { buildMapGeom, colorForTotal, type MapFeature } from "@/lib/geo";
import { useSyncExternalStore } from "react";
import { subscribe, getVersion, allTotals, stateLeaderboard } from "@/lib/store";
import { money, stateCodeToName } from "@/lib/states";
import { CITIES } from "@/lib/cities";

interface Props {
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

interface FeatureWithProps extends MapFeature {
  properties: { name: string; code: string };
}

interface Tf {
  k: number;
  x: number;
  y: number;
}

const MIN_K = 1;
const MAX_K = 12;
const ZOOM_STEP = 1.35;

export default function MalaysiaMap({ selectedCode, onSelect }: Props) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tf, setTf] = useState<Tf>({ k: 1, x: 0, y: 0 });

  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tfRef = useRef<Tf>(tf);
  const vbRef = useRef<{ w: number; h: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panState = useRef<{
    sx: number;
    sy: number;
    k: number;
    x: number;
    y: number;
  } | null>(null);
  const pinchState = useRef<{
    dist0: number;
    mid0: { x: number; y: number };
    k0: number;
    x0: number;
    y0: number;
  } | null>(null);
  const movedRef = useRef(false);
  const downCodeRef = useRef<string | null>(null);

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

  const projectedCities = useMemo(() => {
    if (!geom) return [];
    const out: { x: number; y: number; name: string; major?: boolean }[] = [];
    for (const c of CITIES) {
      const p = geom.projection([c.lng, c.lat]);
      if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
        out.push({ x: p[0], y: p[1], name: c.name, major: c.major });
      }
    }
    return out;
  }, [geom]);

  // Parse viewBox once we have geometry.
  useEffect(() => {
    if (!geom) return;
    const parts = geom.viewBox.split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      vbRef.current = { w: parts[2], h: parts[3] };
    }
  }, [geom]);

  // css px -> svg user units (viewBox units).
  function cssToUser(px: number, py: number): { x: number; y: number } {
    const svg = svgRef.current;
    const vb = vbRef.current;
    if (!svg || !vb) return { x: px, y: py };
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return { x: px, y: py };
    const s = vb.w / rect.width; // uniform (aspect preserved)
    return { x: px * s, y: py * s };
  }

  function updateTf(next: Tf) {
    next.k = Math.min(MAX_K, Math.max(MIN_K, next.k));
    tfRef.current = next;
    setTf(next);
  }

  // Zoom by `factor` keeping the user-space anchor (ux,uy) fixed on screen.
  function zoomAtUser(ux: number, uy: number, factor: number) {
    const { k, x, y } = tfRef.current;
    const nk = Math.min(MAX_K, Math.max(MIN_K, k * factor));
    const nx = ux - (ux - x) * (nk / k);
    const ny = uy - (uy - y) * (nk / k);
    updateTf({ k: nk, x: nx, y: ny });
  }

  function zoomAtCss(px: number, py: number, factor: number) {
    const u = cssToUser(px, py);
    zoomAtUser(u.x, u.y, factor);
  }

  function zoomCenter(factor: number) {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    zoomAtCss(box.width / 2, box.height / 2, factor);
  }

  function reset() {
    updateTf({ k: 1, x: 0, y: 0 });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer may already be captured or not be an active pointer — never
      // let a capture failure abort the interaction.
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const code = (e.target as Element | null)?.getAttribute?.("data-code") ?? null;
    downCodeRef.current = code;

    if (pointers.current.size === 1) {
      const { k, x, y } = tfRef.current;
      panState.current = { sx: e.clientX, sy: e.clientY, k, x, y };
      pinchState.current = null;
      movedRef.current = false;
      setDragging(true);
      setHovered(null);
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist0 = Math.hypot(a.x - b.x, a.y - b.y);
      const mid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const { k, x, y } = tfRef.current;
      pinchState.current = { dist0, mid0, k0: k, x0: x, y0: y };
      panState.current = null;
      movedRef.current = true; // a pinch is never a click
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = boxRef.current?.getBoundingClientRect();
    if (box) setMouse({ x: e.clientX - box.left, y: e.clientY - box.top });

    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchState.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const p = pinchState.current;
      const nk = Math.min(MAX_K, Math.max(MIN_K, p.k0 * (dist / Math.max(1, p.dist0))));
      const mid0u = cssToUser(p.mid0.x, p.mid0.y);
      const midu = cssToUser(mid.x, mid.y);
      const mapX = (mid0u.x - p.x0) / p.k0;
      const mapY = (mid0u.y - p.y0) / p.k0;
      updateTf({ k: nk, x: midu.x - mapX * nk, y: midu.y - mapY * nk });
      return;
    }

    if (panState.current && pointers.current.size === 1) {
      const dxCss = e.clientX - panState.current.sx;
      const dyCss = e.clientY - panState.current.sy;
      if (Math.hypot(dxCss, dyCss) > 3) movedRef.current = true;
      const { x, y } = cssToUser(dxCss, dyCss);
      updateTf({ k: panState.current.k, x: panState.current.x + x, y: panState.current.y + y });
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    // If this was a clean tap on a state (no drag/pinch), select it.
    const wasTap = !movedRef.current;
    const code = downCodeRef.current;
    const isSingle = pointers.current.size === 1;

    pointers.current.delete(e.pointerId);

    if (pointers.current.size === 0) {
      setDragging(false);
      panState.current = null;
      pinchState.current = null;
    } else if (pointers.current.size === 1) {
      // Lift one finger of a pinch → continue as a pan from the remaining pointer.
      const [rem] = [...pointers.current.values()];
      const { k, x, y } = tfRef.current;
      panState.current = { sx: rem.x, sy: rem.y, k, x, y };
      pinchState.current = null;
      movedRef.current = true;
    }

    if (wasTap && isSingle && code) onSelect(code);
  }

  function onPointerCancel() {
    pointers.current.clear();
    pinchState.current = null;
    panState.current = null;
    setDragging(false);
  }

  // Attach a non-passive wheel listener so we can preventDefault (React's
  // onWheel is passive by default and would let the page scroll).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = boxRef.current?.getBoundingClientRect();
      if (!box) return;
      const px = e.clientX - box.left;
      const py = e.clientY - box.top;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomAtCss(px, py, factor);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [geom]); // re-attach if geometry (and thus vbRef) changes

  if (!geom) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[#8494ab]">
        Loading map…
      </div>
    );
  }

  const features = ((geojson as FeatureCollection).features ?? []) as unknown as FeatureWithProps[];
  const vbW = Number(geom.viewBox.split(/\s+/)[2]) || 1;

  return (
    <div
      ref={boxRef}
      className="relative h-full w-full touch-none select-none overflow-hidden"
    >
      <svg
        ref={svgRef}
        viewBox={geom.viewBox}
        className={`block h-full w-full ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label="Map of Malaysia states — drag to pan, scroll to zoom, click a state"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => {
          if (pointers.current.size === 0) {
            setMouse(null);
            setHovered(null);
          }
        }}
        onDoubleClick={(e) => {
          const box = boxRef.current?.getBoundingClientRect();
          if (!box) return;
          zoomAtCss(e.clientX - box.left, e.clientY - box.top, 1.6);
        }}
      >
        <g transform={`translate(${tf.x} ${tf.y}) scale(${tf.k})`}>
          {features.map((f) => {
            const d = geom.path(f);
            const code = f.properties.code;
            const total = totals[code]?.total ?? 0;
            const isSel = code === selectedCode;
            const isHover = code === hovered;
            return (
              <path
                key={code}
                data-code={code}
                d={d}
                fillRule="evenodd"
                fill={colorForTotal(total, maxTotal)}
                stroke={isSel ? "#1f7a55" : isHover ? "#7aa0c8" : "#a9bccd"}
                strokeWidth={isSel ? 1.8 : isHover ? 1.3 : 1}
                className="cursor-pointer transition-[fill] duration-150"
                onMouseEnter={() => setHovered(code)}
                onMouseLeave={() => setHovered((c) => (c === code ? null : c))}
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
                  fill="#64748b"
                  fontWeight={600}
                  style={{ paintOrder: "stroke", stroke: "rgba(255,255,255,0.85)", strokeWidth: 2.5 }}
                >
                  {stateCodeToName(l.code)}
                </text>
              );
            })}
          {/* famous cities */}
          {projectedCities.map((c) => {
            const r = 2.4 / Math.max(1, Math.sqrt(tf.k));
            const fs = (c.major ? 11 : 9.5) / Math.max(1, Math.pow(tf.k, 0.55));
            const onRight = c.x < vbW * 0.62;
            const dx = onRight ? r + 2 : -(r + 2);
            return (
              <g key={`city-${c.name}`} className="pointer-events-none select-none">
                <circle cx={c.x} cy={c.y} r={r} fill="#f2a13c" stroke="#ffffff" strokeWidth={0.9} opacity={0.97} />
                <text
                  x={c.x + dx}
                  y={c.y}
                  textAnchor={onRight ? "start" : "end"}
                  dominantBaseline="middle"
                  fontSize={fs}
                  fill="#1f2b3e"
                  fontWeight={600}
                  style={{ paintOrder: "stroke", stroke: "rgba(255,255,255,0.9)", strokeWidth: 2.5 }}
                >
                  {c.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* interaction hint */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-[#dfe7f0] bg-white/90 px-3 py-1.5 text-[11px] font-bold text-[#5b6b7e] shadow-lg">
        drag to pan · scroll to zoom · click a state
      </div>

      {/* zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-xl border border-[#dfe7f0] bg-white/95 shadow-xl">
        <button
          type="button"
          onClick={() => zoomCenter(ZOOM_STEP)}
          aria-label="Zoom in"
          className="flex h-9 w-9 items-center justify-center text-lg font-bold text-[#3a4a5e] transition hover:bg-[#f2f7fc]"
        >
          +
        </button>
        <div className="h-px bg-[#eef3f9]" />
        <button
          type="button"
          onClick={() => zoomCenter(1 / ZOOM_STEP)}
          aria-label="Zoom out"
          className="flex h-9 w-9 items-center justify-center text-lg font-bold text-[#3a4a5e] transition hover:bg-[#f2f7fc]"
        >
          −
        </button>
        <div className="h-px bg-[#eef3f9]" />
        <button
          type="button"
          onClick={reset}
          aria-label="Reset view"
          className="flex h-9 w-9 items-center justify-center text-[15px] text-[#3a4a5e] transition hover:bg-[#f2f7fc]"
        >
          ⤢
        </button>
      </div>

      {/* tooltip */}
      {hovered && mouse && !dragging && (
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
      className="pointer-events-none absolute z-20 -translate-y-1/2 rounded-lg border border-[#dfe7f0] bg-white px-3 py-2 text-[13px] shadow-xl"
      style={{ left, top: y }}
    >
      <div className="font-bold text-[#1f2b3e]">{name}</div>
      <div className="mt-0.5 font-semibold text-[#8494ab]">
        {isEmpty ? (
          "Open for claiming · from " + money(10)
        ) : (
          <>
            <span className="text-[#1f7a55]">{money(total)}</span> staked
          </>
        )}
      </div>
    </div>
  );
}

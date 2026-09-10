"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import { buildMapGeom, cityPin, stateFill, stateInk, type MapFeature } from "@/lib/geo";
import { useSyncExternalStore } from "react";
import { subscribe, getVersion, allTotals, citiesInState, cityTotals, stateLeaderboard, topHolder } from "@/lib/store";
import { PRICING, money, moneyBoth, stateCodeToName } from "@/lib/states";
import { linkLabel, safeHref } from "@/lib/links";
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

/**
 * The href of the nearest ancestor element carrying data-href (the owner label
 * on a claimed state), or null when the hit-test landed on the map itself.
 */
function hrefFrom(target: EventTarget | null): string | null {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return null;
  return el.closest("[data-href]")?.getAttribute("data-href") ?? null;
}

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
  const downHrefRef = useRef<string | null>(null);

  const totals = useMemo(() => allTotals(), [version]);
  const stakedCities = useMemo(() => cityTotals(), [version]);
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
    const out: { x: number; y: number; id: string; name: string; major?: boolean }[] = [];
    for (const c of CITIES) {
      const p = geom.projection([c.lng as number, c.lat as number]);
      if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
        out.push({ x: p[0], y: p[1], id: c.id, name: c.name, major: c.major });
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
    downHrefRef.current = hrefFrom(e.target);

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
    // If this was a clean tap on a state (no drag/pinch), select it — or, when
    // the tap landed on a claimed state's owner label, follow that org's link.
    const wasTap = !movedRef.current;
    const code = downCodeRef.current;
    const href = downHrefRef.current;
    const isSingle = pointers.current.size === 1;

    pointers.current.delete(e.pointerId);
    if (wasTap) downHrefRef.current = null;

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

    if (wasTap && isSingle && href) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
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
                fill={stateFill(code, total, maxTotal)}
                stroke={isSel ? "#1f2b3e" : isHover ? "#7aa0c8" : "#a8b8c8"}
                strokeWidth={isSel ? 1.8 : isHover ? 1.3 : 1}
                className="cursor-pointer transition-[fill] duration-150"
                onMouseEnter={() => setHovered(code)}
                onMouseLeave={() => setHovered((c) => (c === code ? null : c))}
              />
            );
          })}
          {geom.layout
            .filter((l) => l.area >= 200 || (totals[l.code]?.total ?? 0) > 0)
            .map((l) => {
              const total = totals[l.code]?.total ?? 0;
              const size = Math.max(8.5, Math.min(16, Math.round(Math.sqrt(l.area) / 9)));
              // Claimed states also carry their current owner: the org name sits
              // under the state name and is itself the outbound link.
              const owner = total > 0 ? topHolder(l.code) : null;
              const href = safeHref(owner?.link);
              const ownerSize = Math.max(8, Math.min(15, size * 0.92));
              return (
                <g key={`l-${l.code}`}>
                  <text
                    x={l.centroid[0]}
                    y={owner ? l.centroid[1] - size * 0.62 : l.centroid[1]}
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
                  {owner && (
                    <a
                      href={href ?? undefined}
                      data-href={href ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={href ? `${owner.orgName} — ${href}` : owner.orgName}
                      aria-label={href ? `${owner.orgName}: open ${href}` : undefined}
                      className={href ? "cursor-pointer" : undefined}
                    >
                      <text
                        x={l.centroid[0]}
                        y={l.centroid[1] + size * 0.68}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="select-none"
                        fontSize={ownerSize}
                        fill={stateInk(l.code)}
                        fontWeight={800}
                        style={{
                          paintOrder: "stroke",
                          stroke: "rgba(255,255,255,0.9)",
                          strokeWidth: 1.5,
                          textDecoration: href ? "underline" : "none",
                        }}
                      >
                        {owner.orgName}
                      </text>
                    </a>
                  )}
                </g>
              );
            })}
          {/* city markers — orange when open, dark ink when someone holds the
              city. The names live in the Cities panel so nothing gets clipped. */}
          {projectedCities.map((c) => {
            const held = (stakedCities[c.id]?.total ?? 0) > 0;
            const k = Math.max(1, tf.k);
            const r = (held ? 4.4 : 2.6) / Math.max(1, Math.sqrt(k));
            return (
              <circle
                key={`city-${c.id}`}
                cx={c.x}
                cy={c.y}
                r={r}
                fill={cityPin(held)}
                stroke="#ffffff"
                strokeWidth={(held ? 1.8 : 1.1) / Math.max(1, Math.pow(k, 0.5))}
                opacity={0.97}
                className="pointer-events-none"
              />
            );
          })}
        </g>
      </svg>

      {/* interaction hint + legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-2xl border border-[#dfe7f0] bg-white/90 px-3 py-1.5 text-[11px] font-bold text-[#5b6b7e] shadow-lg">
        <div>drag to pan · scroll to zoom · click a state</div>
        <div className="mt-0.5 font-semibold text-[#8494ab]">
          white = open for claiming · coloured = already taken
        </div>
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
          owner={totals[hovered] ? topHolder(hovered) : null}
          cityStakes={citiesInState(hovered)}
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
  owner,
  cityStakes,
}: {
  x: number;
  y: number;
  name: string;
  total: number;
  isEmpty: boolean;
  owner: { orgName: string; pitch: string; link?: string } | null;
  cityStakes: { id: string; name: string; total: number }[];
}) {
  const left = Math.min(x + 14, typeof window !== "undefined" ? window.innerWidth - 220 : x);
  const site = linkLabel(owner?.link);
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-y-1/2 rounded-lg border border-[#dfe7f0] bg-white px-3 py-2 text-[13px] shadow-xl"
      style={{ left, top: y }}
    >
      <div className="font-bold text-[#1f2b3e]">{name}</div>
      {owner && (
        <div className="mt-0.5 font-extrabold text-[#166d4a]">
          {owner.orgName}
          {site && <span className="font-semibold text-[#8494ab]"> · {site}</span>}
        </div>
      )}
      {owner?.pitch && (
        <div className="mt-0.5 max-w-[240px] truncate font-semibold text-[#8494ab]">{owner.pitch}</div>
      )}
      <div className="mt-0.5 font-semibold text-[#8494ab]">
        {isEmpty ? (
          "Open for claiming · from " + moneyBoth(PRICING.minClaim)
        ) : (
          <>
            <span className="text-[#1f7a55]">{money(total)}</span> staked
          </>
        )}
      </div>
      {cityStakes.length > 0 && (
        <div className="mt-0.5 max-w-[250px] truncate font-semibold text-[#3a4a5e]">
          🏙️ {cityStakes.map((c) => c.name).join(", ")} staked
        </div>
      )}
    </div>
  );
}

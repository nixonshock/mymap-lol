import { geoMercator, type GeoProjection } from "d3-geo";
import type { FeatureCollection, Position } from "geojson";
import { STATES } from "./states";

export interface FeatureLayout {
  code: string;
  name: string;
  centroid: [number, number];
  area: number; // projected area in viewBox units
}

export interface MapGeom {
  projection: GeoProjection;
  /**
   * Project a point the same way the map draws it — fitted projection **plus**
   * the East Malaysian offset (see `GAP_CLOSED`). City pins go through this so
   * they land on the drawn land, not on the empty sea where Borneo used to be.
   */
  project: (point: [number, number], stateCode?: string) => [number, number] | null;
  /** Build an SVG path `d` string for one feature from the fitted projection. */
  path: (feature: MapFeature) => string;
  viewBox: string; // "minX minY width height"
  layout: FeatureLayout[];
  /** the sea still left between the two Malaysias, in viewBox units */
  seaGap: number;
}

export interface MapFeature {
  title?: string;
  properties?: { code?: string; name?: string };
  geometry?: { type?: string; coordinates?: unknown };
}

type AnyGeom = { type?: string; coordinates?: unknown };

/**
 * The two Malaysias. Everything on Borneo (plus Labuan) sits across the South
 * China Sea from the peninsula, which on a true projection leaves a gap as wide
 * as a third of the country — and since the map is fit to the frame's width, that
 * sea is what makes the land look small.
 */
const EAST_CODES = new Set(["MY-12", "MY-13", "MY-15"]); // Sabah, Sarawak, Labuan

/**
 * How much of that sea to close up (Jerry, Sep 2026: "reduce the gap in between
 * 2 malaysia region … so that we have less of sea while more of lands"). 0 =
 * true geography, 1 = the two landmasses touch. 0.6 takes the gap to 40% of its
 * real width: the country stays honestly two-part, but the fit scale rises ~25%
 * and the land fills the frame instead of the ocean.
 */
const GAP_CLOSED = 0.6;

/**
 * Walk a GeoJSON geometry and call `cb` once per ring (Polygon/MultiPolygon),
 * or once per line (LineString/MultiLineString).
 */
function eachRing(geometry: AnyGeom | undefined, cb: (ring: Position[]) => void) {
  if (!geometry || !geometry.coordinates) return;
  const { type, coordinates } = geometry;
  if (type === "Polygon") {
    for (const ring of coordinates as Position[][]) cb(ring);
  } else if (type === "MultiPolygon") {
    for (const poly of coordinates as Position[][][]) for (const ring of poly) cb(ring);
  } else if (type === "LineString") {
    cb(coordinates as Position[]);
  } else if (type === "MultiLineString") {
    for (const line of coordinates as Position[][]) cb(line);
  }
}

/** Signed planar area (shoelace) of an already-projected ring. */
function planarArea(ring: [number, number][]): number {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/**
 * Build a Mercator projection for the given GeoJSON and return a tight viewBox
 * plus per-feature label layout.
 *
 * IMPORTANT (two d3-geo traps this avoids, both verified on this dataset):
 *  1. The fit is derived from raw projected POINTS (projection(point) at
 *     scale=1), never from d3's spherical helpers. geoBounds()/path.bounds()
 *     read these simplified near-equator rings as world-spanning
 *     ([[-180,-90],[180,90]]) and squash the whole country into a blob.
 *  2. The path `d` strings are built by hand from projected vertices, NOT with
 *     geoPath(). geoPath() runs d3's spherical ring clipping, which on this
 *     winding/dataset emits a full-sphere rectangle ("M-13717,-8272 ... L3875,
 *     9320 Z") plus the real ring in EVERY feature path — so all 16 states
 *     paint the entire map area one flat colour and the map looks empty.
 *     Manual polylines are deterministic; holes are handled with
 *     `fill-rule: evenodd` at render time.
 */
export function buildMapGeom(geojson: FeatureCollection, width = 1000, height = 640, pad = 14): MapGeom {
  const projection = geoMercator();

  // Pass 1: project every vertex at scale=1, translate=0 to get true relative
  // coordinates — tracking the x extent of each side of the South China Sea so
  // the sea can be closed up before the fit is computed.
  projection.scale(1).translate([0, 0]);
  let minY = Infinity;
  let maxY = -Infinity;
  let westMinX = Infinity;
  let westMaxX = -Infinity;
  let eastMinX = Infinity;
  let eastMaxX = -Infinity;

  const featureGeoms: AnyGeom[] = [];
  for (const f of geojson.features) {
    const g = (f.geometry ?? undefined) as AnyGeom | undefined;
    featureGeoms.push(g as AnyGeom);
    const east = EAST_CODES.has(f.properties?.code ?? "");
    eachRing(g, (ring) => {
      for (const p of ring) {
        const pr = projection(p as [number, number]);
        if (!pr || !Number.isFinite(pr[0]) || !Number.isFinite(pr[1])) continue;
        if (pr[1] < minY) minY = pr[1];
        if (pr[1] > maxY) maxY = pr[1];
        if (east) {
          if (pr[0] < eastMinX) eastMinX = pr[0];
          if (pr[0] > eastMaxX) eastMaxX = pr[0];
        } else {
          if (pr[0] < westMinX) westMinX = pr[0];
          if (pr[0] > westMaxX) westMaxX = pr[0];
        }
      }
    });
  }

  const hasBothSides =
    Number.isFinite(westMaxX) && Number.isFinite(eastMinX) && eastMinX > westMaxX;
  /** raw-units slide applied to everything on Borneo (0 for a single state) */
  const shiftRaw = hasBothSides ? -(eastMinX - westMaxX) * GAP_CLOSED : 0;
  // A single state's own silhouette has only one side present, so the absent one
  // is ±Infinity and the Math.min/Math.max pair simply ignores it (the slide is 0
  // there too — a lone state must never move).
  const minX = Math.min(westMinX, eastMinX + shiftRaw);
  const maxX = Math.max(westMaxX, eastMaxX + shiftRaw);

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    // No usable coordinates — fall back to a plain world viewBox.
    return {
      projection,
      project: () => null,
      path: () => "",
      viewBox: "0 0 1000 640",
      layout: [],
      seaGap: 0,
    };
  }

  // Fit: scale so the whole country fits the extent, preserving aspect.
  const dx = Math.max(1e-6, maxX - minX);
  const dy = Math.max(1e-6, maxY - minY);
  const k = Math.min((width - pad * 2) / dx, (height - pad * 2) / dy);
  projection
    .scale(k)
    .translate([width / 2 - k * ((minX + maxX) / 2), height / 2 - k * ((minY + maxY) / 2)]);

  /** the same slide, now in fitted units — applied to every Borneo coordinate */
  const shift = k * shiftRaw;
  const shiftFor = (stateCode?: string) =>
    shift !== 0 && EAST_CODES.has(stateCode ?? "") ? shift : 0;
  const seaGap = hasBothSides ? (eastMinX - westMaxX) * k : 0;

  /**
   * Project a point the way the map draws it: fitted projection, then the Borneo
   * slide. City pins need this — a pin projected without the slide lands in open
   * sea to the east of the drawn island.
   */
  const project = (point: [number, number], stateCode?: string): [number, number] | null => {
    const pr = projection(point);
    if (!pr || !Number.isFinite(pr[0]) || !Number.isFinite(pr[1])) return null;
    return [pr[0] + shiftFor(stateCode), pr[1]];
  };

  // Pass 2: with the fitted projection, build path strings + label layout.
  const path = (feature: MapFeature): string => {
    const shiftX = shiftFor(feature?.properties?.code);
    const parts: string[] = [];
    eachRing(feature?.geometry as AnyGeom | undefined, (ring) => {
      let started = false;
      for (const p of ring) {
        const pr = projection(p as [number, number]);
        if (!pr || !Number.isFinite(pr[0]) || !Number.isFinite(pr[1])) continue;
        parts.push(`${started ? "L" : "M"}${(pr[0] + shiftX).toFixed(2)},${pr[1].toFixed(2)}`);
        started = true;
      }
      if (started) parts.push("Z");
    });
    return parts.join("");
  };

  let fx0 = Infinity;
  let fy0 = Infinity;
  let fx1 = -Infinity;
  let fy1 = -Infinity;
  const layout: FeatureLayout[] = [];

  for (const feat of geojson.features) {
    const g = (feat.geometry ?? undefined) as AnyGeom | undefined;
    const shiftX = shiftFor(feat.properties?.code);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let sx = 0;
    let sy = 0;
    let n = 0;
    let area = 0;

    eachRing(g, (ring) => {
      const proj: [number, number][] = [];
      for (const p of ring) {
        const pr = projection(p as [number, number]);
        if (!pr || !Number.isFinite(pr[0]) || !Number.isFinite(pr[1])) continue;
        const x = pr[0] + shiftX;
        proj.push([x, pr[1]]);
        if (x < x0) x0 = x;
        if (pr[1] < y0) y0 = pr[1];
        if (x > x1) x1 = x;
        if (pr[1] > y1) y1 = pr[1];
        sx += x;
        sy += pr[1];
        n++;
      }
      if (proj.length >= 3) area += Math.abs(planarArea(proj));
    });

    if (!n) continue;

    fx0 = Math.min(fx0, x0);
    fy0 = Math.min(fy0, y0);
    fx1 = Math.max(fx1, x1);
    fy1 = Math.max(fy1, y1);

    layout.push({
      code: feat.properties?.code ?? "",
      name: feat.properties?.name ?? "",
      centroid: [sx / n, sy / n],
      area,
    });
  }

  const viewBox = `${(fx0 - pad).toFixed(2)} ${(fy0 - pad).toFixed(2)} ${(fx1 - fx0 + pad * 2).toFixed(2)} ${(fy1 - fy0 + pad * 2).toFixed(2)}`;
  return { projection, project, path, viewBox, layout, seaGap };
}

/**
 * Per-state colour.
 *
 * Every state gets its own hue: the 16 states sit 22.5° apart on the hue circle
 * and are handed out in bit-reversed order, so no two states look alike and
 * neighbours on the list (or on the map) are as far apart in hue as the circle
 * allows. A second axis — alternate states ride a slightly lighter band — keeps
 * hue-neighbours apart too. Staking deepens and saturates a state's own colour,
 * so an open state is a pale tint and a claimed one is unmistakably solid.
 */
function hueSlots(n: number): number {
  let slots = 1;
  while (slots * 2 <= n) slots *= 2;
  return slots;
}

function bitReverse(i: number, bits: number): number {
  let out = 0;
  for (let b = 0; b < bits; b++) out |= ((i >> b) & 1) << (bits - 1 - b);
  return out;
}

/** Position of a state's colour on the hue circle (0 … slots-1). */
export function stateSlot(code: string): number {
  const slots = hueSlots(STATES.length);
  const i = STATES.findIndex((s) => s.code === code);
  return bitReverse(i >= 0 ? i : 0, Math.round(Math.log2(slots)));
}

export function stateHue(code: string): number {
  return Math.round((stateSlot(code) * 360) / hueSlots(STATES.length) + 12) % 360;
}

/**
 * Fill for a state: plain white while nobody holds it (white = available), then
 * the state's own colour once it is taken — and the deeper/more saturated the
 * colour, the more has been staked on it.
 */
export function stateFill(code: string, total: number, maxTotal: number): string {
  if (total <= 0) return "#ffffff"; // open for claiming
  const h = stateHue(code);
  const lift = stateSlot(code) % 2 === 0 ? 2 : -2; // second axis of variation
  const t = Math.min(
    1,
    Math.log1p(total) / Math.log1p(Math.max(total, maxTotal, 1)),
  );
  const p = 0.35 + 0.65 * t; // 0.35 at the minimum stake … 1 at the top
  const light = 52 - 14 * p + lift; // ~54% … ~36%
  return `hsl(${h} 66% ${light.toFixed(1)}%)`;
}

/** Ink for the holder's name printed on a claimed state (dark tint of its hue). */
export function stateInk(code: string): string {
  return `hsl(${stateHue(code)} 60% 18%)`;
}

/** Colour of a city pin: orange when open, dark ink when someone holds it. */
export function cityPin(claimed: boolean): string {
  return claimed ? "#1f2b3e" : "#f2a13c";
}


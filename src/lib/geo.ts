import { geoMercator, geoPath, type GeoProjection, type GeoPath } from "d3-geo";
import type { FeatureCollection, Geometry, Position } from "geojson";

export interface FeatureLayout {
  code: string;
  name: string;
  centroid: [number, number];
  area: number; // projected area in viewBox units
}

export interface MapGeom {
  projection: GeoProjection;
  path: GeoPath;
  viewBox: string; // "minX minY width height"
  layout: FeatureLayout[];
}

function eachCoord(geometry: { type?: string; coordinates?: unknown }, cb: (p: Position) => void) {
  if (!geometry || !geometry.coordinates) return;
  const visit = (o: unknown) => {
    if (Array.isArray(o)) {
      if (o.length >= 2 && typeof o[0] === "number" && typeof o[1] === "number") {
        cb(o as Position);
      } else {
        o.forEach(visit);
      }
    }
  };
  visit(geometry.coordinates);
}

/**
 * Build a Mercator projection for the given GeoJSON and return a tight viewBox
 * plus per-feature label layout. Crucially this derives the fit from the raw
 * projected POINTS (which d3 always projects correctly) rather than d3's
 * spherical geoBounds, which misreads simplified/near-equator rings as
 * world-spanning and would squash the map.
 */
export function buildMapGeom(geojson: FeatureCollection, width = 1000, height = 640, pad = 14): MapGeom {
  const projection = geoMercator();
  const path = geoPath(projection);

  // Pass 1: project every vertex at scale=1, translate=0 to get true relative
  // coordinates per feature.
  projection.scale(1).translate([0, 0]);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const perFeature: { code: string; name: string; pts: [number, number][]; lo: [number, number]; hi: [number, number] }[] = [];

  for (const f of geojson.features) {
    const pts: [number, number][] = [];
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    eachCoord(f.geometry as Geometry, (p) => {
      const pr = projection(p as [number, number]);
      if (!pr || !Number.isFinite(pr[0]) || !Number.isFinite(pr[1])) return;
      pts.push([pr[0], pr[1]]);
      x0 = Math.min(x0, pr[0]);
      y0 = Math.min(y0, pr[1]);
      x1 = Math.max(x1, pr[0]);
      y1 = Math.max(y1, pr[1]);
    });
    perFeature.push({
      code: f.properties?.code ?? "",
      name: f.properties?.name ?? "",
      pts,
      lo: [x0, y0],
      hi: [x1, y1],
    });
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  }

  // Fit: scale so the whole country fits the extent, preserving aspect.
  const dx = Math.max(1e-6, maxX - minX);
  const dy = Math.max(1e-6, maxY - minY);
  const k = Math.min((width - pad * 2) / dx, (height - pad * 2) / dy);
  projection.scale(k).translate([0, 0]);

  // Center the content in the extent.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  projection.translate([width / 2 - k * cx, height / 2 - k * cy]);

  // Final content bbox (for a tight viewBox) and per-feature layout.
  let fx0 = Infinity,
    fy0 = Infinity,
    fx1 = -Infinity,
    fy1 = -Infinity;
  const layout: FeatureLayout[] = [];
  for (const feat of perFeature) {
    const b: [number, number][] = [feat.lo, feat.hi]; // scale-1 coords
    const mapped0: [number, number] = [projection.translate()[0] + k * b[0][0], projection.translate()[1] + k * b[0][1]];
    const mapped1: [number, number] = [projection.translate()[0] + k * b[1][0], projection.translate()[1] + k * b[1][1]];
    const minx = Math.min(mapped0[0], mapped1[0]);
    const miny = Math.min(mapped0[1], mapped1[1]);
    const maxx = Math.max(mapped0[0], mapped1[0]);
    const maxy = Math.max(mapped0[1], mapped1[1]);
    fx0 = Math.min(fx0, minx);
    fy0 = Math.min(fy0, miny);
    fx1 = Math.max(fx1, maxx);
    fy1 = Math.max(fy1, maxy);
    // centroid = average of projected vertices (robust for labels)
    let sx = 0;
    let sy = 0;
    for (const [px, py] of feat.pts) {
      sx += projection.translate()[0] + k * px;
      sy += projection.translate()[1] + k * py;
    }
    layout.push({
      code: feat.code,
      name: feat.name,
      centroid: [sx / feat.pts.length, sy / feat.pts.length],
      area: Math.max(0, (maxx - minx) * (maxy - miny)),
    });
  }

  const viewBox = `${fx0 - pad} ${fy0 - pad} ${fx1 - fx0 + pad * 2} ${fy1 - fy0 + pad * 2}`;
  return { projection, path, viewBox, layout };
}

/** Interpolate between two colors (0..1). */
function mix(a: number[], b: number[], t: number) {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const EMPTY_COLOR = [220, 227, 235];
const OWNED_LOW = [214, 240, 224];
const OWNED_HIGH = [117, 199, 153];

/** Color a state by its total stake: empty = visible slate, claimed = green. */
export function colorForTotal(total: number, maxTotal: number): string {
  if (total <= 0) return `rgb(${EMPTY_COLOR.join(",")})`;
  const t = Math.log1p(total) / Math.log1p(Math.max(total, maxTotal, 1));
  return mix(OWNED_LOW, OWNED_HIGH, Math.min(1, 0.35 + 0.65 * t));
}

import { BRAND } from './brand';

/**
 * Synthetic geography for the staff map. The seed data has no coordinates, so substations and
 * feeder routes are placed deterministically around BRAND.demoMapCenter: the same code always
 * lands in the same place. They are illustrative (labelled as such in the UI), not real assets.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export type PremiseKind = 'known' | 'unenrolled' | 'unknown';

export interface PremisePoint extends LatLng {
  kind: PremiseKind;
}

const KM_PER_DEG_LAT = 111.32;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** FNV-1a 32-bit hash → [0, 1). Deterministic across platforms. */
export function hash01(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

/** Move `km` from a point along a compass-free bearing (radians, 0 = east, counter-clockwise). */
export function offsetKm(p: LatLng, bearing: number, km: number): LatLng {
  const dLat = (Math.sin(bearing) * km) / KM_PER_DEG_LAT;
  const dLng = (Math.cos(bearing) * km) / (KM_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180));
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

/** Distance in km (equirectangular; accurate enough at town scale). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const x = (b.lng - a.lng) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180) * KM_PER_DEG_LAT;
  const y = (b.lat - a.lat) * KM_PER_DEG_LAT;
  return Math.hypot(x, y);
}

function substationIndex(code: string): number {
  const m = /(\d+)\s*$/.exec(code);
  return m ? Number(m[1]) : 1 + Math.floor(hash01(code) * 50);
}

/**
 * Substation position: SUB-01 near the town centre, the rest on a golden-angle spiral
 * (about 3.2 km × √index from the centre), so the service area looks evenly spread.
 */
export function substationPosition(code: string, center: LatLng = BRAND.demoMapCenter): LatLng {
  const i = substationIndex(code);
  if (i <= 1) return offsetKm(center, hash01(code) * Math.PI * 2, 0.4);
  const radius = 3.2 * Math.sqrt(i - 1) + hash01(`${code}:r`) * 1.2;
  return offsetKm(center, (i - 1) * GOLDEN_ANGLE, radius);
}

/** Route length in km from the number of premises on the feeder (1–4 km). */
export function feederLengthKm(premises: number | null, evs: number): number {
  const size = premises ?? evs * 8;
  return 1 + Math.min(3, Math.max(0, size / 230));
}

/**
 * A feeder route: a polyline leaving the substation at an angle spread evenly between the
 * substation's feeders, with small deterministic bends so it reads like a street-following line.
 */
export function feederRoute(substationCode: string, feederCode: string, index: number, count: number, lengthKm: number, origin?: LatLng): LatLng[] {
  const start = origin ?? substationPosition(substationCode);
  const base = hash01(`${substationCode}:rot`) * Math.PI * 2;
  const bearing = base + (index / Math.max(1, count)) * Math.PI * 2;
  const segments = 5;
  const step = lengthKm / segments;
  const points: LatLng[] = [start];
  let p = start;
  for (let s = 0; s < segments; s++) {
    const bend = (hash01(`${feederCode}:${s}`) - 0.5) * (Math.PI / 5); // ±18°
    p = offsetKm(p, bearing + bend, step);
    points.push(p);
  }
  return points;
}

/** Point at fraction t (0–1) of the polyline's length. */
export function pointAlong(route: LatLng[], t: number): LatLng {
  if (route.length < 2) return route[0];
  const lens = route.slice(1).map((p, i) => distanceKm(route[i], p));
  const total = lens.reduce((a, b) => a + b, 0);
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i] || i === lens.length - 1) {
      const f = lens[i] === 0 ? 0 : Math.min(1, target / lens[i]);
      return { lat: route[i].lat + (route[i + 1].lat - route[i].lat) * f, lng: route[i].lng + (route[i + 1].lng - route[i].lng) * f };
    }
    target -= lens[i];
  }
  return route[route.length - 1];
}

/** Bearing (radians, 0 = east, counter-clockwise) of the route at fraction t. */
function bearingAt(route: LatLng[], t: number): number {
  const a = pointAlong(route, Math.max(0, t - 0.01));
  const b = pointAlong(route, Math.min(1, t + 0.01));
  const x = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  const y = b.lat - a.lat;
  return x === 0 && y === 0 ? 0 : Math.atan2(y, x);
}

/**
 * EV premises along the route like houses on a street: set back 30–70 m on alternating sides of the
 * line, at irregular spacing. Known vs unenrolled follows the feeder's split; `unknown` when the split
 * is not in the sample. At most `max` dots.
 */
export function premisePoints(route: LatLng[], feederCode: string, evs: number, known: number | null, max = 40): PremisePoint[] {
  const n = Math.min(max, Math.max(0, evs));
  if (n === 0) return [];
  const knownDots = known === null ? 0 : Math.round((n * known) / Math.max(1, evs));
  // Shuffle which dots are "known" deterministically so the colours mix along the street.
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => hash01(`${feederCode}:k${a}`) - hash01(`${feederCode}:k${b}`));
  const knownSet = new Set(order.slice(0, knownDots));
  return Array.from({ length: n }, (_, k) => {
    const t = 0.06 + 0.92 * ((k + 0.85 * hash01(`${feederCode}:t${k}`)) / n);
    const along = pointAlong(route, t);
    const side = hash01(`${feederCode}:s${k}`) < 0.5 ? 1 : -1;
    const setbackKm = 0.03 + 0.04 * hash01(`${feederCode}:d${k}`);
    const p = offsetKm(along, bearingAt(route, t) + (side * Math.PI) / 2, setbackKm);
    const kind: PremiseKind = known === null ? 'unknown' : knownSet.has(k) ? 'known' : 'unenrolled';
    return { ...p, kind };
  });
}

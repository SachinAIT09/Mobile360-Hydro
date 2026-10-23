#!/usr/bin/env node
/**
 * Pre-generates road-following feeder routes for the staff map.
 *
 *   node scripts/gen-feeder-routes.mjs        (needs internet; ~3–4 minutes)
 *
 * Substation positions come from packages/shared/src/geo.ts (synthetic, around BRAND.demoMapCenter),
 * snapped to the nearest road. Each feeder leaves the substation on its own bearing and is routed
 * along real streets with the public OSRM demo server (OpenStreetMap data, © OpenStreetMap
 * contributors, ODbL). The result is written once to apps/web/src/data/feeder-routes.json, so the
 * running demo never calls a routing service. Requests are throttled to stay well within the demo
 * server's fair-use policy. Run `pnpm build:shared` first.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const geo = require(resolve(root, 'packages/shared/dist/index.js'));
const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const OUT = resolve(root, 'apps/web/src/data/feeder-routes.json');
const UA = 'hydro-one-ev-demo/1.0 (one-off feeder route generation)';
const GAP_MS = 700;

// ---- substations and feeder counts from the seed (same file the API seeds from)
const seedSrc = readFileSync(resolve(root, 'apps/api/src/seed/seed-data.ts'), 'utf8');
const live = [...seedSrc.matchAll(/\['(SUB-\d+)',\s*(\d+),\s*(\d+),\s*([\d.]+),\s*(\d+)\]/g)].map((m) => ({ code: m[1], feeders: Number(m[5]) }));
const deadBlock = seedSrc.slice(seedSrc.indexOf('DEAD_SUBSTATIONS'));
const dead = [...deadBlock.matchAll(/\['(SUB-\d+)',\s*(\d+),\s*(\d+)\]/g)].map((m) => ({ code: m[1], feeders: Number(m[2]) }));
const substations = [...live, ...dead];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function osrm(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(GAP_MS * (attempt + 1));
    try {
      const r = await fetch(`${OSRM}${path}`, { headers: { 'User-Agent': UA } });
      if (r.ok) {
        const j = await r.json();
        if (j.code === 'Ok') return j;
      }
    } catch {
      /* retry */
    }
  }
  return null;
}
const lngLat = (p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;

async function snap(p) {
  const j = await osrm(`/nearest/v1/driving/${lngLat(p)}?number=1`);
  const loc = j?.waypoints?.[0]?.location;
  return loc ? { lat: loc[1], lng: loc[0] } : p;
}

/** Douglas–Peucker in a local metric frame. */
function simplify(points, tolM) {
  if (points.length < 3) return points;
  const lat0 = (points[0].lat * Math.PI) / 180;
  const xy = points.map((p) => [p.lng * 111320 * Math.cos(lat0), p.lat * 110540]);
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0;
    let idx = -1;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / len;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tolM && idx > 0) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Cut a polyline after `maxKm` of travel. */
function cut(points, maxKm) {
  const out = [points[0]];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const d = geo.distanceKm(points[i - 1], points[i]);
    if (acc + d > maxKm) break;
    acc += d;
    out.push(points[i]);
  }
  return out;
}

const round = (p) => [Number(p.lat.toFixed(5)), Number(p.lng.toFixed(5))];

const result = { generatedAt: new Date().toISOString(), source: 'OpenStreetMap road network via OSRM; positions are illustrative', substations: {} };
let ok = 0;
let failed = 0;
for (const s of substations) {
  const anchor = await snap(geo.substationPosition(s.code));
  const entry = { at: round(anchor), feeders: {} };
  const base = geo.hash01(`${s.code}:rot`) * Math.PI * 2;
  for (let i = 0; i < s.feeders; i++) {
    const code = `${s.code}-F${i + 1}`;
    const bearing = base + (i / s.feeders) * Math.PI * 2;
    const lengthKm = 1.4 + geo.hash01(`${code}:len`) * 2.2; // 1.4–3.6 km
    const start = await snap(geo.offsetKm(anchor, bearing, 0.22));
    const end = geo.offsetKm(anchor, bearing + (geo.hash01(`${code}:end`) - 0.5) * 0.5, lengthKm);
    const j = await osrm(`/route/v1/driving/${lngLat(start)};${lngLat(end)}?overview=full&geometries=geojson`);
    const coords = j?.routes?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      failed++;
      process.stdout.write('x');
      continue;
    }
    // Lead-out from the substation to the first street, then the street route.
    const path = [anchor, ...coords.map(([lng, lat]) => ({ lat, lng }))];
    entry.feeders[code] = simplify(cut(path, lengthKm * 1.5), 6).map(round);
    ok++;
    process.stdout.write('.');
  }
  result.substations[s.code] = entry;
  process.stdout.write(` ${s.code}\n`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result));
console.log(`\nWrote ${OUT}: ${ok} feeder routes, ${failed} failed (those fall back to synthetic routes at runtime).`);

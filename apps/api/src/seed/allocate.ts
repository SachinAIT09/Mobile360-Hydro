/**
 * Pure seed helpers: how a substation's EV total is split across its feeders, and which region a
 * substation belongs to. No I/O, so they can be unit-tested.
 */
import type { LiveFeederSpec } from './seed-data.js';

export interface FeederAllocation {
  code: string;
  /** EVs on this feeder: known + unenrolled for live feeders, a static count otherwise. */
  evs: number;
  live: boolean;
}

/**
 * Splits `totalEvs` across `${substationCode}-F1..Fn`. Live feeders (per-customer data) keep their
 * seeded known + unenrolled; the remainder is spread over the static feeders with descending weights
 * (F1 gets the most), at least 1 per static feeder when the remainder allows, and the sum always
 * equals `totalEvs`.
 */
export function allocateFeederEvs(
  substationCode: string,
  totalEvs: number,
  feederCount: number,
  liveFeeders: Record<string, LiveFeederSpec>,
): FeederAllocation[] {
  const codes = Array.from({ length: feederCount }, (_, k) => `${substationCode}-F${k + 1}`);
  const liveEvs = codes.reduce((s, c) => s + (liveFeeders[c] ? liveFeeders[c].known + liveFeeders[c].unenrolled : 0), 0);
  const staticCodes = codes.filter((c) => !liveFeeders[c]);
  const remaining = totalEvs - liveEvs;
  const weights = staticCodes.map((_, k) => staticCodes.length - k);
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const alloc = weights.map((w) => Math.max(1, Math.floor((remaining * w) / wsum)));
  let diff = remaining - alloc.reduce((a, b) => a + b, 0);
  // Hand out (or take back) the rounding difference one EV at a time, round-robin.
  for (let k = 0, guard = 0; diff !== 0 && staticCodes.length && guard < 10000; k = (k + 1) % staticCodes.length, guard++) {
    if (diff > 0) {
      alloc[k]++;
      diff--;
    } else if (alloc[k] > 1) {
      alloc[k]--;
      diff++;
    }
  }
  return codes.map((code) => {
    const live = liveFeeders[code];
    return live
      ? { code, evs: live.known + live.unenrolled, live: true }
      : { code, evs: alloc[staticCodes.indexOf(code)], live: false };
  });
}

/** Service regions, assigned round-robin by substation index (SUB-01 is Central). */
export const REGIONS = ['Central', 'East', 'Northwest', 'South'] as const;
export type Region = (typeof REGIONS)[number];

export function regionForIndex(index: number): Region {
  return REGIONS[((index % REGIONS.length) + REGIONS.length) % REGIONS.length];
}

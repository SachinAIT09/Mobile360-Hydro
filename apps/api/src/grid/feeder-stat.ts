import type { BlindSpot, FeederStat } from '@demo/shared';
import type { FeederDoc } from '../db/schemas.js';
import { pctText, roundHalfEven } from '../common/numbers.js';

/** Live counts for one feeder, computed from enrollments/detections. */
export interface LiveCounts {
  /** Customers with an ACTIVE enrollment. */
  known: number;
  /** DETECTED EVs without an ACTIVE enrollment. */
  unenrolled: number;
  /** Enrolled customers who also have a detection. */
  confirmed: number;
  /** Ground-truth-validated customers with an EV signal. */
  groundTruth: number;
}

export const EMPTY_COUNTS: LiveCounts = { known: 0, unenrolled: 0, confirmed: 0, groundTruth: 0 };

/** Feeders need at least this many EVs to show up in the blind-spot ranking. */
export const BLIND_SPOT_MIN_EVS = 15;
export const BLIND_SPOT_LIMIT = 8;
export const DEFAULT_REGION = 'Central';

/**
 * Feeder visibility numbers. Live feeders are computed from `live` counts (penetration = EVs / premises,
 * invisible = unenrolled / EVs, both half-even rounded to 1 decimal); other feeders carry static seed stats.
 */
export function toFeederStat(f: FeederDoc, live?: LiveCounts): FeederStat {
  if (!f.live) {
    return {
      code: f.code, substationCode: f.substationCode, evs: f.staticEvs, known: null, unenrolled: null,
      confirmedByEnrollment: null, groundTruthValidated: null, premises: null, penetrationPct: null,
      invisiblePct: null, forecastLoadPct: f.forecastLoadPct ?? null,
    };
  }
  const c = live ?? EMPTY_COUNTS;
  const evs = c.known + c.unenrolled;
  const premises = f.premisesCount ?? null;
  return {
    code: f.code,
    substationCode: f.substationCode,
    evs,
    known: c.known,
    unenrolled: c.unenrolled,
    confirmedByEnrollment: c.confirmed,
    groundTruthValidated: c.groundTruth,
    premises,
    penetrationPct: premises ? roundHalfEven((evs / premises) * 100, 1) : null,
    invisiblePct: evs ? roundHalfEven((c.unenrolled / evs) * 100, 1) : 0,
    forecastLoadPct: f.forecastLoadPct ?? null,
  };
}

/**
 * Feeders with ≥15 EVs ranked by share invisible to enrollment (ties: more EVs first), top 8.
 * `regionOf` maps a substation code to its service region (defaults to "Central" when unknown).
 */
export function rankBlindSpots(stats: readonly FeederStat[], regionOf: (substationCode: string) => string | undefined = () => undefined): BlindSpot[] {
  return stats
    .filter((s) => s.evs >= BLIND_SPOT_MIN_EVS && s.known !== null && s.unenrolled !== null)
    .map((s) => ({ s, gap: roundHalfEven(((s.unenrolled ?? 0) / s.evs) * 100, 1) }))
    .sort((a, b) => b.gap - a.gap || b.s.evs - a.s.evs)
    .slice(0, BLIND_SPOT_LIMIT)
    .map(({ s, gap }, i) => ({
      rank: i + 1,
      feederCode: s.code,
      substationCode: s.substationCode,
      region: regionOf(s.substationCode) ?? DEFAULT_REGION,
      known: s.known ?? 0,
      unenrolled: s.unenrolled ?? 0,
      penetrationText: `${pctText(s.penetrationPct ?? 0)}% of ${s.premises ?? 0}`,
      gapPct: gap,
    }));
}

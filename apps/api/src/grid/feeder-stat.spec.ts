import { describe, expect, it } from 'vitest';
import type { FeederDoc } from '../db/schemas.js';
import { BLIND_SPOT_LIMIT, EMPTY_COUNTS, rankBlindSpots, toFeederStat, type LiveCounts } from './feeder-stat.js';

function feeder(code: string, over: Partial<FeederDoc> = {}): FeederDoc {
  const n = Number(code.split('-F')[1] ?? 1);
  return {
    code,
    substationCode: code.replace(/-F\d+$/, ''),
    order: n,
    live: true,
    premisesCount: 665,
    capacityKw: 5000,
    forecastLoadPct: null,
    staticEvs: 0,
    seedKnown: 0,
    seedUnenrolled: 0,
    ...over,
  };
}

const counts = (known: number, unenrolled: number, confirmed = 0, groundTruth = 0): LiveCounts => ({ known, unenrolled, confirmed, groundTruth });

describe('toFeederStat', () => {
  it('computes the seeded SUB-01-F1 figures: 69 known + 77 unenrolled on 665 premises', () => {
    const s = toFeederStat(feeder('SUB-01-F1'), counts(69, 77, 54, 23));
    expect(s).toMatchObject({
      code: 'SUB-01-F1',
      substationCode: 'SUB-01',
      evs: 146,
      known: 69,
      unenrolled: 77,
      confirmedByEnrollment: 54,
      groundTruthValidated: 23,
      premises: 665,
      penetrationPct: 22,
      invisiblePct: 52.7,
      forecastLoadPct: null,
    });
  });

  it('rounds penetration and invisible share half-to-even at one decimal', () => {
    // 1 / 400 = 0.25% → 0.2 (half, even); 3 / 400 = 0.75% → 0.8 (half, odd rounds up)
    expect(toFeederStat(feeder('S-F1', { premisesCount: 400 }), counts(1, 0)).penetrationPct).toBe(0.2);
    expect(toFeederStat(feeder('S-F1', { premisesCount: 400 }), counts(2, 1)).penetrationPct).toBe(0.8);
    // 1 of 8 invisible = 12.5% → 12.5 is not a half at one decimal; 1 of 16 = 6.25% → 6.2
    expect(toFeederStat(feeder('S-F1'), counts(7, 1)).invisiblePct).toBe(12.5);
    expect(toFeederStat(feeder('S-F1'), counts(15, 1)).invisiblePct).toBe(6.2);
    // 3 of 16 = 18.75% → 18.8
    expect(toFeederStat(feeder('S-F1'), counts(13, 3)).invisiblePct).toBe(18.8);
  });

  it('treats a live feeder with no counts as empty, and no EVs as 0% invisible', () => {
    const s = toFeederStat(feeder('S-F1'));
    expect(s).toMatchObject({ evs: 0, known: 0, unenrolled: 0, penetrationPct: 0, invisiblePct: 0 });
    expect(toFeederStat(feeder('S-F1'), EMPTY_COUNTS)).toEqual(s);
  });

  it('has no penetration when the premises count is unknown', () => {
    expect(toFeederStat(feeder('S-F1', { premisesCount: null }), counts(5, 5)).penetrationPct).toBeNull();
    expect(toFeederStat(feeder('S-F1', { premisesCount: null }), counts(5, 5)).premises).toBeNull();
  });

  it('passes static feeders through with null visibility fields', () => {
    const s = toFeederStat(feeder('SUB-02-F3', { live: false, staticEvs: 41, forecastLoadPct: 92 }), counts(9, 9));
    expect(s).toEqual({
      code: 'SUB-02-F3',
      substationCode: 'SUB-02',
      evs: 41,
      known: null,
      unenrolled: null,
      confirmedByEnrollment: null,
      groundTruthValidated: null,
      premises: null,
      penetrationPct: null,
      invisiblePct: null,
      forecastLoadPct: 92,
    });
  });
});

describe('rankBlindSpots', () => {
  // The seeded SUB-01 splits (known / unenrolled / premises).
  const seeded = [
    toFeederStat(feeder('SUB-01-F1', { premisesCount: 665 }), counts(69, 77)),
    toFeederStat(feeder('SUB-01-F2', { premisesCount: 650 }), counts(46, 44)),
    toFeederStat(feeder('SUB-01-F3', { premisesCount: 500 }), counts(38, 35)),
    toFeederStat(feeder('SUB-01-F4', { premisesCount: 460 }), counts(15, 34)),
    toFeederStat(feeder('SUB-01-F5', { premisesCount: 300 }), counts(23, 21)),
    toFeederStat(feeder('SUB-01-F6', { premisesCount: 250 }), counts(19, 19)),
    toFeederStat(feeder('SUB-01-F7', { premisesCount: 170 }), counts(12, 11)),
  ];

  it('ranks by share invisible, descending, with 1-based ranks', () => {
    const ranked = rankBlindSpots(seeded);
    // gaps: F4 69.4, F1 52.7, F6 50, F2 48.9, F3 47.9, F7 47.8, F5 47.7
    expect(ranked.map((b) => b.feederCode)).toEqual(['SUB-01-F4', 'SUB-01-F1', 'SUB-01-F6', 'SUB-01-F2', 'SUB-01-F3', 'SUB-01-F7', 'SUB-01-F5']);
    expect(ranked.map((b) => b.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ranked[0]).toMatchObject({ substationCode: 'SUB-01', known: 15, unenrolled: 34, gapPct: 69.4, penetrationText: '10.7% of 460', region: 'Central' });
    expect(ranked[1].gapPct).toBe(52.7);
    expect(ranked[1].penetrationText).toBe('22% of 665');
  });

  it('breaks gap ties by EV count, larger first', () => {
    const tied = [
      toFeederStat(feeder('A-F1', { premisesCount: 100 }), counts(10, 10)),
      toFeederStat(feeder('B-F1', { premisesCount: 100 }), counts(20, 20)),
    ];
    expect(rankBlindSpots(tied).map((b) => b.feederCode)).toEqual(['B-F1', 'A-F1']);
  });

  it('drops feeders with fewer than 15 EVs and static feeders', () => {
    const stats = [
      toFeederStat(feeder('A-F1'), counts(7, 7)), // 14 EVs
      toFeederStat(feeder('A-F2'), counts(5, 10)), // 15 EVs
      toFeederStat(feeder('A-F3', { live: false, staticEvs: 400 })),
    ];
    expect(rankBlindSpots(stats).map((b) => b.feederCode)).toEqual(['A-F2']);
  });

  it('returns at most eight entries', () => {
    const many = Array.from({ length: 12 }, (_, i) => toFeederStat(feeder(`S-F${i + 1}`), counts(20, 20 + i)));
    const ranked = rankBlindSpots(many);
    expect(ranked).toHaveLength(BLIND_SPOT_LIMIT);
    expect(ranked[0].feederCode).toBe('S-F12');
  });

  it('looks up the region per substation', () => {
    const ranked = rankBlindSpots(seeded, (code) => (code === 'SUB-01' ? 'East' : undefined));
    expect(ranked.every((b) => b.region === 'East')).toBe(true);
  });
});

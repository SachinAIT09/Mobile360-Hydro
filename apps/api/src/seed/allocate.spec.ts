import { describe, expect, it } from 'vitest';
import { allocateFeederEvs, REGIONS, regionForIndex } from './allocate.js';
import { LIVE_FEEDERS, SUBSTATIONS } from './seed-data.js';

describe('allocateFeederEvs', () => {
  it('sums to the substation total for every seeded substation', () => {
    for (const [code, evs, , , feederCount] of SUBSTATIONS) {
      const alloc = allocateFeederEvs(code, evs, feederCount, LIVE_FEEDERS);
      expect(alloc).toHaveLength(feederCount);
      expect(alloc.reduce((s, a) => s + a.evs, 0), code).toBe(evs);
      for (const a of alloc) expect(a.evs, a.code).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps live feeders at known + unenrolled', () => {
    const alloc = allocateFeederEvs('SUB-01', 463, 7, LIVE_FEEDERS);
    expect(alloc.find((a) => a.code === 'SUB-01-F1')).toEqual({ code: 'SUB-01-F1', evs: 146, live: true });
    expect(alloc.every((a) => a.live)).toBe(true);
  });

  it('gives static feeders descending counts that add up', () => {
    const alloc = allocateFeederEvs('SUB-02', 436, 9, {});
    const evs = alloc.map((a) => a.evs);
    expect(evs).toEqual([...evs].sort((a, b) => b - a));
    expect(evs.reduce((s, n) => s + n, 0)).toBe(436);
  });
});

describe('regionForIndex', () => {
  it('starts at Central and cycles through the four regions', () => {
    expect(regionForIndex(0)).toBe('Central');
    expect(REGIONS.map((_, i) => regionForIndex(i))).toEqual([...REGIONS]);
    expect(regionForIndex(4)).toBe('Central');
  });
});

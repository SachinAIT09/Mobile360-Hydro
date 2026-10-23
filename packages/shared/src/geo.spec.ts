import { describe, expect, it } from 'vitest';
import { BRAND } from './brand';
import { distanceKm, feederLengthKm, feederRoute, hash01, pointAlong, premisePoints, substationPosition } from './geo';

const C = BRAND.demoMapCenter;

describe('hash01', () => {
  it('is deterministic and in [0, 1)', () => {
    for (const k of ['SUB-01', 'SUB-01-F1', '', 'x']) {
      expect(hash01(k)).toBe(hash01(k));
      expect(hash01(k)).toBeGreaterThanOrEqual(0);
      expect(hash01(k)).toBeLessThan(1);
    }
    expect(hash01('SUB-01')).not.toBe(hash01('SUB-02'));
  });
});

describe('substationPosition', () => {
  it('puts SUB-01 within 1 km of the town centre and is stable', () => {
    expect(distanceKm(C, substationPosition('SUB-01'))).toBeLessThan(1);
    expect(substationPosition('SUB-01')).toEqual(substationPosition('SUB-01'));
  });
  it('spreads the other substations 3–25 km out without stacking them', () => {
    const pts = Array.from({ length: 51 }, (_, i) => substationPosition(`SUB-${String(i + 1).padStart(2, '0')}`));
    for (const p of pts.slice(1)) {
      const d = distanceKm(C, p);
      expect(d).toBeGreaterThan(2.5);
      expect(d).toBeLessThan(25);
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(distanceKm(pts[i], pts[j])).toBeGreaterThan(0.8);
  });
});

describe('feederRoute', () => {
  it('starts at the substation and runs about the requested length', () => {
    const route = feederRoute('SUB-01', 'SUB-01-F1', 0, 7, 3);
    expect(route[0]).toEqual(substationPosition('SUB-01'));
    const straight = distanceKm(route[0], route[route.length - 1]);
    expect(straight).toBeGreaterThan(2.4);
    expect(straight).toBeLessThanOrEqual(3.0001);
  });
  it('sends different feeders of one substation in different directions', () => {
    const ends = Array.from({ length: 7 }, (_, i) => feederRoute('SUB-01', `SUB-01-F${i + 1}`, i, 7, 2).at(-1)!);
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) expect(distanceKm(ends[i], ends[j])).toBeGreaterThan(0.5);
  });
  it('scales length with premises, 1–4 km', () => {
    expect(feederLengthKm(0, 0)).toBe(1);
    expect(feederLengthKm(665, 146)).toBeGreaterThan(feederLengthKm(170, 23));
    expect(feederLengthKm(100000, 1)).toBe(4);
  });
});

describe('pointAlong', () => {
  it('returns the ends at 0 and 1', () => {
    const r = feederRoute('SUB-02', 'SUB-02-F1', 0, 3, 2);
    expect(pointAlong(r, 0)).toEqual(r[0]);
    const end = pointAlong(r, 1);
    expect(distanceKm(end, r.at(-1)!)).toBeLessThan(1e-6);
  });
});

describe('premisePoints', () => {
  const route = feederRoute('SUB-01', 'SUB-01-F1', 0, 7, 3);
  it('caps the number of dots and follows the known/unenrolled split', () => {
    const pts = premisePoints(route, 'SUB-01-F1', 146, 69, 40);
    expect(pts).toHaveLength(40);
    expect(pts.filter((p) => p.kind === 'known')).toHaveLength(Math.round((40 * 69) / 146));
    expect(pts.every((p) => p.kind !== 'unknown')).toBe(true);
  });
  it('marks every dot unknown when the split is not in the sample', () => {
    expect(premisePoints(route, 'SUB-09-F1', 12, null).every((p) => p.kind === 'unknown')).toBe(true);
  });
  it('keeps dots within about 200 m of the route and is deterministic', () => {
    const pts = premisePoints(route, 'SUB-01-F1', 30, 10);
    expect(pts).toEqual(premisePoints(route, 'SUB-01-F1', 30, 10));
    for (const p of pts) {
      const nearest = Math.min(...Array.from({ length: 41 }, (_, i) => distanceKm(p, pointAlong(route, i / 40))));
      expect(nearest).toBeLessThan(0.25);
    }
  });
  it('returns nothing for a feeder without EVs', () => {
    expect(premisePoints(route, 'SUB-01-F9', 0, 0)).toEqual([]);
  });
});

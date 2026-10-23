import { describe, expect, it } from 'vitest';
import { EV_CHARGE_KW, baseKw, historicalEvKw, point, solarKw } from './energy.model.js';

describe('solarKw', () => {
  it('is zero at night and at the dawn/dusk boundaries', () => {
    for (const h of [0, 3, 6, 7.5, 17.5, 20, 23.99]) expect(solarKw(h, true)).toBe(0);
  });

  it('is zero without panels, even at noon', () => {
    expect(solarKw(12.5, false)).toBe(0);
  });

  it('peaks around 12:30 at a little over 1.1 kW and is the daily maximum', () => {
    const peak = solarKw(12.5, true);
    expect(peak).toBeGreaterThan(1.1);
    expect(peak).toBeLessThanOrEqual(1.15);
    for (let h = 0; h < 24; h += 0.25) expect(solarKw(h, true)).toBeLessThanOrEqual(peak + 1e-12);
  });

  it('is symmetric around 12:30 and never negative', () => {
    expect(solarKw(9, true)).toBeCloseTo(solarKw(16, true), 10);
    expect(solarKw(8, true)).toBeGreaterThan(0);
    expect(solarKw(17, true)).toBeGreaterThan(0);
    expect(solarKw(8, true)).toBeLessThan(solarKw(10, true));
  });
});

describe('baseKw', () => {
  it('adds the evening and morning bumps on top of the 0.55 kW floor', () => {
    const k = 17;
    const night = baseKw(2, k);
    expect(night).toBeCloseTo(0.55, 1);
    expect(baseKw(18, k) - night).toBeCloseTo(0.45, 10);
    expect(baseKw(7, k) - night).toBeCloseTo(0.3, 10);
    expect(baseKw(22, k)).toBeCloseTo(night, 10);
  });

  it('noise is deterministic per key and bounded to ±0.05 kW', () => {
    expect(baseKw(12, 5)).toBe(baseKw(12, 5));
    for (let key = 0; key < 500; key++) {
      const v = baseKw(12, key);
      expect(v).toBeGreaterThanOrEqual(0.5 - 1e-12);
      expect(v).toBeLessThanOrEqual(0.6 + 1e-12);
    }
  });
});

describe('historicalEvKw', () => {
  it('charges 6–11 PM only when the home has an EV', () => {
    expect(historicalEvKw(18, true)).toBe(EV_CHARGE_KW);
    expect(historicalEvKw(22.9, true)).toBe(EV_CHARGE_KW);
    expect(historicalEvKw(23, true)).toBe(0);
    expect(historicalEvKw(17.9, true)).toBe(0);
    expect(historicalEvKw(20, false)).toBe(0);
  });
});

describe('point', () => {
  const hours = Array.from({ length: 96 }, (_, i) => i / 4);

  it('breakdown (always-on + heating + other) sums to baseKw', () => {
    for (const h of hours) {
      const p = point(h, Math.round(h * 4), { hasSolar: true, evKw: 0 });
      expect(p.alwaysOnKw).toBe(0.25);
      expect(p.alwaysOnKw + p.heatingKw + p.otherKw).toBeCloseTo(p.baseKw, 10);
      expect(p.heatingKw).toBeCloseTo((p.baseKw - 0.25) * 0.45, 10);
    }
  });

  it('import and export are complementary: never both, and their difference is home − solar', () => {
    for (const evKw of [0, EV_CHARGE_KW]) {
      for (const h of hours) {
        const p = point(h, 1, { hasSolar: true, evKw });
        expect(p.gridImportKw * p.gridExportKw).toBe(0);
        expect(p.gridImportKw - p.gridExportKw).toBeCloseTo(p.homeKw - p.solarKw, 10);
        expect(p.homeKw).toBeCloseTo(p.baseKw + evKw, 10);
      }
    }
  });

  it('a solar home exports at midday and imports everything at night', () => {
    const noon = point(12.5, 1, { hasSolar: true, evKw: 0 });
    expect(noon.gridExportKw).toBeGreaterThan(0);
    expect(noon.gridImportKw).toBe(0);
    const night = point(2, 1, { hasSolar: true, evKw: 0 });
    expect(night.solarKw).toBe(0);
    expect(night.gridImportKw).toBeCloseTo(night.homeKw, 10);
  });

  it('a charging EV at noon turns the solar home into an importer', () => {
    const p = point(12.5, 1, { hasSolar: true, evKw: EV_CHARGE_KW });
    expect(p.evKw).toBe(7.2);
    expect(p.gridExportKw).toBe(0);
    expect(p.gridImportKw).toBeCloseTo(p.baseKw + 7.2 - p.solarKw, 10);
  });
});

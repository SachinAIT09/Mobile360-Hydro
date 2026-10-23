import { describe, expect, it } from 'vitest';
import { CHARGING_DUTY, MAX_CREDITED_HOURS, creditedHours, kwhShifted, peakReducedKwPerHousehold, peakReducedMw } from './dr-result.js';

describe('creditedHours', () => {
  it('defaults to 3 h and caps at 3 h', () => {
    expect(creditedHours(null)).toBe(3);
    expect(creditedHours(undefined)).toBe(3);
    expect(creditedHours(0)).toBe(3);
    expect(creditedHours(2)).toBe(2);
    expect(creditedHours(5)).toBe(MAX_CREDITED_HOURS);
  });
});

describe('kwhShifted', () => {
  it('a 3-hour window shifts 19.8 kWh per paused household', () => {
    expect(kwhShifted(3)).toBe(19.8);
    expect(kwhShifted(null)).toBe(19.8);
    expect(kwhShifted(6)).toBe(19.8);
  });

  it('scales with shorter windows to one decimal', () => {
    expect(kwhShifted(1)).toBe(6.6);
    expect(kwhShifted(2)).toBe(13.2);
    expect(kwhShifted(1.5)).toBe(9.9);
  });

  it('is derived from 7.2 kW × hours × duty', () => {
    expect(7.2 * 3 * CHARGING_DUTY).toBeCloseTo(19.8, 1);
  });
});

describe('peak reduction', () => {
  it('credits a full charger per paused household', () => {
    expect(peakReducedKwPerHousehold).toBe(7.2);
  });

  it('is paused × 7.2 / 1000 MW to three decimals', () => {
    expect(peakReducedMw(0)).toBe(0);
    expect(peakReducedMw(1)).toBe(0.007);
    expect(peakReducedMw(118)).toBe(0.85);
    expect(peakReducedMw(284)).toBe(2.045);
    expect(peakReducedMw(1000)).toBe(7.2);
  });
});

import { describe, expect, it } from 'vitest';
import { localHour, zonedTime } from '../common/time.js';
import { config } from '../config.js';
import { historicalEvKw, point } from './energy.model.js';
import { integrate } from './integrate.js';

/** Verbatim copy of EnergyService.integrate before the extraction (the reference for non-smart customers). */
function legacyIntegrate(from: Date, to: Date, hasSolar: boolean, hasEv: boolean, nowEvKw: number | null, now: Date) {
  const acc = { prod: 0, cons: 0, self: 0, exp: 0, imp: 0, ev: 0, heating: 0, alwaysOn: 0, other: 0, peakW: 0, peakAt: null as Date | null };
  const step = 15 * 60000;
  for (let t = from.getTime(); t < to.getTime(); t += step) {
    const dtH = Math.min(step, to.getTime() - t) / 3600000;
    const at = new Date(t);
    const h = localHour(at);
    const isNow = nowEvKw !== null && now.getTime() - t < step && now.getTime() >= t;
    const evKw = isNow ? nowEvKw : historicalEvKw(h, hasEv);
    const p = point(h, Math.floor(t / step), { hasSolar, evKw });
    acc.prod += p.solarKw * dtH;
    acc.cons += p.homeKw * dtH;
    acc.self += Math.min(p.solarKw, p.homeKw) * dtH;
    acc.exp += p.gridExportKw * dtH;
    acc.imp += p.gridImportKw * dtH;
    acc.ev += p.evKw * dtH;
    acc.heating += p.heatingKw * dtH;
    acc.alwaysOn += p.alwaysOnKw * dtH;
    acc.other += p.otherKw * dtH;
    if (p.solarKw * 1000 > acc.peakW) {
      acc.peakW = p.solarKw * 1000;
      acc.peakAt = at;
    }
  }
  return acc;
}

const tz = config.timezone;
const midnight = zonedTime(2026, 10, 21, 0, 0, tz);
const nows = [zonedTime(2026, 10, 21, 0, 7, tz), zonedTime(2026, 10, 21, 12, 34, tz), zonedTime(2026, 10, 21, 19, 2, tz), zonedTime(2026, 10, 21, 23, 59, tz)];

describe('integrate (extracted) is identical to the legacy implementation for non-smart customers', () => {
  for (const hasSolar of [true, false])
    for (const hasEv of [true, false])
      for (const nowEvKw of [7.2, 0, null])
        it(`solar=${hasSolar} ev=${hasEv} nowEvKw=${nowEvKw}`, () => {
          for (const now of nows) {
            const legacyToday = legacyIntegrate(midnight, now, hasSolar, hasEv, nowEvKw, now);
            const today = integrate({ from: midnight, to: now, hasSolar, evKwAt: (_t, h) => historicalEvKw(h, hasEv), nowEvKw, now });
            const { cost, ...rest } = today;
            expect(rest).toEqual(legacyToday);
            expect(cost).toBe(0);
            const end = new Date(midnight.getTime() + 86400000);
            const day: Partial<ReturnType<typeof integrate>> = integrate({ from: midnight, to: end, hasSolar, evKwAt: (_t, h) => historicalEvKw(h, hasEv), nowEvKw: null, now });
            delete day.cost;
            expect(day).toEqual(legacyIntegrate(midnight, end, hasSolar, hasEv, null, now));
          }
        });
});

describe('integrate cost accumulator', () => {
  it('sums costOf over the grid import of each step', () => {
    const end = new Date(midnight.getTime() + 86400000);
    const r = integrate({ from: midnight, to: end, hasSolar: true, evKwAt: () => 0, nowEvKw: null, now: midnight, costOf: (_t, _h, kwh) => kwh * 0.1 });
    expect(r.cost).toBeCloseTo(r.imp * 0.1, 10);
  });

  it('uses the evKwAt callback per step', () => {
    const end = new Date(midnight.getTime() + 86400000);
    const r = integrate({ from: midnight, to: end, hasSolar: false, evKwAt: (_t, h) => (h >= 1 && h < 3 ? 7.2 : 0), nowEvKw: null, now: midnight });
    expect(r.ev).toBeCloseTo(14.4, 10);
  });
});

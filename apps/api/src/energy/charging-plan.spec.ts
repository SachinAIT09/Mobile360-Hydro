import { describe, expect, it } from 'vitest';
import type { ChargeSlot } from '@demo/shared';
import { zonedTime } from '../common/time.js';
import {
  avgEvKw,
  baseline,
  defaultNightShift,
  evKwAt,
  localClock,
  planCharging,
  repeatDaily,
  sessionFor,
  slotSteps,
  summarisePlan,
  type PlanInput,
} from './charging-plan.js';

const TZ = 'America/Toronto';
/** Local wall-clock instant in Toronto, October 2026 (Oct 21 = Wednesday, Oct 24 = Saturday). */
const at = (day: number, hour: number, minute = 0) => zonedTime(2026, 10, day, hour, minute, TZ);
const kwhOf = (slots: ChargeSlot[]) => slotSteps(slots, TZ).reduce((s, x) => s + x.kwh, 0);
const localHours = (slots: ChargeSlot[]) => slotSteps(slots, TZ).map((s) => s.hour);
const overlaps = (s: ChargeSlot, w: { start: Date; end: Date }) => Date.parse(s.start) < w.end.getTime() && Date.parse(s.end) > w.start.getTime();

const wedNight = { start: at(21, 18), end: at(22, 7) };
const input = (over: Partial<PlanInput> = {}): PlanInput => ({ session: wedNight, needKwh: 30, maxKw: 7.2, planId: 'TOU', blocked: [], tz: TZ, ...over });

describe('sessionFor', () => {
  it('during the day returns the coming night (18:00 → 07:00 next day)', () => {
    const s = sessionFor(at(21, 10), '07:00', 18, TZ);
    expect(s).toEqual(wedNight);
  });

  it('is stable within the day, whatever the minute', () => {
    expect(sessionFor(at(21, 10, 37), '07:00', 18, TZ)).toEqual(sessionFor(at(21, 7, 0), '07:00', 18, TZ));
    expect(sessionFor(at(21, 23, 59), '07:00', 18, TZ)).toEqual(wedNight);
  });

  it('before ready-by it is still last night’s session', () => {
    expect(sessionFor(at(22, 6, 59), '07:00', 18, TZ)).toEqual(wedNight);
    expect(sessionFor(at(22, 7, 0), '07:00', 18, TZ).start).toEqual(at(22, 18));
  });

  it('a ready-by before the plug-in hour crosses midnight; one after it stays the same evening', () => {
    expect(sessionFor(at(21, 12), '06:00', 18, TZ)).toEqual({ start: at(21, 18), end: at(22, 6) });
    expect(sessionFor(at(21, 12), '17:00', 18, TZ)).toEqual({ start: at(20, 18), end: at(21, 17) });
    expect(sessionFor(at(21, 17, 30), '17:00', 18, TZ)).toEqual({ start: at(21, 18), end: at(22, 17) });
    expect(sessionFor(at(21, 12), '23:00', 18, TZ)).toEqual({ start: at(21, 18), end: at(21, 23) });
  });

  it('crosses month ends', () => {
    expect(sessionFor(zonedTime(2026, 10, 31, 12, 0, TZ), '07:00', 18, TZ)).toEqual({ start: zonedTime(2026, 10, 31, 18, 0, TZ), end: zonedTime(2026, 11, 1, 7, 0, TZ) });
  });
});

describe('planCharging', () => {
  it('TOU: 30 kWh lands entirely in off-peak and inside the session', () => {
    const r = planCharging(input());
    expect(r.plannedKwh).toBe(30);
    expect(r.shortfallKwh).toBe(0);
    expect(kwhOf(r.slots)).toBeCloseTo(30, 6);
    for (const s of r.slots) {
      expect(s.period).toBe('off-peak');
      expect(s.ratePerKwh).toBe(0.076);
      expect(Date.parse(s.start)).toBeGreaterThanOrEqual(wedNight.start.getTime());
      expect(Date.parse(s.end)).toBeLessThanOrEqual(wedNight.end.getTime());
    }
    // Ties on rate are broken by the cleanest hours: nothing in the dirty 19–22 evening.
    for (const h of localHours(r.slots)) expect(h >= 19 && h < 22).toBe(false);
  });

  it('ULO: lands in 23:00–07:00', () => {
    const r = planCharging(input({ planId: 'ULO' }));
    expect(r.plannedKwh).toBe(30);
    for (const s of r.slots) expect(s.period).toBe('ultra-low');
    for (const h of localHours(r.slots)) expect(h >= 23 || h < 7).toBe(true);
  });

  it('merges contiguous 15-minute blocks into runs (30 kWh on a weekday TOU night is one run, 01:00–05:10)', () => {
    const r = planCharging(input());
    expect(r.slots).toHaveLength(1);
    expect(r.slots[0].start).toBe(at(22, 1).toISOString());
    expect(r.slots[0].end).toBe(at(22, 5, 10).toISOString());
    for (let i = 1; i < r.slots.length; i++) expect(Date.parse(r.slots[i].start)).toBeGreaterThanOrEqual(Date.parse(r.slots[i - 1].end));
  });

  it('a DR window 19–22 is excluded and the slots move', () => {
    const window = { start: at(21, 19), end: at(21, 22) };
    const free = planCharging(input({ needKwh: 70 }));
    expect(free.slots.some((s) => overlaps(s, window))).toBe(true);
    const r = planCharging(input({ needKwh: 70, blocked: [window] }));
    expect(r.plannedKwh).toBe(70);
    expect(r.slots.some((s) => overlaps(s, window))).toBe(false);
    expect(r.slots).not.toEqual(free.slots);
  });

  it('reports a shortfall when the session cannot fit the target', () => {
    const r = planCharging(input({ needKwh: 200 }));
    expect(r.plannedKwh).toBeCloseTo(13 * 7.2, 6);
    expect(r.shortfallKwh).toBeCloseTo(200 - 13 * 7.2, 6);
    const blocked = planCharging(input({ needKwh: 30, blocked: [{ start: at(21, 18), end: at(22, 6) }] }));
    expect(blocked.plannedKwh).toBeCloseTo(7.2, 6);
    expect(blocked.shortfallKwh).toBeCloseTo(22.8, 6);
  });

  it('a ready-by before plug-in crosses midnight and charges after midnight', () => {
    const session = sessionFor(at(21, 9), '05:00', 18, TZ);
    const r = planCharging(input({ session, planId: 'ULO' }));
    expect(r.plannedKwh).toBe(30);
    expect(Date.parse(r.slots[r.slots.length - 1].end)).toBeLessThanOrEqual(at(22, 5).getTime());
    expect(localHours(r.slots).some((h) => h < 5)).toBe(true);
  });

  it('is deterministic', () => {
    expect(planCharging(input({ planId: 'ULO', needKwh: 43 }))).toEqual(planCharging(input({ planId: 'ULO', needKwh: 43 })));
  });

  it('weekend: everything is off-peak on TOU, so it picks the cleanest hours (not the 18:00 plug-in hour)', () => {
    const session = sessionFor(at(24, 12), '07:00', 18, TZ);
    expect(localClock(session.start.getTime(), TZ).weekday).toBe(6);
    const r = planCharging(input({ session }));
    for (const s of r.slots) expect(s.ratePerKwh).toBe(0.076);
    for (const h of localHours(r.slots)) expect(h >= 18 && h < 22).toBe(false);
    const base = baseline(session, 30, 7.2, 'TOU', TZ);
    const sum = summarisePlan(r.slots, base, session, 'TOU', TZ);
    expect(sum.savings).toBe(0);
    expect(sum.co2SavedKg).toBeGreaterThan(0);
  });

  it('nothing needed → no slots', () => {
    expect(planCharging(input({ needKwh: 0 }))).toEqual({ slots: [], plannedKwh: 0, shortfallKwh: 0 });
  });
});

describe('baseline, evKwAt, summarisePlan', () => {
  it('baseline charges from plug-in at full power', () => {
    const b = baseline(wedNight, 30, 7.2, 'TOU', TZ);
    expect(b).toHaveLength(1);
    expect(b[0].start).toBe(wedNight.start.toISOString());
    expect(kwhOf(b)).toBeCloseTo(30, 2);
  });

  it('evKwAt / avgEvKw read the plan', () => {
    const r = planCharging(input());
    const first = r.slots[0];
    expect(evKwAt(r.slots, Date.parse(first.start))).toBe(7.2);
    expect(evKwAt(r.slots, at(21, 12))).toBe(0);
    expect(avgEvKw(r.slots, wedNight.start.getTime(), wedNight.end.getTime()) * 13).toBeCloseTo(30, 6);
    expect(evKwAt(repeatDaily(r.slots), Date.parse(first.start) + 86400000)).toBe(7.2);
  });

  it('weekday TOU: savings and CO₂ saved against charging at plug-in, 24 hourly points', () => {
    const r = planCharging(input());
    const base = baseline(wedNight, 30, 7.2, 'TOU', TZ);
    const sum = summarisePlan(r.slots, base, wedNight, 'TOU', TZ);
    expect(sum.cost).toBeCloseTo(30 * 0.076, 2);
    expect(sum.baselineCost).toBeGreaterThan(sum.cost);
    expect(sum.savings).toBeCloseTo(sum.baselineCost - sum.cost, 2);
    expect(sum.co2Kg).toBeLessThan(sum.baselineCo2Kg);
    expect(sum.co2SavedKg).toBeGreaterThan(0);
    expect(sum.hourly).toHaveLength(24);
    expect(sum.hourly[0].hour).toBe(wedNight.start.toISOString());
    expect(sum.hourly[0].period).toBe('on-peak');
    expect(sum.hourly.reduce((s, h) => s + h.kw, 0)).toBeCloseTo(30, 1);
  });
});

describe('defaultNightShift', () => {
  it('moves the default 30 kWh out of the 17–21 peak on a weekday', () => {
    const r = defaultNightShift(at(21, 10), TZ);
    expect(r.shiftedKwh).toBeCloseTo(3 * 7.2, 2);
    expect(r.peakKwAvoided).toBeCloseTo(7.2, 6);
  });
});

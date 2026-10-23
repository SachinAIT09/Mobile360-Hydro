import { describe, expect, it } from 'vitest';
import { zonedTime } from '../common/time.js';
import { buildPlan, defaultSettings } from './smart-charging.service.js';

const TZ = 'America/Toronto';
const at = (day: number, hour: number, minute = 0) => zonedTime(2026, 10, day, hour, minute, TZ);
const on = { ...defaultSettings(), enabled: true };

describe('buildPlan', () => {
  it('daytime: next start tonight, not charging, savings vs plug-in', () => {
    const p = buildPlan(on, true, [], null, at(21, 10), TZ);
    expect(p.chargingNow).toBe(false);
    expect(p.nextStart).toBe(p.slots[0].start);
    expect(Date.parse(p.nextStart!)).toBeGreaterThan(at(21, 18).getTime());
    expect(p.plannedKwh).toBe(30);
    expect(p.savings).toBeGreaterThan(0);
    expect(p.avoidedDrWindows).toEqual([]);
    expect(p.boostUntil).toBeNull();
  });

  it('charging now inside a slot; a boost charges regardless of the plan', () => {
    const p = buildPlan(on, true, [], null, at(21, 10), TZ);
    const inSlot = new Date(Date.parse(p.slots[0].start) + 60000);
    expect(buildPlan(on, true, [], null, inSlot, TZ).chargingNow).toBe(true);
    const boosted = buildPlan(on, true, [], at(21, 11), at(21, 10), TZ);
    expect(boosted.chargingNow).toBe(true);
    expect(boosted.boostUntil).toBe(at(21, 11).toISOString());
  });

  it('lists only DR windows overlapping the session and charges around them', () => {
    const w = { start: at(21, 22), end: at(22, 1), title: 'Grid event' };
    const other = { start: at(23, 17), end: at(23, 20), title: 'Later' };
    const p = buildPlan({ ...on, ratePlan: 'ULO' }, true, [w, other], null, at(21, 10), TZ);
    expect(p.avoidedDrWindows).toEqual([{ start: w.start.toISOString(), end: w.end.toISOString(), title: 'Grid event' }]);
    for (const s of p.slots) expect(Date.parse(s.start) >= w.end.getTime() || Date.parse(s.end) <= w.start.getTime()).toBe(true);
  });

  it('no EV: settings echoed, empty plan', () => {
    const p = buildPlan(on, false, [{ start: at(21, 19), end: at(21, 22), title: 'x' }], at(21, 11), at(21, 10), TZ);
    expect(p.hasEv).toBe(false);
    expect(p.slots).toEqual([]);
    expect(p.chargingNow).toBe(false);
    expect(p.savings).toBe(0);
    expect(p.avoidedDrWindows).toEqual([]);
    expect(p.hourly).toHaveLength(24);
  });
});

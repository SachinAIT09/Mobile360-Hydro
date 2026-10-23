import { describe, expect, it } from 'vitest';
import { SIMULATION_TICKS, SIMULATION_TICK_MS, planSimulation, seedFromId, type SimulationPlan } from './simulation-plan.js';

const N = 1000;
const targets = Array.from({ length: N }, (_, i) => ({ id: i }));
const SEED = 0x1234abcd;

const share = <T>(plans: SimulationPlan<T>[], pick: (p: SimulationPlan<T>) => boolean) => plans.filter(pick).length / plans.length;

describe('planSimulation', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = planSimulation('ENROLL_OFFER', targets, SEED);
    const b = planSimulation('ENROLL_OFFER', targets, SEED);
    expect(a).toEqual(b);
    const c = planSimulation('ENROLL_OFFER', targets, SEED + 1);
    expect(a.map((p) => p.deliver)).not.toEqual(c.map((p) => p.deliver));
  });

  it('keeps every target, in order, and schedules within the tick budget', () => {
    for (const type of ['ENROLL_OFFER', 'STOP_CHARGING'] as const) {
      const plans = planSimulation(type, targets, SEED);
      expect(plans.map((p) => p.c)).toEqual(targets);
      for (const p of plans) {
        for (const t of [p.deliver, p.open, p.act]) {
          expect(t === -1 || (t >= 1 && t <= SIMULATION_TICKS)).toBe(true);
        }
        // Opens follow delivery; acting follows opening.
        if (p.open > 0) expect(p.deliver).toBeGreaterThan(0);
        if (p.open > 0) expect(p.open).toBeGreaterThanOrEqual(p.deliver);
        if (p.act > 0) expect(p.open).toBeGreaterThan(0);
        if (p.act > 0) expect(p.act).toBeGreaterThanOrEqual(p.open);
        if (p.act > 0 && type === 'ENROLL_OFFER') expect(p.act).toBeGreaterThan(p.open);
        // Delivery lands on tick 1 or 2.
        if (p.deliver > 0) expect(p.deliver).toBeLessThanOrEqual(2);
      }
    }
  });

  it('enrollment offers over 1,000 targets land near 98% delivered / 62% opened / 18% enrolled', () => {
    const plans = planSimulation('ENROLL_OFFER', targets, SEED);
    expect(share(plans, (p) => p.deliver > 0)).toBeCloseTo(0.98, 1);
    expect(Math.abs(share(plans, (p) => p.open > 0) - 0.62)).toBeLessThan(0.03);
    expect(Math.abs(share(plans, (p) => p.act > 0) - 0.18)).toBeLessThan(0.03);
    // Offers never carry a DR response.
    expect(plans.every((p) => p.response === undefined)).toBe(true);
  });

  it('stop-charging requests over 1,000 targets land near 84% responded / 76% paused / 8% opted out', () => {
    const plans = planSimulation('STOP_CHARGING', targets, SEED);
    expect(share(plans, (p) => p.deliver > 0)).toBeCloseTo(0.98, 1);
    const responded = share(plans, (p) => p.act > 0);
    const paused = share(plans, (p) => p.act > 0 && p.response === 'PAUSE');
    const optedOut = share(plans, (p) => p.act > 0 && p.response === 'OPT_OUT');
    expect(Math.abs(responded - 0.84)).toBeLessThan(0.03);
    expect(Math.abs(paused - 0.76)).toBeLessThan(0.03);
    expect(Math.abs(optedOut - 0.08)).toBeLessThan(0.03);
    expect(paused + optedOut).toBeCloseTo(responded, 10);
    // Everyone who acts has a response; nobody who does not act has one.
    expect(plans.every((p) => (p.act > 0) === (p.response !== undefined))).toBe(true);
  });

  it('clamps open/act to the tick budget when fewer ticks are requested', () => {
    const plans = planSimulation('STOP_CHARGING', targets, SEED, 3);
    for (const p of plans) {
      expect(p.open).toBeLessThanOrEqual(3);
      expect(p.act).toBeLessThanOrEqual(3);
    }
    expect(plans.some((p) => p.act === 3)).toBe(true);
  });

  it('plays out over roughly 25 seconds', () => {
    expect(SIMULATION_TICKS * SIMULATION_TICK_MS).toBe(25000);
  });
});

describe('seedFromId', () => {
  it('uses the last 8 hex digits of an ObjectId', () => {
    expect(seedFromId('66f1a2b3c4d5e6f7a8b9c0d1')).toBe(parseInt('a8b9c0d1', 16));
    expect(seedFromId('00000000000000000000ffff')).toBe(0xffff);
  });
});

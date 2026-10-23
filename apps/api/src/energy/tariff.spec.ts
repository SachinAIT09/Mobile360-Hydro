import { describe, expect, it } from 'vitest';
import { GRID_CO2_G_PER_KWH, RATE_PLANS } from '@demo/shared';
import { co2At, comparePlans, costOfSteps, periodAt, type UsageProfile } from './tariff.js';

const WED = 3;
const SAT = 6;

describe('periodAt', () => {
  it('TOU weekday: off-peak overnight (wrapping midnight), on-peak mornings and early evening, mid-peak midday', () => {
    expect(periodAt('TOU', 20, WED)).toEqual({ period: 'off-peak', rate: 0.076 });
    expect(periodAt('TOU', 3, WED).period).toBe('off-peak');
    expect(periodAt('TOU', 6.75, WED).period).toBe('off-peak');
    expect(periodAt('TOU', 7, WED).period).toBe('on-peak');
    expect(periodAt('TOU', 12, WED).period).toBe('mid-peak');
    expect(periodAt('TOU', 18.5, WED)).toEqual({ period: 'on-peak', rate: 0.158 });
    expect(periodAt('TOU', 19, WED).period).toBe('off-peak');
  });

  it('TOU weekend is off-peak all day (first matching rule wins)', () => {
    for (let h = 0; h < 24; h += 0.5) expect(periodAt('TOU', h, SAT).period).toBe('off-peak');
    expect(periodAt('TOU', 18, 0).period).toBe('off-peak');
  });

  it('ULO: ultra-low 23–07 every day, on-peak 16–21 on weekdays', () => {
    expect(periodAt('ULO', 23.5, WED)).toEqual({ period: 'ultra-low', rate: 0.028 });
    expect(periodAt('ULO', 2, SAT).period).toBe('ultra-low');
    expect(periodAt('ULO', 16, WED)).toEqual({ period: 'on-peak', rate: 0.284 });
    expect(periodAt('ULO', 22, WED).period).toBe('mid-peak');
    expect(periodAt('ULO', 12, SAT).period).toBe('off-peak');
  });

  it('every plan covers every hour of every day', () => {
    for (const id of ['TOU', 'ULO', 'TIERED'] as const)
      for (let d = 0; d < 7; d++)
        for (let h = 0; h < 24; h += 0.25) {
          const p = periodAt(id, h, d);
          expect(RATE_PLANS[id].periods.some((r) => r.name === p.period && r.rate === p.rate)).toBe(true);
        }
  });
});

describe('co2At', () => {
  it('reads the hourly table and wraps', () => {
    expect(co2At(18.9)).toBe(GRID_CO2_G_PER_KWH[18]);
    expect(co2At(25)).toBe(GRID_CO2_G_PER_KWH[1]);
    expect(co2At(3)).toBeLessThan(co2At(19));
  });
});

describe('costOfSteps', () => {
  it('prices time-based plans by period', () => {
    expect(costOfSteps([{ hour: 20, weekday: WED, kwh: 10 }], 'TOU')).toBeCloseTo(0.76, 10);
    expect(costOfSteps([{ hour: 8, weekday: WED, kwh: 10 }, { hour: 1, weekday: WED, kwh: 10 }], 'ULO')).toBeCloseTo(1.22 + 0.28, 10);
  });

  it('TIERED crosses from tier 1 to tier 2 at 600 kWh in the month', () => {
    expect(costOfSteps([{ hour: 0, weekday: WED, kwh: 100 }], 'TIERED', 550)).toBeCloseTo(50 * 0.093 + 50 * 0.11, 10);
    expect(costOfSteps([{ hour: 0, weekday: WED, kwh: 100 }], 'TIERED', 0)).toBeCloseTo(9.3, 10);
    expect(costOfSteps([{ hour: 0, weekday: WED, kwh: 100 }], 'TIERED', 700)).toBeCloseTo(11, 10);
    // Split across steps, same answer.
    const split = costOfSteps([{ hour: 0, weekday: WED, kwh: 40 }, { hour: 1, weekday: WED, kwh: 60 }], 'TIERED', 550);
    expect(split).toBeCloseTo(50 * 0.093 + 50 * 0.11, 10);
  });
});

describe('comparePlans', () => {
  const profile: UsageProfile = {
    basisKwhPerMonth: 1000,
    homeShape: Array.from({ length: 24 }, (_, h) => (h >= 17 && h < 22 ? 2 : 1)),
    evKwhPerNight: 12,
    evKw: 7.2,
    plugInHour: 18,
    readyByHour: 7,
    current: 'TOU',
  };

  it('costs each plan with and without smart charging; smart never costs more; tiered is unaffected', () => {
    const r = comparePlans(profile);
    expect(r.basisKwhPerMonth).toBe(1000);
    expect(r.plans.map((p) => p.id)).toEqual(['TOU', 'ULO', 'TIERED']);
    for (const p of r.plans) expect(p.withSmartCharging).toBeLessThanOrEqual(p.monthlyCost);
    const tou = r.plans.find((p) => p.id === 'TOU')!;
    const ulo = r.plans.find((p) => p.id === 'ULO')!;
    const tiered = r.plans.find((p) => p.id === 'TIERED')!;
    expect(tou.withSmartCharging).toBeLessThan(tou.monthlyCost);
    expect(ulo.withSmartCharging).toBeLessThan(ulo.monthlyCost);
    expect(tiered.withSmartCharging).toBe(tiered.monthlyCost);
    expect(tiered.monthlyCost).toBeCloseTo(600 * 0.093 + 400 * 0.11, 1);
    expect(r.plans.filter((p) => p.best)).toHaveLength(1);
    expect(r.plans.filter((p) => p.current).map((p) => p.id)).toEqual(['TOU']);
    // With an EV and smart charging, overnight-heavy ULO wins on these placeholder rates.
    expect(ulo.best).toBe(true);
  });

  it('without an EV both columns match and the best plan is the cheapest monthly cost', () => {
    const r = comparePlans({ ...profile, evKwhPerNight: 0, current: 'ULO' });
    for (const p of r.plans) expect(p.withSmartCharging).toBe(p.monthlyCost);
    const best = r.plans.find((p) => p.best)!;
    expect(Math.min(...r.plans.map((p) => p.monthlyCost))).toBe(best.monthlyCost);
    expect(r.plans.find((p) => p.current)!.id).toBe('ULO');
  });

  it('is deterministic', () => {
    expect(comparePlans(profile)).toEqual(comparePlans(profile));
  });
});

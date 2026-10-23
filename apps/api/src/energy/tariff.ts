import { GRID_CO2_G_PER_KWH, RATE_PLANS, type RatePlanComparison, type RatePlanId } from '@demo/shared';

/** Placeholder tariffs and grid carbon intensity (pure; values live in `@demo/shared` brand.ts). */

export interface PeriodRate {
  period: string;
  rate: number;
}

export const RATE_PLAN_IDS: RatePlanId[] = ['TOU', 'ULO', 'TIERED'];

/** 0 = Sunday … 6 = Saturday. */
export function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

/**
 * Rate period at a local hour (fractional allowed) on a weekday.
 * Rules are checked in order and the first match wins; `from > to` wraps past midnight.
 */
export function periodAt(planId: RatePlanId, localHour: number, weekday: number): PeriodRate {
  const h = ((localHour % 24) + 24) % 24;
  const weekend = isWeekend(weekday);
  const rules = RATE_PLANS[planId].periods;
  for (const r of rules) {
    if (r.days === 'weekday' && weekend) continue;
    if (r.days === 'weekend' && !weekend) continue;
    const inHours = r.from <= r.to ? h >= r.from && h < r.to : h >= r.from || h < r.to;
    if (inHours) return { period: r.name, rate: r.rate };
  }
  // Every plan covers all hours; keep a defined answer for malformed placeholder data.
  const last = rules[rules.length - 1];
  return { period: last.name, rate: last.rate };
}

/** Grid carbon intensity (g CO₂/kWh) at a local hour. */
export function co2At(localHour: number): number {
  const i = ((Math.floor(localHour) % 24) + 24) % 24;
  return GRID_CO2_G_PER_KWH[i] ?? 0;
}

export interface EnergyStep {
  /** Local hour (fractional allowed). */
  hour: number;
  /** 0 = Sunday … 6 = Saturday (local). */
  weekday: number;
  kwh: number;
}

/**
 * Energy cost of consumption steps on a plan. TIERED charges by cumulative monthly kWh
 * (`monthKwhSoFar` is what was already used this month before the first step); the others by period.
 */
export function costOfSteps(steps: EnergyStep[], planId: RatePlanId, monthKwhSoFar = 0): number {
  const tiers = RATE_PLANS[planId].tiers;
  let cost = 0;
  if (tiers?.length) {
    let used = monthKwhSoFar;
    for (const s of steps) {
      let left = s.kwh;
      for (const t of tiers) {
        if (left <= 0) break;
        const room = t.upToKwhPerMonth === null ? Infinity : Math.max(0, t.upToKwhPerMonth - used);
        const take = Math.min(room, left);
        cost += take * t.rate;
        used += take;
        left -= take;
      }
    }
    return cost;
  }
  for (const s of steps) cost += s.kwh * periodAt(planId, s.hour, s.weekday).rate;
  return cost;
}

export interface UsageProfile {
  /** Average monthly consumption the comparison is based on (bills), EV included. */
  basisKwhPerMonth: number;
  /** Relative shape of the non-EV load by local hour (24 weights; normalised here). */
  homeShape: number[];
  /** Average EV kWh charged per night (0 = no EV). */
  evKwhPerNight: number;
  /** Charger power, kW. */
  evKw: number;
  plugInHour: number;
  /** Local ready-by hour (fractional allowed). */
  readyByHour: number;
  current: RatePlanId;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const DAYS_PER_MONTH = 30;

/** EV kWh per local hour for one night: hours plugInHour → readyByHour, either straight away or in the cheapest/cleanest hours. */
function nightSteps(planId: RatePlanId, p: UsageProfile, plugInWeekday: number, smart: boolean): EnergyStep[] {
  const span = ((p.readyByHour - p.plugInHour + 24) % 24) || 24;
  const hours: { hour: number; weekday: number; idx: number; rate: number; co2: number; len: number }[] = [];
  for (let i = 0; i < Math.ceil(span); i++) {
    const hour = (p.plugInHour + i) % 24;
    const weekday = p.plugInHour + i >= 24 ? (plugInWeekday + 1) % 7 : plugInWeekday;
    hours.push({ hour, weekday, idx: i, rate: periodAt(planId, hour, weekday).rate, co2: co2At(hour), len: Math.min(1, span - i) });
  }
  const order = smart ? [...hours].sort((a, b) => a.rate - b.rate || a.co2 - b.co2 || b.idx - a.idx) : hours;
  const out: EnergyStep[] = [];
  let left = p.evKwhPerNight;
  for (const h of order) {
    if (left <= 1e-9) break;
    const kwh = Math.min(left, p.evKw * h.len);
    out.push({ hour: h.hour, weekday: h.weekday, kwh });
    left -= kwh;
  }
  return out;
}

/**
 * Monthly energy cost of a household on each plan, with EV charging straight after plug-in vs smart (cheapest hours).
 * A 30-day month starting on a Monday; the non-EV load follows `homeShape`.
 */
export function comparePlans(p: UsageProfile): RatePlanComparison {
  const evMonth = p.evKwhPerNight * DAYS_PER_MONTH;
  const homeMonth = Math.max(0, p.basisKwhPerMonth - evMonth);
  const shapeSum = p.homeShape.reduce((s, x) => s + x, 0) || 1;
  const homeHourly = p.homeShape.map((x) => (x / shapeSum) * (homeMonth / DAYS_PER_MONTH));
  const plans = RATE_PLAN_IDS.map((id) => {
    const home: EnergyStep[] = [];
    const base: EnergyStep[] = [];
    const smart: EnergyStep[] = [];
    for (let d = 0; d < DAYS_PER_MONTH; d++) {
      const weekday = (1 + d) % 7;
      for (let h = 0; h < 24; h++) home.push({ hour: h, weekday, kwh: homeHourly[h] });
      if (p.evKwhPerNight > 0) {
        base.push(...nightSteps(id, p, weekday, false));
        smart.push(...nightSteps(id, p, weekday, true));
      }
    }
    return {
      id,
      label: RATE_PLANS[id].label,
      monthlyCost: round2(costOfSteps([...home, ...base], id)),
      withSmartCharging: round2(costOfSteps([...home, ...smart], id)),
      current: id === p.current,
      best: false,
    };
  });
  const key = (x: (typeof plans)[number]) => (p.evKwhPerNight > 0 ? x.withSmartCharging : x.monthlyCost);
  let best = plans[0];
  for (const x of plans) if (key(x) < key(best)) best = x;
  best.best = true;
  return { basisKwhPerMonth: Math.round(p.basisKwhPerMonth), plans };
}

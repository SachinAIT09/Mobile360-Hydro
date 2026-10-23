import { GRID_CO2_G_PER_KWH, RATE_PLANS, type RatePlanComparison, type RatePlanDef, type RatePlanId } from '@demo/shared';

/**
 * Small, pure tariff helpers for the assistant (BEST_TIME / RATE_PLAN). They read RATE_PLANS and
 * GRID_CO2_G_PER_KWH from brand.ts directly so answers work even when smart charging is not set up.
 */

export const PLAN_IDS: RatePlanId[] = ['TOU', 'ULO', 'TIERED'];

const inRule = (from: number, to: number, h: number) => (from <= to ? h >= from && h < to : h >= from || h < to);

/** Rate period in force at local hour `h` (0–23). */
export function periodAt(plan: RatePlanDef, h: number, weekend: boolean): { name: string; rate: number } {
  for (const r of plan.periods) {
    const dayOk = r.days === 'all' || (r.days === 'weekend') === weekend;
    if (dayOk && inRule(r.from, r.to, h)) return { name: r.name, rate: r.rate };
  }
  const last = plan.periods[plan.periods.length - 1];
  return { name: last.name, rate: last.rate };
}

export function hourlyRates(id: RatePlanId, weekend: boolean): number[] {
  return Array.from({ length: 24 }, (_, h) => periodAt(RATE_PLANS[id], h, weekend).rate);
}

/** Longest run of hours at the lowest rate, wrapping past midnight. `end` is exclusive. */
export function cheapestBlock(rates: number[]): { start: number; end: number; hours: number; rate: number } {
  const min = Math.min(...rates);
  if (rates.every((r) => r === min)) return { start: 0, end: 24, hours: 24, rate: min };
  let best = { start: 0, hours: 0 };
  for (let s = 0; s < 24; s++) {
    if (rates[s] !== min || rates[(s + 23) % 24] === min) continue; // only start at the beginning of a run
    let n = 0;
    while (n < 24 && rates[(s + n) % 24] === min) n++;
    if (n > best.hours) best = { start: s, hours: n };
  }
  return { start: best.start, end: (best.start + best.hours) % 24, hours: best.hours, rate: min };
}

/** Lowest-carbon hour inside a block (or the whole day). */
export function cleanestHour(start = 0, hours = 24): { hour: number; g: number } {
  let out = { hour: start, g: Infinity };
  for (let i = 0; i < hours; i++) {
    const h = (start + i) % 24;
    if (GRID_CO2_G_PER_KWH[h] < out.g) out = { hour: h, g: GRID_CO2_G_PER_KWH[h] };
  }
  return out;
}

/** Household (non-EV) load shape by hour, same shape as the energy model: base + evening + morning bumps. */
const BASE_SHAPE = Array.from({ length: 24 }, (_, h) => 0.55 + (h >= 17 && h < 22 ? 0.45 : 0) + (h >= 6 && h < 9 ? 0.3 : 0));
const BASE_SUM = BASE_SHAPE.reduce((a, b) => a + b, 0);
/** Unmanaged EV charging: plugged in at 6 PM, charging until about 11 PM. */
const EV_HOURS_DUMB = [18, 19, 20, 21, 22];

function weekAverageRates(id: RatePlanId): number[] {
  const wd = hourlyRates(id, false);
  const we = hourlyRates(id, true);
  return wd.map((r, h) => (5 * r + 2 * we[h]) / 7);
}

function energyCost(id: RatePlanId, hourlyKwh: number[], monthlyKwh: number): number {
  const plan = RATE_PLANS[id];
  if (plan.tiers) {
    let left = monthlyKwh;
    let cost = 0;
    let floor = 0;
    for (const t of plan.tiers) {
      const cap = t.upToKwhPerMonth === null ? Infinity : t.upToKwhPerMonth - floor;
      const used = Math.min(left, cap);
      cost += used * t.rate;
      left -= used;
      floor = t.upToKwhPerMonth ?? floor;
      if (left <= 0) break;
    }
    return cost;
  }
  const rates = weekAverageRates(id);
  return hourlyKwh.reduce((a, k, h) => a + k * rates[h], 0);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Estimated monthly energy cost on each plan for `monthlyKwh`, `evShare` of it EV charging.
 * "withSmartCharging" moves the EV share into the plan's five cheapest (then cleanest) hours.
 */
export function estimatePlans(monthlyKwh: number, evShare: number, current: RatePlanId): RatePlanComparison {
  const evKwh = monthlyKwh * evShare;
  const baseKwh = monthlyKwh - evKwh;
  const base = BASE_SHAPE.map((w) => (baseKwh * w) / BASE_SUM);
  const plans = PLAN_IDS.map((id) => {
    const dumb = base.map((k, h) => k + (EV_HOURS_DUMB.includes(h) ? evKwh / EV_HOURS_DUMB.length : 0));
    const rates = weekAverageRates(id);
    const cheap = [...rates.keys()].sort((a, b) => rates[a] - rates[b] || GRID_CO2_G_PER_KWH[a] - GRID_CO2_G_PER_KWH[b]).slice(0, 5);
    const smart = base.map((k, h) => k + (cheap.includes(h) ? evKwh / 5 : 0));
    return {
      id,
      label: RATE_PLANS[id].label,
      monthlyCost: round2(energyCost(id, dumb, monthlyKwh)),
      withSmartCharging: round2(energyCost(id, smart, monthlyKwh)),
      current: id === current,
      best: false,
    };
  });
  const key = (p: (typeof plans)[number]) => (evShare > 0 ? p.withSmartCharging : p.monthlyCost);
  const best = plans.reduce((a, b) => (key(b) < key(a) ? b : a));
  best.best = true;
  return { basisKwhPerMonth: Math.round(monthlyKwh), plans };
}

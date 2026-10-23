import { SMART_CHARGING, type ChargeSlot, type RatePlanId } from '@demo/shared';
import { localParts, zonedTime } from '../common/time.js';
import { config } from '../config.js';
import { co2At, costOfSteps, periodAt, type EnergyStep } from './tariff.js';

/** Smart-charging planner (pure). Works in 15-minute blocks inside the plug-in → ready-by session. */

export interface Session {
  start: Date;
  end: Date;
}

export interface Window {
  start: Date;
  end: Date;
}

const STEP_MS = 15 * 60000;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;

/** "HH:MM" → minutes after midnight. */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Local fractional hour and weekday (0 = Sunday) of an instant. */
export function localClock(t: number, tz: string): { hour: number; weekday: number } {
  const p = localParts(new Date(t), tz);
  return { hour: p.hour + p.minute / 60, weekday: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() };
}

/**
 * The charging session in force at `now`: plug-in at `plugInHour` local → `readyBy`
 * (next day when readyBy is at or before the plug-in hour). Before last night's ready-by it is last night's session;
 * otherwise tonight's. Stable for a whole day (only switches at ready-by), whatever the minute of `now`.
 */
export function sessionFor(now: Date, readyBy: string, plugInHour: number = SMART_CHARGING.plugInHour, tz: string = config.timezone): Session {
  const ready = hmToMinutes(readyBy);
  const crosses = ready <= plugInHour * 60;
  const p = localParts(now, tz);
  const mk = (day: number): Session => ({
    start: zonedTime(p.year, p.month, day, plugInHour, 0, tz),
    end: zonedTime(p.year, p.month, crosses ? day + 1 : day, Math.floor(ready / 60), ready % 60, tz),
  });
  const prev = mk(p.day - 1);
  return now.getTime() < prev.end.getTime() ? prev : mk(p.day);
}

export interface PlanInput {
  session: Session;
  needKwh: number;
  maxKw: number;
  planId: RatePlanId;
  /** Windows the car must not charge in (DR events). */
  blocked: Window[];
  tz: string;
}

export interface PlanResult {
  slots: ChargeSlot[];
  plannedKwh: number;
  shortfallKwh: number;
}

interface Block {
  start: number;
  rate: number;
  period: string;
  co2: number;
}

/**
 * Picks 15-minute blocks by rate, then CO₂, then next to blocks already picked, then later first, until `needKwh` is reached, skipping blocked windows,
 * and merges them into contiguous runs. The last block picked may be partial (shorter, same kW).
 */
export function planCharging(input: PlanInput): PlanResult {
  const { session, needKwh, maxKw, planId, blocked, tz } = input;
  const blockKwh = maxKw * 0.25;
  const blocks: Block[] = [];
  for (let t = session.start.getTime(); t + STEP_MS <= session.end.getTime(); t += STEP_MS) {
    if (blocked.some((w) => t < w.end.getTime() && t + STEP_MS > w.start.getTime())) continue;
    const { hour, weekday } = localClock(t, tz);
    const r = periodAt(planId, hour, weekday);
    blocks.push({ start: t, rate: r.rate, period: r.period, co2: co2At(hour) });
  }
  const want = needKwh > 0 && blockKwh > 0 ? Math.ceil(needKwh / blockKwh - 1e-9) : 0;
  // Greedy: cheapest, then cleanest; on a tie prefer a block next to one already picked (fewer, longer runs), then the later one.
  const chosen: Block[] = [];
  const starts = new Set<number>();
  const remaining = [...blocks];
  const adj = (x: Block) => starts.has(x.start - STEP_MS) || starts.has(x.start + STEP_MS);
  const better = (x: Block, y: Block) =>
    x.rate !== y.rate ? x.rate < y.rate : x.co2 !== y.co2 ? x.co2 < y.co2 : adj(x) !== adj(y) ? adj(x) : x.start > y.start;
  while (chosen.length < want && remaining.length) {
    let bi = 0;
    for (let i = 1; i < remaining.length; i++) if (better(remaining[i], remaining[bi])) bi = i;
    const [b] = remaining.splice(bi, 1);
    chosen.push(b);
    starts.add(b.start);
  }
  const plannedKwh = Math.min(needKwh, chosen.length * blockKwh);
  const partialKwh = chosen.length === want && want > 0 ? needKwh - (want - 1) * blockKwh : blockKwh;

  const partial = chosen.length === want && partialKwh < blockKwh - 1e-9 ? chosen[chosen.length - 1] : null;
  const pieces = chosen
    .map((b) => {
      if (b !== partial) return { start: b.start, end: b.start + STEP_MS, b };
      const len = Math.max(60000, Math.round(((partialKwh / maxKw) * HOUR_MS) / 60000) * 60000);
      // Sit next to a chosen neighbour so the run stays contiguous.
      const atEnd = !starts.has(b.start - STEP_MS) && starts.has(b.start + STEP_MS);
      return atEnd ? { start: b.start + STEP_MS - len, end: b.start + STEP_MS, b } : { start: b.start, end: b.start + len, b };
    })
    .sort((a, b) => a.start - b.start);

  const slots: ChargeSlot[] = [];
  let run: { start: number; end: number; rate: number; period: string } | null = null;
  const flush = () => {
    if (run) slots.push({ start: new Date(run.start).toISOString(), end: new Date(run.end).toISOString(), kw: maxKw, ratePerKwh: run.rate, period: run.period });
  };
  for (const p of pieces) {
    if (run && run.end === p.start && run.rate === p.b.rate && run.period === p.b.period) run.end = p.end;
    else {
      flush();
      run = { start: p.start, end: p.end, rate: p.b.rate, period: p.b.period };
    }
  }
  flush();
  return { slots, plannedKwh: round3(plannedKwh), shortfallKwh: round3(Math.max(0, needKwh - plannedKwh)) };
}

/** Plug in and charge straight away at full power (what happens without smart charging). */
export function baseline(session: Session, needKwh: number, maxKw: number, planId: RatePlanId, tz: string): ChargeSlot[] {
  if (needKwh <= 0) return [];
  const end = Math.min(session.end.getTime(), session.start.getTime() + Math.round((needKwh / maxKw) * HOUR_MS));
  const { hour, weekday } = localClock(session.start.getTime(), tz);
  const r = periodAt(planId, hour, weekday);
  return [{ start: session.start.toISOString(), end: new Date(end).toISOString(), kw: maxKw, ratePerKwh: r.rate, period: r.period }];
}

/** EV kW at instant `t` under a plan. */
export function evKwAt(slots: ChargeSlot[], t: Date | number): number {
  const ms = typeof t === 'number' ? t : t.getTime();
  for (const s of slots) if (ms >= Date.parse(s.start) && ms < Date.parse(s.end)) return s.kw;
  return 0;
}

/** Average EV kW over [from, to) under a plan. */
export function avgEvKw(slots: ChargeSlot[], from: number, to: number): number {
  if (to <= from) return 0;
  let kwh = 0;
  for (const s of slots) {
    const a = Math.max(from, Date.parse(s.start));
    const b = Math.min(to, Date.parse(s.end));
    if (b > a) kwh += (s.kw * (b - a)) / HOUR_MS;
  }
  return kwh / ((to - from) / HOUR_MS);
}

/** The same plan repeated on the previous and next nights (used to integrate past/future days). */
export function repeatDaily(slots: ChargeSlot[]): ChargeSlot[] {
  const shift = (s: ChargeSlot, d: number): ChargeSlot => ({
    ...s,
    start: new Date(Date.parse(s.start) + d * DAY_MS).toISOString(),
    end: new Date(Date.parse(s.end) + d * DAY_MS).toISOString(),
  });
  return [...slots.map((s) => shift(s, -1)), ...slots, ...slots.map((s) => shift(s, 1))];
}

/** Split slots at 15-minute boundaries into energy steps (local hour + weekday). */
export function slotSteps(slots: ChargeSlot[], tz: string): EnergyStep[] {
  const out: EnergyStep[] = [];
  for (const s of slots) {
    const end = Date.parse(s.end);
    for (let t = Date.parse(s.start); t < end; ) {
      const next = Math.min(end, Math.floor(t / STEP_MS) * STEP_MS + STEP_MS);
      const { hour, weekday } = localClock(t, tz);
      out.push({ hour, weekday, kwh: (s.kw * (next - t)) / HOUR_MS });
      t = next;
    }
  }
  return out;
}

/** kWh charged between two local hours of the day (e.g. 17–21), `fromHour < toHour`. */
export function kwhInLocalHours(slots: ChargeSlot[], fromHour: number, toHour: number, tz: string): number {
  return slotSteps(slots, tz)
    .filter((s) => s.hour >= fromHour && s.hour < toHour)
    .reduce((sum, s) => sum + s.kwh, 0);
}

export interface PlanSummary {
  plannedKwh: number;
  cost: number;
  baselineCost: number;
  savings: number;
  co2Kg: number;
  baselineCo2Kg: number;
  co2SavedKg: number;
  /** 24 hourly points from the session start. */
  hourly: { hour: string; kw: number; rate: number; period: string }[];
}

/** Cost, CO₂ and chart data of a plan against the plug-in-and-charge baseline. */
export function summarisePlan(slots: ChargeSlot[], baselineSlots: ChargeSlot[], session: Session, planId: RatePlanId, tz: string): PlanSummary {
  const steps = slotSteps(slots, tz);
  const baseSteps = slotSteps(baselineSlots, tz);
  const co2 = (xs: EnergyStep[]) => xs.reduce((s, x) => s + (x.kwh * co2At(x.hour)) / 1000, 0);
  const cost = round2(costOfSteps(steps, planId));
  const baselineCost = round2(costOfSteps(baseSteps, planId));
  const co2Kg = round2(co2(steps));
  const baselineCo2Kg = round2(co2(baseSteps));
  const hourly: PlanSummary['hourly'] = [];
  const h0 = Math.floor(session.start.getTime() / HOUR_MS) * HOUR_MS;
  for (let i = 0; i < 24; i++) {
    const t = h0 + i * HOUR_MS;
    const { hour, weekday } = localClock(t, tz);
    const r = periodAt(planId, hour, weekday);
    hourly.push({ hour: new Date(t).toISOString(), kw: round2(avgEvKw(slots, t, t + HOUR_MS)), rate: r.rate, period: r.period });
  }
  return {
    plannedKwh: round3(steps.reduce((s, x) => s + x.kwh, 0)),
    cost,
    baselineCost,
    savings: round2(Math.max(0, baselineCost - cost)),
    co2Kg,
    baselineCo2Kg,
    co2SavedKg: round2(Math.max(0, baselineCo2Kg - co2Kg)),
    hourly,
  };
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}
function round3(x: number) {
  return Math.round(x * 1000) / 1000;
}

/**
 * What one home on default smart-charging settings (TOU, no DR events) moves out of the 17–21 evening peak tonight:
 * kWh the plug-in-and-charge baseline would draw in 17–21 minus what the plan draws there, and the largest hourly kW cut.
 */
export function defaultNightShift(now: Date, tz: string, maxKw = 7.2): { shiftedKwh: number; peakKwAvoided: number } {
  const session = sessionFor(now, SMART_CHARGING.defaultReadyBy, SMART_CHARGING.plugInHour, tz);
  const need = SMART_CHARGING.defaultTargetKwh;
  const plan = planCharging({ session, needKwh: need, maxKw, planId: 'TOU', blocked: [], tz }).slots;
  const base = baseline(session, need, maxKw, 'TOU', tz);
  const shiftedKwh = Math.max(0, kwhInLocalHours(base, 17, 21, tz) - kwhInLocalHours(plan, 17, 21, tz));
  let peakKwAvoided = 0;
  const h0 = Math.floor(session.start.getTime() / HOUR_MS) * HOUR_MS;
  for (let i = 0; i < 24; i++) {
    const t = h0 + i * HOUR_MS;
    const { hour } = localClock(t, tz);
    if (hour < 17 || hour >= 21) continue;
    peakKwAvoided = Math.max(peakKwAvoided, avgEvKw(base, t, t + HOUR_MS) - avgEvKw(plan, t, t + HOUR_MS));
  }
  return { shiftedKwh: round3(shiftedKwh), peakKwAvoided: round3(peakKwAvoided) };
}

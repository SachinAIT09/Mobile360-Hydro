import { localHour } from '../common/time.js';
import { config } from '../config.js';
import { point } from './energy.model.js';

/** Totals of the household model over a period (kWh, except peakW / peakAt / cost). */
export interface EnergyAcc {
  prod: number;
  cons: number;
  self: number;
  exp: number;
  imp: number;
  ev: number;
  heating: number;
  alwaysOn: number;
  other: number;
  peakW: number;
  peakAt: Date | null;
  /** Σ costOf(step) ($); 0 when no cost function is given. */
  cost: number;
}

export interface IntegrateInput {
  from: Date;
  to: Date;
  hasSolar: boolean;
  /** EV kW for the 15-minute step starting at `t` (local fractional hour `hour`). */
  evKwAt: (t: number, hour: number) => number;
  /** EV kW for the step containing `now` (the live state), or null to use `evKwAt` everywhere. */
  nowEvKw: number | null;
  now: Date;
  /** Cost of the grid import of one step. */
  costOf?: (t: number, hour: number, importKwh: number) => number;
  tz?: string;
}

/** Integrate the household model in 15-minute steps between two instants (pure). */
export function integrate(input: IntegrateInput): EnergyAcc {
  const { from, to, hasSolar, evKwAt, nowEvKw, now, costOf } = input;
  const tz = input.tz ?? config.timezone;
  const acc: EnergyAcc = { prod: 0, cons: 0, self: 0, exp: 0, imp: 0, ev: 0, heating: 0, alwaysOn: 0, other: 0, peakW: 0, peakAt: null, cost: 0 };
  const step = 15 * 60000;
  for (let t = from.getTime(); t < to.getTime(); t += step) {
    const dtH = Math.min(step, to.getTime() - t) / 3600000;
    const at = new Date(t);
    const h = localHour(at, tz);
    const isNow = nowEvKw !== null && now.getTime() - t < step && now.getTime() >= t;
    const evKw = isNow ? nowEvKw : evKwAt(t, h);
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
    if (costOf) acc.cost += costOf(t, h, p.gridImportKw * dtH);
    if (p.solarKw * 1000 > acc.peakW) {
      acc.peakW = p.solarKw * 1000;
      acc.peakAt = at;
    }
  }
  return acc;
}

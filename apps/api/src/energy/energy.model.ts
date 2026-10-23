import { hashNoise } from '../common/numbers.js';

/** Inputs for the household energy model. */
export interface HouseholdState {
  hasSolar: boolean;
  evKw: number; // EV load at this instant (0 when not charging)
}

export interface ModelPoint {
  solarKw: number;
  baseKw: number; // non-EV load
  alwaysOnKw: number;
  heatingKw: number;
  otherKw: number;
  evKw: number;
  homeKw: number;
  gridImportKw: number;
  gridExportKw: number;
}

export const EV_CHARGE_KW = 7.2;

/** Solar output for an October day in Ontario; peaks ≈1.13 kW around 12:30. */
export function solarKw(hour: number, hasSolar: boolean): number {
  if (!hasSolar || hour <= 7.5 || hour >= 17.5) return 0;
  return Math.max(0, 1.15 * Math.sin((Math.PI * (hour - 7.5)) / 10));
}

/** Non-EV household load. `noiseKey` makes the small noise deterministic (e.g. a time bucket). */
export function baseKw(hour: number, noiseKey: number): number {
  const evening = hour >= 17 && hour < 22 ? 0.45 : 0;
  const morning = hour >= 6 && hour < 9 ? 0.3 : 0;
  return Math.max(0.3, 0.55 + evening + morning + 0.05 * hashNoise(noiseKey));
}

/** Historical EV pattern used for past intervals: charging 6–11 PM when the home has an EV. */
export function historicalEvKw(hour: number, hasEv: boolean): number {
  return hasEv && hour >= 18 && hour < 23 ? EV_CHARGE_KW : 0;
}

export function point(hour: number, noiseKey: number, s: HouseholdState): ModelPoint {
  const sol = solarKw(hour, s.hasSolar);
  const base = baseKw(hour, noiseKey);
  const alwaysOn = 0.25;
  const heating = (base - alwaysOn) * 0.45;
  const other = base - alwaysOn - heating;
  const home = base + s.evKw;
  return {
    solarKw: sol,
    baseKw: base,
    alwaysOnKw: alwaysOn,
    heatingKw: heating,
    otherKw: other,
    evKw: s.evKw,
    homeKw: home,
    gridImportKw: Math.max(0, home - sol),
    gridExportKw: Math.max(0, sol - home),
  };
}

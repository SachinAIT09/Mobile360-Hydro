import { round1, round3 } from '../common/numbers.js';
import { EV_CHARGE_KW } from '../energy/energy.model.js';

/** Fraction of the window a paused charger would actually have been drawing (ramp/idle allowance). */
export const CHARGING_DUTY = 0.9167;
/** Results are credited for at most this many hours, whatever the planned window length. */
export const MAX_CREDITED_HOURS = 3;

/** Hours a result is credited for: the planned window (default 3 h), capped at 3 h. */
export function creditedHours(plannedHours: number | null | undefined): number {
  return Math.min(MAX_CREDITED_HOURS, plannedHours || MAX_CREDITED_HOURS);
}

/** kWh one paused household shifts out of the window: 7.2 kW × credited hours × duty, to 1 decimal (3 h → 19.8). */
export function kwhShifted(plannedHours: number | null | undefined): number {
  return round1(EV_CHARGE_KW * creditedHours(plannedHours) * CHARGING_DUTY);
}

/** Peak reduction one paused household contributes, in kW (a charger's full draw). */
export const peakReducedKwPerHousehold = EV_CHARGE_KW;

/** Feeder peak reduction from `paused` households, in MW to 3 decimals. */
export function peakReducedMw(paused: number): number {
  return round3((paused * EV_CHARGE_KW) / 1000);
}

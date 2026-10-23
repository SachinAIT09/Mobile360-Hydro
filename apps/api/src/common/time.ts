import { config } from '../config.js';

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function localParts(d: Date, tz = config.timezone): LocalParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
}

/** Fractional local hour, e.g. 17.5 for 5:30 PM. */
export function localHour(d: Date, tz = config.timezone): number {
  const p = localParts(d, tz);
  return p.hour + p.minute / 60 + p.second / 3600;
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const p = localParts(new Date(utcMs), tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Convert a wall-clock time in the demo timezone to a UTC Date. */
export function zonedTime(year: number, month: number, day: number, hour = 0, minute = 0, tz = config.timezone): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = tzOffsetMs(guess, tz);
  let utc = guess - off1;
  const off2 = tzOffsetMs(utc, tz);
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

export function localMidnight(d: Date, tz = config.timezone): Date {
  const p = localParts(d, tz);
  return zonedTime(p.year, p.month, p.day, 0, 0, tz);
}

/**
 * Local midnight `days` calendar days after year-month-day, DST-safe.
 * Adding `days × 24 h` to a local midnight drifts by an hour when the span crosses a DST change.
 */
export function localDatePlusDays(year: number, month: number, day: number, days: number, tz = config.timezone): Date {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return zonedTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, tz);
}

export function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60000);
}

/** The DR window used by simulators/campaigns: today 5–8 PM, or next full hour + 3 h if past 5 PM. */
export function nextEventWindow(now = new Date(), tz = config.timezone): { start: Date; end: Date } {
  const p = localParts(now, tz);
  if (p.hour < 17) {
    return { start: zonedTime(p.year, p.month, p.day, 17, 0, tz), end: zonedTime(p.year, p.month, p.day, 20, 0, tz) };
  }
  const start = new Date(Math.ceil((now.getTime() + 60000) / 3600000) * 3600000);
  return { start, end: new Date(start.getTime() + 3 * 3600000) };
}

export function fmtClock(d: Date, tz = config.timezone): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
}

/** "9:30 and 9:45 PM" */
export function fmtClockRange(a: Date, b: Date, joiner = 'and', tz = config.timezone): string {
  const s = fmtClock(a, tz);
  const e = fmtClock(b, tz);
  const sameHalf = s.slice(-2) === e.slice(-2);
  return `${sameHalf ? s.slice(0, -3) : s} ${joiner} ${e}`;
}

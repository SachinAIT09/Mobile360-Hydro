import { describe, expect, it } from 'vitest';
import { addMinutes, fmtClock, fmtClockRange, localHour, localMidnight, localParts, nextEventWindow, zonedTime } from './time.js';

const TZ = 'America/Toronto';

describe('zonedTime', () => {
  it('converts Toronto wall-clock time to UTC during daylight time (UTC-4)', () => {
    expect(zonedTime(2026, 10, 23, 17, 0, TZ).toISOString()).toBe('2026-10-23T21:00:00.000Z');
  });

  it('converts Toronto wall-clock time to UTC during standard time (UTC-5)', () => {
    expect(zonedTime(2026, 11, 15, 17, 0, TZ).toISOString()).toBe('2026-11-15T22:00:00.000Z');
  });

  it('handles the November DST boundary (clocks fall back on Sun Nov 1 2026)', () => {
    // Saturday noon is still EDT; Sunday noon is EST.
    expect(zonedTime(2026, 10, 31, 12, 0, TZ).toISOString()).toBe('2026-10-31T16:00:00.000Z');
    expect(zonedTime(2026, 11, 1, 12, 0, TZ).toISOString()).toBe('2026-11-01T17:00:00.000Z');
    // 00:30 on Nov 1 is before the 2 AM fall-back, so still UTC-4.
    expect(zonedTime(2026, 11, 1, 0, 30, TZ).toISOString()).toBe('2026-11-01T04:30:00.000Z');
    // 03:00 on Nov 1 is after the fall-back, so UTC-5.
    expect(zonedTime(2026, 11, 1, 3, 0, TZ).toISOString()).toBe('2026-11-01T08:00:00.000Z');
  });

  it('round-trips through localParts', () => {
    const d = zonedTime(2026, 11, 1, 23, 45, TZ);
    expect(localParts(d, TZ)).toMatchObject({ year: 2026, month: 11, day: 1, hour: 23, minute: 45, second: 0 });
  });
});

describe('localParts / localHour / localMidnight', () => {
  it('reads wall-clock parts in the given zone', () => {
    const d = new Date('2026-11-01T06:30:00Z'); // 01:30 EST, after the fall-back
    expect(localParts(d, TZ)).toMatchObject({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 });
    expect(localHour(d, TZ)).toBeCloseTo(1.5, 6);
  });

  it('never reports hour 24 at midnight', () => {
    const d = zonedTime(2026, 10, 23, 0, 0, TZ);
    expect(localParts(d, TZ).hour).toBe(0);
    expect(localMidnight(new Date('2026-10-23T15:00:00Z'), TZ).toISOString()).toBe('2026-10-23T04:00:00.000Z');
  });
});

describe('nextEventWindow', () => {
  it('before 5 PM local: today 5–8 PM', () => {
    const now = new Date('2026-10-23T18:00:00Z'); // 2:00 PM EDT
    const w = nextEventWindow(now, TZ);
    expect(w.start.toISOString()).toBe('2026-10-23T21:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-24T00:00:00.000Z');
  });

  it('at 4:59 PM local still uses today 5–8 PM', () => {
    const w = nextEventWindow(new Date('2026-10-23T20:59:00Z'), TZ);
    expect(w.start.toISOString()).toBe('2026-10-23T21:00:00.000Z');
  });

  it('after 5 PM local: next full hour + 3 h', () => {
    const now = new Date('2026-10-23T22:20:00Z'); // 6:20 PM EDT
    const w = nextEventWindow(now, TZ);
    expect(w.start.toISOString()).toBe('2026-10-23T23:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-24T02:00:00.000Z');
  });

  it('exactly on the hour after 5 PM moves to the following hour', () => {
    const w = nextEventWindow(new Date('2026-10-23T22:00:00Z'), TZ); // 6:00 PM EDT
    expect(w.start.toISOString()).toBe('2026-10-23T23:00:00.000Z');
  });

  it('respects the zone: 2 PM in Toronto is already past 5 PM in London', () => {
    const now = new Date('2026-10-23T18:00:00Z');
    const london = nextEventWindow(now, 'Europe/London');
    expect(london.start.toISOString()).toBe('2026-10-23T19:00:00.000Z');
  });
});

describe('fmtClock / fmtClockRange', () => {
  it('formats a Toronto clock time', () => {
    expect(fmtClock(new Date('2026-10-23T21:30:00Z'), TZ)).toBe('5:30 PM');
  });

  it('shares the AM/PM suffix when both ends are in the same half of the day', () => {
    const a = new Date('2026-10-24T01:30:00Z'); // 9:30 PM
    const b = new Date('2026-10-24T01:45:00Z'); // 9:45 PM
    expect(fmtClockRange(a, b, 'and', TZ)).toBe('9:30 and 9:45 PM');
    expect(fmtClockRange(a, b, 'to', TZ)).toBe('9:30 to 9:45 PM');
  });

  it('keeps both suffixes across noon', () => {
    const a = new Date('2026-10-23T15:30:00Z'); // 11:30 AM
    const b = new Date('2026-10-23T17:00:00Z'); // 1:00 PM
    expect(fmtClockRange(a, b, 'and', TZ)).toBe('11:30 AM and 1:00 PM');
  });
});

describe('addMinutes', () => {
  it('adds whole minutes', () => {
    expect(addMinutes(new Date('2026-10-23T00:00:00Z'), 90).toISOString()).toBe('2026-10-23T01:30:00.000Z');
  });
});

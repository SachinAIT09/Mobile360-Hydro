import { describe, expect, it } from 'vitest';
import { fmtDate, fmtInt, fmtKw, fmtKwh, fmtMoney, fmtRelative, fmtTime, fmtWindow, minutesUntil } from './format';

// All instants below are expressed in UTC; labels come out in America/Toronto (EDT in October = UTC-4).

describe('fmtWindow', () => {
  it('shares the suffix for whole hours in the same half of the day: "5–8 PM"', () => {
    expect(fmtWindow('2026-10-23T21:00:00Z', '2026-10-24T00:00:00Z')).toBe('5–8 PM');
  });

  it('keeps minutes when they are not :00: "9:30–10:15 PM"', () => {
    expect(fmtWindow('2026-10-24T01:30:00Z', '2026-10-24T02:15:00Z')).toBe('9:30–10:15 PM');
  });

  it('spells out both suffixes across noon: "11 AM–2 PM"', () => {
    expect(fmtWindow('2026-10-23T15:00:00Z', '2026-10-23T18:00:00Z')).toBe('11 AM–2 PM');
  });

  it('mixes whole and partial hours: "6–7:30 PM"', () => {
    expect(fmtWindow('2026-10-23T22:00:00Z', '2026-10-23T23:30:00Z')).toBe('6–7:30 PM');
  });

  it('switches to standard time after the November fall-back', () => {
    expect(fmtWindow('2026-11-15T22:00:00Z', '2026-11-16T01:00:00Z')).toBe('5–8 PM');
  });
});

describe('fmtRelative', () => {
  const now = new Date('2026-10-23T18:00:00Z'); // Fri Oct 23, 2:00 PM EDT

  it('shows the clock time for today', () => {
    expect(fmtRelative('2026-10-23T13:12:00Z', now)).toBe('9:12 AM');
    // 11:30 PM EDT on Oct 23 is 03:30Z on Oct 24, still "today" in Toronto.
    expect(fmtRelative('2026-10-24T03:30:00Z', now)).toBe('11:30 PM');
  });

  it('says "Yesterday" for the previous local day', () => {
    expect(fmtRelative('2026-10-22T23:00:00Z', now)).toBe('Yesterday');
    // 00:30Z on Oct 23 is 8:30 PM EDT on Oct 22 → yesterday.
    expect(fmtRelative('2026-10-23T00:30:00Z', now)).toBe('Yesterday');
  });

  it('falls back to a short date for anything older', () => {
    expect(fmtRelative('2026-10-15T14:00:00Z', now)).toBe('Oct 15');
    expect(fmtRelative('2026-10-03T14:00:00Z', now)).toBe('Oct 3');
  });
});

describe('minutesUntil', () => {
  const now = Date.parse('2026-10-23T18:00:00Z');

  it('rounds to whole minutes', () => {
    expect(minutesUntil('2026-10-23T18:45:00Z', now)).toBe(45);
    expect(minutesUntil('2026-10-23T18:01:30Z', now)).toBe(2);
    expect(minutesUntil('2026-10-23T18:01:20Z', now)).toBe(1);
  });

  it('clamps at zero once the instant has passed', () => {
    expect(minutesUntil('2026-10-23T18:00:00Z', now)).toBe(0);
    expect(minutesUntil('2026-10-23T17:00:00Z', now)).toBe(0);
    expect(minutesUntil('2020-01-01T00:00:00Z', now)).toBe(0);
  });
});

describe('simple formatters', () => {
  it('format money, integers and energy units', () => {
    expect(fmtMoney(184.27)).toBe('$184.27');
    expect(fmtMoney(5)).toBe('$5.00');
    expect(fmtInt(1726)).toBe('1,726');
    expect(fmtKwh(19.8)).toBe('19.8 kWh');
    expect(fmtKwh(1142, 0)).toBe('1142 kWh');
    expect(fmtKw(7.2)).toBe('7.2 kW');
  });

  it('format times and dates in the utility timezone', () => {
    expect(fmtTime('2026-10-23T21:00:00Z')).toBe('5:00 PM');
    expect(fmtDate('2026-11-08T12:00:00Z')).toBe('Nov 8, 2026');
    expect(fmtDate('2026-10-23T03:30:00Z', { month: 'short', day: 'numeric' })).toBe('Oct 22');
  });
});

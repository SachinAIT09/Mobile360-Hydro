import { describe, expect, it } from 'vitest';
import { bucketByDay, dayKey } from './reports.service.js';

const utc = (iso: string) => new Date(iso);

describe('dayKey', () => {
  it('formats the local calendar day', () => {
    expect(dayKey(utc('2026-10-23T03:30:00Z'), 'UTC')).toBe('2026-10-23');
    // 03:30 UTC is still the previous evening in Toronto (UTC-4 in October).
    expect(dayKey(utc('2026-10-23T03:30:00Z'), 'America/Toronto')).toBe('2026-10-22');
  });
});

describe('bucketByDay', () => {
  const now = utc('2026-10-23T15:00:00Z');

  it('returns one zero-filled bucket per day, oldest first, ending today', () => {
    const out = bucketByDay([], now, 30, 'UTC');
    expect(out).toHaveLength(30);
    expect(out[0]).toEqual({ date: '2026-09-24', count: 0 });
    expect(out[29]).toEqual({ date: '2026-10-23', count: 0 });
  });

  it('counts timestamps on their local day and ignores anything outside the range', () => {
    const out = bucketByDay(
      [
        utc('2026-10-23T00:10:00Z'), // today
        utc('2026-10-23T14:59:00Z'), // today
        utc('2026-10-22T23:59:59Z'), // yesterday
        utc('2026-09-23T12:00:00Z'), // 30 days ago: outside a 30-day window ending today
        utc('2026-10-24T01:00:00Z'), // tomorrow
      ],
      now,
      30,
      'UTC',
    );
    expect(out[29]).toEqual({ date: '2026-10-23', count: 2 });
    expect(out[28]).toEqual({ date: '2026-10-22', count: 1 });
    expect(out.reduce((s, b) => s + b.count, 0)).toBe(3);
  });

  it('uses the given timezone for day boundaries', () => {
    const out = bucketByDay([utc('2026-10-23T02:00:00Z')], now, 3, 'America/Toronto');
    expect(out.map((b) => b.date)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23']);
    expect(out[1].count).toBe(1);
  });
});

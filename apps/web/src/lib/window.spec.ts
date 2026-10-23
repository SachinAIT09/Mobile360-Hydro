import { describe, expect, it } from 'vitest';
import { upcomingWindow } from './window';

describe('upcomingWindow', () => {
  it('before 5 PM Toronto time: today 5–8 PM, seconds zeroed', () => {
    const w = upcomingWindow(new Date('2026-10-23T18:17:45.123Z')); // 2:17:45 PM EDT
    expect(w.start).toBe('2026-10-23T21:00:00.000Z');
    expect(w.end).toBe('2026-10-24T00:00:00.000Z');
  });

  it('just before 5 PM still targets today 5 PM', () => {
    const w = upcomingWindow(new Date('2026-10-23T20:59:30Z')); // 4:59:30 PM EDT
    expect(w.start).toBe('2026-10-23T21:00:00.000Z');
  });

  it('after 5 PM: the next full hour plus three hours', () => {
    const w = upcomingWindow(new Date('2026-10-23T22:20:10Z')); // 6:20:10 PM EDT
    expect(w.start).toBe('2026-10-23T23:00:00.000Z');
    expect(w.end).toBe('2026-10-24T02:00:00.000Z');
  });

  it('exactly on the hour after 5 PM moves to the following hour', () => {
    const w = upcomingWindow(new Date('2026-10-23T22:00:00Z')); // 6:00 PM EDT
    expect(w.start).toBe('2026-10-23T23:00:00.000Z');
  });

  it('late evening rolls into the next day', () => {
    const w = upcomingWindow(new Date('2026-10-24T03:10:00Z')); // 11:10 PM EDT
    expect(w.start).toBe('2026-10-24T04:00:00.000Z');
    expect(w.end).toBe('2026-10-24T07:00:00.000Z');
  });

  it('uses standard time after the November fall-back', () => {
    const w = upcomingWindow(new Date('2026-11-15T15:00:00Z')); // 10:00 AM EST
    expect(w.start).toBe('2026-11-15T22:00:00.000Z');
  });

  it('honours an explicit timezone', () => {
    const w = upcomingWindow(new Date('2026-10-23T10:00:00Z'), 'UTC');
    expect(w.start).toBe('2026-10-23T17:00:00.000Z');
    expect(w.end).toBe('2026-10-23T20:00:00.000Z');
  });

  it('always spans three hours', () => {
    for (const iso of ['2026-10-23T05:00:00Z', '2026-10-23T18:33:00Z', '2026-10-23T23:59:00Z']) {
      const w = upcomingWindow(new Date(iso));
      expect(Date.parse(w.end) - Date.parse(w.start)).toBe(3 * 3600000);
    }
  });
});

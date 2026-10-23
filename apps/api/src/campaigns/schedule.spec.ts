import { describe, expect, it } from 'vitest';
import { localParts } from '../common/time.js';
import { quickTimes, validateSendAt } from './schedule.js';

const TZ = 'America/Toronto';
const NOW = new Date('2026-10-23T14:00:00Z'); // 10:00 in Toronto (EDT)

describe('validateSendAt', () => {
  it('accepts times between now + 1 minute and now + 24 hours', () => {
    const r = validateSendAt(new Date(NOW.getTime() + 61_000).toISOString(), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.at.getTime()).toBe(NOW.getTime() + 61_000);
    expect(validateSendAt(new Date(NOW.getTime() + 24 * 3600_000), NOW).ok).toBe(true);
  });

  it('rejects missing, invalid, too-soon and too-late times with a message', () => {
    for (const v of [undefined, null, '', 'not a date']) expect(validateSendAt(v, NOW).ok).toBe(false);
    expect(validateSendAt(new Date(NOW.getTime() + 30_000), NOW)).toEqual({ ok: false, error: 'Schedule the send at least 1 minute from now' });
    expect(validateSendAt(new Date(NOW.getTime() - 60_000), NOW).ok).toBe(false);
    expect(validateSendAt(new Date(NOW.getTime() + 24 * 3600_000 + 1000), NOW)).toEqual({ ok: false, error: 'Schedule the send within the next 24 hours' });
  });

  it('allows a few seconds of latency on the 1-minute minimum', () => {
    expect(validateSendAt(new Date(NOW.getTime() + 57_000), NOW).ok).toBe(true);
  });
});

describe('quickTimes', () => {
  it('offers in 2 minutes, in 1 hour and today 17:00 in the morning', () => {
    const q = quickTimes(NOW, TZ);
    expect(q.map((x) => x.label)).toEqual(['In 2 minutes', 'In 1 hour', 'Today 17:00']);
    expect(q[0].at.getTime() - NOW.getTime()).toBe(120_000);
    expect(q[1].at.getTime() - NOW.getTime()).toBe(3600_000);
    const p = localParts(q[2].at, TZ);
    expect([p.day, p.hour, p.minute]).toEqual([23, 17, 0]);
  });

  it('rolls 17:00 over to tomorrow in the evening', () => {
    const evening = new Date('2026-10-23T22:30:00Z'); // 18:30 Toronto
    const q = quickTimes(evening, TZ);
    expect(q[2].label).toBe('Tomorrow 17:00');
    const p = localParts(q[2].at, TZ);
    expect([p.day, p.hour, p.minute]).toEqual([24, 17, 0]);
    for (const x of q) expect(validateSendAt(x.at, evening).ok).toBe(true);
  });
});

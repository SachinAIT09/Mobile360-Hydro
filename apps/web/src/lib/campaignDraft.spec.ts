import { describe, expect, it } from 'vitest';
import { fmtSendAt, fromLocalInput, parseDraftParams, quickTimes, sendAtError, toLocalInput } from './campaignDraft';

const TZ = 'America/Toronto';

describe('parseDraftParams', () => {
  it('reads the plain prefill params used across the staff app', () => {
    const d = parseDraftParams(new URLSearchParams('type=STOP_CHARGING&feeder=SUB-01-F1&segment=ENROLLED_EV'));
    expect(d).toMatchObject({ type: 'STOP_CHARGING', segment: 'ENROLLED_EV', feeder: 'SUB-01-F1', feeders: [], liveEventId: null, copyB: null, fromAssistant: false });
    expect(d.copyA).toEqual({});
    expect(parseDraftParams(new URLSearchParams('liveEventId=abc')).liveEventId).toBe('abc');
  });

  it('ignores unknown type/segment values', () => {
    const d = parseDraftParams(new URLSearchParams('type=SPAM&segment=ALL'));
    expect(d.type).toBeNull();
    expect(d.segment).toBeNull();
  });

  it('parses a feeders list: trimmed, valid, distinct, at most 10', () => {
    const d = parseDraftParams(new URLSearchParams('feeders= SUB-01-F1,sub-01-f2,SUB-01-F1,bogus,,SUB-02-F3'));
    expect(d.feeders).toEqual(['SUB-01-F1', 'SUB-01-F2', 'SUB-02-F3']);
    const many = Array.from({ length: 14 }, (_, i) => `SUB-01-F${i + 1}`).join(',');
    expect(parseDraftParams(new URLSearchParams({ feeders: many })).feeders).toHaveLength(10);
  });

  it('reads assistant-drafted A and B copy', () => {
    const q = new URLSearchParams({
      type: 'ENROLL_OFFER', feeders: 'SUB-01-F1,SUB-01-F2', title: 'A title', body: 'A body', cta: 'Go', titleB: 'B title', bodyB: 'B body', src: 'assistant',
    });
    const d = parseDraftParams(q);
    expect(d.copyA).toEqual({ title: 'A title', body: 'A body', cta: 'Go' });
    expect(d.copyB).toEqual({ title: 'B title', body: 'B body' });
    expect(d.fromAssistant).toBe(true);
  });

  it('treats blank copy as absent and clamps lengths', () => {
    const d = parseDraftParams(new URLSearchParams({ title: '   ', titleB: '', cta: 'x'.repeat(80) }));
    expect(d.copyA).toEqual({ cta: 'x'.repeat(40) });
    expect(d.copyB).toBeNull();
  });
});

describe('scheduling helpers', () => {
  const NOW = new Date('2026-10-23T14:00:00Z'); // 10:00 Toronto

  it('quickTimes matches the API presets', () => {
    const q = quickTimes(NOW, TZ);
    expect(q.map((x) => x.label)).toEqual(['In 2 minutes', 'In 1 hour', 'Today 17:00']);
    expect(q[2].at.toISOString()).toBe('2026-10-23T21:00:00.000Z');
    const evening = quickTimes(new Date('2026-10-23T22:30:00Z'), TZ);
    expect(evening[2].label).toBe('Tomorrow 17:00');
    expect(evening[2].at.toISOString()).toBe('2026-10-24T21:00:00.000Z');
  });

  it('sendAtError enforces 1 minute … 24 hours', () => {
    expect(sendAtError(new Date(NOW.getTime() + 120_000), NOW)).toBeNull();
    expect(sendAtError(new Date(NOW.getTime() + 10_000), NOW)).toMatch(/1 minute/);
    expect(sendAtError(new Date(NOW.getTime() + 25 * 3600_000), NOW)).toMatch(/24 hours/);
    expect(sendAtError(null, NOW)).toMatch(/pick/i);
  });

  it('round-trips datetime-local values in the demo timezone', () => {
    expect(toLocalInput(NOW, TZ)).toBe('2026-10-23T10:00');
    expect(fromLocalInput('2026-10-23T17:30', TZ)?.toISOString()).toBe('2026-10-23T21:30:00.000Z');
    expect(fromLocalInput('nope', TZ)).toBeNull();
  });

  it('formats a send time relative to today', () => {
    expect(fmtSendAt(new Date('2026-10-23T21:00:00Z'), NOW, TZ)).toBe('5:00 PM');
    expect(fmtSendAt(new Date('2026-10-24T13:00:00Z'), NOW, TZ)).toBe('tomorrow 9:00 AM');
  });
});

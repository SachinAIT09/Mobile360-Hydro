import { describe, expect, it } from 'vitest';
import { audienceLabel, distinctFeeders } from './audience-label.js';

describe('audienceLabel', () => {
  it('labels a single feeder', () => {
    expect(audienceLabel({ kind: 'FEEDER', feederCode: 'SUB-01-F1', segment: 'UNENROLLED_EV' })).toBe('SUB-01-F1 · Detected, unenrolled EVs');
  });

  it('labels two feeders in full and more as +n, ignoring duplicates', () => {
    expect(audienceLabel({ kind: 'FEEDERS', feederCodes: ['SUB-01-F1', 'SUB-01-F2'], segment: 'ENROLLED_EV' })).toBe(
      'SUB-01-F1, SUB-01-F2 · Enrolled EVs (DR program)',
    );
    expect(
      audienceLabel({ kind: 'FEEDERS', feederCodes: ['SUB-01-F1', 'SUB-01-F2', 'SUB-01-F3', 'SUB-01-F2', 'SUB-02-F1'], segment: 'ENROLLED_EV' }),
    ).toBe('SUB-01-F1, SUB-01-F2 +2 · Enrolled EVs (DR program)');
  });

  it('labels a live-event cluster by its substation', () => {
    expect(audienceLabel({ kind: 'LIVE_EVENT', liveEventId: 'x', segment: 'UNENROLLED_EV' }, 'SUB-01')).toBe(
      'SUB-01 stopped-charging cluster · Detected, unenrolled EVs',
    );
  });

  it('dedupes feeders in order', () => {
    expect(distinctFeeders(['b', 'a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });
});

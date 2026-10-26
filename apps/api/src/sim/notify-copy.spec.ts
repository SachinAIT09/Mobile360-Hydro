import { describe, expect, it } from 'vitest';
import { NOTIFY_PRESETS } from '@demo/shared';
import { isPlainPreset, notifyCopy } from './notify-copy.js';

const ctx = { firstName: 'Priya', peakWindow: '5–8 PM', clock: '6:04 AM' };

describe('notifyCopy', () => {
  it('has copy for every plain preset in the catalogue', () => {
    for (const p of NOTIFY_PRESETS) {
      if (!isPlainPreset(p.id)) continue;
      const c = notifyCopy(p.id, ctx);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.body).not.toMatch(/\{|\}/);
    }
  });

  it('fills in the customer name and peak window', () => {
    const c = notifyCopy('CHARGING_STARTED', ctx);
    expect(c.kind).toBe('CHARGING');
    expect(c.body).toContain('Priya');
    expect(c.body).toContain('5–8 PM');
    expect(notifyCopy('PEAK_SOON', ctx).title).toContain('5–8 PM');
  });

  it('routes campaign presets elsewhere', () => {
    expect(isPlainPreset('STOP_CHARGING')).toBe(false);
    expect(isPlainPreset('ENROLL_OFFER')).toBe(false);
    expect(isPlainPreset('EV_DETECTED')).toBe(false);
    expect(isPlainPreset('BILL_READY')).toBe(true);
  });
});

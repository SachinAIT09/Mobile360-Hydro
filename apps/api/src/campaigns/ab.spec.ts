import { describe, expect, it } from 'vitest';
import type { CampaignStats } from '@demo/shared';
import { assignVariant, hashString, keyRate, pickWinner, splitTargets, variantRateScale } from './ab.js';

const CID = '66f1a2b3c4d5e6f7a8b9c0d1';
const ids = Array.from({ length: 2000 }, (_, i) => (0x100000 + i).toString(16).padStart(24, '0'));

const st = (o: Partial<CampaignStats>): CampaignStats => ({
  targeted: 0, sent: 0, delivered: 0, opened: 0, acted: 0, paused: 0, optedOut: 0, declined: 0, peakReducedMw: 0, ...o,
});

describe('hashString', () => {
  it('is deterministic and spreads nearby keys', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('')).toBe(0x811c9dc5);
  });
});

describe('assignVariant', () => {
  it('always gives demo customers variant A', () => {
    for (const id of ids.slice(0, 200)) expect(assignVariant(CID, id, true)).toBe('A');
  });

  it('is stable for a campaign + customer pair', () => {
    for (const id of ids.slice(0, 50)) expect(assignVariant(CID, id, false)).toBe(assignVariant(CID, id, false));
  });

  it('splits other customers roughly 50/50', () => {
    const b = ids.filter((id) => assignVariant(CID, id, false) === 'B').length / ids.length;
    expect(b).toBeGreaterThan(0.44);
    expect(b).toBeLessThan(0.56);
  });

  it('assigns differently across campaigns', () => {
    const a = ids.slice(0, 200).map((id) => assignVariant(CID, id, false));
    const b = ids.slice(0, 200).map((id) => assignVariant('66f1a2b3c4d5e6f7a8b9c0d2', id, false));
    expect(a).not.toEqual(b);
  });
});

describe('splitTargets', () => {
  it('keeps every target exactly once and puts demo customers in A', () => {
    const targets = ids.slice(0, 300).map((id, i) => ({ id, demo: i < 2 }));
    const s = splitTargets(CID, targets, (t) => t.id, (t) => t.demo);
    expect(s.A.length + s.B.length).toBe(300);
    expect(s.A.slice(0, 2).map((t) => t.id)).toEqual([ids[0], ids[1]]);
    expect(new Set([...s.A, ...s.B].map((t) => t.id)).size).toBe(300);
  });
});

describe('variantRateScale', () => {
  it('is 1 for A and a deterministic 0.85–1.15 for B', () => {
    expect(variantRateScale(CID, 'A')).toBe(1);
    const scales = ids.slice(0, 300).map((id) => variantRateScale(id));
    for (const s of scales) {
      expect(s).toBeGreaterThanOrEqual(0.85);
      expect(s).toBeLessThanOrEqual(1.15);
    }
    expect(variantRateScale(CID)).toBe(variantRateScale(CID, 'B'));
    expect(new Set(scales).size).toBeGreaterThan(50);
  });
});

describe('keyRate / pickWinner', () => {
  it('uses enrolled/delivered for offers and paused/delivered for DR', () => {
    expect(keyRate('ENROLL_OFFER', st({ delivered: 50, acted: 10, paused: 40 }))).toBeCloseTo(0.2);
    expect(keyRate('STOP_CHARGING', st({ delivered: 50, acted: 45, paused: 40 }))).toBeCloseTo(0.8);
    expect(keyRate('ENROLL_OFFER', st({ delivered: 0, acted: 3 }))).toBe(0);
  });

  it('needs at least 20 sends per variant', () => {
    expect(pickWinner('ENROLL_OFFER', { A: st({ sent: 19, delivered: 19, acted: 10 }), B: st({ sent: 40, delivered: 40, acted: 0 }) })).toBeNull();
    expect(pickWinner('ENROLL_OFFER', null)).toBeNull();
  });

  it('needs a lead of at least 3 percentage points', () => {
    // A 20%, B 18% → 2 points: too early.
    expect(pickWinner('ENROLL_OFFER', { A: st({ sent: 100, delivered: 100, acted: 20 }), B: st({ sent: 100, delivered: 100, acted: 18 }) })).toBeNull();
    // A 20%, B 17% → 3 points: A.
    expect(pickWinner('ENROLL_OFFER', { A: st({ sent: 100, delivered: 100, acted: 20 }), B: st({ sent: 100, delivered: 100, acted: 17 }) })).toBe('A');
    // DR: B pauses 80% vs A 70%.
    expect(pickWinner('STOP_CHARGING', { A: st({ sent: 50, delivered: 50, paused: 35 }), B: st({ sent: 50, delivered: 50, paused: 40 }) })).toBe('B');
  });
});

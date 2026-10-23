import { describe, expect, it } from 'vitest';
import type { Campaign, CampaignStats } from '@demo/shared';
import { abVerdict, funnelStages, isAb, variantRows } from './abStats';

const stats = (p: Partial<CampaignStats> = {}): CampaignStats => ({
  targeted: 0, sent: 0, delivered: 0, opened: 0, acted: 0, paused: 0, optedOut: 0, declined: 0, peakReducedMw: 0, ...p,
});

function campaign(p: Partial<Campaign> = {}): Campaign {
  return {
    id: 'c1', type: 'ENROLL_OFFER', audience: { kind: 'FEEDER', feederCode: 'SUB-01-F1', segment: 'UNENROLLED_EV' }, audienceLabel: 'x',
    exclusions: { optedOut: true, contactedLast7Days: true, lifeSupport: true }, title: 'Title A', body: 'b', cta: 'c',
    channels: { push: true, inApp: true, sms: false, email: false }, status: 'SENT', isTest: false, sentAt: '2026-10-23T14:00:00Z',
    expiresAt: '2026-10-24T14:00:00Z', drEventId: null, stats: stats({ sent: 100, delivered: 98, opened: 60, acted: 18 }), demoMessageId: null,
    scheduledFor: null, createdAt: '2026-10-23T14:00:00Z', createdBy: null, variants: null, variantStats: null, winner: null, ...p,
  };
}

describe('funnelStages', () => {
  it('builds offer and DR funnels as a share of sent', () => {
    expect(funnelStages('ENROLL_OFFER', stats({ sent: 200, delivered: 196, opened: 124, acted: 36 })).map((s) => [s.label, s.count, s.pct])).toEqual([
      ['Sent', 200, 100], ['Delivered', 196, 98], ['Opened', 124, 62], ['Enrolled', 36, 18],
    ]);
    expect(funnelStages('STOP_CHARGING', stats({ sent: 0 })).every((s) => s.pct === 0)).toBe(true);
    expect(funnelStages('STOP_CHARGING', stats({ sent: 50, delivered: 49, acted: 42, paused: 38 })).map((s) => s.label)).toEqual([
      'Sent', 'Delivered', 'Responded', 'Paused charging',
    ]);
  });
});

describe('variantRows', () => {
  it('returns one row for a plain campaign', () => {
    const rows = variantRows(campaign());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'All recipients', title: 'Title A', keyRate: 18.4, leading: false });
    expect(isAb(campaign())).toBe(false);
    expect(abVerdict(campaign())).toBeNull();
  });

  it('returns A and B rows with the leader marked', () => {
    const c = campaign({
      type: 'STOP_CHARGING',
      variants: [{ id: 'A', title: 'Title A', body: 'b', cta: 'c' }, { id: 'B', title: 'Title B', body: 'b', cta: 'c' }],
      variantStats: { A: stats({ sent: 60, delivered: 60, paused: 42 }), B: stats({ sent: 58, delivered: 56, paused: 47 }) },
      winner: 'B',
    });
    const rows = variantRows(c);
    expect(rows.map((r) => [r.id, r.title, r.keyRate, r.leading])).toEqual([
      ['A', 'Title A', 70, false],
      ['B', 'Title B', 83.9, true],
    ]);
    expect(rows[0].keyLabel).toBe('Paused / delivered');
    expect(abVerdict(c)).toBe('Variant B is leading');
    expect(abVerdict({ ...c, winner: null })).toBe('Too early to call');
  });
});

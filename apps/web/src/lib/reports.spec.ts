import { describe, it, expect } from 'vitest';
import type { BlindSpot, Campaign, CampaignStats, DrEvent, FeederStat, SubstationStat } from '@demo/shared';
import {
  blindSpotBars,
  campaignFunnel,
  drPerformance,
  enrollmentByFeeder,
  enrollmentSources,
  offerCampaigns,
  shortFeederCode,
  substationKnownTop,
  toCsv,
  AUDIT_ACTION_LABEL,
  initials,
  timeAgo,
} from './reports';

const stats = (p: Partial<CampaignStats> = {}): CampaignStats => ({
  targeted: 0,
  sent: 0,
  delivered: 0,
  opened: 0,
  acted: 0,
  paused: 0,
  optedOut: 0,
  declined: 0,
  peakReducedMw: 0,
  ...p,
});

function campaign(p: Partial<Campaign> & { id: string }): Campaign {
  return {
    type: 'ENROLL_OFFER',
    audience: { kind: 'FEEDER', feederCode: 'SUB-01-F1', segment: 'UNENROLLED_EV' },
    audienceLabel: 'SUB-01-F1 · Detected, unenrolled EVs',
    exclusions: { optedOut: true, contactedLast7Days: true, lifeSupport: true },
    title: 't',
    body: 'b',
    cta: 'c',
    channels: { push: true, inApp: true, sms: false, email: false },
    status: 'SENT',
    isTest: false,
    sentAt: '2026-10-20T10:00:00.000Z',
    expiresAt: '2026-10-22T10:00:00.000Z',
    drEventId: null,
    stats: stats(),
    demoMessageId: null,
    scheduledFor: null,
    createdAt: p.sentAt ?? '2026-10-20T10:00:00.000Z',
    createdBy: null,
    variants: null,
    variantStats: null,
    winner: null,
    ...p,
  };
}

const offerA = campaign({ id: 'a', sentAt: '2026-10-20T10:00:00.000Z', stats: stats({ targeted: 118, sent: 118, delivered: 116, opened: 73, acted: 21, declined: 4 }) });
const offerB = campaign({ id: 'b', sentAt: '2026-10-21T10:00:00.000Z', audienceLabel: 'SUB-01-F2 · Detected, unenrolled EVs', stats: stats({ targeted: 44, sent: 44, delivered: 43, opened: 27, acted: 8, declined: 1 }) });
const testOffer = campaign({ id: 't', isTest: true, sentAt: '2026-10-22T10:00:00.000Z', stats: stats({ targeted: 1, sent: 1, delivered: 1, opened: 1, acted: 1 }) });
const dr1 = campaign({
  id: 'd1',
  type: 'STOP_CHARGING',
  audience: { kind: 'FEEDER', feederCode: 'SUB-01-F1', segment: 'ENROLLED_EV' },
  audienceLabel: 'SUB-01-F1 · Enrolled EVs',
  drEventId: 'ev1',
  sentAt: '2026-10-21T15:00:00.000Z',
  stats: stats({ targeted: 69, sent: 69, delivered: 68, opened: 60, acted: 58, paused: 52, optedOut: 5, peakReducedMw: 0.374 }),
});
const dr2 = campaign({
  id: 'd2',
  type: 'STOP_CHARGING',
  audience: { kind: 'FEEDER', feederCode: 'SUB-01-F2', segment: 'ENROLLED_EV' },
  audienceLabel: 'SUB-01-F2 · Enrolled EVs',
  drEventId: 'ev-missing',
  sentAt: '2026-10-19T15:00:00.000Z',
  // acted < paused + optedOut must never produce negative reminders
  stats: stats({ targeted: 46, sent: 46, acted: 10, paused: 9, optedOut: 3 }),
});
const events: DrEvent[] = [
  { id: 'ev1', feederCode: 'SUB-01-F1', title: 'Pause 5–8 PM', windowStart: '2026-10-21T21:00:00.000Z', windowEnd: '2026-10-22T00:00:00.000Z', status: 'ENDED', campaignId: 'd1' },
];

describe('campaign funnel', () => {
  it('uses the newest non-test offer for "latest"', () => {
    const f = campaignFunnel([offerA, offerB, testOffer, dr1], 'latest');
    expect(f?.label).toBe('Latest offer · SUB-01-F2 · Detected, unenrolled EVs');
    expect(f?.stages.map((s) => [s.stage, s.count])).toEqual([
      ['Sent', 44],
      ['Delivered', 43],
      ['Opened', 27],
      ['Enrolled', 8],
      ['Declined', 1],
    ]);
  });

  it('sums every non-test offer for "all" and reports percentages of sent', () => {
    const f = campaignFunnel([offerA, offerB, testOffer, dr1], 'all');
    expect(f?.campaigns).toBe(2);
    expect(f?.stages.find((s) => s.stage === 'Sent')?.count).toBe(162);
    expect(f?.stages.find((s) => s.stage === 'Enrolled')).toEqual({ stage: 'Enrolled', count: 29, pct: 17.9 });
  });

  it('falls back to test sends when they are the only offers, and returns null with none', () => {
    expect(offerCampaigns([testOffer, dr1]).map((c) => c.id)).toEqual(['t']);
    expect(campaignFunnel([dr1], 'all')).toBeNull();
    expect(campaignFunnel([], 'latest')).toBeNull();
  });

  it('ignores campaigns that have not been sent (scheduled, sending or cancelled)', () => {
    const scheduled = campaign({ id: 's', status: 'SCHEDULED', sentAt: '2026-10-23T10:00:00.000Z', stats: stats({ targeted: 50, sent: 50 }) });
    const cancelled = campaign({ id: 'x', status: 'CANCELLED', sentAt: '2026-10-23T11:00:00.000Z' });
    expect(offerCampaigns([offerA, scheduled, cancelled]).map((c) => c.id)).toEqual(['a']);
    expect(campaignFunnel([scheduled], 'latest')).toBeNull();
    const drScheduled = campaign({ ...dr1, id: 'ds', status: 'SCHEDULED' });
    expect(drPerformance([dr1, drScheduled], events).map((r) => r.campaignId)).toEqual(['d1']);
  });

  it('has 0% stages when nothing was sent', () => {
    const f = campaignFunnel([campaign({ id: 'z' })], 'latest');
    expect(f?.stages.every((s) => s.pct === 0)).toBe(true);
  });
});

describe('DR performance', () => {
  it('builds one row per stop-charging campaign, newest first, with event status', () => {
    const rows = drPerformance([offerA, dr1, dr2], events);
    expect(rows.map((r) => r.campaignId)).toEqual(['d1', 'd2']);
    expect(rows[0]).toMatchObject({ feederCode: 'SUB-01-F1', targeted: 69, responded: 58, paused: 52, optedOut: 5, reminders: 1, peakReducedMw: 0.374, status: 'ENDED' });
    expect(rows[0].windowStart).toBe('2026-10-21T21:00:00.000Z');
  });

  it('never reports negative reminders and has null status when the event is unknown', () => {
    const rows = drPerformance([dr2], events);
    expect(rows[0].reminders).toBe(0);
    expect(rows[0].status).toBeNull();
    expect(rows[0].feederCode).toBe('SUB-01-F2');
  });
});

describe('enrollment by feeder', () => {
  const feeder = (code: string, known: number | null, unenrolled: number | null): FeederStat => ({
    code,
    substationCode: 'SUB-01',
    evs: (known ?? 0) + (unenrolled ?? 0),
    known,
    unenrolled,
    confirmedByEnrollment: null,
    groundTruthValidated: null,
    premises: null,
    penetrationPct: null,
    invisiblePct: null,
    forecastLoadPct: null,
  });

  it('keeps feeder order, shortens codes and skips feeders without a split', () => {
    const rows = enrollmentByFeeder([feeder('SUB-01-F1', 69, 77), feeder('SUB-01-F2', 46, 44), feeder('SUB-01-F9', null, null)]);
    expect(rows.map((r) => r.short)).toEqual(['F1', 'F2']);
    expect(rows[0]).toEqual({ code: 'SUB-01-F1', short: 'F1', known: 69, unenrolled: 77, evs: 146, knownPct: 47.3 });
  });

  it('shortFeederCode only strips a matching substation prefix', () => {
    expect(shortFeederCode('SUB-01-F3', 'SUB-01')).toBe('F3');
    expect(shortFeederCode('SUB-02-F3', 'SUB-01')).toBe('SUB-02-F3');
  });
});

describe('enrollment sources', () => {
  it('returns every source in a fixed order with shares', () => {
    const rows = enrollmentSources({ APP_POPUP: 25, CAMPAIGN: 25, LEGACY: 50 });
    expect(rows.map((r) => r.source)).toEqual(['APP_POPUP', 'CAMPAIGN', 'LEGACY']);
    expect(rows.map((r) => r.pct)).toEqual([25, 25, 50]);
  });
  it('tolerates missing keys', () => {
    expect(enrollmentSources({}).map((r) => r.count)).toEqual([0, 0, 0]);
  });
});

describe('substations and blind spots', () => {
  const sub = (code: string, evs: number, knownPct: number): SubstationStat => ({ code, region: 'Central', evs, knownPct, penetrationPct: 10, feederCount: 7, interactive: false });

  it('takes the n largest substations and orders them by known share', () => {
    const subs = [sub('A', 100, 40), sub('B', 500, 10), sub('C', 300, 70), sub('D', 50, 99)];
    expect(substationKnownTop(subs, 3).map((s) => s.code)).toEqual(['C', 'A', 'B']);
  });

  it('ranks blind spots by gap and renumbers', () => {
    const b = (feederCode: string, gapPct: number, rank: number): BlindSpot => ({ rank, feederCode, substationCode: 'SUB-09', known: 2, unenrolled: 30, penetrationText: '3% of 100', gapPct });
    const bars = blindSpotBars([b('X', 70, 2), b('Y', 90, 1), b('Z', 50, 3)], 2);
    expect(bars.map((x) => [x.rank, x.feederCode])).toEqual([
      [1, 'Y'],
      [2, 'X'],
    ]);
    expect(bars[0].region).toBeNull();
  });
});

describe('toCsv', () => {
  it('quotes cells with commas, quotes and newlines and uses CRLF', () => {
    const csv = toCsv(['a', 'b'], [['plain', 1], ['has, comma', 'say "hi"'], [null, 'line\nbreak']]);
    expect(csv).toBe('a,b\r\nplain,1\r\n"has, comma","say ""hi"""\r\n,"line\nbreak"\r\n');
  });
});

describe('audit display helpers', () => {
  it('labels every audit action', () => {
    expect(Object.keys(AUDIT_ACTION_LABEL)).toHaveLength(8);
    expect(AUDIT_ACTION_LABEL.CAMPAIGN_DISPATCHED).toBe('Sent scheduled campaign');
  });

  it('builds initials', () => {
    expect(initials('Jordan Reyes')).toBe('JR');
    expect(initials('Demo  Staff')).toBe('DS');
    expect(initials('Scheduler')).toBe('S');
    expect(initials(' ')).toBe('?');
  });

  it('formats relative times both ways', () => {
    const now = Date.parse('2026-10-23T14:00:00Z');
    expect(timeAgo('2026-10-23T13:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-10-23T13:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-10-23T11:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-10-22T14:00:00Z', now)).toBe('1 day ago');
    expect(timeAgo('2026-10-20T14:00:00Z', now)).toBe('3 days ago');
    expect(timeAgo('2026-10-23T14:04:00Z', now)).toBe('in 4 min');
  });
});

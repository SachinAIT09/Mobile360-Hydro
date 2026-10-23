import { describe, expect, it } from 'vitest';
import { ASSISTANT, type AssistantAnswer, type Bill, type BillSummary, type BlindSpot, type Campaign, type CampaignStats, type FeederStat, type ReportsSummary } from '@demo/shared';
import { buildDraft, draftCopy, validateCopy } from './copy-drafts.js';
import { answerCustomer, billJumped, pickBill, type CustomerFacts, type CustomerQuestion } from './customer-answers.js';
import { CUSTOMER_INTENTS, STAFF_INTENTS, type CustomerIntent, type StaffIntent } from './intents.js';
import { extractEntities } from './nlu.js';
import { cheapestBlock, estimatePlans, hourlyRates } from './rates.js';
import { answerStaff, pickCampaign, type StaffFacts, type StaffQuestion } from './staff-answers.js';

const NOW = new Date('2026-10-21T16:00:00Z'); // Wed Oct 21, 12:00 PM Toronto

const plain = (a: AssistantAnswer) => a.text.join(' ').replace(/\*\*/g, '');

// ---------------------------------------------------------------- fixtures

const SUB26: FeederStat = {
  code: 'SUB-26-F1', substationCode: 'SUB-26', evs: 17, known: 2, unenrolled: 15, confirmedByEnrollment: 1, groundTruthValidated: 0,
  premises: 48, penetrationPct: 35.4, invisiblePct: 88.2, forecastLoadPct: null,
};
const STATIC: FeederStat = { ...SUB26, code: 'SUB-05-F2', substationCode: 'SUB-05', evs: 12, known: null, unenrolled: null, confirmedByEnrollment: null, groundTruthValidated: null, premises: null, penetrationPct: null, invisiblePct: null };
const BLIND: BlindSpot[] = [
  { rank: 1, feederCode: 'SUB-26-F1', substationCode: 'SUB-26', region: 'East', known: 2, unenrolled: 15, penetrationText: '35.4% of 48', gapPct: 88.2 },
  { rank: 2, feederCode: 'SUB-15-F3', substationCode: 'SUB-15', region: 'South', known: 2, unenrolled: 13, penetrationText: '18.8% of 80', gapPct: 86.7 },
  { rank: 3, feederCode: 'SUB-11-F2', substationCode: 'SUB-11', region: 'South', known: 5, unenrolled: 28, penetrationText: '23.1% of 143', gapPct: 84.8 },
];
const stats = (s: Partial<CampaignStats>): CampaignStats => ({ targeted: 0, sent: 0, delivered: 0, opened: 0, acted: 0, paused: 0, optedOut: 0, declined: 0, peakReducedMw: 0, ...s });
const CAMPAIGN: Campaign = {
  id: 'c1', type: 'ENROLL_OFFER', audience: { kind: 'FEEDER', feederCode: 'SUB-26-F1', segment: 'UNENROLLED_EV' }, audienceLabel: 'SUB-26-F1 · Detected, unenrolled EVs',
  exclusions: { optedOut: true, contactedLast7Days: true, lifeSupport: true }, title: 'Earn rewards', body: 'b', cta: 'Go', channels: { push: true, inApp: true, sms: false, email: false },
  status: 'SENT', isTest: false, sentAt: '2026-10-21T14:00:00Z', expiresAt: '2026-10-23T14:00:00Z', drEventId: null,
  stats: stats({ targeted: 100, sent: 100, delivered: 98, opened: 62, acted: 18 }), demoMessageId: null, scheduledFor: null, createdAt: '2026-10-21T14:00:00Z', createdBy: null,
  variants: null, variantStats: null, winner: null,
};
const REPORTS: ReportsSummary = {
  generatedAt: NOW.toISOString(),
  enrollments: {
    active: 1726, bySource: { APP_POPUP: 4, CAMPAIGN: 20, LEGACY: 1702 }, today: 2,
    last30Days: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i - 8 > 0 ? i - 8 : 1).padStart(2, '0')}`, count: i >= 23 ? 3 : 1 })),
  },
  drProgram: { eventsEnded: 2, householdsPaused: 120, kwhShifted: 2592, peakReducedMw: 0.864 },
  campaigns: { total: 3, offers: 2, drRequests: 1, testSends: 0 },
  smartCharging: { homes: 0, flexibleKw: 0, shiftedKwhPerNight: 0, peakAvoidedMw: 0 },
};

const sq = (intent: StaffIntent | 'FALLBACK', question = '', context = {}): StaffQuestion => ({ intent, entities: extractEntities(question), context, now: NOW });
const cq = (intent: CustomerIntent | 'FALLBACK', question = '', context = {}): CustomerQuestion => ({ intent, entities: extractEntities(question), context, now: NOW });

const BILLS: BillSummary[] = [1142, 820, 690, 730, 610, 520].map((kWh, i) => ({
  id: `b${i}`,
  periodStart: new Date(Date.UTC(2026, 8 - i, 15, 16)).toISOString(),
  periodEnd: new Date(Date.UTC(2026, 9 - i, 14, 16)).toISOString(),
  kWh,
  total: [184.27, 132.32, 111.34, 117.79, 98.43, 83.89][i],
  status: i === 0 ? 'UNPAID' : 'PAID',
}));
const BILL: Bill = {
  id: 'b0', periodStart: BILLS[0].periodStart, periodEnd: BILLS[0].periodEnd, days: 30, kWh: 1142,
  lines: [{ label: 'Electricity', amount: 92.4 }], total: 184.27, dueDate: '2026-11-08T17:00:00Z', status: 'UNPAID', evSharePct: null,
};
const MANNY: CustomerFacts = { firstName: 'Manny', feederCode: 'SUB-01-F1', hasSolar: true, bill: BILL, bills: BILLS, evStatus: 'NONE', plan: null, ratePlans: null };

function wellFormed(a: AssistantAnswer) {
  expect(a.disclosure).toBe(ASSISTANT.disclosure);
  expect(a.text.length).toBeGreaterThan(0);
  expect(a.followUps.length).toBeLessThanOrEqual(4);
  expect(a.context.lastIntent).toBe(a.intent);
  expect(a.generatedAt).toBe(NOW.toISOString());
  for (const act of a.actions) if (act.kind === 'route') expect(act.route.startsWith('/')).toBe(true);
}

// ---------------------------------------------------------------- staff

describe('staff answers', () => {
  it('FEEDER_STATUS: golden text for SUB-26-F1', () => {
    const a = answerStaff(sq('FEEDER_STATUS', 'How is SUB-26-F1 doing?'), { feederCode: 'SUB-26-F1', feeder: SUB26, blindSpots: BLIND });
    wellFormed(a);
    expect(plain(a)).toBe(
      'SUB-26-F1 (substation SUB-26) has 17 EVs: 2 enrolled and 15 detected but not enrolled. ' +
        'That leaves 88.2% of its EVs invisible to the DR program, with EV penetration at 35.4% of 48 premises. It is blind spot #1 on the dashboard.',
    );
    expect(a.facts.find((f) => f.label === 'Not enrolled')?.value).toBe('15');
    expect(a.chart?.points.map((p) => p.value)).toEqual([2, 15]);
    expect(a.followUps[0]).toBe('Draft an enrollment offer for SUB-26-F1');
    expect(a.context).toEqual({ lastIntent: 'FEEDER_STATUS', feederCode: 'SUB-26-F1' });
    expect(a.actions).toContainEqual({ kind: 'route', label: 'Open feeder dashboard', route: '/feeders' });
  });

  it('FEEDER_STATUS: unknown, static and missing feeders', () => {
    expect(plain(answerStaff(sq('FEEDER_STATUS'), { feederCode: 'SUB-99-F9', feeder: null, blindSpots: BLIND }))).toContain("couldn't find feeder SUB-99-F9");
    expect(plain(answerStaff(sq('FEEDER_STATUS'), { feederCode: 'SUB-05-F2', feeder: STATIC, blindSpots: BLIND }))).toContain('SUB-05-F2 (substation SUB-05) has 12 EVs');
    const which = answerStaff(sq('FEEDER_STATUS'), { feederCode: null, blindSpots: BLIND });
    expect(which.followUps).toEqual(['How is SUB-26-F1 doing?', 'How is SUB-15-F3 doing?', 'How is SUB-11-F2 doing?']);
  });

  it('BLIND_SPOTS ranks by gap and honours "top 2"', () => {
    const a = answerStaff(sq('BLIND_SPOTS', 'top 2 blind spots'), { blindSpots: BLIND });
    wellFormed(a);
    expect(plain(a)).toContain('The biggest blind spot is SUB-26-F1 (East): 15 of 17 EVs aren\'t enrolled (88.2% invisible).');
    expect(a.chart?.points).toHaveLength(2);
    expect(a.chart?.points[0].highlight).toBe(true);
  });

  it('DRAFT_CAMPAIGN: one feeder → a campaignDraft action with both variants', () => {
    const a = answerStaff(sq('DRAFT_CAMPAIGN', 'Draft an enrollment offer for SUB-26-F1'), { blindSpots: BLIND, draftTargets: [{ code: 'SUB-26-F1', known: 2, unenrolled: 15 }] });
    wellFormed(a);
    expect(plain(a)).toContain('drafts for SUB-26-F1, reaching 15 EV owners who are detected but not enrolled');
    const act = a.actions[0];
    expect(act.kind).toBe('campaignDraft');
    if (act.kind !== 'campaignDraft') throw new Error('expected a draft');
    expect(act.label).toBe('Open in Campaign 360');
    expect(act.draft.audience).toEqual({ kind: 'FEEDER', feederCode: 'SUB-26-F1', segment: 'UNENROLLED_EV' });
    expect(act.draft.variants).toHaveLength(2);
  });

  it('DRAFT_CAMPAIGN: several feeders → FEEDERS audience; stop-charging → enrolled segment', () => {
    const multi = answerStaff(sq('DRAFT_CAMPAIGN', 'draft an offer for the top 3 blind spots'), {
      draftTargets: BLIND.map((b) => ({ code: b.feederCode, known: b.known, unenrolled: b.unenrolled })),
    });
    const act = multi.actions[0];
    if (act.kind !== 'campaignDraft') throw new Error('expected a draft');
    expect(act.draft.audience).toEqual({ kind: 'FEEDERS', feederCodes: ['SUB-26-F1', 'SUB-15-F3', 'SUB-11-F2'], segment: 'UNENROLLED_EV' });
    expect(plain(multi)).toContain('reaching 56 EV owners');
    const stop = answerStaff(sq('DRAFT_CAMPAIGN', 'write a stop charging request for SUB-01-F1'), { draftTargets: [{ code: 'SUB-01-F1', known: 69, unenrolled: 77 }] });
    const s = stop.actions[0];
    if (s.kind !== 'campaignDraft') throw new Error('expected a draft');
    expect(s.draft.type).toBe('STOP_CHARGING');
    expect(s.draft.audience.segment).toBe('ENROLLED_EV');
    expect(plain(stop)).toContain('reaching 69 enrolled EV owners');
  });

  it('CAMPAIGN_PERFORMANCE: funnel, and A/B winner when present', () => {
    const a = answerStaff(sq('CAMPAIGN_PERFORMANCE'), { campaigns: [CAMPAIGN] });
    wellFormed(a);
    expect(plain(a)).toContain('62 opened it (62%) and 18 enrolled, a 18% conversion.');
    expect(a.context.campaignId).toBe('c1');
    expect(a.actions[0]).toEqual({ kind: 'route', label: 'Open campaign', route: '/campaigns/c1' });
    const ab = answerStaff(sq('CAMPAIGN_PERFORMANCE'), {
      campaigns: [{ ...CAMPAIGN, variantStats: { A: stats({ sent: 50, acted: 12 }), B: stats({ sent: 50, acted: 6 }) }, winner: 'A' }],
    });
    expect(plain(ab)).toContain('A/B test: variant A 24% vs variant B 12% enrolled. Variant A is leading.');
    const early = answerStaff(sq('CAMPAIGN_PERFORMANCE'), { campaigns: [{ ...CAMPAIGN, variantStats: { A: stats({ sent: 5 }), B: stats({ sent: 5 }) }, winner: null }] });
    expect(plain(early)).toContain('Too early to call a winner.');
    expect(plain(answerStaff(sq('CAMPAIGN_PERFORMANCE'), { campaigns: [] }))).toContain('No campaigns have been sent yet');
  });

  it('pickCampaign prefers the context campaign, then the latest real send', () => {
    const test = { ...CAMPAIGN, id: 't', isTest: true };
    const other = { ...CAMPAIGN, id: 'c2' };
    expect(pickCampaign([test, CAMPAIGN, other])?.id).toBe('c1');
    expect(pickCampaign([test, CAMPAIGN, other], 'c2')?.id).toBe('c2');
    expect(pickCampaign([test])?.id).toBe('t');
  });

  it('DR_PERFORMANCE, ENROLLMENT_TREND, FLEX_LOAD from the reports summary', () => {
    expect(plain(answerStaff(sq('DR_PERFORMANCE'), { reports: REPORTS, drEvents: [] }))).toContain('2 DR events have ended. 120 households paused charging, shifting 2,592 kWh and cutting the peak by 0.864 MW.');
    const trend = answerStaff(sq('ENROLLMENT_TREND'), { reports: REPORTS });
    expect(plain(trend)).toContain('1,726 customers are enrolled. 44 joined in the last 30 days and 21 in the last 7, up from 7 the week before.');
    expect(trend.chart?.kind).toBe('line');
    expect(trend.chart?.points).toHaveLength(30);
    const flex = answerStaff(sq('FLEX_LOAD'), { reports: REPORTS, overview: { knownEvs: 1726, unenrolledEvs: 1770 } as never });
    expect(plain(flex)).toContain('1,726 enrolled EVs can be asked to pause, about 12.4 MW');
    expect(plain(flex)).toContain('Smart charging is not switched on in any homes yet');
  });

  it('GRID_RISK drafts a stop-charging request for the riskiest feeder', () => {
    const a = answerStaff(sq('GRID_RISK'), {
      riskFeeders: [{ code: 'SUB-01-F1', forecastLoadPct: 92, known: 69 }],
      nextWindow: { start: '2026-10-21T21:00:00Z', end: '2026-10-22T00:00:00Z' },
    });
    expect(plain(a)).toContain('SUB-01-F1 is forecast at 92% of capacity for 5–8 PM.');
    expect(a.actions[0].kind).toBe('campaignDraft');
    const calm = answerStaff(sq('GRID_RISK'), { riskFeeders: [], nextWindow: { start: '2026-10-21T21:00:00Z', end: '2026-10-22T00:00:00Z' } });
    expect(plain(calm)).toContain('No feeder is forecast above 85%');
  });

  it('FALLBACK says it is scripted and offers suggestions that match', () => {
    const a = answerStaff(sq('FALLBACK', "what's the weather"), {});
    expect(a.matched).toBe(false);
    expect(plain(a)).toMatch(/scripted demo assistant/);
    expect(a.followUps.length).toBeGreaterThan(1);
  });

  it('every staff intent answers without throwing on empty facts', () => {
    for (const d of STAFF_INTENTS) wellFormed(answerStaff(sq(d.id), {} as StaffFacts));
  });
});

// ---------------------------------------------------------------- customer

describe('customer answers', () => {
  it('BILL_WHY_HIGH: 1142 vs 820 kWh → 39%', () => {
    const a = answerCustomer(cq('BILL_WHY_HIGH', 'Why is my bill high?'), MANNY);
    wellFormed(a);
    expect(a.text[0]).toBe('Your October bill is **$184.27** for **1,142 kWh**, up **39%** from 820 kWh in September.');
    expect(plain(a)).toContain('A new large load, such as an EV charger');
    expect(a.chart?.points.map((p) => p.value)).toEqual([520, 610, 730, 690, 820, 1142]);
    expect(a.chart?.points[5].highlight).toBe(true);
    expect(a.actions[0]).toEqual({ kind: 'route', label: 'Open bill', route: '/bill' });
  });

  it('BILL_WHY_HIGH: EV share when an EV is known; named month; last month', () => {
    const priya = { ...MANNY, evStatus: 'ENROLLED' as const, bill: { ...BILL, evSharePct: 38 } };
    expect(plain(answerCustomer(cq('BILL_WHY_HIGH'), priya))).toContain('EV charging is the biggest factor: about 38% of this bill, roughly 434 kWh.');
    expect(answerCustomer(cq('BILL_WHY_HIGH', 'what about my August bill'), MANNY).text[0]).toBe('Your August bill is **$111.34** for **690 kWh**, about the same as July (730 kWh).');
    expect(plain(answerCustomer(cq('BILL_WHY_HIGH', 'compare to last month'), MANNY))).toContain('Your September bill is $132.32 for 820 kWh, up 19% from 690 kWh in August.');
  });

  it('pickBill and billJumped', () => {
    expect(pickBill(BILLS, extractEntities('july'))?.bill.kWh).toBe(730);
    expect(pickBill([], extractEntities(''))).toBe(null);
    expect(billJumped(BILLS)).toBe(true);
    expect(billJumped(BILLS.slice(1))).toBe(false);
  });

  it('BILL_DUE', () => {
    const a = answerCustomer(cq('BILL_DUE'), { ...MANNY, autoPay: { enabled: false, method: null, since: null } });
    expect(plain(a)).toContain('Your October bill of $184.27 is due Sun, Nov 8, in 19 days.');
    expect(a.actions[0]).toEqual({ kind: 'route', label: 'Pay now', route: '/pay' });
    expect(plain(answerCustomer(cq('BILL_DUE'), { ...MANNY, bill: { ...BILL, status: 'PAID' } }))).toContain('is paid');
  });

  it('BEST_TIME uses the placeholder TOU plan on a weekday', () => {
    const a = answerCustomer(cq('BEST_TIME'), MANNY);
    expect(plain(a)).toContain('On Time-of-use, the cheapest hours on weekdays are 7 PM–7 AM at $0.076/kWh, versus $0.158 at the peak.');
    expect(plain(a)).toContain('The grid is cleanest around 2 AM');
    expect(a.chart?.points).toHaveLength(24);
  });

  it('RATE_PLAN estimates every plan and flags exactly one best', () => {
    const a = answerCustomer(cq('RATE_PLAN'), { ...MANNY, evStatus: 'ENROLLED' });
    expect(a.facts).toHaveLength(3);
    expect(a.chart?.points.filter((p) => p.highlight)).toHaveLength(1);
    expect(plain(a)).toMatch(/Based on about 1,142 kWh a month, \w/);
  });

  it('EV_COST without an EV explains there is nothing to show', () => {
    expect(plain(answerCustomer(cq('EV_COST'), MANNY))).toContain("haven't detected an EV");
  });

  it('GRID_EVENT and OUTAGE', () => {
    const ev = answerCustomer(cq('GRID_EVENT'), {
      ...MANNY, evStatus: 'ENROLLED',
      activeDrEvent: { id: 'd1', title: 'Pause charging tonight', windowStart: '2026-10-21T21:00:00Z', windowEnd: '2026-10-22T00:00:00Z', status: 'SCHEDULED', myResponse: null },
    });
    expect(plain(ev)).toContain('is scheduled for 5–8 PM');
    expect(ev.actions[0]).toEqual({ kind: 'route', label: 'Open event', route: '/dr-events/d1' });
    expect(answerCustomer(cq('GRID_EVENT'), MANNY).actions[0].kind).toBe('route');
    const out = answerCustomer(cq('OUTAGE'), { ...MANNY, outage: { id: 'o', feederCode: 'SUB-01-F2', affectedCount: 212, status: 'CREW_ASSIGNED', estRestoreAt: '2026-10-22T00:45:00Z', cause: null } });
    expect(plain(out)).toContain('affecting 212 customers');
    expect(plain(out)).toContain('8:45 PM');
  });

  it('FALLBACK is honest about being scripted', () => {
    const a = answerCustomer(cq('FALLBACK', "what's the weather"), MANNY);
    expect(a.matched).toBe(false);
    expect(plain(a)).toMatch(/scripted demo assistant/);
  });

  it('every customer intent answers without throwing on minimal facts', () => {
    for (const d of CUSTOMER_INTENTS) wellFormed(answerCustomer(cq(d.id), { firstName: 'X' }));
  });
});

// ---------------------------------------------------------------- drafts + rates

describe('copy drafts', () => {
  it.each(['ENROLL_OFFER', 'STOP_CHARGING'] as const)('%s: two valid variants for small and large feeders', (type) => {
    for (const known of [0, 2, 69]) {
      const [a, b] = draftCopy(type, { feederCodes: ['SUB-26-F1'], knownOnFeeder: known, unenrolled: 15 });
      expect(validateCopy(a)).toEqual([]);
      expect(validateCopy(b)).toEqual([]);
      expect(a.title).not.toBe(b.title);
      expect(`${a.title} ${a.body}`).toContain('{first_name}');
      expect(b.title).toContain('{incentive}');
    }
  });
  it('social proof quotes the neighbour count only when it is convincing', () => {
    expect(draftCopy('ENROLL_OFFER', { feederCodes: ['x'], knownOnFeeder: 69, unenrolled: 1 })[0].title).toContain('{neighbours_enrolled}');
    expect(draftCopy('ENROLL_OFFER', { feederCodes: ['x'], knownOnFeeder: 2, unenrolled: 1 })[0].title).not.toContain('{neighbours_enrolled}');
    expect(draftCopy('STOP_CHARGING', { feederCodes: ['x'], knownOnFeeder: 2, unenrolled: 1 })[0].title).toContain('{event_window}');
  });
  it('flags unknown merge fields and long copy', () => {
    expect(validateCopy({ title: 'Hi {name}', body: 'x'.repeat(1001), cta: 'ok' })).toEqual(['body longer than 1000', 'unknown merge field {name}']);
  });
  it('buildDraft caps a multi-feeder audience at 10', () => {
    const d = buildDraft('ENROLL_OFFER', { feederCodes: Array.from({ length: 12 }, (_, i) => `SUB-01-F${i}`), knownOnFeeder: 1, unenrolled: 1 });
    expect(d.audience.kind === 'FEEDERS' && d.audience.feederCodes.length).toBe(10);
  });
});

describe('rates', () => {
  it('cheapest blocks wrap past midnight', () => {
    expect(cheapestBlock(hourlyRates('TOU', false))).toEqual({ start: 19, end: 7, hours: 12, rate: 0.076 });
    expect(cheapestBlock(hourlyRates('ULO', false))).toEqual({ start: 23, end: 7, hours: 8, rate: 0.028 });
    expect(cheapestBlock(hourlyRates('TOU', true)).hours).toBe(24);
  });
  it('smart charging never costs more than unmanaged charging', () => {
    const c = estimatePlans(1142, 0.38, 'TOU');
    expect(c.plans.filter((p) => p.best)).toHaveLength(1);
    for (const p of c.plans) expect(p.withSmartCharging).toBeLessThanOrEqual(p.monthlyCost);
    expect(c.plans.find((p) => p.id === 'TOU')?.current).toBe(true);
  });
});

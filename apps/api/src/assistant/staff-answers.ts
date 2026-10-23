import {
  BRAND,
  fmtDate,
  fmtInt,
  fmtTime,
  fmtWindow,
  type AssistantAnswer,
  type AssistantContext,
  type AssistantFact,
  type BlindSpot,
  type Campaign,
  type CampaignStats,
  type CampaignType,
  type DrEvent,
  type FeederStat,
  type ReportsSummary,
  type StatsOverview,
} from '@demo/shared';
import { answer, dayLabel, listText, pct, route, SCRIPTED_FALLBACK } from './answer-kit.js';
import { buildDraft } from './copy-drafts.js';
import { STAFF_SUGGESTIONS, type StaffIntent } from './intents.js';
import type { Entities } from './nlu.js';

/** kW one EV draws while charging (the energy model's Level 2 rate). */
export const EV_KW = 7.2;
/** Forecast load at or above this share of capacity counts as "at risk". */
export const RISK_PCT = 85;

export interface RiskFeeder {
  code: string;
  forecastLoadPct: number;
  /** Enrolled EVs on the feeder (null for static feeders). */
  known: number | null;
}

export interface DraftTarget {
  code: string;
  known: number;
  unenrolled: number;
}

/** Facts gathered by AssistantService for one staff question; only the fields the intent needs are set. */
export interface StaffFacts {
  /** Feeder the question is about (requested code, or from context). */
  feederCode?: string | null;
  feeder?: FeederStat | null;
  blindSpots?: BlindSpot[];
  overview?: StatsOverview;
  campaigns?: Campaign[];
  reports?: ReportsSummary;
  drEvents?: DrEvent[];
  riskFeeders?: RiskFeeder[];
  /** The next DR window (ISO) the simulators would use. */
  nextWindow?: { start: string; end: string };
  draftTargets?: DraftTarget[];
}

export interface StaffQuestion {
  intent: StaffIntent | 'FALLBACK';
  entities: Entities;
  context: AssistantContext;
  now: Date;
}

const draftFollowUp = (code: string, type: CampaignType = 'ENROLL_OFFER') =>
  type === 'ENROLL_OFFER' ? `Draft an enrollment offer for ${code}` : `Draft a stop-charging request for ${code}`;

// ---------------------------------------------------------------- FEEDER_STATUS

export function feederStatus(q: StaffQuestion, f: StaffFacts): AssistantAnswer {
  const code = f.feederCode;
  const top = (f.blindSpots ?? []).slice(0, 3).map((b) => `How is ${b.feederCode} doing?`);
  if (!code) {
    return answer('FEEDER_STATUS', { text: ['Which feeder? Ask about a code like SUB-01-F1, or start from one of the biggest blind spots.'], followUps: top, actions: [route('Open feeder dashboard', '/feeders')] }, q.now);
  }
  const s = f.feeder;
  if (!s) {
    return answer('FEEDER_STATUS', { text: [`I couldn't find feeder **${code}** in the demo data.`, 'Feeder codes look like SUB-01-F1 (substation, then feeder number).'], followUps: top, actions: [route('Open feeder dashboard', '/feeders')] }, q.now);
  }
  const followUps = [draftFollowUp(s.code), 'Where are our biggest blind spots?', 'Which feeders are at risk tonight?'];
  const actions = [route('Open feeder dashboard', '/feeders')];
  if (s.known === null || s.unenrolled === null) {
    return answer(
      'FEEDER_STATUS',
      {
        text: [
          `**${s.code}** (substation ${s.substationCode}) has **${fmtInt(s.evs)}** EVs in the ${BRAND.partners.evDetection} pilot sample.`,
          'The enrolled / not-enrolled split is only available for SUB-01 and the ranked blind-spot feeders in this demo.',
        ],
        facts: [{ label: 'EVs', value: fmtInt(s.evs) }, ...(s.forecastLoadPct !== null ? [riskFact(s.forecastLoadPct)] : [])],
        followUps: followUps.slice(1),
        actions,
        context: { feederCode: s.code },
      },
      q.now,
    );
  }
  const rank = (f.blindSpots ?? []).find((b) => b.feederCode === s.code)?.rank;
  const text = [
    `**${s.code}** (substation ${s.substationCode}) has **${fmtInt(s.evs)}** EVs: **${fmtInt(s.known)}** enrolled and **${fmtInt(s.unenrolled)}** detected but not enrolled.`,
    `That leaves ${s.invisiblePct ?? 0}% of its EVs invisible to the DR program${s.premises ? `, with EV penetration at ${s.penetrationPct ?? 0}% of ${fmtInt(s.premises)} premises` : ''}.${rank ? ` It is blind spot #${rank} on the dashboard.` : ''}`,
  ];
  if (s.forecastLoadPct !== null) text.push(`Load is forecast at **${s.forecastLoadPct}%** of capacity for the next peak.`);
  const facts: AssistantFact[] = [
    { label: 'EVs', value: fmtInt(s.evs) },
    { label: 'Enrolled', value: fmtInt(s.known), tone: 'good' },
    { label: 'Not enrolled', value: fmtInt(s.unenrolled), tone: s.unenrolled > s.known ? 'warn' : 'default' },
    { label: 'Invisible', value: `${s.invisiblePct ?? 0}%` },
  ];
  if (s.premises) facts.push({ label: 'Premises', value: fmtInt(s.premises) });
  if (s.forecastLoadPct !== null) facts.push(riskFact(s.forecastLoadPct));
  return answer(
    'FEEDER_STATUS',
    {
      text,
      facts,
      chart: { kind: 'bar', unit: 'EVs', points: [{ label: 'Enrolled', value: s.known }, { label: 'Not enrolled', value: s.unenrolled, highlight: true }] },
      followUps: s.unenrolled > 0 ? followUps : followUps.slice(1),
      actions,
      context: { feederCode: s.code },
    },
    q.now,
  );
}

const riskFact = (p: number): AssistantFact => ({ label: 'Forecast load', value: `${p}%`, tone: p >= RISK_PCT ? 'bad' : 'default' });

// ---------------------------------------------------------------- BLIND_SPOTS

export function blindSpots(q: StaffQuestion, f: StaffFacts): AssistantAnswer {
  const list = f.blindSpots ?? [];
  if (!list.length) return answer('BLIND_SPOTS', { text: ['No feeder has enough EVs (15+) to rank as a blind spot right now.'], actions: [route('Open feeder dashboard', '/feeders')] }, q.now);
  const n = Math.min(Math.max(q.entities.count ?? 5, 1), list.length);
  const shown = list.slice(0, n);
  const [top, ...rest] = shown;
  const text = [
    `The biggest blind spot is **${top.feederCode}**${top.region ? ` (${top.region})` : ''}: **${top.unenrolled}** of ${top.known + top.unenrolled} EVs aren't enrolled (**${top.gapPct}%** invisible).`,
  ];
  if (rest.length) text.push(`Next: ${rest.map((b) => `${b.feederCode} (${b.gapPct}%)`).join(', ')}.`);
  text.push('These feeders have the most EV load we cannot call on during a peak event.');
  return answer(
    'BLIND_SPOTS',
    {
      text,
      facts: shown.slice(0, 4).map((b) => ({ label: b.feederCode, value: `${b.unenrolled} of ${b.known + b.unenrolled} unenrolled`, tone: 'warn' as const })),
      chart: { kind: 'bar', unit: '% invisible', points: shown.map((b, i) => ({ label: b.feederCode, value: b.gapPct, highlight: i === 0 })) },
      followUps: [`How is ${top.feederCode} doing?`, draftFollowUp(top.feederCode), 'Draft an enrollment offer for the top 3 blind spots'],
      actions: [route('Open feeder dashboard', '/feeders')],
      context: { feederCode: top.feederCode },
    },
    q.now,
  );
}

// ---------------------------------------------------------------- OVERVIEW

export function overview(q: StaffQuestion, f: StaffFacts): AssistantAnswer {
  const o = f.overview;
  if (!o) return fallback(q);
  const total = o.knownEvs + o.unenrolledEvs;
  return answer(
    'OVERVIEW',
    {
      text: [
        `Across **${o.substations}** substations and ${fmtInt(o.feeders)} feeders we can see **${fmtInt(total)}** EVs.`,
        `**${fmtInt(o.knownEvs)}** are known to our programs and **${fmtInt(o.unenrolledEvs)}** (**${o.invisiblePct}%**) are invisible: detected by ${BRAND.partners.evDetection} but not enrolled.`,
        `${o.deadSubstations} substations and ${o.deadFeeders} feeders have no signal yet, and ${fmtInt(o.noSignalPremises)} matched premises show no EV.`,
      ],
      facts: [
        { label: 'EVs seen', value: fmtInt(total) },
        { label: 'Known', value: fmtInt(o.knownEvs), tone: 'good' },
        { label: 'Invisible', value: `${o.invisiblePct}%`, tone: 'warn' },
        { label: 'Substations', value: fmtInt(o.substations) },
      ],
      chart: { kind: 'bar', unit: 'EVs', points: [{ label: 'Known', value: o.knownEvs }, { label: 'Invisible', value: o.unenrolledEvs, highlight: true }] },
      followUps: ['Where are our biggest blind spots?', 'How are enrollments trending?', 'How much flexible load do we have?'],
      actions: [route('Open feeder dashboard', '/feeders')],
    },
    q.now,
  );
}

// ---------------------------------------------------------------- CAMPAIGN_PERFORMANCE

const rate = (s: CampaignStats, type: CampaignType) => pct(type === 'ENROLL_OFFER' ? s.acted : s.paused, s.sent);

export function pickCampaign(list: Campaign[], campaignId?: string): Campaign | null {
  if (campaignId) {
    const c = list.find((x) => x.id === campaignId);
    if (c) return c;
  }
  const real = list.filter((c) => !c.isTest && c.status !== 'CANCELLED');
  const sent = real.filter((c) => c.status === 'SENT' || c.status === 'SENDING');
  return sent[0] ?? real[0] ?? list[0] ?? null;
}

export function campaignPerformance(q: StaffQuestion, f: StaffFacts): AssistantAnswer {
  const c = pickCampaign(f.campaigns ?? [], q.context.campaignId);
  if (!c) {
    return answer(
      'CAMPAIGN_PERFORMANCE',
      { text: ['No campaigns have been sent yet in this demo.', 'Start with an enrollment offer on a blind-spot feeder.'], followUps: ['Where are our biggest blind spots?', 'Draft an enrollment offer for SUB-26-F1'], actions: [route('Open Campaign 360', '/campaigns')] },
      q.now,
    );
  }
  const offer = c.type === 'ENROLL_OFFER';
  const s = c.stats;
  const kind = offer ? 'enrollment offer' : 'stop-charging request';
  const actions = [route('Open campaign', `/campaigns/${c.id}`), route('All campaigns', '/campaigns')];
  if (c.status === 'SCHEDULED') {
    return answer(
      'CAMPAIGN_PERFORMANCE',
      {
        text: [`The latest ${kind}, “${c.title}”, is scheduled for **${fmtTime(c.scheduledFor ?? c.sentAt)}** to ${c.audienceLabel}. Nothing has been sent yet.`],
        facts: [{ label: 'Status', value: 'Scheduled' }],
        followUps: ['How did our DR events perform?', 'How are enrollments trending?'],
        actions,
        context: { campaignId: c.id },
      },
      q.now,
    );
  }
  const text = [`The ${c.isTest ? 'test ' : ''}${kind} “${c.title}” went to **${fmtInt(s.sent)}** customers (${c.audienceLabel}) on ${fmtDate(c.sentAt, { month: 'short', day: 'numeric' })} at ${fmtTime(c.sentAt)}.`];
  if (offer) {
    text.push(`**${fmtInt(s.opened)}** opened it (${pct(s.opened, s.sent)}%) and **${fmtInt(s.acted)}** enrolled, a **${pct(s.acted, s.sent)}%** conversion.`);
  } else {
    text.push(`**${fmtInt(s.acted)}** responded and **${fmtInt(s.paused)}** paused charging (**${pct(s.paused, s.sent)}%**), cutting the peak by about **${s.peakReducedMw} MW**.`);
  }
  if (c.variantStats) {
    const a = c.variantStats.A;
    const b = c.variantStats.B;
    text.push(
      `A/B test: variant A ${rate(a, c.type)}% vs variant B ${rate(b, c.type)}% ${offer ? 'enrolled' : 'paused'}. ${c.winner ? `**Variant ${c.winner}** is leading.` : 'Too early to call a winner.'}`,
    );
  }
  if (q.now.getTime() - new Date(c.sentAt).getTime() < 60_000 && c.status !== 'CANCELLED') text.push('Results are still coming in; ask again in a few seconds.');
  const facts: AssistantFact[] = [
    { label: 'Sent', value: fmtInt(s.sent) },
    { label: 'Opened', value: `${pct(s.opened, s.sent)}%` },
    offer ? { label: 'Enrolled', value: fmtInt(s.acted), tone: 'good' } : { label: 'Paused', value: fmtInt(s.paused), tone: 'good' },
  ];
  if (!offer) facts.push({ label: 'Peak cut', value: `${s.peakReducedMw} MW` });
  if (c.winner) facts.push({ label: 'Leading', value: `Variant ${c.winner}`, tone: 'good' });
  return answer(
    'CAMPAIGN_PERFORMANCE',
    {
      text,
      facts,
      chart: {
        kind: 'bar',
        unit: 'customers',
        points: [
          { label: 'Sent', value: s.sent },
          { label: 'Delivered', value: s.delivered },
          { label: 'Opened', value: s.opened },
          offer ? { label: 'Enrolled', value: s.acted, highlight: true } : { label: 'Paused', value: s.paused, highlight: true },
        ],
      },
      followUps: offer ? ['How are enrollments trending?', 'Where are our biggest blind spots?', 'How did our DR events perform?'] : ['How did our DR events perform?', 'How much flexible load do we have?', 'How are enrollments trending?'],
      actions,
      context: { campaignId: c.id },
    },
    q.now,
  );
}

// ---------------------------------------------------------------- DR_PERFORMANCE

export function drPerformance(q: StaffQuestion, f: StaffFacts): AssistantAnswer {
  const dr = f.reports?.drProgram ?? { eventsEnded: 0, householdsPaused: 0, kwhShifted: 0, peakReducedMw: 0 };
  const latest = (f.drEvents ?? [])[0] ?? null;
  const latestText = latest
    ? `The latest event, “${latest.title}”, is ${latest.status.toLowerCase()} on ${latest.feederCode}${latest.feederCodes && latest.feederCodes.length > 1 ? ` (+${latest.feederCodes.length - 1} feeders)` : ''} for ${fmtWindow(latest.windowStart, latest.windowEnd)}.`
    : null;
  const actions = [route('Open DR events', '/events'), route('Open reports', '/reports')];
  if (dr.eventsEnded === 0) {
    return answer(
      'DR_PERFORMANCE',
      {
        text: ['No DR events have finished yet, so there are no results to report.', ...(latestText ? [latestText] : ['Send a stop-charging request from Campaign 360 to schedule one.'])],
        facts: latest ? [{ label: 'Latest event', value: latest.status.toLowerCase() }] : [],
        followUps: ['Which feeders are at risk tonight?', 'How much flexible load do we have?'],
        actions,
      },
      q.now,
    );
  }
  return answer(
    'DR_PERFORMANCE',
    {
      text: [
        `**${dr.eventsEnded}** DR event${dr.eventsEnded === 1 ? ' has' : 's have'} ended. **${fmtInt(dr.householdsPaused)}** households paused charging, shifting **${fmtInt(Math.round(dr.kwhShifted))} kWh** and cutting the peak by **${dr.peakReducedMw} MW**.`,
        ...(latestText ? [latestText] : []),
      ],
      facts: [
        { label: 'Events ended', value: fmtInt(dr.eventsEnded) },
        { label: 'Households paused', value: fmtInt(dr.householdsPaused), tone: 'good' },
        { label: 'kWh shifted', value: fmtInt(Math.round(dr.kwhShifted)) },
        { label: 'Peak cut', value: `${dr.peakReducedMw} MW`, tone: 'good' },
      ],
      followUps: ['How much flexible load do we have?', 'How did the last campaign perform?', 'Which feeders are at risk tonight?'],
      actions,
    },
    q.now,
  );
}

// ---------------------------------------------------------------- ENROLLMENT_TREND

export function enrollmentTrend(q: StaffQuestion, f: StaffFacts): AssistantAnswer {
  const e = f.reports?.enrollments;
  if (!e) return fallback(q);
  const days = e.last30Days;
  const sum = (xs: { count: number }[]) => xs.reduce((a, x) => a + x.count, 0);
  const last7 = sum(days.slice(-7));
  const last30 = sum(days);
  const prev7 = sum(days.slice(-14, -7));
  const trend = last7 > prev7 ? `up from ${prev7} the week before` : last7 < prev7 ? `down from ${prev7} the week before` : 'level with the week before';
  const shownDays = q.entities.range === 'week' || q.entities.range === 'today' ? days.slice(-7) : days;
  return answer(
    'ENROLLMENT_TREND',
    {
      text: [
        `**${fmtInt(e.active)}** customers are enrolled. **${fmtInt(last30)}** joined in the last 30 days and **${fmtInt(last7)}** in the last 7, ${trend}.`,
        `Today so far: **${fmtInt(e.today)}**. By source: ${fmtInt(e.bySource.APP_POPUP)} from the in-app EV pop-up, ${fmtInt(e.bySource.CAMPAIGN)} from campaigns and ${fmtInt(e.bySource.LEGACY)} legacy sign-ups.`,
      ],
      facts: [
        { label: 'Enrolled', value: fmtInt(e.active) },
        { label: 'Last 30 days', value: fmtInt(last30), tone: 'good' },
        { label: 'Last 7 days', value: fmtInt(last7) },
        { label: 'Today', value: fmtInt(e.today) },
      ],
      chart: { kind: 'line', unit: 'enrollments/day', points: shownDays.map((d, i) => ({ label: dayLabel(d.date), value: d.count, highlight: i === shownDays.length - 1 })) },
      followUps: ['Where are our biggest blind spots?', 'How did the last campaign perform?', 'Give me the network overview'],
      actions: [route('Open reports', '/reports')],
    },
    q.now,
  );
}

// ---------------------------------------------------------------- GRID_RISK

export function gridRisk(q: StaffQuestion, f: StaffFacts): AssistantAnswer {
  const feeders = [...(f.riskFeeders ?? [])].sort((a, b) => b.forecastLoadPct - a.forecastLoadPct);
  const atRisk = feeders.filter((x) => x.forecastLoadPct >= RISK_PCT);
  const window = f.nextWindow ? fmtWindow(f.nextWindow.start, f.nextWindow.end) : 'the evening peak';
  if (!atRisk.length) {
    return answer(
      'GRID_RISK',
      {
        text: [
          `No feeder is forecast above ${RISK_PCT}% of capacity right now. The next peak window is **${window}**.`,
          feeders.length ? `Highest forecast: ${feeders[0].code} at ${feeders[0].forecastLoadPct}%.` : 'Use the demo control panel to simulate a high forecast on SUB-01-F1.',
        ],
        facts: [{ label: 'Feeders at risk', value: '0', tone: 'good' }, { label: 'Next peak', value: window }],
        followUps: ['How much flexible load do we have?', 'How did our DR events perform?'],
        actions: [route('Open DR events', '/events')],
      },
      q.now,
    );
  }
  const top = atRisk[0];
  const mw = top.known !== null ? Math.round(((top.known * EV_KW) / 1000) * 100) / 100 : null;
  const text = [
    `**${top.code}** is forecast at **${top.forecastLoadPct}%** of capacity for **${window}**.`,
    top.known !== null ? `It has **${fmtInt(top.known)}** enrolled EVs that could pause charging, about **${mw} MW** of relief.` : 'Per-customer data is not available for this feeder.',
  ];
  if (atRisk.length > 1) text.push(`Also at risk: ${listText(atRisk.slice(1).map((x) => `${x.code} (${x.forecastLoadPct}%)`))}.`);
  const actions: AssistantAnswer['actions'] = [];
  if (top.known !== null) actions.push({ kind: 'campaignDraft', label: 'Draft stop-charging request', draft: buildDraft('STOP_CHARGING', { feederCodes: [top.code], knownOnFeeder: top.known, unenrolled: 0 }) });
  actions.push(route('Open DR events', '/events'));
  return answer(
    'GRID_RISK',
    {
      text,
      facts: [
        { label: 'At risk', value: fmtInt(atRisk.length), tone: 'bad' },
        { label: `${top.code} forecast`, value: `${top.forecastLoadPct}%`, tone: 'bad' },
        ...(top.known !== null ? [{ label: 'Enrolled EVs', value: fmtInt(top.known) }, { label: 'Relief', value: `${mw} MW`, tone: 'good' as const }] : []),
      ],
      chart: { kind: 'bar', unit: '% of capacity', points: feeders.slice(0, 6).map((x) => ({ label: x.code, value: x.forecastLoadPct, highlight: x.forecastLoadPct >= RISK_PCT })) },
      followUps: [draftFollowUp(top.code, 'STOP_CHARGING'), `How is ${top.code} doing?`, 'How much flexible load do we have?'],
      actions,
      context: { feederCode: top.code },
    },
    q.now,
  );
}

// ---------------------------------------------------------------- DRAFT_CAMPAIGN

export function draftCampaign(q: StaffQuestion, f: StaffFacts): AssistantAnswer {
  const targets = f.draftTargets ?? [];
  const type: CampaignType = q.entities.campaignType ?? 'ENROLL_OFFER';
  if (!targets.length) {
    const top = (f.blindSpots ?? [])[0]?.feederCode ?? 'SUB-01-F1';
    return answer('DRAFT_CAMPAIGN', { text: ['Which feeder should I write for? Name one, like SUB-26-F1, or ask for the top blind spots.'], followUps: [draftFollowUp(top, type), 'Where are our biggest blind spots?'] }, q.now);
  }
  const codes = targets.map((t) => t.code);
  const known = targets.reduce((a, t) => a + t.known, 0);
  const unenrolled = targets.reduce((a, t) => a + t.unenrolled, 0);
  const draft = buildDraft(type, { feederCodes: codes, knownOnFeeder: targets[0].known, unenrolled });
  const offer = type === 'ENROLL_OFFER';
  const audience = offer ? unenrolled : known;
  const where = codes.length > 1 ? `${codes.length} feeders (${listText(codes)})` : `**${codes[0]}**`;
  return answer(
    'DRAFT_CAMPAIGN',
    {
      text: [
        `Here are two ${offer ? 'enrollment offer' : 'stop-charging request'} drafts for ${where}, reaching **${fmtInt(audience)}** ${offer ? 'EV owners who are detected but not enrolled' : 'enrolled EV owners'}.`,
        `Variant A leans on social proof (${fmtInt(targets[0].known)} neighbours already enrolled), variant B on the reward${offer ? '' : ' and the event window'}. Merge fields like {first_name} are filled in per customer by Campaign 360.`,
      ],
      facts: [
        { label: 'Audience', value: fmtInt(audience) },
        { label: codes.length > 1 ? 'Feeders' : 'Feeder', value: codes.length > 1 ? String(codes.length) : codes[0] },
        { label: 'Neighbours enrolled', value: fmtInt(known) },
      ],
      followUps: [
        offer ? draftFollowUp(codes[0], 'STOP_CHARGING') : draftFollowUp(codes[0], 'ENROLL_OFFER'),
        `How is ${codes[0]} doing?`,
        'How did the last campaign perform?',
      ],
      actions: [{ kind: 'campaignDraft', label: 'Open in Campaign 360', draft }],
      context: { feederCode: codes[0] },
    },
    q.now,
  );
}

// ---------------------------------------------------------------- FLEX_LOAD

export function flexLoad(q: StaffQuestion, f: StaffFacts): AssistantAnswer {
  const r = f.reports;
  if (!r) return fallback(q);
  // Headline known EVs (pilot baseline + live feeders) when available; live enrollments otherwise.
  const enrolled = f.overview?.knownEvs ?? r.enrollments.active;
  const drMw = Math.round(((enrolled * EV_KW) / 1000) * 10) / 10;
  const sc = r.smartCharging ?? { homes: 0, flexibleKw: 0, shiftedKwhPerNight: 0, peakAvoidedMw: 0 };
  const scMw = Math.round((sc.flexibleKw / 1000) * 10) / 10;
  const untapped = f.overview?.unenrolledEvs ?? 0;
  const untappedMw = Math.round(((untapped * EV_KW) / 1000) * 10) / 10;
  const text = [`**${fmtInt(enrolled)}** enrolled EVs can be asked to pause, about **${drMw} MW** if they are all charging at ${EV_KW} kW.`];
  text.push(
    sc.homes > 0
      ? `Smart charging is on in **${fmtInt(sc.homes)}** homes: **${fmtInt(Math.round(sc.flexibleKw))} kW** of flexible load, moving ${fmtInt(Math.round(sc.shiftedKwhPerNight))} kWh out of the peak each night (about ${sc.peakAvoidedMw} MW avoided).`
      : 'Smart charging is not switched on in any homes yet, so there is no scheduled flexibility on top of DR.',
  );
  if (untapped) text.push(`Another **${fmtInt(untapped)}** EVs are detected but not enrolled: roughly ${untappedMw} MW still untapped.`);
  return answer(
    'FLEX_LOAD',
    {
      text,
      facts: [
        { label: 'DR-ready EVs', value: fmtInt(enrolled) },
        { label: 'Pausable', value: `${drMw} MW`, tone: 'good' },
        { label: 'Smart charging homes', value: fmtInt(sc.homes) },
        ...(untapped ? [{ label: 'Untapped', value: `${untappedMw} MW`, tone: 'warn' as const }] : []),
      ],
      chart: {
        kind: 'bar',
        unit: 'MW',
        points: [
          { label: 'DR pause', value: drMw, highlight: true },
          { label: 'Smart charging', value: scMw },
          ...(untapped ? [{ label: 'Untapped', value: untappedMw }] : []),
        ],
      },
      followUps: ['Which feeders are at risk tonight?', 'Where are our biggest blind spots?', 'How did our DR events perform?'],
      actions: [route('Open reports', '/reports')],
    },
    q.now,
  );
}

// ---------------------------------------------------------------- FALLBACK

export function fallback(q: StaffQuestion): AssistantAnswer {
  return answer(
    'FALLBACK',
    {
      matched: false,
      text: [SCRIPTED_FALLBACK, 'I can tell you about feeders, blind spots, campaigns, DR events, enrollments, grid risk and flexible load. Try one of these:'],
      followUps: [STAFF_SUGGESTIONS[1], STAFF_SUGGESTIONS[0], STAFF_SUGGESTIONS[3], STAFF_SUGGESTIONS[6]],
      context: { feederCode: q.context.feederCode, campaignId: q.context.campaignId },
    },
    q.now,
  );
}

export const STAFF_ANSWERS: Record<StaffIntent | 'FALLBACK', (q: StaffQuestion, f: StaffFacts) => AssistantAnswer> = {
  FEEDER_STATUS: feederStatus,
  BLIND_SPOTS: blindSpots,
  OVERVIEW: overview,
  CAMPAIGN_PERFORMANCE: campaignPerformance,
  DR_PERFORMANCE: drPerformance,
  ENROLLMENT_TREND: enrollmentTrend,
  GRID_RISK: gridRisk,
  DRAFT_CAMPAIGN: draftCampaign,
  FLEX_LOAD: flexLoad,
  FALLBACK: (q) => fallback(q),
};

export function answerStaff(q: StaffQuestion, f: StaffFacts): AssistantAnswer {
  return STAFF_ANSWERS[q.intent](q, f);
}

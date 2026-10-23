import type { BlindSpot, Campaign, DrEvent, DrEventStatus, EnrollmentSource, FeederStat, SubstationStat } from '@demo/shared';

/**
 * Pure aggregations behind the Reports page. Everything here is derived from the
 * staff endpoints (campaigns, DR events, feeders, substations, blind spots); no fetching,
 * no DOM, so it is unit-tested in reports.spec.ts.
 */

// ---------------------------------------------------------------- campaign funnel

export type FunnelStageName = 'Sent' | 'Delivered' | 'Opened' | 'Enrolled' | 'Declined';

export interface FunnelStage {
  stage: FunnelStageName;
  count: number;
  /** Share of "Sent", 0–100 (0 when nothing was sent). */
  pct: number;
}

export interface CampaignFunnel {
  /** "Latest offer · <audience>" or "All offers (n campaigns)". */
  label: string;
  campaigns: number;
  stages: FunnelStage[];
}

export type FunnelMode = 'latest' | 'all';

function pctOf(n: number, base: number): number {
  return base > 0 ? Math.round((n / base) * 1000) / 10 : 0;
}

function funnelStages(list: Campaign[]): FunnelStage[] {
  const sum = (k: keyof Campaign['stats']) => list.reduce((a, c) => a + c.stats[k], 0);
  const sent = sum('sent');
  const rows: [FunnelStageName, number][] = [
    ['Sent', sent],
    ['Delivered', sum('delivered')],
    ['Opened', sum('opened')],
    ['Enrolled', sum('acted')],
    ['Declined', sum('declined')],
  ];
  return rows.map(([stage, count]) => ({ stage, count, pct: pctOf(count, sent) }));
}

/** Only campaigns that actually went out count (not SCHEDULED, SENDING or CANCELLED). */
const isSent = (c: Campaign) => c.status === 'SENT';

/** Sent offer campaigns (ENROLL_OFFER), test sends excluded unless nothing else exists; newest first. */
export function offerCampaigns(campaigns: Campaign[]): Campaign[] {
  const offers = campaigns.filter((c) => c.type === 'ENROLL_OFFER' && isSent(c));
  const real = offers.filter((c) => !c.isTest);
  return [...(real.length > 0 ? real : offers)].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/** sent → delivered → opened → enrolled (+ declined) for the latest offer or all offers together. */
export function campaignFunnel(campaigns: Campaign[], mode: FunnelMode): CampaignFunnel | null {
  const offers = offerCampaigns(campaigns);
  if (offers.length === 0) return null;
  if (mode === 'latest') {
    const c = offers[0];
    return { label: `Latest offer · ${c.audienceLabel}${c.isTest ? ' (test)' : ''}`, campaigns: 1, stages: funnelStages([c]) };
  }
  return { label: `All offers (${offers.length} campaign${offers.length === 1 ? '' : 's'})`, campaigns: offers.length, stages: funnelStages(offers) };
}

// ---------------------------------------------------------------- DR performance

export interface DrPerformanceRow {
  campaignId: string;
  drEventId: string | null;
  feederCode: string;
  audienceLabel: string;
  sentAt: string;
  isTest: boolean;
  targeted: number;
  responded: number;
  paused: number;
  /** Responded but neither paused nor opted out ("remind me later"). Never negative. */
  reminders: number;
  optedOut: number;
  peakReducedMw: number;
  /** Status of the linked DR event, or null when the event is not in the list. */
  status: DrEventStatus | null;
  windowStart: string | null;
  windowEnd: string | null;
}

/** One row per sent STOP_CHARGING campaign, newest first, with the linked DR event's status. */
export function drPerformance(campaigns: Campaign[], drEvents: DrEvent[]): DrPerformanceRow[] {
  const byId = new Map(drEvents.map((e) => [e.id, e]));
  return campaigns
    .filter((c) => c.type === 'STOP_CHARGING' && isSent(c))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .map((c) => {
      const ev = c.drEventId ? byId.get(c.drEventId) : undefined;
      const s = c.stats;
      return {
        campaignId: c.id,
        drEventId: c.drEventId,
        feederCode:
          ev?.feederCode ??
          (c.audience.kind === 'FEEDER' ? c.audience.feederCode : c.audience.kind === 'FEEDERS' ? (c.audience.feederCodes[0] ?? '—') : '—'),
        audienceLabel: c.audienceLabel,
        sentAt: c.sentAt,
        isTest: c.isTest,
        targeted: s.targeted,
        responded: s.acted,
        paused: s.paused,
        reminders: Math.max(0, s.acted - s.paused - s.optedOut),
        optedOut: s.optedOut,
        peakReducedMw: s.peakReducedMw,
        status: ev?.status ?? null,
        windowStart: ev?.windowStart ?? null,
        windowEnd: ev?.windowEnd ?? null,
      };
    });
}

// ---------------------------------------------------------------- enrollment by feeder

export interface FeederEnrollmentRow {
  code: string;
  /** Code without the substation prefix, e.g. "F1". */
  short: string;
  known: number;
  unenrolled: number;
  evs: number;
  knownPct: number;
}

export function shortFeederCode(code: string, substationCode: string): string {
  return code.startsWith(`${substationCode}-`) ? code.slice(substationCode.length + 1) : code;
}

/** Feeders with a known / unenrolled split, in feeder order (F1, F2, …). Feeders without a split are left out. */
export function enrollmentByFeeder(feeders: FeederStat[]): FeederEnrollmentRow[] {
  return feeders
    .filter((f) => f.known !== null && f.unenrolled !== null)
    .map((f) => {
      const known = f.known ?? 0;
      const unenrolled = f.unenrolled ?? 0;
      return {
        code: f.code,
        short: shortFeederCode(f.code, f.substationCode),
        known,
        unenrolled,
        evs: known + unenrolled,
        knownPct: pctOf(known, known + unenrolled),
      };
    });
}

// ---------------------------------------------------------------- enrollment source

export const ENROLLMENT_SOURCE_LABEL: Record<EnrollmentSource, string> = {
  APP_POPUP: 'In-app EV pop-up',
  CAMPAIGN: 'Campaign offer',
  LEGACY: 'Before the pilot',
};

export interface SourceRow {
  source: EnrollmentSource;
  label: string;
  count: number;
  pct: number;
}

export function enrollmentSources(bySource: Partial<Record<EnrollmentSource, number>>): SourceRow[] {
  const order: EnrollmentSource[] = ['APP_POPUP', 'CAMPAIGN', 'LEGACY'];
  const total = order.reduce((a, k) => a + (bySource[k] ?? 0), 0);
  return order.map((source) => {
    const count = bySource[source] ?? 0;
    return { source, label: ENROLLMENT_SOURCE_LABEL[source], count, pct: pctOf(count, total) };
  });
}

// ---------------------------------------------------------------- substations

export interface SubstationKnownRow {
  code: string;
  region: string;
  evs: number;
  knownPct: number;
}

/** The `n` substations with the most EVs, ordered by known share (highest first). */
export function substationKnownTop(subs: SubstationStat[], n = 8): SubstationKnownRow[] {
  return [...subs]
    .sort((a, b) => b.evs - a.evs)
    .slice(0, n)
    .sort((a, b) => b.knownPct - a.knownPct || b.evs - a.evs)
    .map((s) => ({ code: s.code, region: s.region, evs: s.evs, knownPct: s.knownPct }));
}

// ---------------------------------------------------------------- blind spots

export interface BlindSpotBar {
  rank: number;
  feederCode: string;
  region: string | null;
  known: number;
  unenrolled: number;
  gapPct: number;
}

/** The worst `n` blind spots by gap (the API already ranks them; this re-sorts defensively). */
export function blindSpotBars(blind: BlindSpot[], n = 8): BlindSpotBar[] {
  return [...blind]
    .sort((a, b) => b.gapPct - a.gapPct || a.rank - b.rank)
    .slice(0, n)
    .map((b, i) => ({ rank: i + 1, feederCode: b.feederCode, region: b.region ?? null, known: b.known, unenrolled: b.unenrolled, gapPct: b.gapPct }));
}

// ---------------------------------------------------------------- CSV

export type CsvCell = string | number | boolean | null | undefined;

function csvEscape(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180-style CSV with CRLF line ends; quotes only cells that need it. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

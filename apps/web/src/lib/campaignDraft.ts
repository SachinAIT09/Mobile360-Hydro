import { DEMO_TZ, type CampaignSegment, type CampaignType } from '@demo/shared';

/** Copy fields a draft link can carry (all optional; missing ones fall back to the type defaults). */
export interface DraftCopy {
  title?: string;
  body?: string;
  cta?: string;
}

/** What /campaigns/new?… asks the form to prefill. */
export interface CampaignDraftParams {
  type: CampaignType | null;
  segment: CampaignSegment | null;
  /** Single-feeder prefill (`feeder=`). */
  feeder: string | null;
  /** Multi-feeder prefill (`feeders=` comma list), distinct and valid codes only, at most 10. */
  feeders: string[];
  liveEventId: string | null;
  /** Variant A copy (title/body/cta). */
  copyA: DraftCopy;
  /** Variant B copy; non-null when any of titleB/bodyB/ctaB is present (turns the A/B test on). */
  copyB: DraftCopy | null;
  /** `src=assistant`: the copy was drafted by the scripted assistant. */
  fromAssistant: boolean;
}

export const MAX_FEEDERS = 10;
const FEEDER_RE = /^SUB-\d+-F\d+$/;

const clean = (v: string | null, max: number): string | undefined => {
  const s = v?.trim();
  return s ? s.slice(0, max) : undefined;
};

/** Reads exactly: type, segment, feeder, feeders, liveEventId, title, body, cta, titleB, bodyB, ctaB, src. */
export function parseDraftParams(params: URLSearchParams): CampaignDraftParams {
  const type = params.get('type');
  const segment = params.get('segment');
  const feeder = params.get('feeder')?.trim() || null;
  const feeders = [
    ...new Set(
      (params.get('feeders') ?? '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => FEEDER_RE.test(s)),
    ),
  ].slice(0, MAX_FEEDERS);
  const copy = (suffix: '' | 'B'): DraftCopy => {
    const out: DraftCopy = {};
    const title = clean(params.get(`title${suffix}`), 140);
    const body = clean(params.get(`body${suffix}`), 1000);
    const cta = clean(params.get(`cta${suffix}`), 40);
    if (title) out.title = title;
    if (body) out.body = body;
    if (cta) out.cta = cta;
    return out;
  };
  const b = copy('B');
  return {
    type: type === 'ENROLL_OFFER' || type === 'STOP_CHARGING' ? type : null,
    segment: segment === 'UNENROLLED_EV' || segment === 'ENROLLED_EV' ? segment : null,
    feeder,
    feeders,
    liveEventId: params.get('liveEventId')?.trim() || null,
    copyA: copy(''),
    copyB: Object.keys(b).length > 0 ? b : null,
    fromAssistant: params.get('src') === 'assistant',
  };
}

// ---------------------------------------------------------------- scheduling (mirrors apps/api campaigns/schedule.ts)

export const MIN_LEAD_MS = 60_000;
export const MAX_LEAD_MS = 24 * 3600_000;

export interface QuickTime {
  label: string;
  at: Date;
}

function localParts(d: Date, tz: string) {
  const out: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
}

/** Wall-clock time in `tz` → UTC Date. */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, tz = DEMO_TZ): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = (ms: number) => {
    const p = localParts(new Date(ms), tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };
  const o1 = offset(guess);
  let utc = guess - o1;
  const o2 = offset(utc);
  if (o2 !== o1) utc = guess - o2;
  return new Date(utc);
}

/** Presets: in 2 minutes, in 1 hour, 17:00 today (or tomorrow once that is less than a minute away). */
export function quickTimes(now = new Date(), tz = DEMO_TZ): QuickTime[] {
  const p = localParts(now, tz);
  let five = zonedTime(p.year, p.month, p.day, 17, 0, tz);
  let label = 'Today 17:00';
  if (five.getTime() - now.getTime() < MIN_LEAD_MS) {
    const t = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    five = zonedTime(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), 17, 0, tz);
    label = 'Tomorrow 17:00';
  }
  return [
    { label: 'In 2 minutes', at: new Date(now.getTime() + 2 * 60_000) },
    { label: 'In 1 hour', at: new Date(now.getTime() + 3600_000) },
    { label, at: five },
  ];
}

/** Client-side check matching the API: between now + 1 minute and now + 24 hours. Returns an error message or null. */
export function sendAtError(at: Date | null, now = new Date()): string | null {
  if (!at || Number.isNaN(at.getTime())) return 'Pick a send time.';
  const lead = at.getTime() - now.getTime();
  if (lead < MIN_LEAD_MS) return 'Pick a time at least 1 minute from now.';
  if (lead > MAX_LEAD_MS) return 'Pick a time within the next 24 hours.';
  return null;
}

/** `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm") for a Date, in the demo timezone. */
export function toLocalInput(d: Date, tz = DEMO_TZ): string {
  const p = localParts(d, tz);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

/** Parses a datetime-local value as a time in the demo timezone. */
export function fromLocalInput(v: string, tz = DEMO_TZ): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  return zonedTime(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), tz);
}

/** "5:00 PM" today, or "Tomorrow 5:00 PM" / "Oct 24, 5:00 PM", in the demo timezone. */
export function fmtSendAt(at: Date, now = new Date(), tz = DEMO_TZ): string {
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: tz });
  if (day(at) === day(now)) return time;
  if (day(at) === day(new Date(now.getTime() + 86400000))) return `tomorrow ${time}`;
  return `${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz })}, ${time}`;
}

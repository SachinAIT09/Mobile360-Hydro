import { ASSISTANT, DEMO_TZ, type AssistantAction, type AssistantAnswer, type AssistantChart, type AssistantContext, type AssistantFact } from '@demo/shared';

/** Everything an answer function returns; `answer()` adds the envelope (intent, context, timestamps, disclosure). */
export interface AnswerBody {
  text: string[];
  facts?: AssistantFact[];
  chart?: AssistantChart | null;
  followUps?: string[];
  actions?: AssistantAction[];
  /** Context fields to carry into the next turn (merged over lastIntent). */
  context?: Omit<AssistantContext, 'lastIntent'>;
  /** False only for FALLBACK. */
  matched?: boolean;
}

export function answer(intent: string, body: AnswerBody, now: Date): AssistantAnswer {
  const context: AssistantContext = { lastIntent: intent };
  for (const [k, v] of Object.entries(body.context ?? {})) if (v) (context as Record<string, string>)[k] = v;
  return {
    intent,
    matched: body.matched ?? intent !== 'FALLBACK',
    text: body.text,
    facts: body.facts ?? [],
    chart: body.chart ?? null,
    followUps: dedupe(body.followUps ?? []).slice(0, 4),
    actions: body.actions ?? [],
    context,
    generatedAt: now.toISOString(),
    disclosure: ASSISTANT.disclosure,
  };
}

const dedupe = (xs: string[]) => [...new Set(xs)];

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export const route = (label: string, to: string): AssistantAction => ({ kind: 'route', label, route: to });

const MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: DEMO_TZ });
const MONTH_IDX_FMT = new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: DEMO_TZ });
const PARTS_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', hourCycle: 'h23', timeZone: DEMO_TZ });

/** "October" for an ISO date in the demo timezone. */
export const monthName = (iso: string) => MONTH_FMT.format(new Date(iso));
/** 0-based month index of an ISO date in the demo timezone. */
export const monthIndex = (iso: string) => Number(MONTH_IDX_FMT.format(new Date(iso))) - 1;

/** Local hour (0–23) and weekend flag of `d` in the demo timezone. */
export function localClock(d: Date): { hour: number; weekend: boolean } {
  const parts = PARTS_FMT.formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  return { hour, weekend: wd === 'Sat' || wd === 'Sun' };
}

/** "7 AM", "12 PM", "12 AM" for an hour 0–24. */
export function hourLabel(h: number): string {
  const x = ((h % 24) + 24) % 24;
  const suffix = x < 12 ? 'AM' : 'PM';
  const n = x % 12 === 0 ? 12 : x % 12;
  return `${n} ${suffix}`;
}

/** Short month + day from a "YYYY-MM-DD" key ("Oct 3"), no timezone maths. */
export function dayLabel(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`;
}

/** "SUB-26-F1", "SUB-26-F1 and SUB-15-F3", "SUB-26-F1, SUB-15-F3 and SUB-11-F2". */
export function listText(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

export const SCRIPTED_FALLBACK =
  "I'm a scripted demo assistant, so I can only answer a fixed set of questions from the live demo data, not open-ended ones like that.";

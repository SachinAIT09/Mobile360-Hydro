import type { AssistantContext, CampaignType } from '@demo/shared';

/**
 * Scripted assistant "NLU": deterministic text normalisation, entity extraction and weighted keyword
 * intent matching. No model, no network; every decision here is unit-tested in nlu.spec.ts.
 */

export const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'] as const;
const MONTH_ABBR = MONTHS.map((m) => m.slice(0, 3));

export type Range = 'today' | 'week' | 'month' | 'year';

export interface Entities {
  /** Feeder codes in the order they appear, uppercased and de-duplicated. */
  feederCodes: string[];
  /** Substation code mentioned on its own (or the substation of the first feeder). */
  substationCode: string | null;
  /** 0-based month index ("september" → 8). "last month" is resolved by the caller (see `lastMonth`). */
  month: number | null;
  lastMonth: boolean;
  range: Range | null;
  campaignType: CampaignType | null;
  /** "top 3" / "3 feeders": how many items the user asked for. */
  count: number | null;
}

/** Common misspellings and shorthand seen in demo rehearsals, applied word by word after lowercasing. */
const TYPOS: Record<string, string> = {
  bil: 'bill', bills: 'bill', hi: 'high', higer: 'higher', hihg: 'high', chargin: 'charging', chrage: 'charge', chraging: 'charging',
  feedr: 'feeder', fedder: 'feeder', whats: 'what is', wats: 'what is', whys: 'why is', hows: 'how is',
  im: 'i am', u: 'you', ur: 'your', thx: 'thanks', pls: 'please', plz: 'please', enrolment: 'enrollment', enrolments: 'enrollments',
  enrol: 'enroll', camapign: 'campaign', campagin: 'campaign', compain: 'campaign', outtage: 'outage',
  outages: 'outage', usag: 'usage', elec: 'electricity', tonite: 'tonight', '2nite': 'tonight', '2day': 'today', cuz: 'because',
  wy: 'why', soo: 'so', alot: 'a lot', solor: 'solar', sollar: 'solar', perfom: 'perform', preformed: 'performed',
};

/**
 * Lowercase, keep feeder/substation codes intact, turn punctuation into spaces, fix common typos,
 * collapse whitespace. "Why's my BIL so hi??" → "why is my bill so high".
 */
export function normalise(q: string): string {
  const lowered = q
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/(\w)'s\b/g, '$1s')
    .replace(/'/g, '')
    .replace(/[^a-z0-9\-$%/ ]+/g, ' ')
    // dashes only matter inside codes like sub-26-f1 and words like time-of-use; elsewhere they are spaces
    .replace(/(^|\s)-+|-+(\s|$)/g, ' ');
  return lowered
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => TYPOS[w] ?? w)
    .join(' ');
}

const FEEDER_RE = /\bSUB-?\s?(\d{1,3})-?\s?F(\d{1,2})\b/gi;
const SUBSTATION_RE = /\bSUB-?\s?(\d{1,3})\b(?!-?\s?F\d)/i;

const pad2 = (n: string) => n.padStart(2, '0');

export function extractEntities(raw: string): Entities {
  const feederCodes: string[] = [];
  for (const m of raw.matchAll(FEEDER_RE)) {
    const code = `SUB-${pad2(m[1])}-F${m[2]}`;
    if (!feederCodes.includes(code)) feederCodes.push(code);
  }
  const subMatch = raw.replace(FEEDER_RE, ' ').match(SUBSTATION_RE);
  const substationCode = subMatch ? `SUB-${pad2(subMatch[1])}` : feederCodes[0]?.split('-F')[0] ?? null;

  const n = normalise(raw);
  const words = n.split(' ');
  const lastMonth = /\b(last|previous|past) month\b/.test(n);
  let month: number | null = null;
  for (const w of words) {
    const i = MONTHS.indexOf(w as (typeof MONTHS)[number]);
    const j = MONTH_ABBR.indexOf(w);
    // "may" is also a verb: only treat it as a month when followed by bill/usage or preceded by "in"
    if (i === 4 || j === 4) {
      if (!/\b(in|for|of) may\b|\bmay (bill|usage|statement)\b/.test(n)) continue;
    }
    if (i >= 0) { month = i; break; }
    if (j >= 0 && w !== 'mar' && w !== 'jun') { month = j; break; }
  }

  let range: Range | null = null;
  if (/\b(today|so far|right now|this morning|this afternoon|tonight)\b/.test(n)) range = 'today';
  else if (/\b(this|past|last) week\b|\bweekly\b|\b7 days\b/.test(n)) range = 'week';
  else if (/\b(this|past) month\b|\bmonthly\b|\b30 days\b/.test(n)) range = 'month';
  else if (/\b(this|past) year\b|\byearly\b|\bannual/.test(n)) range = 'year';

  let campaignType: CampaignType | null = null;
  if (/\b(stop|pause|pausing|stopping|curtail|dr request|dr event|demand response|stop charging)\b/.test(n)) campaignType = 'STOP_CHARGING';
  else if (/\b(offer|enroll|enrollment|sign up|signup|join|recruit|onboard)/.test(n)) campaignType = 'ENROLL_OFFER';

  const countMatch = n.match(/\b(?:top|best|worst|first)\s+(\d{1,2})\b|\b(\d{1,2})\s+(?:feeders|blind spots)\b/);
  const count = countMatch ? Number(countMatch[1] ?? countMatch[2]) : null;

  return { feederCodes, substationCode, month, lastMonth, range, campaignType, count };
}

// ---------------------------------------------------------------- intent matching

export interface KeywordGroup {
  /** Single words match whole words, or word prefixes when at least 4 letters ("enrol" ⊂ "enrollments"). Phrases match as substrings on word boundaries. */
  words: string[];
  weight: number;
}

export interface IntentDef<I extends string = string> {
  id: I;
  /** One phrasing shown as a suggestion chip; must round-trip to this intent (spec). */
  suggestion: string;
  groups: KeywordGroup[];
  /** Regexes tested on the normalised question. */
  patterns?: { re: RegExp; weight: number }[];
  /** Any of these present → the intent is skipped. */
  negative?: string[];
  /** Tie-breaker: higher wins on equal score. */
  priority: number;
  /** Bonus when the question carries a feeder code. */
  feederBoost?: number;
}

export interface IntentMatch<I extends string = string> {
  intent: I | 'FALLBACK';
  score: number;
  entities: Entities;
  /** True when the intent was inherited from the previous turn ("and SUB-02-F1?"). */
  followUp: boolean;
  /** Runner-up score, for debugging/specs. */
  scores: Record<string, number>;
}

export const MATCH_THRESHOLD = 2;

function hasWord(words: string[], text: string, w: string): boolean {
  if (w.includes(' ') || /[^a-z0-9]/.test(w)) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\s)${esc}(?=\\s|$)`).test(text) || (w.length >= 6 && text.includes(w));
  }
  if (w.length >= 4) return words.some((x) => x.startsWith(w));
  return words.includes(w);
}

function scoreIntent(def: IntentDef, text: string, words: string[], ent: Entities): number {
  if (def.negative?.some((w) => hasWord(words, text, w))) return 0;
  let s = 0;
  for (const g of def.groups) if (g.words.some((w) => hasWord(words, text, w))) s += g.weight;
  for (const p of def.patterns ?? []) if (p.re.test(text)) s += p.weight;
  if (def.feederBoost && ent.feederCodes.length) s += def.feederBoost;
  return s;
}

const FOLLOW_UP_CUE = /^(and|what about|how about|same for|same|now|also|ok|okay|then|what of)\b/;

/** Words that carry no intent once entities are removed ("and SUB-02-F1?" → nothing left). */
const FILLER = new Set(['and', 'what', 'about', 'how', 'same', 'for', 'now', 'also', 'ok', 'okay', 'then', 'of', 'the', 'is', 'in', 'on', 'one', 'please', 'it', 'that', 'this', 'feeder', 'sub']);

function isEntityOnly(text: string, ent: Entities): boolean {
  const rest = text
    .replace(/sub-?\s?\d{1,3}(-?\s?f\d{1,2})?/g, ' ')
    .split(' ')
    .filter((w) => w && !FILLER.has(w) && !MONTHS.includes(w as (typeof MONTHS)[number]));
  const hasEntity = ent.feederCodes.length > 0 || ent.substationCode !== null || ent.month !== null || ent.range !== null || ent.lastMonth;
  return hasEntity && rest.length <= 1;
}

/**
 * Pick the best intent. Below the threshold → FALLBACK, except a bare follow-up ("and SUB-02-F1?",
 * "what about September?") which inherits `ctx.lastIntent` when that intent is one of `defs`.
 */
export function matchIntent<I extends string>(question: string, defs: readonly IntentDef<I>[], ctx: AssistantContext = {}): IntentMatch<I> {
  const text = normalise(question);
  const words = text.split(' ').filter(Boolean);
  const entities = extractEntities(question);
  const scores: Record<string, number> = {};
  let best: IntentDef<I> | null = null;
  let bestScore = 0;
  for (const d of defs) {
    const s = scoreIntent(d, text, words, entities);
    scores[d.id] = s;
    if (s > bestScore || (s === bestScore && s > 0 && best && d.priority > best.priority)) {
      best = d;
      bestScore = s;
    }
  }

  const last = defs.find((d) => d.id === ctx.lastIntent);
  const cue = FOLLOW_UP_CUE.test(text);
  if (last && (isEntityOnly(text, entities) || (cue && words.length <= 5 && bestScore < MATCH_THRESHOLD + 1))) {
    const keywordOnly = best ? bestScore - (best.feederBoost && entities.feederCodes.length ? best.feederBoost : 0) : 0;
    if (!best || keywordOnly < MATCH_THRESHOLD || best.id === last.id) {
      return { intent: last.id, score: Math.max(bestScore, MATCH_THRESHOLD), entities, followUp: true, scores };
    }
  }

  if (!best || bestScore < MATCH_THRESHOLD) return { intent: 'FALLBACK', score: bestScore, entities, followUp: false, scores };
  return { intent: best.id, score: bestScore, entities, followUp: false, scores };
}

/**
 * Pure helpers for the assistant sheet's word-by-word reveal and **bold** answer text.
 * The screen drives `revealSteps` with a promise chain (see app/assistant.tsx).
 */

export interface Segment {
  t: string;
  b: boolean;
}

/** Split "a **b** c" into plain and bold runs. Unbalanced markers stay as plain text. */
export function richSegments(text: string): Segment[] {
  const parts = text.split('**');
  if (parts.length % 2 === 0) return [{ t: text, b: false }];
  return parts.map((t, i) => ({ t, b: i % 2 === 1 })).filter((s) => s.t !== '');
}

export function wordCount(paragraphs: string[]): number {
  return paragraphs.reduce((a, p) => a + p.replace(/\*\*/g, '').split(/\s+/).filter(Boolean).length, 0);
}

/** First `n` words of the paragraphs as rich segments; words glued across a bold boundary count once. */
export function revealParagraphs(paragraphs: string[], n: number): Segment[][] {
  const out: Segment[][] = [];
  let left = n;
  let stop = false;
  for (const p of paragraphs) {
    if (left <= 0) break;
    const segs: Segment[] = [];
    let boundary = true;
    for (const s of richSegments(p)) {
      let acc = '';
      for (const tok of s.t.split(/(\s+)/)) {
        if (!tok) continue;
        if (tok.trim() === '') {
          acc += tok;
          boundary = true;
          continue;
        }
        if (boundary) {
          if (left <= 0) {
            stop = true;
            break;
          }
          left--;
          boundary = false;
        }
        acc += tok;
      }
      if (stop) acc = acc.trimEnd();
      if (acc) segs.push({ t: acc, b: s.b });
      if (stop) break;
    }
    out.push(segs);
    if (stop) break;
  }
  return out;
}

export const REVEAL_MAX_MS = 1200;

/**
 * Reveal schedule for `total` words: word counts to show at each tick and the tick length, finishing
 * within REVEAL_MAX_MS. At most ~24 ticks, so long answers reveal a few words per tick.
 */
export function revealSteps(total: number, maxMs = REVEAL_MAX_MS): { counts: number[]; stepMs: number } {
  if (total <= 0) return { counts: [], stepMs: 0 };
  const ticks = Math.min(total, 24);
  const stepMs = Math.floor(Math.min(maxMs, total * 32) / ticks);
  const counts = Array.from({ length: ticks }, (_, i) => Math.ceil(((i + 1) / ticks) * total));
  return { counts, stepMs };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run the reveal as a promise chain; `onStep` gets each word count; stops early when `cancelled()` turns true. */
export async function runReveal(total: number, onStep: (count: number) => void, cancelled: () => boolean, maxMs = REVEAL_MAX_MS): Promise<void> {
  const { counts, stepMs } = revealSteps(total, maxMs);
  for (const c of counts) {
    await sleep(stepMs);
    if (cancelled()) return;
    onStep(c);
  }
}

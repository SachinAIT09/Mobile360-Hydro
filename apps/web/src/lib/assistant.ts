import { useCallback, useRef, useState } from 'react';
import type { AssistantAnswer, AssistantChart, AssistantContext, AssistantRequest } from '@demo/shared';

// ---------------------------------------------------------------- rich text (pure)

/** A run of answer text; `b` = bold (written as **…** by the API). */
export interface Segment {
  t: string;
  b: boolean;
}

/** Split "a **b** c" into [{a}, {b, bold}, {c}]. Unbalanced markers are kept as plain text. */
export function richSegments(text: string): Segment[] {
  const parts = text.split('**');
  if (parts.length % 2 === 0) return [{ t: text, b: false }];
  return parts.map((t, i) => ({ t, b: i % 2 === 1 })).filter((s) => s.t !== '');
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Total words across paragraphs (the typewriter's unit). */
export function wordCount(paragraphs: string[]): number {
  return paragraphs.reduce((a, p) => a + words(p.replace(/\*\*/g, '')), 0);
}

/**
 * The first `n` words of the paragraphs as rich segments, keeping bold runs intact.
 * Paragraphs with no words revealed yet are omitted.
 */
export function revealParagraphs(paragraphs: string[], n: number): Segment[][] {
  const out: Segment[][] = [];
  let left = n;
  let stop = false;
  for (const p of paragraphs) {
    if (left <= 0) break;
    const segs: Segment[] = [];
    // A word starts after whitespace; "kWh**.**" style punctuation glued across segments stays one word.
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

// ---------------------------------------------------------------- mini chart layout (pure)

export interface BarBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  value: number;
  highlight: boolean;
  /** Show the axis label under this bar (crowded charts label every nth bar). */
  showLabel: boolean;
}

export interface ChartLayout {
  width: number;
  height: number;
  /** Baseline y (bars grow up from here). */
  base: number;
  bars: BarBox[];
  /** SVG path for line charts ("" for bars). */
  path: string;
  max: number;
}

/** Plot geometry for the drawer's inline SVG chart. Values ≤ 0 draw as 0; max 0 → flat. */
export function chartLayout(chart: AssistantChart, width = 320, height = 140, labelBand = 22, topPad = 16): ChartLayout {
  const pts = chart.points;
  const max = Math.max(0, ...pts.map((p) => p.value));
  const base = height - labelBand;
  const plotH = base - topPad;
  const n = Math.max(pts.length, 1);
  const slot = width / n;
  const gap = Math.min(10, slot * 0.25);
  const every = Math.ceil(n / 8);
  const bars = pts.map((p, i) => {
    const h = max > 0 ? (Math.max(0, p.value) / max) * plotH : 0;
    return {
      x: i * slot + gap / 2,
      y: base - h,
      w: Math.max(1, slot - gap),
      h,
      label: p.label,
      value: p.value,
      highlight: !!p.highlight,
      showLabel: i % every === 0 || !!p.highlight,
    };
  });
  const path =
    chart.kind === 'line'
      ? bars.map((b, i) => `${i === 0 ? 'M' : 'L'}${(b.x + b.w / 2).toFixed(1)},${b.y.toFixed(1)}`).join(' ')
      : '';
  return { width, height, base, bars, path, max };
}

/** Compact value label: 1,142 / 88.2 / 0.86. */
export function fmtValue(v: number): string {
  if (Math.abs(v) >= 100) return Math.round(v).toLocaleString('en-CA');
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) >= 10 ? v.toFixed(1) : String(Math.round(v * 100) / 100);
}

/** Context sent with the next question: the last answer's context plus the current route (DTO-safe lengths). */
export function nextContext(last: AssistantContext, route?: string): AssistantContext {
  const ctx: AssistantContext = {};
  if (last.feederCode && /^SUB-\d+-F\d+$/i.test(last.feederCode)) ctx.feederCode = last.feederCode;
  if (last.campaignId && /^[a-f0-9]{24}$/i.test(last.campaignId)) ctx.campaignId = last.campaignId;
  if (last.lastIntent) ctx.lastIntent = last.lastIntent.slice(0, 40);
  if (route) ctx.route = route.slice(0, 120);
  return ctx;
}

// ---------------------------------------------------------------- chat state (hook)

export interface Turn {
  id: number;
  question: string;
  status: 'pending' | 'done' | 'error';
  answer: AssistantAnswer | null;
  error: string | null;
}

/**
 * Transcript + request state for the assistant drawer. Each question is sent with the previous answer's
 * context (follow-ups like "and SUB-02-F1?"); the server stays stateless.
 */
export function useAssistantChat(send: (b: AssistantRequest) => Promise<AssistantAnswer>) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const ctx = useRef<AssistantContext>({});
  const seq = useRef(0);

  const ask = useCallback(
    (raw: string, route?: string) => {
      const question = raw.trim().slice(0, 300);
      if (!question) return;
      const id = ++seq.current;
      setTurns((t) => [...t, { id, question, status: 'pending', answer: null, error: null }]);
      send({ question, context: nextContext(ctx.current, route) })
        .then((answer) => {
          ctx.current = answer.context;
          setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: 'done', answer } : x)));
        })
        .catch((e: unknown) => {
          const error = e instanceof Error ? e.message : 'The assistant is unavailable';
          setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: 'error', error } : x)));
        });
    },
    [send],
  );

  const clear = useCallback(() => {
    ctx.current = {};
    setTurns([]);
  }, []);

  return { turns, ask, clear, busy: turns.some((t) => t.status === 'pending') };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemoState } from '@demo/shared';
import { useApi, useSocketEvent } from './client';
import { DEMO_SCRIPT, SCRIPT_STORAGE_KEY, nextStepIndex, type ScriptActionResult, type ScriptEvent, type ScriptStep } from './demoScript';

/**
 * Shared state for the guided script (Demo page card + presenter bar). Progress lives in localStorage under
 * SCRIPT_STORAGE_KEY and is broadcast between mounted hook instances with a window event, so the bar and the
 * card never disagree. Auto-advance (socket events + polled demo state) only applies to the current step.
 */

interface Progress {
  done: Record<string, boolean>;
  /** Explicit position; when absent the first not-done step is current. */
  current?: number;
}

const CHANGE_EVENT = 'h1demo:script';
const POLL_MS = 4000;

function readProgress(): Progress {
  try {
    const raw = window.localStorage.getItem(SCRIPT_STORAGE_KEY);
    if (!raw) return { done: {} };
    const p = JSON.parse(raw) as Partial<Progress>;
    return { done: p.done && typeof p.done === 'object' ? p.done : {}, current: typeof p.current === 'number' ? p.current : undefined };
  } catch {
    return { done: {} };
  }
}

function writeProgress(p: Progress) {
  try {
    window.localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress stays in memory for this tab */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

const clamp = (i: number) => Math.max(0, Math.min(DEMO_SCRIPT.length, i));

export interface ActionRun {
  busy: boolean;
  error: string | null;
  result: ScriptActionResult | null;
}

export interface ScriptController {
  steps: ScriptStep[];
  /** Index of the current step; equals steps.length when every step is done. */
  index: number;
  step: ScriptStep | null;
  done: Record<string, boolean>;
  doneCount: number;
  state: DemoState | null;
  goTo: (i: number) => void;
  markDone: () => void;
  skip: () => void;
  back: () => void;
  restart: () => void;
  /** Runs the current step's action (no-op when it has none). */
  runAction: () => Promise<void>;
  action: ActionRun;
}

export function useScript(options: { poll?: boolean } = {}): ScriptController {
  const api = useApi();
  const [progress, setProgress] = useState<Progress>(() => readProgress());
  const [action, setAction] = useState<ActionRun>({ busy: false, error: null, result: null });

  // Stay in sync with other hook instances (bar + card) and other tabs.
  useEffect(() => {
    const sync = () => setProgress(readProgress());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const index = clamp(progress.current ?? nextStepIndex(progress.done));
  const step = DEMO_SCRIPT[index] ?? null;
  const stepRef = useRef<{ step: ScriptStep | null; index: number }>({ step, index });
  useEffect(() => {
    stepRef.current = { step, index };
  });

  const update = useCallback((fn: (p: Progress) => Progress) => {
    const next = fn(readProgress());
    writeProgress(next);
    setProgress(next);
  }, []);

  const advanceFrom = useCallback(
    (s: ScriptStep, i: number) => update((p) => ({ done: { ...p.done, [s.id]: true }, current: clamp(i + 1) })),
    [update],
  );

  const markDone = useCallback(() => {
    const { step: s, index: i } = stepRef.current;
    if (s) advanceFrom(s, i);
  }, [advanceFrom]);
  const skip = useCallback(() => update((p) => ({ ...p, current: clamp((p.current ?? nextStepIndex(p.done)) + 1) })), [update]);
  const back = useCallback(() => update((p) => ({ ...p, current: clamp((p.current ?? nextStepIndex(p.done)) - 1) })), [update]);
  const goTo = useCallback((i: number) => update((p) => ({ ...p, current: clamp(i) })), [update]);
  const restart = useCallback(() => {
    update(() => ({ done: {}, current: 0 }));
    setAction({ busy: false, error: null, result: null });
  }, [update]);

  // Polled demo state drives `doneWhen` and gives actions their context. State updates and the
  // doneWhen check happen in the fetch callback, never synchronously inside an effect.
  const [state, setState] = useState<DemoState | null>(null);
  const reload = useCallback(
    () =>
      api.demoState().then(
        (s) => {
          setState(s);
          const { step: cur, index: i } = stepRef.current;
          if (cur?.doneWhen?.(s)) advanceFrom(cur, i);
        },
        () => {
          /* keep the last known state; the next poll retries */
        },
      ),
    [api, advanceFrom],
  );
  const poll = options.poll ?? true;
  useEffect(() => {
    void reload();
    if (!poll) return;
    const t = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(t);
  }, [poll, reload]);
  const refresh = useCallback(() => void reload(), [reload]);
  useSocketEvent('feeder:statsChanged', refresh);
  useSocketEvent('drEvent:statusChanged', refresh);
  useSocketEvent('demo:reset', refresh);

  // Socket events → ScriptEvent → advanceOn of the current step.
  const onEvent = useCallback(
    (ev: ScriptEvent) => {
      const { step: s, index: i } = stepRef.current;
      if (s?.advanceOn?.(ev)) advanceFrom(s, i);
    },
    [advanceFrom],
  );
  useSocketEvent('liveEvent:new', (event) => onEvent({ name: 'liveEvent:new', event }));
  useSocketEvent('feeder:statsChanged', () => onEvent({ name: 'feeder:statsChanged' }));
  useSocketEvent('campaign:statsChanged', (campaign) => onEvent({ name: 'campaign:statsChanged', campaign }));
  useSocketEvent('drEvent:statusChanged', (event) => onEvent({ name: 'drEvent:statusChanged', event }));
  useSocketEvent('demo:reset', () => onEvent({ name: 'demo:reset' }));

  const runAction = useCallback(async () => {
    const { step: s } = stepRef.current;
    if (!s?.action) return;
    setAction({ busy: true, error: null, result: null });
    try {
      const result = await s.action.run({ api, state });
      setAction({ busy: false, error: null, result });
      void reload();
    } catch (e) {
      setAction({ busy: false, error: e instanceof Error ? e.message : 'Request failed', result: null });
    }
  }, [api, state, reload]);

  // A new step clears the previous step's result.
  const lastId = useRef(step?.id ?? null);
  useEffect(() => {
    if (lastId.current !== (step?.id ?? null)) {
      lastId.current = step?.id ?? null;
      setAction((a) => (a.busy ? a : { busy: false, error: null, result: null }));
    }
  }, [step]);

  return {
    steps: DEMO_SCRIPT,
    index,
    step,
    done: progress.done,
    doneCount: DEMO_SCRIPT.filter((s) => progress.done[s.id]).length,
    state,
    goTo,
    markDone,
    skip,
    back,
    restart,
    runAction,
    action,
  };
}

// ---------------------------------------------------------------- presenter mode flag

const PRESENTER_KEY = 'h1demo.presenter';
const PRESENTER_EVENT = 'h1demo:presenter';

function readPresenter(): boolean {
  try {
    return window.localStorage.getItem(PRESENTER_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPresenterMode(on: boolean) {
  try {
    window.localStorage.setItem(PRESENTER_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(PRESENTER_EVENT, { detail: on }));
}

/** Presenter mode: hidden by default, toggled with Shift+P or `?presenter=1` / `?presenter=0`, remembered in localStorage. */
export function usePresenterMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => {
    const q = new URLSearchParams(window.location.search).get('presenter');
    if (q === '1' || q === 'true') {
      setPresenterMode(true);
      return true;
    }
    if (q === '0' || q === 'false') {
      setPresenterMode(false);
      return false;
    }
    return readPresenter();
  });
  useEffect(() => {
    const h = (e: Event) => setOn((e as CustomEvent<boolean>).detail ?? readPresenter());
    window.addEventListener(PRESENTER_EVENT, h);
    return () => window.removeEventListener(PRESENTER_EVENT, h);
  }, []);
  return [on, setPresenterMode];
}

import { useEffect, useState, useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const reducedNow = () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reducedNow, () => false);
}

/** Total reveal time cap and per-word pace. */
export const TYPEWRITER_MAX_MS = 1200;
export const TYPEWRITER_MS_PER_WORD = 32;

/**
 * Word-by-word reveal driven by requestAnimationFrame: returns how many of `total` words to show.
 * Finishes within TYPEWRITER_MAX_MS; instant when `animate` is false or the user prefers reduced motion.
 * State only changes inside rAF callbacks, never synchronously in the effect.
 */
export function useTypewriter(total: number, animate = true): { count: number; done: boolean } {
  const reduced = usePrefersReducedMotion();
  const run = animate && !reduced && total > 0;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!run) return;
    const duration = Math.min(TYPEWRITER_MAX_MS, total * TYPEWRITER_MS_PER_WORD);
    let raf = 0;
    let start: number | null = null;
    const step = (t: number) => {
      start ??= t;
      const n = Math.min(total, Math.max(1, Math.ceil(((t - start) / duration) * total)));
      setCount(n);
      if (n < total) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // rAF pauses in background tabs: make sure the answer is complete when the user comes back.
    const finish = window.setTimeout(() => setCount(total), duration + 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(finish);
    };
  }, [run, total]);

  const shown = run ? count : total;
  return { count: shown, done: shown >= total };
}

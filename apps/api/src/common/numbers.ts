/** Round to `digits` decimals using round-half-to-even (matches the Net2Grid source figures). */
export function roundHalfEven(x: number, digits = 1): number {
  const m = 10 ** digits;
  const v = x * m;
  const f = Math.floor(v);
  const diff = v - f;
  let r: number;
  if (Math.abs(diff - 0.5) < 1e-9) r = f % 2 === 0 ? f : f + 1;
  else r = Math.round(v);
  return r / m;
}

export const round1 = (x: number) => Math.round(x * 10) / 10;
export const round2 = (x: number) => Math.round(x * 100) / 100;
export const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** "20" for 20.0, else "35.4" */
export function pctText(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

/** Deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic pseudo-noise in [-1, 1] from a number (e.g. a timestamp bucket). */
export function hashNoise(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

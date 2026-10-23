import { describe, expect, it } from 'vitest';
import { hashNoise, pctText, prng, round1, round2, round3, roundHalfEven } from './numbers.js';

describe('roundHalfEven', () => {
  it('rounds exact halves to the even neighbour', () => {
    expect(roundHalfEven(0.25, 1)).toBe(0.2);
    expect(roundHalfEven(0.35, 1)).toBe(0.4);
    expect(roundHalfEven(2.5, 0)).toBe(2);
    expect(roundHalfEven(3.5, 0)).toBe(4);
    expect(roundHalfEven(1.125, 2)).toBe(1.12);
    expect(roundHalfEven(1.135, 2)).toBe(1.14);
  });

  it('rounds non-halves to the nearest value', () => {
    expect(roundHalfEven(1.26, 1)).toBe(1.3);
    expect(roundHalfEven(1.24, 1)).toBe(1.2);
    expect(roundHalfEven(21.954887, 1)).toBe(22);
    expect(roundHalfEven(52.739726, 1)).toBe(52.7);
  });

  it('handles negatives and the default of one decimal', () => {
    expect(roundHalfEven(-0.25, 1)).toBe(-0.2);
    expect(roundHalfEven(-0.35, 1)).toBe(-0.4);
    expect(roundHalfEven(7.25)).toBe(7.2);
  });

  it('tolerates binary float noise around a half (22.05 * 10 is not exactly 220.5)', () => {
    expect(roundHalfEven(22.05, 1)).toBe(22);
    expect(roundHalfEven(0.75, 1)).toBe(0.8);
  });
});

describe('round helpers', () => {
  it('round to fixed decimals half-up', () => {
    expect(round1(19.8007)).toBe(19.8);
    expect(round2(1.005)).toBeCloseTo(1, 2);
    expect(round3(0.8496)).toBe(0.85);
    expect(round3(2.0448)).toBe(2.045);
  });
});

describe('pctText', () => {
  it('drops the decimal for whole numbers only', () => {
    expect(pctText(20)).toBe('20');
    expect(pctText(0)).toBe('0');
    expect(pctText(35.4)).toBe('35.4');
    expect(pctText(1.5)).toBe('1.5');
    expect(pctText(22.04)).toBe('22.0');
  });
});

describe('prng', () => {
  it('is deterministic for a seed', () => {
    const a = prng(42);
    const b = prng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('differs between seeds and stays in [0, 1)', () => {
    const a = prng(1);
    const b = prng(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
    const r = prng(7);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10000).toBeCloseTo(0.5, 1);
  });

  it('treats the seed as an unsigned 32-bit integer', () => {
    expect(prng(-1)()).toBe(prng(0xffffffff)());
  });
});

describe('hashNoise', () => {
  it('is deterministic and bounded to [-1, 1]', () => {
    expect(hashNoise(123)).toBe(hashNoise(123));
    let min = Infinity;
    let max = -Infinity;
    for (let n = 0; n < 5000; n++) {
      const v = hashNoise(n);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    // Spread covers most of the range: it is noise, not a constant.
    expect(min).toBeLessThan(-0.9);
    expect(max).toBeGreaterThan(0.9);
  });

  it('changes with the input', () => {
    expect(hashNoise(1)).not.toBe(hashNoise(2));
  });
});

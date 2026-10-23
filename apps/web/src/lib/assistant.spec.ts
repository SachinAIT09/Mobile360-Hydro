import { describe, expect, it } from 'vitest';
import { chartLayout, fmtValue, nextContext, revealParagraphs, richSegments, wordCount } from './assistant';

describe('richSegments', () => {
  it('splits **bold** runs', () => {
    expect(richSegments('up **39%** from 820')).toEqual([
      { t: 'up ', b: false },
      { t: '39%', b: true },
      { t: ' from 820', b: false },
    ]);
  });
  it('keeps unbalanced markers as text', () => {
    expect(richSegments('a ** b')).toEqual([{ t: 'a ** b', b: false }]);
  });
});

describe('typewriter reveal', () => {
  const paras = ['Your bill is **$184.27** for **1,142 kWh**.', 'Second paragraph here.'];
  it('counts words without markers', () => {
    expect(wordCount(paras)).toBe(10);
  });
  it('reveals word by word across bold runs and paragraphs', () => {
    expect(revealParagraphs(paras, 0)).toEqual([]);
    expect(revealParagraphs(paras, 4)).toEqual([[{ t: 'Your bill is ', b: false }, { t: '$184.27', b: true }]]);
    expect(revealParagraphs(paras, 8)).toHaveLength(2);
    const all = revealParagraphs(paras, 99);
    expect(all.map((p) => p.map((s) => s.t).join(''))).toEqual(['Your bill is $184.27 for 1,142 kWh.', 'Second paragraph here.']);
  });
});

describe('chartLayout', () => {
  it('scales bars to the max and flags highlights', () => {
    const l = chartLayout({ kind: 'bar', unit: 'EVs', points: [{ label: 'Enrolled', value: 2 }, { label: 'Not enrolled', value: 15, highlight: true }] }, 200, 140, 20, 20);
    expect(l.base).toBe(120);
    expect(l.bars[1].h).toBe(100);
    expect(l.bars[1].y).toBe(20);
    expect(l.bars[0].h).toBeCloseTo(13.33, 1);
    expect(l.bars[1].highlight).toBe(true);
    expect(l.path).toBe('');
  });
  it('labels every nth bar when crowded and draws a path for lines', () => {
    const points = Array.from({ length: 24 }, (_, i) => ({ label: String(i), value: i }));
    const l = chartLayout({ kind: 'line', unit: 'x', points });
    expect(l.bars.filter((b) => b.showLabel)).toHaveLength(8);
    expect(l.path.startsWith('M')).toBe(true);
    expect(l.path.split('L')).toHaveLength(24);
  });
  it('handles all-zero data', () => {
    const l = chartLayout({ kind: 'bar', unit: 'x', points: [{ label: 'a', value: 0 }] });
    expect(l.bars[0].h).toBe(0);
  });
});

describe('fmtValue / nextContext', () => {
  it('formats values compactly', () => {
    expect(fmtValue(1142)).toBe('1,142');
    expect(fmtValue(88.2)).toBe('88.2');
    expect(fmtValue(0.864)).toBe('0.86');
    expect(fmtValue(15)).toBe('15');
  });
  it('keeps only DTO-valid context fields', () => {
    expect(nextContext({ lastIntent: 'FEEDER_STATUS', feederCode: 'SUB-26-F1', campaignId: 'nope' }, '/feeders')).toEqual({
      lastIntent: 'FEEDER_STATUS',
      feederCode: 'SUB-26-F1',
      route: '/feeders',
    });
  });
});

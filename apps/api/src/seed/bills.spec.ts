import { describe, expect, it } from 'vitest';
import { billAmounts, billPeriod, SEED_BILL_KWH } from './bills.js';

describe('billAmounts', () => {
  it('reproduces the October bill exactly', () => {
    expect(billAmounts(1142)).toEqual({
      lines: [
        { label: 'Electricity', amount: 92.4 },
        { label: 'Delivery', amount: 61.15 },
        { label: 'Regulatory', amount: 9.52 },
        { label: 'HST', amount: 21.2 },
      ],
      total: 184.27,
    });
  });

  it('totals equal the sum of the lines for every seeded month', () => {
    for (const kWh of SEED_BILL_KWH) {
      const b = billAmounts(kWh);
      expect(b.total).toBeCloseTo(b.lines.reduce((s, l) => s + l.amount, 0), 2);
      expect(b.total).toBeGreaterThan(0);
    }
  });
});

describe('billPeriod', () => {
  it('runs from the 15th to the 14th with the right day count', () => {
    expect(billPeriod(2026, 10)).toEqual({ start: { year: 2026, month: 9 }, end: { year: 2026, month: 10 }, days: 30 });
    expect(billPeriod(2026, 6).days).toBe(31); // May 15 to Jun 14
    expect(billPeriod(2026, 1)).toEqual({ start: { year: 2025, month: 12 }, end: { year: 2026, month: 1 }, days: 31 });
  });
});

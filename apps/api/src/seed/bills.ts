/**
 * Pure bill maths for the seeded bill history. Every line is derived from kWh with the same rates
 * as the October bill ($184.27 for 1,142 kWh), so that bill reproduces its published lines exactly.
 */
import { round2 } from '../common/numbers.js';

/** kWh per bill, May to October 2026 (also the usage-history chart). */
export const SEED_BILL_KWH = [520, 610, 730, 690, 820, 1142] as const;

const REF_KWH = 1142;
const REF = { electricity: 92.4, delivery: 61.15, regulatory: 9.52 } as const;
const HST_RATE = 0.13;

export interface SeedBillAmounts {
  lines: { label: string; amount: number }[];
  total: number;
}

export function billAmounts(kWh: number): SeedBillAmounts {
  const electricity = round2((kWh * REF.electricity) / REF_KWH);
  const delivery = round2((kWh * REF.delivery) / REF_KWH);
  const regulatory = round2((kWh * REF.regulatory) / REF_KWH);
  const hst = round2((electricity + delivery + regulatory) * HST_RATE);
  return {
    lines: [
      { label: 'Electricity', amount: electricity },
      { label: 'Delivery', amount: delivery },
      { label: 'Regulatory', amount: regulatory },
      { label: 'HST', amount: hst },
    ],
    total: round2(electricity + delivery + regulatory + hst),
  };
}

export interface SeedBillPeriod {
  /** 1-based year/month of the period start (the 15th) and end (the 14th of `endMonth`). */
  start: { year: number; month: number };
  end: { year: number; month: number };
  /** Days in the period. */
  days: number;
}

/** Billing period ending on the 14th of `endMonth`: starts on the 15th of the previous month. */
export function billPeriod(year: number, endMonth: number): SeedBillPeriod {
  const startMonth = endMonth === 1 ? 12 : endMonth - 1;
  const startYear = endMonth === 1 ? year - 1 : year;
  const daysInStartMonth = new Date(Date.UTC(startYear, startMonth, 0)).getUTCDate();
  // 15th..last day of the start month (inclusive) + 14 days of the end month
  const days = daysInStartMonth - 15 + 1 + 14;
  return { start: { year: startYear, month: startMonth }, end: { year, month: endMonth }, days };
}

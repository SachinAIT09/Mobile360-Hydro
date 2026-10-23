import { describe, expect, it } from 'vitest';
import { BASELINE_FORECAST_MAX, baselineForecastPct } from './forecast.js';

describe('baselineForecastPct', () => {
  it('is deterministic and between 45% and the max, below the 85% risk threshold', () => {
    const codes = Array.from({ length: 200 }, (_, i) => `SUB-${String((i % 51) + 1).padStart(2, '0')}-F${(i % 9) + 1}`);
    for (const c of codes) {
      const v = baselineForecastPct(c);
      expect(v).toBe(baselineForecastPct(c));
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(45);
      expect(v).toBeLessThanOrEqual(BASELINE_FORECAST_MAX);
    }
    expect(BASELINE_FORECAST_MAX).toBeLessThan(85);
  });
  it('varies between feeders', () => {
    const vals = new Set(['SUB-01-F1', 'SUB-01-F2', 'SUB-01-F3', 'SUB-01-F4', 'SUB-01-F5', 'SUB-01-F6', 'SUB-01-F7'].map(baselineForecastPct));
    expect(vals.size).toBeGreaterThan(3);
  });
});

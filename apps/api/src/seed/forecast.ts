import { hash01 } from '@demo/shared';

/** Highest seeded baseline; stays below the assistant's 85% risk threshold and the 90% DR alert. */
export const BASELINE_FORECAST_MAX = 82;
const BASELINE_FORECAST_MIN = 45;

/**
 * Baseline peak-load forecast for a feeder (% of capacity), deterministic per feeder code.
 * Real distribution feeders always carry a forecast; the "forecast high" simulation raises one to 92%.
 */
export function baselineForecastPct(feederCode: string): number {
  return BASELINE_FORECAST_MIN + Math.floor(hash01(`${feederCode}:forecast`) * (BASELINE_FORECAST_MAX - BASELINE_FORECAST_MIN + 1));
}

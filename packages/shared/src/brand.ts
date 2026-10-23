import type { RatePlanId } from './types';

/**
 * Every client-specific placeholder lives here so the real values can be
 * dropped in once Hydro One's brand assets and program details arrive.
 */
export const BRAND = {
  utilityName: 'Hydro One',
  /** Shown inside the dashed placeholder box until a real logo is supplied. */
  logoPlaceholder: '[Hydro One logo]',
  /** Company presenting the demo; its logo and theme are used until the utility's brand assets arrive. */
  vendorName: 'PowerConnect.AI',
  /** Customer-facing app name (login heading, settings). */
  appName: 'My Account',
  staffProductName: 'Grid Edge Insights',
  conceptLabel: 'Concept demo · Sample data',
  emergencyNumber: '[Hydro One emergency number]',
  /** Partner products named in the UI. Simulated in the demo. */
  partners: {
    evDetection: 'Net2Grid',
    payments: 'Kubra',
  },
  /** Town used in the seeded demo addresses. */
  demoTown: 'Peterborough',
} as const;

export const PROGRAM = {
  name: '[DR Program Name]',
  signupIncentive: '[Incentive]',
  perEventIncentive: '[$X]',
  maxEventsPerSeason: '[N]',
  typicalEventHours: '[2–3]',
  termsUrl: '#terms',
  /** Placeholder terms shown in the app until the real terms page exists. */
  termsSummary: [
    'You agree to let [Hydro One] use your smart meter data to detect EV charging and measure event results.',
    'During a grid event you may be asked to pause EV charging for [2–3] hours. Taking part is always your choice.',
    'You earn [Incentive] on sign-up and [$X] for each event you take part in, up to [N] events per season.',
    'You can leave the program at any time from Settings. Rewards already earned are kept.',
  ],
} as const;

/** Placeholder electricity rate used only to show an estimated cost. */
export const DEMO_RATE_PER_KWH = 0.13;

/** Scripted assistant naming and copy (placeholders). */
export const ASSISTANT = {
  staffName: 'Grid Edge Assistant',
  customerName: 'Energy Assistant',
  disclosure: 'Scripted demo assistant · answers from live demo data',
  placeholderStaff: 'Ask me anything about your feeders…',
  placeholderCustomer: 'Ask about your bill, usage or charging…',
} as const;

/**
 * One rate period rule. Hours are local, `from` inclusive and `to` exclusive (0–24).
 * When `from > to` the rule wraps past midnight (e.g. 19 → 7 means 19:00–07:00).
 * Rules are checked in order; the first rule whose `days` and hours match wins.
 */
export interface RatePeriodRule {
  name: string;
  rate: number;
  days: 'weekday' | 'weekend' | 'all';
  from: number;
  to: number;
}

export interface RatePlanDef {
  label: string;
  /** Time-based periods. Every hour of every day matches exactly one rule (TIERED has one all-day rule). */
  periods: RatePeriodRule[];
  /** Monthly consumption tiers (TIERED only). `upToKwhPerMonth` null = no upper bound. */
  tiers?: { name: string; rate: number; upToKwhPerMonth: number | null }[];
}

/** [Placeholder rates, Ontario-style] Not Hydro One's actual prices; $/kWh, energy charge only. */
export const RATE_PLANS: Record<RatePlanId, RatePlanDef> = {
  TOU: {
    label: 'Time-of-use',
    periods: [
      { name: 'off-peak', rate: 0.076, days: 'weekend', from: 0, to: 24 },
      { name: 'off-peak', rate: 0.076, days: 'weekday', from: 19, to: 7 },
      { name: 'mid-peak', rate: 0.122, days: 'weekday', from: 11, to: 17 },
      { name: 'on-peak', rate: 0.158, days: 'weekday', from: 7, to: 11 },
      { name: 'on-peak', rate: 0.158, days: 'weekday', from: 17, to: 19 },
    ],
  },
  ULO: {
    label: 'Ultra-low overnight',
    periods: [
      { name: 'ultra-low', rate: 0.028, days: 'all', from: 23, to: 7 },
      { name: 'off-peak', rate: 0.076, days: 'weekend', from: 7, to: 23 },
      { name: 'mid-peak', rate: 0.122, days: 'weekday', from: 7, to: 16 },
      { name: 'mid-peak', rate: 0.122, days: 'weekday', from: 21, to: 23 },
      { name: 'on-peak', rate: 0.284, days: 'weekday', from: 16, to: 21 },
    ],
  },
  TIERED: {
    label: 'Tiered',
    periods: [{ name: 'tier 1', rate: 0.093, days: 'all', from: 0, to: 24 }],
    tiers: [
      { name: 'tier 1', rate: 0.093, upToKwhPerMonth: 600 },
      { name: 'tier 2', rate: 0.11, upToKwhPerMonth: null },
    ],
  },
};

/** [Placeholder] Grid carbon intensity by local hour 0–23, g CO₂ per kWh (clean overnight, dirtiest at the evening peak). */
export const GRID_CO2_G_PER_KWH: readonly number[] = [
  27, 26, 25, 25, 25, 27, 34, 48, 58, 60, 57, 54, 52, 54, 60, 70, 86, 105, 110, 110, 104, 82, 55, 36,
];

export const SMART_CHARGING = {
  name: '[Smart Charging]',
  defaultReadyBy: '07:00',
  defaultTargetKwh: 30,
  minTargetKwh: 5,
  maxTargetKwh: 60,
  /** Local hour the planner assumes the car is plugged in. */
  plugInHour: 18,
} as const;

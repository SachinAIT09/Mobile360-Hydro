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

/**
 * API contract shared by apps/api, apps/web and apps/mobile.
 * All ids are strings (Mongo ObjectId hex). All timestamps are ISO-8601 strings.
 */

export type Role = 'CUSTOMER' | 'STAFF';

export interface AuthUser {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  /** Present when role === 'CUSTOMER'. */
  customerId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponse {
  token: string;
  user: AuthUser;
}

// ---------------------------------------------------------------- customer

export type EvStatus = 'NONE' | 'DETECTED_NOT_ENROLLED' | 'ENROLLED';

export interface Channels {
  push: boolean;
  sms: boolean;
  email: boolean;
}

export interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  accountNoMasked: string; // "•••• 4821"
  address: string;
  feederCode: string;
  substationCode: string;
  hasSolar: boolean;
  channels: Channels;
  /** Automatic bill payment preference (demo only; no real payment data). */
  autoPay: AutoPay;
}

export interface AutoPay {
  enabled: boolean;
  /** Payment method charged when enabled, null when off. */
  method: PaymentMethodKind | null;
  /** ISO timestamp AutoPay was switched on, null when off. */
  since: string | null;
}
export interface AutoPayUpdateRequest {
  enabled: boolean;
  /** Required when enabled. */
  method?: PaymentMethodKind;
}

export interface BillLine {
  label: string;
  amount: number;
}
export type BillStatus = 'UNPAID' | 'PAID';
export interface Bill {
  id: string;
  periodStart: string;
  periodEnd: string;
  days: number;
  kWh: number;
  lines: BillLine[];
  total: number;
  dueDate: string;
  status: BillStatus;
  /** Share of this bill attributed to EV charging, 0–100, or null when no EV. */
  evSharePct: number | null;
}

/** One row of the bill history list (GET /bills), newest first. */
export interface BillSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  kWh: number;
  total: number;
  status: BillStatus;
}

export interface UsageMonth {
  month: string; // "May"
  kWh: number;
}

export interface Outage {
  id: string;
  feederCode: string;
  affectedCount: number;
  status: 'CREW_ASSIGNED' | 'INVESTIGATING' | 'RESTORED';
  estRestoreAt: string | null;
  cause: string | null;
}

export interface ActiveDrEventRef {
  id: string;
  title: string;
  windowStart: string;
  windowEnd: string;
  status: DrEventStatus;
  myResponse: DrResponse | null;
}

export interface MeSummary {
  customer: CustomerProfile;
  bill: Bill;
  evStatus: EvStatus;
  evDetectedAt: string | null;
  program: Program;
  activeDrEvent: ActiveDrEventRef | null;
  unreadCount: number;
  unreadAlerts: number;
  unreadOffers: number;
  nearbyOutage: Outage | null;
  today: { usedKwh: number; selfConsumptionPct: number | null };
  live: EnergyReading;
}

// ---------------------------------------------------------------- energy

export interface EnergyReading {
  ts: string;
  solarKw: number;
  gridImportKw: number;
  gridExportKw: number;
  homeKw: number; // total home load INCLUDING EV
  evKw: number;
}

export type EnergyRange = 'day' | 'week' | 'month' | 'year';

export interface EnergyBreakdownItem {
  key: 'ev' | 'heating' | 'alwaysOn' | 'other';
  label: string;
  kWh: number;
}

export interface EnergySummary {
  range: EnergyRange;
  label: string; // "Today, Wed Oct 21"
  hasSolar: boolean;
  productionKwh: number;
  consumptionKwh: number;
  selfConsumedKwh: number;
  selfConsumptionPct: number | null; // of production
  exportedKwh: number;
  exportedPct: number | null; // of production
  importedKwh: number;
  costEstimate: number;
  breakdown: EnergyBreakdownItem[];
  peakSolarW: number | null;
  peakSolarAt: string | null;
}

// ---------------------------------------------------------------- program / enrollment

export interface Program {
  id: string;
  name: string;
  signupIncentive: string;
  perEventIncentive: string;
  maxEventsPerSeason: string;
  typicalEventHours: string;
  termsUrl: string;
}

export type EnrollmentSource = 'APP_POPUP' | 'CAMPAIGN' | 'LEGACY';
export type ChargerType = 'LEVEL_1' | 'LEVEL_2';

export interface EnrollRequest {
  source: EnrollmentSource;
  evMake?: string;
  chargerType?: ChargerType;
  /** Message that led to the enrollment (popup or campaign offer), for attribution. */
  messageId?: string;
  consent: boolean;
}

export interface Enrollment {
  id: string;
  customerId: string;
  programId: string;
  enrolledAt: string;
  source: EnrollmentSource;
  status: 'ACTIVE' | 'LEFT';
}

// ---------------------------------------------------------------- payments / outages

export type PaymentMethodKind = 'SAVED_CARD' | 'BANK_PAD' | 'WALLET';
export interface PaymentRequest {
  billId: string;
  amount: number;
  method: PaymentMethodKind;
}
export interface Payment {
  id: string;
  billId: string;
  amount: number;
  method: PaymentMethodKind;
  status: 'CONFIRMED';
  confirmationNo: string;
  provider: 'KUBRA_MOCK';
  createdAt: string;
}

export type OutageReportType = 'NO_POWER' | 'PARTIAL' | 'FLICKER';
export interface OutageReportRequest {
  type: OutageReportType;
  notifyOnRestore: boolean;
  /** Required when not signed in. */
  address?: string;
}
export interface OutageReportResponse {
  id: string;
  reference: string; // "OR-482113"
  linkedOutage: Outage | null;
}

// ---------------------------------------------------------------- messages

export type MessageKind = 'EV_DETECTED' | 'ENROLL_OFFER' | 'STOP_CHARGING' | 'BILL' | 'OUTAGE';
export type MessageAction = 'ENROLLED' | 'DECLINED' | 'DISMISSED' | 'REMIND_LATER' | 'NOT_EV' | 'RESPONDED';
/** Inbox filter chip a message belongs to. */
export type MessageCategory = 'Alerts' | 'Offers' | 'Billing';

export interface Message {
  id: string;
  customerId: string;
  kind: MessageKind;
  category: MessageCategory;
  /** Short pill text: "Grid alert" | "Offer" | "Billing" | "Outage" | "EV". */
  tag: string;
  title: string;
  body: string;
  cta: string | null;
  campaignId: string | null;
  drEventId: string | null;
  /** Mobile route to open, e.g. "/messages/abc", "/dr-events/xyz", "/bill", "/program". */
  route: string;
  createdAt: string;
  openedAt: string | null;
  actedAt: string | null;
  action: MessageAction | null;
}

export interface MessageActionRequest {
  action: Exclude<MessageAction, 'RESPONDED'>;
}

// ---------------------------------------------------------------- DR events

export type DrEventStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED';
export type DrResponse = 'PAUSE' | 'REMIND' | 'OPT_OUT';

export interface DrEvent {
  id: string;
  feederCode: string;
  title: string;
  windowStart: string;
  windowEnd: string;
  status: DrEventStatus;
  campaignId: string;
}

export interface DrEventForCustomer {
  event: DrEvent;
  myResponse: DrResponse | null;
  currentEvKw: number;
  earnText: string; // program.perEventIncentive
}

export interface DrRespondRequest {
  response: DrResponse;
}

export interface DrEventResultMe {
  event: DrEvent;
  myResponse: DrResponse | null;
  earnedText: string | null; // "[$X]" when PAUSE, else null
  kwhShifted: number;
  peakReducedKw: number;
  /** 15-minute home-load series from 2h before to 2h after the window. */
  series: { t: string; kw: number }[];
  feederHouseholdsPaused: number;
  feederPeakReducedMw: number;
}

// ---------------------------------------------------------------- grid / feeder visibility

export interface StatsOverview {
  substations: number; // with matched EVs
  feeders: number; // with matched EVs
  knownEvs: number;
  unenrolledEvs: number;
  invisiblePct: number; // 0–100, 0 decimals
  matchedPremises: number;
  noSignalPremises: number;
  noLocationPremises: number;
  deadSubstations: number;
  partiallyDeadSubstations: number;
  deadFeeders: number;
  deadFeederPremises: number;
  dataSourceNote: string;
}

export interface SubstationStat {
  code: string;
  /** Service region, e.g. "Central" | "East" | "Northwest" | "South". */
  region: string;
  evs: number;
  knownPct: number; // 0–100 integer
  penetrationPct: number; // one decimal
  feederCount: number;
  /** True when per-feeder data exists (SUB-01 in the demo). */
  interactive: boolean;
}

export interface FeederStat {
  code: string;
  substationCode: string;
  evs: number;
  /** null when the split is not available for this feeder. */
  known: number | null;
  unenrolled: number | null;
  confirmedByEnrollment: number | null;
  groundTruthValidated: number | null;
  premises: number | null;
  penetrationPct: number | null;
  invisiblePct: number | null;
  forecastLoadPct: number | null;
}

export interface BlindSpot {
  rank: number;
  feederCode: string;
  substationCode: string;
  /** Region of the substation (filled by the API; optional so pure ranking helpers can omit it). */
  region?: string;
  known: number;
  unenrolled: number;
  penetrationText: string; // "35.4% of 48"
  gapPct: number; // 88.2
}

export interface DeadSubstation {
  code: string;
  feeders: number;
  premises: number;
}

/** Staff reports page (GET /stats/reports). */
export interface ReportsSummary {
  generatedAt: string;
  enrollments: {
    active: number;
    bySource: Record<EnrollmentSource, number>;
    /** Daily enrollments, oldest first, one entry per day (zero-filled); date is "YYYY-MM-DD" in the demo timezone. */
    last30Days: { date: string; count: number }[];
    today: number;
  };
  drProgram: {
    eventsEnded: number;
    householdsPaused: number;
    kwhShifted: number;
    peakReducedMw: number;
  };
  campaigns: {
    total: number;
    offers: number;
    drRequests: number;
    testSends: number;
  };
}

export type LiveEventKind = 'EV_DETECTED' | 'STOPPED_CHARGING_CLUSTER' | 'FEEDER_FORECAST_HIGH' | 'CAMPAIGN_SENT' | 'DR_EVENT_ENDED';

export interface LiveEvent {
  id: string;
  ts: string;
  kind: LiveEventKind;
  substationCode: string;
  feederCode: string | null;
  /** Plain-text summary; the UI bolds nothing automatically. */
  summary: string;
  /** Optional emphasised prefix shown in bold before summary. */
  headline: string;
  count: number | null;
  unenrolledCount: number | null;
  enrolledCount: number | null;
  /** Set when the system already acted, e.g. "Onboarding message sent in app automatically". */
  actionTaken: string | null;
  /** Suggested next action for staff, used to build the button + prefill Campaign 360. */
  suggested: null | {
    label: string;
    campaignType: CampaignType;
    audience: CampaignAudience;
  };
}

// ---------------------------------------------------------------- Campaign 360

export type CampaignType = 'ENROLL_OFFER' | 'STOP_CHARGING';
export type CampaignSegment = 'UNENROLLED_EV' | 'ENROLLED_EV';

export type CampaignAudience =
  | { kind: 'FEEDER'; feederCode: string; segment: CampaignSegment }
  | { kind: 'LIVE_EVENT'; liveEventId: string; segment: CampaignSegment };

export interface CampaignExclusions {
  optedOut: boolean;
  contactedLast7Days: boolean;
  lifeSupport: boolean;
}

export interface CampaignChannels {
  push: boolean;
  inApp: boolean;
  sms: boolean;
  email: boolean;
}

export interface AudiencePreviewRequest {
  audience: CampaignAudience;
  exclusions: CampaignExclusions;
}
export interface AudiencePreview {
  count: number;
  before: number; // before exclusions
  excluded: { optedOut: number; contactedLast7Days: number; lifeSupport: number };
  /** Human label, e.g. "SUB-01-F1 · Detected, unenrolled EVs". */
  label: string;
  includesDemoCustomer: boolean;
}

export interface CampaignCreateRequest {
  type: CampaignType;
  audience: CampaignAudience;
  exclusions: CampaignExclusions;
  title: string;
  body: string;
  cta: string;
  channels: CampaignChannels;
  schedule: { sendNow: boolean; expiresInHours: number };
  /** When set, send only to this demo customer (the "Send test to me" button). */
  testCustomerId?: string;
}

export interface CampaignStats {
  targeted: number;
  sent: number;
  delivered: number;
  opened: number;
  acted: number; // enrolled (offer) or responded (DR)
  paused: number; // DR only
  optedOut: number; // DR only
  declined: number; // offer only
  peakReducedMw: number; // DR only
}

export interface Campaign {
  id: string;
  type: CampaignType;
  audience: CampaignAudience;
  audienceLabel: string;
  exclusions: CampaignExclusions;
  title: string;
  body: string;
  cta: string;
  channels: CampaignChannels;
  status: 'SENT';
  isTest: boolean;
  sentAt: string;
  expiresAt: string;
  drEventId: string | null;
  stats: CampaignStats;
  /** Message id received by the demo customer, if they were in the audience. */
  demoMessageId: string | null;
}

// ---------------------------------------------------------------- demo control

export interface DemoCustomer {
  customerId: string;
  firstName: string;
  email: string;
  feederCode: string;
  evStatus: EvStatus;
  role: 'UNENROLLED_DEMO' | 'ENROLLED_DEMO';
  online: boolean; // a mobile socket is connected for this customer
}

export interface DemoState {
  customers: DemoCustomer[];
  staffSockets: number;
  activeDrEvent: DrEvent | null;
  lastReset: string;
  /** Server clock (ISO) and the demo timezone it reasons in. */
  serverTime: string;
  timezone: string;
  /** EV_ALWAYS_CHARGING: customers with an EV are modelled as charging whenever the clock allows. */
  evAlwaysCharging: boolean;
  /** The DR window the simulators/campaigns would use right now. */
  nextEventWindow: { start: string; end: string };
  /** URL a phone on the same network should open for the customer app. */
  phoneAppUrl: string;
}

export interface DemoPhone {
  url: string;
  /** Inline SVG markup of a QR code for `url`. */
  qrSvg: string;
}

export interface DemoResetRequest {
  /** Default true: clients keep their sign-in (demo ids are stable across resets) and just refetch. */
  keepSessions?: boolean;
}

export interface SimEvDetectedRequest { customerId: string }
export interface SimClusterRequest { substationCode: string }
export interface SimForecastRequest { feederCode: string }

import { Schema, Types } from 'mongoose';
import type {
  AuditAction,
  AuditEntry,
  CampaignAudience,
  CampaignChannels,
  CampaignExclusions,
  CampaignStats,
  CampaignStatus,
  CampaignType,
  CampaignVariantCopy,
  ChargerType,
  DrEventStatus,
  DrResponse,
  EnrollmentSource,
  LiveEventKind,
  MessageAction,
  MessageCategory,
  MessageKind,
  OutageReportType,
  PaymentMethodKind,
  RatePlanId,
  Role,
  VariantId,
} from '@demo/shared';

/** Model names (also the Mongo collection names, lower-cased + "s" by mongoose). */
export const M = {
  Config: 'Config',
  Substation: 'Substation',
  Feeder: 'Feeder',
  Premise: 'Premise',
  Customer: 'Customer',
  User: 'User',
  EvDetection: 'EvDetection',
  Enrollment: 'Enrollment',
  Program: 'Program',
  Message: 'Message',
  Campaign: 'Campaign',
  DrEvent: 'DrEvent',
  EventResponse: 'EventResponse',
  Bill: 'Bill',
  Payment: 'Payment',
  Outage: 'Outage',
  OutageReport: 'OutageReport',
  LiveEvent: 'LiveEvent',
  AuditEntry: 'AuditEntry',
} as const;

type Id = Types.ObjectId;
const ObjectId = Schema.Types.ObjectId;

// ---------------------------------------------------------------- config

export interface ConfigDoc {
  key: 'main';
  matchedPremises: number;
  noSignalPremises: number;
  noLocationPremises: number;
  partiallyDeadSubstations: number;
  deadFeeders: number;
  deadFeederPremises: number;
  dataSourceNote: string;
  lastReset: Date;
}
export const ConfigSchema = new Schema<ConfigDoc>({
  key: { type: String, required: true, unique: true },
  matchedPremises: Number,
  noSignalPremises: Number,
  noLocationPremises: Number,
  partiallyDeadSubstations: Number,
  deadFeeders: Number,
  deadFeederPremises: Number,
  dataSourceNote: String,
  lastReset: Date,
});

// ---------------------------------------------------------------- grid

export interface SubstationDoc {
  code: string;
  order: number;
  region: string;
  /** Seed-time totals from the Net2Grid source; live feeders add deltas on top. */
  seedEvs: number;
  seedKnown: number;
  penetrationPct: number;
  feederCount: number;
  dead: boolean;
  deadPremises: number;
  /** True when every feeder has per-customer data (SUB-01). */
  interactive: boolean;
}
export const SubstationSchema = new Schema<SubstationDoc>({
  code: { type: String, required: true, unique: true },
  order: Number,
  region: String,
  seedEvs: Number,
  seedKnown: Number,
  penetrationPct: Number,
  feederCount: Number,
  dead: Boolean,
  deadPremises: Number,
  interactive: Boolean,
});

export interface FeederDoc {
  code: string;
  substationCode: string;
  order: number;
  /** Live feeders compute their counts from customers/detections/enrollments. */
  live: boolean;
  premisesCount: number | null;
  capacityKw: number;
  forecastLoadPct: number | null;
  /** Static EV count for non-live feeders. */
  staticEvs: number;
  /** Counts at seed time for live feeders (used to compute deltas against static totals). */
  seedKnown: number;
  seedUnenrolled: number;
}
export const FeederSchema = new Schema<FeederDoc>({
  code: { type: String, required: true, unique: true },
  substationCode: { type: String, index: true },
  order: Number,
  live: Boolean,
  premisesCount: { type: Number, default: null },
  capacityKw: Number,
  forecastLoadPct: { type: Number, default: null },
  staticEvs: Number,
  seedKnown: Number,
  seedUnenrolled: Number,
});

export interface PremiseDoc {
  _id: Id;
  address: string;
  feederCode: string;
  substationCode: string;
  hasSolar: boolean;
}
export const PremiseSchema = new Schema<PremiseDoc>({
  address: String,
  feederCode: { type: String, index: true },
  substationCode: { type: String, index: true },
  hasSolar: Boolean,
});

// ---------------------------------------------------------------- people

export type DemoRole = 'UNENROLLED_DEMO' | 'ENROLLED_DEMO' | null;
/** Stored smart-charging settings; null until the customer first saves them. */
export interface SmartChargingDoc {
  enabled: boolean;
  readyBy: string;
  targetKwh: number;
  ratePlan: RatePlanId;
  boostUntil: Date | null;
}
export interface CustomerDoc {
  _id: Id;
  firstName: string;
  lastName: string;
  email: string;
  accountNo: string;
  premiseId: Id;
  address: string;
  feederCode: string;
  substationCode: string;
  hasSolar: boolean;
  optedOutOfMessages: boolean;
  lifeSupport: boolean;
  groundTruthValidated: boolean;
  channels: { push: boolean; sms: boolean; email: boolean };
  /** AutoPay preference; seed resets it to off. */
  autoPay: { enabled: boolean; method: PaymentMethodKind | null; since: Date | null };
  evChargingActive: boolean;
  smartCharging: SmartChargingDoc | null;
  demoRole: DemoRole;
  synthetic: boolean;
}
export const CustomerSchema = new Schema<CustomerDoc>({
  firstName: String,
  lastName: String,
  email: { type: String, index: true },
  accountNo: String,
  premiseId: { type: ObjectId },
  address: String,
  feederCode: { type: String, index: true },
  substationCode: { type: String, index: true },
  hasSolar: Boolean,
  optedOutOfMessages: Boolean,
  lifeSupport: Boolean,
  groundTruthValidated: Boolean,
  channels: { push: Boolean, sms: Boolean, email: Boolean },
  autoPay: {
    enabled: { type: Boolean, default: false },
    method: { type: String, default: null },
    since: { type: Date, default: null },
  },
  evChargingActive: Boolean,
  smartCharging: { type: Schema.Types.Mixed, default: null },
  demoRole: { type: String, default: null },
  synthetic: Boolean,
});

export interface UserDoc {
  _id: Id;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  customerId: Id | null;
}
export const UserSchema = new Schema<UserDoc>({
  email: { type: String, unique: true },
  role: String,
  firstName: String,
  lastName: String,
  customerId: { type: ObjectId, default: null },
});

// ---------------------------------------------------------------- EV / program

export interface EvDetectionDoc {
  _id: Id;
  premiseId: Id;
  customerId: Id;
  feederCode: string;
  substationCode: string;
  firstDetectedAt: Date;
  source: 'NET2GRID';
  status: 'DETECTED' | 'CONFIRMED_NOT_EV';
}
export const EvDetectionSchema = new Schema<EvDetectionDoc>({
  premiseId: ObjectId,
  customerId: { type: ObjectId, index: true },
  feederCode: { type: String, index: true },
  substationCode: { type: String, index: true },
  firstDetectedAt: Date,
  source: String,
  status: String,
});

export interface EnrollmentDoc {
  _id: Id;
  customerId: Id;
  programId: Id;
  feederCode: string;
  substationCode: string;
  enrolledAt: Date;
  source: EnrollmentSource;
  evMake: string | null;
  chargerType: ChargerType | null;
  status: 'ACTIVE' | 'LEFT';
}
export const EnrollmentSchema = new Schema<EnrollmentDoc>({
  customerId: { type: ObjectId, index: true },
  programId: ObjectId,
  feederCode: { type: String, index: true },
  substationCode: { type: String, index: true },
  enrolledAt: Date,
  source: String,
  evMake: { type: String, default: null },
  chargerType: { type: String, default: null },
  status: String,
});

export interface ProgramDoc {
  _id: Id;
  name: string;
  signupIncentive: string;
  perEventIncentive: string;
  maxEventsPerSeason: string;
  typicalEventHours: string;
  termsUrl: string;
}
export const ProgramSchema = new Schema<ProgramDoc>({
  name: String,
  signupIncentive: String,
  perEventIncentive: String,
  maxEventsPerSeason: String,
  typicalEventHours: String,
  termsUrl: String,
});

// ---------------------------------------------------------------- messages / campaigns

export interface MessageDoc {
  _id: Id;
  customerId: Id;
  kind: MessageKind;
  category: MessageCategory;
  tag: string;
  title: string;
  body: string;
  cta: string | null;
  campaignId: Id | null;
  drEventId: Id | null;
  route: string;
  createdAt: Date;
  deliveredAt: Date | null;
  openedAt: Date | null;
  actedAt: Date | null;
  action: MessageAction | null;
  /** A/B variant of the campaign copy (null when not an A/B campaign). */
  variant: VariantId | null;
  synthetic: boolean;
}
export const MessageSchema = new Schema<MessageDoc>({
  customerId: { type: ObjectId, index: true },
  kind: String,
  category: String,
  tag: String,
  title: String,
  body: String,
  cta: { type: String, default: null },
  campaignId: { type: ObjectId, default: null, index: true },
  drEventId: { type: ObjectId, default: null },
  route: String,
  createdAt: Date,
  deliveredAt: { type: Date, default: null },
  openedAt: { type: Date, default: null },
  actedAt: { type: Date, default: null },
  action: { type: String, default: null },
  variant: { type: String, default: null },
  synthetic: Boolean,
});

export interface CampaignDoc {
  _id: Id;
  type: CampaignType;
  audience: CampaignAudience;
  audienceLabel: string;
  exclusions: CampaignExclusions;
  title: string;
  body: string;
  cta: string;
  channels: CampaignChannels;
  status: CampaignStatus;
  isTest: boolean;
  /** Send time; the planned time while SCHEDULED. */
  sentAt: Date;
  expiresAt: Date;
  drEventId: Id | null;
  stats: CampaignStats;
  demoMessageId: Id | null;
  targetIds: Id[];
  scheduledFor: Date | null;
  createdAt: Date;
  createdBy: { name: string; email: string } | null;
  variants: CampaignVariantCopy[] | null;
  variantStats: Record<VariantId, CampaignStats> | null;
  winner: VariantId | null;
}
export const CampaignSchema = new Schema<CampaignDoc>({
  type: String,
  audience: Schema.Types.Mixed,
  audienceLabel: String,
  exclusions: Schema.Types.Mixed,
  title: String,
  body: String,
  cta: String,
  channels: Schema.Types.Mixed,
  status: { type: String, enum: ['SCHEDULED', 'SENDING', 'SENT', 'CANCELLED'] },
  isTest: Boolean,
  sentAt: Date,
  expiresAt: Date,
  drEventId: { type: ObjectId, default: null },
  stats: Schema.Types.Mixed,
  demoMessageId: { type: ObjectId, default: null },
  targetIds: [ObjectId],
  scheduledFor: { type: Date, default: null },
  createdAt: Date,
  createdBy: { type: Schema.Types.Mixed, default: null },
  variants: { type: Schema.Types.Mixed, default: null },
  variantStats: { type: Schema.Types.Mixed, default: null },
  winner: { type: String, default: null },
});
CampaignSchema.index({ status: 1, scheduledFor: 1 });

export interface DrEventDoc {
  _id: Id;
  feederCode: string;
  title: string;
  windowStart: Date;
  windowEnd: Date;
  plannedHours: number;
  status: DrEventStatus;
  campaignId: Id;
  targetCustomerIds: Id[];
  /** All feeders of a multi-feeder campaign; feederCode is the first. */
  feederCodes: string[];
}
export const DrEventSchema = new Schema<DrEventDoc>({
  feederCode: String,
  title: String,
  windowStart: Date,
  windowEnd: Date,
  plannedHours: Number,
  status: String,
  campaignId: ObjectId,
  targetCustomerIds: [ObjectId],
  feederCodes: { type: [String], default: [] },
});

export interface EventResponseDoc {
  _id: Id;
  drEventId: Id;
  customerId: Id;
  response: DrResponse;
  respondedAt: Date;
  kwhShifted: number | null;
  peakReducedKw: number | null;
  earned: string | null;
  synthetic: boolean;
}
export const EventResponseSchema = new Schema<EventResponseDoc>({
  drEventId: { type: ObjectId, index: true },
  customerId: { type: ObjectId, index: true },
  response: String,
  respondedAt: Date,
  kwhShifted: { type: Number, default: null },
  peakReducedKw: { type: Number, default: null },
  earned: { type: String, default: null },
  synthetic: Boolean,
});

// ---------------------------------------------------------------- billing / outages

export interface BillDoc {
  _id: Id;
  customerId: Id;
  periodStart: Date;
  periodEnd: Date;
  days: number;
  kWh: number;
  lines: { label: string; amount: number }[];
  total: number;
  dueDate: Date;
  status: 'UNPAID' | 'PAID';
}
export const BillSchema = new Schema<BillDoc>({
  customerId: { type: ObjectId, index: true },
  periodStart: Date,
  periodEnd: Date,
  days: Number,
  kWh: Number,
  lines: [{ label: String, amount: Number, _id: false }],
  total: Number,
  dueDate: Date,
  status: String,
});

export interface PaymentDoc {
  _id: Id;
  customerId: Id;
  billId: Id;
  amount: number;
  method: PaymentMethodKind;
  status: 'CONFIRMED';
  confirmationNo: string;
  provider: 'KUBRA_MOCK';
  createdAt: Date;
}
export const PaymentSchema = new Schema<PaymentDoc>({
  customerId: ObjectId,
  billId: ObjectId,
  amount: Number,
  method: String,
  status: String,
  confirmationNo: String,
  provider: String,
  createdAt: Date,
});

export interface OutageDoc {
  _id: Id;
  feederCode: string;
  substationCode: string;
  affectedCount: number;
  status: 'CREW_ASSIGNED' | 'INVESTIGATING' | 'RESTORED';
  estRestoreAt: Date | null;
  cause: string | null;
}
export const OutageSchema = new Schema<OutageDoc>({
  feederCode: String,
  substationCode: { type: String, index: true },
  affectedCount: Number,
  status: String,
  estRestoreAt: { type: Date, default: null },
  cause: { type: String, default: null },
});

export interface OutageReportDoc {
  _id: Id;
  customerId: Id | null;
  address: string;
  type: OutageReportType;
  notifyOnRestore: boolean;
  reference: string;
  outageId: Id | null;
  createdAt: Date;
}
export const OutageReportSchema = new Schema<OutageReportDoc>({
  customerId: { type: ObjectId, default: null },
  address: String,
  type: String,
  notifyOnRestore: Boolean,
  reference: String,
  outageId: { type: ObjectId, default: null },
  createdAt: Date,
});

// ---------------------------------------------------------------- live events

export interface LiveEventDoc {
  _id: Id;
  ts: Date;
  kind: LiveEventKind;
  substationCode: string;
  feederCode: string | null;
  headline: string;
  summary: string;
  count: number | null;
  unenrolledCount: number | null;
  enrolledCount: number | null;
  actionTaken: string | null;
  suggested: null | { label: string; campaignType: CampaignType; audience: CampaignAudience };
  /** Hidden from the API: customers referenced by the event (cluster audience). */
  customerIds: Id[];
}
export const LiveEventSchema = new Schema<LiveEventDoc>({
  ts: { type: Date, index: true },
  kind: String,
  substationCode: String,
  feederCode: { type: String, default: null },
  headline: String,
  summary: String,
  count: { type: Number, default: null },
  unenrolledCount: { type: Number, default: null },
  enrolledCount: { type: Number, default: null },
  actionTaken: { type: String, default: null },
  suggested: { type: Schema.Types.Mixed, default: null },
  customerIds: [ObjectId],
});

// ---------------------------------------------------------------- audit log

export interface AuditEntryDoc {
  _id: Id;
  at: Date;
  actor: AuditEntry['actor'];
  action: AuditAction;
  target: AuditEntry['target'];
  summary: string;
}
export const AuditEntrySchema = new Schema<AuditEntryDoc>({
  at: { type: Date, index: true },
  actor: Schema.Types.Mixed,
  action: String,
  target: Schema.Types.Mixed,
  summary: String,
});
AuditEntrySchema.index({ 'target.id': 1 });

export const ALL_SCHEMAS = [
  { name: M.Config, schema: ConfigSchema },
  { name: M.Substation, schema: SubstationSchema },
  { name: M.Feeder, schema: FeederSchema },
  { name: M.Premise, schema: PremiseSchema },
  { name: M.Customer, schema: CustomerSchema },
  { name: M.User, schema: UserSchema },
  { name: M.EvDetection, schema: EvDetectionSchema },
  { name: M.Enrollment, schema: EnrollmentSchema },
  { name: M.Program, schema: ProgramSchema },
  { name: M.Message, schema: MessageSchema },
  { name: M.Campaign, schema: CampaignSchema },
  { name: M.DrEvent, schema: DrEventSchema },
  { name: M.EventResponse, schema: EventResponseSchema },
  { name: M.Bill, schema: BillSchema },
  { name: M.Payment, schema: PaymentSchema },
  { name: M.Outage, schema: OutageSchema },
  { name: M.OutageReport, schema: OutageReportSchema },
  { name: M.LiveEvent, schema: LiveEventSchema },
  { name: M.AuditEntry, schema: AuditEntrySchema },
];

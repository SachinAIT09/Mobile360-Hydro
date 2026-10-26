import type {
  AssistantAnswer,
  AssistantRequest,
  AssistantSuggestions,
  AuditEntry,
  AudiencePreview,
  AudiencePreviewRequest,
  AutoPayUpdateRequest,
  BlindSpot,
  Bill,
  BillSummary,
  Campaign,
  CampaignCreateRequest,
  CampaignDetail,
  Channels,
  CustomerProfile,
  DeadSubstation,
  DemoPhone,
  DemoResetRequest,
  DemoState,
  DrEvent,
  DrEventForCustomer,
  DrEventResultMe,
  DrRespondRequest,
  EnergyRange,
  EnergyReading,
  EnergySummary,
  EnrollRequest,
  Enrollment,
  FeederStat,
  LiveEvent,
  LoginRequest,
  LoginResponse,
  MeSummary,
  Message,
  MessageActionRequest,
  Outage,
  OutageReportRequest,
  OutageReportResponse,
  Payment,
  PaymentRequest,
  Program,
  RatePlanComparison,
  ReportsSummary,
  SimNotifyRequest,
  SimNotifyResult,
  SmartChargingPlan,
  SmartChargingUpdateRequest,
  StatsOverview,
  SubstationStat,
  UsageMonth,
} from './types';

/**
 * REST contract. Every path is relative to `${baseUrl}/api`.
 * Success bodies are the plain JSON value (no wrapper).
 * Errors use NestJS's default shape: { statusCode, message, error }.
 */
export const ApiPaths = {
  login: '/auth/login',
  me: '/me/summary',
  meChannels: '/me/channels',
  meAutoPay: '/me/autopay',
  smartCharging: '/me/smart-charging',
  smartChargingBoost: '/me/smart-charging/boost',
  ratePlans: '/me/rate-plans',
  assistantStaff: '/assistant/staff',
  assistantStaffSuggestions: '/assistant/staff/suggestions',
  assistantMe: '/assistant/me',
  assistantMeSuggestions: '/assistant/me/suggestions',
  energyLive: '/energy/live',
  energySummary: (range: EnergyRange) => `/energy/summary?range=${range}`,
  bills: '/bills',
  billCurrent: '/bills/current',
  usageHistory: '/bills/usage-history',
  payments: '/payments',
  outageNearMe: '/outages/near-me',
  outageReports: '/outage-reports',
  programCurrent: '/programs/current',
  enrollments: '/enrollments',
  messages: '/messages',
  message: (id: string) => `/messages/${id}`,
  messageAction: (id: string) => `/messages/${id}/action`,
  notEv: '/ev-detections/mine/not-ev',
  drEvents: '/dr-events',
  drEvent: (id: string) => `/dr-events/${id}`,
  drRespond: (id: string) => `/dr-events/${id}/responses`,
  drResultMe: (id: string) => `/dr-events/${id}/result/me`,
  drStart: (id: string) => `/dr-events/${id}/start`,
  drEnd: (id: string) => `/dr-events/${id}/end`,
  statsOverview: '/stats/overview',
  blindSpots: '/stats/blind-spots',
  deadSubstations: '/stats/dead-substations',
  statsReports: '/stats/reports',
  substations: '/substations',
  substationFeeders: (code: string) => `/substations/${code}/feeders`,
  feeder: (code: string) => `/feeders/${code}`,
  liveEvents: '/live-events',
  campaigns: '/campaigns',
  campaign: (id: string) => `/campaigns/${id}`,
  campaignDetail: (id: string) => `/campaigns/${id}/detail`,
  campaignCancel: (id: string) => `/campaigns/${id}/cancel`,
  audit: (limit?: number) => (limit === undefined ? '/audit' : `/audit?limit=${limit}`),
  audiencePreview: '/campaigns/preview-audience',
  demoState: '/demo/state',
  demoReset: '/demo/reset',
  demoPhone: '/demo/phone',
  simEvDetected: '/sim/ev-detected',
  simCluster: '/sim/stopped-charging-cluster',
  simForecast: '/sim/feeder-forecast-high',
  simNotify: '/sim/notify',
} as const;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface ApiOptions {
  baseUrl: string; // e.g. http://localhost:3000
  getToken: () => string | null | undefined;
  onUnauthorized?: () => void;
}

export function createApi(opts: ApiOptions) {
  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = opts.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      if (res.status === 401) opts.onUnauthorized?.();
      const msg = data && (Array.isArray(data.message) ? data.message.join(', ') : data.message);
      throw new ApiError(res.status, msg || res.statusText);
    }
    return data as T;
  }
  const get = <T>(p: string) => req<T>('GET', p);
  const post = <T>(p: string, b?: unknown) => req<T>('POST', p, b ?? {});
  const patch = <T>(p: string, b: unknown) => req<T>('PATCH', p, b);
  const put = <T>(p: string, b: unknown) => req<T>('PUT', p, b);

  return {
    // auth
    login: (b: LoginRequest) => post<LoginResponse>(ApiPaths.login, b),
    // customer
    me: () => get<MeSummary>(ApiPaths.me),
    updateChannels: (b: Channels) => patch<Channels>(ApiPaths.meChannels, b),
    updateAutoPay: (b: AutoPayUpdateRequest) => patch<CustomerProfile>(ApiPaths.meAutoPay, b),
    energyLive: () => get<EnergyReading>(ApiPaths.energyLive),
    energySummary: (r: EnergyRange) => get<EnergySummary>(ApiPaths.energySummary(r)),
    bills: () => get<BillSummary[]>(ApiPaths.bills),
    billCurrent: () => get<Bill>(ApiPaths.billCurrent),
    usageHistory: () => get<UsageMonth[]>(ApiPaths.usageHistory),
    pay: (b: PaymentRequest) => post<Payment>(ApiPaths.payments, b),
    outageNearMe: () => get<Outage | null>(ApiPaths.outageNearMe),
    reportOutage: (b: OutageReportRequest) => post<OutageReportResponse>(ApiPaths.outageReports, b),
    program: () => get<Program>(ApiPaths.programCurrent),
    enroll: (b: EnrollRequest) => post<Enrollment>(ApiPaths.enrollments, b),
    messages: () => get<Message[]>(ApiPaths.messages),
    message: (id: string) => get<Message>(ApiPaths.message(id)),
    messageAction: (id: string, b: MessageActionRequest) => post<Message>(ApiPaths.messageAction(id), b),
    notEv: () => post<{ ok: true }>(ApiPaths.notEv),
    drEvent: (id: string) => get<DrEventForCustomer>(ApiPaths.drEvent(id)),
    drRespond: (id: string, b: DrRespondRequest) => post<DrEventForCustomer>(ApiPaths.drRespond(id), b),
    drResultMe: (id: string) => get<DrEventResultMe>(ApiPaths.drResultMe(id)),
    smartCharging: () => get<SmartChargingPlan>(ApiPaths.smartCharging),
    updateSmartCharging: (b: SmartChargingUpdateRequest) => put<SmartChargingPlan>(ApiPaths.smartCharging, b),
    boostCharging: () => post<SmartChargingPlan>(ApiPaths.smartChargingBoost),
    ratePlans: () => get<RatePlanComparison>(ApiPaths.ratePlans),
    askMe: (b: AssistantRequest) => post<AssistantAnswer>(ApiPaths.assistantMe, b),
    mySuggestions: () => get<AssistantSuggestions>(ApiPaths.assistantMeSuggestions),
    // staff
    statsOverview: () => get<StatsOverview>(ApiPaths.statsOverview),
    blindSpots: () => get<BlindSpot[]>(ApiPaths.blindSpots),
    deadSubstations: () => get<DeadSubstation[]>(ApiPaths.deadSubstations),
    reports: () => get<ReportsSummary>(ApiPaths.statsReports),
    substations: () => get<SubstationStat[]>(ApiPaths.substations),
    substationFeeders: (code: string) => get<FeederStat[]>(ApiPaths.substationFeeders(code)),
    feeder: (code: string) => get<FeederStat>(ApiPaths.feeder(code)),
    liveEvents: () => get<LiveEvent[]>(ApiPaths.liveEvents),
    drEvents: () => get<DrEvent[]>(ApiPaths.drEvents),
    campaigns: () => get<Campaign[]>(ApiPaths.campaigns),
    campaign: (id: string) => get<Campaign>(ApiPaths.campaign(id)),
    previewAudience: (b: AudiencePreviewRequest) => post<AudiencePreview>(ApiPaths.audiencePreview, b),
    createCampaign: (b: CampaignCreateRequest) => post<Campaign>(ApiPaths.campaigns, b),
    campaignDetail: (id: string) => get<CampaignDetail>(ApiPaths.campaignDetail(id)),
    cancelCampaign: (id: string) => post<Campaign>(ApiPaths.campaignCancel(id)),
    audit: (limit?: number) => get<AuditEntry[]>(ApiPaths.audit(limit)),
    askStaff: (b: AssistantRequest) => post<AssistantAnswer>(ApiPaths.assistantStaff, b),
    staffSuggestions: () => get<AssistantSuggestions>(ApiPaths.assistantStaffSuggestions),
    drStart: (id: string) => post<DrEvent>(ApiPaths.drStart(id)),
    drEnd: (id: string) => post<DrEvent>(ApiPaths.drEnd(id)),
    // demo
    demoState: () => get<DemoState>(ApiPaths.demoState),
    demoReset: (b?: DemoResetRequest) => post<{ ok: true }>(ApiPaths.demoReset, b ?? {}),
    demoPhone: () => get<DemoPhone>(ApiPaths.demoPhone),
    simEvDetected: (customerId: string) => post<LiveEvent>(ApiPaths.simEvDetected, { customerId }),
    simCluster: (substationCode: string) => post<LiveEvent>(ApiPaths.simCluster, { substationCode }),
    simForecast: (feederCode: string) => post<LiveEvent>(ApiPaths.simForecast, { feederCode }),
    simNotify: (b: SimNotifyRequest) => post<SimNotifyResult>(ApiPaths.simNotify, b),
  };
}

export type Api = ReturnType<typeof createApi>;

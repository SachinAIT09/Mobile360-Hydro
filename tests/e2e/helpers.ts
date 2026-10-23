import { expect, type Page } from '@playwright/test';
import { urls, type DemoApi } from './fixtures';

export interface FeederCounts {
  known: number;
  unenrolled: number;
}
export interface CampaignRow {
  id: string;
  type: 'ENROLL_OFFER' | 'STOP_CHARGING';
  drEventId: string | null;
  isTest?: boolean;
  stats: { targeted: number; sent: number; delivered: number; opened: number; acted: number; paused: number; optedOut: number; declined: number; peakReducedMw: number };
}
export interface DemoStateRow {
  customers: { customerId: string; firstName: string; email: string; role: 'UNENROLLED_DEMO' | 'ENROLLED_DEMO'; evStatus: string; online: boolean }[];
  activeDrEvent: { id: string; status: 'SCHEDULED' | 'ACTIVE' | 'ENDED' } | null;
}

export const MANNY = 'manny@demo.test';
export const PRIYA = 'priya@demo.test';

export async function feederCounts(api: DemoApi, code = 'SUB-01-F1'): Promise<FeederCounts> {
  return api.call<FeederCounts>(`/feeders/${code}`, 'GET', undefined, await api.staffToken());
}

export async function demoState(api: DemoApi): Promise<DemoStateRow> {
  return api.call<DemoStateRow>('/demo/state', 'GET', undefined, await api.staffToken());
}

export async function demoCustomer(api: DemoApi, role: DemoStateRow['customers'][number]['role']) {
  const c = (await demoState(api)).customers.find((x) => x.role === role);
  if (!c) throw new Error(`No ${role} demo customer`);
  return c;
}

export async function campaigns(api: DemoApi): Promise<CampaignRow[]> {
  return api.call<CampaignRow[]>('/campaigns', 'GET', undefined, await api.staffToken());
}

/** Newest campaign of a type. Sending is async on the server, so wait up to 15 s for one to exist. */
export async function latestCampaign(api: DemoApi, type: CampaignRow['type']): Promise<CampaignRow> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const rows = (await campaigns(api)).filter((c) => c.type === type);
    if (rows.length > 0) return rows[0];
    if (Date.now() > deadline) throw new Error(`No ${type} campaign yet`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Simulations go through the API (what the demo buttons call); the UI assertions still exercise the socket path. */
export const sim = {
  evDetected: async (api: DemoApi, customerId: string) => api.call('/sim/ev-detected', 'POST', { customerId }, await api.staffToken()),
  cluster: async (api: DemoApi) => api.call<{ id: string }>('/sim/stopped-charging-cluster', 'POST', { substationCode: 'SUB-01' }, await api.staffToken()),
  forecast: async (api: DemoApi) => api.call<{ id: string }>('/sim/feeder-forecast-high', 'POST', { feederCode: 'SUB-01-F1' }, await api.staffToken()),
  drStart: async (api: DemoApi, id: string) => api.call('/dr-events/' + id + '/start', 'POST', {}, await api.staffToken()),
  drEnd: async (api: DemoApi, id: string) => api.call('/dr-events/' + id + '/end', 'POST', {}, await api.staffToken()),
};

/** Open the staff Campaign 360 page prefilled for a feeder and press the primary send button. */
export async function sendCampaign(web: Page, type: 'ENROLL_OFFER' | 'STOP_CHARGING', opts: { test?: boolean } = {}) {
  const segment = type === 'ENROLL_OFFER' ? 'UNENROLLED_EV' : 'ENROLLED_EV';
  await web.goto(`${urls.WEB}/campaigns/new?type=${type}&feeder=SUB-01-F1&segment=${segment}`);
  const btn = opts.test ? web.getByRole('button', { name: /send test to me/i }) : web.getByRole('button', { name: /^send to [\d,]+ customers$/i });
  await expect(btn).toBeEnabled({ timeout: 20_000 });
  await btn.click();
  await expect(web.getByText(/sent|delivered/i).filter({ visible: true }).first()).toBeVisible();
}

/** Accept the consent checkbox and enroll on the Program screen. */
export async function enrollOnProgramScreen(mob: Page) {
  const consent = mob.getByRole('checkbox', { name: /agree/i });
  await expect(consent).toBeVisible();
  await consent.click();
  const enroll = mob.getByRole('button', { name: /^enroll now/i }).or(mob.getByText('Enroll now', { exact: true }));
  await expect(enroll.first()).toBeEnabled();
  await enroll.first().click();
  await expect(mob.getByText(/welcome|you.re (in|enrolled|part of)/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
}

export async function openInbox(mob: Page) {
  await mob.goto(`${urls.MOB}/messages`);
}

export function mobileRoute(path: string) {
  return `${urls.MOB}${path}`;
}

// ---------------------------------------------------------------- campaign power tools (campaignTools.spec.ts)

export interface CampaignFull extends CampaignRow {
  title: string;
  status: 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED';
  audience: { kind: 'FEEDER' | 'FEEDERS' | 'LIVE_EVENT'; feederCode?: string; feederCodes?: string[]; segment: string };
  scheduledFor: string | null;
  createdAt: string;
  variants: { id: 'A' | 'B'; title: string }[] | null;
  variantStats: Record<'A' | 'B', CampaignRow['stats']> | null;
  winner: 'A' | 'B' | null;
}
export interface AuditRow {
  id: string;
  action: string;
  actor: { name: string; kind: 'STAFF' | 'SYSTEM' };
  target: { kind: string; id: string | null; label: string };
  summary: string;
}
export interface DrEventRow {
  id: string;
  feederCode: string;
  feederCodes?: string[];
  status: 'SCHEDULED' | 'ACTIVE' | 'ENDED';
  campaignId: string;
}

export async function campaignById(api: DemoApi, id: string): Promise<CampaignFull> {
  return api.call<CampaignFull>(`/campaigns/${id}`, 'GET', undefined, await api.staffToken());
}

/** Newest campaign of any type (full DTO). */
export async function newestCampaign(api: DemoApi): Promise<CampaignFull> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const rows = await api.call<CampaignFull[]>('/campaigns', 'GET', undefined, await api.staffToken());
    const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (sorted.length > 0) return sorted[0];
    if (Date.now() > deadline) throw new Error('No campaign yet');
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** POST /campaigns as staff (send now, test or schedule). */
export async function createCampaignViaApi(api: DemoApi, body: Record<string, unknown>): Promise<CampaignFull> {
  return api.call<CampaignFull>(
    '/campaigns',
    'POST',
    {
      exclusions: { optedOut: true, contactedLast7Days: true, lifeSupport: true },
      channels: { push: true, inApp: true, sms: false, email: false },
      cta: 'Open',
      ...body,
    },
    await api.staffToken(),
  );
}

export async function auditLog(api: DemoApi): Promise<AuditRow[]> {
  return api.call<AuditRow[]>('/audit', 'GET', undefined, await api.staffToken());
}

export async function drEventsList(api: DemoApi): Promise<DrEventRow[]> {
  return api.call<DrEventRow[]>('/dr-events', 'GET', undefined, await api.staffToken());
}

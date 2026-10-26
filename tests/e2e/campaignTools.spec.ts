import { expect, shot, test, urls } from './fixtures';
import {
  MANNY,
  auditLog,
  campaignById,
  createCampaignViaApi,
  demoCustomer,
  drEventsList,
  newestCampaign,
  sendCampaign,
  sim,
} from './helpers';

/** Round 3 campaign power tools: multi-feeder audiences, A/B variants, scheduled sends, detail page and audit log. */
test.describe('Campaign power tools', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('multi-feeder audience from the query string sends as FEEDERS', async ({ web, api }) => {
    await web.goto(`${urls.WEB}/campaigns/new?type=ENROLL_OFFER&feeders=SUB-01-F1,SUB-01-F2&segment=UNENROLLED_EV`);
    await expect(web.getByRole('button', { name: 'Remove SUB-01-F1' })).toBeVisible();
    await expect(web.getByRole('button', { name: 'Remove SUB-01-F2' })).toBeVisible();
    const send = web.getByRole('button', { name: /^send to [\d,]+ customers$/i });
    await expect(send).toBeEnabled({ timeout: 20_000 });
    await send.click();
    await expect(web.getByText(/sent to [\d,]+ customers/i).filter({ visible: true }).first()).toBeVisible();
    await shot(web, 'campaign-multi-feeder', true);

    const c = await newestCampaign(api);
    expect(c.audience.kind).toBe('FEEDERS');
    expect(c.audience.feederCodes).toEqual(['SUB-01-F1', 'SUB-01-F2']);
    expect(c.stats.targeted).toBeGreaterThan(0);
  });

  test('"+ Add feeder" turns the feeder into removable chips', async ({ web }) => {
    await web.goto(`${urls.WEB}/campaigns/new?type=ENROLL_OFFER&feeder=SUB-01-F1&segment=UNENROLLED_EV`);
    await web.getByRole('button', { name: '+ Add feeder' }).click();
    await expect(web.getByRole('button', { name: 'Remove SUB-01-F1' })).toBeVisible();
    const chips = web.getByRole('button', { name: /^Remove SUB-/ });
    await expect(chips).toHaveCount(2);
    await chips.last().click();
    // Back to a single feeder select.
    await expect(web.getByRole('button', { name: '+ Add feeder' })).toBeVisible();
  });

  test('A/B test splits recipients and shows per-variant results', async ({ web, api }) => {
    await web.goto(`${urls.WEB}/campaigns/new?type=ENROLL_OFFER&feeders=SUB-01-F1,SUB-01-F2&segment=UNENROLLED_EV`);
    await web.getByRole('checkbox', { name: /a\/b test/i }).check();
    await web.getByRole('tab', { name: /variant b/i }).click();
    const title = web.getByLabel(/title · variant b/i);
    await title.fill('Variant B: earn {incentive} for joining');
    await expect(web.locator('.phone').getByText(/variant b: earn/i)).toBeVisible();
    const send = web.getByRole('button', { name: /^send to [\d,]+ customers$/i });
    await expect(send).toBeEnabled({ timeout: 20_000 });
    await send.click();
    await expect(web.getByText(/a\/b results/i).filter({ visible: true }).first()).toBeVisible();

    const c = await newestCampaign(api);
    expect(c.variants?.map((v) => v.id)).toEqual(['A', 'B']);
    expect(c.variants?.[1].title).toBe('Variant B: earn {incentive} for joining');
    expect(c.variantStats).not.toBeNull();
    expect(c.variantStats!.A.sent + c.variantStats!.B.sent).toBe(c.stats.targeted);
    expect(c.variantStats!.B.sent).toBeGreaterThan(0);

    await web.getByRole('link', { name: /open campaign details/i }).click();
    await expect(web).toHaveURL(new RegExp(`/campaigns/${c.id}$`));
    await expect(web.getByText(/funnel by variant/i).filter({ visible: true }).first()).toBeVisible();
    // The simulation plays out over ~25 s; by then one variant leads or it is too early to call.
    await expect(web.getByText(/leading|too early to call/i).filter({ visible: true }).first()).toBeVisible({ timeout: 25_000 });
    await expect.poll(async () => (await campaignById(api, c.id)).stats.delivered, { timeout: 25_000 }).toBeGreaterThan(0);
    await shot(web, 'campaign-detail-ab', true);
  });

  test('schedule for later from the form, then cancel it', async ({ web, api }) => {
    await web.goto(`${urls.WEB}/campaigns/new?type=ENROLL_OFFER&feeder=SUB-01-F1&segment=UNENROLLED_EV`);
    await expect(web.getByRole('button', { name: /^send to [\d,]+ customers$/i })).toBeEnabled({ timeout: 20_000 });
    await web.getByRole('radio', { name: /schedule for later/i }).check();
    await web.getByRole('button', { name: 'In 2 minutes' }).click();
    const schedule = web.getByRole('button', { name: /^schedule for /i });
    await expect(schedule).toBeEnabled();
    await schedule.click();
    await expect(web.getByText(/scheduled · sends at/i).filter({ visible: true }).first()).toBeVisible();
    await shot(web, 'campaign-scheduled', true);

    const c = await newestCampaign(api);
    expect(c.status).toBe('SCHEDULED');
    expect(c.scheduledFor).not.toBeNull();

    await web.goto(`${urls.WEB}/campaigns`);
    const row = web.getByRole('row').filter({ hasText: c.title });
    await expect(row.getByText('Scheduled', { exact: true })).toBeVisible();

    await row.getByRole('link', { name: c.title }).click();
    // Cancelling asks for confirmation; check the prompt, then accept it.
    let prompt = '';
    web.once('dialog', (d) => {
      prompt = d.message();
      void d.accept();
    });
    await web.getByRole('button', { name: /^cancel$/i }).click();
    await expect.poll(() => prompt).toMatch(/cannot be undone/i);
    await expect.poll(async () => (await campaignById(api, c.id)).status).toBe('CANCELLED');
    await expect(web.getByText('Cancelled', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    const audit = await auditLog(api);
    expect(audit.some((e) => e.action === 'CAMPAIGN_CANCELLED' && e.target.id === c.id)).toBe(true);
  });

  test('a scheduled campaign is sent by the dispatcher and reaches the phone inbox', async ({ api }) => {
    test.slow();
    const manny = await demoCustomer(api, 'UNENROLLED_DEMO');
    await sim.evDetected(api, manny.customerId);
    const c = await createCampaignViaApi(api, {
      type: 'ENROLL_OFFER',
      audience: { kind: 'FEEDER', feederCode: 'SUB-01-F1', segment: 'UNENROLLED_EV' },
      title: 'Scheduled hello {first_name}',
      body: 'Join today and get {incentive}.',
      schedule: { sendNow: false, sendAt: new Date(Date.now() + 61_000).toISOString(), expiresInHours: 24 },
    });
    expect(c.status).toBe('SCHEDULED');
    await expect.poll(async () => (await campaignById(api, c.id)).status, { timeout: 90_000, intervals: [2000] }).toBe('SENT');
    const sent = await campaignById(api, c.id);
    expect(sent.stats.targeted).toBeGreaterThan(0);
    const token = await api.customerToken(MANNY);
    const inbox = await api.call<{ campaignId: string | null }[]>('/messages', 'GET', undefined, token);
    expect(inbox.some((m) => m.campaignId === c.id)).toBe(true);
    const audit = await auditLog(api);
    expect(audit.some((e) => e.action === 'CAMPAIGN_DISPATCHED' && e.target.id === c.id && e.actor.name === 'Scheduler')).toBe(true);
  });

  test('detail page shows the timeline and audit; /audit lists staff and seeded entries', async ({ web, api }) => {
    await sendCampaign(web, 'ENROLL_OFFER');
    const c = await newestCampaign(api);
    await web.goto(`${urls.WEB}/campaigns/${c.id}`);
    await expect(web.getByRole('heading', { name: 'Timeline' })).toBeVisible();
    await expect(web.getByRole('heading', { name: 'Audit', exact: true })).toBeVisible();
    await expect(web.getByText(/demo staff/i).filter({ visible: true }).first()).toBeVisible();
    await shot(web, 'campaign-detail', true);

    await web.goto(`${urls.WEB}/audit`);
    await expect(web.getByRole('link', { name: c.title }).first()).toBeVisible();
    await expect(web.getByText('Jordan Reyes').filter({ visible: true }).first()).toBeVisible();
    await expect(web.getByText('Demo Staff').filter({ visible: true }).first()).toBeVisible();
    await shot(web, 'campaign-audit', true);
  });

  test('multi-feeder stop-charging request: one DR event across feeders, start/end audited', async ({ web, api }) => {
    const c = await createCampaignViaApi(api, {
      type: 'STOP_CHARGING',
      audience: { kind: 'FEEDERS', feederCodes: ['SUB-01-F1', 'SUB-01-F2', 'SUB-01-F3'], segment: 'ENROLLED_EV' },
      title: 'Please pause EV charging {event_window} today',
      body: 'Hi {first_name}, please pause EV charging during {event_window}.',
      cta: 'Respond',
      schedule: { sendNow: true, expiresInHours: 4 },
    });
    expect(c.drEventId).not.toBeNull();
    const ev = (await drEventsList(api)).find((e) => e.id === c.drEventId)!;
    expect(ev.feederCodes?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(ev.feederCode).toBe('SUB-01-F1');

    await web.goto(`${urls.WEB}/events`);
    await expect(web.getByText(/SUB-01-F1 \+\d/).filter({ visible: true }).first()).toBeVisible();

    await sim.drStart(api, ev.id);
    await sim.drEnd(api, ev.id);
    const actions = (await auditLog(api)).filter((e) => e.target.id === ev.id).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['DR_STARTED', 'DR_ENDED']));
    expect((await drEventsList(api)).find((e) => e.id === ev.id)?.status).toBe('ENDED');
  });

  test('demo reset leaves the reset entry plus the seeded history', async ({ api }) => {
    const audit = await auditLog(api);
    expect(audit[0].action).toBe('DEMO_RESET');
    expect(audit.filter((e) => e.actor.name === 'Jordan Reyes')).toHaveLength(3);
    expect(audit).toHaveLength(4);
  });
});

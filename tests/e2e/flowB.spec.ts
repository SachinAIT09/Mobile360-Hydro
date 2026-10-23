import { expect, mobLogin, shot, test, urls } from './fixtures';
import { MANNY, demoCustomer, enrollOnProgramScreen, latestCampaign, sendCampaign, sim } from './helpers';

/** Use case 2a: stopped-charging cluster → enrollment offer campaign → phone opens and enrolls → results tick. */
test.describe('Flow B: enrollment offer to a feeder', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('target the cluster, send, open on the phone, enroll', async ({ web, mob, api }) => {
    await mobLogin(mob, MANNY);
    await web.goto(`${urls.WEB}/feeders`);
    await sim.cluster(api);

    // The live row with the suggested action arrives over the socket.
    // The live row's own action ("Target 118 with enrollment offer"), not a blind-spot "Target N" link already on the page.
    const target = web.getByRole('link', { name: /target [\d,]+ with enrollment offer/i }).or(web.getByRole('button', { name: /target [\d,]+ with enrollment offer/i }));
    await expect(target.first()).toBeVisible({ timeout: 20_000 });
    await target.first().click();
    await expect(web).toHaveURL(/campaigns\/new/);
    const send = web.getByRole('button', { name: /^send to [\d,]+ customers$/i });
    await expect(send).toBeEnabled({ timeout: 20_000 });
    await send.click();
    await shot(web, 'B-campaign-sent', true);

    const campaign = await latestCampaign(api, 'ENROLL_OFFER');
    expect(campaign.stats.sent).toBeGreaterThan(100);

    // Phone: banner, then the offer in the inbox.
    await mob.goto(`${urls.MOB}/messages`);
    const offer = mob.getByText(/saving with|recommended for you|enroll/i).filter({ visible: true }).first();
    await expect(offer).toBeVisible({ timeout: 20_000 });
    await offer.click();
    await expect(mob.getByText(/enroll in 1 minute/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    // Opening the message counts as "opened" (real customer, not simulated).
    await expect.poll(async () => (await latestCampaign(api, 'ENROLL_OFFER')).stats.opened).toBeGreaterThan(0);
    // Staff results panel reflects it live.
    await expect(web.getByText(/opened/i).filter({ visible: true }).first()).toBeVisible();

    await mob.getByRole('button', { name: /enroll in 1 minute/i }).or(mob.getByText(/enroll in 1 minute/i)).filter({ visible: true }).first().click();
    await enrollOnProgramScreen(mob);
    await expect.poll(async () => (await demoCustomer(api, 'UNENROLLED_DEMO')).evStatus).toBe('ENROLLED');
    await expect.poll(async () => (await latestCampaign(api, 'ENROLL_OFFER')).stats.acted).toBeGreaterThan(0);
  });

  test('"Send test to me" targets one customer; "Not interested" is recorded as declined', async ({ web, mob, api }) => {
    await mobLogin(mob, MANNY);
    await sendCampaign(web, 'ENROLL_OFFER', { test: true });
    const campaign = await latestCampaign(api, 'ENROLL_OFFER');
    expect(campaign.stats.targeted).toBe(1);

    await mob.goto(`${urls.MOB}/messages`);
    await mob.getByText(/saving with|recommended for you|enroll/i).filter({ visible: true }).first().click();
    await mob.getByRole('button', { name: /not interested/i }).or(mob.getByText(/not interested/i)).filter({ visible: true }).first().click();
    await expect.poll(async () => (await latestCampaign(api, 'ENROLL_OFFER')).stats.declined).toBe(1);
  });
});

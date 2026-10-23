import { expect, mobLogin, shot, test, urls } from './fixtures';
import { PRIYA, demoState, latestCampaign, sendCampaign, sim } from './helpers';

/** Use case 2b: feeder forecast high → stop-charging request → phone responds → event start/end → results. */
test.describe('Flow C: stop-charging request (DR event)', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('send, pause on the phone, start (EV at 0 kW), end (results on both apps)', async ({ web, mob, api }) => {
    await mobLogin(mob, PRIYA);
    await web.goto(`${urls.WEB}/feeders`);
    await sim.forecast(api);

    const action = web.getByRole('link', { name: /send stop-charging request/i }).or(web.getByRole('button', { name: /send stop-charging request/i }));
    await expect(action.first()).toBeVisible({ timeout: 20_000 });
    await action.first().click();
    await expect(web).toHaveURL(/campaigns\/new/);
    const send = web.getByRole('button', { name: /^send to [\d,]+ customers$/i });
    await expect(send).toBeEnabled({ timeout: 20_000 });
    await send.click();

    // Sending is async on the server: wait for the DR event rather than reading state once.
    await expect.poll(async () => (await demoState(api)).activeDrEvent?.id ?? null, { message: 'a DR event was created' }).not.toBeNull();
    const eventId = (await demoState(api)).activeDrEvent!.id;

    // Phone: grid alert in the inbox → response screen.
    await mob.goto(`${urls.MOB}/messages`);
    await mob.getByText(/pause EV charging/i).filter({ visible: true }).first().click();
    await expect(mob.getByText(/starts in|grid alert/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await shot(mob, 'C-alert');
    await mob.getByText(/yes, i.ll pause/i).filter({ visible: true }).first().click();
    await mob.getByRole('button', { name: /^confirm$/i }).or(mob.getByText('Confirm', { exact: true })).filter({ visible: true }).first().click();
    await expect.poll(async () => (await latestCampaign(api, 'STOP_CHARGING')).stats.paused).toBeGreaterThan(0);
    await expect(web.getByText(/paused charging/i).filter({ visible: true }).first()).toBeVisible();

    // Start: the paused EV draws 0 kW on the Energy screen.
    await sim.drStart(api, eventId);
    await mob.goto(`${urls.MOB}/energy`);
    await expect(mob.getByText(/EV charging/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(mob.getByText(/^0\.0$|0\.0 kW/).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });

    // End: results arrive on the phone; staff results show peak reduced.
    await sim.drEnd(api, eventId);
    await expect(mob.getByText(/event result|see your event result/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await mob.goto(`${urls.MOB}/dr-events/${eventId}/result`);
    await expect(mob.getByText(/peak reduced/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await shot(mob, 'C-result');
    await expect(web.getByText(/MW/).filter({ visible: true }).first()).toBeVisible();
  });

  test('"I can\'t take part today" is recorded as opted out', async ({ web, mob, api }) => {
    await mobLogin(mob, PRIYA);
    await sendCampaign(web, 'STOP_CHARGING', { test: true });
    await mob.goto(`${urls.MOB}/messages`);
    await mob.getByText(/pause EV charging/i).filter({ visible: true }).first().click();
    await mob.getByText(/can.t take part/i).filter({ visible: true }).first().click();
    await mob.getByRole('button', { name: /^confirm$/i }).or(mob.getByText('Confirm', { exact: true })).filter({ visible: true }).first().click();
    await expect.poll(async () => (await latestCampaign(api, 'STOP_CHARGING')).stats.optedOut).toBe(1);
  });
});

import { expect, mobLogin, test, urls } from './fixtures';
import { MANNY, demoCustomer, enrollOnProgramScreen, feederCounts, sim } from './helpers';

/** Demo-day plumbing: reset semantics, running the script twice, staff filters and presenter mode. */
test.describe('Demo controls', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('reset keeping sessions leaves the phone signed in; full reset signs it out', async ({ mob, api }) => {
    await mobLogin(mob, MANNY);
    await api.reset({ keepSessions: true });
    await expect(mob.getByText(/amount due|good (morning|afternoon|evening)/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await mob.reload();
    await expect(mob.getByText(/amount due|good (morning|afternoon|evening)/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });

    await api.reset({ keepSessions: false });
    await expect(mob.getByRole('button', { name: /^sign in$/i }).or(mob.getByText('Sign in', { exact: true })).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('flow A runs twice in a row with a reset in between', async ({ mob, api }) => {
    await mobLogin(mob, MANNY);
    for (let run = 0; run < 2; run++) {
      const before = await feederCounts(api);
      const manny = await demoCustomer(api, 'UNENROLLED_DEMO');
      await sim.evDetected(api, manny.customerId);
      await expect(mob.getByText(/we noticed an EV charging/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
      await mob.getByText(/see program & enroll/i).filter({ visible: true }).first().click();
      await enrollOnProgramScreen(mob);
      await expect.poll(async () => (await feederCounts(api)).known).toBe(before.known + 1);
      await api.reset({ keepSessions: true });
      await expect.poll(async () => (await feederCounts(api)).known).toBe(before.known);
      await expect(mob.getByText(/amount due|good (morning|afternoon|evening)/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    }
  });

  test('staff: region filter, demo page preflight and presenter bar', async ({ web }) => {
    await web.goto(`${urls.WEB}/feeders`);
    const region = web.getByLabel(/region/i);
    await expect(region.first()).toBeVisible({ timeout: 20_000 });
    await region.first().selectOption({ label: 'East' });
    await expect(web.getByText(/showing \d+ substations? in East/i)).toBeVisible();

    await web.goto(`${urls.WEB}/demo`);
    await expect(web.getByText(/guided script/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(web.getByText(/preflight/i).filter({ visible: true }).first()).toBeVisible();
    await expect(web.locator('svg').filter({ visible: true }).first()).toBeVisible(); // phone QR

    await web.goto(`${urls.WEB}/feeders?presenter=1`);
    await expect(web.getByRole('toolbar')).toBeVisible({ timeout: 20_000 });
    await web.keyboard.press('Shift+P');
    await expect(web.getByRole('toolbar')).toHaveCount(0);
  });

  test('staff: reports page renders KPIs and charts; unknown route shows 404', async ({ web }) => {
    await web.goto(`${urls.WEB}/reports`);
    await expect(web.getByRole('heading', { name: /reports/i }).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(web.getByText(/enrollment by feeder/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await web.goto(`${urls.WEB}/no-such-page`);
    await expect(web.getByText(/not found|404/i).filter({ visible: true }).first()).toBeVisible();
  });
});

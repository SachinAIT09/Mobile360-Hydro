import { expect, mobLogin, shot, test, urls } from './fixtures';
import { MANNY, demoCustomer, enrollOnProgramScreen, feederCounts, sim } from './helpers';

/** Use case 1: EV detected → pop-up on the phone → enroll → staff counts move live. */
test.describe('Flow A: EV detected → enroll', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('pop-up, enroll, counts move without refresh', async ({ web, mob, api }) => {
    await mobLogin(mob, MANNY);
    await web.goto(`${urls.WEB}/feeders`);
    await expect(web.getByText(/live events/i).filter({ visible: true }).first()).toBeVisible();

    const before = await feederCounts(api);
    const manny = await demoCustomer(api, 'UNENROLLED_DEMO');
    await sim.evDetected(api, manny.customerId);

    // Phone: banner + sheet arrive over the socket.
    await expect(mob.getByText(/we noticed an EV charging/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await shot(mob, 'A-ev-popup');
    // Staff: the live row appears on the page we were already on (no goto).
    await expect(web.getByText(/new EV detected/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await feederCounts(api)).unenrolled).toBe(before.unenrolled + 1);

    await mob.getByRole('button', { name: /see program/i }).or(mob.getByText(/see program & enroll/i)).filter({ visible: true }).first().click();
    await enrollOnProgramScreen(mob);
    await shot(mob, 'A-enrolled');

    await expect.poll(async () => await feederCounts(api)).toEqual({ ...(await feederCounts(api)), known: before.known + 1, unenrolled: before.unenrolled });
    await expect.poll(async () => (await demoCustomer(api, 'UNENROLLED_DEMO')).evStatus).toBe('ENROLLED');

    await mob.goto(`${urls.MOB}/`);
    await expect(mob.getByText(/enrolled/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('"Not an EV" reverts the detection and the counts', async ({ mob, api }) => {
    await mobLogin(mob, MANNY);
    const before = await feederCounts(api);
    const manny = await demoCustomer(api, 'UNENROLLED_DEMO');
    await sim.evDetected(api, manny.customerId);
    await expect(mob.getByText(/we noticed an EV charging/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await feederCounts(api)).unenrolled).toBe(before.unenrolled + 1);

    await mob.getByText(/not an EV/i).filter({ visible: true }).first().click();
    await expect.poll(async () => (await feederCounts(api)).unenrolled).toBe(before.unenrolled);
    await expect.poll(async () => (await demoCustomer(api, 'UNENROLLED_DEMO')).evStatus).toBe('NONE');
  });

  test('"Remind me later" closes the sheet and keeps the message in the inbox', async ({ mob, api }) => {
    await mobLogin(mob, MANNY);
    const manny = await demoCustomer(api, 'UNENROLLED_DEMO');
    await sim.evDetected(api, manny.customerId);
    await expect(mob.getByText(/we noticed an EV charging/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await mob.getByRole('button', { name: /remind me later/i }).or(mob.getByText(/remind me later/i)).filter({ visible: true }).first().click();
    await expect(mob.getByText(/see program & enroll/i)).toHaveCount(0);

    await mob.goto(`${urls.MOB}/messages`);
    await expect(mob.getByText(/we noticed an EV charging/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await demoCustomer(api, 'UNENROLLED_DEMO')).evStatus).toBe('DETECTED_NOT_ENROLLED');
  });
});

import { expect, mobLogin, shot, test, urls } from './fixtures';
import { PRIYA, latestCampaign, sendCampaign } from './helpers';

interface Slot {
  start: string;
  end: string;
  kw: number;
  ratePerKwh: number;
}
interface Plan {
  settings: { enabled: boolean; readyBy: string; targetKwh: number; ratePlan: string };
  hasEv: boolean;
  session: { start: string; end: string };
  slots: Slot[];
  avoidedDrWindows: { start: string; end: string }[];
  chargingNow: boolean;
  hourly: { hour: string; rate: number }[];
}

const overlaps = (s: { start: string; end: string }, w: { start: string; end: string }) => Date.parse(s.start) < Date.parse(w.end) && Date.parse(s.end) > Date.parse(w.start);

/** Smart charging on Priya's phone. Expectations come from the API, never from the clock. */
test.describe('Smart charging', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('turn on, plan in the cheapest hours, live EV kW follows it, charges around a grid event, turn off', async ({ web, mob, api }) => {
    const token = await api.customerToken(PRIYA);
    const getPlan = () => api.call<Plan>('/me/smart-charging', 'GET', undefined, token);
    // Off by default (Flow C relies on Priya's EV drawing 7.2 kW).
    expect((await getPlan()).settings.enabled).toBe(false);

    await mobLogin(mob, PRIYA);
    await mob.goto(`${urls.MOB}/smart-charging`);
    const toggle = mob.getByRole('switch', { name: 'Smart charging' });
    await expect(toggle).toBeVisible({ timeout: 20_000 });
    await toggle.click();
    await expect(mob.getByText(/next charge starts|charging now/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(mob.getByText(/saves \$/i).filter({ visible: true }).first()).toBeVisible();
    await shot(mob, 'smart-on', true);

    await expect.poll(async () => (await getPlan()).settings.enabled).toBe(true);
    const plan = await getPlan();
    expect(plan.hasEv).toBe(true);
    expect(plan.slots.length).toBeGreaterThan(0);
    const minRate = Math.min(...plan.hourly.map((h) => h.rate));
    for (const s of plan.slots) expect(s.ratePerKwh).toBe(minRate);

    // Energy screen: the live EV figure follows the plan (7.2 kW inside a slot, 0.0 kW otherwise).
    await mob.goto(`${urls.MOB}/energy`);
    const kw = (await getPlan()).chargingNow ? '7.2' : '0.0';
    await expect(mob.locator(`[aria-label*="EV charging ${kw} kW"]`).first()).toBeVisible({ timeout: 20_000 });
    await expect(mob.getByRole('button', { name: 'Open smart charging' })).toBeVisible();
    await shot(mob, 'smart-energy');

    // A stop-charging request for Priya: the plan charges around its window.
    await sendCampaign(web, 'STOP_CHARGING', { test: true });
    const drEventId = (await latestCampaign(api, 'STOP_CHARGING')).drEventId;
    expect(drEventId).not.toBeNull();
    const { event } = await api.call<{ event: { windowStart: string; windowEnd: string } }>(`/dr-events/${drEventId}`, 'GET', undefined, token);
    const window = { start: event.windowStart, end: event.windowEnd };
    await expect
      .poll(async () => {
        const p = await getPlan();
        return p.slots.some((s) => overlaps(s, window));
      })
      .toBe(false);
    const after = await getPlan();
    if (overlaps(after.session, window)) {
      expect(after.avoidedDrWindows.length).toBeGreaterThanOrEqual(1);
      await mob.goto(`${urls.MOB}/smart-charging`);
      await expect(mob.getByText(/skips the grid event/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
      await shot(mob, 'smart-dr', true);
    }

    // Off again: back to always charging on the Energy screen.
    await mob.goto(`${urls.MOB}/smart-charging`);
    const sw = mob.getByRole('switch', { name: 'Smart charging' });
    await expect(sw).toBeVisible({ timeout: 20_000 });
    await sw.click();
    await expect.poll(async () => (await getPlan()).settings.enabled).toBe(false);
    await mob.goto(`${urls.MOB}/energy`);
    await expect(mob.locator('[aria-label*="EV charging 7.2 kW"]').first()).toBeVisible({ timeout: 20_000 });
  });

  test('rate plans: one best plan, the current one marked', async ({ api }) => {
    const token = await api.customerToken(PRIYA);
    const r = await api.call<{ basisKwhPerMonth: number; plans: { id: string; best: boolean; current: boolean; monthlyCost: number; withSmartCharging: number }[] }>('/me/rate-plans', 'GET', undefined, token);
    expect(r.basisKwhPerMonth).toBeGreaterThan(0);
    expect(r.plans.map((p) => p.id)).toEqual(['TOU', 'ULO', 'TIERED']);
    expect(r.plans.filter((p) => p.best)).toHaveLength(1);
    expect(r.plans.find((p) => p.current)?.id).toBe('TOU');
    for (const p of r.plans) expect(p.withSmartCharging).toBeLessThanOrEqual(p.monthlyCost);
  });
});

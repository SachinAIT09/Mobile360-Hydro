import { expect, mobLogin, shot, test, urls } from './fixtures';
import { MANNY } from './helpers';

interface MeSummary {
  bill: { status: string; total: number };
  customer: { autoPay: { enabled: boolean; method: string | null }; channels: { push: boolean; sms: boolean; email: boolean } };
}

/** Portal basics on the phone: pay, outage, energy ranges, bill history, AutoPay, settings. */
test.describe('Customer app basics', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('pay the bill through the mocked Kubra checkout', async ({ mob, api }) => {
    await mobLogin(mob, MANNY);
    await mob.goto(`${urls.MOB}/pay`);
    // Three-step checkout (Amount → Pay with → Confirm) with defaults preselected.
    for (let i = 0; i < 2; i++) {
      const next = mob.getByRole('button', { name: /^continue/i }).filter({ visible: true }).first();
      await expect(next).toBeVisible({ timeout: 20_000 });
      await next.click();
    }
    const pay = mob.getByRole('button', { name: /^pay \$?[\d,.]+/i });
    await expect(pay.first()).toBeVisible({ timeout: 20_000 });
    await pay.first().click();
    await expect(mob.getByText(/thank you|confirmation|KB-\d+/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await shot(mob, 'basics-paid');
    const token = await api.customerToken(MANNY);
    await expect.poll(async () => (await api.call<MeSummary>('/me/summary', 'GET', undefined, token)).bill.status).toBe('PAID');
  });

  test('report an outage signed in and logged out', async ({ mob }) => {
    await mobLogin(mob, MANNY);
    await mob.goto(`${urls.MOB}/outage`);
    await expect(mob.getByText(/known outage near you/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await mob.getByRole('button', { name: /submit|report/i }).filter({ visible: true }).first().click();
    await expect(mob.getByText(/OR-\d{6}/).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });

    const ctx = await mob.context().browser()!.newContext({ viewport: { width: 390, height: 844 } });
    const anon = await ctx.newPage();
    await anon.goto(`${urls.MOB}/outage-report`);
    const address = anon.getByLabel(/address/i).or(anon.getByPlaceholder(/address/i));
    await expect(address.first()).toBeVisible({ timeout: 20_000 });
    await address.first().fill('99 Test St');
    await anon.getByRole('button', { name: /submit|report/i }).filter({ visible: true }).first().click();
    await expect(anon.getByText(/OR-\d{6}/).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  });

  test('energy screen switches ranges and shows live readings', async ({ mob }) => {
    await mobLogin(mob, MANNY);
    await mob.goto(`${urls.MOB}/energy`);
    await expect(mob.getByText(/live/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    for (const range of ['Week', 'Month', 'Year', 'Day']) {
      await mob.getByText(range, { exact: true }).filter({ visible: true }).first().click();
    }
    await expect(mob.getByText(/self-consumption|used|from grid/i).filter({ visible: true }).first()).toBeVisible();
  });

  test('bill history lists six bills and AutoPay can be turned on', async ({ mob, api }) => {
    await mobLogin(mob, MANNY);
    await mob.goto(`${urls.MOB}/bill-history`);
    await expect(mob.getByText(/184\.27/).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(mob.getByText(/83\.89/).filter({ visible: true }).first()).toBeVisible();

    await mob.goto(`${urls.MOB}/autopay`);
    await mob.getByRole('button', { name: /turn on autopay/i }).or(mob.getByText(/turn on autopay/i)).filter({ visible: true }).first().click();
    const token = await api.customerToken(MANNY);
    await expect.poll(async () => (await api.call<MeSummary>('/me/summary', 'GET', undefined, token)).customer.autoPay.enabled).toBe(true);
  });

  test('settings: channel toggles persist and sign out returns to login', async ({ mob, api }) => {
    await mobLogin(mob, MANNY);
    await mob.goto(`${urls.MOB}/settings`);
    const sms = mob.getByRole('switch', { name: /text message|sms/i }).or(mob.getByLabel(/text message|sms/i));
    await expect(sms.first()).toBeVisible({ timeout: 20_000 });
    const token = await api.customerToken(MANNY);
    const before = (await api.call<MeSummary>('/me/summary', 'GET', undefined, token)).customer.channels.sms;
    await sms.first().click();
    await expect.poll(async () => (await api.call<MeSummary>('/me/summary', 'GET', undefined, token)).customer.channels.sms).toBe(!before);

    await mob.getByRole('button', { name: /^sign out$/i }).or(mob.getByText('Sign out', { exact: true })).filter({ visible: true }).first().click();
    await expect(mob.getByRole('button', { name: /^sign in$/i }).or(mob.getByText('Sign in', { exact: true })).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
  });
});

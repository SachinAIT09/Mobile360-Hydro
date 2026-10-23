import { expect, mobLogin, shot, test, urls } from './fixtures';
import { MANNY } from './helpers';

/** Mirrors ASSISTANT.disclosure in packages/shared/src/brand.ts (the e2e package does not import the workspace). */
const DISCLOSURE = /scripted demo assistant/i;
const REVEAL = { timeout: 20_000 };

/** Scripted assistant: staff drawer (top-bar search) and the customer sheet. */
test.describe('Scripted assistant', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('staff: ask about a feeder, draft an offer, hand off to Campaign 360', async ({ web }) => {
    await web.goto(`${urls.WEB}/feeders`);
    const search = web.getByRole('searchbox', { name: /ask/i });
    await expect(search).toBeVisible(REVEAL);
    await search.fill('How is SUB-26-F1 doing?');
    await search.press('Enter');

    const drawer = web.getByRole('dialog', { name: /assistant/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(DISCLOSURE).filter({ visible: true }).first()).toBeVisible();
    await expect(drawer.getByText(/SUB-26-F1 \(substation SUB-26\) has 17 EVs/).filter({ visible: true }).first()).toBeVisible(REVEAL);
    await expect(drawer.getByText('15', { exact: true }).filter({ visible: true }).first()).toBeVisible(REVEAL);
    await shot(web, 'assistant-staff-feeder');

    await drawer.getByRole('button', { name: /draft an enrollment offer for SUB-26-F1/i }).click();
    const open = drawer.getByRole('button', { name: /open in campaign 360/i });
    await expect(open).toBeVisible(REVEAL);
    await expect(drawer.getByText(/variant b/i).filter({ visible: true }).first()).toBeVisible();
    await shot(web, 'assistant-staff-draft');

    await open.click();
    await expect(drawer).toBeHidden();
    await expect(web).toHaveURL(/\/campaigns\/new\?/);
    const url = new URL(web.url());
    expect(url.searchParams.get('feeder')).toBe('SUB-26-F1');
    expect(url.searchParams.get('src')).toBe('assistant');
    expect(url.searchParams.get('title')).toBeTruthy();
    expect(url.searchParams.get('titleB')).toBeTruthy();
    // Campaign 360 picks the draft up: notice shown, A/B enabled, title prefilled with variant A.
    await expect(web.getByText(/copy drafted by the scripted assistant/i).filter({ visible: true }).first()).toBeVisible();
    await expect(web.getByLabel(/^title/i).first()).toHaveValue(url.searchParams.get('title') ?? '');
    await expect(web.getByRole('button', { name: /^send to [\d,]+ customers$/i })).toBeEnabled({ timeout: 20_000 });
  });

  test('staff: Esc closes the drawer and returns focus to the search box', async ({ web }) => {
    await web.goto(`${urls.WEB}/feeders`);
    await web.getByRole('button', { name: 'Open assistant' }).click();
    const drawer = web.getByRole('dialog', { name: /assistant/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: /where are our biggest blind spots/i })).toBeVisible(REVEAL);
    await web.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(web.getByRole('searchbox', { name: /ask/i })).toBeFocused();
  });

  test('customer: why is my bill high, then open the bill', async ({ mob }) => {
    await mobLogin(mob, MANNY);
    await mob.getByRole('button', { name: 'Ask the energy assistant' }).filter({ visible: true }).first().click();
    await expect(mob.getByText(DISCLOSURE).filter({ visible: true }).first()).toBeVisible(REVEAL);
    await mob.getByRole('button', { name: 'Why is my bill high?' }).filter({ visible: true }).first().click();
    await expect(mob.getByText(/39%/).filter({ visible: true }).first()).toBeVisible(REVEAL);
    await shot(mob, 'assistant-customer-bill');

    await mob.getByRole('button', { name: 'Open bill' }).filter({ visible: true }).first().click();
    await expect(mob).toHaveURL(/\/bill$/, REVEAL);
    await expect(mob.getByText(/1,142|\$184\.27/).filter({ visible: true }).first()).toBeVisible(REVEAL);
  });

  test('customer: off-topic questions get an honest fallback', async ({ mob }) => {
    await mobLogin(mob, MANNY);
    await mob.goto(`${urls.MOB}/assistant`);
    const input = mob.getByLabel('Ask the energy assistant').and(mob.locator('input, textarea'));
    await expect(input.first()).toBeVisible(REVEAL);
    await input.first().fill("what's the weather");
    await mob.getByRole('button', { name: 'Send question' }).filter({ visible: true }).first().click();
    await expect(mob.getByText(/I'm a scripted demo assistant/).filter({ visible: true }).first()).toBeVisible(REVEAL);
    await shot(mob, 'assistant-customer-fallback');
  });
});

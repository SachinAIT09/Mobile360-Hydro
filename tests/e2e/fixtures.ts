import { mkdirSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';
import { urls } from './urls';

export { expect, urls };

export const SHOTS = `${__dirname}/shots/`;
mkdirSync(SHOTS, { recursive: true });

const IGNORED_CONSOLE = /ERR_TUNNEL|fonts|favicon|404|WebSocket is closed|net::ERR_/;

export interface DemoApi {
  call<T = unknown>(path: string, method?: string, body?: unknown, token?: string | null): Promise<T>;
  staffToken(): Promise<string>;
  customerToken(email: string): Promise<string>;
  /** Wipe and reseed; keepSessions=true keeps phones signed in (fixed demo ids). */
  reset(opts?: { keepSessions?: boolean }): Promise<void>;
}

interface Fixtures {
  /** Staff app, desktop viewport. */
  web: Page;
  /** Customer app (Expo Web), phone viewport. */
  mob: Page;
  api: DemoApi;
  /** Console/page errors collected from both pages; asserted empty after each test. */
  errs: string[];
}

function watch(page: Page, name: string, errs: string[]) {
  page.on('pageerror', (e) => errs.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text())) errs.push(`${name} console: ${m.text().slice(0, 200)}`);
  });
}

export const test = base.extend<Fixtures>({
  errs: async ({}, use) => {
    const errs: string[] = [];
    await use(errs);
    expect(errs, 'no console or page errors').toEqual([]);
  },
  web: async ({ browser, errs }, use) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    watch(page, 'web', errs);
    await use(page);
    await ctx.close();
  },
  mob: async ({ browser, errs }, use) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    watch(page, 'mob', errs);
    await use(page);
    await ctx.close();
  },
  api: async ({}, use) => {
    const call = async <T,>(path: string, method = 'GET', body?: unknown, token?: string | null): Promise<T> => {
      const r = await fetch(`${urls.API}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await r.text();
      const data = text ? (JSON.parse(text) as T) : (null as T);
      if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 200)}`);
      return data;
    };
    const login = async (email: string) => (await call<{ token: string }>('/auth/login', 'POST', { email, password: 'demo' })).token;
    let staff: string | null = null;
    const api: DemoApi = {
      call,
      staffToken: async () => (staff ??= await login('staff@demo.test')),
      customerToken: login,
      reset: async (opts) => {
        await call('/demo/reset', 'POST', { keepSessions: opts?.keepSessions ?? false }, await api.staffToken());
      },
    };
    await use(api);
  },
});

/** Sign the phone in through the real login screen. */
export async function mobLogin(mob: Page, email: string) {
  await mob.goto(`${urls.MOB}/login`);
  const emailField = mob.getByLabel(/email or account/i).or(mob.locator('input').first());
  await emailField.first().fill(email);
  const pw = mob.getByLabel(/password/i).or(mob.locator('input').nth(1));
  await pw.first().fill('demo');
  await mob.getByRole('button', { name: /^sign in$/i }).or(mob.getByText('Sign in', { exact: true })).first().click();
  await expect(mob.getByText(/amount due|good (morning|afternoon|evening)/i).first()).toBeVisible({ timeout: 20_000 });
}

export const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage });

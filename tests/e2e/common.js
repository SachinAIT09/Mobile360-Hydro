const { chromium } = require('playwright');
// Dev (pnpm dev): three ports. Production (pnpm start / Docker): set BASE_URL, e.g. BASE_URL=http://localhost:3000
const BASE = process.env.BASE_URL;
const WEB = process.env.WEB_URL || (BASE ? BASE + '/staff' : 'http://localhost:5173');
const MOB = process.env.MOBILE_URL || (BASE ? BASE + '/app' : 'http://localhost:8081');
const API = process.env.API_URL || BASE || 'http://localhost:3000';
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
async function setup() {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const web = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const mob = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  for (const [n, p] of [['web', web], ['mob', mob]]) {
    p.on('pageerror', e => errs.push(n + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts|favicon|404/.test(m.text())) errs.push(n + ' console: ' + m.text().slice(0, 200)); });
  }
  return { b, web, mob, errs };
}
const shot = (p, n, full = false) => p.screenshot({ path: OUT + n + '.png', fullPage: full });
async function api(path, method = 'GET', body, token) {
  const r = await fetch(API + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
async function staffToken() { return (await api('/auth/login', 'POST', { email: 'staff@demo.test', password: 'x' })).token; }
async function mobLogin(mob, email) {
  await mob.goto(MOB + '/login'); await mob.waitForTimeout(2500);
  const inputs = mob.locator('input');
  await inputs.nth(0).fill(email); await inputs.nth(1).fill('demo');
  await mob.getByText('Sign in', { exact: true }).click();
  await mob.waitForTimeout(3000);
}
module.exports = { setup, shot, api, staffToken, mobLogin, OUT, WEB, MOB, API };

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type Request, type Response, type NextFunction } from 'express';
import QRCode from 'qrcode';
import { BRAND, colors, gradients, shadows } from '@demo/shared';
import { originOf, phoneAppUrl } from './demo/phone-url.js';

/**
 * Production hosting: one server, one port.
 *   /            start page (links + QR code for opening the customer app on a phone)
 *   /staff/...   staff web app   (apps/web/dist, built with base /staff/)
 *   /app/...     customer app    (apps/mobile/dist, Expo web export with baseUrl /app)
 *   /api, /socket.io, /docs      the API itself
 * When a build folder is missing (e.g. during `pnpm dev`), that path is simply not served.
 */
const here = dirname(fileURLToPath(import.meta.url)); // apps/api/dist

/** QR code style shared with GET /api/demo/phone. */
export const QR_OPTIONS = { type: 'svg', margin: 1, width: 180, color: { dark: colors.navy, light: '#FFFFFF' } } as const;

function findDir(envVar: string, rel: string): string | null {
  const dir = process.env[envVar] || resolve(here, rel);
  return existsSync(join(dir, 'index.html')) ? dir : null;
}

function spa(prefix: string, dir: string) {
  const router = express.Router();
  router.use(express.static(dir, { index: false, maxAge: '1h' }));
  const indexHtml = readFileSync(join(dir, 'index.html'), 'utf8');
  // Any non-file path under the prefix falls back to the app's index.html (client-side routing).
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (/\.[a-z0-9]{1,8}$/i.test(req.path)) return res.status(404).end();
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(indexHtml);
  });
  return [prefix, router] as const;
}

async function startPage(req: Request, hasStaff: boolean, hasApp: boolean): Promise<string> {
  const origin = originOf(req);
  const appUrl = phoneAppUrl(req);
  const qr = hasApp ? await QRCode.toString(appUrl, QR_OPTIONS) : '';
  const card = (href: string, title: string, sub: string, primary: boolean, ok: boolean) =>
    ok
      ? `<a class="card ${primary ? 'pri' : ''}" href="${href}" target="_blank" rel="noopener"><strong>${title}</strong><span>${sub}</span></a>`
      : `<div class="card off"><strong>${title}</strong><span>Not built yet. Run <code>pnpm build</code>.</span></div>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${BRAND.utilityName} EV &amp; Energy demo</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;font-family:'Plus Jakarta Sans',system-ui,-apple-system,Segoe UI,sans-serif;background:${colors.bg};color:${colors.text}}
header{background:linear-gradient(135deg,${colors.navy},${colors.navyMid});color:#fff;padding:32px 0}header .in{max-width:880px;margin:0 auto;padding:0 24px;display:flex;flex-direction:column;gap:8px}
.logo{height:36px;width:auto;max-width:100%;object-fit:contain;align-self:flex-start;display:block;margin-bottom:6px}.logo-text{font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${colors.headerMuted}}
h1{margin:6px 0 0;font-size:28px;font-weight:700}header p{margin:0;color:${colors.headerMuted};font-size:15px}
main{max-width:880px;margin:0 auto;padding:24px;display:flex;flex-direction:column;gap:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.card{display:flex;flex-direction:column;gap:6px;padding:22px;border-radius:20px;background:#fff;box-shadow:${shadows.card};text-decoration:none;color:${colors.text};min-height:44px;transition:box-shadow .15s}
.card strong{font-size:17px}.card span{font-size:14px;color:${colors.textMuted};line-height:1.45}
.card.pri{background:linear-gradient(135deg,${gradients.primary[0]},${gradients.primary[1]});color:#fff;box-shadow:${shadows.button}}.card.pri span{color:#E6E1FB}
.card:hover{box-shadow:${shadows.cardHover}}.card.off{opacity:.6}
.phone{display:flex;flex-wrap:wrap;gap:20px;align-items:center;background:#fff;box-shadow:${shadows.card};border-radius:20px;padding:22px}
.phone svg{width:180px;height:180px}.phone div{flex:1 1 260px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:${colors.textBody};line-height:1.5}
code,kbd{background:${colors.divider};padding:2px 6px;border-radius:6px;font-size:13px}kbd{font-family:inherit;font-weight:600}
ol{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:${colors.textBody};line-height:1.5}
footer{max-width:880px;margin:0 auto;padding:0 24px 28px;font-size:12px;color:${colors.textMuted}}
</style></head><body>
<header><div class="in">${hasStaff ? `<img class="logo" src="/staff/brand/powerconnect-logo-white.png" alt="${BRAND.vendorName}">` : `<span class="logo-text">${BRAND.vendorName}</span>`}<h1>EV &amp; Energy demo</h1><p>${BRAND.vendorName} concept for ${BRAND.utilityName}. Open the two apps in separate tabs, or the customer app on a phone.</p></div></header>
<main>
<div class="grid">
${card('/staff/feeders', 'Staff app', `Feeder visibility, Campaign 360 and DR events for ${BRAND.utilityName} staff.`, true, hasStaff)}
${card('/app/login', 'Customer app', 'The mobile app. Sign in as manny@demo.test or priya@demo.test, any password.', false, hasApp)}
</div>
${hasApp ? `<section class="phone">${qr}<div><strong>Open the customer app on a phone</strong><span>Scan with the phone camera, or open <code>${appUrl}</code>. The phone must be on the same Wi-Fi as this computer, and the firewall must allow port ${new URL(origin).port || '80'}. The phone and the staff app stay in sync through this server.</span></div></section>` : ''}
<section class="phone" style="display:block"><strong style="font-size:15px">Demo script</strong>
<ol style="margin-top:10px">
<li>Open the <strong>Staff app</strong> in one tab and the <strong>Customer app</strong> (Manny) in another tab or on a phone.</li>
<li><strong>EV detected:</strong> Staff app → Demo control panel → <em>Send to phone</em> → Manny → <em>New EV detected</em> → pop-up on the phone → enroll. Feeder counts update live.</li>
<li><strong>Enrollment offer:</strong> press <kbd>Shift</kbd>+<kbd>P</kbd> for the presenter bar → <kbd>R</kbd> reset → <kbd>2</kbd> (284 EVs stopped charging) → Feeder visibility → <em>Target 118 with enrollment offer</em> → Send.</li>
<li><strong>Stop charging:</strong> sign the phone in as Priya → <em>Send to phone</em> → Priya → <em>Stop-charging request</em> → respond on the phone → <kbd>E</kbd> in the presenter bar ends the event.</li>
</ol></section>
</main>
<footer>${BRAND.conceptLabel} · API docs at <a href="/docs">/docs</a></footer>
</body></html>`;
}

export function mountStatic(app: NestExpressApplication): void {
  const log = new Logger('Static');
  const staffDir = findDir('STAFF_DIST', '../../web/dist');
  const appDir = findDir('APP_DIST', '../../mobile/dist');
  if (staffDir) app.use(...spa('/staff', staffDir));
  if (appDir) app.use(...spa('/app', appDir));
  // Expo's export references some shared assets from the site root (/_expo, /assets); serve them too.
  if (appDir) {
    app.use('/_expo', express.static(join(appDir, '_expo'), { maxAge: '1h' }));
    app.use('/assets', express.static(join(appDir, 'assets'), { maxAge: '1h' }));
  }
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) {
      startPage(req, !!staffDir, !!appDir)
        .then((html) => res.type('html').setHeader('Cache-Control', 'no-cache').send(html))
        .catch(next);
      return;
    }
    next();
  });
  log.log(`Staff app: ${staffDir ? '/staff' : 'not built'} · Customer app: ${appDir ? '/app' : 'not built'}`);
}

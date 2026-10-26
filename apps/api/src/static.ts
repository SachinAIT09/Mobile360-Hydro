import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type Request, type Response, type NextFunction } from 'express';
import QRCode from 'qrcode';
import { BRAND, colors } from '@demo/shared';
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
<script>(function(){var p='dark';try{p=localStorage.getItem('pc-theme')||'dark'}catch(e){}var l=p==='light'||(p==='system'&&window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches);document.documentElement.dataset.theme=l?'light':'dark'})()</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark;--font-color:#e2e8f0;--muted-icon:#8aa0c4;--border-color:rgba(255,255,255,0.09);--border-strong:rgba(255,255,255,0.12);--color-blue:#2563eb;--card-bg:rgba(255,255,255,0.045);--card-border:rgba(255,255,255,0.10);--tabs-container:rgba(255,255,255,0.05);--glass-panel-border:rgba(96,165,250,0.22);--link:#60a5fa;--legend-text:rgba(232,237,248,0.7);--strong:#fff;--hover:rgba(255,255,255,0.07);--page-bg-deep:#070f26;--page-bg:radial-gradient(95% 80% at 82% -8%,rgba(37,99,235,0.42) 0%,rgba(37,99,235,0) 58%),linear-gradient(180deg,#0c1c47 0%,#0a1538 48%,#070f26 100%);--shadow:none}
:root[data-theme=light]{color-scheme:light;--font-color:#1e293b;--muted-icon:#55657e;--border-color:rgba(15,23,42,0.09);--border-strong:rgba(15,23,42,0.15);--card-bg:#fff;--card-border:rgba(15,23,42,0.09);--tabs-container:rgba(15,23,42,0.045);--glass-panel-border:rgba(37,99,235,0.24);--link:#1d4ed8;--legend-text:rgba(30,41,59,0.72);--strong:#0b1b45;--hover:#f6f8fc;--page-bg-deep:#eef2f8;--page-bg:radial-gradient(95% 70% at 82% -8%,rgba(37,99,235,0.10) 0%,rgba(37,99,235,0) 58%),linear-gradient(180deg,#f4f7fc 0%,#eef2f8 100%);--shadow:0 1px 2px rgba(15,23,42,0.05),0 1px 3px rgba(15,23,42,0.04)}
.logo.on-light{display:none}:root[data-theme=light] .logo.on-dark{display:none}:root[data-theme=light] .logo.on-light{display:block}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:var(--font-color);background:var(--page-bg);background-color:var(--page-bg-deep);background-attachment:fixed}
a:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
a{color:var(--link)}
.top{height:66px;border-bottom:1px solid var(--border-color);display:flex;align-items:center}.top .in{max-width:880px;width:100%;margin:0 auto;padding:0 24px}
.logo{height:40px;width:auto;max-width:100%;object-fit:contain;display:block}.logo-text{font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted-icon)}
main{max-width:880px;margin:0 auto;padding:28px 24px 24px;display:flex;flex-direction:column;gap:20px}
.head{display:flex;align-items:center;gap:14px}.tile{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#2563eb,#3b82f6);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
h1{margin:0;font-size:24px;font-weight:800;letter-spacing:-0.6px;color:var(--strong)}.head p{margin:2px 0 0;font-size:14px;color:var(--font-color)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.card{display:flex;flex-direction:column;gap:6px;padding:20px;border-radius:16px;background:var(--card-bg);border:1px solid var(--card-border);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);text-decoration:none;color:var(--font-color);min-height:44px;box-shadow:var(--shadow);transition:background .15s,border-color .15s}
.card strong{font-size:16px;font-weight:600;color:var(--strong)}.card span{font-size:14px;color:var(--legend-text);line-height:1.45}
.card:hover{background:var(--hover);border-color:var(--glass-panel-border)}
.card.pri{background:var(--color-blue);border-color:var(--color-blue)}.card.pri strong{color:#fff}.card.pri span{color:#fff;opacity:.85}.card.pri:hover{background:#3b82f6;border-color:#3b82f6}
.card.off{opacity:.6}
.phone{display:flex;flex-wrap:wrap;gap:20px;align-items:center;background:var(--card-bg);border:1px solid var(--card-border);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:16px;padding:20px;box-shadow:var(--shadow)}
.phone svg{width:180px;height:180px;background:#fff;border-radius:12px;padding:8px;border:1px solid var(--border-strong)}.phone div{flex:1 1 260px;display:flex;flex-direction:column;gap:6px;font-size:14px;line-height:1.5}
.phone strong{color:var(--strong);font-weight:600}
code,kbd{background:var(--tabs-container);border:1px solid var(--border-color);padding:1px 6px;border-radius:6px;font-size:13px;color:var(--font-color)}kbd{font-family:inherit;font-weight:600}
ol{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:14px;line-height:1.5}
footer{max-width:880px;margin:0 auto;padding:0 24px 28px;font-size:12px;color:var(--muted-icon)}
</style></head><body>
<header class="top"><div class="in">${hasStaff ? `<img class="logo on-dark" src="/staff/brand/powerconnect-logo-white.png" alt="${BRAND.vendorName}"><img class="logo on-light" src="/staff/brand/powerconnect-logo-trimmed.png" alt="${BRAND.vendorName}">` : `<span class="logo-text">${BRAND.vendorName}</span>`}</div></header>
<main>
<div class="head"><span class="tile" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg></span><div><h1>EV &amp; Energy demo</h1><p>${BRAND.vendorName} concept for ${BRAND.utilityName}. Open the two apps in separate tabs, or the customer app on a phone.</p></div></div>
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

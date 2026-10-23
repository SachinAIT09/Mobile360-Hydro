import { BRAND } from '@demo/shared';

/**
 * Start-up gate. The HTTP server listens within a second of process start (hosts such as Catalyst
 * AppSail require the port to open within 10 s), while the database and Nest app boot behind it.
 * Until then every request gets a 503: a self-refreshing page for browsers, JSON for API/socket calls.
 */
export type GateKind = 'pass' | 'html' | 'json';

export function gateKind(ready: boolean, method: string, path: string, accept: string | undefined): GateKind {
  if (ready) return 'pass';
  if (path.startsWith('/api') || path.startsWith('/socket.io') || path.endsWith('.json')) return 'json';
  if (method === 'GET' && (accept ?? '').includes('text/html')) return 'html';
  return 'json';
}

export const STARTING_MESSAGE = 'The demo is starting. Try again in a moment.';

/** Small branded page that refreshes itself every 2 s until the app is ready. */
export function startingPage(error: string | null = null): string {
  const body = error
    ? `<h1>The demo couldn't start</h1><p>${escapeHtml(error)}</p><p>Check the server logs.</p>`
    : `<div class="spin" aria-hidden="true"></div><h1>Starting the demo…</h1><p>Waking up the server and loading sample data. This takes a few seconds.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${
    error ? '' : '<meta http-equiv="refresh" content="2">'
  }<title>${escapeHtml(BRAND.utilityName)} EV &amp; Energy demo</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#F4F6FB;color:#082148}
main{text-align:center;padding:24px;max-width:420px}h1{font-size:22px;margin:16px 0 8px}p{color:#4A5768;line-height:1.5;margin:0}
.spin{width:44px;height:44px;margin:0 auto;border-radius:50%;border:4px solid #DCD6FA;border-top-color:#6049E1;animation:s 0.9s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.spin{animation:none}}
</style></head><body><main role="status" aria-live="polite">${body}<p style="margin-top:16px;font-size:12px">${escapeHtml(BRAND.conceptLabel)} · ${escapeHtml(BRAND.vendorName)}</p></main></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

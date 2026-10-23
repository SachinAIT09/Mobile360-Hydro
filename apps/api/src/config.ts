import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the repo-root .env (apps/api/dist|src -> ../../../.env) if present. Uses Node's built-in loader.
const here = dirname(fileURLToPath(import.meta.url));
for (const candidate of [resolve(here, '../../../.env'), resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    try {
      process.loadEnvFile(candidate);
    } catch {
      /* ignore malformed .env */
    }
    break;
  }
}

const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : /^(1|true|yes)$/i.test(v));

/**
 * Listen port. Catalyst AppSail tells the app where to listen in X_ZOHO_CATALYST_LISTEN_PORT;
 * otherwise API_PORT, then PORT, then 3000.
 */
export function resolvePort(env: Record<string, string | undefined>): number {
  for (const key of ['X_ZOHO_CATALYST_LISTEN_PORT', 'API_PORT', 'PORT']) {
    const n = Number(env[key]);
    if (env[key] && Number.isInteger(n) && n > 0 && n < 65536) return n;
  }
  return 3000;
}

/**
 * Serve Socket.IO over HTTP long-polling only. Catalyst AppSail doesn't pass WebSocket upgrades through,
 * and every failed upgrade attempt logs an error in the browser, so on AppSail (detected by its port
 * variable) the server stops offering the upgrade. SOCKET_POLLING_ONLY=true|false overrides.
 */
export function socketPollingOnly(env: Record<string, string | undefined>): boolean {
  const v = (env.SOCKET_POLLING_ONLY ?? '').trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return !!env.X_ZOHO_CATALYST_LISTEN_PORT;
}

export const config = {
  /** Read lazily: database.ts may set MONGO_URL at startup (built-in database). */
  get mongoUrl(): string {
    return process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/hydro_one_demo';
  },
  port: resolvePort(process.env),
  socketPollingOnly: socketPollingOnly(process.env),
  jwtSecret: process.env.JWT_SECRET || 'demo-only-secret',
  demoFirstName: process.env.DEMO_CUSTOMER_FIRST_NAME || 'Manny',
  demoEnrolledFirstName: process.env.DEMO_ENROLLED_CUSTOMER_FIRST_NAME || 'Priya',
  evAlwaysCharging: bool(process.env.EV_ALWAYS_CHARGING, true),
  timezone: process.env.DEMO_TIMEZONE || 'America/Toronto',
};

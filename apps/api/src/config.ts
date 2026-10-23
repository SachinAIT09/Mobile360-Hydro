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

export const config = {
  /** Read lazily: database.ts may set MONGO_URL at startup (built-in database). */
  get mongoUrl(): string {
    return process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/hydro_one_demo';
  },
  port: Number(process.env.API_PORT || process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'demo-only-secret',
  demoFirstName: process.env.DEMO_CUSTOMER_FIRST_NAME || 'Manny',
  demoEnrolledFirstName: process.env.DEMO_ENROLLED_CUSTOMER_FIRST_NAME || 'Priya',
  evAlwaysCharging: bool(process.env.EV_ALWAYS_CHARGING, true),
  timezone: process.env.DEMO_TIMEZONE || 'America/Toronto',
};

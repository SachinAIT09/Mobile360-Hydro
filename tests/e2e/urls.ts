// Dev (pnpm dev): three ports. Production (pnpm start / Docker): set BASE_URL, e.g. BASE_URL=http://localhost:3000
const BASE = process.env.BASE_URL;
export const urls = {
  WEB: process.env.WEB_URL || (BASE ? `${BASE}/staff` : 'http://localhost:5173'),
  MOB: process.env.MOBILE_URL || (BASE ? `${BASE}/app` : 'http://localhost:8081'),
  API: process.env.API_URL || BASE || 'http://localhost:3000',
};

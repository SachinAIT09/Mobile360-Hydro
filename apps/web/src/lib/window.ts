import { DEMO_TZ } from '@demo/shared';

/**
 * The event window Campaign 360 previews, using the same rule as the API:
 * before 5 PM local (utility timezone) → 5–8 PM today; otherwise the next full hour + 3 h.
 */
export function upcomingWindow(now = new Date(), tz = DEMO_TZ): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false, minute: 'numeric' }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const minsToStart = h < 17 ? (17 - h) * 60 - m : 60 - m;
  const start = new Date(now.getTime() + minsToStart * 60000);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 3 * 3600000);
  return { start: start.toISOString(), end: end.toISOString() };
}

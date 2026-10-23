import { config } from '../config.js';
import { localParts, zonedTime } from '../common/time.js';

export const MIN_LEAD_MS = 60_000;
export const MAX_LEAD_MS = 24 * 3600_000;
/** Slack for latency between the client picking "now + 1 min" and the request arriving. */
export const SEND_AT_GRACE_MS = 5_000;

export type SendAtResult = { ok: true; at: Date } | { ok: false; error: string };

/** A scheduled send must be between now + 1 minute and now + 24 hours. */
export function validateSendAt(sendAt: string | Date | null | undefined, now = new Date()): SendAtResult {
  if (sendAt === null || sendAt === undefined || sendAt === '') return { ok: false, error: 'schedule.sendAt is required when sendNow is false' };
  const at = sendAt instanceof Date ? sendAt : new Date(sendAt);
  if (Number.isNaN(at.getTime())) return { ok: false, error: 'schedule.sendAt is not a valid date' };
  const lead = at.getTime() - now.getTime();
  if (lead < MIN_LEAD_MS - SEND_AT_GRACE_MS) return { ok: false, error: 'Schedule the send at least 1 minute from now' };
  if (lead > MAX_LEAD_MS) return { ok: false, error: 'Schedule the send within the next 24 hours' };
  return { ok: true, at };
}

export interface QuickTime {
  label: string;
  at: Date;
}

/** Preset send times: in 2 minutes, in 1 hour, and 17:00 local today (or tomorrow once that has passed). */
export function quickTimes(now = new Date(), tz = config.timezone): QuickTime[] {
  const p = localParts(now, tz);
  let five = zonedTime(p.year, p.month, p.day, 17, 0, tz);
  let label = 'Today 17:00';
  if (five.getTime() - now.getTime() < MIN_LEAD_MS) {
    const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    five = zonedTime(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), 17, 0, tz);
    label = 'Tomorrow 17:00';
  }
  return [
    { label: 'In 2 minutes', at: new Date(now.getTime() + 2 * 60_000) },
    { label: 'In 1 hour', at: new Date(now.getTime() + 3600_000) },
    { label, at: five },
  ];
}

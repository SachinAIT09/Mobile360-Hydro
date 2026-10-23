import type { AuditAction } from '@demo/shared';
import type { Db } from '../db/db.service.js';
import { DEMO_EMAILS, DEMO_IDS } from './seed.service.js';

const DAY = 86400000;

/** Historical entries by a second staff member, so the audit log always shows two identities after a reset. */
const HISTORY: { daysAgo: number; hour: number; action: AuditAction; label: string; summary: string }[] = [
  {
    daysAgo: 3,
    hour: 10.25,
    action: 'CAMPAIGN_SENT',
    label: 'EV owners near you are saving',
    summary: 'Enrollment offer sent to 142 customers · SUB-02-F1 · Detected, unenrolled EVs',
  },
  {
    daysAgo: 2,
    hour: 15.5,
    action: 'CAMPAIGN_CANCELLED',
    label: 'Please pause EV charging 5–8 PM today',
    summary: 'Cancelled before sending (forecast dropped below 90% on SUB-03-F2)',
  },
  {
    daysAgo: 1,
    hour: 16.75,
    action: 'CAMPAIGN_SENT',
    label: 'Please pause EV charging 5–8 PM today',
    summary: 'Stop-charging request sent to 64 customers · SUB-01-F1, SUB-01-F3 · Enrolled EVs (DR program)',
  },
];

/** Seeds the audit log at the end of a seed/reset: three entries by Jordan Reyes, 1–3 days ago. */
export async function seedAudit(db: Db): Promise<void> {
  const now = Date.now();
  const actor = { userId: String(DEMO_IDS.staffUser2), name: 'Jordan Reyes', email: DEMO_EMAILS.staff2, kind: 'STAFF' as const };
  await db.audit.insertMany(
    HISTORY.map((h) => {
      // Roughly `daysAgo` days back, spread by `hour` so the entries do not line up; always in the past.
      const at = new Date(now - h.daysAgo * DAY + Math.round((h.hour - 12) * 3600000));
      return { at, actor, action: h.action, target: { kind: 'campaign' as const, id: null, label: h.label }, summary: h.summary };
    }),
  );
}

import { Injectable } from '@nestjs/common';
import type { EnrollmentSource, ReportsSummary } from '@demo/shared';
import { Db } from '../db/db.service.js';
import { round1, round3 } from '../common/numbers.js';
import { localParts } from '../common/time.js';
import { config } from '../config.js';

const SOURCES: EnrollmentSource[] = ['APP_POPUP', 'CAMPAIGN', 'LEGACY'];

/** "YYYY-MM-DD" of `d` in `tz`. */
export function dayKey(d: Date, tz: string): string {
  const p = localParts(d, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Buckets timestamps into `days` consecutive local days ending today (oldest first), zero-filled.
 * Timestamps outside the range are ignored.
 */
export function bucketByDay(dates: Date[], now: Date, days: number, tz: string): { date: string; count: number }[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(new Date(now.getTime() - i * 86400000), tz));
  // Local midnight is not always exactly 24 h apart (DST); derive the bucket from the calendar day instead.
  const index = new Map(keys.map((k, i) => [k, i]));
  const counts = new Array<number>(keys.length).fill(0);
  for (const d of dates) {
    const i = index.get(dayKey(d, tz));
    if (i !== undefined) counts[i]++;
  }
  return keys.map((date, i) => ({ date, count: counts[i] }));
}

/** Staff reports: one aggregation per collection, bucketing done in memory. */
@Injectable()
export class ReportsService {
  constructor(private readonly db: Db) {}

  async summary(now = new Date()): Promise<ReportsSummary> {
    const tz = config.timezone;
    const since = new Date(now.getTime() - 31 * 86400000);
    const [[enr], [dr], [resp], [camp]] = await Promise.all([
      this.db.enrollments.aggregate<{
        active: { n: number }[];
        bySource: { _id: EnrollmentSource; n: number }[];
        recent: { enrolledAt: Date }[];
      }>([
        { $match: { status: 'ACTIVE' } },
        {
          $facet: {
            active: [{ $count: 'n' }],
            bySource: [{ $group: { _id: '$source', n: { $sum: 1 } } }],
            recent: [{ $match: { enrolledAt: { $gte: since } } }, { $project: { _id: 0, enrolledAt: 1 } }],
          },
        },
      ]),
      this.db.drEvents.aggregate<{ _id: null; ended: number }>([
        { $group: { _id: null, ended: { $sum: { $cond: [{ $eq: ['$status', 'ENDED'] }, 1, 0] } } } },
      ]),
      this.db.responses.aggregate<{ _id: null; paused: number; kwh: number; peakKw: number }>([
        { $match: { response: 'PAUSE', kwhShifted: { $ne: null } } },
        {
          $group: {
            _id: null,
            paused: { $sum: 1 },
            kwh: { $sum: '$kwhShifted' },
            peakKw: { $sum: { $ifNull: ['$peakReducedKw', 0] } },
          },
        },
      ]),
      this.db.campaigns.aggregate<{ _id: null; total: number; offers: number; drRequests: number; testSends: number }>([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            offers: { $sum: { $cond: [{ $eq: ['$type', 'ENROLL_OFFER'] }, 1, 0] } },
            drRequests: { $sum: { $cond: [{ $eq: ['$type', 'STOP_CHARGING'] }, 1, 0] } },
            testSends: { $sum: { $cond: ['$isTest', 1, 0] } },
          },
        },
      ]),
    ]);

    const bySource = Object.fromEntries(SOURCES.map((s) => [s, 0])) as Record<EnrollmentSource, number>;
    for (const row of enr?.bySource ?? []) if (row._id in bySource) bySource[row._id] = row.n;
    const last30Days = bucketByDay((enr?.recent ?? []).map((r) => r.enrolledAt), now, 30, tz);

    return {
      generatedAt: now.toISOString(),
      enrollments: {
        active: enr?.active[0]?.n ?? 0,
        bySource,
        last30Days,
        today: last30Days[last30Days.length - 1]?.count ?? 0,
      },
      drProgram: {
        eventsEnded: dr?.ended ?? 0,
        householdsPaused: resp?.paused ?? 0,
        kwhShifted: round1(resp?.kwh ?? 0),
        peakReducedMw: round3((resp?.peakKw ?? 0) / 1000),
      },
      campaigns: {
        total: camp?.total ?? 0,
        offers: camp?.offers ?? 0,
        drRequests: camp?.drRequests ?? 0,
        testSends: camp?.testSends ?? 0,
      },
    };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import type { BlindSpot, DeadSubstation, FeederStat, StatsOverview, SubstationStat } from '@demo/shared';
import { Db } from '../db/db.service.js';
import type { FeederDoc } from '../db/schemas.js';
import { HEADLINE } from '../seed/seed-data.js';
import { EMPTY_COUNTS, rankBlindSpots, toFeederStat, type LiveCounts } from './feeder-stat.js';

export { toFeederStat, rankBlindSpots, type LiveCounts } from './feeder-stat.js';

/** Feeder visibility numbers. Live feeders are computed from customer data; others are static seed stats. */
@Injectable()
export class GridService {
  constructor(private readonly db: Db) {}

  /** Live counts for the given feeders (or every live feeder). */
  async liveCounts(feederCodes?: string[]): Promise<Map<string, LiveCounts>> {
    const filter = feederCodes ? { feederCode: { $in: feederCodes } } : {};
    const [enrolled, detected, gtCustomers] = await Promise.all([
      this.db.enrollments.find({ ...filter, status: 'ACTIVE' }, { customerId: 1, feederCode: 1 }).lean(),
      this.db.detections.find({ ...filter, status: 'DETECTED' }, { customerId: 1, feederCode: 1 }).lean(),
      this.db.customers.find({ ...filter, groundTruthValidated: true }, { _id: 1, feederCode: 1 }).lean(),
    ]);
    const map = new Map<string, LiveCounts>();
    const get = (f: string) => {
      let v = map.get(f);
      if (!v) map.set(f, (v = { known: 0, unenrolled: 0, confirmed: 0, groundTruth: 0 }));
      return v;
    };
    const enrolledSet = new Set(enrolled.map((e) => String(e.customerId)));
    const detectedSet = new Set(detected.map((d) => String(d.customerId)));
    for (const e of enrolled) {
      const v = get(e.feederCode);
      v.known++;
      if (detectedSet.has(String(e.customerId))) v.confirmed++;
    }
    for (const d of detected) if (!enrolledSet.has(String(d.customerId))) get(d.feederCode).unenrolled++;
    for (const c of gtCustomers) {
      const id = String(c._id);
      if (enrolledSet.has(id) || detectedSet.has(id)) get(c.feederCode).groundTruth++;
    }
    return map;
  }

  private toFeederStat(f: FeederDoc, live?: LiveCounts): FeederStat {
    return toFeederStat(f, live);
  }

  async feeder(code: string): Promise<FeederStat> {
    const f = await this.db.feeders.findOne({ code }).lean();
    if (!f) throw new NotFoundException(`Feeder ${code} not found`);
    const live = f.live ? (await this.liveCounts([code])).get(code) : undefined;
    return this.toFeederStat(f, live);
  }

  async substationFeeders(code: string): Promise<FeederStat[]> {
    const fs = await this.db.feeders.find({ substationCode: code }).sort({ order: 1 }).lean();
    if (!fs.length) throw new NotFoundException(`Substation ${code} not found`);
    const live = await this.liveCounts(fs.filter((f) => f.live).map((f) => f.code));
    return fs.map((f) => this.toFeederStat(f, live.get(f.code)));
  }

  /** Per-substation deltas from live feeders vs. their seed counts. */
  private async deltas(): Promise<{ bySub: Map<string, { known: number; unenrolled: number }>; known: number; unenrolled: number }> {
    const liveFeeders = await this.db.feeders.find({ live: true }).lean();
    const counts = await this.liveCounts(liveFeeders.map((f) => f.code));
    const bySub = new Map<string, { known: number; unenrolled: number }>();
    let known = 0;
    let unenrolled = 0;
    for (const f of liveFeeders) {
      const c = counts.get(f.code) ?? EMPTY_COUNTS;
      const dk = c.known - f.seedKnown;
      const du = c.unenrolled - f.seedUnenrolled;
      known += dk;
      unenrolled += du;
      const s = bySub.get(f.substationCode) ?? { known: 0, unenrolled: 0 };
      s.known += dk;
      s.unenrolled += du;
      bySub.set(f.substationCode, s);
    }
    return { bySub, known, unenrolled };
  }

  async substations(): Promise<SubstationStat[]> {
    const [subs, d] = await Promise.all([this.db.substations.find().lean(), this.deltas()]);
    return subs
      .map((s) => {
        const delta = d.bySub.get(s.code) ?? { known: 0, unenrolled: 0 };
        const evs = s.seedEvs + delta.known + delta.unenrolled;
        const known = s.seedKnown + delta.known;
        return {
          code: s.code,
          region: s.region,
          evs,
          knownPct: evs ? Math.round((known / evs) * 100) : 0,
          penetrationPct: s.penetrationPct,
          feederCount: s.feederCount,
          interactive: s.interactive,
        };
      })
      .sort((a, b) => b.evs - a.evs || a.code.localeCompare(b.code));
  }

  async overview(): Promise<StatsOverview> {
    const [d, subs, feederDocs, cfg] = await Promise.all([
      this.deltas(),
      this.substations(),
      this.db.feeders.find().lean(),
      this.db.config.findOne({ key: 'main' }).lean(),
    ]);
    const liveCounts = await this.liveCounts(feederDocs.filter((f) => f.live).map((f) => f.code));
    const feedersWithEvs = feederDocs.filter((f) => {
      if (!f.live) return f.staticEvs > 0;
      const c = liveCounts.get(f.code);
      return !!c && c.known + c.unenrolled > 0;
    }).length;
    const knownEvs = HEADLINE.knownEvs + d.known;
    const unenrolledEvs = HEADLINE.unenrolledEvs + d.unenrolled;
    const dead = subs.filter((s) => s.evs === 0).length;
    return {
      substations: subs.filter((s) => s.evs > 0).length,
      feeders: feedersWithEvs,
      knownEvs,
      unenrolledEvs,
      invisiblePct: Math.round((unenrolledEvs / (knownEvs + unenrolledEvs)) * 100),
      matchedPremises: cfg?.matchedPremises ?? HEADLINE.matchedPremises,
      noSignalPremises: cfg?.noSignalPremises ?? HEADLINE.noSignalPremises,
      noLocationPremises: cfg?.noLocationPremises ?? HEADLINE.noLocationPremises,
      deadSubstations: dead,
      partiallyDeadSubstations: cfg?.partiallyDeadSubstations ?? HEADLINE.partiallyDeadSubstations,
      deadFeeders: cfg?.deadFeeders ?? HEADLINE.deadFeeders,
      deadFeederPremises: cfg?.deadFeederPremises ?? HEADLINE.deadFeederPremises,
      dataSourceNote: cfg?.dataSourceNote ?? HEADLINE.dataSourceNote,
    };
  }

  /** Feeders with ≥15 EVs ranked by share invisible to enrollment (top 8). */
  async blindSpots(): Promise<BlindSpot[]> {
    const liveFeeders = await this.db.feeders.find({ live: true }).lean();
    const [counts, subs] = await Promise.all([
      this.liveCounts(liveFeeders.map((f) => f.code)),
      this.db.substations.find({}, { code: 1, region: 1 }).lean(),
    ]);
    const regionOf = new Map(subs.map((s) => [s.code, s.region]));
    return rankBlindSpots(
      liveFeeders.map((f) => this.toFeederStat(f, counts.get(f.code))),
      (code) => regionOf.get(code),
    );
  }

  async deadSubstations(): Promise<DeadSubstation[]> {
    const subs = await this.db.substations.find({ dead: true }).lean();
    return subs
      .map((s) => ({ code: s.code, feeders: s.feederCount, premises: s.deadPremises }))
      .sort((a, b) => b.premises - a.premises || b.feeders - a.feeders || a.code.localeCompare(b.code));
  }

  /** Known (enrolled) EVs on a feeder — used for the {neighbours_enrolled} merge field. */
  async knownOnFeeder(feederCode: string): Promise<number> {
    return this.db.enrollments.countDocuments({ feederCode, status: 'ACTIVE' });
  }
}

import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  PROGRAM,
  type ActiveDrEventRef,
  type DrEvent,
  type DrEventForCustomer,
  type DrEventResultMe,
  type DrResponse,
} from '@demo/shared';
import { Db } from '../db/db.service.js';
import type { DrEventDoc } from '../db/schemas.js';
import { CampaignStatsService } from '../campaigns/campaign-stats.service.js';
import { EnergyService } from '../energy/energy.service.js';
import { kwhShifted as kwhShiftedPerHousehold, peakReducedKwPerHousehold, peakReducedMw } from './dr-result.js';
import { round3 } from '../common/numbers.js';
import { EV_CHARGE_KW } from '../energy/energy.model.js';
import { LiveEventsService } from '../live-events/live-events.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

@Injectable()
export class DrEventsService {
  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimeService,
    private readonly energy: EnergyService,
    private readonly messages: MessagesService,
    private readonly stats: CampaignStatsService,
    private readonly liveEvents: LiveEventsService,
  ) {}

  static toDto(e: DrEventDoc): DrEvent {
    return {
      id: String(e._id),
      feederCode: e.feederCode,
      title: e.title,
      windowStart: e.windowStart.toISOString(),
      windowEnd: e.windowEnd.toISOString(),
      status: e.status,
      campaignId: String(e.campaignId),
    };
  }

  async create(input: { feederCode: string; title: string; start: Date; end: Date; campaignId: Types.ObjectId; targets: Types.ObjectId[] }) {
    return this.db.drEvents.create({
      feederCode: input.feederCode,
      title: input.title,
      windowStart: input.start,
      windowEnd: input.end,
      plannedHours: (input.end.getTime() - input.start.getTime()) / 3600000,
      status: 'SCHEDULED',
      campaignId: input.campaignId,
      targetCustomerIds: input.targets,
    });
  }

  private async load(id: string): Promise<DrEventDoc> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('DR event not found');
    const e = await this.db.drEvents.findById(id).lean();
    if (!e) throw new NotFoundException('DR event not found');
    return e;
  }

  private assertTarget(e: DrEventDoc, customerId: string) {
    if (!e.targetCustomerIds.some((t) => String(t) === customerId)) throw new ForbiddenException('You are not part of this event');
  }

  private async myResponse(e: DrEventDoc, customerId: string): Promise<DrResponse | null> {
    const r = await this.db.responses.findOne({ drEventId: e._id, customerId: new Types.ObjectId(customerId) }).lean();
    return r?.response ?? null;
  }

  async forCustomer(customerId: string, id: string): Promise<DrEventForCustomer> {
    const e = await this.load(id);
    this.assertTarget(e, customerId);
    await this.messages.openForDrEvent(customerId, e._id);
    const c = await this.energy.customer(customerId);
    const ev = await this.energy.evState(c);
    return {
      event: DrEventsService.toDto(e),
      myResponse: await this.myResponse(e, customerId),
      currentEvKw: ev.charging ? EV_CHARGE_KW : 0,
      earnText: PROGRAM.perEventIncentive,
    };
  }

  /** Upsert a response; used by the app and by the synthetic-response simulator. */
  async recordResponse(e: DrEventDoc, customerId: Types.ObjectId, response: DrResponse, synthetic: boolean): Promise<void> {
    await this.db.responses.updateOne(
      { drEventId: e._id, customerId },
      { $set: { response, respondedAt: new Date(), synthetic }, $setOnInsert: { kwhShifted: null, peakReducedKw: null, earned: null } },
      { upsert: true },
    );
    const m = await this.db.messages.findOne({ customerId, drEventId: e._id }).lean();
    if (m) await this.messages.applyAction(m, 'RESPONDED');
    else await this.stats.recompute(e.campaignId);
  }

  async respond(customerId: string, id: string, response: DrResponse): Promise<DrEventForCustomer> {
    const e = await this.load(id);
    this.assertTarget(e, customerId);
    if (e.status === 'ENDED') throw new ConflictException('This event has already ended');
    await this.recordResponse(e, new Types.ObjectId(customerId), response, false);
    this.realtime.toCustomer(customerId, 'me:changed');
    return this.forCustomer(customerId, id);
  }

  private broadcast(e: DrEventDoc) {
    const dto = DrEventsService.toDto(e);
    this.realtime.toStaff('drEvent:statusChanged', dto);
    for (const t of e.targetCustomerIds) {
      const cid = String(t);
      if (this.realtime.isOnline(cid)) {
        this.realtime.toCustomer(cid, 'drEvent:statusChanged', dto);
        this.realtime.toCustomer(cid, 'me:changed');
      }
    }
  }

  async start(id: string): Promise<DrEvent> {
    const e = await this.load(id);
    if (e.status === 'ENDED') throw new ConflictException('Event already ended');
    const now = new Date();
    const dur = e.windowEnd.getTime() - e.windowStart.getTime();
    const set = { status: 'ACTIVE' as const, windowStart: now, windowEnd: new Date(now.getTime() + dur) };
    await this.db.drEvents.updateOne({ _id: e._id }, { $set: set });
    const updated = { ...e, ...set };
    this.broadcast(updated);
    return DrEventsService.toDto(updated);
  }

  async end(id: string): Promise<DrEvent> {
    const e = await this.load(id);
    if (e.status === 'ENDED') return DrEventsService.toDto(e);
    const now = new Date();
    // "End event now" fast-forwards the demo: the event is treated as having run its full planned
    // window, so the result screen, chart labels and kWh shifted all describe the same window.
    const start = e.status === 'SCHEDULED' && e.windowStart.getTime() > now.getTime() ? now : e.windowStart;
    const set = { status: 'ENDED' as const, windowStart: start, windowEnd: new Date(start.getTime() + (e.plannedHours || 3) * 3600000) };
    await this.db.drEvents.updateOne({ _id: e._id }, { $set: set });
    const updated = { ...e, ...set } as DrEventDoc;

    // Per-household results: a paused EV shifts its planned charging out of the window.
    const kwhShifted = kwhShiftedPerHousehold(e.plannedHours);
    await this.db.responses.updateMany(
      { drEventId: e._id, response: 'PAUSE' },
      { $set: { kwhShifted, peakReducedKw: peakReducedKwPerHousehold, earned: PROGRAM.perEventIncentive } },
    );
    await this.db.responses.updateMany(
      { drEventId: e._id, response: { $ne: 'PAUSE' } },
      { $set: { kwhShifted: 0, peakReducedKw: 0, earned: null } },
    );
    const paused = await this.db.responses.countDocuments({ drEventId: e._id, response: 'PAUSE' });
    await this.stats.recompute(e.campaignId);
    this.broadcast(updated);
    const sub = e.feederCode.replace(/-F\d+$/, '');
    await this.liveEvents.create({
      kind: 'DR_EVENT_ENDED',
      substationCode: sub,
      feederCode: e.feederCode,
      headline: `DR event ended on ${e.feederCode}`,
      summary: `${paused} homes paused charging · peak cut by ${peakReducedMw(paused)} MW`,
      count: paused,
      unenrolledCount: null,
      enrolledCount: e.targetCustomerIds.length,
      actionTaken: null,
      suggested: null,
    });
    return DrEventsService.toDto(updated);
  }

  async resultMe(customerId: string, id: string): Promise<DrEventResultMe> {
    const e = await this.load(id);
    this.assertTarget(e, customerId);
    if (e.status !== 'ENDED') throw new ConflictException('Results are available after the event ends');
    const r = await this.db.responses.findOne({ drEventId: e._id, customerId: new Types.ObjectId(customerId) }).lean();
    const paused = await this.db.responses.countDocuments({ drEventId: e._id, response: 'PAUSE' });
    const c = await this.energy.customer(customerId);
    // Chart the planned window so the shape reads clearly even when the demo ends the event early.
    const plannedEnd = new Date(e.windowStart.getTime() + (e.plannedHours || 3) * 3600000);
    return {
      event: DrEventsService.toDto(e),
      myResponse: r?.response ?? null,
      earnedText: r?.response === 'PAUSE' ? PROGRAM.perEventIncentive : null,
      kwhShifted: r?.kwhShifted ?? 0,
      peakReducedKw: r?.peakReducedKw ?? 0,
      series: this.energy.seriesAround(c, e.windowStart, plannedEnd, r?.response === 'PAUSE'),
      feederHouseholdsPaused: paused,
      feederPeakReducedMw: round3((paused * EV_CHARGE_KW) / 1000),
    };
  }

  /** The event a customer should see on Home: not ended, or ended within the last 2 hours. */
  async activeForCustomer(customerId: string): Promise<ActiveDrEventRef | null> {
    const cid = new Types.ObjectId(customerId);
    const cutoff = new Date(Date.now() - 2 * 3600000);
    const e = await this.db.drEvents
      .findOne({ targetCustomerIds: cid, $or: [{ status: { $ne: 'ENDED' } }, { windowEnd: { $gte: cutoff } }] })
      .sort({ _id: -1 })
      .lean();
    if (!e) return null;
    return {
      id: String(e._id),
      title: e.title,
      windowStart: e.windowStart.toISOString(),
      windowEnd: e.windowEnd.toISOString(),
      status: e.status,
      myResponse: await this.myResponse(e, customerId),
    };
  }

  async latestOpen(): Promise<DrEvent | null> {
    const e = await this.db.drEvents.findOne({ status: { $ne: 'ENDED' } }).sort({ _id: -1 }).lean();
    return e ? DrEventsService.toDto(e) : null;
  }

  async list(): Promise<DrEvent[]> {
    const es = await this.db.drEvents.find().sort({ _id: -1 }).limit(50).lean();
    return es.map((e) => DrEventsService.toDto(e));
  }

  async loadDoc(id: Types.ObjectId): Promise<DrEventDoc | null> {
    return this.db.drEvents.findById(id).lean();
  }
}

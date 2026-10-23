import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PROGRAM, fmtWindow, type LiveEvent } from '@demo/shared';
import { Db } from '../db/db.service.js';
import type { CustomerDoc } from '../db/schemas.js';
import { prng } from '../common/numbers.js';
import { addMinutes, fmtClockRange, nextEventWindow } from '../common/time.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { LiveEventsService } from '../live-events/live-events.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { EvDetectionSource } from './ev-detection-source.js';

const CLUSTER_TOTAL = 284;
const CLUSTER_UNENROLLED = 118;

@Injectable()
export class SimService {
  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimeService,
    private readonly source: EvDetectionSource,
    private readonly enrollments: EnrollmentsService,
    private readonly messages: MessagesService,
    private readonly liveEvents: LiveEventsService,
  ) {}

  private async customer(id: string): Promise<CustomerDoc> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid customerId');
    const c = await this.db.customers.findById(id).lean();
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }

  /** Flow A: Net2Grid detects an EV charging at this customer's home. */
  async evDetected(customerId: string): Promise<LiveEvent> {
    const c = await this.customer(customerId);
    await this.source.detect(c);
    await this.db.customers.updateOne({ _id: c._id }, { $set: { evChargingActive: true } });
    const enrolled = await this.enrollments.isEnrolled(c._id);
    const street = c.address.split(',')[0];
    if (!enrolled) {
      await this.messages.create(
        {
          customerId: c._id,
          kind: 'EV_DETECTED',
          category: 'Offers',
          tag: 'EV',
          title: 'We noticed an EV charging at your home',
          body: `Earn ${PROGRAM.signupIncentive} by joining ${PROGRAM.name}. Tap to learn more.`,
          cta: 'See program & enroll',
          campaignId: null,
          drEventId: null,
          route: '/program',
        },
        { popup: true },
      );
    } else {
      this.realtime.toCustomer(customerId, 'me:changed');
    }
    this.realtime.toStaff('feeder:statsChanged', { substationCode: c.substationCode, feederCode: c.feederCode });
    return this.liveEvents.create({
      kind: 'EV_DETECTED',
      substationCode: c.substationCode,
      feederCode: c.feederCode,
      headline: 'New EV detected',
      summary: `at ${street} (${c.feederCode}), ${enrolled ? 'already enrolled' : 'not enrolled'}`,
      count: 1,
      unenrolledCount: enrolled ? 0 : 1,
      enrolledCount: enrolled ? 1 : 0,
      actionTaken: enrolled ? null : 'Onboarding message sent in app automatically',
      suggested: null,
      customerIds: [c._id],
    });
  }

  /** Flow B: a cluster of EVs on a substation stops charging at the same time. */
  async stoppedChargingCluster(substationCode: string): Promise<LiveEvent> {
    const sub = await this.db.substations.findOne({ code: substationCode }).lean();
    if (!sub) throw new NotFoundException(`Substation ${substationCode} not found`);

    // Make sure the unenrolled demo customer on this substation is part of the cluster.
    const demo = await this.db.customers.findOne({ substationCode, demoRole: 'UNENROLLED_DEMO' }).lean();
    const chosen: Types.ObjectId[] = [];
    if (demo && !(await this.enrollments.isEnrolled(demo._id))) {
      const { isNew } = await this.source.detect(demo);
      if (isNew) this.realtime.toCustomer(String(demo._id), 'me:changed');
      chosen.push(demo._id);
    }
    const enrolledIds = (await this.db.enrollments.find({ substationCode, status: 'ACTIVE' }, { customerId: 1 }).lean()).map((e) => String(e.customerId));
    const enrolledSet = new Set(enrolledIds);
    const pool = (await this.db.detections.find({ substationCode, status: 'DETECTED' }, { customerId: 1 }).lean())
      .map((d) => d.customerId)
      .filter((id) => !enrolledSet.has(String(id)) && !chosen.some((x) => String(x) === String(id)));
    const rnd = prng(Date.now() & 0xffffffff);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    chosen.push(...pool.slice(0, Math.max(0, CLUSTER_UNENROLLED - chosen.length)));
    const now = new Date();
    const from = new Date(Math.floor(addMinutes(now, -12).getTime() / 300000) * 300000);
    const to = new Date(Math.ceil(addMinutes(now, 3).getTime() / 300000) * 300000);
    this.realtime.toStaff('feeder:statsChanged', { substationCode, feederCode: null });
    const le = await this.liveEvents.create({
      kind: 'STOPPED_CHARGING_CLUSTER',
      substationCode,
      feederCode: null,
      headline: `${CLUSTER_TOTAL} EVs stopped charging`,
      summary: `on ${substationCode} between ${fmtClockRange(from, to)} · ${chosen.length} not enrolled`,
      count: CLUSTER_TOTAL,
      unenrolledCount: chosen.length,
      enrolledCount: CLUSTER_TOTAL - chosen.length,
      actionTaken: null,
      suggested: null,
      customerIds: chosen,
    }, false);
    // Now that the id exists, attach the suggested action that targets this cluster.
    const suggested = {
      label: `Target ${chosen.length} with enrollment offer`,
      campaignType: 'ENROLL_OFFER' as const,
      audience: { kind: 'LIVE_EVENT' as const, liveEventId: le.id, segment: 'UNENROLLED_EV' as const },
    };
    await this.db.liveEvents.updateOne({ _id: new Types.ObjectId(le.id) }, { $set: { suggested } });
    const full = { ...le, suggested };
    this.liveEvents.emit(full);
    return full;
  }

  /** Flow C: load forecast on a feeder is close to its limit. */
  async feederForecastHigh(feederCode: string): Promise<LiveEvent> {
    const f = await this.db.feeders.findOne({ code: feederCode }).lean();
    if (!f) throw new NotFoundException(`Feeder ${feederCode} not found`);
    await this.db.feeders.updateOne({ code: feederCode }, { $set: { forecastLoadPct: 92 } });
    const enrolled = await this.db.enrollments.countDocuments({ feederCode, status: 'ACTIVE' });
    const w = nextEventWindow();
    this.realtime.toStaff('feeder:statsChanged', { substationCode: f.substationCode, feederCode });
    return this.liveEvents.create({
      kind: 'FEEDER_FORECAST_HIGH',
      substationCode: f.substationCode,
      feederCode,
      headline: `${feederCode} forecast at 92% of capacity`,
      summary: `, ${fmtWindow(w.start.toISOString(), w.end.toISOString())} · ${enrolled} enrolled EVs on this feeder`,
      count: enrolled,
      unenrolledCount: null,
      enrolledCount: enrolled,
      actionTaken: null,
      suggested: {
        label: 'Send stop-charging request',
        campaignType: 'STOP_CHARGING',
        audience: { kind: 'FEEDER', feederCode, segment: 'ENROLLED_EV' },
      },
    });
  }
}

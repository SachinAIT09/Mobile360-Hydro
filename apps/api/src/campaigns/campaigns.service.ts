import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  PROGRAM,
  fmtWindow,
  type AudiencePreview,
  type AudiencePreviewRequest,
  type Campaign,
  type CampaignAudience,
  type CampaignCreateRequest,
  type CampaignExclusions,
} from '@demo/shared';
import { Db } from '../db/db.service.js';
import type { CustomerDoc, MessageDoc } from '../db/schemas.js';
import { nextEventWindow } from '../common/time.js';
import { DrEventsService } from '../dr-events/dr-events.service.js';
import { LiveEventsService } from '../live-events/live-events.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { CampaignStatsService, emptyStats } from './campaign-stats.service.js';
import { mergeFields } from './merge.js';
import { planSimulation, seedFromId, SIMULATION_TICK_MS, SIMULATION_TICKS, type SimulationPlan } from './simulation-plan.js';
import { SimulationScheduler } from './simulation.scheduler.js';

const SEGMENT_LABEL = { UNENROLLED_EV: 'Detected, unenrolled EVs', ENROLLED_EV: 'Enrolled EVs (DR program)' } as const;

interface Resolved {
  targets: CustomerDoc[];
  before: number;
  excluded: AudiencePreview['excluded'];
  label: string;
  includesDemoCustomer: boolean;
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimeService,
    private readonly messages: MessagesService,
    private readonly stats: CampaignStatsService,
    private readonly drEvents: DrEventsService,
    private readonly liveEvents: LiveEventsService,
    private readonly scheduler: SimulationScheduler,
  ) {}

  // ------------------------------------------------------------ audience

  private async segmentFilter(customers: CustomerDoc[], segment: CampaignAudience['segment']): Promise<CustomerDoc[]> {
    const ids = customers.map((c) => c._id);
    const enrolled = new Set(
      (await this.db.enrollments.find({ customerId: { $in: ids }, status: 'ACTIVE' }, { customerId: 1 }).lean()).map((e) => String(e.customerId)),
    );
    if (segment === 'ENROLLED_EV') return customers.filter((c) => enrolled.has(String(c._id)));
    const detected = new Set(
      (await this.db.detections.find({ customerId: { $in: ids }, status: 'DETECTED' }, { customerId: 1 }).lean()).map((d) => String(d.customerId)),
    );
    return customers.filter((c) => detected.has(String(c._id)) && !enrolled.has(String(c._id)));
  }

  async resolve(audience: CampaignAudience, exclusions: CampaignExclusions): Promise<Resolved> {
    let pool: CustomerDoc[];
    let label: string;
    if (audience.kind === 'FEEDER') {
      if (!audience.feederCode) throw new BadRequestException('feederCode is required');
      pool = await this.db.customers.find({ feederCode: audience.feederCode }).lean();
      label = `${audience.feederCode} · ${SEGMENT_LABEL[audience.segment]}`;
    } else if (audience.kind === 'FEEDERS') {
      const codes = [...new Set(audience.feederCodes ?? [])];
      if (codes.length < 2) throw new BadRequestException('feederCodes needs at least 2 feeders');
      pool = await this.db.customers.find({ feederCode: { $in: codes } }).lean();
      const more = codes.length > 2 ? ` +${codes.length - 2}` : '';
      label = `${codes.slice(0, 2).join(', ')}${more} · ${SEGMENT_LABEL[audience.segment]}`;
    } else {
      if (!audience.liveEventId || !Types.ObjectId.isValid(audience.liveEventId)) throw new BadRequestException('liveEventId is required');
      const le = await this.db.liveEvents.findById(audience.liveEventId).lean();
      if (!le) throw new NotFoundException('Live event not found');
      pool = await this.db.customers.find({ _id: { $in: le.customerIds } }).lean();
      label = `${le.substationCode} stopped-charging cluster · ${SEGMENT_LABEL[audience.segment]}`;
    }
    const segment = await this.segmentFilter(pool, audience.segment);
    const excluded = { optedOut: 0, contactedLast7Days: 0, lifeSupport: 0 };
    let contacted = new Set<string>();
    if (exclusions.contactedLast7Days) {
      const since = new Date(Date.now() - 7 * 86400000);
      const recent = await this.db.messages
        .find({ customerId: { $in: segment.map((c) => c._id) }, campaignId: { $ne: null }, createdAt: { $gte: since } }, { customerId: 1 })
        .lean();
      contacted = new Set(recent.map((m) => String(m.customerId)));
    }
    const targets = segment.filter((c) => {
      if (exclusions.optedOut && c.optedOutOfMessages) { excluded.optedOut++; return false; }
      if (exclusions.lifeSupport && c.lifeSupport) { excluded.lifeSupport++; return false; }
      // Demo customers are never excluded for recent contact, so the demo can be repeated.
      if (exclusions.contactedLast7Days && !c.demoRole && contacted.has(String(c._id))) { excluded.contactedLast7Days++; return false; }
      return true;
    });
    return { targets, before: segment.length, excluded, label, includesDemoCustomer: targets.some((c) => !!c.demoRole) };
  }

  async preview(req: AudiencePreviewRequest): Promise<AudiencePreview> {
    const r = await this.resolve(req.audience, req.exclusions);
    return { count: r.targets.length, before: r.before, excluded: r.excluded, label: r.label, includesDemoCustomer: r.includesDemoCustomer };
  }

  // ------------------------------------------------------------ send

  async create(req: CampaignCreateRequest): Promise<Campaign> {
    let resolved: Resolved;
    if (req.testCustomerId) {
      if (!Types.ObjectId.isValid(req.testCustomerId)) throw new BadRequestException('Invalid testCustomerId');
      const c = await this.db.customers.findById(req.testCustomerId).lean();
      if (!c) throw new NotFoundException('Test customer not found');
      const base = await this.resolve(req.audience, req.exclusions).catch(() => null);
      resolved = { targets: [c], before: 1, excluded: { optedOut: 0, contactedLast7Days: 0, lifeSupport: 0 }, label: `Test send · ${base?.label ?? ''}`.trim(), includesDemoCustomer: !!c.demoRole };
    } else {
      resolved = await this.resolve(req.audience, req.exclusions);
    }
    if (!resolved.targets.length) throw new BadRequestException('This audience has no customers after exclusions');

    const now = new Date();
    const campaignId = new Types.ObjectId();
    const targets = resolved.targets;
    const feederForEvent =
      req.audience.kind === 'FEEDER' ? req.audience.feederCode : req.audience.kind === 'FEEDERS' ? req.audience.feederCodes[0] : targets[0].feederCode;

    // Merge-field values.
    const window = nextEventWindow(now);
    const windowText = fmtWindow(window.start.toISOString(), window.end.toISOString());
    const knownByFeeder = new Map<string, number>();
    for (const f of new Set(targets.map((t) => t.feederCode))) {
      knownByFeeder.set(f, await this.db.enrollments.countDocuments({ feederCode: f, status: 'ACTIVE' }));
    }
    const incentive = req.type === 'ENROLL_OFFER' ? PROGRAM.signupIncentive : PROGRAM.perEventIncentive;
    const merge = (text: string, c: CustomerDoc) =>
      mergeFields(text, { firstName: c.firstName, incentive, eventWindow: windowText, neighboursEnrolled: knownByFeeder.get(c.feederCode) ?? 0 });

    let drEventId: Types.ObjectId | null = null;
    if (req.type === 'STOP_CHARGING') {
      const generic = { firstName: 'there', feederCode: feederForEvent } as CustomerDoc;
      const ev = await this.drEvents.create({
        feederCode: feederForEvent,
        title: merge(req.title, generic),
        start: window.start,
        end: window.end,
        campaignId,
        targets: targets.map((t) => t._id),
      });
      drEventId = ev._id;
    }

    const isTest = !!req.testCustomerId;
    await this.db.campaigns.create({
      _id: campaignId,
      type: req.type,
      audience: req.audience,
      audienceLabel: resolved.label,
      exclusions: req.exclusions,
      title: req.title,
      body: req.body,
      cta: req.cta,
      channels: req.channels,
      status: 'SENT',
      isTest,
      sentAt: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + Math.max(1, req.schedule.expiresInHours) * 3600000),
      drEventId,
      stats: emptyStats(targets.length),
      demoMessageId: null,
      targetIds: targets.map((t) => t._id),
    });

    const common = (c: CustomerDoc) => ({
      customerId: c._id,
      kind: req.type,
      category: req.type === 'ENROLL_OFFER' ? ('Offers' as const) : ('Alerts' as const),
      tag: req.type === 'ENROLL_OFFER' ? 'Offer' : 'Grid alert',
      title: merge(req.title, c),
      body: merge(req.body, c),
      cta: req.cta,
      campaignId,
      drEventId,
    });

    // Real (demo) recipients get a pushed message; synthetic ones are bulk-inserted undelivered.
    let demoMessageId: string | null = null;
    const synthetic = targets.filter((t) => t.synthetic);
    for (const c of targets.filter((t) => !t.synthetic)) {
      const m = await this.messages.create({
        ...common(c),
        route: req.type === 'ENROLL_OFFER' ? '/messages/:id' : `/dr-events/${String(drEventId)}`,
      });
      demoMessageId = demoMessageId ?? m.id;
    }
    if (synthetic.length) {
      await this.db.messages.insertMany(
        synthetic.map((c) => {
          const _id = new Types.ObjectId();
          return {
            _id,
            ...common(c),
            route: req.type === 'ENROLL_OFFER' ? `/messages/${String(_id)}` : `/dr-events/${String(drEventId)}`,
            createdAt: now,
            deliveredAt: null,
            openedAt: null,
            actedAt: null,
            action: null,
            synthetic: true,
          } satisfies Partial<MessageDoc>;
        }),
      );
    }
    if (demoMessageId) await this.db.campaigns.updateOne({ _id: campaignId }, { $set: { demoMessageId: new Types.ObjectId(demoMessageId) } });

    const sub = feederForEvent.replace(/-F\d+$/, '');
    await this.liveEvents.create({
      kind: 'CAMPAIGN_SENT',
      substationCode: sub,
      feederCode: req.audience.kind === 'FEEDER' ? req.audience.feederCode : req.audience.kind === 'FEEDERS' ? req.audience.feederCodes[0] : null,
      headline: `${req.type === 'ENROLL_OFFER' ? 'Enrollment offer' : 'Stop-charging request'}${isTest ? ' test' : ''} sent`,
      summary: `to ${targets.length} customer${targets.length === 1 ? '' : 's'} · ${resolved.label}`,
      count: targets.length,
      unenrolledCount: req.type === 'ENROLL_OFFER' ? targets.length : null,
      enrolledCount: req.type === 'STOP_CHARGING' ? targets.length : null,
      actionTaken: 'Sent via Campaign 360',
      suggested: null,
    });

    const dto = await this.stats.recompute(campaignId);
    if (!isTest && synthetic.length) this.simulate(campaignId, req.type, synthetic, drEventId);
    return dto!;
  }

  // ------------------------------------------------------------ synthetic responses

  /** Plays out realistic delivery/open/response behaviour for synthetic recipients over ~25 s. */
  private simulate(campaignId: Types.ObjectId, type: CampaignCreateRequest['type'], targets: CustomerDoc[], drEventId: Types.ObjectId | null) {
    type Plan = SimulationPlan<CustomerDoc>;
    const plans = planSimulation(type, targets, seedFromId(String(campaignId)), SIMULATION_TICKS);

    for (let tick = 1; tick <= SIMULATION_TICKS; tick++) {
      this.scheduler.later(tick * SIMULATION_TICK_MS, async () => {
        const now = new Date();
        const ids = (sel: (p: Plan) => boolean) => plans.filter(sel).map((p) => p.c._id);
        const delivered = ids((p) => p.deliver === tick);
        const opened = ids((p) => p.open === tick);
        const acted = plans.filter((p) => p.act === tick);
        if (delivered.length) await this.db.messages.updateMany({ campaignId, customerId: { $in: delivered } }, { $set: { deliveredAt: now } });
        if (opened.length) await this.db.messages.updateMany({ campaignId, customerId: { $in: opened } }, { $set: { openedAt: now } });
        let enrolledAny = false;
        if (acted.length && type === 'ENROLL_OFFER') {
          const already = new Set(
            (await this.db.enrollments.find({ customerId: { $in: acted.map((p) => p.c._id) }, status: 'ACTIVE' }, { customerId: 1 }).lean()).map((e) => String(e.customerId)),
          );
          const fresh = acted.filter((p) => !already.has(String(p.c._id)));
          if (fresh.length) {
            const program = await this.db.programs.findOne().lean();
            await this.db.enrollments.insertMany(
              fresh.map((p) => ({
                customerId: p.c._id, programId: program?._id, feederCode: p.c.feederCode, substationCode: p.c.substationCode,
                enrolledAt: now, source: 'CAMPAIGN', evMake: null, chargerType: null, status: 'ACTIVE',
              })),
            );
            await this.db.messages.updateMany({ campaignId, customerId: { $in: fresh.map((p) => p.c._id) } }, { $set: { action: 'ENROLLED', actedAt: now } });
            enrolledAny = true;
            for (const f of new Set(fresh.map((p) => `${p.c.substationCode}|${p.c.feederCode}`))) {
              const [substationCode, feederCode] = f.split('|');
              this.realtime.toStaff('feeder:statsChanged', { substationCode, feederCode });
            }
          }
        }
        if (acted.length && type === 'STOP_CHARGING' && drEventId) {
          const ev = await this.drEvents.loadDoc(drEventId);
          if (ev && ev.status !== 'ENDED') {
            for (const p of acted) {
              await this.db.responses.updateOne(
                { drEventId, customerId: p.c._id },
                { $setOnInsert: { response: p.response ?? 'PAUSE', respondedAt: now, synthetic: true, kwhShifted: null, peakReducedKw: null, earned: null } },
                { upsert: true },
              );
            }
            await this.db.messages.updateMany({ campaignId, customerId: { $in: acted.map((p) => p.c._id) } }, { $set: { action: 'RESPONDED', actedAt: now } });
          }
        }
        if (delivered.length || opened.length || acted.length || enrolledAny) await this.stats.recompute(campaignId);
      });
    }
  }

  // ------------------------------------------------------------ read

  async list(): Promise<Campaign[]> {
    const cs = await this.db.campaigns.find().sort({ sentAt: -1 }).limit(100).lean();
    return cs.map((c) => CampaignStatsService.toDto(c));
  }

  async get(id: string): Promise<Campaign> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Campaign not found');
    const c = await this.db.campaigns.findById(id).lean();
    if (!c) throw new NotFoundException('Campaign not found');
    return CampaignStatsService.toDto(c);
  }
}

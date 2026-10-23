import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  PROGRAM,
  fmtWindow,
  type AudiencePreview,
  type AudiencePreviewRequest,
  type Campaign,
  type CampaignAudience,
  type CampaignCreateRequest,
  type CampaignDetail,
  type CampaignExclusions,
  type CampaignType,
  type CampaignVariantCopy,
  type VariantId,
} from '@demo/shared';
import { Db } from '../db/db.service.js';
import type { CampaignDoc, CustomerDoc, MessageDoc } from '../db/schemas.js';
import { fmtClock, nextEventWindow } from '../common/time.js';
import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { DrEventsService } from '../dr-events/dr-events.service.js';
import { LiveEventsService } from '../live-events/live-events.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { assignVariant, variantRateScale } from './ab.js';
import { audienceLabel, distinctFeeders } from './audience-label.js';
import { CampaignStatsService, emptyStats } from './campaign-stats.service.js';
import { mergeFields } from './merge.js';
import { validateSendAt } from './schedule.js';
import { planSimulation, seedFromId, SIMULATION_TICK_MS, SIMULATION_TICKS, type SimulationPlan } from './simulation-plan.js';
import { SimulationScheduler } from './simulation.scheduler.js';

interface Resolved {
  targets: CustomerDoc[];
  before: number;
  excluded: AudiencePreview['excluded'];
  label: string;
  includesDemoCustomer: boolean;
}

/** Thrown when a demo reset happens while a dispatch is in flight; the half-done work is abandoned. */
export class DispatchAborted extends Error {
  constructor() {
    super('Dispatch aborted by a demo reset');
  }
}

const NO_EXCLUSIONS = { optedOut: 0, contactedLast7Days: 0, lifeSupport: 0 };

/** Normalises the optional A/B copy into [A, B], or null when the campaign is not an A/B test. */
function normaliseVariants(v: CampaignCreateRequest['variants']): [CampaignVariantCopy, CampaignVariantCopy] | null {
  if (!v) return null;
  const a = v.find((x) => x.id === 'A');
  const b = v.find((x) => x.id === 'B');
  if (!a || !b) throw new BadRequestException('variants must contain one A and one B');
  return [{ id: 'A', title: a.title, body: a.body, cta: a.cta }, { id: 'B', title: b.title, body: b.body, cta: b.cta }];
}

const typeName = (t: CampaignType) => (t === 'ENROLL_OFFER' ? 'Enrollment offer' : 'Stop-charging request');
const plural = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;

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
    private readonly audit: AuditService,
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
      label = audienceLabel(audience);
    } else if (audience.kind === 'FEEDERS') {
      const codes = distinctFeeders(audience.feederCodes ?? []);
      if (codes.length < 2) throw new BadRequestException('feederCodes needs at least 2 different feeders');
      pool = await this.db.customers.find({ feederCode: { $in: codes } }).lean();
      label = audienceLabel(audience);
    } else {
      if (!audience.liveEventId || !Types.ObjectId.isValid(audience.liveEventId)) throw new BadRequestException('liveEventId is required');
      const le = await this.db.liveEvents.findById(audience.liveEventId).lean();
      if (!le) throw new NotFoundException('Live event not found');
      pool = await this.db.customers.find({ _id: { $in: le.customerIds } }).lean();
      label = audienceLabel(audience, le.substationCode);
    }
    const segment = await this.segmentFilter(pool, audience.segment);
    const excluded = { ...NO_EXCLUSIONS };
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

  // ------------------------------------------------------------ create: test / send now / schedule

  async create(req: CampaignCreateRequest, actor: AuditActor): Promise<Campaign> {
    const variants = normaliseVariants(req.variants);
    const now = new Date();

    // Test sends are always immediate and go to one demo customer.
    if (req.testCustomerId) {
      if (!req.schedule.sendNow) throw new BadRequestException('A test send is always sent now');
      if (!Types.ObjectId.isValid(req.testCustomerId)) throw new BadRequestException('Invalid testCustomerId');
      const c = await this.db.customers.findById(req.testCustomerId).lean();
      if (!c) throw new NotFoundException('Test customer not found');
      const base = await this.resolve(req.audience, req.exclusions).catch(() => null);
      const resolved: Resolved = {
        targets: [c], before: 1, excluded: { ...NO_EXCLUSIONS }, label: `Test send · ${base?.label ?? ''}`.trim(), includesDemoCustomer: !!c.demoRole,
      };
      const doc = this.prepare(req, variants, actor, now, { isTest: true, label: resolved.label });
      const dto = await this.deliver(doc, resolved);
      await this.audit.record(actor, 'CAMPAIGN_TEST_SENT', this.target(dto), `Test of "${dto.title}" sent to ${c.firstName} (${c.email})`);
      return dto;
    }

    if (req.schedule.sendNow) {
      const resolved = await this.resolve(req.audience, req.exclusions);
      if (!resolved.targets.length) throw new BadRequestException('This audience has no customers after exclusions');
      const doc = this.prepare(req, variants, actor, now, { isTest: false, label: resolved.label });
      const dto = await this.deliver(doc, resolved);
      await this.audit.record(
        actor,
        'CAMPAIGN_SENT',
        this.target(dto),
        `${typeName(dto.type)} sent to ${plural(dto.stats.targeted, 'customer')} · ${dto.audienceLabel}${variants ? ' · A/B test' : ''}`,
      );
      return dto;
    }

    // Scheduled: validate the time and the audience shape now; resolve who gets it at dispatch time.
    const when = validateSendAt(req.schedule.sendAt, now);
    if (!when.ok) throw new BadRequestException(when.error);
    const preview = await this.resolve(req.audience, req.exclusions);
    const doc = this.prepare(req, variants, actor, now, { isTest: false, label: preview.label, scheduledFor: when.at });
    await this.db.campaigns.create(doc);
    const dto = CampaignStatsService.toDto(doc);
    this.realtime.toStaff('campaign:statusChanged', dto);
    await this.audit.record(
      actor,
      'CAMPAIGN_SCHEDULED',
      this.target(dto),
      `${typeName(dto.type)} scheduled for ${fmtClock(when.at)} · ${dto.audienceLabel} (about ${plural(preview.targets.length, 'customer')} today)${variants ? ' · A/B test' : ''}`,
    );
    return dto;
  }

  /** Builds the campaign document (not yet saved). Scheduled campaigns keep sentAt = scheduledFor so lists sort by planned time. */
  private prepare(
    req: CampaignCreateRequest,
    variants: [CampaignVariantCopy, CampaignVariantCopy] | null,
    actor: AuditActor,
    now: Date,
    o: { isTest: boolean; label: string; scheduledFor?: Date },
  ): CampaignDoc {
    const copy = variants ? variants[0] : { title: req.title, body: req.body, cta: req.cta };
    const sendAt = o.scheduledFor ?? now;
    return {
      _id: new Types.ObjectId(),
      type: req.type,
      audience: req.audience,
      audienceLabel: o.label,
      exclusions: req.exclusions,
      title: copy.title,
      body: copy.body,
      cta: copy.cta,
      channels: req.channels,
      status: o.scheduledFor ? 'SCHEDULED' : 'SENDING',
      isTest: o.isTest,
      sentAt: sendAt,
      expiresAt: new Date(sendAt.getTime() + Math.max(1, req.schedule.expiresInHours) * 3600000),
      drEventId: null,
      stats: emptyStats(0),
      demoMessageId: null,
      targetIds: [],
      scheduledFor: o.scheduledFor ?? null,
      createdAt: now,
      createdBy: actor.kind === 'STAFF' ? { name: actor.name, email: actor.email ?? '' } : null,
      variants,
      variantStats: null,
      winner: null,
    };
  }

  private target(c: Pick<Campaign, 'id' | 'title'>) {
    return { kind: 'campaign' as const, id: c.id, label: c.title };
  }

  // ------------------------------------------------------------ dispatch / cancel

  /**
   * Sends a campaign that was claimed by the dispatcher (status SENDING) or is still SCHEDULED. The audience
   * and the DR window are resolved now. An empty audience cancels the campaign instead.
   * With `generation`, the work stops (DispatchAborted) if a demo reset happens meanwhile.
   */
  async dispatch(id: string, actor: AuditActor, generation?: number): Promise<Campaign> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Campaign not found');
    const doc = await this.db.campaigns.findById(id).lean();
    if (!doc) throw new NotFoundException('Campaign not found');
    if (doc.status !== 'SENDING' && doc.status !== 'SCHEDULED') throw new ConflictException(`Campaign is already ${doc.status.toLowerCase()}`);
    const check = () => {
      if (generation !== undefined && generation !== this.scheduler.generation) throw new DispatchAborted();
    };
    const resolved = await this.resolve(doc.audience, doc.exclusions);
    check();
    if (!resolved.targets.length) {
      await this.db.campaigns.updateOne({ _id: doc._id }, { $set: { status: 'CANCELLED' } });
      const dto = CampaignStatsService.toDto({ ...doc, status: 'CANCELLED' });
      this.realtime.toStaff('campaign:statusChanged', dto);
      await this.audit.record(actor, 'CAMPAIGN_CANCELLED', this.target(dto), `Not sent: the audience (${dto.audienceLabel}) was empty after exclusions at send time`);
      return dto;
    }
    return this.deliver(doc, { ...resolved, label: doc.audienceLabel || resolved.label }, check);
  }

  /** Cancels a SCHEDULED campaign; anything else is a 409. */
  async cancel(id: string, actor: AuditActor): Promise<Campaign> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Campaign not found');
    const doc = await this.db.campaigns
      .findOneAndUpdate({ _id: new Types.ObjectId(id), status: 'SCHEDULED' }, { $set: { status: 'CANCELLED' } }, { returnDocument: 'after' })
      .lean();
    if (!doc) {
      const existing = await this.db.campaigns.findById(id, { status: 1 }).lean();
      if (!existing) throw new NotFoundException('Campaign not found');
      throw new ConflictException(`Only scheduled campaigns can be cancelled (this one is ${String(existing.status).toLowerCase()})`);
    }
    const dto = CampaignStatsService.toDto(doc);
    this.realtime.toStaff('campaign:statusChanged', dto);
    await this.audit.record(actor, 'CAMPAIGN_CANCELLED', this.target(dto), `Cancelled before sending (was due ${fmtClock(doc.scheduledFor ?? doc.sentAt)})`);
    return dto;
  }

  // ------------------------------------------------------------ deliver

  /** Writes the DR event, messages and live event for a resolved audience, marks the campaign SENT and starts the simulation. */
  private async deliver(doc: CampaignDoc, resolved: Resolved, check: () => void = () => undefined): Promise<Campaign> {
    const now = new Date();
    const campaignId = doc._id;
    const cid = String(campaignId);
    const targets = resolved.targets;
    const a = doc.audience;
    const feederForEvent = a.kind === 'FEEDER' ? a.feederCode : a.kind === 'FEEDERS' ? a.feederCodes[0] : targets[0].feederCode;
    const eventFeeders = distinctFeeders([feederForEvent, ...targets.map((t) => t.feederCode)]);

    // Merge-field values.
    const window = nextEventWindow(now);
    const windowText = fmtWindow(window.start.toISOString(), window.end.toISOString());
    const knownByFeeder = new Map<string, number>();
    for (const f of new Set(targets.map((t) => t.feederCode))) {
      knownByFeeder.set(f, await this.db.enrollments.countDocuments({ feederCode: f, status: 'ACTIVE' }));
    }
    const incentive = doc.type === 'ENROLL_OFFER' ? PROGRAM.signupIncentive : PROGRAM.perEventIncentive;
    const merge = (text: string, c: Pick<CustomerDoc, 'firstName' | 'feederCode'>) =>
      mergeFields(text, { firstName: c.firstName, incentive, eventWindow: windowText, neighboursEnrolled: knownByFeeder.get(c.feederCode) ?? 0 });
    check();

    let drEventId: Types.ObjectId | null = null;
    if (doc.type === 'STOP_CHARGING') {
      const ev = await this.drEvents.create({
        feederCode: feederForEvent,
        feederCodes: eventFeeders,
        title: merge(doc.title, { firstName: 'there', feederCode: feederForEvent }),
        start: window.start,
        end: window.end,
        campaignId,
        targets: targets.map((t) => t._id),
      });
      drEventId = ev._id;
    }

    const expiresMs = Math.max(3600000, doc.expiresAt.getTime() - doc.sentAt.getTime());
    const sentFields = {
      status: 'SENT' as const,
      audienceLabel: resolved.label,
      sentAt: now,
      expiresAt: new Date(now.getTime() + expiresMs),
      drEventId,
      stats: emptyStats(targets.length),
      targetIds: targets.map((t) => t._id),
    };
    // Scheduled campaigns already exist (claimed by the dispatcher); immediate sends are saved here for the first time.
    if (await this.db.campaigns.exists({ _id: campaignId })) await this.db.campaigns.updateOne({ _id: campaignId }, { $set: sentFields });
    else await this.db.campaigns.create({ ...doc, ...sentFields });

    // Copy per recipient: A/B campaigns split synthetic customers 50/50 (demo customers always get A).
    const copies: Record<VariantId, CampaignVariantCopy> = doc.variants?.length
      ? { A: doc.variants[0], B: doc.variants[1] ?? doc.variants[0] }
      : { A: { id: 'A', title: doc.title, body: doc.body, cta: doc.cta }, B: { id: 'B', title: doc.title, body: doc.body, cta: doc.cta } };
    const variantOf = (c: CustomerDoc): VariantId | null =>
      doc.variants?.length ? assignVariant(cid, String(c._id), !c.synthetic || !!c.demoRole) : null;
    const common = (c: CustomerDoc) => {
      const v = variantOf(c);
      const copy = copies[v ?? 'A'];
      return {
        customerId: c._id,
        kind: doc.type,
        category: doc.type === 'ENROLL_OFFER' ? ('Offers' as const) : ('Alerts' as const),
        tag: doc.type === 'ENROLL_OFFER' ? 'Offer' : 'Grid alert',
        title: merge(copy.title, c),
        body: merge(copy.body, c),
        cta: copy.cta,
        campaignId,
        drEventId,
        variant: v,
      };
    };
    check();

    // Real (demo) recipients get a pushed message; synthetic ones are bulk-inserted undelivered.
    let demoMessageId: string | null = null;
    const synthetic = targets.filter((t) => t.synthetic);
    for (const c of targets.filter((t) => !t.synthetic)) {
      const m = await this.messages.create({
        ...common(c),
        route: doc.type === 'ENROLL_OFFER' ? '/messages/:id' : `/dr-events/${String(drEventId)}`,
      });
      demoMessageId = demoMessageId ?? m.id;
    }
    if (synthetic.length) {
      await this.db.messages.insertMany(
        synthetic.map((c) => {
          const mid = new Types.ObjectId();
          return {
            _id: mid,
            ...common(c),
            route: doc.type === 'ENROLL_OFFER' ? `/messages/${String(mid)}` : `/dr-events/${String(drEventId)}`,
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
      feederCode: a.kind === 'FEEDER' ? a.feederCode : a.kind === 'FEEDERS' ? a.feederCodes[0] : null,
      headline: `${typeName(doc.type)}${doc.isTest ? ' test' : ''} sent`,
      summary: `to ${plural(targets.length, 'customer')} · ${resolved.label}`,
      count: targets.length,
      unenrolledCount: doc.type === 'ENROLL_OFFER' ? targets.length : null,
      enrolledCount: doc.type === 'STOP_CHARGING' ? targets.length : null,
      actionTaken: doc.scheduledFor ? 'Scheduled send via Campaign 360' : 'Sent via Campaign 360',
      suggested: null,
    });

    const dto = (await this.stats.recompute(campaignId))!;
    this.realtime.toStaff('campaign:statusChanged', dto);
    check();
    if (!doc.isTest && synthetic.length) this.simulate(campaignId, doc.type, synthetic, drEventId, variantOf);
    return dto;
  }

  // ------------------------------------------------------------ synthetic responses

  /** Plays out realistic delivery/open/response behaviour for synthetic recipients over ~25 s (variant B at its synthetic rate scale). */
  private simulate(
    campaignId: Types.ObjectId,
    type: CampaignType,
    targets: CustomerDoc[],
    drEventId: Types.ObjectId | null,
    variantOf: (c: CustomerDoc) => VariantId | null,
  ) {
    type Plan = SimulationPlan<CustomerDoc>;
    const cid = String(campaignId);
    const seed = seedFromId(cid);
    const groupB = targets.filter((t) => variantOf(t) === 'B');
    const groupA = groupB.length ? targets.filter((t) => variantOf(t) !== 'B') : targets;
    const plans: Plan[] = [
      ...planSimulation(type, groupA, seed, SIMULATION_TICKS),
      ...(groupB.length ? planSimulation(type, groupB, (seed + 0x9e3779b9) >>> 0, SIMULATION_TICKS, variantRateScale(cid, 'B')) : []),
    ];

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

  /** Campaign + DR event + audit trail + timeline (created, scheduled, sent, first delivered/opened/acted, DR start/end, cancelled). */
  async detail(id: string): Promise<CampaignDetail> {
    const campaign = await this.get(id);
    const oid = new Types.ObjectId(id);
    const drEvent = await this.drEvents.getDto(campaign.drEventId);
    const audit = await this.audit.forTarget(...[id, campaign.drEventId].filter((x): x is string => !!x));
    const [firsts] = await this.db.messages.aggregate<{ delivered: Date | null; opened: Date | null; acted: Date | null }>([
      { $match: { campaignId: oid } },
      { $group: { _id: null, delivered: { $min: '$deliveredAt' }, opened: { $min: '$openedAt' }, acted: { $min: '$actedAt' } } },
    ]);

    const by = campaign.createdBy ? ` by ${campaign.createdBy.name}` : '';
    const timeline: CampaignDetail['timeline'] = [{ at: campaign.createdAt, label: `Created${by}` }];
    if (campaign.scheduledFor) timeline.push({ at: campaign.scheduledFor, label: campaign.status === 'SCHEDULED' ? 'Scheduled to send' : 'Scheduled send time' });
    if (campaign.status === 'SENT') {
      timeline.push({ at: campaign.sentAt, label: `Sent to ${plural(campaign.stats.targeted, 'customer')}` });
      if (firsts?.delivered) timeline.push({ at: firsts.delivered.toISOString(), label: 'First delivered' });
      if (firsts?.opened) timeline.push({ at: firsts.opened.toISOString(), label: 'First opened' });
      if (firsts?.acted) timeline.push({ at: firsts.acted.toISOString(), label: campaign.type === 'ENROLL_OFFER' ? 'First enrollment' : 'First response' });
    }
    for (const e of audit) {
      if (e.action === 'DR_STARTED') timeline.push({ at: e.at, label: 'DR event started' });
      if (e.action === 'DR_ENDED') timeline.push({ at: e.at, label: 'DR event ended' });
      if (e.action === 'CAMPAIGN_CANCELLED') timeline.push({ at: e.at, label: `Cancelled by ${e.actor.name}` });
    }
    timeline.sort((x, y) => x.at.localeCompare(y.at));
    return { campaign, drEvent, audit, timeline };
  }
}

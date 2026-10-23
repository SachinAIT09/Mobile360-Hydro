import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Types } from 'mongoose';
import { AuditService, SCHEDULER_ACTOR } from '../audit/audit.service.js';
import { Db } from '../db/db.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { CampaignStatsService } from './campaign-stats.service.js';
import { CampaignsService, DispatchAborted } from './campaigns.service.js';
import { SimulationScheduler } from './simulation.scheduler.js';

/** How often due SCHEDULED campaigns are polled for. */
export const DISPATCH_POLL_MS = 5000;
/** Failed dispatches are retried a minute later, at most this many times, then cancelled. */
export const DISPATCH_MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 60_000;

/**
 * Sends SCHEDULED campaigns when they fall due. Mongo-backed (state lives on the campaign docs): each due
 * row is claimed atomically (SCHEDULED → SENDING) so two ticks or two servers never send it twice. A demo
 * reset drops the rows; a dispatch in flight during a reset is abandoned (generation check).
 */
@Injectable()
export class CampaignDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('CampaignDispatcher');
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** Failed attempts per campaign id (in memory; a restart simply allows fresh retries). */
  private readonly attempts = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly campaigns: CampaignsService,
    private readonly scheduler: SimulationScheduler,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runOnce(), DISPATCH_POLL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One poll, skipped while the previous one is still running. */
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick();
    } catch (e) {
      this.log.warn(`dispatch tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Claim and dispatch every due SCHEDULED campaign. */
  async tick(): Promise<void> {
    const generation = this.scheduler.generation;
    for (;;) {
      if (generation !== this.scheduler.generation) return;
      const claimed = await this.db.campaigns
        .findOneAndUpdate(
          { status: 'SCHEDULED', scheduledFor: { $lte: new Date() } },
          { $set: { status: 'SENDING' } },
          { returnDocument: 'after', sort: { scheduledFor: 1 } },
        )
        .lean();
      if (!claimed) return;
      if (generation !== this.scheduler.generation) return;
      this.realtime.toStaff('campaign:statusChanged', CampaignStatsService.toDto(claimed));
      await this.dispatchOne(claimed._id, claimed.title, generation);
    }
  }

  private async dispatchOne(id: Types.ObjectId, title: string, generation: number) {
    const key = String(id);
    try {
      const c = await this.campaigns.dispatch(key, SCHEDULER_ACTOR, generation);
      this.attempts.delete(key);
      if (generation !== this.scheduler.generation) return;
      if (c.status === 'SENT') {
        await this.audit.record(
          SCHEDULER_ACTOR,
          'CAMPAIGN_DISPATCHED',
          { kind: 'campaign', id: key, label: c.title },
          `Scheduled send went out to ${c.stats.targeted.toLocaleString('en-US')} customer${c.stats.targeted === 1 ? '' : 's'} · ${c.audienceLabel}`,
        );
      }
    } catch (e) {
      if (e instanceof DispatchAborted || generation !== this.scheduler.generation) return;
      const n = (this.attempts.get(key) ?? 0) + 1;
      this.attempts.set(key, n);
      this.log.warn(`dispatch of ${key} failed (attempt ${n}): ${(e as Error).message}`);
      if (n >= DISPATCH_MAX_ATTEMPTS) {
        this.attempts.delete(key);
        const doc = await this.db.campaigns.findOneAndUpdate({ _id: id, status: 'SENDING' }, { $set: { status: 'CANCELLED' } }, { returnDocument: 'after' }).lean();
        if (doc) {
          this.realtime.toStaff('campaign:statusChanged', CampaignStatsService.toDto(doc));
          await this.audit.record(SCHEDULER_ACTOR, 'CAMPAIGN_CANCELLED', { kind: 'campaign', id: key, label: title }, `Cancelled after ${n} failed send attempts`);
        }
      } else {
        const doc = await this.db.campaigns
          .findOneAndUpdate({ _id: id, status: 'SENDING' }, { $set: { status: 'SCHEDULED', scheduledFor: new Date(Date.now() + RETRY_DELAY_MS) } }, { returnDocument: 'after' })
          .lean();
        if (doc) this.realtime.toStaff('campaign:statusChanged', CampaignStatsService.toDto(doc));
      }
    }
  }
}

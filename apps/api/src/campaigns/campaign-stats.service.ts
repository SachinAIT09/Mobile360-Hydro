import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type { Campaign, CampaignStats } from '@demo/shared';
import { Db } from '../db/db.service.js';
import type { CampaignDoc } from '../db/schemas.js';
import { round3 } from '../common/numbers.js';
import { EV_CHARGE_KW } from '../energy/energy.model.js';
import { RealtimeService } from '../realtime/realtime.service.js';

export const emptyStats = (targeted = 0): CampaignStats => ({
  targeted, sent: targeted, delivered: 0, opened: 0, acted: 0, paused: 0, optedOut: 0, declined: 0, peakReducedMw: 0,
});

/** Recomputes campaign stats from messages / responses and broadcasts them to staff. */
@Injectable()
export class CampaignStatsService {
  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimeService,
  ) {}

  static toDto(c: CampaignDoc): Campaign {
    return {
      id: String(c._id),
      type: c.type,
      audience: c.audience,
      audienceLabel: c.audienceLabel,
      exclusions: c.exclusions,
      title: c.title,
      body: c.body,
      cta: c.cta,
      channels: c.channels,
      status: c.status ?? 'SENT',
      isTest: c.isTest,
      sentAt: c.sentAt.toISOString(),
      expiresAt: c.expiresAt.toISOString(),
      drEventId: c.drEventId ? String(c.drEventId) : null,
      stats: c.stats,
      demoMessageId: c.demoMessageId ? String(c.demoMessageId) : null,
      scheduledFor: c.scheduledFor ? c.scheduledFor.toISOString() : null,
      createdAt: (c.createdAt ?? c.sentAt).toISOString(),
      createdBy: c.createdBy ?? null,
      variants: c.variants ?? null,
      variantStats: c.variantStats ?? null,
      winner: c.winner ?? null,
    };
  }

  async recompute(campaignId: Types.ObjectId | string, emit = true): Promise<Campaign | null> {
    const id = new Types.ObjectId(String(campaignId));
    const c = await this.db.campaigns.findById(id).lean();
    if (!c) return null;
    const msgs = await this.db.messages.find({ campaignId: id }, { deliveredAt: 1, openedAt: 1, action: 1 }).lean();
    const stats = emptyStats(c.targetIds.length);
    stats.delivered = msgs.filter((m) => m.deliveredAt).length;
    stats.opened = msgs.filter((m) => m.openedAt).length;
    stats.declined = msgs.filter((m) => m.action === 'DECLINED').length;
    if (c.type === 'ENROLL_OFFER') {
      stats.acted = msgs.filter((m) => m.action === 'ENROLLED').length;
    } else if (c.drEventId) {
      const rs = await this.db.responses.find({ drEventId: c.drEventId }, { response: 1 }).lean();
      stats.acted = rs.length;
      stats.paused = rs.filter((r) => r.response === 'PAUSE').length;
      stats.optedOut = rs.filter((r) => r.response === 'OPT_OUT').length;
      stats.peakReducedMw = round3((stats.paused * EV_CHARGE_KW) / 1000);
    }
    await this.db.campaigns.updateOne({ _id: id }, { $set: { stats } });
    const dto = CampaignStatsService.toDto({ ...c, stats });
    if (emit) this.realtime.toStaff('campaign:statsChanged', dto);
    return dto;
  }
}

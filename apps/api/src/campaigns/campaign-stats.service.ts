import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type { Campaign, CampaignStats, CampaignType, VariantId } from '@demo/shared';
import { Db } from '../db/db.service.js';
import type { CampaignDoc, MessageDoc, EventResponseDoc } from '../db/schemas.js';
import { round3 } from '../common/numbers.js';
import { EV_CHARGE_KW } from '../energy/energy.model.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { pickWinner } from './ab.js';

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
    const msgs = await this.db.messages.find({ campaignId: id }, { customerId: 1, deliveredAt: 1, openedAt: 1, action: 1, variant: 1 }).lean();
    const rs =
      c.type === 'STOP_CHARGING' && c.drEventId
        ? await this.db.responses.find({ drEventId: c.drEventId }, { customerId: 1, response: 1 }).lean()
        : null;
    const stats = tally(c.type, c.targetIds.length, msgs, rs);

    let variantStats: CampaignDoc['variantStats'] = null;
    let winner: CampaignDoc['winner'] = null;
    if (c.variants?.length) {
      const variantOf = new Map(msgs.map((m) => [String(m.customerId), m.variant ?? 'A']));
      const pick = (v: VariantId) => {
        const vm = msgs.filter((m) => (m.variant ?? 'A') === v);
        const vr = rs ? rs.filter((r) => (variantOf.get(String(r.customerId)) ?? 'A') === v) : null;
        return tally(c.type, vm.length, vm, vr);
      };
      variantStats = { A: pick('A'), B: pick('B') };
      winner = pickWinner(c.type, variantStats);
    }
    await this.db.campaigns.updateOne({ _id: id }, { $set: { stats, variantStats, winner } });
    const dto = CampaignStatsService.toDto({ ...c, stats, variantStats, winner });
    if (emit) this.realtime.toStaff('campaign:statsChanged', dto);
    return dto;
  }
}

type MsgRow = Pick<MessageDoc, 'deliveredAt' | 'openedAt' | 'action'>;
type ResponseRow = Pick<EventResponseDoc, 'response'>;

/** Stats for one set of messages (and, for DR, the matching responses). */
export function tally(type: CampaignType, targeted: number, msgs: readonly MsgRow[], responses: readonly ResponseRow[] | null): CampaignStats {
  const stats = emptyStats(targeted);
  stats.delivered = msgs.filter((m) => m.deliveredAt).length;
  stats.opened = msgs.filter((m) => m.openedAt).length;
  stats.declined = msgs.filter((m) => m.action === 'DECLINED').length;
  if (type === 'ENROLL_OFFER') {
    stats.acted = msgs.filter((m) => m.action === 'ENROLLED').length;
  } else if (responses) {
    stats.acted = responses.length;
    stats.paused = responses.filter((r) => r.response === 'PAUSE').length;
    stats.optedOut = responses.filter((r) => r.response === 'OPT_OUT').length;
    stats.peakReducedMw = round3((stats.paused * EV_CHARGE_KW) / 1000);
  }
  return stats;
}

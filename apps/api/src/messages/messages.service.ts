import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { Message, MessageAction } from '@demo/shared';
import { Db } from '../db/db.service.js';
import type { MessageDoc } from '../db/schemas.js';
import { CampaignStatsService } from '../campaigns/campaign-stats.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

export type NewMessage = Omit<MessageDoc, '_id' | 'createdAt' | 'deliveredAt' | 'openedAt' | 'actedAt' | 'action' | 'synthetic' | 'route' | 'variant'> & {
  route?: string;
  /** A/B variant; defaults to null. */
  variant?: MessageDoc['variant'];
  synthetic?: boolean;
  delivered?: boolean;
};

@Injectable()
export class MessagesService {
  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimeService,
    private readonly stats: CampaignStatsService,
  ) {}

  static toDto(m: MessageDoc): Message {
    return {
      id: String(m._id),
      customerId: String(m.customerId),
      kind: m.kind,
      category: m.category,
      tag: m.tag,
      title: m.title,
      body: m.body,
      cta: m.cta ?? null,
      campaignId: m.campaignId ? String(m.campaignId) : null,
      drEventId: m.drEventId ? String(m.drEventId) : null,
      route: m.route,
      createdAt: m.createdAt.toISOString(),
      openedAt: m.openedAt ? m.openedAt.toISOString() : null,
      actedAt: m.actedAt ? m.actedAt.toISOString() : null,
      action: m.action ?? null,
      variant: m.variant ?? null,
    };
  }

  /**
   * Create a message. Non-synthetic recipients get it pushed over the socket right away.
   * `route` may contain ":id" which is replaced by the new message id.
   */
  async create(m: NewMessage, opts: { push?: boolean; popup?: boolean } = {}): Promise<Message> {
    const _id = new Types.ObjectId();
    const now = new Date();
    const route = (m.route ?? `/messages/:id`).replace(':id', String(_id));
    const { delivered, ...rest } = m;
    const doc = await this.db.messages.create({
      ...rest,
      _id,
      route,
      createdAt: now,
      deliveredAt: delivered === false ? null : now,
      openedAt: null,
      actedAt: null,
      action: null,
      synthetic: m.synthetic ?? false,
    });
    const dto = MessagesService.toDto(doc.toObject());
    if (opts.push !== false && !m.synthetic) {
      const cid = String(m.customerId);
      this.realtime.toCustomer(cid, 'message:new', dto);
      if (opts.popup) this.realtime.toCustomer(cid, 'message:popup', dto);
      this.realtime.toCustomer(cid, 'me:changed');
    }
    return dto;
  }

  async list(customerId: string): Promise<Message[]> {
    const docs = await this.db.messages.find({ customerId: new Types.ObjectId(customerId) }).sort({ createdAt: -1 }).lean();
    return docs.map((d) => MessagesService.toDto(d));
  }

  private async own(customerId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Message not found');
    const m = await this.db.messages.findOne({ _id: new Types.ObjectId(id), customerId: new Types.ObjectId(customerId) }).lean();
    if (!m) throw new NotFoundException('Message not found');
    return m;
  }

  /** Reading a message marks it opened (first time) and updates its campaign's stats. */
  async open(customerId: string, id: string): Promise<Message> {
    const m = await this.own(customerId, id);
    if (!m.openedAt) {
      const openedAt = new Date();
      await this.db.messages.updateOne({ _id: m._id }, { $set: { openedAt, deliveredAt: m.deliveredAt ?? openedAt } });
      m.openedAt = openedAt;
      if (m.campaignId) await this.stats.recompute(m.campaignId);
      this.realtime.toCustomer(customerId, 'me:changed');
    }
    return MessagesService.toDto(m);
  }

  /** Mark opened by DR event id (opening the alert screen counts as opening the message). */
  async openForDrEvent(customerId: string, drEventId: Types.ObjectId): Promise<void> {
    const m = await this.db.messages.findOne({ customerId: new Types.ObjectId(customerId), drEventId, openedAt: null }).lean();
    if (m) await this.open(customerId, String(m._id));
  }

  async act(customerId: string, id: string, action: MessageAction): Promise<Message> {
    const m = await this.own(customerId, id);
    return this.applyAction(m, action);
  }

  async applyAction(m: MessageDoc, action: MessageAction): Promise<Message> {
    if (m.action === 'ENROLLED' && action !== 'ENROLLED') throw new BadRequestException('Already enrolled from this message');
    const now = new Date();
    const set: Partial<MessageDoc> = { action, actedAt: now, openedAt: m.openedAt ?? now, deliveredAt: m.deliveredAt ?? now };
    await this.db.messages.updateOne({ _id: m._id }, { $set: set });
    const updated = { ...m, ...set } as MessageDoc;
    if (m.campaignId) await this.stats.recompute(m.campaignId);
    if (!m.synthetic) this.realtime.toCustomer(String(m.customerId), 'me:changed');
    return MessagesService.toDto(updated);
  }
}

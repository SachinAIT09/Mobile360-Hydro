import { Injectable } from '@nestjs/common';
import type { Types } from 'mongoose';
import type { LiveEvent } from '@demo/shared';
import { Db } from '../db/db.service.js';
import type { LiveEventDoc } from '../db/schemas.js';
import { RealtimeService } from '../realtime/realtime.service.js';

export type NewLiveEvent = Omit<LiveEventDoc, '_id' | 'ts' | 'customerIds'> & { customerIds?: Types.ObjectId[]; ts?: Date };

@Injectable()
export class LiveEventsService {
  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimeService,
  ) {}

  static toDto(d: LiveEventDoc): LiveEvent {
    return {
      id: String(d._id),
      ts: d.ts.toISOString(),
      kind: d.kind,
      substationCode: d.substationCode,
      feederCode: d.feederCode ?? null,
      headline: d.headline,
      summary: d.summary,
      count: d.count ?? null,
      unenrolledCount: d.unenrolledCount ?? null,
      enrolledCount: d.enrolledCount ?? null,
      actionTaken: d.actionTaken ?? null,
      suggested: d.suggested ?? null,
    };
  }

  /** Persist + broadcast to staff. */
  async create(e: NewLiveEvent, emit = true): Promise<LiveEvent> {
    const doc = await this.db.liveEvents.create({ ts: new Date(), customerIds: [], ...e });
    const dto = LiveEventsService.toDto(doc.toObject());
    if (emit) this.realtime.toStaff('liveEvent:new', dto);
    return dto;
  }

  emit(dto: LiveEvent) {
    this.realtime.toStaff('liveEvent:new', dto);
  }

  async latest(limit = 25): Promise<LiveEvent[]> {
    const docs = await this.db.liveEvents.find().sort({ ts: -1 }).limit(limit).lean();
    return docs.map((d) => LiveEventsService.toDto(d));
  }
}

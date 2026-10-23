import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type { AuditAction, AuditEntry } from '@demo/shared';
import type { RequestUser } from '../auth/auth.js';
import { Db } from '../db/db.service.js';
import type { AuditEntryDoc } from '../db/schemas.js';
import { RealtimeService } from '../realtime/realtime.service.js';

export type AuditActor = AuditEntry['actor'];
export type AuditTarget = AuditEntry['target'];

/** Actor for things the server does on its own (scheduled dispatch, automatic DR end). */
export const SYSTEM_ACTOR: AuditActor = { userId: null, name: 'System', email: null, kind: 'SYSTEM' };

/** The campaign dispatcher, sending scheduled campaigns when they fall due. */
export const SCHEDULER_ACTOR: AuditActor = { ...SYSTEM_ACTOR, name: 'Scheduler' };

/** Resolves the signed-in staff user into an audit actor (name + email from the users collection). */
export async function actorFromUser(db: Db, user: RequestUser | null | undefined): Promise<AuditActor> {
  if (!user || !Types.ObjectId.isValid(user.userId)) return SYSTEM_ACTOR;
  const u = await db.users.findById(user.userId, { firstName: 1, lastName: 1, email: 1 }).lean();
  if (!u) return { userId: user.userId, name: 'Staff user', email: null, kind: 'STAFF' };
  return { userId: String(u._id), name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, kind: 'STAFF' };
}

export const MAX_AUDIT_LIMIT = 200;

/** Append-only audit log of staff and system actions; every entry is pushed live to staff. */
@Injectable()
export class AuditService {
  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimeService,
  ) {}

  static toDto(d: AuditEntryDoc): AuditEntry {
    return {
      id: String(d._id),
      at: d.at.toISOString(),
      actor: { userId: d.actor.userId ?? null, name: d.actor.name, email: d.actor.email ?? null, kind: d.actor.kind },
      action: d.action,
      target: { kind: d.target.kind, id: d.target.id ?? null, label: d.target.label },
      summary: d.summary,
    };
  }

  async record(actor: AuditActor, action: AuditAction, target: AuditTarget, summary: string, at = new Date()): Promise<AuditEntry> {
    const doc = await this.db.audit.create({ at, actor, action, target, summary });
    const dto = AuditService.toDto(doc.toObject());
    this.realtime.toStaff('audit:new', dto);
    return dto;
  }

  /** Newest first. */
  async list(limit = 100): Promise<AuditEntry[]> {
    const n = Math.min(MAX_AUDIT_LIMIT, Math.max(1, Math.floor(limit)));
    const docs = await this.db.audit.find().sort({ at: -1, _id: -1 }).limit(n).lean();
    return docs.map((d) => AuditService.toDto(d));
  }

  /** Every entry about one or more targets (campaign / DR event ids), oldest first. */
  async forTarget(...ids: string[]): Promise<AuditEntry[]> {
    const docs = await this.db.audit.find({ 'target.id': { $in: ids } }).sort({ at: 1, _id: 1 }).lean();
    return docs.map((d) => AuditService.toDto(d));
  }
}

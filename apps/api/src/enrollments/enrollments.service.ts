import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { Enrollment, EnrollRequest } from '@demo/shared';
import { Db } from '../db/db.service.js';
import type { CustomerDoc, EnrollmentDoc } from '../db/schemas.js';
import { MessagesService } from '../messages/messages.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimeService,
    private readonly messages: MessagesService,
  ) {}

  static toDto(e: EnrollmentDoc): Enrollment {
    return {
      id: String(e._id),
      customerId: String(e.customerId),
      programId: String(e.programId),
      enrolledAt: e.enrolledAt.toISOString(),
      source: e.source,
      status: e.status,
    };
  }

  async isEnrolled(customerId: Types.ObjectId | string): Promise<boolean> {
    return !!(await this.db.enrollments.exists({ customerId: new Types.ObjectId(String(customerId)), status: 'ACTIVE' }));
  }

  /** Customer-initiated enrollment from the app. */
  async enroll(customerId: string, req: EnrollRequest): Promise<Enrollment> {
    if (!req.consent) throw new BadRequestException('Consent is required to enroll');
    const c = await this.db.customers.findById(customerId).lean();
    if (!c) throw new NotFoundException('Customer not found');
    if (await this.isEnrolled(c._id)) throw new ConflictException('Already enrolled');
    const e = await this.create(c, req.source, req.evMake ?? null, req.chargerType ?? null);

    // Attribute to the message that led here, plus any open EV-detected prompts.
    if (req.messageId && Types.ObjectId.isValid(req.messageId)) {
      const m = await this.db.messages.findOne({ _id: new Types.ObjectId(req.messageId), customerId: c._id }).lean();
      if (m && m.action !== 'ENROLLED') await this.messages.applyAction(m, 'ENROLLED');
    }
    const pending = await this.db.messages.find({ customerId: c._id, kind: { $in: ['EV_DETECTED', 'ENROLL_OFFER'] }, action: null }).lean();
    for (const m of pending) {
      if (req.source === 'APP_POPUP' && m.kind === 'EV_DETECTED') await this.messages.applyAction(m, 'ENROLLED');
      if (req.source === 'CAMPAIGN' && m.kind === 'ENROLL_OFFER' && !req.messageId) await this.messages.applyAction(m, 'ENROLLED');
    }
    this.realtime.toCustomer(customerId, 'me:changed');
    return e;
  }

  /** Create an enrollment (also used for simulated campaign responses) and notify staff. */
  async create(c: CustomerDoc, source: EnrollRequest['source'], evMake: string | null, chargerType: EnrollmentDoc['chargerType']): Promise<Enrollment> {
    const program = await this.db.programs.findOne().lean();
    const doc = await this.db.enrollments.create({
      customerId: c._id,
      programId: program?._id ?? new Types.ObjectId(),
      feederCode: c.feederCode,
      substationCode: c.substationCode,
      enrolledAt: new Date(),
      source,
      evMake,
      chargerType,
      status: 'ACTIVE',
    });
    this.realtime.toStaff('feeder:statsChanged', { substationCode: c.substationCode, feederCode: c.feederCode });
    return EnrollmentsService.toDto(doc.toObject());
  }

  /** "Not an EV? Let us know" */
  async notEv(customerId: string): Promise<{ ok: true }> {
    const c = await this.db.customers.findById(customerId).lean();
    if (!c) throw new NotFoundException('Customer not found');
    await this.db.detections.updateMany({ customerId: c._id, status: 'DETECTED' }, { $set: { status: 'CONFIRMED_NOT_EV' } });
    await this.db.customers.updateOne({ _id: c._id }, { $set: { evChargingActive: false } });
    const pending = await this.db.messages.find({ customerId: c._id, kind: 'EV_DETECTED', action: null }).lean();
    for (const m of pending) await this.messages.applyAction(m, 'NOT_EV');
    this.realtime.toStaff('feeder:statsChanged', { substationCode: c.substationCode, feederCode: c.feederCode });
    this.realtime.toCustomer(customerId, 'me:changed');
    return { ok: true };
  }
}

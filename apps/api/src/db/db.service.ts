import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import {
  M,
  type AuditEntryDoc,
  type BillDoc,
  type CampaignDoc,
  type ConfigDoc,
  type CustomerDoc,
  type DrEventDoc,
  type EnrollmentDoc,
  type EvDetectionDoc,
  type EventResponseDoc,
  type FeederDoc,
  type LiveEventDoc,
  type MessageDoc,
  type OutageDoc,
  type OutageReportDoc,
  type PaymentDoc,
  type PremiseDoc,
  type ProgramDoc,
  type SubstationDoc,
  type UserDoc,
} from './schemas.js';

/** One injectable that exposes every model, so services take a single dependency. */
@Injectable()
export class Db {
  readonly config: Model<ConfigDoc>;
  readonly substations: Model<SubstationDoc>;
  readonly feeders: Model<FeederDoc>;
  readonly premises: Model<PremiseDoc>;
  readonly customers: Model<CustomerDoc>;
  readonly users: Model<UserDoc>;
  readonly detections: Model<EvDetectionDoc>;
  readonly enrollments: Model<EnrollmentDoc>;
  readonly programs: Model<ProgramDoc>;
  readonly messages: Model<MessageDoc>;
  readonly campaigns: Model<CampaignDoc>;
  readonly drEvents: Model<DrEventDoc>;
  readonly responses: Model<EventResponseDoc>;
  readonly bills: Model<BillDoc>;
  readonly payments: Model<PaymentDoc>;
  readonly outages: Model<OutageDoc>;
  readonly outageReports: Model<OutageReportDoc>;
  readonly liveEvents: Model<LiveEventDoc>;
  readonly audit: Model<AuditEntryDoc>;

  constructor(@InjectConnection() readonly connection: Connection) {
    const c = connection;
    this.config = c.model<ConfigDoc>(M.Config);
    this.substations = c.model<SubstationDoc>(M.Substation);
    this.feeders = c.model<FeederDoc>(M.Feeder);
    this.premises = c.model<PremiseDoc>(M.Premise);
    this.customers = c.model<CustomerDoc>(M.Customer);
    this.users = c.model<UserDoc>(M.User);
    this.detections = c.model<EvDetectionDoc>(M.EvDetection);
    this.enrollments = c.model<EnrollmentDoc>(M.Enrollment);
    this.programs = c.model<ProgramDoc>(M.Program);
    this.messages = c.model<MessageDoc>(M.Message);
    this.campaigns = c.model<CampaignDoc>(M.Campaign);
    this.drEvents = c.model<DrEventDoc>(M.DrEvent);
    this.responses = c.model<EventResponseDoc>(M.EventResponse);
    this.bills = c.model<BillDoc>(M.Bill);
    this.payments = c.model<PaymentDoc>(M.Payment);
    this.outages = c.model<OutageDoc>(M.Outage);
    this.outageReports = c.model<OutageReportDoc>(M.OutageReport);
    this.liveEvents = c.model<LiveEventDoc>(M.LiveEvent);
    this.audit = c.model<AuditEntryDoc>(M.AuditEntry);
  }

  /** Drop every demo collection (used by reset). */
  async dropAll(): Promise<void> {
    const models = [
      this.config, this.substations, this.feeders, this.premises, this.customers, this.users, this.detections,
      this.enrollments, this.programs, this.messages, this.campaigns, this.drEvents, this.responses, this.bills,
      this.payments, this.outages, this.outageReports, this.liveEvents, this.audit,
    ] as Model<unknown>[];
    await Promise.all(models.map((m) => m.deleteMany({})));
  }
}

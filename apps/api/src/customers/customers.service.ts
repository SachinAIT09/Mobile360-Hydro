import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { AutoPay, Bill, BillSummary, Channels, CustomerProfile, EvStatus, MeSummary, Outage, PaymentMethodKind, Program, UsageMonth } from '@demo/shared';
import { Db } from '../db/db.service.js';
import type { BillDoc, CustomerDoc, OutageDoc, ProgramDoc } from '../db/schemas.js';
import { DrEventsService } from '../dr-events/dr-events.service.js';
import { EnergyService } from '../energy/energy.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { localParts } from '../common/time.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Injectable()
export class CustomersService {
  constructor(
    private readonly db: Db,
    private readonly energy: EnergyService,
    private readonly drEvents: DrEventsService,
    private readonly realtime: RealtimeService,
  ) {}

  static profile(c: CustomerDoc): CustomerProfile {
    return {
      id: String(c._id),
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      accountNoMasked: `•••• ${c.accountNo.slice(-4)}`,
      address: c.address,
      feederCode: c.feederCode,
      substationCode: c.substationCode,
      hasSolar: c.hasSolar,
      channels: { push: !!c.channels?.push, sms: !!c.channels?.sms, email: !!c.channels?.email },
      autoPay: CustomersService.autoPay(c),
    };
  }

  static autoPay(c: CustomerDoc): AutoPay {
    const a = c.autoPay;
    return a?.enabled
      ? { enabled: true, method: a.method ?? null, since: a.since ? a.since.toISOString() : null }
      : { enabled: false, method: null, since: null };
  }

  static program(p: ProgramDoc): Program {
    return {
      id: String(p._id),
      name: p.name,
      signupIncentive: p.signupIncentive,
      perEventIncentive: p.perEventIncentive,
      maxEventsPerSeason: p.maxEventsPerSeason,
      typicalEventHours: p.typicalEventHours,
      termsUrl: p.termsUrl,
    };
  }

  static outage(o: OutageDoc): Outage {
    return {
      id: String(o._id),
      feederCode: o.feederCode,
      affectedCount: o.affectedCount,
      status: o.status,
      estRestoreAt: o.estRestoreAt ? o.estRestoreAt.toISOString() : null,
      cause: o.cause ?? null,
    };
  }

  async get(customerId: string): Promise<CustomerDoc> {
    const c = await this.db.customers.findById(customerId).lean();
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }

  async evStatus(c: CustomerDoc): Promise<{ status: EvStatus; detectedAt: string | null }> {
    const [enr, det] = await Promise.all([
      this.db.enrollments.exists({ customerId: c._id, status: 'ACTIVE' }),
      this.db.detections.findOne({ customerId: c._id, status: 'DETECTED' }).lean(),
    ]);
    const detectedAt = det ? det.firstDetectedAt.toISOString() : null;
    if (enr) return { status: 'ENROLLED', detectedAt };
    if (det) return { status: 'DETECTED_NOT_ENROLLED', detectedAt };
    return { status: 'NONE', detectedAt: null };
  }

  async bill(c: CustomerDoc): Promise<Bill> {
    const b = await this.db.bills.findOne({ customerId: c._id }).sort({ periodEnd: -1 }).lean();
    if (!b) throw new NotFoundException('No bill on file');
    const ev = await this.evStatus(c);
    return CustomersService.billDto(b, ev.status !== 'NONE' ? 38 : null);
  }

  static billDto(b: BillDoc, evSharePct: number | null): Bill {
    return {
      id: String(b._id),
      periodStart: b.periodStart.toISOString(),
      periodEnd: b.periodEnd.toISOString(),
      days: b.days,
      kWh: b.kWh,
      lines: b.lines.map((l) => ({ label: l.label, amount: l.amount })),
      total: b.total,
      dueDate: b.dueDate.toISOString(),
      status: b.status,
      evSharePct,
    };
  }

  /** Bill history, newest first. */
  async bills(customerId: string): Promise<BillSummary[]> {
    const bs = await this.db.bills.find({ customerId: new Types.ObjectId(customerId) }).sort({ periodEnd: -1 }).lean();
    return bs.map((b) => ({
      id: String(b._id),
      periodStart: b.periodStart.toISOString(),
      periodEnd: b.periodEnd.toISOString(),
      kWh: b.kWh,
      total: b.total,
      status: b.status,
    }));
  }

  /** Last 6 bills, oldest first, labelled by the month their period ends in (demo timezone). */
  async usageHistory(customerId: string): Promise<UsageMonth[]> {
    const bs = await this.db.bills
      .find({ customerId: new Types.ObjectId(customerId) }, { periodEnd: 1, kWh: 1 })
      .sort({ periodEnd: -1 })
      .limit(6)
      .lean();
    return bs.reverse().map((b) => ({ month: MONTHS[localParts(b.periodEnd).month - 1], kWh: b.kWh }));
  }

  async nearbyOutage(c: CustomerDoc): Promise<Outage | null> {
    const o = await this.db.outages.findOne({ substationCode: c.substationCode, status: { $ne: 'RESTORED' } }).lean();
    return o ? CustomersService.outage(o) : null;
  }

  async summary(customerId: string): Promise<MeSummary> {
    const c = await this.get(customerId);
    const [bill, ev, program, activeDrEvent, unread, nearbyOutage, day, live] = await Promise.all([
      this.bill(c),
      this.evStatus(c),
      this.db.programs.findOne().lean(),
      this.drEvents.activeForCustomer(customerId),
      this.db.messages.find({ customerId: c._id, openedAt: null }, { category: 1 }).lean(),
      this.nearbyOutage(c),
      this.energy.summary(customerId, 'day'),
      this.energy.readingFor(c),
    ]);
    if (!program) throw new NotFoundException('No program configured');
    return {
      customer: CustomersService.profile(c),
      bill,
      evStatus: ev.status,
      evDetectedAt: ev.detectedAt,
      program: CustomersService.program(program),
      activeDrEvent,
      unreadCount: unread.length,
      unreadAlerts: unread.filter((m) => m.category === 'Alerts').length,
      unreadOffers: unread.filter((m) => m.category === 'Offers').length,
      nearbyOutage,
      today: { usedKwh: day.consumptionKwh, selfConsumptionPct: day.selfConsumptionPct },
      live,
    };
  }

  async updateAutoPay(customerId: string, enabled: boolean, method: PaymentMethodKind | null): Promise<CustomerProfile> {
    const _id = new Types.ObjectId(customerId);
    const current = await this.get(customerId);
    const autoPay = enabled
      ? { enabled: true, method, since: current.autoPay?.enabled ? current.autoPay.since ?? new Date() : new Date() }
      : { enabled: false, method: null, since: null };
    await this.db.customers.updateOne({ _id }, { $set: { autoPay } });
    this.realtime.toCustomer(customerId, 'me:changed');
    return CustomersService.profile(await this.get(customerId));
  }

  async updateChannels(customerId: string, ch: Channels): Promise<Channels> {
    await this.db.customers.updateOne({ _id: new Types.ObjectId(customerId) }, { $set: { channels: ch } });
    this.realtime.toCustomer(customerId, 'me:changed');
    return ch;
  }
}

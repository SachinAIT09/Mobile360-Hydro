import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Types } from 'mongoose';
import { DEMO_RATE_PER_KWH, type EnergyRange, type EnergyReading, type EnergySummary } from '@demo/shared';
import { config } from '../config.js';
import { Db } from '../db/db.service.js';
import type { CustomerDoc } from '../db/schemas.js';
import { round1, round2 } from '../common/numbers.js';
import { localHour, localMidnight, localParts } from '../common/time.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { EV_CHARGE_KW, historicalEvKw, point } from './energy.model.js';

export interface EvState {
  hasEv: boolean;
  charging: boolean;
  pausedForEvent: boolean;
  evKw: number;
}

@Injectable()
export class EnergyService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly log = new Logger('Energy');

  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 5000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    const ids = this.realtime.onlineCustomerIds();
    if (!ids.length) return;
    try {
      const customers = await this.db.customers.find({ _id: { $in: ids.map((i) => new Types.ObjectId(i)) } }).lean();
      for (const c of customers) {
        const r = await this.readingFor(c);
        this.realtime.toCustomer(String(c._id), 'energy:reading', r);
      }
    } catch (e) {
      this.log.warn(`tick failed: ${(e as Error).message}`);
    }
  }

  async customer(customerId: string): Promise<CustomerDoc> {
    const c = await this.db.customers.findById(customerId).lean();
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }

  /** EV state right now, including DR-event pausing. */
  async evState(c: CustomerDoc, at = new Date()): Promise<EvState> {
    const [det, enr] = await Promise.all([
      this.db.detections.exists({ customerId: c._id, status: 'DETECTED' }),
      this.db.enrollments.exists({ customerId: c._id, status: 'ACTIVE' }),
    ]);
    const hasEv = !!det || !!enr;
    const h = localHour(at);
    const charging = c.evChargingActive || (hasEv && (config.evAlwaysCharging || (h >= 18 && h < 23)));
    let pausedForEvent = false;
    if (charging) {
      const active = await this.db.drEvents.find({ status: 'ACTIVE', targetCustomerIds: c._id }).lean();
      for (const ev of active) {
        if (await this.db.responses.exists({ drEventId: ev._id, customerId: c._id, response: 'PAUSE' })) pausedForEvent = true;
      }
    }
    return { hasEv, charging, pausedForEvent, evKw: charging && !pausedForEvent ? EV_CHARGE_KW : 0 };
  }

  async readingFor(c: CustomerDoc, at = new Date()): Promise<EnergyReading> {
    const ev = await this.evState(c, at);
    const p = point(localHour(at), at.getTime() / 5000 + Math.random(), { hasSolar: c.hasSolar, evKw: ev.evKw });
    return {
      ts: at.toISOString(),
      solarKw: round2(p.solarKw),
      gridImportKw: round2(p.gridImportKw),
      gridExportKw: round2(p.gridExportKw),
      homeKw: round2(p.homeKw),
      evKw: round2(p.evKw),
    };
  }

  async live(customerId: string): Promise<EnergyReading> {
    return this.readingFor(await this.customer(customerId));
  }

  /** Integrate the model in 15-minute steps between two instants. */
  private integrate(from: Date, to: Date, hasSolar: boolean, hasEv: boolean, nowEvKw: number | null, now: Date) {
    const acc = { prod: 0, cons: 0, self: 0, exp: 0, imp: 0, ev: 0, heating: 0, alwaysOn: 0, other: 0, peakW: 0, peakAt: null as Date | null };
    const step = 15 * 60000;
    for (let t = from.getTime(); t < to.getTime(); t += step) {
      const dtH = Math.min(step, to.getTime() - t) / 3600000;
      const at = new Date(t);
      const h = localHour(at);
      const isNow = nowEvKw !== null && now.getTime() - t < step && now.getTime() >= t;
      const evKw = isNow ? nowEvKw : historicalEvKw(h, hasEv);
      const p = point(h, Math.floor(t / step), { hasSolar, evKw });
      acc.prod += p.solarKw * dtH;
      acc.cons += p.homeKw * dtH;
      acc.self += Math.min(p.solarKw, p.homeKw) * dtH;
      acc.exp += p.gridExportKw * dtH;
      acc.imp += p.gridImportKw * dtH;
      acc.ev += p.evKw * dtH;
      acc.heating += p.heatingKw * dtH;
      acc.alwaysOn += p.alwaysOnKw * dtH;
      acc.other += p.otherKw * dtH;
      if (p.solarKw * 1000 > acc.peakW) {
        acc.peakW = p.solarKw * 1000;
        acc.peakAt = at;
      }
    }
    return acc;
  }

  async summary(customerId: string, range: EnergyRange, now = new Date()): Promise<EnergySummary> {
    const c = await this.customer(customerId);
    const ev = await this.evState(c, now);
    const midnight = localMidnight(now);
    const today = this.integrate(midnight, now, c.hasSolar, ev.hasEv, ev.evKw, now);
    const lp = localParts(now);
    const dayName = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: config.timezone });

    let acc = today;
    let label = `Today, ${dayName.replace(',', '')}`;
    if (range !== 'day') {
      const fullDay = this.integrate(midnight, new Date(midnight.getTime() + 86400000), c.hasSolar, ev.hasEv, null, now);
      const weekday = new Date(Date.UTC(lp.year, lp.month - 1, lp.day)).getUTCDay();
      const dayOfYear = Math.floor((Date.UTC(lp.year, lp.month - 1, lp.day) - Date.UTC(lp.year, 0, 1)) / 86400000);
      const priorDays = range === 'week' ? weekday : range === 'month' ? lp.day - 1 : dayOfYear;
      const scale = (k: keyof typeof fullDay) => (fullDay[k] as number) * priorDays + (today[k] as number);
      acc = {
        prod: scale('prod'), cons: scale('cons'), self: scale('self'), exp: scale('exp'), imp: scale('imp'), ev: scale('ev'),
        heating: scale('heating'), alwaysOn: scale('alwaysOn'), other: scale('other'),
        peakW: Math.max(fullDay.peakW, today.peakW),
        peakAt: today.peakW >= fullDay.peakW ? today.peakAt : fullDay.peakAt,
      };
      if (range === 'week') {
        const start = new Date(Date.UTC(lp.year, lp.month - 1, lp.day - weekday));
        const end = new Date(start.getTime() + 6 * 86400000);
        const m = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        label = m(start) === m(end)
          ? `${m(start)} ${start.getUTCDate()} – ${end.getUTCDate()}`
          : `${m(start)} ${start.getUTCDate()} – ${m(end)} ${end.getUTCDate()}`;
      } else if (range === 'month') {
        label = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: config.timezone });
      } else {
        label = String(lp.year);
      }
    }
    const prod = c.hasSolar ? acc.prod : 0;
    return {
      range,
      label,
      hasSolar: c.hasSolar,
      productionKwh: round1(prod),
      consumptionKwh: round1(acc.cons),
      selfConsumedKwh: round1(c.hasSolar ? acc.self : 0),
      selfConsumptionPct: c.hasSolar && prod > 0.05 ? Math.round((acc.self / prod) * 100) : null,
      exportedKwh: round1(c.hasSolar ? acc.exp : 0),
      exportedPct: c.hasSolar && prod > 0.05 ? Math.round((acc.exp / prod) * 100) : null,
      importedKwh: round1(acc.imp),
      costEstimate: round2(acc.imp * DEMO_RATE_PER_KWH),
      breakdown: [
        { key: 'ev', label: 'EV charging', kWh: round1(acc.ev) },
        { key: 'heating', label: 'Heating/cooling', kWh: round1(acc.heating) },
        { key: 'alwaysOn', label: 'Always-on', kWh: round1(acc.alwaysOn) },
        { key: 'other', label: 'Other', kWh: round1(acc.other) },
      ],
      peakSolarW: c.hasSolar && acc.peakW > 0 ? Math.round(acc.peakW) : null,
      peakSolarAt: c.hasSolar && acc.peakAt ? acc.peakAt.toISOString() : null,
    };
  }

  /** 15-minute home-load series around a DR event window, for the event result chart. */
  seriesAround(c: CustomerDoc, start: Date, end: Date, paused: boolean): { t: string; kw: number }[] {
    const out: { t: string; kw: number }[] = [];
    const from = start.getTime() - 2 * 3600000;
    const to = end.getTime() + 2 * 3600000;
    const step = 15 * 60000;
    for (let t = from; t <= to; t += step) {
      const inWindow = t >= start.getTime() && t < end.getTime();
      const evKw = inWindow ? (paused ? 0 : EV_CHARGE_KW) : t < start.getTime() ? EV_CHARGE_KW : t < end.getTime() + 2 * 3600000 ? EV_CHARGE_KW : 0;
      const p = point(localHour(new Date(t)), Math.floor(t / step), { hasSolar: c.hasSolar, evKw });
      out.push({ t: new Date(t).toISOString(), kw: round2(p.homeKw) });
    }
    return out;
  }
}

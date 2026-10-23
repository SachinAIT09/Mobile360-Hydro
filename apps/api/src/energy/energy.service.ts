import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Types } from 'mongoose';
import { DEMO_RATE_PER_KWH, type EnergyRange, type EnergyReading, type EnergySummary, type SmartChargingPlan } from '@demo/shared';
import { config } from '../config.js';
import { Db } from '../db/db.service.js';
import type { CustomerDoc } from '../db/schemas.js';
import { round1, round2 } from '../common/numbers.js';
import { localHour, localMidnight, localParts } from '../common/time.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { avgEvKw, evKwAt, localClock, planCharging, repeatDaily, sessionFor } from './charging-plan.js';
import { EV_CHARGE_KW, historicalEvKw, point } from './energy.model.js';
import { integrate, type EnergyAcc } from './integrate.js';
import { activeBoost, SmartChargingService } from './smart-charging.service.js';
import { costOfSteps, periodAt } from './tariff.js';

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
    private readonly smart: SmartChargingService,
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
    // Smart charging (when on) decides when the car draws power, then DR pausing still applies.
    const plan = hasEv && c.smartCharging?.enabled ? await this.smart.planFor(c, at) : null;
    const charging = plan
      ? !!activeBoost(c, at) || evKwAt(plan.slots, at) > 0
      : c.evChargingActive || (hasEv && (config.evAlwaysCharging || (h >= 18 && h < 23)));
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

  /** EV kW per 15-minute step for the summary: the smart plan (repeated nightly) when on, else the historical pattern. */
  private evProfile(plan: SmartChargingPlan | null, hasEv: boolean): (t: number, hour: number) => number {
    if (!plan) return (_t, h) => historicalEvKw(h, hasEv);
    const slots = repeatDaily(plan.slots);
    return (t) => avgEvKw(slots, t, t + 15 * 60000);
  }

  /** Cost of a step's grid import on the customer's time-based rate plan (TIERED is priced afterwards from the total). */
  private static costFn(plan: SmartChargingPlan | null) {
    if (!plan || plan.settings.ratePlan === 'TIERED') return undefined;
    const id = plan.settings.ratePlan;
    return (t: number, _h: number, kwh: number) => {
      const { hour, weekday } = localClock(t, config.timezone);
      return kwh * periodAt(id, hour, weekday).rate;
    };
  }

  async summary(customerId: string, range: EnergyRange, now = new Date()): Promise<EnergySummary> {
    const c = await this.customer(customerId);
    const ev = await this.evState(c, now);
    const plan = ev.hasEv && c.smartCharging?.enabled ? await this.smart.planFor(c, now) : null;
    const evKwAtStep = this.evProfile(plan, ev.hasEv);
    const costOf = EnergyService.costFn(plan);
    const midnight = localMidnight(now);
    const today = integrate({ from: midnight, to: now, hasSolar: c.hasSolar, evKwAt: evKwAtStep, nowEvKw: ev.evKw, now, costOf });
    const lp = localParts(now);
    const dayName = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: config.timezone });

    let acc: EnergyAcc = today;
    let days = 1;
    let label = `Today, ${dayName.replace(',', '')}`;
    if (range !== 'day') {
      const fullDay = integrate({ from: midnight, to: new Date(midnight.getTime() + 86400000), hasSolar: c.hasSolar, evKwAt: evKwAtStep, nowEvKw: null, now, costOf });
      const weekday = new Date(Date.UTC(lp.year, lp.month - 1, lp.day)).getUTCDay();
      const dayOfYear = Math.floor((Date.UTC(lp.year, lp.month - 1, lp.day) - Date.UTC(lp.year, 0, 1)) / 86400000);
      const priorDays = range === 'week' ? weekday : range === 'month' ? lp.day - 1 : dayOfYear;
      days = priorDays + 1;
      const scale = (k: Exclude<keyof EnergyAcc, 'peakAt'>) => fullDay[k] * priorDays + today[k];
      acc = {
        prod: scale('prod'), cons: scale('cons'), self: scale('self'), exp: scale('exp'), imp: scale('imp'), ev: scale('ev'),
        heating: scale('heating'), alwaysOn: scale('alwaysOn'), other: scale('other'), cost: scale('cost'),
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
    let cost = acc.imp * DEMO_RATE_PER_KWH;
    if (plan) {
      if (plan.settings.ratePlan !== 'TIERED') cost = acc.cost;
      else {
        // Tiers are monthly: price the average month in the range.
        const months = Math.max(1, days / 30);
        cost = costOfSteps([{ hour: 0, weekday: 1, kwh: acc.imp / months }], 'TIERED') * months;
      }
    }
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
      costEstimate: round2(cost),
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
    // Smart charging on: outside the window the car follows a plan that charges around the event.
    const s = c.smartCharging?.enabled ? c.smartCharging : null;
    const planned = s
      ? repeatDaily(
          planCharging({
            session: sessionFor(start, s.readyBy),
            needKwh: s.targetKwh,
            maxKw: EV_CHARGE_KW,
            planId: s.ratePlan,
            blocked: [{ start, end }],
            tz: config.timezone,
          }).slots,
        )
      : null;
    for (let t = from; t <= to; t += step) {
      const inWindow = t >= start.getTime() && t < end.getTime();
      const outside = planned ? avgEvKw(planned, t, t + step) : t < start.getTime() ? EV_CHARGE_KW : t < end.getTime() + 2 * 3600000 ? EV_CHARGE_KW : 0;
      const evKw = inWindow ? (paused ? 0 : EV_CHARGE_KW) : outside;
      const p = point(localHour(new Date(t)), Math.floor(t / step), { hasSolar: c.hasSolar, evKw });
      out.push({ t: new Date(t).toISOString(), kw: round2(p.homeKw) });
    }
    return out;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { PROGRAM } from '@demo/shared';
import { config } from '../config.js';
import { Db } from '../db/db.service.js';
import type {
  BillDoc,
  CustomerDoc,
  EnrollmentDoc,
  EvDetectionDoc,
  FeederDoc,
  MessageDoc,
  PremiseDoc,
  SubstationDoc,
} from '../db/schemas.js';
import { prng } from '../common/numbers.js';
import { addMinutes, localDatePlusDays, localParts, zonedTime } from '../common/time.js';
import { allocateFeederEvs, regionForIndex } from './allocate.js';
import { seedAudit } from './audit-seed.js';
import { baselineForecastPct } from './forecast.js';
import { billAmounts, billPeriod, SEED_BILL_KWH } from './bills.js';
import {
  DEAD_SUBSTATIONS,
  FIRST_NAMES,
  HEADLINE,
  LAST_NAMES,
  LIVE_FEEDERS,
  STREETS,
  SUBSTATIONS,
  TOWN,
} from './seed-data.js';
import { seedSmartCharging } from './smart-charging-seed.js';

const oid = () => new Types.ObjectId();

export const DEMO_EMAILS = {
  unenrolled: 'manny@demo.test',
  enrolled: 'priya@demo.test',
  staff: 'staff@demo.test',
  staff2: 'ops@demo.test',
} as const;

export const DEMO_IDS = {
  unenrolledCustomer: new Types.ObjectId('00000000000000000000a001'),
  enrolledCustomer: new Types.ObjectId('00000000000000000000a002'),
  unenrolledUser: new Types.ObjectId('00000000000000000000b001'),
  enrolledUser: new Types.ObjectId('00000000000000000000b002'),
  staffUser: new Types.ObjectId('00000000000000000000b003'),
  staffUser2: new Types.ObjectId('00000000000000000000b004'),
} as const;

@Injectable()
export class SeedService {
  private readonly log = new Logger('Seed');

  constructor(private readonly db: Db) {}

  async isEmpty(): Promise<boolean> {
    return (await this.db.config.countDocuments({ key: 'main' })) === 0;
  }

  async seedIfEmpty(): Promise<boolean> {
    if (!(await this.isEmpty())) return false;
    await this.seed();
    return true;
  }

  async reset(): Promise<void> {
    await this.db.dropAll();
    await this.seed();
  }

  /** Builds the whole demo dataset. Deterministic apart from timestamps. */
  async seed(): Promise<void> {
    const t0 = Date.now();
    const rnd = prng(20261021);
    const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
    const now = new Date();

    // ---- program
    const programId = oid();
    await this.db.programs.create({ _id: programId, ...PROGRAM });

    // ---- substations + feeders
    const substations: Partial<SubstationDoc>[] = [];
    const feeders: Partial<FeederDoc>[] = [];
    SUBSTATIONS.forEach(([code, evs, knownPct, pen, feederCount], i) => {
      substations.push({
        code,
        order: i,
        region: regionForIndex(i),
        seedEvs: evs,
        seedKnown: Math.round((evs * knownPct) / 100),
        penetrationPct: pen,
        feederCount,
        dead: false,
        deadPremises: 0,
        interactive: code === 'SUB-01',
      });
      // Live feeders keep their seeded split; the remaining EVs are spread across static feeders.
      allocateFeederEvs(code, evs, feederCount, LIVE_FEEDERS).forEach((a, k) => {
        const live = LIVE_FEEDERS[a.code];
        feeders.push({
          code: a.code,
          substationCode: code,
          order: k,
          live: !!live,
          premisesCount: live ? live.premises : null,
          capacityKw: 4000 + Math.round(rnd() * 2000),
          forecastLoadPct: baselineForecastPct(a.code),
          staticEvs: live ? 0 : a.evs,
          seedKnown: live ? live.known : 0,
          seedUnenrolled: live ? live.unenrolled : 0,
        });
      });
    });
    DEAD_SUBSTATIONS.forEach(([code, feederCount, premises], i) => {
      substations.push({
        code,
        order: 100 + i,
        region: regionForIndex(SUBSTATIONS.length + i),
        seedEvs: 0,
        seedKnown: 0,
        penetrationPct: 0,
        feederCount,
        dead: true,
        deadPremises: premises,
        interactive: false,
      });
      for (let k = 0; k < feederCount; k++) {
        feeders.push({
          code: `${code}-F${k + 1}`, substationCode: code, order: k, live: false, premisesCount: null,
          capacityKw: 3000, forecastLoadPct: baselineForecastPct(`${code}-F${k + 1}`), staticEvs: 0, seedKnown: 0, seedUnenrolled: 0,
        });
      }
    });
    await this.db.substations.insertMany(substations);
    await this.db.feeders.insertMany(feeders);

    // ---- live customers
    const premises: Partial<PremiseDoc>[] = [];
    const customers: Partial<CustomerDoc>[] = [];
    const detections: Partial<EvDetectionDoc>[] = [];
    const enrollments: Partial<EnrollmentDoc>[] = [];
    let n = 0;
    const mkCustomer = (feederCode: string, over: Partial<CustomerDoc> = {}) => {
      n++;
      const substationCode = feederCode.replace(/-F\d+$/, '');
      const premiseId = oid();
      const address = `${10 + Math.floor(rnd() * 980)} ${pick(STREETS)}, ${TOWN}`;
      const hasSolar = rnd() < 0.3;
      premises.push({ _id: premiseId, address, feederCode, substationCode, hasSolar });
      const c: Partial<CustomerDoc> = {
        _id: oid(),
        firstName: pick(FIRST_NAMES),
        lastName: pick(LAST_NAMES),
        email: `customer${n}@synthetic.test`,
        accountNo: String(100000000 + Math.floor(rnd() * 899999999)),
        premiseId,
        address,
        feederCode,
        substationCode,
        hasSolar,
        optedOutOfMessages: rnd() < 0.03,
        lifeSupport: rnd() < 0.02,
        groundTruthValidated: false,
        channels: { push: true, sms: rnd() < 0.5, email: rnd() < 0.6 },
        autoPay: { enabled: false, method: null, since: null },
        evChargingActive: false,
        smartCharging: null,
        demoRole: null,
        synthetic: true,
        ...over,
      };
      if (over.address) {
        premises[premises.length - 1].address = over.address;
        premises[premises.length - 1].hasSolar = over.hasSolar ?? hasSolar;
      }
      customers.push(c);
      return c;
    };
    const detect = (c: Partial<CustomerDoc>, daysAgo = 1 + Math.floor(rnd() * 90)) =>
      detections.push({
        _id: oid(), premiseId: c.premiseId, customerId: c._id, feederCode: c.feederCode, substationCode: c.substationCode,
        firstDetectedAt: new Date(now.getTime() - daysAgo * 86400000), source: 'NET2GRID', status: 'DETECTED',
      });
    const enroll = (c: Partial<CustomerDoc>) =>
      enrollments.push({
        _id: oid(), customerId: c._id, programId, feederCode: c.feederCode, substationCode: c.substationCode,
        enrolledAt: new Date(now.getTime() - (30 + Math.floor(rnd() * 400)) * 86400000), source: 'LEGACY',
        evMake: null, chargerType: 'LEVEL_2', status: 'ACTIVE',
      });

    // Fixed ids keep demo logins and socket rooms valid across resets.
    const demoUnenrolledId = DEMO_IDS.unenrolledCustomer;
    const demoEnrolledId = DEMO_IDS.enrolledCustomer;
    for (const [feederCode, spec] of Object.entries(LIVE_FEEDERS)) {
      const evs = spec.known + spec.unenrolled;
      const confirmed = spec.confirmed ?? Math.round(spec.known * 0.78);
      let gtLeft = spec.groundTruth ?? Math.round(evs * 0.15);
      for (let k = 0; k < spec.known; k++) {
        const isPriya = feederCode === 'SUB-01-F1' && k === 0;
        const c = isPriya
          ? mkCustomer(feederCode, {
              _id: demoEnrolledId, firstName: config.demoEnrolledFirstName, lastName: 'Sharma', email: DEMO_EMAILS.enrolled,
              accountNo: '700457310', address: `45 Lakeview Dr, ${TOWN}`, hasSolar: true, optedOutOfMessages: false,
              lifeSupport: false, channels: { push: true, sms: true, email: false }, evChargingActive: true,
              demoRole: 'ENROLLED_DEMO', synthetic: false,
            })
          : mkCustomer(feederCode);
        if (gtLeft > 0) { c.groundTruthValidated = true; gtLeft--; }
        if (k < confirmed) detect(c);
        enroll(c);
      }
      for (let k = 0; k < spec.unenrolled; k++) {
        const c = mkCustomer(feederCode);
        if (gtLeft > 0) { c.groundTruthValidated = true; gtLeft--; }
        detect(c);
      }
    }
    // Manny: on SUB-01-F1, no EV detected and not enrolled yet.
    mkCustomer('SUB-01-F1', {
      _id: demoUnenrolledId, firstName: config.demoFirstName, lastName: 'Rivera', email: DEMO_EMAILS.unenrolled,
      accountNo: '700124821', address: `123 Main St, ${TOWN}`, hasSolar: true, optedOutOfMessages: false, lifeSupport: false,
      channels: { push: true, sms: true, email: true }, evChargingActive: false, demoRole: 'UNENROLLED_DEMO', synthetic: false,
    });
    await this.db.premises.insertMany(premises);
    await this.db.customers.insertMany(customers);
    await this.db.detections.insertMany(detections);
    await this.db.enrollments.insertMany(enrollments);
    await seedSmartCharging(this.db, customers);

    // ---- users
    await this.db.users.insertMany([
      { _id: DEMO_IDS.unenrolledUser, email: DEMO_EMAILS.unenrolled, role: 'CUSTOMER', firstName: config.demoFirstName, lastName: 'Rivera', customerId: demoUnenrolledId },
      { _id: DEMO_IDS.enrolledUser, email: DEMO_EMAILS.enrolled, role: 'CUSTOMER', firstName: config.demoEnrolledFirstName, lastName: 'Sharma', customerId: demoEnrolledId },
      { _id: DEMO_IDS.staffUser, email: DEMO_EMAILS.staff, role: 'STAFF', firstName: 'Demo', lastName: 'Staff', customerId: null },
      { _id: DEMO_IDS.staffUser2, email: DEMO_EMAILS.staff2, role: 'STAFF', firstName: 'Jordan', lastName: 'Reyes', customerId: null },
    ]);

    // ---- bills (May..Oct 2026; only October unpaid) + history messages for the two demo customers
    const lp = localParts(now);
    const BILL_YEAR = 2026;
    const LAST_BILL_MONTH = 10;
    for (const customerId of [demoUnenrolledId, demoEnrolledId]) {
      const bills: Partial<BillDoc>[] = SEED_BILL_KWH.map((kWh, i) => {
        const endMonth = LAST_BILL_MONTH - (SEED_BILL_KWH.length - 1 - i);
        const period = billPeriod(BILL_YEAR, endMonth);
        const { lines, total } = billAmounts(kWh);
        const periodEnd = zonedTime(period.end.year, period.end.month, 14);
        return {
          customerId,
          periodStart: zonedTime(period.start.year, period.start.month, 15),
          periodEnd,
          days: period.days,
          kWh,
          lines,
          total,
          // Calendar arithmetic, not +25×24 h: DST ends Nov 1, so adding hours lands on Nov 7 23:00 local.
          dueDate: localDatePlusDays(period.end.year, period.end.month, 14, 25), // Oct 14 + 25 days = Nov 8
          status: endMonth === LAST_BILL_MONTH ? 'UNPAID' : 'PAID',
        };
      });
      await this.db.bills.insertMany(bills);
      const c = customers.find((x) => String(x._id) === String(customerId))!;
      const history: Partial<MessageDoc>[] = [
        {
          customerId, kind: 'BILL', category: 'Billing', tag: 'Billing', title: 'Your October bill is ready',
          body: '$184.27 due Nov 8.', cta: 'View bill', campaignId: null, drEventId: null, route: '/bill',
          createdAt: addMinutes(now, -6 * 1440), deliveredAt: addMinutes(now, -6 * 1440),
          openedAt: addMinutes(now, -6 * 1440 + 30), actedAt: null, action: null, synthetic: false,
        },
        {
          customerId, kind: 'OUTAGE', category: 'Alerts', tag: 'Outage', title: `Power restored at ${c.address!.split(',')[0]}`,
          body: 'Thanks for your patience. Cause: tree contact.', cta: null, campaignId: null, drEventId: null, route: '/outage',
          createdAt: addMinutes(now, -18 * 1440), deliveredAt: addMinutes(now, -18 * 1440),
          openedAt: addMinutes(now, -18 * 1440 + 10), actedAt: null, action: null, synthetic: false,
        },
      ];
      await this.db.messages.insertMany(history);
    }

    // ---- an active outage near the demo customers
    let est = zonedTime(lp.year, lp.month, lp.day, 20, 45);
    if (est.getTime() < now.getTime() + 30 * 60000) est = addMinutes(now, 120);
    await this.db.outages.create({
      feederCode: 'SUB-01-F2', substationCode: 'SUB-01', affectedCount: 212, status: 'CREW_ASSIGNED', estRestoreAt: est, cause: null,
    });

    // ---- audit log (after everything it may reference; before config, which marks the seed complete)
    await seedAudit(this.db);

    // ---- config
    await this.db.config.create({
      key: 'main',
      matchedPremises: HEADLINE.matchedPremises,
      noSignalPremises: HEADLINE.noSignalPremises,
      noLocationPremises: HEADLINE.noLocationPremises,
      partiallyDeadSubstations: HEADLINE.partiallyDeadSubstations,
      deadFeeders: HEADLINE.deadFeeders,
      deadFeederPremises: HEADLINE.deadFeederPremises,
      dataSourceNote: HEADLINE.dataSourceNote,
      lastReset: now,
    });

    this.log.log(`Seeded ${customers.length} customers, ${feeders.length} feeders in ${Date.now() - t0} ms`);
  }
}

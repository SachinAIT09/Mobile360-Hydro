import { Injectable, Logger } from '@nestjs/common';
import type { AssistantAnswer, AssistantContext, AssistantSuggestions, EnergyRange } from '@demo/shared';
import { nextEventWindow } from '../common/time.js';
import { CampaignsService } from '../campaigns/campaigns.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { Db } from '../db/db.service.js';
import { DrEventsService } from '../dr-events/dr-events.service.js';
import { EnergyService } from '../energy/energy.service.js';
import { SmartChargingService } from '../energy/smart-charging.service.js';
import { GridService } from '../grid/grid.service.js';
import { ReportsService } from '../grid/reports.service.js';
import { answerCustomer, billJumped, type CustomerFacts, type CustomerQuestion } from './customer-answers.js';
import { CUSTOMER_INTENTS, CUSTOMER_SUGGESTIONS, STAFF_INTENTS, STAFF_SUGGESTIONS } from './intents.js';
import { matchIntent } from './nlu.js';
import { answerStaff, type DraftTarget, type StaffFacts, type StaffQuestion } from './staff-answers.js';

/**
 * Scripted, stateless assistant. Matches the question to an intent (nlu.ts), gathers only the facts that
 * intent needs from the existing services, then hands plain objects to the pure answer functions.
 * No model and no external calls; the client echoes `context` back for follow-ups.
 */
@Injectable()
export class AssistantService {
  private readonly log = new Logger('Assistant');

  constructor(
    private readonly db: Db,
    private readonly grid: GridService,
    private readonly reports: ReportsService,
    private readonly campaigns: CampaignsService,
    private readonly drEvents: DrEventsService,
    private readonly customers: CustomersService,
    private readonly energy: EnergyService,
    private readonly smartCharging: SmartChargingService,
  ) {}

  /** Await a fact, degrading to `fallback` (and a log line) when the source is unavailable. */
  private async safe<T>(what: string, p: Promise<T>, fallback: T): Promise<T> {
    try {
      return await p;
    } catch (e) {
      this.log.debug(`${what} unavailable: ${(e as Error).message}`);
      return fallback;
    }
  }

  // ------------------------------------------------------------ staff

  async askStaff(question: string, context: AssistantContext): Promise<AssistantAnswer> {
    const now = new Date();
    const m = matchIntent(question, STAFF_INTENTS, context);
    const q: StaffQuestion = { intent: m.intent, entities: m.entities, context, now };
    const facts = await this.staffFacts(q, question);
    return answerStaff(q, facts);
  }

  private async staffFacts(q: StaffQuestion, question: string): Promise<StaffFacts> {
    const e = q.entities;
    const feederCode = e.feederCodes[0] ?? q.context.feederCode ?? null;
    switch (q.intent) {
      case 'FEEDER_STATUS': {
        const [feeder, blindSpots] = await Promise.all([
          feederCode ? this.safe('feeder', this.grid.feeder(feederCode), null) : Promise.resolve(null),
          this.grid.blindSpots(),
        ]);
        return { feederCode, feeder, blindSpots };
      }
      case 'BLIND_SPOTS':
        return { blindSpots: await this.grid.blindSpots() };
      case 'OVERVIEW':
        return { overview: await this.grid.overview() };
      case 'CAMPAIGN_PERFORMANCE':
        return { campaigns: await this.campaigns.list() };
      case 'DR_PERFORMANCE': {
        const [reports, drEvents] = await Promise.all([this.reports.summary(q.now), this.drEvents.list()]);
        return { reports, drEvents };
      }
      case 'ENROLLMENT_TREND':
        return { reports: await this.reports.summary(q.now) };
      case 'GRID_RISK': {
        const docs = await this.db.feeders.find({ forecastLoadPct: { $ne: null } }, { code: 1, forecastLoadPct: 1, live: 1 }).lean();
        const live = docs.filter((d) => d.live).map((d) => d.code);
        const counts = live.length ? await this.grid.liveCounts(live) : new Map();
        const w = nextEventWindow(q.now);
        return {
          riskFeeders: docs.map((d) => ({ code: d.code, forecastLoadPct: d.forecastLoadPct ?? 0, known: d.live ? counts.get(d.code)?.known ?? 0 : null })),
          nextWindow: { start: w.start.toISOString(), end: w.end.toISOString() },
        };
      }
      case 'DRAFT_CAMPAIGN': {
        const blindSpots = await this.grid.blindSpots();
        let codes = e.feederCodes.slice(0, 10);
        if (!codes.length) {
          const wantsTop = e.count !== null || /blind ?spots?|worst|biggest|\btop\b/i.test(question);
          if (wantsTop) codes = blindSpots.slice(0, Math.min(Math.max(e.count ?? 3, 1), 10)).map((b) => b.feederCode);
          else if (feederCode) codes = [feederCode];
          else if (blindSpots[0]) codes = [blindSpots[0].feederCode];
        }
        const stats = await Promise.all(codes.map((c) => this.safe('feeder', this.grid.feeder(c), null)));
        const draftTargets: DraftTarget[] = stats
          .filter((s): s is NonNullable<typeof s> => !!s && s.known !== null)
          .map((s) => ({ code: s.code, known: s.known ?? 0, unenrolled: s.unenrolled ?? 0 }));
        return { blindSpots, draftTargets };
      }
      case 'FLEX_LOAD': {
        const [reports, overview] = await Promise.all([this.reports.summary(q.now), this.grid.overview()]);
        return { reports, overview };
      }
      default:
        return {};
    }
  }

  async staffSuggestions(): Promise<AssistantSuggestions> {
    const top = (await this.safe('blind spots', this.grid.blindSpots(), []))[0];
    const dynamic = top ? [`How is ${top.feederCode} doing?`] : [];
    return {
      greeting: 'Ask me about feeders, blind spots, campaigns, DR events or grid risk. I answer from the live demo data.',
      suggestions: [...dynamic, ...STAFF_SUGGESTIONS.filter((s) => s !== STAFF_SUGGESTIONS[0] || !top)].slice(0, 9),
    };
  }

  // ------------------------------------------------------------ customer

  async askMe(customerId: string, question: string, context: AssistantContext): Promise<AssistantAnswer> {
    const now = new Date();
    const m = matchIntent(question, CUSTOMER_INTENTS, context);
    const q: CustomerQuestion = { intent: m.intent, entities: m.entities, context, now };
    const facts = await this.customerFacts(customerId, q);
    return answerCustomer(q, facts);
  }

  private async customerFacts(customerId: string, q: CustomerQuestion): Promise<CustomerFacts> {
    const c = await this.customers.get(customerId);
    const base: CustomerFacts = { firstName: c.firstName, feederCode: c.feederCode, hasSolar: c.hasSolar };
    const range = (fallback: EnergyRange): EnergyRange => (q.entities.range === 'today' ? 'day' : q.entities.range ?? fallback);
    const plan = () => this.safe('smart charging', this.smartCharging.get(customerId), null);
    const ev = () => this.customers.evStatus(c).then((x) => x.status);
    const bill = () => this.safe('bill', this.customers.bill(c), null);
    switch (q.intent) {
      case 'BILL_WHY_HIGH': {
        const [b, bills, evStatus] = await Promise.all([bill(), this.customers.bills(customerId), ev()]);
        return { ...base, bill: b, bills, evStatus };
      }
      case 'BILL_DUE':
        return { ...base, bill: await bill(), autoPay: CustomersService.autoPay(c) };
      case 'USAGE_TODAY': {
        const [energy, live] = await Promise.all([this.energy.summary(customerId, range('day'), q.now), this.energy.readingFor(c, q.now)]);
        return { ...base, energy, live };
      }
      case 'EV_COST': {
        const [energy, b, evStatus, p] = await Promise.all([this.energy.summary(customerId, range('month'), q.now), bill(), ev(), plan()]);
        return { ...base, energy, bill: b, evStatus, plan: p };
      }
      case 'BEST_TIME': {
        const [evStatus, p] = await Promise.all([ev(), plan()]);
        return { ...base, evStatus, plan: p };
      }
      case 'RATE_PLAN': {
        const [b, evStatus, p, ratePlans] = await Promise.all([bill(), ev(), plan(), this.safe('rate plans', this.smartCharging.ratePlans(customerId), null)]);
        return { ...base, bill: b, evStatus, plan: p, ratePlans };
      }
      case 'SOLAR': {
        const [energy, live] = await Promise.all([this.energy.summary(customerId, range('day'), q.now), this.energy.readingFor(c, q.now)]);
        return { ...base, energy, live };
      }
      case 'GRID_EVENT': {
        const [activeDrEvent, evStatus] = await Promise.all([this.drEvents.activeForCustomer(customerId), ev()]);
        return { ...base, activeDrEvent, evStatus };
      }
      case 'OUTAGE':
        return { ...base, outage: await this.customers.nearbyOutage(c) };
      default:
        return base;
    }
  }

  async mySuggestions(customerId: string): Promise<AssistantSuggestions> {
    const [c, bills] = await Promise.all([this.customers.get(customerId), this.safe('bills', this.customers.bills(customerId), [])]);
    const jumped = billJumped(bills);
    const statics = CUSTOMER_SUGGESTIONS.filter((s) => s !== CUSTOMER_SUGGESTIONS[0] && (c.hasSolar || !/solar/i.test(s)));
    return {
      greeting: `Hi ${c.firstName}. Ask about your bill, energy use, EV charging or outages. I answer from your account's demo data.`,
      suggestions: jumped ? [CUSTOMER_SUGGESTIONS[0], ...statics].slice(0, 9) : ['How does my bill compare to last month?', ...statics].slice(0, 9),
    };
  }
}

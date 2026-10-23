import {
  DEMO_RATE_PER_KWH,
  GRID_CO2_G_PER_KWH,
  PROGRAM,
  RATE_PLANS,
  SMART_CHARGING,
  fmtDate,
  fmtInt,
  fmtMoney,
  fmtTime,
  fmtWindow,
  type ActiveDrEventRef,
  type AssistantAnswer,
  type AssistantContext,
  type AssistantFact,
  type AutoPay,
  type Bill,
  type BillSummary,
  type EnergyReading,
  type EnergySummary,
  type EvStatus,
  type Outage,
  type RatePlanComparison,
  type RatePlanId,
  type SmartChargingPlan,
} from '@demo/shared';
import { answer, hourLabel, localClock, monthIndex, monthName, pct, route, SCRIPTED_FALLBACK } from './answer-kit.js';
import { CUSTOMER_SUGGESTIONS, type CustomerIntent } from './intents.js';
import type { Entities } from './nlu.js';
import { cheapestBlock, cleanestHour, estimatePlans, hourlyRates } from './rates.js';

/** Facts gathered by AssistantService for one customer question; only what the intent needs is set. */
export interface CustomerFacts {
  firstName: string;
  feederCode?: string;
  hasSolar?: boolean;
  /** Latest bill (has lines, due date, EV share). */
  bill?: Bill | null;
  /** Bill history, newest first. */
  bills?: BillSummary[];
  evStatus?: EvStatus;
  autoPay?: AutoPay;
  energy?: EnergySummary;
  live?: EnergyReading;
  /** Null when smart charging is off, not set up, or not available yet. */
  plan?: SmartChargingPlan | null;
  ratePlans?: RatePlanComparison | null;
  activeDrEvent?: ActiveDrEventRef | null;
  outage?: Outage | null;
}

export interface CustomerQuestion {
  intent: CustomerIntent | 'FALLBACK';
  entities: Entities;
  context: AssistantContext;
  now: Date;
}

const shortMonth = (iso: string) => monthName(iso).slice(0, 3);
const hasEv = (s?: EvStatus) => s === 'ENROLLED' || s === 'DETECTED_NOT_ENROLLED';
const smartOn = (p?: SmartChargingPlan | null) => !!p && p.settings.enabled;

/** The bill a question is about: a named month, "last month" (the one before the latest), or the latest. */
export function pickBill(bills: BillSummary[], e: Entities): { bill: BillSummary; prev: BillSummary | null } | null {
  if (!bills.length) return null;
  let i = 0;
  if (e.month !== null) {
    const j = bills.findIndex((b) => monthIndex(b.periodEnd) === e.month);
    if (j >= 0) i = j;
  } else if (e.lastMonth && bills.length > 1) i = 1;
  return { bill: bills[i], prev: bills[i + 1] ?? null };
}

// ---------------------------------------------------------------- BILL_WHY_HIGH

export function billWhyHigh(q: CustomerQuestion, f: CustomerFacts): AssistantAnswer {
  const picked = pickBill(f.bills ?? [], q.entities);
  const followUps = ['When is my bill due?', "What's the best time to charge?", 'Which rate plan is best for me?'];
  if (!picked) return answer('BILL_WHY_HIGH', { text: ["I can't find a bill on your account yet."], followUps, actions: [route('Open bill', '/bill')] }, q.now);
  const { bill, prev } = picked;
  const m = monthName(bill.periodEnd);
  const isLatest = f.bill?.id === bill.id;
  const evShare = isLatest ? f.bill?.evSharePct ?? null : null;
  const text: string[] = [];
  const facts: AssistantFact[] = [
    { label: `${m} bill`, value: fmtMoney(bill.total) },
    { label: 'Usage', value: `${fmtInt(bill.kWh)} kWh` },
  ];
  if (!prev) {
    text.push(`Your ${m} bill is **${fmtMoney(bill.total)}** for **${fmtInt(bill.kWh)} kWh**. There is no earlier bill to compare it with.`);
  } else {
    const change = Math.round(((bill.kWh - prev.kWh) / prev.kWh) * 100);
    const pm = monthName(prev.periodEnd);
    if (change > 5) text.push(`Your ${m} bill is **${fmtMoney(bill.total)}** for **${fmtInt(bill.kWh)} kWh**, up **${change}%** from ${fmtInt(prev.kWh)} kWh in ${pm}.`);
    else if (change < -5) text.push(`Your ${m} bill is **${fmtMoney(bill.total)}** for **${fmtInt(bill.kWh)} kWh**, down **${Math.abs(change)}%** from ${fmtInt(prev.kWh)} kWh in ${pm}.`);
    else text.push(`Your ${m} bill is **${fmtMoney(bill.total)}** for **${fmtInt(bill.kWh)} kWh**, about the same as ${pm} (${fmtInt(prev.kWh)} kWh).`);
    facts.push({ label: `vs ${pm.slice(0, 3)}`, value: `${change > 0 ? '+' : ''}${change}%`, tone: change > 20 ? 'warn' : change < 0 ? 'good' : 'default' });
    if (change > 5) {
      if (evShare !== null) {
        text.push(`EV charging is the biggest factor: about **${evShare}%** of this bill, roughly ${fmtInt(Math.round((bill.kWh * evShare) / 100))} kWh.`);
        facts.push({ label: 'EV share', value: `${evShare}%`, tone: 'warn' });
      } else if (change >= 20) {
        text.push('That jump is bigger than the season explains. A new large load, such as an EV charger, is the most common cause.');
      }
      const mi = monthIndex(bill.periodEnd);
      if (mi >= 9 || mi <= 2) text.push('Cooler weather also adds heating load in the fall and winter.');
      text.push(`Charging overnight on off-peak rates${hasEv(f.evStatus) ? `, or turning on ${SMART_CHARGING.name},` : ''} can bring the next bill down.`);
    }
  }
  const history = [...(f.bills ?? [])].slice(0, 6).reverse();
  const actions = [route('Open bill', '/bill')];
  if (hasEv(f.evStatus)) actions.push(route('Set up smart charging', '/smart-charging'));
  return answer(
    'BILL_WHY_HIGH',
    {
      text,
      facts,
      chart: history.length > 1 ? { kind: 'bar', unit: 'kWh', points: history.map((b) => ({ label: shortMonth(b.periodEnd), value: b.kWh, highlight: b.id === bill.id })) } : null,
      followUps,
      actions,
    },
    q.now,
  );
}

// ---------------------------------------------------------------- BILL_DUE

export function billDue(q: CustomerQuestion, f: CustomerFacts): AssistantAnswer {
  const b = f.bill;
  if (!b) return answer('BILL_DUE', { text: ["I can't find a bill on your account yet."], actions: [route('Open bill', '/bill')] }, q.now);
  const m = monthName(b.periodEnd);
  const due = fmtDate(b.dueDate, { weekday: 'short', month: 'short', day: 'numeric' });
  const days = Math.ceil((new Date(b.dueDate).getTime() - q.now.getTime()) / 86400000);
  const text: string[] = [];
  if (b.status === 'PAID') {
    text.push(`Your ${m} bill of **${fmtMoney(b.total)}** is **paid**. Nothing is due right now.`);
  } else {
    text.push(`Your ${m} bill of **${fmtMoney(b.total)}** is due **${due}**${days > 0 ? `, in ${days} day${days === 1 ? '' : 's'}` : days === 0 ? ', today' : ''}.`);
    text.push(f.autoPay?.enabled ? 'AutoPay is on, so it will be paid automatically on the due date.' : 'You can pay it now in the app, or switch on AutoPay in Settings.');
  }
  return answer(
    'BILL_DUE',
    {
      text,
      facts: [
        { label: 'Amount', value: fmtMoney(b.total) },
        { label: 'Due', value: fmtDate(b.dueDate, { month: 'short', day: 'numeric' }) },
        { label: 'Status', value: b.status === 'PAID' ? 'Paid' : 'Unpaid', tone: b.status === 'PAID' ? 'good' : 'warn' },
        { label: 'AutoPay', value: f.autoPay?.enabled ? 'On' : 'Off' },
      ],
      followUps: ['Why is my bill high?', 'How much energy have I used today?', 'Which rate plan is best for me?'],
      actions: b.status === 'PAID' ? [route('Open bill', '/bill')] : [route('Pay now', '/pay'), route('Open bill', '/bill')],
    },
    q.now,
  );
}

// ---------------------------------------------------------------- USAGE_TODAY

export function usageToday(q: CustomerQuestion, f: CustomerFacts): AssistantAnswer {
  const e = f.energy;
  if (!e) return fallback(q);
  const today = e.range === 'day';
  const when = today ? 'Today so far' : e.label;
  const text = [`${when} you've used **${e.consumptionKwh.toFixed(1)} kWh**${e.hasSolar ? ` and your panels made **${e.productionKwh.toFixed(1)} kWh**` : ''}. Estimated cost: **${fmtMoney(e.costEstimate)}**.`];
  const biggest = [...e.breakdown].sort((a, b) => b.kWh - a.kWh)[0];
  if (biggest && biggest.kWh > 0) text.push(`The biggest share is ${biggest.label.toLowerCase()} at ${biggest.kWh.toFixed(1)} kWh (${pct(biggest.kWh, e.consumptionKwh)}%).`);
  if (today && f.live) text.push(`Right now your home is drawing **${f.live.homeKw.toFixed(1)} kW**${f.live.evKw > 0 ? `, ${f.live.evKw.toFixed(1)} kW of it EV charging` : ''}.`);
  return answer(
    'USAGE_TODAY',
    {
      text,
      facts: [
        { label: 'Used', value: `${e.consumptionKwh.toFixed(1)} kWh` },
        { label: 'Cost', value: fmtMoney(e.costEstimate) },
        ...(e.hasSolar ? [{ label: 'Solar', value: `${e.productionKwh.toFixed(1)} kWh`, tone: 'good' as const }] : []),
        ...(today && f.live ? [{ label: 'Now', value: `${f.live.homeKw.toFixed(1)} kW` }] : []),
      ],
      chart: { kind: 'bar', unit: 'kWh', points: e.breakdown.map((b) => ({ label: b.label, value: b.kWh, highlight: b.key === biggest?.key })) },
      followUps: ['How much does charging my EV cost?', "What's the best time to charge?", ...(e.hasSolar ? ['How are my solar panels doing?'] : ['Why is my bill high?'])],
      actions: [route('Open energy', '/energy')],
    },
    q.now,
  );
}

// ---------------------------------------------------------------- EV_COST

export function evCost(q: CustomerQuestion, f: CustomerFacts): AssistantAnswer {
  const e = f.energy;
  const evKwh = e?.breakdown.find((b) => b.key === 'ev')?.kWh ?? 0;
  if (!hasEv(f.evStatus) && evKwh === 0) {
    return answer(
      'EV_COST',
      {
        text: ["We haven't detected an EV charging at your home, so there's no EV cost to show yet.", 'If you have just got one, it will show up here once your smart meter picks up the charging pattern.'],
        followUps: ['How much energy have I used today?', 'Why is my bill high?', "What's the best time to charge?"],
        actions: [route('Open energy', '/energy')],
      },
      q.now,
    );
  }
  const cost = evKwh * DEMO_RATE_PER_KWH;
  const text = [`${e ? `${e.label}` : 'This month'} EV charging has used about **${evKwh.toFixed(0)} kWh**, roughly **${fmtMoney(cost)}** at the demo rate of ${fmtMoney(DEMO_RATE_PER_KWH)}/kWh.`];
  const share = f.bill?.evSharePct ?? null;
  if (f.bill && share !== null) text.push(`On your last bill, EV charging was about **${share}%**, around ${fmtMoney((f.bill.total * share) / 100)}.`);
  const plan = f.plan;
  if (smartOn(plan) && plan) text.push(`${SMART_CHARGING.name} is on and saves about **${fmtMoney(plan.savings)}** a night compared with charging as soon as you plug in.`);
  else text.push(`${SMART_CHARGING.name} is off. Moving charging to off-peak hours could cut that cost.`);
  const facts: AssistantFact[] = [
    { label: 'EV energy', value: `${evKwh.toFixed(0)} kWh` },
    { label: 'EV cost', value: fmtMoney(cost) },
  ];
  if (share !== null) facts.push({ label: 'Share of bill', value: `${share}%` });
  if (smartOn(plan) && plan) facts.push({ label: 'Saving/night', value: fmtMoney(plan.savings), tone: 'good' });
  return answer(
    'EV_COST',
    {
      text,
      facts,
      chart: e ? { kind: 'bar', unit: 'kWh', points: e.breakdown.map((b) => ({ label: b.label, value: b.kWh, highlight: b.key === 'ev' })) } : null,
      followUps: ["What's the best time to charge?", 'Which rate plan is best for me?', 'Is there a grid event coming up?'],
      actions: [route(smartOn(plan) ? 'Open smart charging' : 'Set up smart charging', '/smart-charging'), route('Open energy', '/energy')],
    },
    q.now,
  );
}

// ---------------------------------------------------------------- BEST_TIME

export function bestTime(q: CustomerQuestion, f: CustomerFacts): AssistantAnswer {
  const planId: RatePlanId = f.plan?.settings.ratePlan ?? 'TOU';
  const def = RATE_PLANS[planId];
  const { weekend } = localClock(q.now);
  const rates = hourlyRates(planId, weekend);
  const block = cheapestBlock(rates);
  const peak = Math.max(...rates);
  const clean = block.hours === 24 ? cleanestHour() : cleanestHour(block.start, block.hours);
  const dayKind = weekend ? 'today (weekend)' : 'on weekdays';
  const text: string[] = [];
  if (block.hours === 24) {
    text.push(`On ${def.label} pricing the rate is the same all day ${dayKind} (**$${block.rate.toFixed(3)}/kWh**), so timing doesn't change the price.`);
  } else {
    text.push(`On ${def.label}, the cheapest hours ${dayKind} are **${hourLabel(block.start)}–${hourLabel(block.end)}** at **$${block.rate.toFixed(3)}/kWh**, versus $${peak.toFixed(3)} at the peak.`);
  }
  text.push(`The grid is cleanest around **${hourLabel(clean.hour)}** (${clean.g} g CO₂/kWh vs ${Math.max(...GRID_CO2_G_PER_KWH)} at the evening peak), so overnight charging is both cheaper and lower-carbon.`);
  const plan = f.plan;
  if (smartOn(plan) && plan) {
    text.push(plan.chargingNow ? `${SMART_CHARGING.name} is charging your car right now.` : plan.nextStart ? `${SMART_CHARGING.name} will start your car at **${fmtTime(plan.nextStart)}** and have it ready by ${plan.settings.readyBy}.` : `${SMART_CHARGING.name} is on and picks these hours for you.`);
  } else if (hasEv(f.evStatus)) {
    text.push(`${SMART_CHARGING.name} can pick these hours for you automatically.`);
  }
  text.push('Rates are placeholder Ontario-style prices for this demo.');
  return answer(
    'BEST_TIME',
    {
      text,
      facts: [
        { label: 'Cheapest', value: block.hours === 24 ? 'All day' : `${hourLabel(block.start)}–${hourLabel(block.end)}`, tone: 'good' },
        { label: 'Rate', value: `$${block.rate.toFixed(3)}/kWh` },
        { label: 'Cleanest', value: hourLabel(clean.hour) },
        { label: 'Plan', value: def.label },
      ],
      chart: { kind: 'bar', unit: '¢/kWh', points: rates.map((r, h) => ({ label: hourLabel(h).replace(' AM', 'a').replace(' PM', 'p'), value: Math.round(r * 1000) / 10, highlight: r === block.rate && block.hours < 24 })) },
      followUps: ['Which rate plan is best for me?', 'How much does charging my EV cost?', 'Is there a grid event coming up?'],
      actions: [route(smartOn(plan) ? 'Open smart charging' : 'Set up smart charging', '/smart-charging')],
    },
    q.now,
  );
}

// ---------------------------------------------------------------- RATE_PLAN

export function ratePlan(q: CustomerQuestion, f: CustomerFacts): AssistantAnswer {
  const current: RatePlanId = f.plan?.settings.ratePlan ?? 'TOU';
  const kwh = f.bill?.kWh ?? f.bills?.[0]?.kWh ?? 700;
  const evShare = hasEv(f.evStatus) ? (f.bill?.evSharePct ?? 38) / 100 : 0;
  const cmp = f.ratePlans ?? estimatePlans(kwh, evShare, current);
  const key = (p: RatePlanComparison['plans'][number]) => (evShare > 0 ? p.withSmartCharging : p.monthlyCost);
  const best = cmp.plans.find((p) => p.best) ?? cmp.plans[0];
  const cur = cmp.plans.find((p) => p.current) ?? cmp.plans.find((p) => p.id === current) ?? cmp.plans[0];
  const text = [
    `Based on about ${fmtInt(cmp.basisKwhPerMonth)} kWh a month, **${best.label}** would be cheapest at about **${fmtMoney(key(best))}** a month${evShare > 0 ? ' with your EV charging overnight' : ''}.`,
  ];
  if (best.id === cur.id) text.push(`That's the plan you're on, so there's nothing to switch.`);
  else text.push(`You're on ${cur.label} (about ${fmtMoney(key(cur))}), so switching could save around **${fmtMoney(key(cur) - key(best))}** a month.`);
  const others = cmp.plans.filter((p) => p.id !== best.id).map((p) => `${p.label} ${fmtMoney(key(p))}`);
  text.push(`Others: ${others.join(', ')}. Energy charge only, using placeholder rates.`);
  return answer(
    'RATE_PLAN',
    {
      text,
      facts: cmp.plans.map((p) => ({ label: p.label, value: fmtMoney(key(p)), tone: p.best ? ('good' as const) : ('default' as const) })),
      chart: { kind: 'bar', unit: '$/month', points: cmp.plans.map((p) => ({ label: p.label, value: key(p), highlight: p.best })) },
      followUps: ["What's the best time to charge?", 'How much does charging my EV cost?', 'Why is my bill high?'],
      actions: [route('Compare plans', '/smart-charging'), route('Open bill', '/bill')],
    },
    q.now,
  );
}

// ---------------------------------------------------------------- SOLAR

export function solar(q: CustomerQuestion, f: CustomerFacts): AssistantAnswer {
  const e = f.energy;
  if (!f.hasSolar || !e || !e.hasSolar) {
    return answer('SOLAR', { text: ["Your account doesn't have solar panels, so there's no production to show."], followUps: ['How much energy have I used today?', 'Which rate plan is best for me?'], actions: [route('Open energy', '/energy')] }, q.now);
  }
  const today = e.range === 'day';
  const text = [`${today ? 'Today' : e.label} your panels have made **${e.productionKwh.toFixed(1)} kWh**${e.peakSolarW && e.peakSolarAt && today ? `, peaking at ${fmtInt(e.peakSolarW)} W around ${fmtTime(e.peakSolarAt)}` : ''}.`];
  if (e.productionKwh > 0.05) text.push(`You used **${e.selfConsumptionPct ?? 0}%** of it at home and sent ${e.exportedKwh.toFixed(1)} kWh back to the grid.`);
  else text.push("There's been no sun on the panels yet today.");
  if (today && f.live) text.push(`Right now they're producing ${f.live.solarKw.toFixed(2)} kW.`);
  return answer(
    'SOLAR',
    {
      text,
      facts: [
        { label: 'Produced', value: `${e.productionKwh.toFixed(1)} kWh`, tone: 'good' },
        { label: 'Self-used', value: `${e.selfConsumptionPct ?? 0}%` },
        { label: 'Exported', value: `${e.exportedKwh.toFixed(1)} kWh` },
      ],
      chart: { kind: 'bar', unit: 'kWh', points: [{ label: 'Produced', value: e.productionKwh, highlight: true }, { label: 'Used at home', value: e.selfConsumedKwh }, { label: 'Exported', value: e.exportedKwh }] },
      followUps: ['How much energy have I used today?', "What's the best time to charge?"],
      actions: [route('Open energy', '/energy')],
    },
    q.now,
  );
}

// ---------------------------------------------------------------- GRID_EVENT

export function gridEvent(q: CustomerQuestion, f: CustomerFacts): AssistantAnswer {
  const ev = f.activeDrEvent;
  const enrolled = f.evStatus === 'ENROLLED';
  if (ev) {
    const window = fmtWindow(ev.windowStart, ev.windowEnd);
    const text: string[] = [];
    if (ev.status === 'ACTIVE') text.push(`Yes, a grid event is on now, until **${fmtTime(ev.windowEnd)}**: “${ev.title}”.`);
    else if (ev.status === 'SCHEDULED') text.push(`Yes. “${ev.title}” is scheduled for **${window}** on your street.`);
    else text.push(`The last grid event, “${ev.title}”, ended at ${fmtTime(ev.windowEnd)}.`);
    if (ev.myResponse === 'PAUSE') text.push(`You've chosen to pause charging${ev.status === 'ENDED' ? '' : ` and will earn ${PROGRAM.perEventIncentive}`}. Thank you!`);
    else if (ev.myResponse === 'OPT_OUT') text.push("You've opted out of this one. That's fine; it won't affect your membership.");
    else if (ev.status !== 'ENDED') text.push(`You haven't responded yet. Pausing your EV charging earns ${PROGRAM.perEventIncentive}.`);
    return answer(
      'GRID_EVENT',
      {
        text,
        facts: [
          { label: 'Window', value: window },
          { label: 'Status', value: ev.status.toLowerCase(), tone: ev.status === 'ACTIVE' ? 'warn' : 'default' },
          { label: 'Your response', value: ev.myResponse === 'PAUSE' ? 'Pausing' : ev.myResponse === 'OPT_OUT' ? 'Opted out' : ev.myResponse === 'REMIND' ? 'Remind me' : 'None yet' },
        ],
        followUps: ["What's the best time to charge?", 'How much does charging my EV cost?'],
        actions: [route('Open event', `/dr-events/${ev.id}`)],
      },
      q.now,
    );
  }
  return answer(
    'GRID_EVENT',
    {
      text: enrolled
        ? ['No grid events are scheduled for your area right now.', `As a ${PROGRAM.name} member you'll get a notice before the next one, and earn ${PROGRAM.perEventIncentive} for each event you take part in.`]
        : ['No grid events are scheduled for your area right now.', `Join ${PROGRAM.name} to earn ${PROGRAM.signupIncentive} on sign-up and ${PROGRAM.perEventIncentive} for each event you take part in.`],
      facts: [{ label: 'Events now', value: 'None', tone: 'good' }, { label: 'Program', value: enrolled ? 'Enrolled' : 'Not enrolled' }],
      followUps: ["What's the best time to charge?", 'Is there an outage near me?'],
      actions: [route(enrolled ? 'Open program' : 'See the program', '/program')],
    },
    q.now,
  );
}

// ---------------------------------------------------------------- OUTAGE

export function outage(q: CustomerQuestion, f: CustomerFacts): AssistantAnswer {
  const o = f.outage;
  if (o && o.status !== 'RESTORED') {
    const status = o.status === 'CREW_ASSIGNED' ? 'A crew is assigned' : 'Crews are investigating';
    return answer(
      'OUTAGE',
      {
        text: [
          `Yes, there's an outage on **${o.feederCode}** near you affecting **${fmtInt(o.affectedCount)}** customers.`,
          `${status}${o.estRestoreAt ? ` and power is expected back by **${fmtTime(o.estRestoreAt)}**` : ''}.${o.cause ? ` Cause: ${o.cause}.` : ''}`,
        ],
        facts: [
          { label: 'Affected', value: fmtInt(o.affectedCount), tone: 'warn' },
          { label: 'Status', value: o.status === 'CREW_ASSIGNED' ? 'Crew assigned' : 'Investigating' },
          ...(o.estRestoreAt ? [{ label: 'Est. restore', value: fmtTime(o.estRestoreAt) }] : []),
        ],
        followUps: ['Is there a grid event coming up?', 'How much energy have I used today?'],
        actions: [route('Open outage map', '/outage')],
      },
      q.now,
    );
  }
  return answer(
    'OUTAGE',
    {
      text: ['There are no known outages near you right now.', "If your power is out, report it and we'll let you know when it's back."],
      facts: [{ label: 'Outages nearby', value: 'None', tone: 'good' }],
      followUps: ['Is there a grid event coming up?', 'How much energy have I used today?'],
      actions: [route('Report an outage', '/outage')],
    },
    q.now,
  );
}

// ---------------------------------------------------------------- FALLBACK

export function fallback(q: CustomerQuestion): AssistantAnswer {
  return answer(
    'FALLBACK',
    {
      matched: false,
      text: [SCRIPTED_FALLBACK, 'I can help with your bill, energy use, EV charging costs, rate plans, solar, grid events and outages. Try one of these:'],
      followUps: [CUSTOMER_SUGGESTIONS[0], CUSTOMER_SUGGESTIONS[2], CUSTOMER_SUGGESTIONS[4], CUSTOMER_SUGGESTIONS[8]],
    },
    q.now,
  );
}

export const CUSTOMER_ANSWERS: Record<CustomerIntent | 'FALLBACK', (q: CustomerQuestion, f: CustomerFacts) => AssistantAnswer> = {
  BILL_WHY_HIGH: billWhyHigh,
  BILL_DUE: billDue,
  USAGE_TODAY: usageToday,
  EV_COST: evCost,
  BEST_TIME: bestTime,
  RATE_PLAN: ratePlan,
  SOLAR: solar,
  GRID_EVENT: gridEvent,
  OUTAGE: outage,
  FALLBACK: (q) => fallback(q),
};

export function answerCustomer(q: CustomerQuestion, f: CustomerFacts): AssistantAnswer {
  return CUSTOMER_ANSWERS[q.intent](q, f);
}

/** True when the latest bill's usage is more than 20% above the previous one (drives the dynamic suggestion). */
export function billJumped(bills: BillSummary[]): boolean {
  const [latest, prev] = bills;
  return !!latest && !!prev && prev.kWh > 0 && (latest.kWh - prev.kWh) / prev.kWh > 0.2;
}

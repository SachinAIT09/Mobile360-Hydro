import { describe, expect, it } from 'vitest';
import { CUSTOMER_INTENTS, STAFF_INTENTS, type CustomerIntent, type StaffIntent } from './intents.js';
import { extractEntities, matchIntent, normalise } from './nlu.js';

describe('normalise', () => {
  it('lowercases, strips punctuation and fixes common typos', () => {
    expect(normalise("Why's my BIL so hi??")).toBe('why is my bill so high');
    expect(normalise('How is SUB-26-F1 doing?')).toBe('how is sub-26-f1 doing');
    expect(normalise('  what’s   the — best time ')).toBe('what is the best time');
  });
});

describe('extractEntities', () => {
  it('finds feeder codes in any case and pads the substation number', () => {
    expect(extractEntities('compare sub-26-f1 and SUB-2-F1, then SUB-26-F1 again').feederCodes).toEqual(['SUB-26-F1', 'SUB-02-F1']);
    expect(extractEntities('how is SUB-11-F3?').substationCode).toBe('SUB-11');
  });
  it('finds a bare substation', () => {
    const e = extractEntities('anything going on at SUB-01?');
    expect(e.feederCodes).toEqual([]);
    expect(e.substationCode).toBe('SUB-01');
  });
  it('finds months, last month and ranges', () => {
    expect(extractEntities('why was my September bill so high').month).toBe(8);
    expect(extractEntities('what about sept').month).toBe(null);
    expect(extractEntities('my oct bill').month).toBe(9);
    expect(extractEntities('compare to last month').lastMonth).toBe(true);
    expect(extractEntities('I may be late').month).toBe(null);
    expect(extractEntities('usage in May').month).toBe(4);
    expect(extractEntities('usage today').range).toBe('today');
    expect(extractEntities('this week').range).toBe('week');
    expect(extractEntities('so far this month').range).toBe('today');
    expect(extractEntities('this month').range).toBe('month');
    expect(extractEntities('this year').range).toBe('year');
  });
  it('maps campaign type words', () => {
    expect(extractEntities('draft an offer').campaignType).toBe('ENROLL_OFFER');
    expect(extractEntities('write an enrollment message').campaignType).toBe('ENROLL_OFFER');
    expect(extractEntities('draft a stop charging request').campaignType).toBe('STOP_CHARGING');
    expect(extractEntities('ask them to pause').campaignType).toBe('STOP_CHARGING');
    expect(extractEntities('draft a DR message').campaignType).toBe(null);
    expect(extractEntities('draft a dr request').campaignType).toBe('STOP_CHARGING');
  });
  it('reads "top N"', () => {
    expect(extractEntities('top 3 blind spots').count).toBe(3);
    expect(extractEntities('show 5 feeders').count).toBe(5);
  });
});

const STAFF_PHRASES: Record<StaffIntent, string[]> = {
  FEEDER_STATUS: ['How is SUB-26-F1 doing?', 'status of feeder SUB-01-F2', 'sub-11-f3??', 'whats up with SUB-09-F1'],
  BLIND_SPOTS: ['Where are our biggest blind spots?', 'which feeders have the most unenrolled EVs', 'worst invisible feedrs', 'where should we target next'],
  OVERVIEW: ['Give me the network overview', 'how many EVs are there in total', 'big picture pls', 'summarise everything'],
  CAMPAIGN_PERFORMANCE: ['How did the last campaign perform?', 'what were the campaign results', 'how is the offer converting', 'camapign results?', 'which variant is winning the a/b test'],
  DR_PERFORMANCE: ['How did our DR events perform?', 'how much did demand response cut the peak', 'results of the grid event', 'dr events kwh shifted'],
  ENROLLMENT_TREND: ['How are enrollments trending?', 'how many sign ups this week', 'enrolment growth lately', 'daily signups'],
  GRID_RISK: ['Which feeders are at risk tonight?', 'any overload forecast for the evening peak', 'capacity hotspots', 'whats at risk 2nite'],
  DRAFT_CAMPAIGN: ['Draft an enrollment offer for SUB-26-F1', 'write a stop charging request for SUB-01-F1', 'compose an offer for the top 3 blind spots', 'draft msg pls'],
  FLEX_LOAD: ['How much flexible load do we have?', 'how many MW can we shift with smart charging', 'controllable load available', 'flex mw?'],
};

const CUSTOMER_PHRASES: Record<CustomerIntent, string[]> = {
  BILL_WHY_HIGH: ['Why is my bill high?', 'why did my bill go up so much', 'whys my bil so hi', 'How does my bill compare to last month?', 'why are there so many charges on my bill'],
  BILL_DUE: ['When is my bill due?', 'how much do I owe', 'when do i have to pay my bill', 'balance?'],
  USAGE_TODAY: ['How much energy have I used today?', 'my usage so far', 'how many kwh this week', 'electricity used right now'],
  EV_COST: ['How much does charging my EV cost?', 'what does it cost to charge my car', 'ev cost per month', 'how much am i spending on the tesla'],
  BEST_TIME: ["What's the best time to charge?", 'when should I charge my car', 'cheapest hours to run the dishwasher', 'when is it cheap to plug in'],
  RATE_PLAN: ['Which rate plan is best for me?', 'should I switch to ULO', 'compare time of use and tiered', 'is tou better'],
  SOLAR: ['How are my solar panels doing?', 'how much did my panels produce', 'solor export today', 'is my PV generating'],
  GRID_EVENT: ['Is there a grid event coming up?', 'any dr events tonight', 'do I need to pause for an event', 'peak alert?'],
  OUTAGE: ['Is there an outage near me?', 'my power is out', 'when will the power be restored', 'blackout??'],
};

describe('matchIntent: staff phrasings', () => {
  for (const [intent, phrases] of Object.entries(STAFF_PHRASES)) {
    it.each(phrases)(`${intent}: %s`, (p) => {
      expect(matchIntent(p, STAFF_INTENTS).intent).toBe(intent);
    });
  }
});

describe('matchIntent: customer phrasings', () => {
  for (const [intent, phrases] of Object.entries(CUSTOMER_PHRASES)) {
    it.each(phrases)(`${intent}: %s`, (p) => {
      expect(matchIntent(p, CUSTOMER_INTENTS).intent).toBe(intent);
    });
  }
});

describe('matchIntent: suggestions round-trip', () => {
  it.each(STAFF_INTENTS.map((d) => [d.id, d.suggestion]))('staff %s ← "%s"', (id, s) => {
    expect(matchIntent(s, STAFF_INTENTS).intent).toBe(id);
  });
  it.each(CUSTOMER_INTENTS.map((d) => [d.id, d.suggestion]))('customer %s ← "%s"', (id, s) => {
    expect(matchIntent(s, CUSTOMER_INTENTS).intent).toBe(id);
  });
});

describe('matchIntent: "charge" ambiguity', () => {
  it.each([
    ['why are the charges on my bill so high', 'BILL_WHY_HIGH'],
    ['what is the delivery charge on my bill', 'BILL_WHY_HIGH'],
    ['how much does it cost to charge my car', 'EV_COST'],
    ['when should I charge', 'BEST_TIME'],
    ['what is the cheapest time to charge my ev', 'BEST_TIME'],
    ['how much is my bill and when is it due', 'BILL_DUE'],
  ])('%s → %s', (q, intent) => {
    expect(matchIntent(q, CUSTOMER_INTENTS).intent).toBe(intent);
  });
});

describe('matchIntent: follow-ups and fallback', () => {
  it('a bare feeder follow-up inherits the last intent', () => {
    const m = matchIntent('and SUB-02-F1?', STAFF_INTENTS, { lastIntent: 'DRAFT_CAMPAIGN', feederCode: 'SUB-26-F1' });
    expect(m.intent).toBe('DRAFT_CAMPAIGN');
    expect(m.followUp).toBe(true);
    expect(m.entities.feederCodes).toEqual(['SUB-02-F1']);
  });
  it('"what about September?" inherits a bill question', () => {
    const m = matchIntent('what about September?', CUSTOMER_INTENTS, { lastIntent: 'BILL_WHY_HIGH' });
    expect(m.intent).toBe('BILL_WHY_HIGH');
    expect(m.entities.month).toBe(8);
  });
  it('a bare feeder code with no context is a feeder status question', () => {
    expect(matchIntent('SUB-26-F1', STAFF_INTENTS).intent).toBe('FEEDER_STATUS');
  });
  it('a full new question is not swallowed by the follow-up rule', () => {
    expect(matchIntent('and how did the last campaign perform?', STAFF_INTENTS, { lastIntent: 'FEEDER_STATUS' }).intent).toBe('CAMPAIGN_PERFORMANCE');
  });
  it('unknown questions fall back', () => {
    expect(matchIntent("what's the weather", STAFF_INTENTS).intent).toBe('FALLBACK');
    expect(matchIntent("what's the weather", CUSTOMER_INTENTS).intent).toBe('FALLBACK');
    expect(matchIntent('tell me a joke', CUSTOMER_INTENTS, { lastIntent: 'BILL_DUE' }).intent).toBe('FALLBACK');
    expect(matchIntent('', STAFF_INTENTS).intent).toBe('FALLBACK');
  });
  it('ignores a lastIntent from the other audience', () => {
    expect(matchIntent('and SUB-02-F1?', CUSTOMER_INTENTS, { lastIntent: 'FEEDER_STATUS' }).intent).toBe('FALLBACK');
  });
});

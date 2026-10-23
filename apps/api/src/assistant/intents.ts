import type { IntentDef } from './nlu.js';

export type StaffIntent =
  | 'FEEDER_STATUS'
  | 'BLIND_SPOTS'
  | 'OVERVIEW'
  | 'CAMPAIGN_PERFORMANCE'
  | 'DR_PERFORMANCE'
  | 'ENROLLMENT_TREND'
  | 'GRID_RISK'
  | 'DRAFT_CAMPAIGN'
  | 'FLEX_LOAD';

export type CustomerIntent = 'BILL_WHY_HIGH' | 'BILL_DUE' | 'USAGE_TODAY' | 'EV_COST' | 'BEST_TIME' | 'RATE_PLAN' | 'SOLAR' | 'GRID_EVENT' | 'OUTAGE';

/**
 * Staff intents. Weights: a distinctive topic word ≈ 2–3, a supporting word ≈ 1–1.5; threshold 2.
 * Feeder codes boost FEEDER_STATUS (and DRAFT_CAMPAIGN a little) so "SUB-26-F1?" alone still answers.
 */
export const STAFF_INTENTS: readonly IntentDef<StaffIntent>[] = [
  {
    id: 'FEEDER_STATUS',
    suggestion: 'How is SUB-01-F1 doing?',
    priority: 5,
    feederBoost: 2.5,
    groups: [
      { words: ['how is', 'how are', 'doing', 'status', 'health', 'looking', 'tell me about', 'details', 'detail', 'stats for', 'numbers for', 'whats up with', 'what is up with'], weight: 1 },
      { words: ['feeder', 'circuit', 'line'], weight: 1 },
    ],
    negative: ['draft', 'write', 'compose'],
  },
  {
    id: 'BLIND_SPOTS',
    suggestion: 'Where are our biggest blind spots?',
    priority: 6,
    groups: [
      { words: ['blind spot', 'blindspot', 'blind', 'invisible', 'hidden', 'unseen', 'not enrolled', 'unenrolled', 'gap', 'gaps', 'untapped', 'opportunit', 'target next', 'should we target', 'who to target'], weight: 2.5 },
      { words: ['worst', 'biggest', 'top', 'where', 'which feeders', 'rank', 'most'], weight: 1 },
    ],
    negative: ['draft', 'write', 'compose', 'trend'],
  },
  {
    id: 'OVERVIEW',
    suggestion: 'Give me the network overview',
    priority: 3,
    groups: [
      { words: ['overview', 'headline', 'big picture', 'overall', 'network', 'across', 'everything', 'summary', 'summarise', 'summarize', 'totals', 'territory', 'whole'], weight: 2 },
      { words: ['how many evs', 'how many ev', 'total evs', 'all evs', 'evs do we', 'evs are there'], weight: 2 },
      { words: ['evs', 'substations', 'premises'], weight: 0.5 },
    ],
  },
  {
    id: 'CAMPAIGN_PERFORMANCE',
    suggestion: 'How did the last campaign perform?',
    priority: 6,
    groups: [
      { words: ['campaign', 'campaigns', 'offer', 'outreach', 'message', 'a/b', 'ab test', 'variant'], weight: 2 },
      { words: ['perform', 'result', 'results', 'how did', 'how is', 'how are', 'convert', 'conversion', 'open rate', 'opened', 'response rate', 'winner', 'winning', 'last', 'latest', 'working', 'land'], weight: 1.5 },
    ],
    negative: ['draft', 'write', 'compose', 'create a', 'new campaign', 'prepare'],
  },
  {
    id: 'DR_PERFORMANCE',
    suggestion: 'How did our DR events perform?',
    priority: 5,
    groups: [
      { words: ['dr event', 'dr events', 'demand response', 'grid event', 'grid events', 'event', 'events', 'curtail', 'dr program'], weight: 2 },
      { words: ['perform', 'result', 'results', 'how did', 'shift', 'shifted', 'paused', 'reduc', 'mw', 'kwh', 'saved', 'cut', 'delivered', 'went'], weight: 1.5 },
    ],
    negative: ['draft', 'write', 'compose', 'tonight', 'risk'],
  },
  {
    id: 'ENROLLMENT_TREND',
    suggestion: 'How are enrollments trending?',
    priority: 5,
    groups: [
      { words: ['enroll', 'sign up', 'signup', 'sign ups', 'signups', 'joined', 'joining', 'join', 'recruit'], weight: 2 },
      { words: ['trend', 'trending', 'per day', 'daily', 'over time', 'growth', 'growing', 'pace', 'how many', 'last 30', 'this week', 'this month', 'today', 'lately', 'recent'], weight: 1.5 },
    ],
    negative: ['draft', 'write', 'compose', 'offer for', 'blind'],
  },
  {
    id: 'GRID_RISK',
    suggestion: 'Which feeders are at risk tonight?',
    priority: 6,
    groups: [
      { words: ['risk', 'at risk', 'overload', 'forecast', 'capacity', 'stress', 'constrain', 'hot spot', 'hotspot', 'congest', 'peak load', 'overloaded', 'danger'], weight: 2.5 },
      { words: ['tonight', 'today', 'peak', 'load', 'evening', 'this afternoon'], weight: 1 },
    ],
    negative: ['draft', 'write', 'compose'],
  },
  {
    id: 'DRAFT_CAMPAIGN',
    suggestion: 'Draft an enrollment offer for SUB-26-F1',
    priority: 8,
    feederBoost: 0.5,
    groups: [
      { words: ['draft', 'write', 'compose', 'create', 'prepare', 'suggest copy', 'come up with', 'make', 'build'], weight: 2.5 },
      { words: ['offer', 'campaign', 'message', 'copy', 'text', 'push', 'notification', 'request', 'stop charging', 'enroll', 'outreach', 'email', 'sms'], weight: 1.5 },
    ],
  },
  {
    id: 'FLEX_LOAD',
    suggestion: 'How much flexible load do we have?',
    priority: 5,
    groups: [
      { words: ['flexib', 'flex', 'shiftable', 'controllable', 'dispatchable', 'smart charging', 'smart charg', 'curtailable', 'pausable', 'headroom'], weight: 2.5 },
      { words: ['load', 'mw', 'kw', 'capacity', 'how much', 'available'], weight: 1 },
    ],
    negative: ['draft', 'write', 'compose'],
  },
];

/**
 * Customer intents. "charge" is ambiguous: bill words ("charges", "delivery", "bill") steer to the bill
 * intents, car words ("ev", "car", "charging my") to EV_COST / BEST_TIME (see the spec table).
 */
export const CUSTOMER_INTENTS: readonly IntentDef<CustomerIntent>[] = [
  {
    id: 'BILL_WHY_HIGH',
    suggestion: 'Why is my bill high?',
    priority: 7,
    groups: [
      { words: ['bill', 'charges', 'statement', 'invoice'], weight: 2 },
      { words: ['why', 'high', 'higher', 'expensive', 'more than', 'went up', 'gone up', 'increase', 'jump', 'jumped', 'so much', 'big', 'bigger', 'spike', 'compare', 'compared', 'last month', 'explain', 'breakdown'], weight: 1.5 },
    ],
    patterns: [{ re: /\bwhy\b.*\b(so )?(high|much|expensive|up)\b/, weight: 1 }],
    negative: ['due', 'when do i', 'owe', 'pay my', 'autopay'],
  },
  {
    id: 'BILL_DUE',
    suggestion: 'When is my bill due?',
    priority: 6,
    groups: [
      { words: ['due', 'owe', 'balance', 'deadline', 'pay my', 'payment', 'pay the', 'outstanding', 'autopay', 'amount due'], weight: 2.5 },
      { words: ['bill', 'when', 'how much'], weight: 1 },
    ],
  },
  {
    id: 'USAGE_TODAY',
    suggestion: 'How much energy have I used today?',
    priority: 4,
    groups: [
      { words: ['usage', 'use', 'used', 'using', 'consum', 'kwh', 'energy', 'electricity', 'power used'], weight: 2 },
      { words: ['today', 'so far', 'right now', 'currently', 'this week', 'this month', 'this year', 'how much', 'live'], weight: 1 },
    ],
    negative: ['outage', 'solar', 'bill', 'car', 'ev', 'charging', 'cost to charge'],
  },
  {
    id: 'EV_COST',
    suggestion: 'How much does charging my EV cost?',
    priority: 5,
    groups: [
      { words: ['ev', 'evs', 'car', 'vehicle', 'tesla', 'charging', 'charge my', 'charger', 'electric car'], weight: 2 },
      { words: ['cost', 'costs', 'spend', 'spending', 'how much', 'price', 'dollar', 'money', 'expensive', '$'], weight: 2 },
    ],
    negative: ['best time', 'cheapest time', 'when should', 'what time', 'when to', 'rate plan', 'event', 'charges on', 'delivery'],
  },
  {
    id: 'BEST_TIME',
    suggestion: "What's the best time to charge?",
    priority: 6,
    groups: [
      { words: ['best time', 'cheapest', 'cheaper time', 'when should', 'what time', 'when to', 'when is it cheap', 'off peak', 'off-peak', 'overnight', 'cleanest', 'greenest', 'lowest rate', 'cheap hours'], weight: 3 },
      { words: ['charge', 'charging', 'run', 'dishwasher', 'laundry', 'plug in', 'plug'], weight: 1 },
    ],
    negative: ['rate plan', 'which plan', 'switch'],
  },
  {
    id: 'RATE_PLAN',
    suggestion: 'Which rate plan is best for me?',
    priority: 6,
    groups: [
      { words: ['rate plan', 'price plan', 'plan', 'plans', 'tou', 'time-of-use', 'time of use', 'ulo', 'ultra-low', 'ultra low', 'tiered', 'tier'], weight: 2.5 },
      { words: ['switch', 'save', 'cheaper', 'best', 'which', 'compare', 'should i', 'better'], weight: 1 },
    ],
    negative: ['program', 'enroll'],
  },
  {
    id: 'SOLAR',
    suggestion: 'How are my solar panels doing?',
    priority: 5,
    groups: [{ words: ['solar', 'panel', 'panels', 'sunshine', 'generat', 'produc', 'export', 'self-consum', 'self consum', 'pv'], weight: 3 }],
  },
  {
    id: 'GRID_EVENT',
    suggestion: 'Is there a grid event coming up?',
    priority: 5,
    groups: [
      { words: ['grid event', 'dr event', 'event', 'events', 'demand response', 'peak alert', 'peak event', 'conservation'], weight: 3 },
      { words: ['pause', 'program', 'reward', 'earn', 'incentive', 'coming up', 'next', 'scheduled', 'today', 'tonight'], weight: 1 },
    ],
  },
  {
    id: 'OUTAGE',
    suggestion: 'Is there an outage near me?',
    priority: 8,
    groups: [{ words: ['outage', 'power out', 'power is out', 'no power', 'blackout', 'power cut', 'restor', 'crew', 'lights out', 'lights are out', 'power back', 'power down'], weight: 3 }],
  },
];

export const STAFF_SUGGESTIONS = STAFF_INTENTS.map((d) => d.suggestion);
export const CUSTOMER_SUGGESTIONS = CUSTOMER_INTENTS.map((d) => d.suggestion);

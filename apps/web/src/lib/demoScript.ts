import { BRAND, PROGRAM, type Api, type Campaign, type DemoState, type DrEvent, type LiveEvent } from '@demo/shared';
import { campaignLink } from './links';

/**
 * The presenter's script (docs/BUILD_SPEC.md §13) as data, so the demo panel and the presenter bar can
 * drive it: each step has a talk track, what to expect on each screen, an optional one-click action, and
 * an optional rule for marking itself done from live state or socket events.
 */

export type ScriptEvent =
  | { name: 'liveEvent:new'; event: LiveEvent }
  | { name: 'feeder:statsChanged' }
  | { name: 'campaign:statsChanged'; campaign: Campaign }
  | { name: 'drEvent:statusChanged'; event: DrEvent }
  | { name: 'demo:reset' };

export interface ScriptActionResult {
  text: string;
  /** Route to open next (e.g. a prefilled Campaign 360 page). */
  link?: string;
}

export interface ScriptStep {
  id: string;
  /** Use-case grouping shown as section headers. */
  phase: 'Setup' | 'Tour' | 'Use case 1' | 'Use case 2a' | 'Use case 2b' | 'Wrap-up';
  title: string;
  /** What the presenter says (short). */
  talkTrack: string;
  expect: { phone?: string; web?: string };
  /** One-click action; runs through the same API calls as the manual controls. */
  action?: {
    label: string;
    tone?: 'primary' | 'warn' | 'secondary';
    run: (ctx: { api: Api; state: DemoState | null }) => Promise<ScriptActionResult>;
  };
  /** Staff page to be on for this step. */
  link?: string;
  /** Marks the step done from a socket event. */
  advanceOn?: (ev: ScriptEvent) => boolean;
  /** Marks the step done from polled demo state. */
  doneWhen?: (state: DemoState) => boolean;
}

const unenrolled = (s: DemoState | null) => s?.customers.find((c) => c.role === 'UNENROLLED_DEMO') ?? null;
const enrolled = (s: DemoState | null) => s?.customers.find((c) => c.role === 'ENROLLED_DEMO') ?? null;
const EV = BRAND.partners.evDetection;

export const DEMO_SCRIPT: ScriptStep[] = [
  {
    id: 'setup',
    phase: 'Setup',
    title: 'Split screen: staff app left, phone right',
    talkTrack: `Staff see the grid; the customer sees their home. Everything in between is ${BRAND.vendorName} on top of ${EV} detection.`,
    expect: { web: 'Feeder visibility open', phone: 'Signed in as the unenrolled customer' },
    link: '/feeders',
    doneWhen: (s) => !!unenrolled(s)?.online,
  },
  {
    id: 'tour',
    phase: 'Tour',
    title: 'Portal basics on the phone',
    talkTrack: `Home, the bill, paying through ${BRAND.partners.payments}, reporting an outage, and live self-consumption on Energy.`,
    expect: { phone: 'Energy screen updates every 5 seconds' },
  },
  {
    id: 'uc1-detect',
    phase: 'Use case 1',
    title: 'EV detected at the customer’s home',
    talkTrack: `${EV} sees a new EV charging. Nobody has enrolled it. The app invites them on the spot.`,
    expect: { phone: 'Banner, then the EV-detected sheet', web: 'Live row “New EV detected · ✓ Auto-sent”, unenrolled +1' },
    link: '/feeders',
    action: {
      label: 'Simulate EV detected',
      tone: 'primary',
      run: async ({ api, state }) => {
        const c = unenrolled(state);
        if (!c) throw new Error('No unenrolled demo customer. Reset the demo first.');
        const e = await api.simEvDetected(c.customerId);
        return { text: `${e.headline} ${e.summary}` };
      },
    },
    advanceOn: (ev) => ev.name === 'liveEvent:new' && ev.event.kind === 'EV_DETECTED',
  },
  {
    id: 'uc1-enroll',
    phase: 'Use case 1',
    title: 'Enroll from the phone',
    talkTrack: `“See program & enroll”, consent, “Enroll now”. The feeder counts on the left move the moment they tap.`,
    expect: { phone: `Enrolled screen, Home card “Enrolled · ${PROGRAM.name}”`, web: 'Known +1, unenrolled −1 without refresh' },
    link: '/feeders',
    doneWhen: (s) => unenrolled(s)?.evStatus === 'ENROLLED',
  },
  {
    id: 'uc2a-reset',
    phase: 'Use case 2a',
    title: 'Reset to the starting state',
    talkTrack: 'Back to square one; the phone stays signed in.',
    expect: { web: 'Counts back to 1,726 / 1,770', phone: 'Home, no EV card' },
    action: {
      label: 'Reset demo (keep phone signed in)',
      tone: 'secondary',
      run: async ({ api }) => {
        await api.demoReset({ keepSessions: true });
        return { text: 'Demo reset to the starting state.' };
      },
    },
    advanceOn: (ev) => ev.name === 'demo:reset',
  },
  {
    id: 'uc2a-cluster',
    phase: 'Use case 2a',
    title: '284 EVs stopped charging on SUB-01',
    talkTrack: `${EV} sees a cluster of EVs stop at the same time. 118 of them are invisible to the program.`,
    expect: { web: 'Live row with “Target 118 with enrollment offer”' },
    link: '/feeders',
    action: {
      label: 'Simulate stopped-charging cluster',
      tone: 'primary',
      run: async ({ api }) => {
        const e = await api.simCluster('SUB-01');
        return { text: `${e.headline} ${e.summary}`, link: e.suggested ? campaignLink(e.suggested.campaignType, e.suggested.audience) : undefined };
      },
    },
    advanceOn: (ev) => ev.name === 'liveEvent:new' && ev.event.kind === 'STOPPED_CHARGING_CLUSTER',
  },
  {
    id: 'uc2a-send',
    phase: 'Use case 2a',
    title: 'Send the enrollment offer with Campaign 360',
    talkTrack: 'Audience, message with merge fields, channels, send. One click reaches all 118.',
    expect: { web: 'Results panel: Sent 118, Delivered and Opened ticking', phone: `Banner “EV owners near you are saving with ${PROGRAM.name}”` },
    advanceOn: (ev) => ev.name === 'liveEvent:new' && ev.event.kind === 'CAMPAIGN_SENT',
  },
  {
    id: 'uc2a-enroll',
    phase: 'Use case 2a',
    title: 'Open the offer and enroll on the phone',
    talkTrack: 'Opened +1 the moment it is read; Enrolled +1 when they join. The feeder counts move too.',
    expect: { phone: 'Offer → Enroll in 1 minute → Enrolled', web: 'Opened +1, Enrolled +1' },
    doneWhen: (s) => unenrolled(s)?.evStatus === 'ENROLLED',
  },
  {
    id: 'uc2b-switch',
    phase: 'Use case 2b',
    title: 'Switch the phone to the enrolled customer',
    talkTrack: 'Now the other side of the program: a customer who is already enrolled, on a feeder about to run hot.',
    expect: { phone: 'Signed in as the enrolled customer (Settings → Switch account)' },
    doneWhen: (s) => !!enrolled(s)?.online,
  },
  {
    id: 'uc2b-forecast',
    phase: 'Use case 2b',
    title: 'Feeder forecast at 92% of capacity',
    talkTrack: 'The forecast says SUB-01-F1 will be at 92% this evening. Enrolled EVs are the flexible load.',
    expect: { web: 'Live row with “Send stop-charging request”' },
    link: '/feeders',
    action: {
      label: 'Simulate forecast high on SUB-01-F1',
      tone: 'warn',
      run: async ({ api }) => {
        const e = await api.simForecast('SUB-01-F1');
        return { text: `${e.headline} ${e.summary}`, link: e.suggested ? campaignLink(e.suggested.campaignType, e.suggested.audience) : undefined };
      },
    },
    advanceOn: (ev) => ev.name === 'liveEvent:new' && ev.event.kind === 'FEEDER_FORECAST_HIGH',
  },
  {
    id: 'uc2b-send',
    phase: 'Use case 2b',
    title: 'Send the stop-charging request',
    talkTrack: 'Same tool, different ask: pause charging 5–8 PM, earn a reward. Expires when the event ends.',
    expect: { phone: 'Banner “Please pause EV charging”, Grid alert screen with countdown', web: 'DR event scheduled' },
    doneWhen: (s) => s.activeDrEvent !== null,
  },
  {
    id: 'uc2b-respond',
    phase: 'Use case 2b',
    title: 'Customer answers “Yes, I’ll pause”',
    talkTrack: 'Responses land live. Paused charging is what the operator cares about.',
    expect: { phone: 'Confirmation', web: 'Responded +1, Paused charging +1' },
    advanceOn: (ev) => ev.name === 'campaign:statsChanged' && ev.campaign.type === 'STOP_CHARGING' && ev.campaign.stats.paused > 0,
  },
  {
    id: 'uc2b-start',
    phase: 'Use case 2b',
    title: 'Start the event now',
    talkTrack: 'During the event the paused EV draws 0 kW; the Energy screen shows it.',
    expect: { phone: 'Energy: EV charging 0.0 kW' },
    action: {
      label: 'Start event now',
      tone: 'warn',
      run: async ({ api, state }) => {
        const ev = state?.activeDrEvent;
        if (!ev) throw new Error('No DR event yet. Send a stop-charging request first.');
        return { text: `Event ${(await api.drStart(ev.id)).status.toLowerCase()}.` };
      },
    },
    advanceOn: (ev) => ev.name === 'drEvent:statusChanged' && ev.event.status === 'ACTIVE',
  },
  {
    id: 'uc2b-end',
    phase: 'Use case 2b',
    title: 'End the event and show results',
    talkTrack: 'Per-home results on the phone; peak reduced in MW for the operator.',
    expect: { phone: 'Event result: earned, energy shifted, peak reduced', web: 'Peak reduced (MW) in the results panel' },
    action: {
      label: 'End event now',
      tone: 'secondary',
      run: async ({ api, state }) => {
        const ev = state?.activeDrEvent;
        if (!ev) throw new Error('No DR event to end.');
        return { text: `Event ${(await api.drEnd(ev.id)).status.toLowerCase()}. Results are on the phone.` };
      },
    },
    advanceOn: (ev) => ev.name === 'drEvent:statusChanged' && ev.event.status === 'ENDED',
  },
  {
    id: 'wrap',
    phase: 'Wrap-up',
    title: 'Worst blind spots: where Campaign 360 goes next',
    talkTrack: 'Feeders where most EVs are invisible. Each row is a campaign waiting to happen.',
    expect: { web: 'Worst blind spots table, Target buttons' },
    link: '/feeders',
  },
];

export const SCRIPT_STORAGE_KEY = 'h1demo.script';

export function nextStepIndex(done: Record<string, boolean>): number {
  const i = DEMO_SCRIPT.findIndex((s) => !done[s.id]);
  return i === -1 ? DEMO_SCRIPT.length : i;
}

import { PROGRAM, type MessageCategory, type MessageKind, type NotifyPreset } from '@demo/shared';

/** A plain in-app notification (no campaign, no DR event behind it). */
export interface NotifyCopy {
  kind: MessageKind;
  category: MessageCategory;
  tag: string;
  title: string;
  body: string;
  cta: string | null;
  route?: string;
}

export interface NotifyContext {
  firstName: string;
  /** e.g. "5–8 PM" */
  peakWindow: string;
  /** e.g. "6:04 AM" */
  clock: string;
}

/** Campaign copy (merge fields are filled in by the campaign send) for the presets that go through Campaign 360. */
export const CAMPAIGN_COPY = {
  STOP_CHARGING: {
    title: 'Please pause EV charging {event_window} today',
    body: `Hi {first_name}, demand on your local line is close to its limit this evening. Please pause EV charging during {event_window} and earn ${PROGRAM.perEventIncentive}. Can’t take part? Opt out in the app.`,
    cta: 'Respond',
  },
  ENROLL_OFFER: {
    title: `EV owners near you are saving with ${PROGRAM.name}`,
    body: `Hi {first_name}, {neighbours_enrolled} EV owners in your area have already joined ${PROGRAM.name}. Join today and get {incentive}. You can opt out of any event.`,
    cta: 'Enroll in 1 minute',
  },
} as const;

type PlainPreset = Exclude<NotifyPreset, 'EV_DETECTED' | 'STOP_CHARGING' | 'ENROLL_OFFER'>;

export function isPlainPreset(p: NotifyPreset): p is PlainPreset {
  return p !== 'EV_DETECTED' && p !== 'STOP_CHARGING' && p !== 'ENROLL_OFFER';
}

export function notifyCopy(preset: PlainPreset, c: NotifyContext): NotifyCopy {
  switch (preset) {
    case 'CHARGING_STARTED':
      return {
        kind: 'CHARGING', category: 'Alerts', tag: 'EV',
        title: 'Your EV started charging',
        body: `Hi ${c.firstName}, charging started at home at ${c.clock}. Prices are higher ${c.peakWindow}; smart charging can move it to cheaper hours for you.`,
        cta: null,
      };
    case 'CHARGING_COMPLETE':
      return {
        kind: 'CHARGING', category: 'Alerts', tag: 'EV',
        title: 'Your EV is fully charged',
        body: `Charging finished at ${c.clock}. This session used 38 kWh, about $3.40 at your current rates.`,
        cta: null,
      };
    case 'PEAK_SOON':
      return {
        kind: 'CHARGING', category: 'Alerts', tag: 'EV',
        title: `Higher prices ${c.peakWindow} today`,
        body: `Hi ${c.firstName}, on-peak prices start soon. Charge after the peak to save, or let smart charging do it for you.`,
        cta: null,
      };
    case 'BILL_READY':
      return {
        kind: 'BILL', category: 'Billing', tag: 'Billing',
        title: 'Your new bill is ready',
        body: `Hi ${c.firstName}, your latest bill is ready to view. Pay in the app in a few taps.`,
        cta: 'View bill',
      };
    case 'HIGH_USAGE':
      return {
        kind: 'BILL', category: 'Billing', tag: 'Usage',
        title: 'Your usage is higher than usual today',
        body: 'You have used about 30% more electricity than on a typical day. EV charging is the largest part. See your usage for details.',
        cta: null,
      };
    case 'OUTAGE':
      return {
        kind: 'OUTAGE', category: 'Alerts', tag: 'Outage',
        title: 'Planned outage near you',
        body: 'Crews will work on your street tomorrow from 9 to 11 AM. Power may be off for up to 2 hours. We’re sorry for the inconvenience.',
        cta: null,
      };
  }
}

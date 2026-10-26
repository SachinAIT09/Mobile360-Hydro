import { BRAND } from './brand';
import type { NotifyPreset } from './types';

export type NotifyGroup = 'EV charging' | 'Grid programs' | 'Account';

export interface NotifyPresetInfo {
  id: NotifyPreset;
  group: NotifyGroup;
  /** Tile title on the demo control panel. */
  label: string;
  /** One line, in plain words, of what the customer sees. */
  detail: string;
  /** Who the preset makes sense for; other customers get the tile disabled with this reason. */
  needs?: 'ENROLLED' | 'NOT_ENROLLED';
}

/** The "quick send" catalogue: every phone notification the demo can fire with one click. */
export const NOTIFY_PRESETS: NotifyPresetInfo[] = [
  { id: 'EV_DETECTED', group: 'EV charging', label: 'New EV detected', detail: `${BRAND.partners.evDetection} spots an EV; the phone opens the program pop-up.`, needs: 'NOT_ENROLLED' },
  { id: 'CHARGING_STARTED', group: 'EV charging', label: 'Charging started', detail: 'Your EV started charging at home.' },
  { id: 'CHARGING_COMPLETE', group: 'EV charging', label: 'Charging complete', detail: 'Your EV is charged, with the kWh and cost.' },
  { id: 'PEAK_SOON', group: 'EV charging', label: 'Peak prices soon', detail: 'Higher prices start soon; tip to charge later.' },
  { id: 'STOP_CHARGING', group: 'Grid programs', label: 'Stop-charging request', detail: 'Asks to pause charging tonight; the customer answers on the phone.', needs: 'ENROLLED' },
  { id: 'ENROLL_OFFER', group: 'Grid programs', label: 'Enrollment offer', detail: 'Invites the customer to join the EV program.', needs: 'NOT_ENROLLED' },
  { id: 'BILL_READY', group: 'Account', label: 'Bill ready', detail: 'A new bill is ready to view and pay.' },
  { id: 'HIGH_USAGE', group: 'Account', label: 'High usage alert', detail: 'Usage today is higher than usual.' },
  { id: 'OUTAGE', group: 'Account', label: 'Outage alert', detail: 'A planned outage near the customer’s home.' },
];

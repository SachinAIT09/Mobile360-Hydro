import type { Campaign, DrEvent, EnergyReading, LiveEvent, Message } from './types';

/**
 * Socket.IO contract. Clients connect to the API origin with
 *   io(API_URL, { auth: { token } })
 * The server puts STAFF sockets in room "staff" and CUSTOMER sockets in room "customer:<customerId>".
 */
export const SocketEvents = {
  liveEventNew: 'liveEvent:new',
  feederStatsChanged: 'feeder:statsChanged',
  messageNew: 'message:new',
  messagePopup: 'message:popup',
  campaignStatsChanged: 'campaign:statsChanged',
  drEventStatusChanged: 'drEvent:statusChanged',
  energyReading: 'energy:reading',
  meChanged: 'me:changed',
  demoReset: 'demo:reset',
} as const;

export interface ServerToClientEvents {
  /** staff */
  'liveEvent:new': (e: LiveEvent) => void;
  /** staff — refetch overview / substations / feeders / blind spots */
  'feeder:statsChanged': (p: { substationCode: string; feederCode: string | null }) => void;
  /** customer */
  'message:new': (m: Message) => void;
  /** customer — open the EV-detected sheet */
  'message:popup': (m: Message) => void;
  /** staff */
  'campaign:statsChanged': (c: Campaign) => void;
  /** staff + affected customers */
  'drEvent:statusChanged': (e: DrEvent) => void;
  /** customer — every 5 s */
  'energy:reading': (r: EnergyReading) => void;
  /** customer — refetch /me/summary (enrollment, bill paid, etc.) */
  'me:changed': () => void;
  /**
   * everyone — demo data was reset; clients should refetch. Payload is optional for older servers:
   * keepSessions=false (or an older server) means customers should be signed out; true means stay signed in.
   */
  'demo:reset': (p?: { keepSessions: boolean }) => void;
}

export type ClientToServerEvents = Record<string, never>;

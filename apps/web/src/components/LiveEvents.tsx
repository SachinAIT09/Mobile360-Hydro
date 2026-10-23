import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND, fmtTime, type LiveEvent } from '@demo/shared';
import { useLoad, useSocketEvent } from '../lib/client';
import { campaignLink } from '../lib/links';
import { Icon, type IconName } from './icons';

function rowClass(kind: LiveEvent['kind']): string {
  if (kind === 'STOPPED_CHARGING_CLUSTER') return 'cluster';
  if (kind === 'FEEDER_FORECAST_HIGH') return 'forecast';
  return '';
}

function rowIcon(kind: LiveEvent['kind']): { icon: IconName; tone: string } {
  switch (kind) {
    case 'EV_DETECTED':
      return { icon: 'car', tone: 'accent' };
    case 'STOPPED_CHARGING_CLUSTER':
      return { icon: 'bolt', tone: '' };
    case 'FEEDER_FORECAST_HIGH':
      return { icon: 'alert', tone: 'warn' };
    case 'CAMPAIGN_SENT':
      return { icon: 'send', tone: 'ok' };
    case 'DR_EVENT_ENDED':
      return { icon: 'check', tone: 'ok' };
    default:
      return { icon: 'pylon', tone: '' };
  }
}

/**
 * "Live events from Net2Grid" panel: initial list from the API, new events prepended over the socket.
 * `days` limits the list to events within the last N days (client-side, by ts).
 */
export function LiveEvents({ limit = 6, days }: { limit?: number; days?: number }) {
  const { data, setData, reload } = useLoad((api) => api.liveEvents());
  const [fresh, setFresh] = useState<string | null>(null);

  useSocketEvent('liveEvent:new', (e) => {
    setData((prev) => [e, ...(prev ?? []).filter((x) => x.id !== e.id)]);
    setFresh(e.id);
  });
  useSocketEvent('demo:reset', () => void reload());

  // Snapshot of "now" taken once per mount: React Compiler forbids Date.now() during render.
  const [mountedAt] = useState(() => Date.now());
  const since = days ? mountedAt - days * 86400000 : null;
  const events = (data ?? []).filter((e) => since === null || new Date(e.ts).getTime() >= since).slice(0, limit);

  return (
    <section id="events" className="card pad stack gap12" aria-labelledby="live-h">
      <div className="card-head">
        <span className="ic-tile">
          <Icon name="pylon" size={18} />
        </span>
        <h2 id="live-h" className="h2">
          Live events from {BRAND.partners.evDetection}
        </h2>
        <span className="pill grey">Simulated</span>
      </div>
      {events.length === 0 && (
        <p className="sub">
          No events yet. Use the <Link to="/demo">demo control panel</Link> to simulate {BRAND.partners.evDetection} events.
        </p>
      )}
      {events.map((e) => {
        const ri = rowIcon(e.kind);
        return (
          <div key={e.id} className={`rowcard ${rowClass(e.kind)} ${fresh === e.id ? 'fresh' : ''}`}>
            <span className={`ic-tile ${ri.tone}`}>
              <Icon name={ri.icon} size={18} />
            </span>
            <span className="body">
              <span className="title">{e.headline}</span>
              <span className="meta">
                <span className="mono">{fmtTime(e.ts)}</span> · {e.summary}
              </span>
            </span>
            {e.suggested ? (
              <Link
                className={`btn sm ${e.suggested.campaignType === 'STOP_CHARGING' ? 'outline' : 'pri'}`}
                to={campaignLink(e.suggested.campaignType, e.suggested.audience)}
              >
                {e.suggested.label}
              </Link>
            ) : e.actionTaken ? (
              <span className="pill ok">✓ {e.actionTaken}</span>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

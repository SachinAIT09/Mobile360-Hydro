import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDate, fmtInt, fmtWindow, type DrEvent, type DrEventStatus } from '@demo/shared';
import { useApi, useLoad, useSocketEvent } from '../lib/client';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/icons';
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/State';

/** "SUB-01-F1" or "SUB-01-F1 +2" for a multi-feeder event. */
function feederText(e: Pick<DrEvent, 'feederCode' | 'feederCodes'>): string {
  const n = e.feederCodes?.length ?? 0;
  return n > 1 ? `${e.feederCode} +${n - 1}` : e.feederCode;
}

function statusPill(st: DrEventStatus | null) {
  return st === 'ACTIVE' ? 'warn' : st === 'ENDED' ? 'ok' : 'grey';
}

/** DR events list. Events are derived from stop-charging campaigns; live status comes from the socket. */
export function EventsPage() {
  const api = useApi();
  const campaigns = useLoad((a) => a.campaigns());
  const demo = useLoad((a) => a.demoState());
  const events = useLoad((a) => a.drEvents());
  const reports = useLoad((a) => a.reports());
  const [known, setKnown] = useState<Record<string, DrEvent>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useSocketEvent('drEvent:statusChanged', (e) => setKnown((k) => ({ ...k, [e.id]: e })));
  useSocketEvent('campaign:statsChanged', () => void campaigns.reload());
  useSocketEvent('campaign:statusChanged', () => {
    void campaigns.reload();
    void events.reload();
  });
  useSocketEvent('demo:reset', () => {
    setKnown({});
    void campaigns.reload();
    void events.reload();
    void demo.reload();
    void reports.reload();
  });

  const active = demo.data?.activeDrEvent ?? null;
  const drCampaigns = (campaigns.data ?? []).filter((c) => c.drEventId).sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  const byId = new Map((events.data ?? []).map((e) => [e.id, e]));
  function statusOf(id: string): DrEventStatus | null {
    if (known[id]) return known[id].status;
    if (active && active.id === id) return active.status;
    return byId.get(id)?.status ?? null;
  }

  async function act(id: string, action: 'start' | 'end') {
    setBusy(id);
    setErr(null);
    try {
      const ev = action === 'start' ? await api.drStart(id) : await api.drEnd(id);
      setKnown((k) => ({ ...k, [ev.id]: ev }));
      void demo.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update the event');
    } finally {
      setBusy(null);
    }
  }

  const totals = drCampaigns.reduce(
    (a, c) => ({ responded: a.responded + c.stats.acted, paused: a.paused + c.stats.paused, mw: a.mw + c.stats.peakReducedMw }),
    { responded: 0, paused: 0, mw: 0 },
  );
  const activeStatus = active ? (statusOf(active.id) ?? active.status) : null;

  return (
    <main className="page">
      <PageHeader title="DR events" />
      <div className="page-intro">
        <p className="lead">Stop-charging requests sent through Campaign 360. Start or end an event to drive the demo.</p>
        <Link className="btn outline" to="/campaigns/new?type=STOP_CHARGING&feeder=SUB-01-F1&segment=ENROLLED_EV">
          <Icon name="bolt" size={16} />
          New stop-charging request
        </Link>
      </div>

      <section className="kpis" aria-label="Event totals">
        <div className="card kpi">
          <span className="kl">Events</span>
          <span className="kv">{campaigns.data ? fmtInt(drCampaigns.length) : '—'}</span>
          <span className="ks">stop-charging requests sent</span>
        </div>
        <div className="card kpi">
          <span className="kl">Responded</span>
          <span className="kv">{campaigns.data ? fmtInt(totals.responded) : '—'}</span>
          <span className="ks">customers answered in the app</span>
        </div>
        <div className="card kpi">
          <span className="kl">Paused charging</span>
          <span className="kv">{campaigns.data ? fmtInt(totals.paused) : '—'}</span>
          <span className="ks">households across all events</span>
        </div>
        <div className="card kpi dark">
          <span className="kl">Peak reduced</span>
          <span className="kv">{campaigns.data ? `${totals.mw.toFixed(2)} MW` : '—'}</span>
          <span className="ks">summed over ended events</span>
        </div>
        <div className="card kpi">
          <span className="kl">Smart-charging homes</span>
          <span className="kv">{reports.data ? fmtInt(reports.data.smartCharging.homes) : '—'}</span>
          <span className="ks">
            {reports.data
              ? `${(reports.data.smartCharging.flexibleKw / 1000).toFixed(2)} MW of EV load shifted off-peak automatically`
              : 'EV load scheduled off-peak'}
          </span>
        </div>
      </section>

      {err && <ErrorNotice message={err} />}
      {active && (
        <section className="card pad stack gap12" aria-labelledby="active-h">
          <div className="card-head">
            <span className={`ic-tile ${activeStatus === 'ACTIVE' ? 'warn' : activeStatus === 'ENDED' ? 'ok' : ''}`}>
              <Icon name="bolt" size={18} />
            </span>
            <h2 id="active-h" className="h2">
              Current event · <span className="mono">{feederText(active)}</span>
            </h2>
            <span className={`pill ${statusPill(activeStatus)}`}>{activeStatus}</span>
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)' }}>{active.title}</p>
          <p className="sub">
            Window {fmtWindow(active.windowStart, active.windowEnd)} · {fmtDate(active.windowStart)}
          </p>
          <div className="row gap8">
            <button type="button" className="btn warn" disabled={busy === active.id || activeStatus !== 'SCHEDULED'} onClick={() => void act(active.id, 'start')}>
              <Icon name="play" size={16} />
              Start event now
            </button>
            <button type="button" className="btn outline" disabled={busy === active.id || activeStatus === 'ENDED'} onClick={() => void act(active.id, 'end')}>
              <Icon name="stop" size={16} />
              End event now
            </button>
          </div>
        </section>
      )}
      <section className="card pad stack gap12">
        <div className="card-head">
          <span className="ic-tile">
            <Icon name="file" size={18} />
          </span>
          <h2 className="h2">All stop-charging requests</h2>
        </div>
        {campaigns.loading && !campaigns.data && <LoadingBlock rows={3} rowHeight={44} label="Loading events" />}
        {campaigns.data && drCampaigns.length === 0 ? (
          <EmptyState
            title="No DR events yet"
            body="A stop-charging request creates the first event."
            action={{ label: 'Create a stop-charging request', to: '/campaigns/new?type=STOP_CHARGING&feeder=SUB-01-F1&segment=ENROLLED_EV' }}
          />
        ) : drCampaigns.length > 0 ? (
          <div className="tablebox">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Sent</th>
                  <th scope="col">Feeder</th>
                  <th scope="col">Audience</th>
                  <th scope="col">Status</th>
                  <th scope="col">Responded</th>
                  <th scope="col">Paused</th>
                  <th scope="col">Peak reduced</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drCampaigns.map((c) => {
                  const id = c.drEventId as string;
                  const st = statusOf(id);
                  const ev = known[id] ?? byId.get(id);
                  return (
                    <tr key={c.id}>
                      <td>{fmtDate(c.sentAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                      <td className="mono" title={ev?.feederCodes?.join(', ')}>
                        {ev ? feederText(ev) : '—'}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>
                        {c.audienceLabel}
                        {c.isTest ? ' (test)' : ''}
                      </td>
                      <td>
                        <span className={`pill ${statusPill(st)}`}>{st ?? 'Scheduled / unknown'}</span>
                      </td>
                      <td className="mono">{fmtInt(c.stats.acted)}</td>
                      <td className="mono">{fmtInt(c.stats.paused)}</td>
                      <td className="mono">{c.stats.peakReducedMw.toFixed(2)} MW</td>
                      <td>
                        <span className="row gap6">
                          <button type="button" className="iconbtn sm tint" aria-label="Start event" title="Start event" disabled={busy === id || st === 'ACTIVE' || st === 'ENDED'} onClick={() => void act(id, 'start')}>
                            <Icon name="play" size={16} />
                          </button>
                          <button type="button" className="iconbtn sm tint" aria-label="End event" title="End event" disabled={busy === id || st === 'ENDED'} onClick={() => void act(id, 'end')}>
                            <Icon name="stop" size={16} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}

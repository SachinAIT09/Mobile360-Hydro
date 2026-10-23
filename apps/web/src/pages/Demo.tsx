import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND, fmtDate, fmtWindow, type DemoCustomer, type EvStatus } from '@demo/shared';
import { MOBILE_WEB_URL, useApi, useClient, useLoad, useSocketEvent } from '../lib/client';
import { campaignLink } from '../lib/links';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/icons';
import { DemoPanels } from '../components/DemoPanels';

const EV_STATUS_LABEL: Record<EvStatus, string> = {
  NONE: 'No EV detected',
  DETECTED_NOT_ENROLLED: 'EV detected · not enrolled',
  ENROLLED: 'Enrolled',
};

export function DemoPage() {
  const api = useApi();
  const { connected } = useClient();
  const state = useLoad((a) => a.demoState());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string; link?: string } | null>(null);

  // Online dots and event status change outside socket events we receive; poll lightly.
  const { reload } = state;
  useEffect(() => {
    const t = window.setInterval(() => void reload(), 4000);
    return () => window.clearInterval(t);
  }, [reload]);
  const refresh = () => void reload();
  useSocketEvent('feeder:statsChanged', refresh);
  useSocketEvent('drEvent:statusChanged', refresh);
  useSocketEvent('campaign:statsChanged', refresh);
  useSocketEvent('demo:reset', refresh);

  async function run(key: string, fn: () => Promise<{ text: string; link?: string }>) {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ kind: 'ok', ...r });
      void state.reload();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setBusy(null);
    }
  }

  const customers = state.data?.customers ?? [];
  const active = state.data?.activeDrEvent ?? null;

  return (
    <main className="page">
      <PageHeader title="Demo control panel" />
      <div className="page-intro">
        <p className="lead">Simulate {BRAND.partners.evDetection} events and drive the customer app. Not part of the product; kept out of the main sections.</p>
        <span className={`pill ${connected ? 'ok' : 'danger'}`}>
          Staff live updates {connected ? 'connected' : 'disconnected'} · {state.data?.staffSockets ?? 0} staff socket(s)
        </span>
      </div>

      {msg && (
        <div className={`notice ${msg.kind === 'ok' ? 'ok' : 'err'}`} role="status">
          {msg.text} {msg.link && <Link to={msg.link}>Open in Campaign 360 ›</Link>}
        </div>
      )}
      {state.error && <div className="notice err">{state.error}</div>}

      <DemoPanels state={state.data} error={state.error} />

      <section className="demo-grid">
        <div className="card pad stack gap12">
          <div className="card-head">
            <span className="ic-tile">
              <Icon name="users" size={18} />
            </span>
            <h2 className="h2">Demo customers</h2>
          </div>
          {customers.map((c) => (
            <CustomerCard key={c.customerId} c={c} busy={busy} onSimulate={() =>
              run(`ev-${c.customerId}`, async () => {
                const e = await api.simEvDetected(c.customerId);
                return { text: `${e.headline} ${e.summary}` };
              })
            } />
          ))}
          {customers.length === 0 && <p className="sub">{state.loading ? 'Loading…' : 'No demo customers. Try Reset demo.'}</p>}
          <div className="stack gap6">
            <a className="btn sec" href={MOBILE_WEB_URL} target="_blank" rel="noreferrer">
              <Icon name="phone" size={16} />
              Open the customer app
            </a>
            <span className="small muted">
              Sign in with {customers.map((c) => c.email).join(' or ') || 'manny@demo.test or priya@demo.test'} (any password).
            </span>
          </div>
        </div>

        <div className="card pad stack gap12">
          <div className="card-head">
            <span className="ic-tile accent">
              <Icon name="pylon" size={18} />
            </span>
            <h2 className="h2">{BRAND.partners.evDetection} simulations</h2>
          </div>
          <div className="step">
            <span className="stepn">1</span>
            <div className="stack gap6">
              <strong>Use case 1 · EV detected</strong>
              <span className="small muted">Fires the in-app pop-up for the unenrolled demo customer. Use the button on their card.</span>
            </div>
          </div>
          <div className="step">
            <span className="stepn">2</span>
            <div className="stack gap6">
              <strong>Use case 2a · Stopped-charging cluster</strong>
              <span className="small muted">284 EVs stop charging on SUB-01; 118 are not enrolled (includes the unenrolled demo customer).</span>
              <button
                type="button"
                className="btn pri"
                disabled={busy !== null}
                onClick={() =>
                  void run('cluster', async () => {
                    const e = await api.simCluster('SUB-01');
                    return {
                      text: `${e.headline} ${e.summary}`,
                      link: e.suggested ? campaignLink(e.suggested.campaignType, e.suggested.audience) : undefined,
                    };
                  })
                }
              >
                Simulate 284 EVs stopped charging on SUB-01
              </button>
            </div>
          </div>
          <div className="step">
            <span className="stepn">3</span>
            <div className="stack gap6">
              <strong>Use case 2b · Feeder forecast high</strong>
              <span className="small muted">SUB-01-F1 forecast at 92% tonight; the enrolled demo customer is on this feeder.</span>
              <button
                type="button"
                className="btn warn"
                disabled={busy !== null}
                onClick={() =>
                  void run('forecast', async () => {
                    const e = await api.simForecast('SUB-01-F1');
                    return {
                      text: `${e.headline} ${e.summary}`,
                      link: e.suggested ? campaignLink(e.suggested.campaignType, e.suggested.audience) : undefined,
                    };
                  })
                }
              >
                Simulate forecast high on SUB-01-F1
              </button>
            </div>
          </div>
        </div>

        <div className="card pad stack gap12">
          <div className="card-head">
            <span className={`ic-tile ${active?.status === 'ACTIVE' ? 'warn' : active?.status === 'ENDED' ? 'ok' : ''}`}>
              <Icon name="bolt" size={18} />
            </span>
            <h2 className="h2">DR event</h2>
          </div>
          {active ? (
            <>
              <div className="row between center gap8">
                <span className="mono" style={{ fontWeight: 600, color: 'var(--navy)' }}>
                  {active.feederCode}
                </span>
                <span className={`pill ${active.status === 'ACTIVE' ? 'warn' : active.status === 'ENDED' ? 'ok' : 'grey'}`}>{active.status}</span>
              </div>
              <p>{active.title}</p>
              <p className="small muted">
                {fmtWindow(active.windowStart, active.windowEnd)} · {fmtDate(active.windowStart)}
              </p>
              <div className="row gap8">
                <button
                  type="button"
                  className="btn warn"
                  disabled={busy !== null || active.status !== 'SCHEDULED'}
                  onClick={() => void run('start', async () => ({ text: `Event ${(await api.drStart(active.id)).status.toLowerCase()}.` }))}
                >
                  <Icon name="play" size={16} />
                  Start event now
                </button>
                <button
                  type="button"
                  className="btn outline"
                  disabled={busy !== null || active.status === 'ENDED'}
                  onClick={() => void run('end', async () => ({ text: `Event ${(await api.drEnd(active.id)).status.toLowerCase()}. Results are on the phone.` }))}
                >
                  <Icon name="stop" size={16} />
                  End event now
                </button>
              </div>
            </>
          ) : (
            <p className="sub">
              No DR event yet. Send a <Link to="/campaigns/new?type=STOP_CHARGING&feeder=SUB-01-F1&segment=ENROLLED_EV">stop-charging request</Link> first.
            </p>
          )}
          <Link to="/events" className="row center gap6" style={{ fontSize: 14, fontWeight: 600 }}>
            All DR events
            <Icon name="open" size={14} />
          </Link>
        </div>

        <div className="card pad stack gap12">
          <div className="card-head">
            <span className="ic-tile danger">
              <Icon name="refresh" size={18} />
            </span>
            <h2 className="h2">Reset</h2>
          </div>
          <p className="sub">Drops all demo data and reseeds the starting state. Demo ids are stable, so the phone can stay signed in.</p>
          <button
            type="button"
            className="btn sec"
            disabled={busy !== null}
            onClick={() => {
              if (!window.confirm('Reset all demo data to the starting state? The phone stays signed in.')) return;
              void run('reset', async () => {
                await api.demoReset({ keepSessions: true });
                return { text: 'Demo reset to the starting state (phone kept signed in).' };
              });
            }}
          >
            {busy === 'reset' ? 'Resetting…' : 'Reset (keep phone signed in)'}
          </button>
          <button
            type="button"
            className="btn outline"
            disabled={busy !== null}
            onClick={() => {
              if (!window.confirm('Reset all demo data AND sign the phone out?')) return;
              void run('reset-out', async () => {
                await api.demoReset({ keepSessions: false });
                return { text: 'Demo reset to the starting state. Customer apps were signed out.' };
              });
            }}
          >
            {busy === 'reset-out' ? 'Resetting…' : 'Reset & sign phone out'}
          </button>
          {state.data?.lastReset && <span className="small muted">Last reset {fmtDate(state.data.lastReset, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
        </div>
      </section>
    </main>
  );
}

function CustomerCard({ c, busy, onSimulate }: { c: DemoCustomer; busy: string | null; onSimulate: () => void }) {
  return (
    <div className="custcard">
      <div className="row between center gap8">
        <strong style={{ fontSize: 15, color: 'var(--navy)' }}>
          {c.firstName} <span className="small muted">({c.role === 'UNENROLLED_DEMO' ? 'unenrolled' : 'enrolled'})</span>
        </strong>
        <span className="row center gap6 small">
          <span className={`dot ${c.online ? 'on' : 'off'}`} aria-hidden="true" />
          {c.online ? 'App online' : 'App offline'}
        </span>
      </div>
      <span className="small muted">
        {c.email} · <span className="mono">{c.feederCode}</span>
      </span>
      <span className={`pill ${c.evStatus === 'ENROLLED' ? 'ok' : c.evStatus === 'DETECTED_NOT_ENROLLED' ? 'ev' : 'grey'}`} style={{ alignSelf: 'flex-start' }}>
        {EV_STATUS_LABEL[c.evStatus]}
      </span>
      <button type="button" className="btn ev" disabled={busy !== null} onClick={onSimulate}>
        <Icon name="car" size={16} />
        {busy === `ev-${c.customerId}` ? 'Simulating…' : `Simulate EV detected at ${c.firstName}'s home`}
      </button>
    </div>
  );
}

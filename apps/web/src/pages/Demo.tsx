import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from '@demo/shared';
import { useApi, useClient, useLoad, useSocketEvent } from '../lib/client';
import { PageHeader } from '../components/PageHeader';
import { PhonePairingCard } from '../components/PhonePairingCard';
import { QuickSend } from '../components/QuickSend';

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

  return (
    <main className="page">
      <PageHeader
        title="Demo control panel"
        icon="settings"
        sub={`Fire any notification at the customer app with one click. ${BRAND.partners.evDetection} simulations, DR event start/end and demo reset are on the presenter bar (press Shift+P on any staff page). Not part of the product.`}
        actions={
          <span className={`pill ${connected ? 'ok' : 'danger'}`}>
            Staff live updates {connected ? 'connected' : 'disconnected'} · {state.data?.staffSockets ?? 0} staff socket(s)
          </span>
        }
      />

      {msg && (
        <div className={`notice ${msg.kind === 'ok' ? 'ok' : 'err'}`} role="status">
          {msg.text} {msg.link && <Link to={msg.link}>Open in Campaign 360 ›</Link>}
        </div>
      )}
      {state.error && <div className="notice err">{state.error}</div>}

      <QuickSend
        customers={customers}
        busy={busy}
        onSend={(c, preset) => void run(`qs-${preset}`, () => api.simNotify({ customerId: c.customerId, preset }))}
      />

      <PhonePairingCard />
    </main>
  );
}

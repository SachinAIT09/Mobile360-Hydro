import { BRAND, fmtWindow, type DemoState } from '@demo/shared';
import { useConnection, useLoad } from '../lib/client';
import { CardHeader } from './CardHeader';
import { DemoScript } from './DemoScript';
import { ErrorNotice, LoadingBlock } from './State';
import './addons.css';

/** Guided script, preflight checklist and phone pairing: the cards at the top of the demo control panel. */
export function DemoPanels({ state, error }: { state: DemoState | null; error: string | null }) {
  return (
    <section className="demo-grid" aria-label="Presenter tools">
      <div className="card pad stack gap12" style={{ gridColumn: 'span 1' }}>
        <CardHeader icon="play" title="Guided script" sub="The presenter's script, step by step. Shift+P shows the presenter bar on every page." />
        <DemoScript />
      </div>
      <div className="stack gap18">
        <PreflightCard state={state} error={error} />
        <PhonePairingCard />
      </div>
    </section>
  );
}

function Check({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) {
  const tone = ok === null ? 'grey' : ok ? 'ok' : 'danger';
  const text = ok === null ? '…' : ok ? 'OK' : 'Check';
  return (
    <div className="kvrow">
      <span>
        {label}
        {detail && <span className="small muted" style={{ display: 'block' }}>{detail}</span>}
      </span>
      <span className={`pill ${tone}`}>{text}</span>
    </div>
  );
}

function PreflightCard({ state, error }: { state: DemoState | null; error: string | null }) {
  const { status } = useConnection();
  const serverTime = state ? new Date(state.serverTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: state.timezone }) : null;
  return (
    <div className="card pad stack gap10">
      <CardHeader icon="check" tone="ok" title="Preflight" sub="Everything that must be true before the first slide." />
      <div className="stack">
        <Check ok={error ? false : state ? true : null} label="API reachable" detail={error ?? undefined} />
        <Check ok={status === 'connected'} label="Staff live updates" detail={status === 'connected' ? `connected · ${state?.staffSockets ?? 0} staff socket(s)` : status} />
        {(state?.customers ?? []).map((c) => (
          <Check key={c.customerId} ok={c.online} label={`${c.firstName}'s phone (${c.role === 'UNENROLLED_DEMO' ? 'unenrolled' : 'enrolled'})`} detail={c.online ? 'app online' : `sign in as ${c.email}`} />
        ))}
        <Check ok={state ? state.evAlwaysCharging : null} label="EV_ALWAYS_CHARGING" detail={state ? (state.evAlwaysCharging ? 'EVs modelled as charging whenever the clock allows' : 'off: EVs charge 6–11 PM only') : undefined} />
        <div className="kvrow">
          <span>Server time</span>
          <strong>{serverTime ? `${serverTime} · ${state?.timezone}` : '—'}</strong>
        </div>
        <div className="kvrow">
          <span>Next DR window</span>
          <strong>{state ? fmtWindow(state.nextEventWindow.start, state.nextEventWindow.end) : '—'}</strong>
        </div>
        <div className="kvrow">
          <span>Phone app URL</span>
          <a className="mono small" href={state?.phoneAppUrl} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
            {state?.phoneAppUrl ?? '—'}
          </a>
        </div>
      </div>
    </div>
  );
}

function PhonePairingCard() {
  const phone = useLoad((api) => api.demoPhone());
  return (
    <div className="card pad stack gap10">
      <CardHeader icon="phone" tone="accent" title="Phone pairing" sub={`Scan to open the ${BRAND.appName} app on a phone on the same network.`} />
      {phone.error && <ErrorNotice message={phone.error} onRetry={() => void phone.reload()} />}
      {phone.loading && !phone.data && <LoadingBlock rows={2} rowHeight={60} label="Loading QR code" />}
      {phone.data && (
        <div className="row gap16 center">
          {/* The SVG comes from our own API (qrcode library output), not from user input. */}
          <div className="qr" role="img" aria-label={`QR code for ${phone.data.url}`} dangerouslySetInnerHTML={{ __html: phone.data.qrSvg }} />
          <div className="stack gap6" style={{ minWidth: 0 }}>
            <a className="mono small" href={phone.data.url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
              {phone.data.url}
            </a>
            <span className="small muted">Sign in with manny@demo.test (unenrolled) or priya@demo.test (enrolled), any password.</span>
          </div>
        </div>
      )}
    </div>
  );
}

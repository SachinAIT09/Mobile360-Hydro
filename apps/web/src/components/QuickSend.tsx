import { useState } from 'react';
import { NOTIFY_PRESETS, type DemoCustomer, type NotifyGroup, type NotifyPreset, type NotifyPresetInfo } from '@demo/shared';
import { Icon, type IconName } from './icons';

const ICON: Record<NotifyPreset, IconName> = {
  EV_DETECTED: 'car',
  CHARGING_STARTED: 'bolt',
  CHARGING_COMPLETE: 'check',
  PEAK_SOON: 'clock',
  STOP_CHARGING: 'stop',
  ENROLL_OFFER: 'sparkle',
  BILL_READY: 'file',
  HIGH_USAGE: 'chart',
  OUTAGE: 'alert',
};
const GROUPS: NotifyGroup[] = ['EV charging', 'Grid programs', 'Account'];

function blockedReason(p: NotifyPresetInfo, c: DemoCustomer): string | null {
  const enrolled = c.evStatus === 'ENROLLED';
  if (p.needs === 'ENROLLED' && !enrolled) return `${c.firstName} isn't enrolled`;
  if (p.needs === 'NOT_ENROLLED' && enrolled) return `${c.firstName} is already enrolled`;
  return null;
}

/** Plug-and-play board: pick a demo customer, tap a notification, it lands on their phone. */
export function QuickSend({ customers, busy, onSend }: { customers: DemoCustomer[]; busy: string | null; onSend: (c: DemoCustomer, preset: NotifyPreset) => void }) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = customers.find((c) => c.customerId === pickedId) ?? customers[0] ?? null;

  return (
    <section className="card pad stack gap16 qs" aria-labelledby="qs-title">
      <div className="row between center gap12" style={{ flexWrap: 'wrap' }}>
        <div className="card-head">
          <span className="ic-tile">
            <Icon name="phone" size={18} />
          </span>
          <div>
            <h2 className="h2" id="qs-title">
              Send to phone
            </h2>
            <span className="small muted">Pick a customer, then tap a notification. It shows on their phone right away.</span>
          </div>
        </div>
        {customers.length > 0 && (
          <div className="toggle" role="group" aria-label="Customer">
            {customers.map((c) => (
              <button key={c.customerId} type="button" className={picked?.customerId === c.customerId ? 'on' : ''} aria-pressed={picked?.customerId === c.customerId} onClick={() => setPickedId(c.customerId)}>
                <span className={`dot ${c.online ? 'on' : 'off'}`} aria-hidden="true" /> {c.firstName} · {c.evStatus === 'ENROLLED' ? 'enrolled' : 'not enrolled'}
              </button>
            ))}
          </div>
        )}
      </div>
      {picked && !picked.online && <div className="notice info">{picked.firstName}'s app is offline. Sign in as {picked.email} on the phone to see notifications arrive.</div>}
      {!picked && <p className="sub">No demo customers. Try Reset demo.</p>}
      {picked &&
        GROUPS.map((g) => (
          <div key={g} className="stack gap8">
            <div className="lbl">{g}</div>
            <div className="qs-grid">
              {NOTIFY_PRESETS.filter((p) => p.group === g).map((p) => {
                const reason = blockedReason(p, picked);
                const key = `qs-${p.id}`;
                return (
                  <button key={p.id} type="button" className="qs-tile" disabled={busy !== null || reason !== null} onClick={() => onSend(picked, p.id)}>
                    <span className="ic-tile sm">
                      <Icon name={ICON[p.id]} size={16} />
                    </span>
                    <span className="stack gap4">
                      <strong>{busy === key ? 'Sending…' : p.label}</strong>
                      <span className="small muted">{reason ?? p.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
    </section>
  );
}

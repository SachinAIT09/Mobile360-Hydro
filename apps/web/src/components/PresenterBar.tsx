import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/client';
import { usePresenterMode, useScript } from '../lib/useScript';
import './addons.css';

/** True for keystrokes typed into a form control or editable region; hotkeys must leave those alone. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

/**
 * Bottom-docked presenter bar on every page. Hidden by default; Shift+P or `?presenter=1` shows it.
 * Hotkeys while shown: N next, B back, 1/2/3 simulations, E end event, R reset (keep sessions).
 */
export function PresenterBar() {
  const [on, setOn] = usePresenterMode();

  // Shift+P toggles even while hidden.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'p' && !isTyping(e.target)) {
        e.preventDefault();
        setOn(!on);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [on, setOn]);

  useEffect(() => {
    document.body.classList.toggle('has-presenter', on);
    return () => document.body.classList.remove('has-presenter');
  }, [on]);

  return on ? <Bar onClose={() => setOn(false)} /> : null;
}

function Bar({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const s = useScript();
  const { step, index, steps, action, state } = s;
  const [hot, setHot] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function hotkey(label: string, fn: () => Promise<string>) {
    setHot(null);
    try {
      setHot({ kind: 'ok', text: await fn() });
    } catch (e) {
      setHot({ kind: 'err', text: `${label}: ${e instanceof Error ? e.message : 'failed'}` });
    }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      const unenrolled = state?.customers.find((c) => c.role === 'UNENROLLED_DEMO');
      switch (k) {
        case 'n':
          s.markDone();
          break;
        case 'b':
          s.back();
          break;
        case '1':
          void hotkey('EV detected', async () => {
            if (!unenrolled) throw new Error('no unenrolled demo customer');
            const ev = await api.simEvDetected(unenrolled.customerId);
            return `${ev.headline} ${ev.summary}`;
          });
          break;
        case '2':
          void hotkey('Cluster', async () => {
            const ev = await api.simCluster('SUB-01');
            return `${ev.headline} ${ev.summary}`;
          });
          break;
        case '3':
          void hotkey('Forecast', async () => {
            const ev = await api.simForecast('SUB-01-F1');
            return `${ev.headline} ${ev.summary}`;
          });
          break;
        case 'e':
          void hotkey('End event', async () => {
            const ev = state?.activeDrEvent;
            if (!ev) throw new Error('no DR event to end');
            return `Event ${(await api.drEnd(ev.id)).status.toLowerCase()}.`;
          });
          break;
        case 'r':
          if (window.confirm('Reset the demo data? The phone stays signed in.')) {
            void hotkey('Reset', async () => {
              await api.demoReset({ keepSessions: true });
              return 'Demo reset (phone kept signed in).';
            });
          }
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, state, s.markDone, s.back]);

  const status = action.error ? { kind: 'err' as const, text: action.error } : action.result ? { kind: 'ok' as const, text: action.result.text, link: action.result.link } : hot;

  return (
    <div className="presenter" role="toolbar" aria-label="Presenter controls">
      <div className="step">
        <span className="lbl small">
          Step {Math.min(index + 1, steps.length)}/{steps.length}
          {step ? ` · ${step.phase}` : ''}
        </span>
        <span className="title">{step ? step.title : 'Script complete'}</span>
      </div>
      {step?.action && (
        <button type="button" className="btn pri sm" disabled={action.busy} onClick={() => void s.runAction()}>
          {action.busy ? 'Running…' : step.action.label}
        </button>
      )}
      {step?.link && (
        <Link className="btn ghost sm" to={step.link}>
          Open page
        </Link>
      )}
      <button type="button" className="btn ghost sm" onClick={s.back} disabled={index === 0} aria-label="Back (B)">
        Back<kbd>B</kbd>
      </button>
      <button type="button" className="btn ghost sm" onClick={s.markDone} disabled={!step} aria-label="Next (N)">
        Next<kbd>N</kbd>
      </button>
      <span className={`status ${status?.kind === 'err' ? 'err' : ''}`} role="status" aria-live="polite">
        {status ? (
          <>
            {status.text} {'link' in status && status.link && <Link to={status.link}>Open in Campaign 360 ›</Link>}
          </>
        ) : (
          <span className="keys" aria-label="Hotkeys">
            <span>1 EV detected</span>
            <span>2 cluster</span>
            <span>3 forecast</span>
            <span>E end event</span>
            <span>R reset</span>
            <span>Shift+P hide</span>
          </span>
        )}
      </span>
      <button type="button" className="btn ghost sm" onClick={onClose} aria-label="Hide presenter bar (Shift+P)">
        Hide
      </button>
    </div>
  );
}

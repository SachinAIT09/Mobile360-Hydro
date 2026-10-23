import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ASSISTANT, type AssistantSuggestions } from '@demo/shared';
import type { Turn } from '../lib/assistant';
import { api } from '../lib/client';
import { AssistantTurn } from './AssistantAnswer';
import './addons.css';
import { Icon } from './icons';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface AssistantPanelProps {
  turns: Turn[];
  busy: boolean;
  onAsk: (q: string, route?: string) => void;
  onClose: () => void;
}

/**
 * Right-side assistant drawer (modal dialog): transcript, suggestions, follow-up input.
 * Focus moves into the drawer on open and is trapped there; Esc or the close button closes it
 * (the Shell returns focus to the top-bar search).
 */
export function AssistantPanel({ turns, busy, onAsk, onClose }: AssistantPanelProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [sugg, setSugg] = useState<AssistantSuggestions | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    let live = true;
    api
      .staffSuggestions()
      .then((s) => live && setSugg(s))
      .catch(() => live && setSugg({ greeting: 'Ask me about feeders, blind spots, campaigns or DR events.', suggestions: [] }));
    return () => {
      live = false;
    };
  }, []);

  const scrollDown = useCallback(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(scrollDown, [turns.length, scrollDown]);

  const ask = useCallback((q: string) => onAsk(q, pathname), [onAsk, pathname]);
  const go = useCallback(
    (to: string) => {
      onClose();
      navigate(to);
    },
    [navigate, onClose],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    ask(draft);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="assistant-layer">
      <div className="assistant-backdrop" onClick={onClose} aria-hidden="true" />
      <aside ref={dialogRef} className="assistant-drawer" role="dialog" aria-modal="true" aria-labelledby="assistant-title" aria-describedby="assistant-disclosure" onKeyDown={onKeyDown}>
        <header className="assistant-head">
          <span className="ic-tile">
            <Icon name="sparkle" size={18} />
          </span>
          <div className="stack gap4" style={{ flex: 1, minWidth: 0 }}>
            <h2 id="assistant-title" className="h2">
              {ASSISTANT.staffName}
            </h2>
            <p id="assistant-disclosure" className="small muted">
              {ASSISTANT.disclosure}
            </p>
          </div>
          <button type="button" className="iconbtn" aria-label="Close assistant" onClick={onClose}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div ref={logRef} className="assistant-log" role="log" aria-live="polite" aria-label="Conversation">
          {turns.length === 0 && (
            <div className="assistant-empty">
              <p className="sub">{sugg?.greeting ?? 'Loading suggestions…'}</p>
              {sugg && sugg.suggestions.length > 0 && (
                <div className="assistant-chips" role="group" aria-label="Suggested questions">
                  {sugg.suggestions.map((s) => (
                    <button key={s} type="button" className="chip" onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {turns.map((t, i) => (
            <AssistantTurn key={t.id} turn={t} latest={i === turns.length - 1} onAsk={ask} onNavigate={go} onGrow={scrollDown} />
          ))}
        </div>

        <form className="assistant-input" onSubmit={submit}>
          <label htmlFor="assistant-q" className="sr-only">
            Ask the assistant a question
          </label>
          <input
            id="assistant-q"
            ref={inputRef}
            className="fld"
            type="text"
            autoComplete="off"
            maxLength={300}
            placeholder="Ask a follow-up…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="iconbtn grad" aria-label="Send question" disabled={!draft.trim() || busy}>
            <Icon name="send" size={18} />
          </button>
        </form>
      </aside>
    </div>
  );
}

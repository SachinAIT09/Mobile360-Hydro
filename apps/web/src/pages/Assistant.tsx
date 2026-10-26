import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ASSISTANT } from '@demo/shared';
import { AssistantTurn } from '../components/AssistantAnswer';
import { Icon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { useAssistant } from '../lib/assistantContext';
import { useLoad } from '../lib/client';
import '../components/addons.css';

/** Suggestions shown as chips on the empty screen; the rest stay one click away under "More". */
const CHIPS_SHOWN = 4;

/** Full-page staff assistant: centred greeting and suggestion chips, transcript, pill composer, right tool rail. */
export function AssistantPage() {
  const { turns, busy, ask, clear, history } = useAssistant();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  // useLoad waits for the staff session, so a direct visit to /assistant still gets the suggestions.
  const suggestions = useLoad((a) => a.staffSuggestions());
  const [allChips, setAllChips] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const sugg = suggestions.data ?? (suggestions.error ? { greeting: 'Ask me about feeders, blind spots, campaigns or DR events.', suggestions: [] } : null);

  const scrollDown = useCallback(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(scrollDown, [turns.length, scrollDown]);

  const send = useCallback(
    (q: string) => {
      ask(q);
      setShowHistory(false);
      inputRef.current?.focus();
    },
    [ask],
  );

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!draft.trim() || busy) return;
    send(draft);
    setDraft('');
  }

  function newChat() {
    clear();
    setDraft('');
    setShowHistory(false);
    inputRef.current?.focus();
  }

  const chips = sugg?.suggestions ?? [];
  const shown = allChips ? chips : chips.slice(0, CHIPS_SHOWN);

  return (
    <main className="page ai-page">
      <PageHeader title="AI Assistant" icon="bot" sub="Ask about feeders, blind spots, campaigns and DR events. Answers come from the live demo data." />
      <div className="ai-layout">
        <section className="ai-main" aria-label={ASSISTANT.staffName}>
          <div ref={logRef} className="ai-log" role="log" aria-live="polite" aria-label="Conversation">
            {turns.length === 0 ? (
              <div className="ai-empty">
                <span className="ai-orb" aria-hidden="true">
                  <Icon name="sparkle" size={30} />
                </span>
                <h2 className="ai-title">{ASSISTANT.staffName}</h2>
                <p className="ai-greet">{sugg?.greeting ?? 'Loading suggestions…'}</p>
                {chips.length > 0 && (
                  <div className="ai-chips" role="group" aria-label="Suggested questions">
                    {shown.map((s) => (
                      <button key={s} type="button" className="ai-chip" onClick={() => send(s)}>
                        <Icon name="sparkle" size={13} />
                        {s}
                      </button>
                    ))}
                    {!allChips && chips.length > CHIPS_SHOWN && (
                      <button type="button" className="ai-chip more" onClick={() => setAllChips(true)}>
                        More questions
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="ai-turns">
                {turns.map((t, i) => (
                  <AssistantTurn key={t.id} turn={t} latest={i === turns.length - 1} onAsk={send} onNavigate={(to) => navigate(to)} onGrow={scrollDown} />
                ))}
              </div>
            )}
          </div>

          <form className="ai-compose" onSubmit={submit}>
            <label htmlFor="assistant-q" className="sr-only">
              Ask the assistant a question
            </label>
            <textarea
              id="assistant-q"
              ref={inputRef}
              rows={1}
              maxLength={300}
              placeholder="Type your message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <button type="button" className="ai-round ghost" aria-label="Voice input (not available in this demo)" title="Voice input isn't part of this demo" disabled>
              <Icon name="mic" size={18} />
            </button>
            <button type="submit" className="ai-round" aria-label="Send question" disabled={!draft.trim() || busy}>
              <Icon name="arrowUp" size={18} strokeWidth={2} />
            </button>
          </form>
          <p className="ai-disclosure" id="assistant-disclosure">
            {ASSISTANT.disclosure}
          </p>
        </section>

        <aside className="ai-tools" aria-label="Conversation tools">
          <button type="button" className="ai-tool" aria-label="New chat" title="New chat" onClick={newChat}>
            <Icon name="edit" size={20} />
          </button>
          <button type="button" className={`ai-tool${showHistory ? ' on' : ''}`} aria-label="Recent questions" title="Recent questions" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            <Icon name="history" size={20} />
          </button>
          {showHistory && (
            <div className="ai-history" role="region" aria-label="Recent questions">
              <strong>Recent questions</strong>
              {history.length === 0 ? (
                <span className="small muted">Nothing asked yet this session.</span>
              ) : (
                history.map((q) => (
                  <button key={q} type="button" onClick={() => send(q)}>
                    {q}
                  </button>
                ))
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

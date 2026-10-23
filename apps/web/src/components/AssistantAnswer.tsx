import { Fragment, useEffect, useId } from 'react';
import type { AssistantAction, AssistantAnswer as Answer, AssistantChart, CampaignDraft } from '@demo/shared';
import { chartLayout, fmtValue, revealParagraphs, wordCount, type Segment, type Turn } from '../lib/assistant';
import { campaignDraftLink } from '../lib/links';
import { useTypewriter } from '../lib/useTypewriter';

function Rich({ segs }: { segs: Segment[] }) {
  return (
    <>
      {segs.map((s, i) => (s.b ? <strong key={i}>{s.t}</strong> : <Fragment key={i}>{s.t}</Fragment>))}
    </>
  );
}

/** Inline SVG bar/line chart with a screen-reader table (no chart library in the main chunk). */
export function MiniChart({ chart }: { chart: AssistantChart }) {
  const id = useId();
  const l = chartLayout(chart, 320, 140);
  const many = chart.points.length > 8;
  return (
    <figure className="assistant-chart" aria-labelledby={`${id}-cap`}>
      <svg viewBox={`0 0 ${l.width} ${l.height}`} role="img" aria-labelledby={`${id}-cap`} preserveAspectRatio="none">
        <line x1={0} x2={l.width} y1={l.base} y2={l.base} className="axis" />
        {chart.kind === 'bar'
          ? l.bars.map((b, i) => (
              <g key={i}>
                <rect x={b.x} y={b.y} width={b.w} height={Math.max(b.h, 1)} rx={Math.min(6, b.w / 3)} className={b.highlight ? 'bar hi' : 'bar'} />
                {!many && (
                  <text x={b.x + b.w / 2} y={b.y - 4} textAnchor="middle" className="val">
                    {fmtValue(b.value)}
                  </text>
                )}
              </g>
            ))
          : (
            <>
              <path d={l.path} className="line" fill="none" />
              {l.bars.filter((b) => b.highlight).map((b, i) => (
                <circle key={i} cx={b.x + b.w / 2} cy={b.y} r={4} className="dot-hi" />
              ))}
            </>
          )}
        {l.bars.map((b, i) =>
          b.showLabel ? (
            <text key={`l${i}`} x={b.x + b.w / 2} y={l.height - 6} textAnchor="middle" className="lab">
              {b.label.length > 12 ? `${b.label.slice(0, 11)}…` : b.label}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption id={`${id}-cap`} className="small muted">
        {chart.kind === 'bar' ? 'Bar' : 'Line'} chart, {chart.unit}
      </figcaption>
      <table className="sr-only">
        <thead>
          <tr>
            <th scope="col">Label</th>
            <th scope="col">{chart.unit}</th>
          </tr>
        </thead>
        <tbody>
          {chart.points.map((p, i) => (
            <tr key={i}>
              <td>{p.label}</td>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** The two drafted variants plus the hand-off button to Campaign 360. */
export function DraftCards({ draft, label, onNavigate }: { draft: CampaignDraft; label: string; onNavigate: (to: string) => void }) {
  return (
    <div className="assistant-drafts">
      {draft.variants.map((v, i) => (
        <div key={i} className="assistant-draft">
          <span className="pill ev">Variant {i === 0 ? 'A' : 'B'} · {i === 0 ? 'social proof' : 'reward'}</span>
          <strong>{v.title}</strong>
          <p>{v.body}</p>
          <span className="pill grey">{v.cta}</span>
        </div>
      ))}
      <button type="button" className="btn pri sm" onClick={() => onNavigate(campaignDraftLink(draft))}>
        {label}
      </button>
    </div>
  );
}

function ActionButton({ action, onNavigate }: { action: AssistantAction; onNavigate: (to: string) => void }) {
  if (action.kind === 'campaignDraft') return <DraftCards draft={action.draft} label={action.label} onNavigate={onNavigate} />;
  return (
    <button type="button" className="btn sec sm" onClick={() => onNavigate(action.route)}>
      {action.label}
    </button>
  );
}

const TONE: Record<string, string> = { good: 'ok', warn: 'warn', bad: 'danger', default: '' };

/** One bot answer: text revealed word by word, then facts, chart, actions and follow-up chips. */
export function AnswerView({ answer, animate, onAsk, onNavigate, onGrow }: { answer: Answer; animate: boolean; onAsk: (q: string) => void; onNavigate: (to: string) => void; onGrow: () => void }) {
  const total = wordCount(answer.text);
  const { count, done } = useTypewriter(total, animate);
  const paragraphs = revealParagraphs(answer.text, count);
  useEffect(() => {
    onGrow();
  }, [count, done, onGrow]);
  const drafts = answer.actions.filter((a) => a.kind === 'campaignDraft');
  const routes = answer.actions.filter((a) => a.kind === 'route');
  return (
    <div className="bubble bot" aria-busy={!done}>
      {paragraphs.map((segs, i) => (
        <p key={i}>
          <Rich segs={segs} />
        </p>
      ))}
      {done && (
        <>
          {answer.facts.length > 0 && (
            <ul className="assistant-facts" aria-label="Key numbers">
              {answer.facts.map((f, i) => (
                <li key={i} className={`assistant-fact ${TONE[f.tone ?? 'default']}`}>
                  <span>{f.label}</span>
                  <strong>{f.value}</strong>
                </li>
              ))}
            </ul>
          )}
          {answer.chart && <MiniChart chart={answer.chart} />}
          {drafts.map((a, i) => (
            <ActionButton key={`d${i}`} action={a} onNavigate={onNavigate} />
          ))}
          {routes.length > 0 && (
            <div className="assistant-actions">
              {routes.map((a, i) => (
                <ActionButton key={i} action={a} onNavigate={onNavigate} />
              ))}
            </div>
          )}
          {answer.followUps.length > 0 && (
            <div className="assistant-chips" role="group" aria-label="Follow-up questions">
              {answer.followUps.map((f) => (
                <button key={f} type="button" className="chip" onClick={() => onAsk(f)}>
                  {f}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** A question bubble and its answer, typing indicator or error. */
export function AssistantTurn({ turn, latest, onAsk, onNavigate, onGrow }: { turn: Turn; latest: boolean; onAsk: (q: string) => void; onNavigate: (to: string) => void; onGrow: () => void }) {
  return (
    <div className="assistant-turn">
      <div className="bubble user">{turn.question}</div>
      {turn.status === 'pending' && (
        <div className="bubble bot typing" role="status" aria-label="Assistant is typing">
          <span />
          <span />
          <span />
        </div>
      )}
      {turn.status === 'error' && (
        <div className="notice err" role="alert">
          Sorry, I couldn't answer that ({turn.error}).
        </div>
      )}
      {turn.answer && <AnswerView answer={turn.answer} animate={latest} onAsk={onAsk} onNavigate={onNavigate} onGrow={onGrow} />}
    </div>
  );
}

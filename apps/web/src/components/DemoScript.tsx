import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useScript } from '../lib/useScript';
import type { ScriptStep } from '../lib/demoScript';
import './addons.css';

const TONE: Record<NonNullable<ScriptStep['action']>['tone'] & string, string> = {
  primary: 'pri',
  warn: 'warn',
  secondary: 'sec',
};

/**
 * Stepper over DEMO_SCRIPT: phases as section headers, every step clickable, the current step expanded with its
 * talk track, what to expect on each screen, the one-click action and Mark done / Skip / Back.
 * Progress is shared with the presenter bar through useScript (localStorage).
 */
export function DemoScript() {
  const s = useScript();
  const { steps, index, step, done, action } = s;
  const total = steps.length;

  return (
    <div className="stack gap12">
      <div className="row between center gap8">
        <span className="small muted">
          {s.doneCount} of {total} steps done{step ? ` · step ${index + 1}: ${step.phase}` : ' · script complete'}
        </span>
        <button type="button" className="btn sec sm" onClick={s.restart}>
          Restart script
        </button>
      </div>
      <ol className="script" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map((st, i) => {
          const isCur = i === index;
          const isDone = !!done[st.id];
          const newPhase = i === 0 || steps[i - 1].phase !== st.phase;
          return (
            <Fragment key={st.id}>
              {newPhase && <li className="phase" aria-hidden="true">{st.phase}</li>}
              <li>
                <button
                  type="button"
                  className={`stepbtn ${isCur ? 'cur' : ''} ${isDone ? 'done' : ''}`}
                  aria-current={isCur ? 'step' : undefined}
                  aria-label={`Step ${i + 1}, ${st.phase}: ${st.title}${isDone ? ' (done)' : ''}`}
                  onClick={() => s.goTo(i)}
                >
                  <span className="n" aria-hidden="true">
                    {isDone ? '✓' : i + 1}
                  </span>
                  <span>{st.title}</span>
                </button>
                {isCur && (
                  <div className="detail">
                    <p className="talk">{st.talkTrack}</p>
                    {(st.expect.phone || st.expect.web) && (
                      <dl className="expect">
                        {st.expect.web && (
                          <>
                            <dt>Staff app</dt>
                            <dd>{st.expect.web}</dd>
                          </>
                        )}
                        {st.expect.phone && (
                          <>
                            <dt>Phone</dt>
                            <dd>{st.expect.phone}</dd>
                          </>
                        )}
                      </dl>
                    )}
                    {st.link && (
                      <Link to={st.link} className="small">
                        Open the page for this step ›
                      </Link>
                    )}
                    {st.action && (
                      <div className="row gap8 center">
                        <button type="button" className={`btn ${TONE[st.action.tone ?? 'primary']}`} disabled={action.busy} onClick={() => void s.runAction()}>
                          {action.busy ? 'Running…' : st.action.label}
                        </button>
                      </div>
                    )}
                    {action.error && (
                      <div className="notice err" role="alert">
                        {action.error}
                      </div>
                    )}
                    {action.result && (
                      <div className="notice ok" role="status">
                        {action.result.text}{' '}
                        {action.result.link && <Link to={action.result.link}>Open in Campaign 360 ›</Link>}
                      </div>
                    )}
                    <div className="row gap8">
                      <button type="button" className="btn outline sm" onClick={s.back} disabled={index === 0}>
                        Back
                      </button>
                      <button type="button" className="btn sec sm" onClick={s.skip}>
                        Skip
                      </button>
                      <button type="button" className="btn pri sm" onClick={s.markDone}>
                        Mark done
                      </button>
                    </div>
                    {(st.advanceOn || st.doneWhen) && <span className="small muted">This step marks itself done when the demo shows it happened.</span>}
                  </div>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
      {!step && (
        <div className="notice ok" role="status">
          Every step is done. Restart the script to run it again.
        </div>
      )}
    </div>
  );
}

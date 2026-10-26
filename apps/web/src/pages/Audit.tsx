import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDate, fmtTime, type AuditAction, type AuditEntry } from '@demo/shared';
import { useLoad, useSocketEvent } from '../lib/client';
import { AUDIT_ACTION_LABEL, initials, timeAgo } from '../lib/reports';
import { CardHeader } from '../components/CardHeader';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/State';

const LIMIT = 100;

function targetCell(e: AuditEntry) {
  if (e.target.kind === 'campaign' && e.target.id) return <Link to={`/campaigns/${e.target.id}`}>{e.target.label}</Link>;
  if (e.target.kind === 'drEvent') return <Link to="/events">{e.target.label}</Link>;
  return <span>{e.target.label}</span>;
}

/** /audit: who did what, newest first, live via audit:new. */
export function AuditPage() {
  const { data, error, loading, reload, setData } = useLoad((a) => a.audit(LIMIT));
  const [action, setAction] = useState<AuditAction | ''>('');

  useSocketEvent('audit:new', (e) => {
    setData((prev) => (prev?.some((x) => x.id === e.id) ? prev : [e, ...(prev ?? [])].slice(0, LIMIT)));
  });
  useSocketEvent('demo:reset', () => void reload());

  const rows = (data ?? []).filter((e) => !action || e.action === action);
  const people = new Set((data ?? []).filter((e) => e.actor.kind === 'STAFF').map((e) => e.actor.name)).size;

  return (
    <main className="page">
      <PageHeader title="Audit log" icon="clock" sub="Every campaign send, schedule, cancellation, DR start/end and demo reset, with who did it. Updates live." />
      {error && <ErrorNotice message={error} onRetry={() => void reload()} />}
      <section className="card pad stack gap12">
        <CardHeader
          icon="file"
          title="Latest activity"
          sub={data ? `${rows.length} of the latest ${data.length} entries · ${people} staff ${people === 1 ? 'member' : 'members'}` : undefined}
          actions={
            <label className="field" style={{ minWidth: 220 }}>
              <span className="lbl">ACTION</span>
              <select className="fld" value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')}>
                <option value="">All actions</option>
                {(Object.keys(AUDIT_ACTION_LABEL) as AuditAction[]).map((a) => (
                  <option key={a} value={a}>
                    {AUDIT_ACTION_LABEL[a]}
                  </option>
                ))}
              </select>
            </label>
          }
        />
        {loading && !data && <LoadingBlock rows={5} rowHeight={44} label="Loading the audit log" />}
        {data && rows.length === 0 && <EmptyState title={action ? 'No entries for this action' : 'Nothing logged yet'} />}
        {rows.length > 0 && (
          <div className="tablebox">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Action</th>
                  <th scope="col">Target</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td title={`${fmtDate(e.at)} ${fmtTime(e.at)}`}>
                      {fmtDate(e.at, { month: 'short', day: 'numeric' })} · {fmtTime(e.at)}
                      <span className="small muted" style={{ display: 'block' }}>
                        {timeAgo(e.at)}
                      </span>
                    </td>
                    <td>
                      <span className="row center gap8">
                        <span
                          className="avatar"
                          aria-hidden="true"
                          style={{ width: 32, height: 32, fontSize: 12, ...(e.actor.kind === 'SYSTEM' ? { background: 'var(--muted)' } : {}) }}
                        >
                          {initials(e.actor.name)}
                        </span>
                        <span className="stack">
                          <strong style={{ color: 'var(--navy)', fontSize: 14 }}>{e.actor.name}</strong>
                          <span className="small muted">{e.actor.email ?? (e.actor.kind === 'SYSTEM' ? 'automatic' : '')}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${e.action === 'DEMO_RESET' ? 'grey' : e.action.startsWith('DR_') ? 'warn' : e.action === 'CAMPAIGN_CANCELLED' ? 'danger' : 'ev'}`}>
                        {AUDIT_ACTION_LABEL[e.action]}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'normal', minWidth: 180, fontWeight: 600 }}>{targetCell(e)}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 260 }}>{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

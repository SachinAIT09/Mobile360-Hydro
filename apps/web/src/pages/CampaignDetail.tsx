import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fmtDate, fmtInt, fmtTime, fmtWindow, type AuditEntry, type Campaign, type CampaignDetail } from '@demo/shared';
import { MOBILE_WEB_URL, useApi, useLoad, useSocketEvent } from '../lib/client';
import { abVerdict, isAb, keyRateLabel, variantRows, type VariantRow } from '../lib/abStats';
import { AUDIT_ACTION_LABEL, initials, timeAgo } from '../lib/reports';
import { CardHeader } from '../components/CardHeader';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/StatusPill';
import { Icon } from '../components/icons';
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/State';

const STATUS_PILL: Record<Campaign['status'], { tone: string; label: string }> = {
  SCHEDULED: { tone: 'accent', label: 'Scheduled' },
  SENDING: { tone: 'warn', label: 'Sending' },
  SENT: { tone: 'ok', label: 'Sent' },
  CANCELLED: { tone: 'grey', label: 'Cancelled' },
};

const when = (iso: string) => `${fmtDate(iso, { month: 'short', day: 'numeric' })} · ${fmtTime(iso)}`;

/** /campaigns/:id: KPIs, per-variant funnel, copy, audience, timeline, audit trail and the DR event. Live over the socket. */
export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const { data, error, loading, reload, setData } = useLoad((a) => a.campaignDetail(id), [id]);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const drEventId = data?.campaign.drEventId ?? null;
  useSocketEvent('campaign:statsChanged', (c) => {
    if (c.id === id) setData((d) => (d ? { ...d, campaign: c } : d));
  });
  useSocketEvent('campaign:statusChanged', (c) => {
    if (c.id === id) void reload();
  });
  useSocketEvent('audit:new', (e) => {
    if (e.target.id && (e.target.id === id || e.target.id === drEventId)) void reload();
  });
  useSocketEvent('drEvent:statusChanged', (e) => {
    if (e.id === drEventId) void reload();
  });
  useSocketEvent('demo:reset', () => void reload());

  async function cancel() {
    setBusy(true);
    setActionErr(null);
    try {
      await api.cancelCampaign(id);
      await reload();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Could not cancel');
    } finally {
      setBusy(false);
    }
  }

  async function drAction(action: 'start' | 'end') {
    if (!drEventId) return;
    setBusy(true);
    setActionErr(null);
    try {
      if (action === 'start') await api.drStart(drEventId);
      else await api.drEnd(drEventId);
      await reload();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Could not update the event');
    } finally {
      setBusy(false);
    }
  }

  const c = data?.campaign;
  return (
    <main className="page">
      <PageHeader title={c?.title ?? 'Campaign details'} />
      <div className="page-intro">
        <Link to="/campaigns" className="row center gap6" style={{ fontSize: 14, fontWeight: 600 }}>
          <Icon name="back" size={16} />
          All campaigns
        </Link>
        {c && (
          <div className="row gap8 center" style={{ flexWrap: 'wrap' }}>
            <StatusPill kind="campaignType" value={c.type} />
            <span className={`pill ${STATUS_PILL[c.status].tone}`}>{STATUS_PILL[c.status].label}</span>
            {c.isTest && <StatusPill kind="test" />}
            {isAb(c) && <span className="pill accent">A/B test</span>}
            {c.status === 'SCHEDULED' && (
              <button type="button" className="btn outline" disabled={busy} onClick={() => void cancel()}>
                <Icon name="stop" size={16} />
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {loading && !data && <LoadingBlock rows={5} rowHeight={44} label="Loading campaign" />}
      {error && !data && (
        <div className="card pad">
          {/not found/i.test(error) ? (
            <EmptyState title="Campaign not found" body="It may have been removed by a demo reset." action={{ label: 'Back to Campaign 360', to: '/campaigns' }} />
          ) : (
            <ErrorNotice message={error} onRetry={() => void reload()} />
          )}
        </div>
      )}
      {actionErr && <ErrorNotice message={actionErr} />}
      {data && c && <DetailBody d={data} busy={busy} onDr={(a) => void drAction(a)} />}
    </main>
  );
}

function DetailBody({ d, busy, onDr }: { d: CampaignDetail; busy: boolean; onDr: (a: 'start' | 'end') => void }) {
  const c = d.campaign;
  const offer = c.type === 'ENROLL_OFFER';
  const rows = variantRows(c);
  const ab = isAb(c);
  const due = c.scheduledFor ?? c.sentAt;
  const ev = d.drEvent;
  const evFeeders = ev ? (ev.feederCodes?.length ? ev.feederCodes : [ev.feederCode]) : [];
  const inAppRoute = offer ? (c.demoMessageId ? `/messages/${c.demoMessageId}` : null) : c.drEventId ? `/dr-events/${c.drEventId}` : null;

  return (
    <>
      <section className="kpis" aria-label="Campaign totals">
        {c.status === 'SENT' ? (
          <>
            <Kpi label="Targeted" value={fmtInt(c.stats.targeted)} sub={c.isTest ? 'test send' : 'after exclusions'} />
            <Kpi label="Delivered" value={fmtInt(c.stats.delivered)} sub={pctText(c.stats.delivered, c.stats.sent, 'of sent')} />
            <Kpi label="Opened" value={fmtInt(c.stats.opened)} sub={pctText(c.stats.opened, c.stats.delivered, 'of delivered')} />
            {offer ? (
              <Kpi label="Enrolled" value={fmtInt(c.stats.acted)} sub={pctText(c.stats.acted, c.stats.delivered, 'of delivered')} dark />
            ) : (
              <Kpi label="Peak reduced" value={`${c.stats.peakReducedMw.toFixed(2)} MW`} sub={`${fmtInt(c.stats.paused)} homes paused charging`} dark />
            )}
          </>
        ) : (
          <>
            <Kpi label={c.status === 'CANCELLED' ? 'Was due' : 'Sends at'} value={fmtTime(due)} sub={fmtDate(due, { weekday: 'short', month: 'short', day: 'numeric' })} />
            <Kpi label="Status" value={STATUS_PILL[c.status].label} sub={c.status === 'CANCELLED' ? 'nothing was sent' : 'audience is counted at send time'} />
            <Kpi label="Created by" value={c.createdBy?.name ?? 'Unknown'} sub={timeAgo(c.createdAt)} />
          </>
        )}
      </section>

      <section className="three">
        <div className="stack gap14" style={{ flex: '999 1 560px', minWidth: 0 }}>
          <div className="card pad stack gap12">
            <CardHeader
              icon="chart"
              tone="ok"
              title={ab ? 'Funnel by variant' : 'Funnel'}
              sub={`Share of sent · key rate ${keyRateLabel(c.type).toLowerCase()}${ab ? ' · variant B responses are simulated at a slightly different rate (synthetic)' : ''}`}
              actions={ab ? c.winner ? <span className="pill ok">Variant {c.winner} leading</span> : <span className="pill grey">Too early to call</span> : undefined}
            />
            {c.status !== 'SENT' ? (
              <EmptyState title="No results yet" body={c.status === 'CANCELLED' ? 'This campaign was cancelled before it went out.' : 'Results appear here as soon as it sends.'} />
            ) : (
              <div className="row gap14" style={{ alignItems: 'stretch' }}>
                {rows.map((r) => (
                  <FunnelColumn key={r.id} r={r} ab={ab} />
                ))}
              </div>
            )}
            {ab && c.status === 'SENT' && <p className="small muted">{abVerdict(c)}. A leader needs 20+ sends per variant and a 3-point lead.</p>}
          </div>

          <div className="row gap14" style={{ alignItems: 'stretch' }}>
            {(c.variants?.length ? c.variants : [{ id: 'A' as const, title: c.title, body: c.body, cta: c.cta }]).map((v) => (
              <div key={v.id} className="card pad stack gap10" style={{ flex: '1 1 260px', minWidth: 0 }}>
                <CardHeader icon="chat" tone="accent" title={ab ? `Message · Variant ${v.id}` : 'Message'} actions={ab && c.winner === v.id ? <span className="pill ok">Leading</span> : undefined} />
                <strong style={{ color: 'var(--navy)', fontSize: 15 }}>{v.title}</strong>
                <p className="sub" style={{ whiteSpace: 'pre-wrap' }}>
                  {v.body}
                </p>
                <span className="row gap6 center small muted">
                  Button: <span className="pill grey">{v.cta}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="card pad stack gap10">
            <CardHeader icon="clock" title="Timeline" />
            <div className="stack gap8">
              {d.timeline.map((t, i) => (
                <div key={`${t.at}-${i}`} className="rowcard">
                  <span className="ic-tile sm">
                    <Icon name="clock" size={16} />
                  </span>
                  <div className="body">
                    <span className="title">{t.label}</span>
                    <span className="meta">{when(t.at)}</span>
                  </div>
                  <span className="meta">{timeAgo(t.at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="stack gap14" style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div className="card pad stack gap10">
            <CardHeader icon="users" title="Audience" />
            <p style={{ fontWeight: 600, color: 'var(--navy)' }}>{c.audienceLabel}</p>
            {c.audience.kind !== 'LIVE_EVENT' && (
              <div className="row gap6" style={{ flexWrap: 'wrap' }} aria-label="Feeders">
                {(c.audience.kind === 'FEEDERS' ? c.audience.feederCodes : [c.audience.feederCode]).map((f) => (
                  <span key={f} className="pill grey mono">
                    {f}
                  </span>
                ))}
              </div>
            )}
            <ul className="small muted stack gap4" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Opted-out customers {c.exclusions.optedOut ? 'excluded' : 'included'}</li>
              <li>Contacted in the last 7 days {c.exclusions.contactedLast7Days ? 'excluded' : 'included'}</li>
              <li>Life-support accounts {c.exclusions.lifeSupport ? 'excluded' : 'included'}</li>
            </ul>
            <p className="small muted">
              Channels:{' '}
              {[c.channels.push && 'Push', c.channels.inApp && 'In-app', c.channels.sms && 'SMS', c.channels.email && 'Email'].filter(Boolean).join(', ') || 'none'}
              {' · '}expires {when(c.expiresAt)}
            </p>
            {inAppRoute && (
              <a className="btn sec sm" style={{ alignSelf: 'flex-start' }} href={`${MOBILE_WEB_URL}${inAppRoute}`} target="_blank" rel="noreferrer">
                <Icon name="open" size={16} />
                Open in-app screen
              </a>
            )}
          </div>

          {ev && (
            <div className="card pad stack gap10">
              <CardHeader
                icon="bolt"
                tone={ev.status === 'ACTIVE' ? 'warn' : ev.status === 'ENDED' ? 'ok' : undefined}
                title="DR event"
                sub={`${evFeeders.length > 1 ? `${evFeeders[0]} +${evFeeders.length - 1}` : evFeeders[0]} · ${fmtWindow(ev.windowStart, ev.windowEnd)}`}
                actions={<StatusPill kind="drStatus" value={ev.status} />}
              />
              <div className="row gap8">
                <button type="button" className="btn warn" disabled={busy || ev.status !== 'SCHEDULED'} onClick={() => onDr('start')}>
                  <Icon name="play" size={16} />
                  Start event now
                </button>
                <button type="button" className="btn outline" disabled={busy || ev.status === 'ENDED'} onClick={() => onDr('end')}>
                  <Icon name="stop" size={16} />
                  End event now
                </button>
              </div>
              <Link to="/events" className="linkbtn" style={{ alignSelf: 'flex-start' }}>
                View all DR events
              </Link>
            </div>
          )}

          <div className="card pad stack gap10">
            <CardHeader icon="file" title="Audit" sub="Who did what to this campaign" actions={<Link to="/audit" className="linkbtn">Full log</Link>} />
            {d.audit.length === 0 ? (
              <EmptyState title="No audit entries yet" />
            ) : (
              <div className="stack gap8">
                {[...d.audit].reverse().map((e) => (
                  <AuditRow key={e.id} e={e} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function Kpi({ label, value, sub, dark }: { label: string; value: string; sub: string; dark?: boolean }) {
  return (
    <div className={`card kpi ${dark ? 'dark' : ''}`.trim()}>
      <span className="kl">{label}</span>
      <span className="kv">{value}</span>
      <span className="ks">{sub}</span>
    </div>
  );
}

function pctText(n: number, d: number, of: string) {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}% ${of}` : `— ${of}`;
}

function FunnelColumn({ r, ab }: { r: VariantRow; ab: boolean }) {
  const fill = r.id === 'B' ? 'var(--accent)' : 'var(--primary)';
  return (
    <div className="stack gap10" style={{ flex: '1 1 240px', minWidth: 0 }} aria-label={`${r.label} funnel`}>
      {ab && (
        <div className="row between center">
          <strong style={{ color: 'var(--navy)' }}>{r.label}</strong>
          {r.leading && <span className="pill ok">Leading</span>}
        </div>
      )}
      {r.stages.map((s) => (
        <div key={s.label} className="stack gap4">
          <div className="row between small">
            <span>{s.label}</span>
            <span className="mono">
              {fmtInt(s.count)} · {s.pct.toFixed(1)}%
            </span>
          </div>
          <div aria-hidden="true" style={{ height: 8, borderRadius: 4, background: 'var(--divider)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, s.pct)}%`, height: '100%', borderRadius: 4, background: fill, transition: 'width 0.4s' }} />
          </div>
        </div>
      ))}
      <span className="small muted">
        {r.keyLabel}: <strong style={{ color: 'var(--navy)' }}>{r.keyRate.toFixed(1)}%</strong>
      </span>
    </div>
  );
}

function AuditRow({ e }: { e: AuditEntry }) {
  return (
    <div className="rowcard">
      <span className="avatar" aria-hidden="true" style={e.actor.kind === 'SYSTEM' ? { background: 'var(--muted)' } : undefined}>
        {initials(e.actor.name)}
      </span>
      <div className="body">
        <span className="title">
          {e.actor.name} · {AUDIT_ACTION_LABEL[e.action]}
        </span>
        <span className="meta">{e.summary}</span>
      </div>
      <span className="meta" title={new Date(e.at).toLocaleString()}>
        {timeAgo(e.at)}
      </span>
    </div>
  );
}

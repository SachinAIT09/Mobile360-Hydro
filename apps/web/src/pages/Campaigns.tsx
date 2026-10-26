import { Link } from 'react-router-dom';
import { BRAND, fmtDate, fmtInt, fmtTime, type Campaign, type CampaignStatus } from '@demo/shared';
import { MOBILE_WEB_URL, useLoad, useSocketEvent } from '../lib/client';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/icons';
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/State';

const STATUS_PILL: Record<Exclude<CampaignStatus, 'SENT'>, { tone: string; label: string }> = {
  SCHEDULED: { tone: 'accent', label: 'Scheduled' },
  SENDING: { tone: 'warn', label: 'Sending' },
  CANCELLED: { tone: 'grey', label: 'Cancelled' },
};

function keyStats(c: Campaign): string {
  if (c.status === 'SCHEDULED') return `Sends ${fmtDate(c.scheduledFor ?? c.sentAt, { month: 'short', day: 'numeric' })} · ${fmtTime(c.scheduledFor ?? c.sentAt)}`;
  if (c.status === 'CANCELLED') return 'Not sent';
  if (c.status === 'SENDING') return 'Sending…';
  if (c.type === 'ENROLL_OFFER') {
    return `${fmtInt(c.stats.delivered)} delivered · ${fmtInt(c.stats.opened)} opened · ${fmtInt(c.stats.acted)} enrolled`;
  }
  return `${fmtInt(c.stats.acted)} responded · ${fmtInt(c.stats.paused)} paused · ${c.stats.peakReducedMw.toFixed(2)} MW`;
}

export function CampaignsPage() {
  const { data, error, loading, reload, setData } = useLoad((api) => api.campaigns());
  const upsert = (c: Campaign) => {
    setData((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list];
    });
  };
  useSocketEvent('campaign:statsChanged', upsert);
  useSocketEvent('campaign:statusChanged', upsert);
  useSocketEvent('demo:reset', () => void reload());

  const list = [...(data ?? [])].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const sentList = list.filter((c) => c.status === 'SENT');
  const scheduledCount = list.filter((c) => c.status === 'SCHEDULED').length;
  const offers = sentList.filter((c) => c.type === 'ENROLL_OFFER').length;
  const requests = sentList.length - offers;

  return (
    <main className="page">
      <PageHeader
        title="Campaign 360"
        icon="campaign"
        sub={`Feeder-level campaigns built from ${BRAND.partners.evDetection} EV detection. Results update live as customers act in the app.`}
        actions={
          <>
            <Link className="btn outline" to="/campaigns/new?type=STOP_CHARGING&feeder=SUB-01-F1&segment=ENROLLED_EV">
              <Icon name="bolt" size={16} />
              New stop-charging request
            </Link>
            <Link className="btn pri" to="/campaigns/new?type=ENROLL_OFFER&feeder=SUB-01-F1&segment=UNENROLLED_EV">
              <Icon name="send" size={16} />
              New enrollment offer
            </Link>
          </>
        }
      />

      <section className="kpis" aria-label="Campaign totals">
        <div className="card kpi">
          <span className="kl">Campaigns sent</span>
          <span className="kv">{data ? fmtInt(sentList.length) : '—'}</span>
          <span className="ks">including test sends{scheduledCount ? ` · ${scheduledCount} scheduled` : ''}</span>
        </div>
        <div className="card kpi">
          <span className="kl">Enrollment offers</span>
          <span className="kv">{data ? fmtInt(offers) : '—'}</span>
          <span className="ks">to detected, unenrolled EVs</span>
        </div>
        <div className="card kpi">
          <span className="kl">Stop-charging requests</span>
          <span className="kv">{data ? fmtInt(requests) : '—'}</span>
          <span className="ks">DR events for enrolled EVs</span>
        </div>
      </section>

      {error && <ErrorNotice message={error} onRetry={() => void reload()} />}
      <section className="card pad stack gap12">
        <div className="card-head">
          <span className="ic-tile">
            <Icon name="campaign" size={18} />
          </span>
          <h2 className="h2">All campaigns</h2>
        </div>
        {loading && !data && <LoadingBlock rows={4} rowHeight={44} label="Loading campaigns" />}
        {data && list.length === 0 && (
          <EmptyState
            title="No campaigns yet"
            body={
              <>
                Start from a feeder on the <Link to="/feeders">Dashboard</Link> or a live {BRAND.partners.evDetection} event.
              </>
            }
            action={{ label: 'Open the Dashboard', to: '/feeders' }}
          />
        )}
        {list.length > 0 && (
          <div className="tablebox">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Sent / due</th>
                  <th scope="col">Type</th>
                  <th scope="col">Title</th>
                  <th scope="col">Audience</th>
                  <th scope="col">Targeted</th>
                  <th scope="col">Results</th>
                  <th scope="col">In app</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const route = c.type === 'STOP_CHARGING' ? (c.drEventId ? `/dr-events/${c.drEventId}` : null) : c.demoMessageId ? `/messages/${c.demoMessageId}` : null;
                  return (
                    <tr key={c.id}>
                      <td>
                        {fmtDate(c.sentAt, { month: 'short', day: 'numeric' })} · {fmtTime(c.sentAt)}
                      </td>
                      <td>
                        <span className={`pill ${c.type === 'ENROLL_OFFER' ? 'ev' : 'warn'}`}>{c.type === 'ENROLL_OFFER' ? 'Enrollment offer' : 'Stop-charging'}</span>
                        {c.isTest && (
                          <span className="pill grey" style={{ marginLeft: 6 }}>
                            Test
                          </span>
                        )}
                        {c.status !== 'SENT' && (
                          <span className={`pill ${STATUS_PILL[c.status].tone}`} style={{ marginLeft: 6 }}>
                            {STATUS_PILL[c.status].label}
                          </span>
                        )}
                        {(c.variants?.length ?? 0) > 1 && (
                          <span className="pill accent" style={{ marginLeft: 6 }} title={c.winner ? `Variant ${c.winner} leading` : 'A/B test'}>
                            A/B{c.winner ? ` · ${c.winner} leads` : ''}
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'normal', minWidth: 220, fontWeight: 600 }}>
                        <Link to={`/campaigns/${c.id}`} style={{ color: 'var(--navy)' }}>
                          {c.title}
                        </Link>
                      </td>
                      <td>
                        {c.audienceLabel}
                        {c.audience.kind === 'FEEDERS' && (
                          <span className="pill grey" style={{ marginLeft: 6 }} title={c.audience.feederCodes.join(', ')}>
                            {c.audience.feederCodes.length} feeders
                          </span>
                        )}
                      </td>
                      <td className="mono">{fmtInt(c.stats.targeted)}</td>
                      <td>{keyStats(c)}</td>
                      <td>
                        {route ? (
                          <a className="iconbtn sm tint" href={`${MOBILE_WEB_URL}${route}`} target="_blank" rel="noreferrer" aria-label="Open in the customer app" title="Open in the customer app">
                            <Icon name="open" size={16} />
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

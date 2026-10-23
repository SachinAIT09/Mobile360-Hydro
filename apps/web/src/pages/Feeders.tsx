import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND, fmtInt, type FeederStat, type SubstationStat } from '@demo/shared';
import { useLoad, useSocketEvent } from '../lib/client';
import { feederCampaignLink } from '../lib/links';
import { LiveEvents } from '../components/LiveEvents';
import { PageHeader } from '../components/PageHeader';
import { Icon, type IconName } from '../components/icons';
import { LoadingBlock } from '../components/State';
import { MapView } from '../components/MapView';

const BAR_MAX_PX = 140;

function shortFeeder(code: string, sub: string) {
  return code.startsWith(`${sub}-`) ? code.slice(sub.length + 1) : code;
}

function Kpi({ label, value, sub, icon, tone, dark }: { label: string; value: string; sub: string; icon: IconName; tone?: string; dark?: boolean }) {
  return (
    <div className={`card kpi ${dark ? 'dark' : ''}`}>
      <div className="kpi-top">
        <span className={`ic-tile sm ${tone ?? ''}`}>
          <Icon name={icon} size={16} />
        </span>
        <span className="kl">{label}</span>
      </div>
      <span className="kv">{value}</span>
      <span className="ks">{sub}</span>
    </div>
  );
}

export function FeedersPage() {
  const overview = useLoad((api) => api.statsOverview());
  const subs = useLoad((api) => api.substations());
  const blind = useLoad((api) => api.blindSpots());
  const dead = useLoad((api) => api.deadSubstations());

  const [pickedSub, setSubCode] = useState<string | null>(null);
  const [pickedFeeder, setFeederCode] = useState<string | null>(null);
  const [view, setView] = useState<'diagram' | 'map'>('diagram');
  const [region, setRegion] = useState('all');
  const [period, setPeriod] = useState<7 | 30 | 90>(30);

  // Region filter: distinct regions from the substation list; filters the substation list and the blind-spots table.
  const regions = useMemo(() => Array.from(new Set((subs.data ?? []).map((s) => s.region))).sort(), [subs.data]);
  const visibleSubs = useMemo(() => (subs.data ?? []).filter((s) => region === 'all' || s.region === region), [subs.data, region]);
  const visibleBlind = useMemo(() => (blind.data ?? []).filter((b) => region === 'all' || !b.region || b.region === region), [blind.data, region]);

  // Default selection: first interactive substation (SUB-01 in the demo), else the largest.
  const subCode =
    (pickedSub && visibleSubs.some((s) => s.code === pickedSub) ? pickedSub : null) ?? (visibleSubs.find((s) => s.interactive) ?? visibleSubs[0])?.code ?? null;

  const feeders = useLoad((api) => (subCode ? api.substationFeeders(subCode) : Promise.resolve([] as FeederStat[])), [subCode]);

  // The picked feeder when it belongs to the listed substation; otherwise the first feeder of the list.
  const feederList = feeders.data;
  const feederCode = pickedFeeder && feederList?.some((f) => f.code === pickedFeeder) ? pickedFeeder : (feederList?.[0]?.code ?? null);

  const refreshAll = () => {
    void overview.reload();
    void subs.reload();
    void blind.reload();
    void dead.reload();
    void feeders.reload();
  };
  useSocketEvent('feeder:statsChanged', refreshAll);
  useSocketEvent('demo:reset', refreshAll);

  const sub: SubstationStat | undefined = subs.data?.find((s) => s.code === subCode);
  const selected: FeederStat | undefined = feeders.data?.find((f) => f.code === feederCode);
  const maxEvs = useMemo(() => Math.max(1, ...(feeders.data ?? []).map((f) => f.evs)), [feeders.data]);
  const ov = overview.data;
  const subTotalEvs = (feeders.data ?? []).reduce((a, f) => a + f.evs, 0);

  return (
    <main className="page">
      <PageHeader title="Dashboard" />
      <section className="hero">
        <div className="stack gap8">
          <h2 className="h1">You manage the EVs that signed up. This shows the ones that didn't.</h2>
          <p className="lead">
            EVs detected by {BRAND.partners.evDetection} from smart meter data, matched to substation and feeder, compared with program enrollment.
          </p>
        </div>
        <div className="row gap8" style={{ position: 'relative', zIndex: 1 }}>
          <label className="filter" style={{ color: 'var(--header-muted)' }}>
            Region
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="all">All regions</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="filter" style={{ color: 'var(--header-muted)' }}>
            Period
            <select value={String(period)} onChange={(e) => setPeriod(Number(e.target.value) as 7 | 30 | 90)}>
              <option value="30">Last 30 days</option>
              <option value="7">Last 7 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
        </div>
      </section>

      <section className="kpis" aria-label="Headline figures">
        <Kpi label="Substations" value={ov ? fmtInt(ov.substations) : '—'} sub="with matched EVs" icon="pylon" />
        <Kpi label="Feeders" value={ov ? fmtInt(ov.feeders) : '—'} sub="with matched EVs" icon="bolt" tone="accent" />
        <Kpi label="Known EVs" value={ov ? fmtInt(ov.knownEvs) : '—'} sub="enrolled in the program" icon="check" tone="solar" />
        <Kpi label="Unenrolled EVs" value={ov ? fmtInt(ov.unenrolledEvs) : '—'} sub="detected, not enrolled" icon="car" />
        <Kpi label="Invisible" value={ov ? `${ov.invisiblePct}%` : '—'} sub="of EVs invisible to enrollment" icon="eye" dark />
      </section>
      {overview.error && <div className="notice err">Couldn't load figures: {overview.error}</div>}
      <p className="small muted" style={{ marginTop: -8 }}>
        Headline figures cover all regions · Snapshot: Sep 2026 pilot{period !== 30 ? ` · live events: last ${period} days` : ''}
      </p>

      <LiveEvents days={period} />

      <section className="three">
        <div className="card sublist" aria-labelledby="subs-h">
          <h2 id="subs-h" className="h2">
            Substations, by total EVs
          </h2>
          {subs.data && (
            <p className="small muted" style={{ padding: '0 20px 8px' }} aria-live="polite">
              Showing {visibleSubs.length} substation{visibleSubs.length === 1 ? '' : 's'}
              {region === 'all' ? ' in all regions' : ` in ${region}`}
            </p>
          )}
          {visibleSubs.map((s) => (
            <button
              key={s.code}
              type="button"
              className={`subbtn ${s.code === subCode ? 'sel' : ''}`}
              aria-pressed={s.code === subCode}
              onClick={() => setSubCode(s.code)}
            >
              <span className="row between">
                <span className="code mono">{s.code}</span>
                <span style={{ fontWeight: 600 }}>{fmtInt(s.evs)} EVs</span>
              </span>
              <span className="small muted">
                {s.knownPct}% known · {s.penetrationPct}% penetration
              </span>
              <span className="splitbar" aria-hidden="true">
                <span style={{ width: `${s.knownPct}%` }} />
              </span>
            </button>
          ))}
          {subs.loading && !subs.data && <LoadingBlock rows={4} rowHeight={40} label="Loading substations" className="pad" />}
        </div>

        <div className="card pad diagram stack gap14">
          <div className="row between gap8">
            <div className="card-head">
              <span className="ic-tile">
                <Icon name="pylon" size={18} />
              </span>
              <div>
                <div className="lbl">Selected substation</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>{sub?.code ?? '—'}</div>
                <div className="small muted">{sub ? `${sub.feederCount} feeders · ${fmtInt(sub.evs)} matched EVs` : ''}</div>
              </div>
            </div>
            <div className="toggle" role="group" aria-label="View">
              <button type="button" className={view === 'diagram' ? 'on' : ''} aria-pressed={view === 'diagram'} onClick={() => setView('diagram')}>
                Diagram
              </button>
              <button type="button" className={view === 'map' ? 'on' : ''} aria-pressed={view === 'map'} onClick={() => setView('map')}>
                Map
              </button>
            </div>
          </div>

          {view === 'map' ? (
            feeders.data && feeders.data.length > 0 && subCode ? (
              <MapView feeders={feeders.data} selected={feederCode} onSelect={setFeederCode} substationCode={subCode} substations={visibleSubs} onSelectSubstation={setSubCode} />
            ) : (
              <div className="mapph">
                <span>
                  <Icon name="map" size={28} />
                  <br />
                  {feeders.loading ? 'Loading feeders…' : `No feeder data to plot for this substation. Map view will plot feeders and EV premises once ${BRAND.utilityName} GIS data is connected.`}
                </span>
              </div>
            )
          ) : (
            <>
              <div className="schematic" aria-hidden="true">
                <span className="node" />
                <span className="small muted">Substation</span>
                <span className="stem" />
              </div>
              <div className="bus" aria-hidden="true" />
              {feeders.data && feeders.data.length > 0 ? (
                <div className="feeders">
                  {feeders.data.map((f) => {
                    const scale = BAR_MAX_PX / maxEvs;
                    const split = f.known !== null && f.unenrolled !== null;
                    return (
                      <button
                        key={f.code}
                        type="button"
                        className={`fbtn ${f.code === feederCode ? 'sel' : ''}`}
                        aria-pressed={f.code === feederCode}
                        aria-label={`${f.code}, ${f.evs} EVs${split ? `, ${f.known} enrolled, ${f.unenrolled} unenrolled` : ''}`}
                        onClick={() => setFeederCode(f.code)}
                      >
                        <span className="fbar" aria-hidden="true">
                          {split ? (
                            <>
                              <span style={{ background: 'var(--ev)', height: Math.max(2, Math.round((f.unenrolled ?? 0) * scale)) }} />
                              <span style={{ background: 'var(--solar)', height: Math.max(2, Math.round((f.known ?? 0) * scale)) }} />
                            </>
                          ) : (
                            <span style={{ background: 'var(--split-pending)', height: Math.max(4, Math.round(f.evs * scale)) }} />
                          )}
                        </span>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                          {shortFeeder(f.code, f.substationCode)}
                        </span>
                        <span className="small muted">{f.evs} EVs</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mapph">
                  {feeders.loading ? 'Loading feeders…' : 'Feeder-level split is not available for this substation in the sample data.'}
                </div>
              )}
              <div className="legend">
                <span>
                  <span className="sw" style={{ background: 'var(--solar)' }} />
                  Known / enrolled
                </span>
                <span>
                  <span className="sw" style={{ background: 'var(--ev)' }} />
                  Detected, unenrolled
                </span>
                <span>
                  <span className="sw" style={{ background: 'var(--split-pending)' }} />
                  Split not in sample
                </span>
              </div>
              {sub && !sub.interactive && (
                <p className="small muted">
                  Only SUB-01 has premise-level data in this demo; other substations show totals from the {BRAND.partners.evDetection} sample.
                </p>
              )}
              {sub && sub.interactive && subTotalEvs !== sub.evs && (
                <p className="small muted">Feeder totals update live as EVs are detected and customers enroll.</p>
              )}
            </>
          )}
        </div>

        <FeederDetail feeder={selected} />
      </section>

      <section className="card pad stack gap12" aria-labelledby="blind-h">
        <div className="card-head">
          <span className="ic-tile warn">
            <Icon name="eye" size={18} />
          </span>
          <div className="stack gap4" style={{ flex: 1 }}>
            <h2 id="blind-h" className="h2">
              Worst blind spots
            </h2>
            <p className="small muted" style={{ fontSize: 13 }}>
              Feeders with at least 15 EVs, ranked by the share invisible to enrollment.
            </p>
          </div>
        </div>
        <div className="tablebox">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Feeder</th>
                <th scope="col">Enrolled</th>
                <th scope="col">Unenrolled</th>
                <th scope="col">Penetration</th>
                <th scope="col">Gap (% invisible)</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleBlind.map((b) => (
                <tr key={b.feederCode}>
                  <td>{b.rank}</td>
                  <td className="mono" style={{ fontWeight: 600, color: 'var(--navy)' }}>
                    {b.feederCode}
                  </td>
                  <td>{b.known} known</td>
                  <td>{b.unenrolled} unenrolled</td>
                  <td>{b.penetrationText}</td>
                  <td>
                    <span className="gapbar" aria-hidden="true">
                      <span style={{ width: `${b.gapPct}%` }} />
                    </span>
                    <strong>{b.gapPct}%</strong>
                  </td>
                  <td>
                    <Link className="btn sec sm" to={feederCampaignLink('ENROLL_OFFER', b.feederCode, 'UNENROLLED_EV')}>
                      Target {b.unenrolled}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {blind.loading && !blind.data && <LoadingBlock rows={3} label="Loading blind spots" />}
        {blind.data && visibleBlind.length === 0 && <p className="sub">No blind spots in {region === 'all' ? 'the sample' : region}.</p>}
      </section>

      <section className="card pad stack gap10" aria-labelledby="dead-h">
        <div className="card-head">
          <span className="ic-tile">
            <Icon name="alert" size={18} />
          </span>
          <h2 id="dead-h" className="h2">
            No observed EV activity
          </h2>
        </div>
        {ov && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-body)' }}>
              {ov.deadSubstations} substations show no EV signal on any feeder, and {ov.partiallyDeadSubstations} more have at
              least one dead feeder ({ov.deadFeeders} feeders, {fmtInt(ov.deadFeederPremises)} premises). Check whether these are
              truly zero EVs or a detection gap.
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              Of {fmtInt(ov.matchedPremises)} matched premises, {fmtInt(ov.noSignalPremises)} show no EV signal.{' '}
              {fmtInt(ov.noLocationPremises)} premises have no grid location yet and are excluded.
            </p>
          </>
        )}
        {dead.data && dead.data.length > 0 && (
          <div className="tablebox">
            <table className="tbl" style={{ minWidth: 420 }}>
              <thead>
                <tr>
                  <th scope="col">Substation (largest {Math.min(8, dead.data.length)} of {dead.data.length})</th>
                  <th scope="col">Feeders</th>
                  <th scope="col">Premises</th>
                </tr>
              </thead>
              <tbody>
                {dead.data.slice(0, 8).map((d) => (
                  <tr key={d.code}>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--navy)' }}>
                      {d.code}
                    </td>
                    <td>
                      {d.feeders} feeder{d.feeders === 1 ? '' : 's'}, all dead
                    </td>
                    <td>{d.premises}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="small muted">{ov?.dataSourceNote ?? `Feeder figures: ${BRAND.partners.evDetection} feeder EV visibility pilot, anonymized. Shown as sample data.`}</p>
    </main>
  );
}

function FeederDetail({ feeder }: { feeder: FeederStat | undefined }) {
  if (!feeder) {
    return (
      <div className="card pad detail stack gap10">
        <p className="sub">Select a feeder to see its details.</p>
      </div>
    );
  }
  const split = feeder.known !== null && feeder.unenrolled !== null;
  const dash = (v: number | null, suffix = '') => (v === null ? '—' : `${fmtInt(v)}${suffix}`);
  return (
    <div className="card pad detail stack gap10" aria-live="polite">
      <div className="card-head">
        <span className="ic-tile accent">
          <Icon name="bolt" size={18} />
        </span>
        <div>
          <div className="lbl">{feeder.substationCode} feeder</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>
            {feeder.code}
          </div>
        </div>
      </div>
      <div className="stack">
        <div className="kvrow">
          <span>Known, enrolled EVs</span>
          <strong style={{ color: 'var(--known-text)' }}>{dash(feeder.known)}</strong>
        </div>
        <div className="kvrow">
          <span>Detected, unenrolled EVs</span>
          <strong style={{ color: 'var(--unenrolled-text)' }}>{dash(feeder.unenrolled)}</strong>
        </div>
        <div className="kvrow">
          <span>Total matched EVs</span>
          <strong>{fmtInt(feeder.evs)}</strong>
        </div>
        <div className="kvrow">
          <span>Also confirmed by enrollment</span>
          <strong>{dash(feeder.confirmedByEnrollment)}</strong>
        </div>
        <div className="kvrow">
          <span>Ground-truth validated</span>
          <strong>{dash(feeder.groundTruthValidated)}</strong>
        </div>
        <div className="kvrow">
          <span>Premises on this feeder</span>
          <strong>{dash(feeder.premises)}</strong>
        </div>
        <div className="kvrow">
          <span>EV penetration</span>
          <strong>{feeder.penetrationPct === null ? '—' : `${feeder.penetrationPct}%`}</strong>
        </div>
        {feeder.forecastLoadPct !== null && feeder.forecastLoadPct >= 90 && (
          <div className="kvrow">
            <span>Load forecast tonight</span>
            <strong style={{ color: 'var(--warning-text)' }}>{feeder.forecastLoadPct}% of capacity</strong>
          </div>
        )}
      </div>
      <p className="notice info" style={{ margin: '4px 0' }}>
        {split ? (
          <>
            <strong>{feeder.invisiblePct ?? 0}% invisible.</strong> Enrollment data accounts for {feeder.known} of {feeder.evs} EVs
            here. The other {feeder.unenrolled} draw load with no enrollment, no notice and no way to curtail them today.
            {feeder.penetrationPct !== null && feeder.premises !== null
              ? ` EVs sit on ${feeder.penetrationPct}% of the ${fmtInt(feeder.premises)} premises on this feeder.`
              : ''}
          </>
        ) : (
          'The enrolled / unenrolled split for this feeder is not in the sample data.'
        )}
      </p>
      {split ? (
        <>
          <Link className="btn pri wrap" to={feederCampaignLink('ENROLL_OFFER', feeder.code, 'UNENROLLED_EV')}>
            Target {feeder.unenrolled} unenrolled · enrollment offer
          </Link>
          <Link className="btn outline wrap" to={feederCampaignLink('STOP_CHARGING', feeder.code, 'ENROLLED_EV')}>
            Stop-charging request to {feeder.known} enrolled
          </Link>
        </>
      ) : (
        <span className="btn sec" aria-disabled="true">
          Targeting needs premise-level data
        </span>
      )}
    </div>
  );
}

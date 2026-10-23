import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  BRAND,
  PROGRAM,
  fmtInt,
  fmtWindow,
  type AudiencePreview,
  type Campaign,
  type CampaignAudience,
  type CampaignChannels,
  type CampaignExclusions,
  type CampaignSegment,
  type CampaignType,
  type DrEventStatus,
} from '@demo/shared';
import { MOBILE_WEB_URL, useApi, useLoad, useSocketEvent } from '../lib/client';
import { upcomingWindow } from '../lib/window';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/icons';

interface TypeDefaults {
  label: string;
  sub: string;
  segment: CampaignSegment;
  trigger: string;
  title: string;
  body: string;
  cta: string;
  sms: boolean;
  expiresInHours: number;
}

const DEFAULTS: Record<CampaignType, TypeDefaults> = {
  ENROLL_OFFER: {
    label: 'Enrollment offer',
    sub: 'Target unenrolled EVs on this feeder',
    segment: 'UNENROLLED_EV',
    trigger: 'EV detected / stopped charging',
    title: `EV owners near you are saving with ${PROGRAM.name}`,
    body: `Hi {first_name}, {neighbours_enrolled} EV owners in your area have already joined ${PROGRAM.name}. Join today and get {incentive}. You can opt out of any event.`,
    cta: 'Enroll in 1 minute',
    sms: false,
    expiresInHours: 336,
  },
  STOP_CHARGING: {
    label: 'Stop-charging request',
    sub: 'DR event for enrolled EVs on this feeder',
    segment: 'ENROLLED_EV',
    trigger: 'Feeder load forecast above 90%',
    title: 'Please pause EV charging {event_window} today',
    body: `Hi {first_name}, demand on your local line is close to its limit this evening. Please pause EV charging during {event_window} and earn ${PROGRAM.perEventIncentive}. Can’t take part? Opt out in the app.`,
    cta: 'Respond',
    sms: true,
    expiresInHours: 4,
  },
};

const EXPIRY_OPTIONS: Record<CampaignType, { value: number; label: string }[]> = {
  ENROLL_OFFER: [
    { value: 336, label: '14 days' },
    { value: 168, label: '7 days' },
    { value: 72, label: '3 days' },
    { value: 24, label: '24 hours' },
  ],
  STOP_CHARGING: [
    { value: 4, label: 'At event end' },
    { value: 12, label: '12 hours' },
  ],
};

const SEGMENT_LABEL: Record<CampaignSegment, string> = {
  UNENROLLED_EV: 'Detected, unenrolled EVs',
  ENROLLED_EV: 'Enrolled EVs (DR program)',
};

const MERGE_FIELDS = ['{first_name}', '{incentive}', '{event_window}', '{neighbours_enrolled}'];

function isType(v: string | null): v is CampaignType {
  return v === 'ENROLL_OFFER' || v === 'STOP_CHARGING';
}
function isSegment(v: string | null): v is CampaignSegment {
  return v === 'UNENROLLED_EV' || v === 'ENROLLED_EV';
}

export function CampaignNewPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qType = params.get('type');
  const qSegment = params.get('segment');
  const qFeeder = params.get('feeder');
  const qLive = params.get('liveEventId');

  const initialType: CampaignType = isType(qType) ? qType : 'ENROLL_OFFER';
  const [type, setType] = useState<CampaignType>(initialType);
  const [segment, setSegment] = useState<CampaignSegment>(isSegment(qSegment) ? qSegment : DEFAULTS[initialType].segment);
  /** Either a feeder code or `live:<liveEventId>`. */
  const [audienceKey, setAudienceKey] = useState<string>(qLive ? `live:${qLive}` : qFeeder || 'SUB-01-F1');
  const [exclusions, setExclusions] = useState<CampaignExclusions>({ optedOut: true, contactedLast7Days: true, lifeSupport: true });
  const [title, setTitle] = useState(DEFAULTS[initialType].title);
  const [body, setBody] = useState(DEFAULTS[initialType].body);
  const [cta, setCta] = useState(DEFAULTS[initialType].cta);
  const [channels, setChannels] = useState<CampaignChannels>({ push: true, inApp: true, sms: DEFAULTS[initialType].sms, email: false });
  const [expiresInHours, setExpiresInHours] = useState(DEFAULTS[initialType].expiresInHours);

  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [sending, setSending] = useState<'test' | 'all' | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [sent, setSent] = useState<Campaign | null>(null);
  const [drStatus, setDrStatus] = useState<DrEventStatus | null>(null);
  const [drBusy, setDrBusy] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<'title' | 'body'>('body');

  const feeders = useLoad((a) => a.substationFeeders('SUB-01'));
  const live = useLoad((a) => a.liveEvents());
  const demo = useLoad((a) => a.demoState());

  const liveEvent = qLive ? live.data?.find((e) => e.id === qLive) : undefined;
  const audience: CampaignAudience = audienceKey.startsWith('live:')
    ? { kind: 'LIVE_EVENT', liveEventId: audienceKey.slice(5), segment }
    : { kind: 'FEEDER', feederCode: audienceKey, segment };
  const feederCode = audience.kind === 'FEEDER' ? audience.feederCode : liveEvent?.substationCode ?? 'SUB-01';
  const feederStat = feeders.data?.find((f) => f.code === feederCode);

  const feederOptions = useMemo(() => {
    const list = (feeders.data ?? []).map((f) => ({ value: f.code, label: `${f.code} (${f.evs} EVs)` }));
    if (qFeeder && !list.some((o) => o.value === qFeeder)) {
      list.push({ value: qFeeder, label: feeders.data ? `${qFeeder} (sample, no premise data)` : qFeeder });
    }
    if (list.length === 0) list.push({ value: 'SUB-01-F1', label: 'SUB-01-F1' });
    return list;
  }, [feeders.data, qFeeder]);

  // Live audience count (debounced).
  const audienceSig = JSON.stringify({ audience, exclusions });
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const p = await api.previewAudience({ audience, exclusions });
        if (!cancelled) {
          setPreview(p);
          setPreviewErr(null);
        }
      } catch (e) {
        if (!cancelled) setPreviewErr(e instanceof Error ? e.message : 'Could not count the audience');
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceSig, api]);

  const refreshPreview = () => {
    api.previewAudience({ audience, exclusions }).then(setPreview).catch(() => undefined);
  };
  useSocketEvent('feeder:statsChanged', refreshPreview);
  useSocketEvent('campaign:statsChanged', (c) => {
    if (sent && c.id === sent.id) setSent(c);
  });
  useSocketEvent('drEvent:statusChanged', (e) => {
    if (sent && e.id === sent.drEventId) setDrStatus(e.status);
  });
  useSocketEvent('demo:reset', () => {
    setSent(null);
    setDrStatus(null);
    void demo.reload();
    void live.reload();
    refreshPreview();
  });

  function switchType(t: CampaignType) {
    if (t === type) return;
    const d = DEFAULTS[t];
    setType(t);
    setSegment(d.segment);
    setTitle(d.title);
    setBody(d.body);
    setCta(d.cta);
    setChannels((c) => ({ ...c, sms: d.sms }));
    setExpiresInHours(d.expiresInHours);
    setSent(null);
    setDrStatus(null);
    setSendErr(null);
  }

  function insertMerge(field: string) {
    const target = lastFocus.current === 'title' ? titleRef.current : bodyRef.current;
    const value = lastFocus.current === 'title' ? title : body;
    const setter = lastFocus.current === 'title' ? setTitle : setBody;
    const start = target?.selectionStart ?? value.length;
    const end = target?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + field + value.slice(end);
    setter(next);
    window.requestAnimationFrame(() => {
      if (!target) return;
      target.focus();
      const pos = start + field.length;
      target.setSelectionRange(pos, pos);
    });
  }

  const demoUnenrolled = demo.data?.customers.find((c) => c.role === 'UNENROLLED_DEMO');
  const demoEnrolled = demo.data?.customers.find((c) => c.role === 'ENROLLED_DEMO');
  const testCustomer = type === 'ENROLL_OFFER' ? demoUnenrolled : demoEnrolled;

  const win = upcomingWindow();
  const sample: Record<string, string> = {
    '{first_name}': testCustomer?.firstName ?? 'Manny',
    '{incentive}': PROGRAM.signupIncentive,
    '{event_window}': fmtWindow(win.start, win.end),
    '{neighbours_enrolled}': feederStat?.known != null ? String(feederStat.known) : '[N]',
  };
  const resolve = (s: string) => MERGE_FIELDS.reduce((acc, f) => acc.split(f).join(sample[f]), s);

  async function send(test: boolean) {
    setSendErr(null);
    if (test && !testCustomer) {
      setSendErr('Demo customers are not loaded yet.');
      return;
    }
    setSending(test ? 'test' : 'all');
    try {
      const c = await api.createCampaign({
        type,
        audience,
        exclusions,
        title,
        body,
        cta,
        channels,
        schedule: { sendNow: true, expiresInHours },
        ...(test && testCustomer ? { testCustomerId: testCustomer.customerId } : {}),
      });
      setSent(c);
      setDrStatus(c.drEventId ? 'SCHEDULED' : null);
    } catch (e) {
      setSendErr(e instanceof ApiError || e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(null);
    }
  }

  async function drAction(action: 'start' | 'end') {
    if (!sent?.drEventId) return;
    setDrBusy(true);
    try {
      const ev = action === 'start' ? await api.drStart(sent.drEventId) : await api.drEnd(sent.drEventId);
      setDrStatus(ev.status);
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : 'Could not update the event');
    } finally {
      setDrBusy(false);
    }
  }

  const count = preview?.count ?? null;
  const audienceDesc =
    audience.kind === 'LIVE_EVENT'
      ? liveEvent
        ? `the “${liveEvent.headline}” event on ${liveEvent.substationCode}`
        : `a live ${BRAND.partners.evDetection} event`
      : audience.feederCode;
  const inAppRoute = sent
    ? sent.type === 'STOP_CHARGING'
      ? sent.drEventId
        ? `/dr-events/${sent.drEventId}`
        : null
      : sent.demoMessageId
        ? `/messages/${sent.demoMessageId}`
        : null
    : null;

  return (
    <main className="page" style={{ gap: 18 }}>
      <PageHeader title="New feeder campaign" />
      <div className="stack gap6">
        <Link to="/feeders" className="row center gap6" style={{ fontSize: 14, fontWeight: 600 }}>
          <Icon name="back" size={16} />
          Back to the Dashboard
        </Link>
        <p className="lead">
          Audience built from {BRAND.partners.evDetection} EV detection on {audience.kind === 'LIVE_EVENT' ? audienceDesc : <span className="mono">{audienceDesc}</span>}. Messages go to the{' '}
          {BRAND.utilityName} app and the channels you pick.
        </p>
      </div>

      <div className="tabs" role="tablist" aria-label="Campaign type">
        {(Object.keys(DEFAULTS) as CampaignType[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === type} className={`tab ${t === type ? 'on' : ''}`} onClick={() => switchType(t)}>
            <span className="tl">{DEFAULTS[t].label}</span>
            <span className="ts">{DEFAULTS[t].sub}</span>
          </button>
        ))}
      </div>

      <section className="three" style={{ gap: 18 }}>
        <div className="stack gap14" style={{ flex: '999 1 600px', minWidth: 0 }}>
          <StepBar step={sent ? 3 : 2} title={sent ? 'Sent' : 'Compose'} />
          <div className="card pad stack gap12">
            <div className="card-head">
              <span className="stepnum">1</span>
              <h2 className="h2">Audience</h2>
              <span style={{ fontSize: 14 }} aria-live="polite">
                <strong style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>
                  {count === null ? '…' : fmtInt(count)}
                </strong>{' '}
                customers
              </span>
            </div>
            <div className="grid3">
              <label className="field">
                <span className="lbl">TRIGGER (NET2GRID)</span>
                <select className="fld" value={DEFAULTS[type].trigger} onChange={() => undefined}>
                  <option>{DEFAULTS[type].trigger}</option>
                </select>
              </label>
              <label className="field">
                <span className="lbl">{audience.kind === 'LIVE_EVENT' ? 'AUDIENCE SOURCE' : 'FEEDER'}</span>
                <select className="fld" value={audienceKey} onChange={(e) => setAudienceKey(e.target.value)}>
                  {qLive && (
                    <option value={`live:${qLive}`}>
                      {liveEvent ? `Live event: ${liveEvent.headline} (${liveEvent.substationCode})` : `Live ${BRAND.partners.evDetection} event`}
                    </option>
                  )}
                  {feederOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="lbl">SEGMENT</span>
                <select className="fld" value={segment} onChange={(e) => setSegment(e.target.value as CampaignSegment)}>
                  <option value="UNENROLLED_EV">{SEGMENT_LABEL.UNENROLLED_EV}</option>
                  <option value="ENROLLED_EV">{SEGMENT_LABEL.ENROLLED_EV}</option>
                </select>
              </label>
            </div>
            <div className="row" style={{ gap: '4px 20px' }}>
              <label className="chk">
                <input type="checkbox" checked={exclusions.optedOut} onChange={(e) => setExclusions({ ...exclusions, optedOut: e.target.checked })} />
                Exclude customers who opted out of messages
              </label>
              <label className="chk">
                <input
                  type="checkbox"
                  checked={exclusions.contactedLast7Days}
                  onChange={(e) => setExclusions({ ...exclusions, contactedLast7Days: e.target.checked })}
                />
                Exclude customers contacted in the last 7 days
              </label>
              <label className="chk">
                <input type="checkbox" checked={exclusions.lifeSupport} onChange={(e) => setExclusions({ ...exclusions, lifeSupport: e.target.checked })} />
                Exclude life-support / medical-priority accounts
              </label>
            </div>
            {preview && (
              <p className="small muted">
                {preview.label} · {fmtInt(preview.before)} before exclusions (opted out {preview.excluded.optedOut}, contacted{' '}
                {preview.excluded.contactedLast7Days}, life-support {preview.excluded.lifeSupport})
                {preview.includesDemoCustomer ? ' · includes the demo customer' : ''}
              </p>
            )}
            {previewErr && <div className="notice err">{previewErr}</div>}
          </div>

          <div className="card pad stack gap12">
            <div className="card-head">
              <span className="stepnum">2</span>
              <h2 className="h2">Message</h2>
            </div>
            <label className="field">
              <span className="lbl">TITLE</span>
              <input
                ref={titleRef}
                className="fld"
                type="text"
                value={title}
                onFocus={() => (lastFocus.current = 'title')}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="lbl">BODY</span>
              <textarea ref={bodyRef} className="fld" value={body} onFocus={() => (lastFocus.current = 'body')} onChange={(e) => setBody(e.target.value)} />
            </label>
            <div className="row gap8 center" style={{ fontSize: 13, color: 'var(--muted)' }}>
              Insert:
              {MERGE_FIELDS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="chip"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMerge(f)}
                  aria-label={`Insert ${f} at the cursor`}
                >
                  {f}
                </button>
              ))}
            </div>
            <label className="field" style={{ maxWidth: 320 }}>
              <span className="lbl">BUTTON</span>
              <input className="fld" type="text" value={cta} onChange={(e) => setCta(e.target.value)} />
            </label>
          </div>

          <div className="row gap14">
            <fieldset className="card pad stack gap6" style={{ flex: '1 1 280px', margin: 0 }}>
              <legend className="h2 row center gap10" style={{ float: 'left', marginBottom: 4 }}>
                <span className="stepnum">3</span>
                Channels
              </legend>
              <div style={{ clear: 'both' }} />
              <label className="chk">
                <input type="checkbox" checked={channels.push} onChange={(e) => setChannels({ ...channels, push: e.target.checked })} />
                App push notification
              </label>
              <label className="chk">
                <input type="checkbox" checked={channels.inApp} onChange={(e) => setChannels({ ...channels, inApp: e.target.checked })} />
                In-app message inbox
              </label>
              <label className="chk">
                <input type="checkbox" checked={channels.sms} onChange={(e) => setChannels({ ...channels, sms: e.target.checked })} />
                SMS
              </label>
              <label className="chk">
                <input type="checkbox" checked={channels.email} onChange={(e) => setChannels({ ...channels, email: e.target.checked })} />
                Email
              </label>
              <p className="small muted">SMS and email are recorded only in this demo.</p>
            </fieldset>
            <fieldset className="card pad stack gap10" style={{ flex: '1 1 280px', margin: 0 }}>
              <legend className="h2 row center gap10" style={{ float: 'left', marginBottom: 4 }}>
                <span className="stepnum">4</span>
                Schedule
              </legend>
              <div style={{ clear: 'both' }} />
              <label className="chk">
                <input type="radio" name="when" defaultChecked />
                {type === 'STOP_CHARGING' ? `Send now (event ${fmtWindow(win.start, win.end)})` : 'Send now'}
              </label>
              <label className="chk" title="Scheduling is not part of this demo">
                <input type="radio" name="when" disabled />
                <span className="muted">Schedule for later (not in demo)</span>
              </label>
              <label className="field">
                <span className="lbl">EXPIRES</span>
                <select className="fld" value={expiresInHours} onChange={(e) => setExpiresInHours(Number(e.target.value))}>
                  {EXPIRY_OPTIONS[type].map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          </div>

          {sendErr && (
            <div className="notice err" role="alert">
              {sendErr}
            </div>
          )}
          {sent && (
            <div className="notice ok" role="status">
              {sent.isTest
                ? `Test sent to ${testCustomer?.firstName ?? 'the demo customer'}. Check the phone.`
                : `Sent to ${fmtInt(sent.stats.targeted)} customers (${sent.audienceLabel}). Results update live on the right.`}
            </div>
          )}
          <div className="row gap10" style={{ justifyContent: 'flex-end' }}>
            {sent && !sent.isTest && (
              <button
                type="button"
                className="btn sec lg"
                onClick={() => {
                  setSent(null);
                  setDrStatus(null);
                }}
              >
                New campaign
              </button>
            )}
            <button type="button" className="btn outline lg" disabled={sending !== null || !testCustomer} onClick={() => void send(true)}>
              <Icon name="phone" size={16} />
              {sending === 'test' ? 'Sending…' : `Send test to me${testCustomer ? ` (${testCustomer.firstName})` : ''}`}
            </button>
            <button type="button" className="btn pri lg" disabled={sending !== null || !count} onClick={() => void send(false)}>
              <Icon name="send" size={16} />
              {sending === 'all' ? 'Sending…' : `Send to ${count === null ? '…' : fmtInt(count)} customers`}
            </button>
          </div>
        </div>

        <div className="stack gap14" style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div className="card pad stack gap12" style={{ alignItems: 'center' }}>
            <div className="card-head" style={{ alignSelf: 'stretch' }}>
              <span className="ic-tile accent">
                <Icon name="phone" size={18} />
              </span>
              <h2 className="h2">Preview on phone</h2>
            </div>
            <div className="phone" aria-label="Push notification preview">
              <div className="push">
                <span className="row between muted" style={{ fontSize: 11 }}>
                  <span>{BRAND.utilityName.toUpperCase()}</span>
                  <span>now</span>
                </span>
                <strong>{resolve(title) || 'Title'}</strong>
                <span>{truncate(resolve(body), 110) || 'Message body'}</span>
              </div>
            </div>
            {inAppRoute ? (
              <a className="btn sec sm" href={`${MOBILE_WEB_URL}${inAppRoute}`} target="_blank" rel="noreferrer">
                <Icon name="open" size={16} />
                Open in-app screen
              </a>
            ) : (
              <span className="small muted">
                {sent ? 'The demo customer is not in this audience.' : 'In-app screen opens here after you send.'}
              </span>
            )}
          </div>

          <ResultsPanel type={type} sent={sent} />

          {sent && sent.type === 'STOP_CHARGING' && sent.drEventId && (
            <div className="card pad stack gap10">
              <div className="card-head">
                <span className={`ic-tile ${drStatus === 'ACTIVE' ? 'warn' : drStatus === 'ENDED' ? 'ok' : ''}`}>
                  <Icon name="bolt" size={18} />
                </span>
                <h2 className="h2">DR event</h2>
                <span className={`pill ${drStatus === 'ACTIVE' ? 'warn' : drStatus === 'ENDED' ? 'ok' : 'grey'}`}>{drStatus ?? 'SCHEDULED'}</span>
              </div>
              <div className="row gap8">
                <button type="button" className="btn warn" disabled={drBusy || drStatus !== 'SCHEDULED'} onClick={() => void drAction('start')}>
                  <Icon name="play" size={16} />
                  Start event now
                </button>
                <button type="button" className="btn outline" disabled={drBusy || drStatus === 'ENDED'} onClick={() => void drAction('end')}>
                  <Icon name="stop" size={16} />
                  End event now
                </button>
              </div>
              <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/events')}>
                View all DR events
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

const STEPS = ['Audience', 'Compose', 'Sent'];

/** "Step 1 of 3" segmented progress bar, as on the Figma "Make a Payment" card. */
function StepBar({ step, title }: { step: number; title: string }) {
  return (
    <div className="stepbar" aria-label={`Step ${step} of ${STEPS.length}: ${title}`}>
      <div className="steprow">
        <strong>{title}</strong>
        <span>
          Step {step} of {STEPS.length}
        </span>
      </div>
      <div className="segs" aria-hidden="true">
        {STEPS.map((s, i) => (
          <i key={s} className={i < step ? 'done' : ''} />
        ))}
      </div>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function ResultsPanel({ type, sent }: { type: CampaignType; sent: Campaign | null }) {
  const sampleStats =
    type === 'ENROLL_OFFER'
      ? [
          { v: '118', l: 'Sent' },
          { v: '116', l: 'Delivered' },
          { v: '74', l: 'Opened' },
          { v: '21', l: 'Enrolled' },
        ]
      : [
          { v: '64', l: 'Delivered' },
          { v: '58', l: 'Responded' },
          { v: '52', l: 'Paused charging' },
          { v: '0.37 MW', l: 'Peak reduced' },
        ];
  const liveStats = sent
    ? sent.type === 'ENROLL_OFFER'
      ? [
          { v: fmtInt(sent.stats.sent), l: 'Sent' },
          { v: fmtInt(sent.stats.delivered), l: 'Delivered' },
          { v: fmtInt(sent.stats.opened), l: 'Opened' },
          { v: fmtInt(sent.stats.acted), l: 'Enrolled' },
        ]
      : [
          { v: fmtInt(sent.stats.delivered), l: 'Delivered' },
          { v: fmtInt(sent.stats.acted), l: 'Responded' },
          { v: fmtInt(sent.stats.paused), l: 'Paused charging' },
          { v: `${sent.stats.peakReducedMw.toFixed(2)} MW`, l: 'Peak reduced' },
        ]
    : null;
  return (
    <div className="card pad stack gap10" aria-live="polite">
      <div className="card-head">
        <span className="ic-tile ok">
          <Icon name="chart" size={18} />
        </span>
        <h2 className="h2" style={{ fontSize: 15 }}>
          {sent ? (sent.isTest ? 'Test send · live' : 'This campaign · live') : 'Last campaign on this feeder'}
        </h2>
        <span className={`pill ${sent ? 'ok' : 'grey'}`}>{sent ? 'Live' : 'Sample'}</span>
      </div>
      <div className="statgrid">
        {(liveStats ?? sampleStats).map((s) => (
          <div key={s.l} className="stat">
            <strong>{s.v}</strong>
            <span>{s.l}</span>
          </div>
        ))}
      </div>
      {sent && sent.type === 'ENROLL_OFFER' && sent.stats.declined > 0 && <span className="small muted">{sent.stats.declined} declined</span>}
      {sent && sent.type === 'STOP_CHARGING' && sent.stats.optedOut > 0 && <span className="small muted">{sent.stats.optedOut} opted out of this event</span>}
    </div>
  );
}

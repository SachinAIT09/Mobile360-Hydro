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
  type CampaignCreateRequest,
  type CampaignExclusions,
  type CampaignSegment,
  type CampaignType,
  type DrEventStatus,
  type VariantId,
} from '@demo/shared';
import { MOBILE_WEB_URL, useApi, useLoad, useSocketEvent } from '../lib/client';
import { upcomingWindow } from '../lib/window';
import { MAX_FEEDERS, fmtSendAt, fromLocalInput, parseDraftParams, quickTimes, sendAtError, toLocalInput } from '../lib/campaignDraft';
import { abVerdict, isAb, variantRows } from '../lib/abStats';
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

interface Copy {
  title: string;
  body: string;
  cta: string;
}

export function CampaignNewPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // The page remounts when the query changes (CampaignKeyed), so the draft is read once.
  const draft = useMemo(() => parseDraftParams(params), [params]);
  const qFeeder = draft.feeders.length === 1 ? draft.feeders[0] : draft.feeder;
  const qLive = draft.liveEventId;

  const initialType: CampaignType = draft.type ?? 'ENROLL_OFFER';
  const d0 = DEFAULTS[initialType];
  const initialA: Copy = { title: draft.copyA.title ?? d0.title, body: draft.copyA.body ?? d0.body, cta: draft.copyA.cta ?? d0.cta };
  const [type, setType] = useState<CampaignType>(initialType);
  const [segment, setSegment] = useState<CampaignSegment>(draft.segment ?? d0.segment);
  /** Either a feeder code or `live:<liveEventId>`. */
  const [audienceKey, setAudienceKey] = useState<string>(qLive ? `live:${qLive}` : qFeeder || 'SUB-01-F1');
  /** Multi-feeder audience (chips); null while a single feeder / live event is selected. */
  const [multi, setMulti] = useState<string[] | null>(draft.feeders.length >= 2 ? draft.feeders : null);
  const [exclusions, setExclusions] = useState<CampaignExclusions>({ optedOut: true, contactedLast7Days: true, lifeSupport: true });
  const [copies, setCopies] = useState<Record<VariantId, Copy>>({
    A: initialA,
    B: { title: draft.copyB?.title ?? initialA.title, body: draft.copyB?.body ?? initialA.body, cta: draft.copyB?.cta ?? initialA.cta },
  });
  const [abOn, setAbOn] = useState(draft.copyB !== null);
  const [variant, setVariant] = useState<VariantId>('A');
  const [channels, setChannels] = useState<CampaignChannels>({ push: true, inApp: true, sms: d0.sms, email: false });
  const [expiresInHours, setExpiresInHours] = useState(d0.expiresInHours);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [sendAt, setSendAt] = useState<Date | null>(null);

  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [sending, setSending] = useState<'test' | 'all' | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [sent, setSent] = useState<Campaign | null>(null);
  const [drStatus, setDrStatus] = useState<DrEventStatus | null>(null);
  const [drBusy, setDrBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<'title' | 'body'>('body');

  const feeders = useLoad((a) => a.substationFeeders('SUB-01'));
  const live = useLoad((a) => a.liveEvents());
  const demo = useLoad((a) => a.demoState());

  const active = abOn ? variant : 'A';
  const copy = copies[active];
  const setCopy = (patch: Partial<Copy>) => setCopies((c) => ({ ...c, [active]: { ...c[active], ...patch } }));

  const liveEvent = qLive ? live.data?.find((e) => e.id === qLive) : undefined;
  const audience: CampaignAudience =
    multi && multi.length >= 2
      ? { kind: 'FEEDERS', feederCodes: multi, segment }
      : audienceKey.startsWith('live:')
        ? { kind: 'LIVE_EVENT', liveEventId: audienceKey.slice(5), segment }
        : { kind: 'FEEDER', feederCode: audienceKey, segment };
  const feederCode =
    audience.kind === 'FEEDER' ? audience.feederCode : audience.kind === 'FEEDERS' ? audience.feederCodes[0] : liveEvent?.substationCode ?? 'SUB-01';
  const feederStat = feeders.data?.find((f) => f.code === feederCode);

  const feederOptions = useMemo(() => {
    const list = (feeders.data ?? []).map((f) => ({ value: f.code, label: `${f.code} (${f.evs} EVs)` }));
    for (const extra of [qFeeder, ...draft.feeders]) {
      if (extra && !list.some((o) => o.value === extra)) {
        list.push({ value: extra, label: feeders.data ? `${extra} (sample, no premise data)` : extra });
      }
    }
    if (list.length === 0) list.push({ value: 'SUB-01-F1', label: 'SUB-01-F1' });
    return list;
  }, [feeders.data, qFeeder, draft.feeders]);

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
  useSocketEvent('campaign:statusChanged', (c) => {
    if (!sent || c.id !== sent.id) return;
    setSent(c);
    if (c.drEventId && !drStatus) setDrStatus('SCHEDULED');
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
    const fresh = { title: d.title, body: d.body, cta: d.cta };
    setCopies({ A: fresh, B: { ...fresh } });
    setChannels((c) => ({ ...c, sms: d.sms }));
    setExpiresInHours(d.expiresInHours);
    setSent(null);
    setDrStatus(null);
    setSendErr(null);
  }

  function insertMerge(field: string) {
    const which = lastFocus.current;
    const target = which === 'title' ? titleRef.current : bodyRef.current;
    const value = copy[which];
    const start = target?.selectionStart ?? value.length;
    const end = target?.selectionEnd ?? value.length;
    setCopy({ [which]: value.slice(0, start) + field + value.slice(end) });
    window.requestAnimationFrame(() => {
      if (!target) return;
      target.focus();
      const pos = start + field.length;
      target.setSelectionRange(pos, pos);
    });
  }

  // ---- multi-feeder chips
  const singleFeeder = audience.kind === 'FEEDER' ? audience.feederCode : null;
  const unusedFeeders = feederOptions.filter((o) => !(multi ?? [singleFeeder]).includes(o.value));
  function addFeeder(code?: string) {
    const next = code ?? unusedFeeders[0]?.value;
    if (!next) return;
    setMulti((m) => {
      const base = m ?? (singleFeeder ? [singleFeeder] : []);
      return base.includes(next) || base.length >= MAX_FEEDERS ? base : [...base, next];
    });
  }
  function removeFeeder(code: string) {
    const rest = (multi ?? []).filter((c) => c !== code);
    if (rest.length <= 1) {
      setMulti(null);
      if (rest[0]) setAudienceKey(rest[0]);
    } else {
      setMulti(rest);
    }
  }

  // ---- schedule
  function pickWhen(w: 'now' | 'later') {
    setWhen(w);
    if (w === 'later' && !sendAt) setSendAt(quickTimes()[0].at);
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
    const scheduling = !test && when === 'later';
    if (scheduling) {
      const err = sendAtError(sendAt);
      if (err) {
        setSendErr(err);
        return;
      }
    }
    const variants: CampaignCreateRequest['variants'] = abOn ? [{ id: 'A', ...copies.A }, { id: 'B', ...copies.B }] : undefined;
    setSending(test ? 'test' : 'all');
    try {
      const c = await api.createCampaign({
        type,
        audience,
        exclusions,
        title: copies.A.title,
        body: copies.A.body,
        cta: copies.A.cta,
        channels,
        schedule: scheduling && sendAt ? { sendNow: false, sendAt: sendAt.toISOString(), expiresInHours } : { sendNow: true, expiresInHours },
        variants,
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

  async function cancelScheduled() {
    if (!sent) return;
    setCancelBusy(true);
    try {
      setSent(await api.cancelCampaign(sent.id));
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : 'Could not cancel');
    } finally {
      setCancelBusy(false);
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
      : audience.kind === 'FEEDERS'
        ? audience.feederCodes.join(', ')
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
  const scheduled = sent?.status === 'SCHEDULED' || sent?.status === 'SENDING';
  const stepTitle = !sent ? 'Compose' : sent.status === 'SCHEDULED' ? 'Scheduled' : sent.status === 'CANCELLED' ? 'Cancelled' : 'Sent';
  const presets = when === 'later' ? quickTimes() : [];
  const primaryLabel =
    sending === 'all'
      ? when === 'later'
        ? 'Scheduling…'
        : 'Sending…'
      : when === 'later'
        ? `Schedule for ${sendAt ? fmtSendAt(sendAt) : '…'}`
        : `Send to ${count === null ? '…' : fmtInt(count)} customers`;

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

      {draft.fromAssistant && (
        <div className="notice info row center gap8" role="note">
          <Icon name="sparkle" size={16} />
          Copy drafted by the scripted assistant. Review before sending.
        </div>
      )}

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
          <StepBar step={sent ? 3 : 2} title={stepTitle} />
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
              {multi ? (
                <div className="field" role="group" aria-label="Feeders">
                  <span className="lbl">FEEDERS ({multi.length})</span>
                  <div className="row gap6" style={{ flexWrap: 'wrap' }}>
                    {multi.map((code) => (
                      <button
                        key={code}
                        type="button"
                        className="chip row center gap6"
                        style={{ minHeight: 44 }}
                        aria-label={`Remove ${code}`}
                        title={`Remove ${code}`}
                        onClick={() => removeFeeder(code)}
                      >
                        {code}
                        <span aria-hidden="true">×</span>
                      </button>
                    ))}
                  </div>
                  {multi.length < MAX_FEEDERS && unusedFeeders.length > 0 && (
                    <select className="fld" aria-label="Add another feeder" value="" onChange={(e) => e.target.value && addFeeder(e.target.value)}>
                      <option value="">+ Add feeder…</option>
                      {unusedFeeders.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="field">
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
                  {audience.kind === 'FEEDER' && unusedFeeders.length > 0 && (
                    <button type="button" className="btn outline sm" style={{ alignSelf: 'flex-start', minHeight: 44 }} onClick={() => addFeeder()}>
                      + Add feeder
                    </button>
                  )}
                </div>
              )}
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
              <label className="chk" style={{ marginLeft: 'auto' }}>
                <input
                  type="checkbox"
                  checked={abOn}
                  onChange={(e) => {
                    setAbOn(e.target.checked);
                    setVariant('A');
                  }}
                />
                A/B test
              </label>
            </div>
            {abOn && (
              <>
                <div className="tabs" role="tablist" aria-label="Message variant">
                  {(['A', 'B'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={v === variant}
                      className={`tab ${v === variant ? 'on' : ''}`}
                      style={{ minWidth: 0, flex: '1 1 160px' }}
                      onClick={() => setVariant(v)}
                    >
                      <span className="tl">Variant {v}</span>
                      <span className="ts">{v === 'A' ? 'Demo customers always get A' : 'About half of the other customers'}</span>
                    </button>
                  ))}
                </div>
                <p className="small muted">Recipients are split about 50/50. Results per variant update live; a leader is called after 20+ sends each and a 3-point lead.</p>
              </>
            )}
            <label className="field">
              <span className="lbl">TITLE{abOn ? ` · VARIANT ${active}` : ''}</span>
              <input
                ref={titleRef}
                className="fld"
                type="text"
                value={copy.title}
                onFocus={() => (lastFocus.current = 'title')}
                onChange={(e) => setCopy({ title: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="lbl">BODY{abOn ? ` · VARIANT ${active}` : ''}</span>
              <textarea ref={bodyRef} className="fld" value={copy.body} onFocus={() => (lastFocus.current = 'body')} onChange={(e) => setCopy({ body: e.target.value })} />
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
              <span className="lbl">BUTTON{abOn ? ` · VARIANT ${active}` : ''}</span>
              <input className="fld" type="text" value={copy.cta} onChange={(e) => setCopy({ cta: e.target.value })} />
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
                <input type="radio" name="when" checked={when === 'now'} onChange={() => pickWhen('now')} />
                {type === 'STOP_CHARGING' ? `Send now (event ${fmtWindow(win.start, win.end)})` : 'Send now'}
              </label>
              <label className="chk">
                <input type="radio" name="when" checked={when === 'later'} onChange={() => pickWhen('later')} />
                Schedule for later
              </label>
              {when === 'later' && (
                <div className="stack gap8" style={{ paddingLeft: 28 }}>
                  <div className="row gap6" style={{ flexWrap: 'wrap' }} role="group" aria-label="Quick send times">
                    {presets.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        className="chip"
                        style={{ minHeight: 44, fontFamily: 'inherit' }}
                        aria-pressed={!!sendAt && Math.abs(sendAt.getTime() - p.at.getTime()) < 60_000}
                        onClick={() => setSendAt(p.at)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    <span className="lbl">SEND AT ({type === 'STOP_CHARGING' ? 'event window is set when it sends' : 'within 24 hours'})</span>
                    <input
                      className="fld"
                      type="datetime-local"
                      value={sendAt ? toLocalInput(sendAt) : ''}
                      onChange={(e) => setSendAt(fromLocalInput(e.target.value))}
                    />
                  </label>
                  <p className="small muted">The audience is counted again when it sends.</p>
                </div>
              )}
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
            <div className={`notice ${sent.status === 'CANCELLED' ? 'info' : 'ok'}`} role="status">
              {sent.status === 'SCHEDULED' || sent.status === 'SENDING'
                ? `Scheduled · sends at ${fmtSendAt(new Date(sent.scheduledFor ?? sent.sentAt))} (${sent.audienceLabel}).`
                : sent.status === 'CANCELLED'
                  ? 'Scheduled send cancelled. Nothing was sent.'
                  : sent.isTest
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
            <button
              type="button"
              className="btn pri lg"
              disabled={sending !== null || (when === 'now' ? !count : !sendAt)}
              onClick={() => void send(false)}
            >
              <Icon name={when === 'later' ? 'clock' : 'send'} size={16} />
              {primaryLabel}
            </button>
          </div>
        </div>

        <div className="stack gap14" style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div className="card pad stack gap12" style={{ alignItems: 'center' }}>
            <div className="card-head" style={{ alignSelf: 'stretch' }}>
              <span className="ic-tile accent">
                <Icon name="phone" size={18} />
              </span>
              <h2 className="h2">Preview on phone{abOn ? ` · Variant ${active}` : ''}</h2>
            </div>
            <div className="phone" aria-label={`Push notification preview${abOn ? `, variant ${active}` : ''}`}>
              <div className="push">
                <span className="row between muted" style={{ fontSize: 11 }}>
                  <span>{BRAND.utilityName.toUpperCase()}</span>
                  <span>now</span>
                </span>
                <strong>{resolve(copy.title) || 'Title'}</strong>
                <span>{truncate(resolve(copy.body), 110) || 'Message body'}</span>
              </div>
            </div>
            {inAppRoute ? (
              <a className="btn sec sm" href={`${MOBILE_WEB_URL}${inAppRoute}`} target="_blank" rel="noreferrer">
                <Icon name="open" size={16} />
                Open in-app screen
              </a>
            ) : (
              <span className="small muted">
                {sent && sent.status === 'SENT' ? 'The demo customer is not in this audience.' : 'In-app screen opens here after you send.'}
              </span>
            )}
          </div>

          {scheduled && sent ? (
            <div className="card pad stack gap10" aria-live="polite">
              <div className="card-head">
                <span className="ic-tile">
                  <Icon name="clock" size={18} />
                </span>
                <h2 className="h2" style={{ fontSize: 15 }}>
                  {sent.status === 'SENDING' ? 'Sending now…' : `Scheduled · sends at ${fmtSendAt(new Date(sent.scheduledFor ?? sent.sentAt))}`}
                </h2>
                <span className="pill grey">{sent.status === 'SENDING' ? 'Sending' : 'Scheduled'}</span>
              </div>
              <p className="small muted">Results appear here once it goes out. The audience and the event window are worked out at send time.</p>
              <div className="row gap8">
                {sent.status === 'SCHEDULED' && (
                  <button type="button" className="btn outline" disabled={cancelBusy} onClick={() => void cancelScheduled()}>
                    <Icon name="stop" size={16} />
                    Cancel
                  </button>
                )}
                <Link className="btn sec" to={`/campaigns/${sent.id}`}>
                  View campaign
                </Link>
              </div>
            </div>
          ) : (
            <ResultsPanel type={type} sent={sent && sent.status === 'SENT' ? sent : null} />
          )}

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
  const ab = sent && isAb(sent) ? variantRows(sent) : null;
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
      {sent && ab && (
        <div className="stack gap8" aria-label="Results by variant">
          <div className="row between center">
            <strong style={{ fontSize: 14, color: 'var(--navy)' }}>A/B results</strong>
            {sent.winner ? <span className="pill ok">Variant {sent.winner} leading</span> : <span className="pill grey">Too early to call</span>}
          </div>
          <div className="statgrid">
            {ab.map((r) => (
              <div key={r.id} className="stat">
                <span className="row center gap6">
                  <strong style={{ fontSize: 15 }}>Variant {r.id}</strong>
                  {r.leading && <span className="pill ok">Leading</span>}
                </span>
                {r.stages.slice(1).map((s) => (
                  <span key={s.label}>
                    {s.label}: {fmtInt(s.count)}
                  </span>
                ))}
                <span>
                  {r.keyLabel}: <strong style={{ fontSize: 13 }}>{r.keyRate.toFixed(1)}%</strong>
                </span>
              </div>
            ))}
          </div>
          <span className="small muted">{abVerdict(sent)}. Variant B responses are simulated at a slightly different rate (synthetic).</span>
        </div>
      )}
      {sent && !sent.isTest && (
        <Link to={`/campaigns/${sent.id}`} className="linkbtn" style={{ alignSelf: 'flex-start' }}>
          Open campaign details
        </Link>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { fmtTime, fmtWindow, minutesUntil, type DrEventForCustomer, type DrResponse } from '@demo/shared';
import { BackButton, Button, Card, ErrorBox, IconTile, InfoNote, Loading, OptionCard, Overline, Txt, WaveDecor } from '../../../components/ui';
import { Icon } from '../../../components/icons';
import { colors } from '../../../lib/theme';
import { api } from '../../../lib/config';
import { useSession } from '../../../providers/SessionProvider';

/** Amber "grid alert" hero, the DR equivalent of the navy header. */
const ALERT_GRADIENT = { colors: ['#7A3E00', '#B45309'] as [string, string], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };

function fmtMins(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} m` : `${h} h`;
}

export default function StopChargingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { live, refreshSummary, messagesVersion } = useSession();
  const [data, setData] = useState<DrEventForCustomer | null>(null);
  const [pick, setPick] = useState<DrResponse>('PAUSE');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    if (!id) return Promise.resolve();
    return api.drEvent(id).then(
      (d) => {
        setData(d);
        if (d.myResponse) {
          setPick(d.myResponse);
          setSaved(true);
        }
        void refreshSummary();
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Could not load this alert'),
    );
  }, [id, refreshSummary]);

  useEffect(() => {
    void load();
  }, [load, messagesVersion]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  async function confirm() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api.drRespond(id, { response: pick });
      setData(d);
      setSaved(true);
      void refreshSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your response');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <LinearGradient {...ALERT_GRADIENT}>
          <SafeAreaView edges={['top']}>
            <View style={{ padding: 16 }}>
              <BackButton color="#FFFFFF" backHref="/messages" onDark />
            </View>
          </SafeAreaView>
        </LinearGradient>
        {error ? (
          <View style={{ padding: 16 }}>
            <ErrorBox message={error} onRetry={load} />
          </View>
        ) : (
          <Loading />
        )}
      </View>
    );
  }

  const ev = data.event;
  const window = fmtWindow(ev.windowStart, ev.windowEnd);
  const durationMin = Math.round((new Date(ev.windowEnd).getTime() - new Date(ev.windowStart).getTime()) / 60000);
  const startsIn = minutesUntil(ev.windowStart, now);
  const endsIn = minutesUntil(ev.windowEnd, now);
  const evKw = live?.evKw ?? data.currentEvKw;
  const ended = ev.status === 'ENDED';

  const OPTIONS: { key: DrResponse; label: string; msg: string }[] = [
    { key: 'PAUSE', label: `Yes, I’ll pause charging ${window}`, msg: `Thanks! We’ll remind you 5 minutes before and credit ${data.earnText} after the event.` },
    { key: 'REMIND', label: `Remind me at ${fmtTime(new Date(new Date(ev.windowStart).getTime() - 5 * 60000).toISOString())}`, msg: 'We’ll send a reminder 5 minutes before the event starts.' },
    { key: 'OPT_OUT', label: 'I can’t take part today', msg: 'No problem. You’ve opted out of today’s event only.' },
  ];
  const current = OPTIONS.find((o) => o.key === pick);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}>
        <LinearGradient {...ALERT_GRADIENT} style={{ overflow: 'hidden' }}>
          <WaveDecor />
          <SafeAreaView edges={['top']}>
            <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 56, gap: 14 }}>
              <BackButton color="#FFFFFF" backHref="/messages" onDark />
              <View style={{ paddingHorizontal: 4, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="bolt" size={14} color={colors.alertHeaderText} />
                  <Overline color={colors.alertHeaderText}>Grid alert · your local line</Overline>
                </View>
                <Txt size={26} weight="bold" color="#FFFFFF" lh={1.2} accessibilityRole="header">
                  {ev.title}
                </Txt>
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <View style={{ marginTop: -40, paddingHorizontal: 16, gap: 14, flex: 1 }}>
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Tile label={ended ? 'Status' : ev.status === 'ACTIVE' ? 'Ends in' : 'Starts in'} value={ended ? 'Ended' : fmtMins(ev.status === 'ACTIVE' ? endsIn : startsIn)} />
              <Tile label="Duration" value={fmtMins(durationMin)} />
              <Tile label="You earn" value={data.earnText} accent />
            </View>
          </Card>
          <Card padding={14}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile name="car" size={44} bg={colors.evTint} color={colors.ev} round />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt size={14} weight="bold" color={colors.navy}>
                  {evKw > 0.05 ? `Your EV is charging now · ${evKw.toFixed(1)} kW` : 'Your EV is not charging right now'}
                </Txt>
                <Txt size={13} color={colors.textMuted} lh={1.4}>
                  {evKw > 0.05 ? `Pausing until ${fmtTime(ev.windowEnd)} still leaves overnight to finish.` : 'Thanks — keep it paused until the event ends.'}
                </Txt>
              </View>
            </View>
          </Card>
          <Txt size={14} lh={1.5} color={colors.textBody} style={{ paddingHorizontal: 4 }}>
            Demand on your neighbourhood’s line is close to its limit this evening. Pausing helps keep power reliable for everyone nearby.
          </Txt>

          {ended ? (
            <Button label="See your event result" onPress={() => router.push(`/dr-events/${ev.id}/result` as never)} />
          ) : (
            <>
              <Txt size={17} weight="bold" color={colors.navy} style={{ paddingHorizontal: 4 }}>
                Will you take part?
              </Txt>
              <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
                {OPTIONS.map((o) => (
                  <OptionCard
                    key={o.key}
                    on={o.key === pick}
                    onPress={() => {
                      setPick(o.key);
                      setSaved(false);
                    }}
                    label={o.label}
                  />
                ))}
              </View>
              {current ? <InfoNote icon={saved ? 'check' : 'info'} tone={saved ? 'success' : 'info'}>{saved ? `Response sent. ${current.msg}` : current.msg}</InfoNote> : null}
              {error ? <ErrorBox message={error} /> : null}
              <View style={{ marginTop: 'auto', paddingTop: 6 }}>
                <Button label={saved ? 'Update response' : 'Confirm'} onPress={confirm} loading={busy} disabled={saved && data.myResponse === pick} />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <Overline>{label}</Overline>
      <Txt size={20} weight="bold" center color={accent ? colors.primary : colors.navy}>
        {value}
      </Txt>
    </View>
  );
}

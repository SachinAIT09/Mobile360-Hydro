import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { fmtDate, fmtTime, type DrEventResultMe } from '@demo/shared';
import { Button, Card, ErrorBox, Loading, NavyCard, Overline, ScreenHeader, SectionTitle, Txt } from '../../../components/ui';
import { colors } from '../../../lib/theme';
import { api } from '../../../lib/config';
import { useSession } from '../../../providers/SessionProvider';

export default function EventResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { messagesVersion } = useSession();
  const [data, setData] = useState<DrEventResultMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return Promise.resolve();
    return api.drResultMe(id).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Results are not ready yet'),
    );
  }, [id]);

  useEffect(() => {
    void load();
  }, [load, messagesVersion]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title={data ? `Grid event · ${fmtDate(data.event.windowStart, { month: 'short', day: 'numeric' })}` : 'Grid event'} backHref="/messages" />
      </SafeAreaView>
      {!data ? (
        error ? (
          <View style={{ padding: 16, gap: 12 }}>
            <ErrorBox message={error.includes('409') || /not ended|not finished|ended/i.test(error) ? 'This event hasn’t finished yet. Results appear once it ends.' : error} onRetry={load} />
          </View>
        ) : (
          <Loading />
        )
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1, paddingBottom: 32 }}>
          <NavyCard padding={22}>
            <Overline color={colors.headerMuted}>{data.myResponse === 'PAUSE' ? 'Thanks for helping your local grid' : data.myResponse === 'OPT_OUT' ? 'You opted out of this event' : 'This event has ended'}</Overline>
            <Txt size={36} weight="extrabold" color="#FFFFFF" style={{ marginTop: 8 }}>
              {data.earnedText ? `${data.earnedText} earned` : 'No credit this time'}
            </Txt>
            <Txt size={14} color={colors.headerMuted} style={{ marginTop: 4 }}>
              {data.earnedText ? 'Credited to your next bill' : 'There’s always the next one.'}
            </Txt>
          </NavyCard>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Stat label="Energy shifted" value={`${data.kwhShifted.toFixed(1)} kWh`} />
            <Stat label="Peak reduced" value={`${data.peakReducedKw.toFixed(1)} kW`} />
          </View>
          <Card>
            <SectionTitle title="Your home during the event" />
            <View style={{ marginTop: 12, gap: 8 }}>
              <LoadChart data={data} />
            </View>
          </Card>
          <Card>
            <SectionTitle title="Your neighbourhood" />
            <Txt size={14} lh={1.5} color={colors.textBody} style={{ marginTop: 8 }}>
              <Txt size={14} weight="bold" color={colors.navy}>
                {data.feederHouseholdsPaused}
              </Txt>{' '}
              homes on your line paused charging and cut the evening peak by{' '}
              <Txt size={14} weight="bold" color={colors.navy}>
                {data.feederPeakReducedMw.toFixed(2)} MW
              </Txt>
              .
            </Txt>
          </Card>
          <Button label="Done" onPress={() => router.replace('/' as never)} style={{ marginTop: 'auto' }} />
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1 }} padding={16}>
      <Overline>{label}</Overline>
      <Txt size={22} weight="extrabold" color={colors.navy} style={{ marginTop: 6 }}>
        {value}
      </Txt>
    </Card>
  );
}

function LoadChart({ data }: { data: DrEventResultMe }) {
  const series = data.series;
  if (series.length === 0) return null;
  const max = Math.max(1, ...series.map((p) => p.kw));
  const ws = new Date(data.event.windowStart).getTime();
  const we = new Date(data.event.windowEnd).getTime();
  const t0 = new Date(series[0].t).getTime();
  const t1 = new Date(series[series.length - 1].t).getTime();
  const span = Math.max(1, t1 - t0);
  const left = Math.max(0, ((ws - t0) / span) * 100);
  const width = Math.max(0, Math.min(100 - left, ((we - ws) / span) * 100));
  const ticks = [series[0].t, data.event.windowStart, data.event.windowEnd, series[series.length - 1].t];
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 110, borderBottomWidth: 1, borderBottomColor: colors.border }} accessibilityLabel="Home load chart; event window shaded">
        <View style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 0, bottom: 0, backgroundColor: colors.warningBg, borderRadius: 6 }} />
        {series.map((p) => {
          const t = new Date(p.t).getTime();
          const inWindow = t >= ws && t < we;
          return <View key={p.t} style={{ flex: 1, height: `${Math.max(2, (p.kw / max) * 100)}%`, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: inWindow ? colors.primary : colors.headerMuted }} />;
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {ticks.map((t, i) => (
          <Txt key={`${t}-${i}`} size={11} color={colors.textMuted}>
            {fmtTime(t)}
          </Txt>
        ))}
      </View>
    </>
  );
}

import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { fmtDate, fmtTime, type Message } from '@demo/shared';
import { Button, Card, ErrorBox, InfoNote, Loading, NavyCard, Overline, Pill, ScreenHeader, Txt } from '../../components/ui';
import { Icon } from '../../components/icons';
import { colors } from '../../lib/theme';
import { tagColors } from '../../lib/tags';
import { api } from '../../lib/config';
import { useSession } from '../../providers/SessionProvider';

export default function MessageDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refreshSummary, summary } = useSession();
  const [msg, setMsg] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evKwhDay, setEvKwhDay] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .message(id)
      .then((m) => {
        // Stop-charging alerts have their own screen.
        if (m.kind === 'STOP_CHARGING' && m.drEventId) {
          router.replace(`/dr-events/${m.drEventId}` as never);
          return;
        }
        setMsg(m);
        void refreshSummary();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load this message'));
    api
      .energySummary('day')
      .then((s) => setEvKwhDay(s.breakdown.find((b) => b.key === 'ev')?.kWh ?? null))
      .catch(() => setEvKwhDay(null));
  }, [id, refreshSummary]);

  async function decline() {
    if (!msg) return;
    setBusy(true);
    try {
      await api.messageAction(msg.id, { action: 'DECLINED' });
      void refreshSummary();
    } catch {
      // ignore — still leave the screen
    } finally {
      setBusy(false);
      router.replace('/messages' as never);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title="Message" backHref="/messages" />
      </SafeAreaView>
      {!msg ? (
        error ? (
          <View style={{ padding: 16 }}>
            <ErrorBox message={error} />
          </View>
        ) : (
          <Loading />
        )
      ) : msg.kind === 'ENROLL_OFFER' ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1, paddingBottom: 32 }}>
          <NavyCard style={{ minHeight: 176, justifyContent: 'flex-end' }} padding={22}>
            <View accessibilityLabel={`Recommended for you: ${msg.title}`} style={{ gap: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="carCharge" size={26} color="#FFFFFF" />
              </View>
              <Overline color={colors.accent}>Recommended for you</Overline>
              <Txt size={22} weight="bold" color="#FFFFFF" lh={1.25} accessibilityRole="header">
                {msg.title}
              </Txt>
            </View>
          </NavyCard>
          <Card>
            <Txt size={15} lh={1.55} color={colors.textBody}>
              {msg.body}
            </Txt>
          </Card>
          {evKwhDay != null && evKwhDay > 0 ? (
            <Card padding={14}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Txt size={13} color={colors.textMuted}>
                  Your EV charging today
                </Txt>
                <Txt size={14} weight="bold" color={colors.navy}>
                  ~{evKwhDay.toFixed(0)} kWh
                </Txt>
              </View>
            </Card>
          ) : null}
          <View style={{ marginTop: 'auto', gap: 10 }}>
            {summary?.evStatus === 'ENROLLED' || msg.action === 'ENROLLED' ? (
              <View accessibilityLiveRegion="polite" accessibilityRole="text">
                <InfoNote icon="check" tone="success">
                  You’re enrolled. Thanks for joining!
                </InfoNote>
              </View>
            ) : (
              <>
                <Button
                  label={msg.cta || 'Enroll in 1 minute'}
                  variant="ev"
                  onPress={() => router.push({ pathname: '/program', params: { messageId: msg.id, source: 'CAMPAIGN' } } as never)}
                />
                <Button label="Not interested" variant="secondary" onPress={decline} loading={busy} />
              </>
            )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
          <Card>
            <Pill label={msg.tag} color={tagColors(msg.tag).fg} bg={tagColors(msg.tag).bg} />
            <Txt size={20} weight="bold" lh={1.3} color={colors.navy} style={{ marginTop: 10 }} accessibilityRole="header">
              {msg.title}
            </Txt>
            <Txt size={12} color={colors.textMuted} style={{ marginTop: 4 }}>
              {fmtDate(msg.createdAt)} · {fmtTime(msg.createdAt)}
            </Txt>
            <Txt size={15} lh={1.55} color={colors.textBody} style={{ marginTop: 12 }}>
              {msg.body}
            </Txt>
          </Card>
          {msg.kind === 'EV_DETECTED' && summary?.evStatus !== 'ENROLLED' ? (
            <Button label="See program & enroll" variant="ev" onPress={() => router.push({ pathname: '/program', params: { messageId: msg.id, source: 'APP_POPUP' } } as never)} />
          ) : null}
          {msg.kind === 'BILL' ? <Button label="View bill" href="/bill" /> : null}
          {msg.kind === 'OUTAGE' ? <Button label="Outages" href="/outage" variant="secondary" /> : null}
        </ScrollView>
      )}
    </View>
  );
}

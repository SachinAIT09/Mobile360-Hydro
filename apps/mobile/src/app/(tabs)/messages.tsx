import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { fmtRelative, type Message, type MessageCategory } from '@demo/shared';
import { Chip, EmptyState, ErrorBox, IconTile, Loading, Pill, ScreenHeader, Txt } from '../../components/ui';
import { type IconName } from '../../components/icons';
import { colors, shadowCard } from '../../lib/theme';
import { api } from '../../lib/config';
import { useSession } from '../../providers/SessionProvider';
import { tagColors } from '../../lib/tags';

type Filter = 'All' | MessageCategory;
const FILTERS: Filter[] = ['All', 'Alerts', 'Offers', 'Billing'];

function iconFor(m: Message): IconName {
  switch (m.kind) {
    case 'EV_DETECTED':
    case 'ENROLL_OFFER':
    case 'CHARGING':
      return 'carCharge';
    case 'STOP_CHARGING':
      return 'bolt';
    case 'BILL':
      return 'bill';
    case 'OUTAGE':
      return 'alert';
    default:
      return 'bell';
  }
}

export default function MessagesScreen() {
  const { messagesVersion, refreshSummary } = useSession();
  const [filter, setFilter] = useState<Filter>('All');
  const [items, setItems] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      api.messages().then(
        (list) => {
          setItems(list);
          setError(null);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : 'Could not load messages'),
      ),
    [],
  );

  useEffect(() => {
    void load();
  }, [load, messagesVersion]);

  const shown = (items ?? []).filter((m) => filter === 'All' || m.category === filter);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title="Messages" backHref="/" />
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: colors.border }}>
          {FILTERS.map((f) => (
            <Chip key={f} label={f} on={f === filter} onPress={() => setFilter(f)} />
          ))}
        </View>
      </SafeAreaView>
      {!items ? (
        error ? (
          <View style={{ padding: 16 }}>
            <ErrorBox message={error} onRetry={load} />
          </View>
        ) : (
          <Loading />
        )
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingVertical: 14, paddingHorizontal: 16, paddingBottom: 40, gap: 10 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await Promise.all([load(), refreshSummary()]);
                setRefreshing(false);
              }}
            />
          }
        >
          {shown.length === 0 ? <EmptyState title="No messages here yet" body="Grid alerts, offers and billing notices will show up here." /> : null}
          {shown.map((m) => {
            const unread = !m.openedAt;
            const tc = tagColors(m.tag);
            return (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityLabel={`${unread ? 'Unread. ' : ''}${m.tag}. ${m.title}`}
                onPress={() => router.push(m.route as never)}
                style={[{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: unread ? colors.primary : 'transparent' }, shadowCard]}
              >
                <IconTile name={iconFor(m)} size={40} bg={tc.bg} color={tc.fg} round />
                <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Pill label={m.tag} color={tc.fg} bg={tc.bg} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {unread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
                      <Txt size={12} color={colors.textMuted}>
                        {fmtRelative(m.createdAt)}
                      </Txt>
                    </View>
                  </View>
                  <Txt size={15} weight={unread ? 'bold' : 'semibold'} lh={1.3} color={colors.navy}>
                    {m.title}
                  </Txt>
                  <Txt size={13} color={colors.textMuted} lh={1.4}>
                    {m.body}
                  </Txt>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

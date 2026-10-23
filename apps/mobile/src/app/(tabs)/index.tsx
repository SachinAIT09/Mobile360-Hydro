import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { DEMO_TZ, fmtDate, fmtMoney, fmtRelative, fmtTime, fmtWindow, PROGRAM, SMART_CHARGING, type Message, type UsageMonth } from '@demo/shared';
import { Avatar, Button, Card, ErrorBox, HeroHeader, IconButton, IconTile, Loading, NavyCard, Overline, ProgressBar, SectionTitle, StatCol, Txt } from '../../components/ui';
import { Icon, type IconName } from '../../components/icons';
import { colors } from '../../lib/theme';
import { api } from '../../lib/config';
import { tagColors } from '../../lib/tags';
import { useSession } from '../../providers/SessionProvider';

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: DEMO_TZ })) % 24;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Days left until the due date and how far through the "pay window" (period end → due date) we are. */
function cycle(periodEnd: string, dueDate: string) {
  const day = 86400000;
  const end = new Date(periodEnd).getTime();
  const due = new Date(dueDate).getTime();
  const now = Date.now();
  const total = Math.max(1, Math.round((due - end) / day));
  const left = Math.max(0, Math.ceil((due - now) / day));
  const elapsed = Math.min(total, Math.max(0, total - left));
  return { total, left, elapsed, progress: elapsed / total };
}

export default function HomeScreen() {
  const { summary, summaryError, refreshSummary, live, messagesVersion } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [usage, setUsage] = useState<UsageMonth[]>([]);
  const [recent, setRecent] = useState<Message[]>([]);

  const loadExtras = useCallback(
    () =>
      Promise.allSettled([api.usageHistory(), api.messages()]).then(([u, m]) => {
        if (u.status === 'fulfilled') setUsage(u.value);
        if (m.status === 'fulfilled') setRecent(m.value.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3));
      }),
    [],
  );

  useEffect(() => {
    if (summary) void loadExtras();
  }, [summary?.customer.id, summary?.bill.status, messagesVersion, loadExtras]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!summary) {
    return summaryError ? (
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <ErrorBox message={summaryError} onRetry={refreshSummary} />
      </View>
    ) : (
      <Loading />
    );
  }

  const { customer, bill, evStatus, activeDrEvent } = summary;
  const smart = summary.smartCharging;
  const r = live ?? summary.live;
  const unpaid = bill.status === 'UNPAID';
  const c = cycle(bill.periodEnd, bill.dueDate);
  const thisMonth = usage.length ? usage[usage.length - 1] : null;
  const avgPrev = usage.length > 1 ? usage.slice(0, -1).reduce((s, u) => s + u.kWh, 0) / (usage.length - 1) : null;
  const trendPct = thisMonth && avgPrev ? Math.round(((thisMonth.kWh - avgPrev) / avgPrev) * 100) : null;
  const eventLive = activeDrEvent && activeDrEvent.status !== 'ENDED';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([refreshSummary(), loadExtras()]);
              setRefreshing(false);
            }}
          />
        }
      >
        <HeroHeader bottomPad={96}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push('/profile' as never)}>
              <Avatar name={`${customer.firstName} ${customer.lastName}`} onDark />
            </Pressable>
            <View style={{ flex: 1, gap: 1 }}>
              <Txt size={13} color={colors.headerMuted}>
                Hey, {greeting()}
              </Txt>
              <Txt size={20} weight="bold" color="#FFFFFF">
                {customer.firstName} {customer.lastName}
              </Txt>
            </View>
            <IconButton name="search" label="Ask the energy assistant" onPress={() => router.push('/assistant' as never)} color="#FFFFFF" bg="rgba(255,255,255,0.14)" />
            <IconButton name="bell" label="Messages" badge={summary.unreadCount} onPress={() => router.push('/messages' as never)} color="#FFFFFF" bg="rgba(255,255,255,0.14)" />
          </View>

          <View style={{ gap: 6, marginTop: 6 }}>
            <Overline color={colors.headerMuted}>This month · kWh used</Overline>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <Txt size={44} weight="extrabold" color="#FFFFFF" lh={1.05} mono={false}>
                {thisMonth ? thisMonth.kWh.toLocaleString('en-CA') : bill.kWh.toLocaleString('en-CA')}
              </Txt>
              {trendPct != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 6 }}>
                  <Icon name={trendPct <= 0 ? 'trendDown' : 'trendUp'} size={16} color={trendPct <= 0 ? '#7EE2B8' : colors.solar} />
                  <Txt size={13} color={colors.headerMuted}>
                    {Math.abs(trendPct)}% {trendPct <= 0 ? 'below' : 'above'} avg
                  </Txt>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <HeaderChip label="Service active" dot="#7EE2B8" />
              <HeaderChip label={unpaid ? `Bill due ${fmtDate(bill.dueDate, { month: 'short', day: 'numeric' })}` : 'Bill paid'} />
            </View>
          </View>
          {usage.length > 1 ? <Sparkline data={usage} /> : null}
        </HeroHeader>

        <View style={{ marginTop: -70, paddingHorizontal: 16, gap: 14 }}>
          {/* Current bill */}
          <Card>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Overline color={colors.primary}>{unpaid ? 'Current bill · Amount due' : 'Last bill · Paid'}</Overline>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Txt size={36} weight="extrabold" color={colors.navy}>
                    {fmtMoney(bill.total).split('.')[0]}
                  </Txt>
                  <Txt size={20} weight="bold" color={colors.navy}>
                    .{fmtMoney(bill.total).split('.')[1]}
                  </Txt>
                </View>
                <Txt size={13} color={unpaid ? colors.textMuted : colors.successText}>
                  {unpaid ? `Due ${fmtDate(bill.dueDate)} · Account ${customer.accountNoMasked}` : `Paid · thank you · Account ${customer.accountNoMasked}`}
                </Txt>
              </View>
              <IconTile name="bolt" size={56} bg={colors.accentTint} color={colors.accentDark} round />
            </View>
            {unpaid ? (
              <View style={{ gap: 6, marginTop: 14 }}>
                <ProgressBar value={c.progress} color={colors.primary} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Txt size={12} color={colors.textMuted}>
                    Pay window · {c.elapsed} of {c.total} days
                  </Txt>
                  <Txt size={12} weight="semibold" color={colors.navy}>
                    {c.left} days left
                  </Txt>
                </View>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              {unpaid ? <Button label="Pay bill" href="/pay" height={48} style={{ flex: 1 }} /> : null}
              <Button label="View bill" href="/bill" variant="secondary" height={48} style={{ flex: 1 }} />
            </View>
            {customer.autoPay.enabled && unpaid ? (
              <Txt size={12} color={colors.textMuted} style={{ marginTop: 10 }}>
                AutoPay on · pays on {fmtDate(bill.dueDate)}
              </Txt>
            ) : null}
          </Card>

          {/* Quick actions */}
          <SectionTitle title="Quick actions" action={{ label: 'View all', href: '/profile' }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }} style={{ marginRight: -16 }}>
            <QuickChip icon="card" label="Pay bill" primary onPress={() => router.push((unpaid ? '/pay' : '/bill') as never)} />
            <QuickChip icon="chart" label="View usage" onPress={() => router.push('/energy' as never)} />
            <QuickChip icon="alert" label="Report outage" onPress={() => router.push('/outage' as never)} />
            <QuickChip icon="bell" label="Messages" onPress={() => router.push('/messages' as never)} />
          </ScrollView>

          {/* EV / DR status: the navy promo card from the Figma home */}
          {eventLive ? (
            <PromoCard
              overline="Grid event"
              title={activeDrEvent.status === 'ACTIVE' ? 'Grid event happening now' : 'Grid event today'}
              body={`Pause EV charging ${fmtWindow(activeDrEvent.windowStart, activeDrEvent.windowEnd)}${activeDrEvent.myResponse === 'PAUSE' ? ' · You’re taking part' : ''}`}
              icon="bolt"
              cta="Open event"
              tone="alert"
              onPress={() => router.push(`/dr-events/${activeDrEvent.id}` as never)}
            />
          ) : null}
          {evStatus === 'DETECTED_NOT_ENROLLED' ? (
            <PromoCard overline="EV detected · Not enrolled" title={`Earn ${PROGRAM.signupIncentive} with ${PROGRAM.name}`} body="We noticed EV charging at your home. Join the program and get rewarded for pausing during grid events." icon="carCharge" cta="See program" onPress={() => router.push('/program' as never)} />
          ) : null}
          {evStatus === 'ENROLLED' && !eventLive ? (
            <PromoCard overline={`Enrolled · ${PROGRAM.name}`} title="Enrolled and ready for grid events" body="We’ll alert you here before any grid event on your local line." icon="carCharge" cta="Open messages" onPress={() => router.push('/messages' as never)} />
          ) : null}

          {/* Right now */}
          <Card>
            <SectionTitle title="Right now" action={{ label: 'See more', href: '/energy' }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Right now, open energy insights" onPress={() => router.push('/energy' as never)} style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              {customer.hasSolar ? <StatCol label="Solar" value={r.solarKw.toFixed(1)} unit="kW" color={colors.solarText} /> : null}
              <StatCol label="From grid" value={r.gridImportKw.toFixed(1)} unit="kW" />
              <StatCol label="EV charging" value={r.evKw.toFixed(1)} unit="kW" color={colors.ev} />
            </Pressable>
            <View style={{ marginTop: 14, gap: 8 }}>
              <InsightRow icon="bolt" title={`${summary.today.usedKwh.toFixed(1)} kWh used today`} body={summary.today.selfConsumptionPct != null ? `${Math.round(summary.today.selfConsumptionPct)}% of your solar was used at home.` : 'Live from your smart meter.'} onPress={() => router.push('/energy' as never)} />
              <InsightRow
                icon="alert"
                title={summary.nearbyOutage ? `Outage nearby · ${summary.nearbyOutage.affectedCount} affected` : 'No outages at your address'}
                body={summary.nearbyOutage ? 'Tap for restoration details or to report.' : 'Report an outage any time from the centre button.'}
                tone={summary.nearbyOutage ? 'warning' : 'success'}
                onPress={() => router.push('/outage' as never)}
              />
              {smart !== null || evStatus !== 'NONE' ? (
                <InsightRow
                  icon="carCharge"
                  title={
                    smart?.enabled
                      ? ['Smart charging on', smart.nextStart ? `next charge ${fmtTime(smart.nextStart)}` : smart.chargingNow ? 'charging now' : null, `saves ${fmtMoney(smart.savingsPerNight)}/night`]
                          .filter(Boolean)
                          .join(' · ')
                      : 'Charge for less overnight'
                  }
                  body={smart?.enabled ? 'Tap to see tonight’s charging plan.' : `${SMART_CHARGING.name} picks the cheapest, cleanest hours for your EV.`}
                  onPress={() => router.push('/smart-charging' as never)}
                />
              ) : null}
            </View>
          </Card>

          {/* Recent activity */}
          <SectionTitle title="Recent activity" action={{ label: 'See all', href: '/messages' }} />
          <Card padding={6}>
            {recent.length === 0 ? (
              <Txt size={13} color={colors.textMuted} style={{ padding: 12 }}>
                No activity yet.
              </Txt>
            ) : (
              recent.map((m, i) => {
                const tc = tagColors(m.tag);
                return (
                  <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`${m.tag}. ${m.title}`} onPress={() => router.push(m.route as never)} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 12, minHeight: 44 }}>
                    <View style={{ alignItems: 'center', width: 12 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tc.fg, marginTop: 4 }} />
                      {i < recent.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: colors.divider, marginTop: 4 }} /> : null}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Overline>{fmtRelative(m.createdAt)}</Overline>
                      <Txt size={15} weight="semibold" color={tc.fg === colors.warningText ? colors.danger : colors.navy}>
                        {m.title}
                      </Txt>
                      <Txt size={13} color={colors.textMuted} lh={1.4} numberOfLines={2}>
                        {m.body}
                      </Txt>
                    </View>
                  </Pressable>
                );
              })
            )}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

function HeaderChip({ label, dot }: { label: string; dot?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} /> : null}
      <Txt size={12} weight="medium" color="#FFFFFF">
        {label}
      </Txt>
    </View>
  );
}

/** Thin area sparkline of monthly usage in the hero header. */
function Sparkline({ data }: { data: UsageMonth[] }) {
  const W = 340;
  const H = 70;
  const max = Math.max(1, ...data.map((d) => d.kWh));
  const min = Math.min(...data.map((d) => d.kWh));
  const pts = data.map((d, i) => ({ x: (i / (data.length - 1)) * W, y: 8 + (1 - (d.kWh - min) / Math.max(1, max - min)) * (H - 16) }));
  const line = pts.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`)).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const last = pts[pts.length - 1];
  return (
    <View accessibilityLabel={`Monthly usage: ${data.map((d) => `${d.month} ${d.kWh} kWh`).join(', ')}`} style={{ marginHorizontal: -20, marginBottom: -20 }}>
      <Svg width="100%" height={H + 24} viewBox={`0 0 ${W} ${H + 24}`} preserveAspectRatio="none">
        <Defs>
          <SvgGradient id="spark" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.35} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </SvgGradient>
        </Defs>
        <Path d={area} fill="url(#spark)" />
        <Path d={line} stroke="#FFFFFF" strokeWidth={2} fill="none" strokeLinejoin="round" />
        <Path d={`M${last.x} ${last.y} m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0`} fill={colors.accent} stroke="#FFFFFF" strokeWidth={1.5} />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: -16 }}>
        {data.map((d) => (
          <Txt key={d.month} size={10} color={colors.headerMuted}>
            {d.month}
          </Txt>
        ))}
      </View>
    </View>
  );
}

function QuickChip({ icon, label, onPress, primary }: { icon: IconName; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: primary ? colors.primary : '#FFFFFF', borderWidth: primary ? 0 : 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 })}>
      <Icon name={icon} size={18} color={primary ? '#FFFFFF' : colors.navy} />
      <Txt size={14} weight="semibold" color={primary ? '#FFFFFF' : colors.navy}>
        {label}
      </Txt>
    </Pressable>
  );
}

function PromoCard({ overline, title, body, icon, cta, onPress, tone }: { overline: string; title: string; body: string; icon: IconName; cta: string; onPress: () => void; tone?: 'alert' }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${body}`} onPress={onPress}>
      <NavyCard>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="sparkle" size={14} color={tone === 'alert' ? colors.solar : colors.accent} />
              <Overline color={tone === 'alert' ? colors.solar : colors.accent}>{overline}</Overline>
            </View>
            <Txt size={20} weight="bold" color="#FFFFFF" lh={1.25}>
              {title}
            </Txt>
            <Txt size={13} color={colors.headerMuted} lh={1.45}>
              {body}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Txt size={14} weight="semibold" color="#FFFFFF">
                {cta}
              </Txt>
              <Icon name="arrowRight" size={16} color="#FFFFFF" />
            </View>
          </View>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={28} color="#FFFFFF" />
          </View>
        </View>
      </NavyCard>
    </Pressable>
  );
}

function InsightRow({ icon, title, body, onPress, tone }: { icon: IconName; title: string; body: string; onPress: () => void; tone?: 'warning' | 'success' }) {
  const c = tone === 'warning' ? { bg: colors.warningBg, fg: colors.warningText } : tone === 'success' ? { bg: colors.successBg, fg: colors.successText } : { bg: colors.accentTint, fg: colors.navy };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${body}`} onPress={onPress} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.surfaceTint, borderRadius: 14, padding: 12, minHeight: 56 }}>
      <IconTile name={icon} size={36} bg={c.bg} color={c.fg} round />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={14} weight="semibold">
          {title}
        </Txt>
        <Txt size={12} color={colors.textMuted} lh={1.4}>
          {body}
        </Txt>
      </View>
      <Icon name="chevronRight" size={18} color={colors.gridLine} />
    </Pressable>
  );
}


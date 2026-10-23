import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { fmtMoney, fmtTime, type EnergyRange, type EnergySummary, type MeSummary } from '@demo/shared';
import { Card, Chip, ErrorBox, HeroHeader, IconTile, Loading, Overline, Pill, SectionTitle, StatCol, Txt } from '../../components/ui';
import { Icon, type IconName } from '../../components/icons';
import { colors } from '../../lib/theme';
import { api } from '../../lib/config';
import { useSession } from '../../providers/SessionProvider';

const RANGES: { key: EnergyRange; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

const BREAKDOWN_COLORS: Record<string, string> = {
  ev: colors.ev,
  heating: colors.accentDark,
  alwaysOn: colors.navy,
  other: colors.headerMuted,
};

export default function EnergyScreen() {
  const { live, summary: me } = useSession();
  const [range, setRange] = useState<EnergyRange>('day');
  const [data, setData] = useState<EnergySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  const load = useCallback(
    () =>
      api.energySummary(range).then(
        (d) => {
          setData(d);
          setError(null);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : 'Could not load energy data'),
      ),
    [range],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Day totals move with the live feed: refresh every 30 s.
  useEffect(() => {
    if (range !== 'day') return;
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [range, load]);

  useEffect(() => {
    const t = setInterval(() => {
      if (live) setSecondsAgo(Math.max(0, Math.round((Date.now() - new Date(live.ts).getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [live]);

  const hasSolar = data?.hasSolar ?? me?.customer.hasSolar ?? true;
  const r = live ?? me?.live ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <HeroHeader bottomPad={64}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt size={20} weight="bold" color="#FFFFFF" accessibilityRole="header">
              Energy insights
            </Txt>
            <Pill label={`● Live · ${secondsAgo} s ago`} color={colors.successText} bg="#DDF5E7" />
          </View>
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8 }}>
            {RANGES.map((x) => (
              <Chip key={x.key} label={x.label} on={x.key === range} onPress={() => setRange(x.key)} onDark />
            ))}
          </View>
          <View style={{ gap: 4 }}>
            <Overline color={colors.headerMuted}>{data?.label ?? ' '} · kWh used</Overline>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
              <Txt size={44} weight="extrabold" color="#FFFFFF" lh={1.05}>
                {data ? data.consumptionKwh.toFixed(1) : '–'}
              </Txt>
              {data ? (
                <Txt size={13} color={colors.headerMuted} style={{ paddingBottom: 8 }}>
                  ≈ {fmtMoney(data.costEstimate)} est.
                </Txt>
              ) : null}
            </View>
          </View>
        </HeroHeader>

        <View style={{ marginTop: -44, paddingHorizontal: 16, gap: 14 }}>
          {error ? <ErrorBox message={error} onRetry={load} /> : null}

          {/* Live flow diagram */}
          <Card>
            <SectionTitle title="Live energy flow" />
            <View style={{ alignItems: 'center', marginTop: 8 }}>{r ? <FlowDiagram solarKw={r.solarKw} gridKw={r.gridImportKw} homeKw={r.homeKw} evKw={r.evKw} hasSolar={hasSolar} /> : <Loading />}</View>
          </Card>

          {me?.smartCharging ? <SmartChargingCard smart={me.smartCharging} /> : null}

          {!data ? (
            <Loading />
          ) : (
            <>
              <Card>
                <SectionTitle title={hasSolar ? 'Solar & grid' : 'Grid'} />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  {hasSolar ? <StatCol label="Self-used" value={data.selfConsumedKwh.toFixed(1)} unit={data.selfConsumptionPct != null ? `kWh · ${Math.round(data.selfConsumptionPct)}%` : 'kWh'} color={colors.solarText} /> : null}
                  {hasSolar ? <StatCol label="Sent to grid" value={data.exportedKwh.toFixed(1)} unit={data.exportedPct != null ? `kWh · ${Math.round(data.exportedPct)}%` : 'kWh'} /> : null}
                  <StatCol label="Bought" value={data.importedKwh.toFixed(1)} unit="kWh" />
                </View>
                {hasSolar && data.selfConsumptionPct != null ? (
                  <View style={{ marginTop: 14, flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.solarTint, borderRadius: 14, padding: 12 }}>
                    <Icon name="sun" size={20} color={colors.solarText} />
                    <Txt size={13} color={colors.solarText} style={{ flex: 1 }} lh={1.4}>
                      You used {Math.round(data.selfConsumptionPct)}% of the {data.productionKwh.toFixed(1)} kWh your panels made at home.
                    </Txt>
                  </View>
                ) : null}
              </Card>

              <Card>
                <SectionTitle title={range === 'day' ? 'Where your energy went today' : 'Where your energy went'} />
                <View style={{ marginTop: 12, gap: 12 }}>
                  <BreakdownBar items={data.breakdown} />
                  {data.breakdown.map((b, i) => (
                    <View key={b.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.divider }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BREAKDOWN_COLORS[b.key] }} />
                      <Txt size={14} weight="medium" style={{ flex: 1 }}>
                        {b.label}
                      </Txt>
                      <Txt size={14} weight="bold" color={colors.navy}>
                        {b.kWh.toFixed(1)} kWh
                      </Txt>
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Txt size={14} weight="bold">
                      Total used
                    </Txt>
                    <Txt size={14} weight="bold" color={colors.navy}>
                      {data.consumptionKwh.toFixed(1)} kWh · {fmtMoney(data.costEstimate)}
                    </Txt>
                  </View>
                </View>
              </Card>

              {hasSolar && data.peakSolarW != null ? (
                <Card padding={14}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.solarTint, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="sun" size={18} color={colors.solarText} />
                    </View>
                    <Txt size={13} color={colors.textMuted} style={{ flex: 1 }}>
                      {range === 'day' ? 'Solar peak today' : 'Solar peak'}
                    </Txt>
                    <Txt size={14} weight="bold" color={colors.navy}>
                      {Math.round(data.peakSolarW).toLocaleString('en-CA')} W{data.peakSolarAt ? ` · ${fmtTime(data.peakSolarAt)}` : ''}
                    </Txt>
                  </View>
                </Card>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function SmartChargingCard({ smart }: { smart: NonNullable<MeSummary['smartCharging']> }) {
  const sub = smart.enabled
    ? [smart.chargingNow ? 'Charging now' : smart.nextStart ? `Next charge ${fmtTime(smart.nextStart)}` : null, `saves ${fmtMoney(smart.savingsPerNight)}/night`].filter(Boolean).join(' · ')
    : 'Charge in cheaper hours';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open smart charging" onPress={() => router.push('/smart-charging' as never)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
          <IconTile name="carCharge" bg={colors.evTint} color={colors.ev} round />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt size={15} weight="semibold">
              Smart charging
            </Txt>
            <Txt size={13} color={colors.textMuted}>
              {sub}
            </Txt>
          </View>
          <Pill label={smart.enabled ? 'On' : 'Off'} color={smart.enabled ? colors.successText : colors.textMuted} bg={smart.enabled ? colors.successBg : colors.divider} style={{ alignSelf: 'center' }} />
        </View>
      </Card>
    </Pressable>
  );
}

function BreakdownBar({ items }: { items: EnergySummary['breakdown'] }) {
  const total = items.reduce((s, x) => s + x.kWh, 0) || 1;
  return (
    <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 3 }} accessibilityLabel="Energy breakdown">
      {items.map((x) => (
        <View key={x.key} style={{ width: `${(x.kWh / total) * 100}%`, backgroundColor: BREAKDOWN_COLORS[x.key], borderRadius: 5 }} />
      ))}
    </View>
  );
}

/** Solar on top, Grid → Home → EV across (same geometry as the wireframe, restyled). */
function FlowDiagram({ solarKw, gridKw, homeKw, evKw, hasSolar }: { solarKw: number; gridKw: number; homeKw: number; evKw: number; hasSolar: boolean }) {
  const top = hasSolar ? 0 : -124;
  return (
    <View style={{ width: 320, height: hasSolar ? 222 : 98, position: 'relative' }} accessibilityLabel={`Live: ${hasSolar ? `solar ${solarKw.toFixed(1)} kW, ` : ''}from grid ${gridKw.toFixed(1)} kW, home total ${homeKw.toFixed(1)} kW, EV charging ${evKw.toFixed(1)} kW`}>
      {hasSolar ? (
        <>
          <Node left={130} top={4} bg={colors.solar} icon="sun" iconColor={colors.onSolar} />
          <View style={{ position: 'absolute', left: 200, top: 14 }}>
            <Txt size={15} weight="bold" color={colors.solarText}>
              {solarKw.toFixed(1)} kW
            </Txt>
            <Txt size={12} color={colors.textMuted}>
              Solar now
            </Txt>
          </View>
          <View style={{ position: 'absolute', left: 159, top: 66, width: 3, height: 58, borderRadius: 2, backgroundColor: colors.solar, opacity: solarKw > 0.05 ? 1 : 0.25 }} />
        </>
      ) : null}
      <Node left={10} top={128 + top} bg={colors.subtle} icon="pylon" iconColor={colors.navy} />
      <View style={{ position: 'absolute', left: 72, top: 157 + top, width: 56, height: 3, borderRadius: 2, backgroundColor: colors.gridLine, opacity: gridKw > 0.05 ? 1 : 0.25 }} />
      <Node left={130} top={128 + top} bg={colors.navy} icon="home" iconColor="#FFFFFF" />
      <View style={{ position: 'absolute', left: 192, top: 157 + top, width: 56, height: 3, borderRadius: 2, backgroundColor: colors.ev, opacity: evKw > 0.05 ? 1 : 0.25 }} />
      <Node left={250} top={128 + top} bg={colors.ev} icon="car" iconColor="#FFFFFF" />
      <NodeLabel left={-10} top={192 + top} value={`${gridKw.toFixed(1)} kW`} label="From grid" />
      <NodeLabel left={110} top={192 + top} value={`${homeKw.toFixed(1)} kW`} label="Home total" />
      <NodeLabel left={230} top={192 + top} value={`${evKw.toFixed(1)} kW`} label="EV charging" />
    </View>
  );
}

function Node({ left, top, bg, icon, iconColor }: { left: number; top: number; bg: string; icon: IconName; iconColor: string }) {
  return (
    <View style={{ position: 'absolute', left, top, width: 60, height: 60, borderRadius: 30, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={26} color={iconColor} />
    </View>
  );
}

function NodeLabel({ left, top, value, label }: { left: number; top: number; value: string; label: string }) {
  return (
    <View style={{ position: 'absolute', left, top, width: 100, alignItems: 'center' }}>
      <Txt size={14} weight="bold" color={colors.navy}>
        {value}
      </Txt>
      <Txt size={12} color={colors.textMuted}>
        {label}
      </Txt>
    </View>
  );
}

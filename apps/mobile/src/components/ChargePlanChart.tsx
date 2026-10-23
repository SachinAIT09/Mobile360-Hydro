import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { DEMO_TZ, fmtTime, type ChargeSlot, type SmartChargingPlan } from '@demo/shared';
import { Txt } from './ui';
import { colors } from '../lib/theme';

/** "11:00 PM" in the utility's timezone, the same format as the rest of the app. */
export function timeLabel(iso: string): string {
  return fmtTime(iso);
}

/** Compact axis tick, e.g. "6 PM". */
function axisLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', timeZone: DEMO_TZ });
}

/** "07:00" (stored ready-by) → "7:00 AM". */
export function readyByLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Cheap periods green, mid amber, on-peak red. */
export function periodColor(period: string): string {
  if (period === 'on-peak') return colors.danger;
  if (period === 'mid-peak') return colors.solar;
  return colors.success;
}

function describe(slots: ChargeSlot[]): string {
  if (!slots.length) return 'Charging plan: no charging planned.';
  return `Charging plan: charges ${slots.map((s) => `${timeLabel(s.start)} to ${timeLabel(s.end)} (${s.period})`).join(', ')}.`;
}

const W = 240;
const H = 96;

/** 24 hourly bars from plug-in, coloured by rate period (height = rate); EV charging overlaid in the EV colour. */
export function ChargePlanChart({ hourly, slots }: { hourly: SmartChargingPlan['hourly']; slots: ChargeSlot[] }) {
  const maxRate = Math.max(...hourly.map((h) => h.rate), 0.01);
  const maxKw = Math.max(...hourly.map((h) => h.kw), 7.2);
  const bw = W / Math.max(1, hourly.length);
  const periods = Array.from(new Set(hourly.map((h) => h.period)));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={describe(slots)} style={{ gap: 8 }}>
      <Svg width="100%" height={120} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {hourly.map((h, i) => {
          const rh = Math.max(4, (h.rate / maxRate) * (H - 6));
          const eh = (h.kw / maxKw) * (H - 6);
          return (
            <React.Fragment key={h.hour}>
              <Rect x={i * bw + 1} y={H - rh} width={bw - 2} height={rh} rx={1.5} fill={periodColor(h.period)} opacity={0.28} />
              {h.kw > 0 ? <Rect x={i * bw + 2.5} y={H - eh} width={bw - 5} height={eh} rx={1.5} fill={colors.ev} /> : null}
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {hourly
          .filter((_, i) => i % 6 === 0)
          .map((h) => (
            <Txt key={h.hour} size={11} color={colors.textMuted}>
              {axisLabel(h.hour)}
            </Txt>
          ))}
        <Txt size={11} color={colors.textMuted}>
          {hourly.length ? axisLabel(new Date(Date.parse(hourly[hourly.length - 1].hour) + 3600000).toISOString()) : ''}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Legend color={colors.ev} label="EV charging" />
        {periods.map((p) => (
          <Legend key={p} color={periodColor(p)} label={p} faded />
        ))}
      </View>
    </View>
  );
}

function Legend({ color, label, faded }: { color: string; label: string; faded?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, opacity: faded ? 0.45 : 1 }} />
      <Txt size={12} color={colors.textBody}>
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </Txt>
    </View>
  );
}

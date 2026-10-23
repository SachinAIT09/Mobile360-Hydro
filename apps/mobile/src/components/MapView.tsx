import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Txt } from './ui';
import { colors } from '../lib/theme';

export interface MapViewProps {
  outage?: { affectedCount: number; status: string; etaLabel?: string } | null;
  homeLabel?: string;
  height?: number;
}

const W = 360;

/** Small deterministic hash so the outage circle lands in the same spot for the same outage. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'CREW_ASSIGNED':
      return 'crew assigned';
    case 'INVESTIGATING':
      return 'investigating';
    case 'RESTORED':
      return 'restored';
    default:
      return status.toLowerCase().replace(/_/g, ' ');
  }
}

/**
 * Schematic neighbourhood map: a soft street grid, the customer's home at the centre and, when there is a
 * known outage nearby, a translucent circle placed deterministically from the outage data. Not a real map;
 * the real product would use the utility's outage map provider (simulated here, like every external system).
 */
export function MapView({ outage, homeLabel = 'Your home', height = 150 }: MapViewProps) {
  const cx = W / 2;
  const cy = height / 2;
  const seed = outage ? hash(`${outage.status}:${outage.affectedCount}`) : 0;
  // Circle sits off-centre but keeps the home within or near its edge.
  const angle = seed * Math.PI * 2;
  const dist = 28 + hash(`${seed}`) * 30;
  const ox = cx + Math.cos(angle) * dist;
  const oy = cy + Math.sin(angle) * dist * 0.6;
  const r = outage ? Math.min(height * 0.42, 34 + Math.log10(Math.max(1, outage.affectedCount)) * 12) : 0;

  const streetsV = [0.14, 0.3, 0.5, 0.68, 0.86].map((f) => f * W);
  const streetsH = [0.2, 0.5, 0.8].map((f) => f * height);

  const label = outage
    ? `Known outage near you affecting ${outage.affectedCount} customers, ${statusLabel(outage.status)}${outage.etaLabel ? `, ${outage.etaLabel}` : ''}. Schematic, not a live map.`
    : `No known outages near ${homeLabel.toLowerCase()}. Schematic, not a live map.`;

  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ height, backgroundColor: colors.bg, overflow: 'hidden' }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid slice">
        <Rect x={0} y={0} width={W} height={height} fill={colors.bg} />
        {/* blocks */}
        {streetsV.slice(0, -1).map((x, i) =>
          streetsH.slice(0, -1).map((y, j) => (
            <Rect key={`b${i}-${j}`} x={x + 6} y={y + 6} width={streetsV[i + 1] - x - 12} height={streetsH[j + 1] - y - 12} rx={4} fill={colors.surface} opacity={0.7} />
          )),
        )}
        {/* streets */}
        {streetsV.map((x) => (
          <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke={colors.border} strokeWidth={3} />
        ))}
        {streetsH.map((y) => (
          <Line key={`h${y}`} x1={0} y1={y} x2={W} y2={y} stroke={colors.border} strokeWidth={3} />
        ))}
        <Line x1={0} y1={cy} x2={W} y2={cy} stroke={colors.borderInput} strokeWidth={5} />
        {/* outage area */}
        {outage ? (
          <>
            <Circle cx={ox} cy={oy} r={r} fill={colors.danger} opacity={0.18} />
            <Circle cx={ox} cy={oy} r={r} fill="none" stroke={colors.danger} strokeWidth={1.5} strokeDasharray="4 3" />
          </>
        ) : null}
        {/* home pin: same stroke style as the icon set */}
        <Circle cx={cx} cy={cy} r={15} fill={colors.primary} />
        <Path
          d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"
          transform={`translate(${cx - 9}, ${cy - 9}) scale(0.75)`}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Txt size={12} color={colors.textMuted} style={{ position: 'absolute', left: 12, top: 10 }}>
        {homeLabel}
      </Txt>
      <Txt size={11} color={colors.textMuted} style={{ position: 'absolute', right: 12, bottom: 8 }}>
        Schematic · not a live map
      </Txt>
    </View>
  );
}

import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import type { AssistantAnswer, AssistantChart, AssistantFact } from '@demo/shared';
import { colors, font } from '../lib/theme';
import { revealParagraphs } from '../lib/typewriter';
import { Button, Card, Overline, Txt } from './ui';

/** Tappable suggestion / follow-up question (pill, ≥44 px). */
export function AskChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 22,
        justifyContent: 'center',
        backgroundColor: pressed ? colors.primaryTint : colors.evTintSoft,
        borderWidth: 1,
        borderColor: colors.evBorder,
      })}
    >
      <Txt size={14} weight="semibold" color={colors.primaryDark}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: colors.primary, borderRadius: 18, borderBottomRightRadius: 6, paddingVertical: 10, paddingHorizontal: 14 }}>
      <Txt size={15} color="#FFFFFF" lh={1.4}>
        {text}
      </Txt>
    </View>
  );
}

export function TypingBubble() {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Assistant is typing"
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 18, borderBottomLeftRadius: 6, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border }}
    >
      <ActivityIndicator size="small" color={colors.primary} />
      <Txt size={13} color={colors.textMuted}>
        Thinking…
      </Txt>
    </View>
  );
}

const TONE: Record<NonNullable<AssistantFact['tone']>, { bg: string; fg: string }> = {
  default: { bg: colors.surfaceTint, fg: colors.navy },
  good: { bg: colors.successBg, fg: colors.successText },
  warn: { bg: colors.warningBg, fg: colors.warningText },
  bad: { bg: colors.dangerBg, fg: colors.dangerText },
};

function Facts({ facts }: { facts: AssistantFact[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {facts.map((f, i) => {
        const t = TONE[f.tone ?? 'default'];
        return (
          <View key={i} accessible accessibilityLabel={`${f.label}: ${f.value}`} style={{ backgroundColor: t.bg, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 11, gap: 2, minWidth: 84 }}>
            <Overline style={{ fontSize: 10 }}>{f.label}</Overline>
            <Txt size={15} weight="bold" color={t.fg}>
              {f.value}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

const W = 300;
const H = 130;

/** Small bar chart (line charts are drawn as bars too on the phone); values labelled when few. */
export function MiniBarChart({ chart }: { chart: AssistantChart }) {
  const pts = chart.points;
  const max = Math.max(0, ...pts.map((p) => p.value));
  const base = H - 20;
  const plotH = base - 16;
  const slot = W / Math.max(pts.length, 1);
  const gap = Math.min(10, slot * 0.25);
  const every = Math.ceil(pts.length / 6);
  const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString('en-CA') : Number.isInteger(v) ? String(v) : v.toFixed(1));
  const summary = pts.map((p) => `${p.label} ${p.value}`).join(', ');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Chart, ${chart.unit}: ${summary}`} style={{ gap: 4 }}>
      <Svg width="100%" style={{ aspectRatio: W / H }} viewBox={`0 0 ${W} ${H}`}>
        <Line x1={0} x2={W} y1={base} y2={base} stroke={colors.border} strokeWidth={1} />
        {pts.map((p, i) => {
          const h = max > 0 ? (Math.max(0, p.value) / max) * plotH : 0;
          const x = i * slot + gap / 2;
          const w = Math.max(1, slot - gap);
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={base - Math.max(h, 1)} width={w} height={Math.max(h, 1)} rx={Math.min(5, w / 3)} fill={p.highlight ? colors.primary : colors.evBorder} />
              {pts.length <= 8 ? (
                <SvgText x={x + w / 2} y={base - h - 4} fontSize={10} fontFamily={font.bold} fill={colors.navy} textAnchor="middle">
                  {fmt(p.value)}
                </SvgText>
              ) : null}
              {i % every === 0 || p.highlight ? (
                <SvgText x={x + w / 2} y={H - 5} fontSize={9} fontFamily={font.regular} fill={colors.textMuted} textAnchor="middle">
                  {p.label.length > 11 ? `${p.label.slice(0, 10)}…` : p.label}
                </SvgText>
              ) : null}
            </React.Fragment>
          );
        })}
      </Svg>
      <Txt size={11} color={colors.textMuted}>
        {chart.unit}
      </Txt>
    </View>
  );
}

/**
 * One assistant answer: the first `shown` words of the text (typewriter), then facts, chart, actions and
 * follow-ups once fully revealed.
 */
export function AnswerCard({ answer, shown, onAsk, onRoute }: { answer: AssistantAnswer; shown: number; onAsk: (q: string) => void; onRoute: (route: string) => void }) {
  const paragraphs = revealParagraphs(answer.text, shown);
  const total = answer.text.reduce((a, p) => a + p.replace(/\*\*/g, '').split(/\s+/).filter(Boolean).length, 0);
  const done = shown >= total;
  return (
    <Card padding={16} style={{ gap: 12, alignSelf: 'stretch', borderBottomLeftRadius: 6 }}>
      {paragraphs.map((segs, i) => (
        <Txt key={i} size={15} lh={1.5} color={colors.textBody}>
          {segs.map((s, j) =>
            s.b ? (
              <Txt key={j} size={15} weight="bold" color={colors.navy}>
                {s.t}
              </Txt>
            ) : (
              s.t
            ),
          )}
        </Txt>
      ))}
      {done ? (
        <>
          {answer.facts.length ? <Facts facts={answer.facts} /> : null}
          {answer.chart ? <MiniBarChart chart={answer.chart} /> : null}
          {answer.actions.map((a, i) =>
            a.kind === 'route' ? <Button key={i} label={a.label} variant={i === 0 ? 'primary' : 'secondary'} height={44} onPress={() => onRoute(a.route)} /> : null,
          )}
          {answer.followUps.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {answer.followUps.map((f) => (
                <AskChip key={f} label={f} onPress={() => onAsk(f)} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

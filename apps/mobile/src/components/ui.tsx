import React from 'react';
import {
  ActivityIndicator,
  Image,
  ImageStyle,
  Pressable,
  StyleSheet,
  Text,
  TextProps,
  View,
  ViewStyle,
  StyleProp,
  TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import { BRAND } from '@demo/shared';
import { colors, font, gradientProps, shadowCard, shadowFloat, Weight } from '../lib/theme';
import { Icon, type IconName } from './icons';

// ---------------------------------------------------------------- text

interface TxtProps extends TextProps {
  size?: number;
  weight?: Weight;
  color?: string;
  mono?: boolean;
  center?: boolean;
  lh?: number;
}

export function Txt({ size = 15, weight = 'regular', color = colors.text, mono, center, lh, style, ...rest }: TxtProps) {
  return (
    <Text
      {...rest}
      style={[
        {
          fontSize: size,
          fontFamily: mono ? font.mono : font[weight],
          color,
          textAlign: center ? 'center' : undefined,
          lineHeight: lh ? Math.round(size * lh) : undefined,
        },
        style,
      ]}
    />
  );
}

/** Small uppercase, letter-spaced label ("CURRENT BILL", "WELCOME BACK"). */
export function Overline({ children, color = colors.textMuted, style, ...rest }: TxtProps) {
  return (
    <Txt size={11} weight="semibold" color={color} style={[{ letterSpacing: 1.2, textTransform: 'uppercase' }, style]} {...rest}>
      {children}
    </Txt>
  );
}

// ---------------------------------------------------------------- buttons

type Variant = 'primary' | 'ev' | 'secondary' | 'ghost' | 'onDark' | 'danger';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  href?: string;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
}

const variantStyle: Record<Variant, { bg: string; fg: string; border?: string; gradient?: boolean }> = {
  primary: { bg: colors.primary, fg: '#FFFFFF', gradient: true },
  ev: { bg: colors.ev, fg: '#FFFFFF', gradient: true },
  secondary: { bg: colors.accentTint, fg: colors.navy },
  ghost: { bg: 'transparent', fg: colors.primary },
  onDark: { bg: 'rgba(255,255,255,0.14)', fg: '#FFFFFF', border: 'rgba(255,255,255,0.35)' },
  danger: { bg: colors.dangerBg, fg: colors.dangerText },
};

/** Pill button. Primary/EV use the brand gradient, secondary is a tinted pill, as in the Figma reference. */
export function Button({ label, onPress, href, variant = 'primary', disabled, loading, height, style, icon, accessibilityLabel }: ButtonProps) {
  const v = variantStyle[variant];
  const h = Math.max(44, height ?? (variant === 'secondary' || variant === 'ghost' ? 48 : 52));
  const content = (
    <>
      {loading ? <ActivityIndicator color={v.fg} /> : icon}
      <Txt size={variant === 'ghost' ? 15 : 16} weight={variant === 'ghost' ? 'medium' : 'semibold'} color={v.fg}>
        {label}
      </Txt>
    </>
  );
  const inner: ViewStyle = { minHeight: h, borderRadius: h / 2, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 20 };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPress={() => {
        if (onPress) onPress();
        else if (href) router.push(href as never);
      }}
      style={({ pressed }) => [
        { borderRadius: h / 2, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        v.gradient && !disabled ? shadowFloat : null,
        v.gradient ? { shadowColor: v.bg } : null,
        style,
      ]}
    >
      {v.gradient ? (
        <LinearGradient {...gradientProps.primary} colors={variant === 'ev' ? [colors.ev, colors.purple] : gradientProps.primary.colors} style={inner}>
          {content}
        </LinearGradient>
      ) : (
        <View style={[inner, { backgroundColor: v.bg, borderWidth: v.border ? 1 : 0, borderColor: v.border }]}>{content}</View>
      )}
    </Pressable>
  );
}

/** Text link (≥44px touch area). */
export function TextLink({ label, onPress, href, size = 14, color = colors.primary, weight = 'semibold', style }: { label: string; onPress?: () => void; href?: string; size?: number; color?: string; weight?: Weight; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => (onPress ? onPress() : href ? router.push(href as never) : undefined)}
      style={[{ minHeight: 44, justifyContent: 'center' }, style]}
      hitSlop={6}
    >
      <Txt size={size} weight={weight} color={color}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Round 44px icon button (header actions). */
export function IconButton({ name, label, onPress, color = colors.navy, bg = colors.accentTint, size = 44, badge, style }: { name: IconName; label: string; onPress: () => void; color?: string; bg?: string; size?: number; badge?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge} unread` : label} onPress={onPress} style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Icon name={name} size={Math.round(size * 0.48)} color={color} />
      {badge ? (
        <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
          <Txt size={10} weight="bold" color="#FFFFFF">
            {badge}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Selectable pill chip (filters, ranges). */
export function Chip({ label, on, onPress, onDark, icon, role = 'tab' }: { label: string; on: boolean; onPress: () => void; onDark?: boolean; icon?: IconName; role?: 'tab' | 'radio' }) {
  const bg = on ? (onDark ? '#FFFFFF' : colors.navy) : onDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF';
  const fg = on ? (onDark ? colors.navy : '#FFFFFF') : onDark ? '#FFFFFF' : colors.textBody;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'tab' ? { selected: on } : { checked: on }}
      onPress={onPress}
      style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', backgroundColor: bg, borderWidth: onDark ? 0 : 1, borderColor: on ? colors.navy : colors.border }}
    >
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Txt size={14} weight={on ? 'semibold' : 'medium'} color={fg}>
        {label}
      </Txt>
    </Pressable>
  );
}

// ---------------------------------------------------------------- layout

export function Card({ children, style, padding = 18 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padding?: number }) {
  return <View style={[{ backgroundColor: '#FFFFFF', borderRadius: 20, padding }, shadowCard, style]}>{children}</View>;
}

/** Navy card used for "current bill", "next bill" and promo blocks. */
export function NavyCard({ children, style, padding = 18 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padding?: number }) {
  return (
    <LinearGradient {...gradientProps.hero} style={[{ borderRadius: 20, padding, overflow: 'hidden' }, style]}>
      <WaveDecor />
      {children}
    </LinearGradient>
  );
}

/** Soft curved lines in the corner of navy surfaces (the Figma headers have a similar wave texture). */
export function WaveDecor({ opacity = 0.1 }: { opacity?: number }) {
  return (
    <View aria-hidden pointerEvents="none" style={{ position: 'absolute', right: -40, top: -30, width: 320, height: 260, opacity }}>
      <Svg width={320} height={260} viewBox="0 0 320 260">
        <Path d="M0 180 C 80 120, 140 220, 220 150 S 320 60, 320 60" stroke="#FFFFFF" strokeWidth={28} fill="none" strokeLinecap="round" />
        <Path d="M-20 240 C 70 190, 150 280, 240 200 S 340 120, 340 120" stroke="#FFFFFF" strokeWidth={18} fill="none" strokeLinecap="round" />
        <Path d="M40 60 C 110 10, 180 90, 260 40 S 330 0, 330 0" stroke="#FFFFFF" strokeWidth={12} fill="none" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/** Navy gradient header with safe-area top padding. Content below can overlap it with a negative margin. */
export function HeroHeader({ children, style, bottomPad = 56 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; bottomPad?: number }) {
  return (
    <LinearGradient {...gradientProps.hero} style={{ overflow: 'hidden' }}>
      <WaveDecor />
      <SafeAreaView edges={['top']}>
        <View style={[{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: bottomPad, gap: 16 }, style]}>{children}</View>
      </SafeAreaView>
    </LinearGradient>
  );
}

export function BrandLogo({ width = 132, onDark = true, style }: { width?: number; onDark?: boolean; style?: StyleProp<ImageStyle> }) {
  // Logo assets are 4:1 (light) and ~5.4:1 (white); keep a 4:1 box and let the image fit.
  return (
    <Image
      accessibilityRole="image"
      accessibilityLabel={`${BRAND.vendorName} logo`}
      source={onDark ? require('../../assets/brand/powerconnect-logo-white.png') : require('../../assets/brand/powerconnect-logo.png')}
      resizeMode="contain"
      style={[{ width, height: width / 4 }, style]}
    />
  );
}

export function BrandMark({ size = 40 }: { size?: number }) {
  return <Image accessibilityRole="image" accessibilityLabel={`${BRAND.vendorName} app icon`} source={require('../../assets/brand/powerconnect-mark-192.png')} resizeMode="contain" style={{ width: size, height: size, borderRadius: size * 0.24 }} />;
}

/** Initials avatar. */
export function Avatar({ name, size = 44, onDark }: { name: string; size?: number; onDark?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
  return (
    <View accessibilityRole="image" accessibilityLabel={`${name} avatar`} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: onDark ? 'rgba(255,255,255,0.18)' : colors.primaryTint, borderWidth: onDark ? 2 : 0, borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
      <Txt size={Math.round(size * 0.36)} weight="bold" color={onDark ? '#FFFFFF' : colors.primary}>
        {initials || '?'}
      </Txt>
    </View>
  );
}

/** Rounded-square icon tile used at the start of list rows and card titles. */
export function IconTile({ name, size = 40, bg = colors.accentTint, color = colors.navy, round }: { name: IconName; size?: number; bg?: string; color?: string; round?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: round ? size / 2 : Math.round(size * 0.3), backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

/** White screen header with a round back button and a bold title, as in "Bills & payments". */
export function ScreenHeader({ title, onBack, backHref, right, onDark }: { title: string; onBack?: () => void; backHref?: string; right?: React.ReactNode; onDark?: boolean }) {
  return (
    <View style={[styles.header, onDark ? { backgroundColor: 'transparent', borderBottomWidth: 0 } : null]}>
      <BackButton onBack={onBack} backHref={backHref} color={onDark ? '#FFFFFF' : colors.navy} onDark={onDark} />
      <Txt size={20} weight="bold" color={onDark ? '#FFFFFF' : colors.navy} style={{ flex: 1 }} accessibilityRole="header">
        {title}
      </Txt>
      {right}
    </View>
  );
}

export function BackButton({ onBack, backHref, color, onDark }: { onBack?: () => void; backHref?: string; color: string; onDark?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => {
        if (onBack) return onBack();
        if (router.canGoBack()) router.back();
        else router.replace((backHref ?? '/') as never);
      }}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: onDark ? 'rgba(255,255,255,0.16)' : colors.accentTint }}
    >
      <Icon name="back" size={20} color={color} strokeWidth={2.2} />
    </Pressable>
  );
}

/** Section heading row with an optional "See all" link. */
export function SectionTitle({ title, action, style }: { title: string; action?: { label: string; onPress?: () => void; href?: string }; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }, style]}>
      <Txt size={17} weight="bold" color={colors.navy} accessibilityRole="header">
        {title}
      </Txt>
      {action ? <TextLink label={action.label} onPress={action.onPress} href={action.href} size={13} style={{ minHeight: 32 }} /> : null}
    </View>
  );
}

/** Settings-style list row: icon tile, title, subline, chevron. */
export function ListRow({ icon, title, sub, onPress, href, danger, right, last, accessibilityLabel }: { icon: IconName; title: string; sub?: string; onPress?: () => void; href?: string; danger?: boolean; right?: React.ReactNode; last?: boolean; accessibilityLabel?: string }) {
  const fg = danger ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (sub ? `${title}. ${sub}` : title)}
      onPress={() => {
        if (onPress) onPress();
        else if (href) router.push(href as never);
      }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16, minHeight: 60, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider, backgroundColor: pressed ? colors.surfaceTint : '#FFFFFF' })}
    >
      <IconTile name={icon} size={36} bg={danger ? colors.dangerBg : colors.accentTint} color={danger ? colors.danger : colors.primary} round />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={15} weight="semibold" color={fg}>
          {title}
        </Txt>
        {sub ? (
          <Txt size={12} color={colors.textMuted}>
            {sub}
          </Txt>
        ) : null}
      </View>
      {right ?? <Icon name="chevronRight" size={18} color={colors.gridLine} />}
    </Pressable>
  );
}

/** Thin progress bar. */
export function ProgressBar({ value, color = colors.primary, track = colors.divider, height = 6 }: { value: number; color?: string; track?: string; height?: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <View style={{ width: `${pct}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

/** Stat column: small label, big value, optional unit. */
export function StatCol({ label, value, unit, color = colors.navy, style }: { label: string; value: string; unit?: string; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 4, flex: 1 }, style]}>
      <Overline>{label}</Overline>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Txt size={22} weight="bold" color={color}>
          {value}
        </Txt>
        {unit ? (
          <Txt size={12} color={colors.textMuted}>
            {unit}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

export function Pill({ label, color, bg, style }: { label: string; color: string; bg: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }, style]}>
      <Txt size={12} weight="semibold" color={color}>
        {label}
      </Txt>
    </View>
  );
}

export function LiveDot({ label = '● Live' }: { label?: string }) {
  return <Pill label={label} color={colors.successText} bg={colors.successBg} />;
}

/** Full-screen loader. `dark` doubles as the splash: brand logo on the navy gradient. */
export function Loading({ dark }: { dark?: boolean }) {
  if (dark) {
    return (
      <LinearGradient {...gradientProps.hero} accessibilityLabel="Loading" accessibilityRole="progressbar" accessibilityState={{ busy: true }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 28 }}>
        <WaveDecor opacity={0.08} />
        <BrandLogo width={200} />
        <ActivityIndicator color="#FFFFFF" />
      </LinearGradient>
    );
  }
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar" accessibilityState={{ busy: true }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

/** Centered "nothing here yet" block for lists and tabs with no data. */
export function EmptyState({ title, body, action, style }: { title: string; body?: string; action?: { label: string; onPress?: () => void; href?: string }; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }, style]}>
      <Txt size={16} weight="semibold" center accessibilityRole="header">
        {title}
      </Txt>
      {body ? (
        <Txt size={14} color={colors.textMuted} center lh={1.45}>
          {body}
        </Txt>
      ) : null}
      {action ? <TextLink label={action.label} onPress={action.onPress} href={action.href} style={{ marginTop: 4 }} /> : null}
    </View>
  );
}

/** Small amber pill shown while the live connection is down. Announces changes politely. */
export function OfflinePill({ status, style }: { status: 'reconnecting' | 'offline'; style?: StyleProp<ViewStyle> }) {
  const label = status === 'reconnecting' ? 'Reconnecting…' : 'Offline';
  return (
    <View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={status === 'reconnecting' ? 'Live updates interrupted, reconnecting' : 'Live updates offline'}
      style={[{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.warningBg, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }, style]}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.solar }} />
      <Txt size={12} weight="semibold" color={colors.warningText}>
        {label}
      </Txt>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ backgroundColor: colors.dangerBg, borderRadius: 14, padding: 14, gap: 6 }}>
      <Txt size={13} color={colors.dangerText}>
        {message}
      </Txt>
      {onRetry ? <TextLink label="Try again" color={colors.dangerText} onPress={onRetry} /> : null}
    </View>
  );
}

/** Tinted info note with an icon (e.g. "Secure checkout"). */
export function InfoNote({ icon = 'info', children, tone = 'info' }: { icon?: IconName; children: React.ReactNode; tone?: 'info' | 'success' | 'warning' | 'ev' }) {
  const t = tone === 'success' ? { bg: colors.successBg, fg: colors.successText } : tone === 'warning' ? { bg: colors.warningBg, fg: colors.warningText } : tone === 'ev' ? { bg: colors.evTintSoft, fg: colors.evDeep } : { bg: colors.accentTint, fg: colors.navy };
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: t.bg, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
      <Icon name={icon} size={18} color={t.fg} />
      <Txt size={13} color={t.fg} lh={1.45} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

/** Radio-style option card. */
export function OptionCard({ on, onPress, label, sub, right, accent = colors.primary }: { on: boolean; onPress: () => void; label: string; sub?: string; right?: React.ReactNode; accent?: string }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 52, borderRadius: 16, backgroundColor: on ? colors.inputTint : '#FFFFFF', borderWidth: 1.5, borderColor: on ? accent : colors.border }}
    >
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: on ? 6 : 2, borderColor: on ? accent : colors.gridLine, backgroundColor: '#FFFFFF' }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={15} weight={on ? 'semibold' : 'medium'}>
          {label}
        </Txt>
        {sub ? (
          <Txt size={12} color={colors.textMuted} lh={1.4}>
            {sub}
          </Txt>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export const textStyles = StyleSheet.create({
  muted13: { fontSize: 13, color: colors.textMuted, fontFamily: font.regular } as TextStyle,
});

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});

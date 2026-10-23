import React from 'react';
import { Pressable, View } from 'react-native';
import type { PaymentMethodKind } from '@demo/shared';
import { Txt } from './ui';
import { colors } from '../lib/theme';

/** Payment methods offered in the demo. No real payment data is stored (Kubra is simulated). */
export const METHODS: { key: PaymentMethodKind; label: string }[] = [
  { key: 'SAVED_CARD', label: '[Saved card •••• 0000]' },
  { key: 'BANK_PAD', label: 'Bank account (pre-authorized debit)' },
  { key: 'WALLET', label: 'Apple Pay / Google Pay' },
];

export function methodLabel(key: PaymentMethodKind | null | undefined): string {
  return METHODS.find((m) => m.key === key)?.label ?? '—';
}

/** White card with a bold title, used to group the radio options on payment screens. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 10 }}>
      <Txt size={15} weight="semibold" style={{ marginBottom: 4 }}>
        {title}
      </Txt>
      {children}
    </View>
  );
}

/** Radio-style option row (≥48px). */
export function Option({ on, onPress, label, right }: { on: boolean; onPress: () => void; label: string; right?: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 48, borderRadius: 12, borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.borderInput, backgroundColor: on ? colors.primarySelectedBg : '#FFFFFF' }}
    >
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: on ? 6 : 2, borderColor: on ? colors.primary : colors.gridLine }} />
      <Txt size={15} style={{ flex: 1 }}>
        {label}
      </Txt>
      {right}
    </Pressable>
  );
}

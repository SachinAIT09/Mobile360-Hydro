import React from 'react';
import { Switch, View } from 'react-native';
import { Txt } from './ui';
import { colors, webSwitchProps } from '../lib/theme';

/** Label + switch row (≥48px) used for notification channel preferences. */
export function ToggleRow({ label, value, onChange, last }: { label: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider }}>
      <Txt size={15}>{label}</Txt>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ false: colors.borderInput, true: colors.primary }} thumbColor={colors.surface} {...webSwitchProps} />
    </View>
  );
}

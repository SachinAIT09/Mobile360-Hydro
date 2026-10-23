import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { colors, font } from '../lib/theme';
import { Icon, type IconName } from './icons';
import { Overline } from './ui';

/**
 * Tinted input in the Figma style: light-blue rounded field with an icon on the left and a small
 * uppercase label above the value, inside the field. The label is also the accessibility label.
 */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  autoComplete,
  multiline,
  icon,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  secure?: boolean;
  autoComplete?: 'email' | 'street-address';
  multiline?: boolean;
  icon?: IconName;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.inputTint, borderRadius: 14, paddingHorizontal: 16, minHeight: multiline ? 92 : 58 }}>
      {icon ? <Icon name={icon} size={20} color={colors.primary} /> : null}
      <View style={{ flex: 1, paddingVertical: 8, gap: 1 }}>
        <Overline color={colors.textMuted} nativeID={`lbl-${label}`}>
          {label}
        </Overline>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9AA7B8"
          secureTextEntry={secure && !show}
          autoCapitalize="none"
          autoComplete={autoComplete}
          multiline={multiline}
          style={{ minHeight: multiline ? 60 : 24, padding: 0, fontSize: 15, fontFamily: font.medium, color: colors.text, backgroundColor: 'transparent' }}
        />
      </View>
      {secure ? (
        <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} onPress={() => setShow((s) => !s)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}>
          <Icon name={show ? 'eyeOff' : 'eye'} size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

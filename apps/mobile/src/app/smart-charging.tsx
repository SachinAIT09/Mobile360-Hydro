import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader, Txt } from '../components/ui';
import { colors } from '../lib/theme';

/** Smart charging settings and tonight's plan (placeholder until the smart-charging workstream lands). */
export default function SmartChargingScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title="Smart charging" backHref="/" />
      </SafeAreaView>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Txt size={15} color={colors.textBody}>
          Coming in this build
        </Txt>
      </ScrollView>
    </View>
  );
}

import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ASSISTANT } from '@demo/shared';
import { ScreenHeader, Txt } from '../components/ui';
import { colors } from '../lib/theme';

/** Energy assistant sheet (placeholder until the assistant workstream lands). */
export default function AssistantScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title={ASSISTANT.customerName} backHref="/" />
      </SafeAreaView>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Txt size={15} color={colors.textBody}>
          Coming in this build
        </Txt>
      </ScrollView>
    </View>
  );
}

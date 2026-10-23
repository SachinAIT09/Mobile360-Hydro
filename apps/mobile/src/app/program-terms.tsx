import React from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BRAND, PROGRAM } from '@demo/shared';
import { ScreenHeader, TextLink, Txt } from '../components/ui';
import { colors } from '../lib/theme';

export default function ProgramTermsScreen() {
  const hasFullTerms = PROGRAM.termsUrl.startsWith('http');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title="Program terms" backHref="/program" />
      </SafeAreaView>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 18, gap: 14 }}>
          <Txt size={15} weight="semibold">
            {PROGRAM.name} · what you agree to
          </Txt>
          <View style={{ gap: 12 }} accessibilityRole="list">
            {PROGRAM.termsSummary.map((t, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.evTint, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size={13} weight="bold" color={colors.evDeep}>
                    {i + 1}
                  </Txt>
                </View>
                <Txt size={14} lh={1.45} color={colors.textBody} style={{ flex: 1 }}>
                  {t}
                </Txt>
              </View>
            ))}
          </View>
          {hasFullTerms ? <TextLink label="Open full terms" onPress={() => void Linking.openURL(PROGRAM.termsUrl)} /> : null}
        </View>
        <Txt size={12} color={colors.textMuted} lh={1.4}>
          Placeholder summary. The full terms will be supplied by {BRAND.utilityName}
          {hasFullTerms ? '.' : ` and linked here (${PROGRAM.termsUrl}).`} Values in [brackets] are stand-ins for the real program figures.
        </Txt>
      </ScrollView>
    </View>
  );
}

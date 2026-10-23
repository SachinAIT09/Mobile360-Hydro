import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { OutageForm } from '../components/OutageForm';
import { ScreenHeader } from '../components/ui';
import { colors } from '../lib/theme';

/** Public route: report an outage without signing in (linked from Login). */
export default function PublicOutageReport() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title="Report an outage" backHref="/login" />
      </SafeAreaView>
      <OutageForm signedInAddress={null} onDone={() => router.replace('/login' as never)} />
    </View>
  );
}

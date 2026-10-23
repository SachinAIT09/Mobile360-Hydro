import React, { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { OutageForm } from '../../components/OutageForm';
import { ScreenHeader } from '../../components/ui';
import { colors } from '../../lib/theme';
import { useSession } from '../../providers/SessionProvider';

export default function OutageTab() {
  const { summary } = useSession();
  const [key, setKey] = useState(0);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title="Report an outage" backHref="/" />
      </SafeAreaView>
      <OutageForm
        key={key}
        signedInAddress={summary?.customer.address ?? ''}
        onDone={() => {
          setKey((k) => k + 1);
          router.navigate('/' as never);
        }}
      />
    </View>
  );
}

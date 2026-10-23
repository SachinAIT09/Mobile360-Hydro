import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '@demo/shared';
import { useSession } from '../providers/SessionProvider';
import { colors, shadowFloat } from '../lib/theme';
import { BrandMark, Txt } from './ui';

/** In-app push-style banner, shown over any screen for incoming messages. */
export function Banner() {
  const { banner, dismissBanner } = useSession();
  const insets = useSafeAreaInsets();
  if (!banner) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 8, zIndex: 100, alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${banner.title}. ${banner.body}`}
        onPress={() => {
          dismissBanner();
          if (banner.route) router.push(banner.route as never);
        }}
        style={[
          {
            width: '94%',
            maxWidth: 456,
            backgroundColor: 'rgba(255,255,255,0.98)',
            borderRadius: 20,
            paddingVertical: 12,
            paddingHorizontal: 14,
            flexDirection: 'row',
            gap: 12,
            borderWidth: 1,
            borderColor: colors.border,
          },
          shadowFloat,
        ]}
      >
        <AppIconPlaceholder />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt size={12} color={colors.textMuted}>
              {BRAND.utilityName.toUpperCase()}
            </Txt>
            <Txt size={12} color={colors.textMuted}>
              now
            </Txt>
          </View>
          <Txt size={13} weight="bold" lh={1.35}>
            {banner.title}
          </Txt>
          <Txt size={13} lh={1.35} numberOfLines={2}>
            {banner.body}
          </Txt>
        </View>
      </Pressable>
    </View>
  );
}

/** App icon shown in push-style cards: the vendor mark until the utility's icon arrives. */
export function AppIconPlaceholder() {
  return <BrandMark size={38} />;
}

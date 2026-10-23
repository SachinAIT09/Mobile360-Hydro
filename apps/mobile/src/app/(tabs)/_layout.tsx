import React from 'react';
import { Pressable, View } from 'react-native';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icon, type IconName } from '../../components/icons';
import { Txt } from '../../components/ui';
import { colors, shadowFloat } from '../../lib/theme';

/** Visible tabs, in bar order. `messages` and `outage` stay routable but are hidden (bell icon / centre button). */
const TAB_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  energy: { label: 'Energy', icon: 'bolt' },
  bill: { label: 'Billing', icon: 'wallet' },
  profile: { label: 'Profile', icon: 'user' },
};

function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const visible = state.routes.filter((r) => TAB_META[r.name]);
  const left = visible.slice(0, 2);
  const right = visible.slice(2);
  const renderTab = (route: (typeof state.routes)[number]) => {
    const meta = TAB_META[route.name];
    const focused = state.routes[state.index]?.key === route.key;
    const color = focused ? colors.primary : colors.textMuted;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        onPress={() => {
          if (!focused) navigateToTab(route.key);
        }}
        style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 4 }}
      >
        <Icon name={meta.icon} color={color} strokeWidth={focused ? 2.1 : 1.7} />
        <Txt size={11} weight={focused ? 'semibold' : 'medium'} color={color}>
          {meta.label}
        </Txt>
      </Pressable>
    );
  };
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: insets.bottom }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', minHeight: 66 }}>
        {left.map(renderTab)}
        <View style={{ width: 72 }} />
        {right.map(renderTab)}
      </View>
      {/* Centre action button, raised above the bar as in the Figma reference. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report an outage"
        onPress={() => router.push('/outage' as never)}
        style={({ pressed }) => [
          { position: 'absolute', left: '50%', marginLeft: -28, top: -26, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#FFFFFF', opacity: pressed ? 0.85 : 1 },
          shadowFloat,
        ]}
      >
        <Icon name="alert" size={24} color="#FFFFFF" strokeWidth={2} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }} tabBar={(p) => <TabBar {...p} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="energy" />
      <Tabs.Screen name="bill" />
      <Tabs.Screen name="profile" />
      {/* Routable (bell icon / centre button) but not in the bar: the custom TabBar only renders TAB_META routes. */}
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="outage" />
    </Tabs>
  );
}

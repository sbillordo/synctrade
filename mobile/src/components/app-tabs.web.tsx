// Web: bottom tabs on narrow screens, a labelled navigation rail on desktop (native tabs are iOS/Android only).
import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { Pressable, type PressableStateCallbackType, StyleSheet, useWindowDimensions, View } from 'react-native';

import { api, getServerUrl } from '@/lib/api';
import { useColors } from '@/lib/theme';

import { Icon, T } from './ui';

const TABS = [
  { name: 'setups', label: 'Setups', icon: 'list' },
  { name: 'scan', label: 'Scan', icon: 'radar' },
  { name: 'saved', label: 'Saved', icon: 'star' },
  { name: 'settings', label: 'Settings', icon: 'tune' },
] as const;

type RailProps = { state: { index: number; routes: { key: string; name: string }[] }; navigation: { navigate: (name: string) => void } };

function Rail({ state, navigation }: RailProps) {
  const c = useColors();
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: api.favorites, enabled: !!getServerUrl() });
  const saved = favorites.data?.length ?? 0;
  return (
    <View style={[styles.rail, { backgroundColor: c.surface, borderRightColor: c.hairline }]}>
      <View style={styles.logo}>
        <Icon sf="chart.line.uptrend.xyaxis" web="show_chart" size={24} color={c.accent} />
        <T kind="headline" style={{ fontWeight: '700' }}>SyncTrade</T>
      </View>
      {TABS.map((t) => {
        const on = state.routes[state.index]?.name === t.name;
        return (
          <Pressable
            key={t.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => navigation.navigate(t.name)}
            style={({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => [styles.item, { backgroundColor: on || hovered ? c.surfaceRaised : 'transparent' }]}>
            <Icon sf={t.icon} web={t.icon} size={20} color={on ? c.ink : c.ink2} />
            <T kind="subhead" color={on ? c.ink : c.ink2} style={{ flex: 1, fontWeight: '500' }}>{t.label}</T>
            {t.name === 'saved' && saved > 0 && (
              <View style={[styles.badge, { backgroundColor: c.accent }]}>
                <T kind="caption" color={c.accentInk} style={{ fontWeight: '700' }}>{saved}</T>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function AppTabs() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  return (
    <Tabs
      tabBar={wide ? (props: any) => <Rail {...props} /> : undefined}
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.ink3,
        tabBarStyle: { backgroundColor: c.ground, borderTopColor: c.hairline },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.label, tabBarIcon: ({ color }) => <Icon sf={t.icon} web={t.icon} size={22} color={String(color)} /> }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  rail: { width: 216, padding: 12, gap: 2, borderRightWidth: StyleSheet.hairlineWidth },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 18 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
});

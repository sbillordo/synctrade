// Web: standard JS bottom tabs (native tabs are iOS/Android only).
import { Tabs } from 'expo-router';

import { useColors } from '@/lib/theme';

import { Icon } from './ui';

const TABS = [
  { name: 'setups', label: 'Setups', icon: 'list' },
  { name: 'scan', label: 'Scan', icon: 'radar' },
  { name: 'saved', label: 'Saved', icon: 'star' },
  { name: 'settings', label: 'Settings', icon: 'tune' },
] as const;

export default function AppTabs() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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

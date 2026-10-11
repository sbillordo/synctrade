import { Stack } from 'expo-router';

import { useColors } from '@/lib/theme';

/** Stack for a top-level tab: compact title (a large title wastes a third of the screen on a phone). */
export function TabStack({ title }: { title: string }) {
  const c = useColors();
  return (
    <Stack screenOptions={{ headerLargeTitle: false, headerShadowVisible: false, headerStyle: { backgroundColor: c.ground }, contentStyle: { backgroundColor: c.ground } }}>
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}

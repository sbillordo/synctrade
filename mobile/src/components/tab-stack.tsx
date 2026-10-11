import { Stack } from 'expo-router';

import { useColors } from '@/lib/theme';

/** Stack for a top-level tab: large title collapsing on scroll, as on iOS. */
export function TabStack({ title }: { title: string }) {
  const c = useColors();
  return (
    <Stack screenOptions={{ headerLargeTitle: true, headerShadowVisible: false, headerStyle: { backgroundColor: c.ground }, contentStyle: { backgroundColor: c.ground } }}>
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}

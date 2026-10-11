import { Stack } from 'expo-router';

import { useColors } from '@/lib/theme';

/** Web: the large-title header is an iOS feature; a plain header avoids react-native-web style arrays on DOM nodes. */
export function TabStack({ title }: { title: string }) {
  const c = useColors();
  return (
    <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: c.ink, contentStyle: { backgroundColor: c.ground } }}>
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}

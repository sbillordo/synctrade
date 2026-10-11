import { Stack } from 'expo-router';

import { useColors } from '@/lib/theme';

export default function SetupsStack() {
  const c = useColors();
  return (
    <Stack screenOptions={{ headerLargeTitle: true, headerShadowVisible: false, headerStyle: { backgroundColor: c.ground }, contentStyle: { backgroundColor: c.ground } }}>
      <Stack.Screen name="index" options={{ title: 'Setups' }} />
    </Stack>
  );
}

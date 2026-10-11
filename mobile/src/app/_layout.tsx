import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import type { SetupsPayload } from '@/lib/notifications';
import { AppStateProvider } from '@/lib/store';
import { useColors } from '@/lib/theme';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });

// Tapping a notification: one setup opens its ticker, several open the list.
function useNotificationRouting() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (data: SetupsPayload | undefined) => {
      if (data?.type !== 'setups') return;
      const [first] = data.items;
      if (data.items.length === 1 && first) router.push({ pathname: '/ticker/[symbol]', params: { symbol: first.ticker, tf: first.tf } });
      else router.navigate('/setups');
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last.notification.request.content.data as SetupsPayload);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data as SetupsPayload));
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  const c = useColors();
  useNotificationRouting();
  const base = c.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.ground, card: c.ground, text: c.ink, border: c.hairline, primary: c.accent } };
  return (
    <QueryClientProvider client={queryClient}>
      <AppStateProvider>
        <ThemeProvider value={theme}>
          <Stack screenOptions={{ contentStyle: { backgroundColor: c.ground } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="ticker/[symbol]" options={{ title: '', headerBackTitle: 'Setups' }} />
            <Stack.Screen
              name="filters"
              options={{ presentation: 'formSheet', title: 'Filters', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true }}
            />
          </Stack>
        </ThemeProvider>
      </AppStateProvider>
    </QueryClientProvider>
  );
}

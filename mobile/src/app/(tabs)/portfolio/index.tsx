import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { SetupRow } from '@/components/setup-row';
import { Empty, Icon, T } from '@/components/ui';
import { api, getServerUrl, type Setup } from '@/lib/api';
import { SORTS } from '@/lib/conditions';
import { useAppState } from '@/lib/store';
import { radius, useColors } from '@/lib/theme';

type Item = { kind: 'setup'; s: Setup } | { kind: 'none'; ticker: string };

export default function SavedScreen() {
  const c = useColors();
  const { setSequence } = useAppState();
  const server = !!getServerUrl();
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: api.favorites, enabled: server });
  const results = useQuery({ queryKey: ['results', 'favorites'], queryFn: () => api.results('all'), enabled: server });
  const favs = favorites.data ?? [];
  const setups = (results.data?.results ?? []).filter((s) => favs.includes(s.ticker)).sort(SORTS.score.fn);
  const items: Item[] = [
    ...setups.map((s) => ({ kind: 'setup' as const, s })),
    ...favs.filter((t) => !setups.some((s) => s.ticker === t)).map((t) => ({ kind: 'none' as const, ticker: t })),
  ];

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => (i.kind === 'setup' ? `${i.s.ticker}-${i.s.tf}` : i.ticker)}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      ListHeaderComponent={<T kind="footnote" color={c.ink2} style={{ paddingBottom: 10 }}>Saved tickers are scanned with every run.</T>}
      ListEmptyComponent={<Empty title="Nothing saved yet" body="Tap the star next to a ticker to follow it here." />}
      refreshControl={<RefreshControl refreshing={results.isRefetching} onRefresh={() => { favorites.refetch(); results.refetch(); }} tintColor={c.ink2} />}
      renderItem={({ item }) =>
        item.kind === 'setup' ? (
          <SetupRow
            s={item.s}
            favorite
            onPress={() => {
              setSequence(setups.map((s) => ({ ticker: s.ticker, tf: s.tf })));
              router.push({ pathname: '/ticker/[symbol]', params: { symbol: item.s.ticker, tf: item.s.tf } });
            }}
          />
        ) : (
          <Pressable
            onPress={() => router.push({ pathname: '/ticker/[symbol]', params: { symbol: item.ticker } })}
            style={({ pressed }) => [styles.none, { backgroundColor: pressed ? c.surfaceRaised : c.surface, borderColor: c.hairline }]}>
            <T kind="headline">{item.ticker}</T>
            <T kind="footnote" color={c.ink2} style={{ flex: 1 }}>No valid impulse right now</T>
            <Icon sf="chevron.right" web="chevron_right" size={13} color={c.ink3} />
          </Pressable>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  none: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, minHeight: 52 },
});

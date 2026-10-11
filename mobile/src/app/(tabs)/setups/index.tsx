import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { SetupRow } from '@/components/setup-row';
import { Button, Chip, Empty, Icon, Segmented, T } from '@/components/ui';
import { api, CONDS, getServerUrl, TIMEFRAMES, type Setup } from '@/lib/api';
import { passes, SORTS, type SortKey } from '@/lib/conditions';
import { pick } from '@/lib/pick';
import { useAppState } from '@/lib/store';
import { useColors } from '@/lib/theme';

const MIN_OPTIONS = [0, 5, 4];
const MIN_LABELS = ['All', '5 of 5', '4+'];

function since(iso?: string | null) {
  if (!iso) return 'not scanned yet';
  return `scanned ${new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })} NY`;
}

export default function SetupsScreen() {
  const c = useColors();
  const { filters, setFilters, universe, setUniverse, setSequence } = useAppState();
  const [query, setQuery] = useState('');
  const server = getServerUrl();
  const results = useQuery({ queryKey: ['results', universe], queryFn: () => api.results(universe), enabled: !!server });
  const status = useQuery({ queryKey: ['status'], queryFn: api.status, enabled: !!server, refetchInterval: 60_000 });
  const universes = useQuery({ queryKey: ['universes'], queryFn: api.universes, enabled: !!server });
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: api.favorites, enabled: !!server });
  const favs = new Set(favorites.data ?? []);

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    return (results.data?.results ?? [])
      .filter((s) => passes(s, filters) && (!q || s.ticker.includes(q)))
      .sort(SORTS[filters.sort].fn);
  }, [results.data, filters, query]);
  const advanced = CONDS.filter((k) => filters.rule[k] !== 'count').length;
  const uList = universes.data ?? [];
  const uLabel = uList.find((u) => u.id === universe)?.label ?? 'Nasdaq-100';

  const open = (s: Setup) => {
    setSequence(rows.map((r) => ({ ticker: r.ticker, tf: r.tf })));
    router.push({ pathname: '/ticker/[symbol]', params: { symbol: s.ticker, tf: s.tf } });
  };
  const sortKeys = Object.keys(SORTS) as SortKey[];

  const header = (
    <View style={styles.header}>
      <View style={styles.meta}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Universe ${uLabel}. Change`}
          onPress={() => pick('Universe', uList.map((u) => `${u.label} · ${u.count}`), uList.findIndex((u) => u.id === universe), (i) => setUniverse(uList[i].id))}
          hitSlop={8}
          style={styles.universe}>
          <T kind="subhead" style={{ fontWeight: '600' }}>{uLabel}</T>
          <Icon sf="chevron.down" web="expand_more" size={12} color={c.ink2} />
        </Pressable>
        <View style={[styles.dot, { backgroundColor: status.data?.market_open ? c.up : c.ink3 }]} />
        <T kind="footnote" color={c.ink2}>{since(status.data?.last_scan?.finished_at)}</T>
      </View>
      <View style={styles.quick}>
        <Segmented
          values={MIN_LABELS}
          index={Math.max(0, MIN_OPTIONS.indexOf(filters.min))}
          onChange={(i) => setFilters({ ...filters, min: MIN_OPTIONS[i] })}
          style={{ flex: 1 }}
        />
        {TIMEFRAMES.map((tf) => (
          <Chip
            key={tf}
            label={tf}
            on={filters.tfs.includes(tf)}
            onPress={() => {
              const has = filters.tfs.includes(tf);
              if (has && filters.tfs.length === 1) return;
              setFilters({ ...filters, tfs: has ? filters.tfs.filter((x) => x !== tf) : [...filters.tfs, tf] });
            }}
          />
        ))}
      </View>
      <View style={styles.count}>
        <T kind="footnote" color={c.ink2}>{rows.length} setup{rows.length === 1 ? '' : 's'}</T>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          onPress={() => pick('Sort by', sortKeys.map((k) => SORTS[k].label), sortKeys.indexOf(filters.sort), (i) => setFilters({ ...filters, sort: sortKeys[i] }))}
          style={styles.universe}>
          <T kind="footnote" color={c.ink2}>Sort: {SORTS[filters.sort].label}</T>
          <Icon sf="arrow.up.arrow.down" web="swap_vert" size={11} color={c.ink2} />
        </Pressable>
      </View>
    </View>
  );

  let empty;
  if (!server) {
    empty = <Empty title="Connect your server" body="Add the address of your SyncTrade server (your Tailscale URL) in Settings." action={<Button label="Open Settings" onPress={() => router.navigate('/settings')} />} />;
  } else if (results.isError) {
    empty = <Empty title="Can’t load setups" body={(results.error as Error).message} action={<Button label="Try again" kind="plain" onPress={() => results.refetch()} />} />;
  } else if (results.isLoading) {
    empty = <Empty title="Loading setups" body="Fetching the last scan from your server." />;
  } else if (!(results.data?.results.length)) {
    empty = <Empty title={`No scan yet for ${uLabel}`} body="Run a scan to see its setups here." action={<Button label="Go to Scan" onPress={() => router.navigate('/scan')} />} />;
  } else {
    empty = <Empty title="No setups match" body="Lower the minimum or stop requiring a condition." action={<Button label="Open filters" kind="plain" onPress={() => router.push('/filters')} />} />;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/filters')} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Filters${advanced ? `, ${advanced} active` : ''}`} style={styles.headerBtn}>
              <Icon sf={advanced ? 'line.3.horizontal.decrease.circle.fill' : 'line.3.horizontal.decrease.circle'} web="filter_list" size={24} color={c.accent} />
            </Pressable>
          ),
          headerSearchBarOptions: { placeholder: 'Ticker', autoCapitalize: 'characters', onChangeText: (e) => setQuery(e.nativeEvent.text) },
        }}
      />
      <FlatList
        data={rows}
        keyExtractor={(s) => `${s.ticker}-${s.tf}`}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => <SetupRow s={item} favorite={favs.has(item.ticker)} rules={filters.rule} onPress={() => open(item)} />}
        refreshControl={<RefreshControl refreshing={results.isRefetching} onRefresh={() => { results.refetch(); status.refetch(); }} tintColor={c.ink2} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  header: { gap: 12, paddingBottom: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  universe: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

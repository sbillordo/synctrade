import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { COMPACT_ID, COMPACT_SCORE, SetupRow } from '@/components/setup-row';
import { TickerDetail } from '@/components/ticker-detail';
import { Button, Chip, Empty, Icon, Segmented, T } from '@/components/ui';
import { api, CONDS, FALLBACK_UNIVERSES, getServerUrl, TIMEFRAMES, type Setup, type TF } from '@/lib/api';
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
  const { width } = useWindowDimensions();
  // desktop web: list and detail side by side (like the approved prototype); everywhere else the detail is its own page
  const wide = Platform.OS === 'web' && width >= 1024;
  const { filters, setFilters, universe, setUniverse, setSequence } = useAppState();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<{ ticker: string; tf: TF } | null>(null);
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
  const uList = universes.data?.length ? universes.data : FALLBACK_UNIVERSES;
  const uLabel = uList.find((u) => u.id === universe)?.label ?? 'Nasdaq-100';

  // the detail pane follows the list: the picked setup while it is visible, otherwise the first one
  const current = wide ? (rows.find((r) => r.ticker === selected?.ticker && r.tf === selected?.tf) ?? rows[0]) : undefined;
  useEffect(() => {
    if (wide) setSequence(rows.map((r) => ({ ticker: r.ticker, tf: r.tf })));
  }, [wide, rows, setSequence]);

  const open = (s: Setup) => {
    setSequence(rows.map((r) => ({ ticker: r.ticker, tf: r.tf })));
    if (wide) return setSelected({ ticker: s.ticker, tf: s.tf });
    router.push({ pathname: '/ticker/[symbol]', params: { symbol: s.ticker, tf: s.tf } });
  };
  const sortKeys = Object.keys(SORTS) as SortKey[];

  const header = (
    <View style={styles.header}>
      {Platform.OS === 'web' && (
        <View style={styles.titleRow}>
          <T kind="largeTitle" style={{ fontSize: 26, letterSpacing: -0.5 }}>Setups</T>
          <View style={styles.titleActions}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Ticker"
              placeholderTextColor={c.ink3}
              autoCapitalize="characters"
              accessibilityLabel="Search ticker"
              style={[styles.search, { backgroundColor: c.surfaceRaised, color: c.ink }]}
            />
            <Pressable onPress={() => router.push('/filters')} accessibilityRole="button" accessibilityLabel={`Filters${advanced ? `, ${advanced} active` : ''}`} style={[styles.roundBtn, { backgroundColor: c.surfaceRaised }]}>
              <Icon sf="line.3.horizontal.decrease.circle" web="filter_list" size={20} color={advanced ? c.accent : c.ink} />
            </Pressable>
          </View>
        </View>
      )}
      <View style={styles.meta}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Universe ${uLabel}. Change`}
          onPress={() => pick('Universe', uList.map((u) => (u.count ? `${u.label} · ${u.count}` : u.label)), uList.findIndex((u) => u.id === universe), (i) => setUniverse(uList[i].id))}
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
          style={wide ? { width: 240 } : { flex: 1, minWidth: 0 }}
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
      {wide && rows.length > 0 && (
        <View style={[styles.cols, { borderBottomColor: c.hairline }]}>
          <T kind="label" color={c.ink2} style={{ width: COMPACT_ID }}>SETUP</T>
          <View style={styles.colsStrip}>{CONDS.map((k) => <T key={k} kind="label" color={c.ink2} style={{ flex: 1 }}>{k.toUpperCase()}</T>)}</View>
          <T kind="label" color={c.ink2} style={{ width: COMPACT_SCORE, textAlign: 'right' }}>SCORE</T>
        </View>
      )}
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

  const list = (
    <>
      <Stack.Screen
        options={{
          headerShown: Platform.OS !== 'web',
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
        ItemSeparatorComponent={wide ? undefined : () => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <SetupRow
            s={item}
            favorite={favs.has(item.ticker)}
            rules={filters.rule}
            compact={wide}
            selected={current?.ticker === item.ticker && current.tf === item.tf}
            onPress={() => open(item)}
          />
        )}
        refreshControl={<RefreshControl refreshing={results.isRefetching} onRefresh={() => { results.refetch(); status.refetch(); }} tintColor={c.ink2} />}
      />
    </>
  );

  if (!wide) return list;
  return (
    <View style={styles.split}>
      <View style={[styles.listPane, { borderRightColor: c.hairline }]}>{list}</View>
      <View style={styles.detailPane}>
        {current ? <TickerDetail key={`${current.ticker}-${current.tf}`} ticker={current.ticker} tfParam={current.tf} embedded onNavigate={setSelected} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  listPane: { width: '44%', minWidth: 540, maxWidth: 680, borderRightWidth: StyleSheet.hairlineWidth },
  detailPane: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { height: 38, width: 130, borderRadius: 19, paddingHorizontal: 14, fontSize: 14 },
  roundBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  cols: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  colsStrip: { flex: 1, flexDirection: 'row', gap: 6 },
  list: { paddingHorizontal: 16, paddingTop: Platform.OS === 'web' ? 14 : 0, paddingBottom: 32 },
  header: { gap: 12, paddingBottom: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  universe: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  count: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { SetupRow } from '@/components/setup-row';
import { TickerDetail } from '@/components/ticker-detail';
import { NamePrompt } from '@/components/name-prompt';
import { TickerSearch } from '@/components/ticker-search';
import { Chip, Empty, Icon, T } from '@/components/ui';
import { api, getServerUrl, type Setup, type TF, type WatchList } from '@/lib/api';
import { confirm } from '@/lib/ask';
import { fmt, pct, SORTS } from '@/lib/conditions';
import { useNames } from '@/lib/names';
import { load, save } from '@/lib/storage';
import { useAppState } from '@/lib/store';
import { radius, useColors } from '@/lib/theme';

type Item = { kind: 'setup'; s: Setup } | { kind: 'none'; ticker: string };
// Saved (the starred tickers) is a fixed list in front of the user's own; the star on a ticker adds to it
const SAVED = -1;
const keyOf = (i: Item) => (i.kind === 'setup' ? `${i.s.ticker}-${i.s.tf}` : i.ticker);
const tickerOf = (i: Item) => (i.kind === 'setup' ? i.s.ticker : i.ticker);

export default function ListsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= 1024;
  const { setSequence } = useAppState();
  const server = !!getServerUrl();
  const [listId, setListId] = useState<number | null>(load('activeList', SAVED));
  const [selected, setSelected] = useState<{ ticker: string; tf?: TF } | null>(null);
  const [prompt, setPrompt] = useState<'new' | 'rename' | null>(null);

  const lists = useQuery({ queryKey: ['lists'], queryFn: api.lists, enabled: server });
  const results = useQuery({ queryKey: ['results', 'favorites'], queryFn: () => api.results('all'), enabled: server });
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: api.favorites, enabled: server });
  const favs = new Set(favorites.data ?? []);

  const all: WatchList[] = [{ id: SAVED, name: 'Saved', tickers: favorites.data ?? [] }, ...(lists.data ?? [])];
  const list: WatchList | undefined = all.find((l) => l.id === listId) ?? all[0];
  const isSaved = list?.id === SAVED;
  const refresh = () => qc.invalidateQueries({ queryKey: [isSaved ? 'favorites' : 'lists'] });
  const choose = (id: number) => { setListId(id); save('activeList', id); setSelected(null); };

  const create = useMutation({ mutationFn: api.createList, onSuccess: (l) => { refresh(); choose(l.id); } });
  const rename = useMutation({ mutationFn: (v: { id: number; name: string }) => api.renameList(v.id, v.name), onSuccess: refresh });
  const remove = useMutation({ mutationFn: api.deleteList, onSuccess: () => { setListId(null); refresh(); } });
  const setTicker = (v: { id: number; symbol: string }, on: boolean) => (v.id === SAVED ? api.setFavorite(v.symbol, on) : api.setListTicker(v.id, v.symbol, on));
  const addTicker = useMutation({ mutationFn: (v: { id: number; symbol: string }) => setTicker(v, true), onSuccess: refresh });
  const dropTicker = useMutation({ mutationFn: (v: { id: number; symbol: string }) => setTicker(v, false), onSuccess: refresh });

  const setups = (results.data?.results ?? []).filter((s) => list?.tickers.includes(s.ticker)).sort(SORTS.score.fn);
  const items: Item[] = [
    ...setups.map((s) => ({ kind: 'setup' as const, s })),
    ...(list?.tickers ?? []).filter((t) => !setups.some((s) => s.ticker === t)).map((t) => ({ kind: 'none' as const, ticker: t })),
  ];

  const names = useNames(list?.tickers ?? []);
  const noSetup = items.filter((i) => i.kind === 'none').map(tickerOf);
  const quotes = useQuery({
    queryKey: ['quotes', noSetup.join(',')],
    queryFn: () => api.quotes(noSetup),
    enabled: server && noSetup.length > 0,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  const current = wide
    ? (items.find((i) => (i.kind === 'setup' ? i.s.ticker === selected?.ticker && i.s.tf === selected?.tf : i.ticker === selected?.ticker && !selected?.tf)) ?? items[0])
    : undefined;
  const currentTicker = current ? tickerOf(current) : null;
  const currentTf = current?.kind === 'setup' ? current.s.tf : undefined;
  const seqKey = setups.map((s) => `${s.ticker}-${s.tf}`).join();
  useEffect(() => {
    if (wide) setSequence(setups.map((s) => ({ ticker: s.ticker, tf: s.tf })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide, seqKey]);

  const open = (i: Item) => {
    if (wide) return setSelected({ ticker: tickerOf(i), tf: i.kind === 'setup' ? i.s.tf : undefined });
    if (i.kind === 'setup') {
      setSequence(setups.map((s) => ({ ticker: s.ticker, tf: s.tf })));
      router.push({ pathname: '/ticker/[symbol]', params: { symbol: i.s.ticker, tf: i.s.tf } });
    } else {
      router.push({ pathname: '/ticker/[symbol]', params: { symbol: i.ticker } });
    }
  };

  const header = (
    <View style={styles.header}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {all.map((l) => <Chip key={l.id} label={`${l.name} · ${l.tickers.length}`} on={l.id === list?.id} onPress={() => choose(l.id)} />)}
        <Pressable
          onPress={() => setPrompt('new')}
          accessibilityRole="button"
          accessibilityLabel="New list"
          style={[styles.roundBtn, { backgroundColor: c.surfaceRaised }]}>
          <Icon sf="plus" web="add" size={18} color={c.ink} />
        </Pressable>
      </ScrollView>
      {list && !isSaved && (
        <View style={styles.tools}>
          <Pressable onPress={() => setPrompt('rename')} accessibilityRole="button" accessibilityLabel="Rename list" style={[styles.roundBtn, { backgroundColor: c.surfaceRaised }]}>
            <Icon sf="pencil" web="edit" size={16} color={c.ink} />
          </Pressable>
          <Pressable onPress={() => confirm(`Delete “${list.name}”?`, 'The tickers stay available; only the list is removed.', 'Delete', () => remove.mutate(list.id))} accessibilityRole="button" accessibilityLabel="Delete list" style={[styles.roundBtn, { backgroundColor: c.surfaceRaised }]}>
            <Icon sf="trash" web="delete" size={16} color={c.down} />
          </Pressable>
        </View>
      )}
      {list && <TickerSearch names={names} existing={list.tickers} onAdd={(symbol) => addTicker.mutate({ id: list.id, symbol })} />}
      {list && <T kind="footnote" color={c.ink2}>Tickers in your lists are scanned with every run.</T>}
    </View>
  );

  const empty = !server
    ? <Empty title="Connect your server" body="Add the address of your SyncTrade server in Settings." />
    : (isSaved ? favorites.isLoading : lists.isLoading)
      ? <Empty title="Loading lists" body="Fetching them from your server." />
      : !list
        ? <Empty title="No lists yet" body="Create a list with the + button and group your tickers the way you need." />
        : isSaved
          ? <Empty title="Nothing saved yet" body="Tap the star next to a ticker, or type one above and press Enter." />
          : <Empty title={`${list.name} is empty`} body="Type a ticker above and press Enter to add it." />;

  const listView = (
    <FlatList
      data={items}
      keyExtractor={keyOf}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.list}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ItemSeparatorComponent={wide ? undefined : () => <View style={{ height: 8 }} />}
      refreshControl={<RefreshControl refreshing={results.isRefetching} onRefresh={() => { lists.refetch(); favorites.refetch(); results.refetch(); }} tintColor={c.ink2} />}
      renderItem={({ item }) => {
        const isCur = !!current && keyOf(current) === keyOf(item);
        return (
          <View style={styles.itemRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {item.kind === 'setup' ? (
                <SetupRow s={item.s} name={names[item.s.ticker]} favorite={favs.has(item.s.ticker)} compact={wide} selected={isCur} onPress={() => open(item)} />
              ) : (
                <Pressable
                  onPress={() => open(item)}
                  style={({ pressed }) => [styles.none, { backgroundColor: pressed || isCur ? c.surfaceRaised : c.surface, borderColor: c.hairline }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T kind="headline">{item.ticker}</T>
                    {names[item.ticker] ? <T kind="caption" color={c.ink3} numberOfLines={1}>{names[item.ticker]}</T> : null}
                  </View>
                  {quotes.data?.[item.ticker] ? (
                    <View style={{ alignItems: 'flex-end' }}>
                      <T kind="subhead" tabular style={{ fontWeight: '600' }}>{fmt(quotes.data[item.ticker].price)}</T>
                      {quotes.data[item.ticker].chg_pct != null && (
                        <T kind="footnote" tabular color={(quotes.data[item.ticker].chg_pct ?? 0) >= 0 ? c.up : c.down}>{pct(quotes.data[item.ticker].chg_pct ?? 0, 2)}</T>
                      )}
                    </View>
                  ) : null}
                  <T kind="caption" color={c.ink3} style={{ width: 70, textAlign: 'right' }}>No setup</T>
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => list && dropTicker.mutate({ id: list.id, symbol: tickerOf(item) })}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${tickerOf(item)} from ${list?.name ?? 'list'}`}
              style={styles.removeBtn}>
              <Icon sf="xmark" web="close" size={16} color={c.ink3} />
            </Pressable>
          </View>
        );
      }}
    />
  );

  const prompts = (
    <NamePrompt
      visible={prompt !== null}
      title={prompt === 'rename' ? 'Rename list' : 'New list'}
      initial={prompt === 'rename' ? list?.name : ''}
      action={prompt === 'rename' ? 'Save' : 'Create'}
      onSubmit={(name) => (prompt === 'rename' && list ? rename.mutate({ id: list.id, name }) : create.mutate(name))}
      onClose={() => setPrompt(null)}
    />
  );
  if (!wide) return <>{listView}{prompts}</>;
  return (
    <View style={styles.split}>
      <View style={[styles.listPane, { borderRightColor: c.hairline }]}>{listView}</View>
      <View style={styles.detailPane}>
        {currentTicker ? <TickerDetail key={`${currentTicker}-${currentTf ?? ''}`} ticker={currentTicker} tfParam={currentTf} embedded onNavigate={setSelected} /> : null}
      </View>
      {prompts}
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  listPane: { width: '44%', minWidth: 540, maxWidth: 680, borderRightWidth: StyleSheet.hairlineWidth },
  detailPane: { flex: 1, minWidth: 0 },
  list: { paddingHorizontal: 16, paddingTop: Platform.OS === 'web' ? 14 : 0, paddingBottom: 32 },
  header: { gap: 12, paddingBottom: 10 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  removeBtn: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  none: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, minHeight: 52 },
});

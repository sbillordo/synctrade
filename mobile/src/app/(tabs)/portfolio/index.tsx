// Portfolio: eToro positions with eToro's own P&L (read-only), price alerts and closed trades. The simulator stays on the ticker page.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AlertRow, PositionCard } from '@/components/position-card';
import { AlertSheet } from '@/components/position-sheets';
import { TickerDetail } from '@/components/ticker-detail';
import { TickerSearch } from '@/components/ticker-search';
import { Empty, Segmented, T } from '@/components/ui';
import { api, getServerUrl, type Portfolio } from '@/lib/api';
import { eur, fmt, money, pct } from '@/lib/conditions';
import { load, save } from '@/lib/storage';
import { radius, useColors } from '@/lib/theme';

const VIEWS = ['Open', 'Alerts', 'Closed'] as const;

export default function PortfolioScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const server = !!getServerUrl();
  const [view, setView] = useState<number>(load('portfolioView', 0));
  const [alertFor, setAlertFor] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  // desktop web: list and ticker side by side, like Setups and Lists; elsewhere the ticker is its own page
  const wide = Platform.OS === 'web' && width >= 1024;
  const [selected, setSelected] = useState<{ ticker: string; position?: number } | null>(null);
  // from an open position the ticker page draws that eToro position on the chart
  const openTicker = (symbol: string, position?: number) => (wide ? setSelected({ ticker: symbol, position })
    : router.push({ pathname: '/ticker/[symbol]', params: position != null ? { symbol, position: String(position) } : { symbol } }));

  const open = useQuery({ queryKey: ['portfolio', 'open'], queryFn: () => api.portfolio(), enabled: server, refetchInterval: 2 * 60_000 });
  const closed = useQuery({ queryKey: ['portfolio', 'closed'], queryFn: () => api.history(), enabled: server && view === 2 });
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: api.alerts, enabled: server, refetchInterval: 2 * 60_000 });
  const active = (alerts.data ?? []).filter((a) => !a.triggered_at);
  const fired = (alerts.data ?? []).filter((a) => a.triggered_at).slice(0, 30);
  const alertTickers = [...new Set([...active.map((a) => a.ticker), ...(alertFor ? [alertFor] : [])])];
  const quotes = useQuery({
    queryKey: ['quotes', alertTickers.join(',')],
    queryFn: () => api.quotes(alertTickers),
    enabled: server && view === 1 && alertTickers.length > 0,
    placeholderData: (prev) => prev,
  });
  const currency = open.data?.currency ?? 'USD';
  // pull to refresh skips the server's short cache and asks eToro again
  const pull = () => (view === 0 ? qc.fetchQuery({ queryKey: ['portfolio', 'open'], queryFn: () => api.portfolio(true), staleTime: 0 })
    : view === 2 ? qc.fetchQuery({ queryKey: ['portfolio', 'closed'], queryFn: () => api.history(true), staleTime: 0 })
    : alerts.refetch()).catch(() => undefined);
  const removeAlert = (id: number) => api.deleteAlert(id).then(() => qc.invalidateQueries({ queryKey: ['alerts'] }));
  const pick = (i: number) => { setView(i); save('portfolioView', i); };

  if (!server) return <Empty title="Connect your server" body="Add the address of your SyncTrade server in Settings." />;

  const loading = [open, alerts, closed][view].isRefetching;
  const firstOpen = open.data?.positions[0];
  const fallback = view === 0 ? (firstOpen && { ticker: firstOpen.ticker, position: firstOpen.id })
    : view === 2 ? (closed.data?.positions[0] && { ticker: closed.data.positions[0].ticker })
    : (active[0] && { ticker: active[0].ticker });
  const current = wide ? (selected ?? fallback ?? null) : null;
  const listView = (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={pull} tintColor={c.ink2} />}>
        <Segmented values={VIEWS.map((v, i) => (i === 0 && open.data?.positions.length ? `${v} · ${open.data.positions.length}` : i === 1 && active.length ? `${v} · ${active.length}` : v))} index={view} onChange={pick} />

        {view === 0 && (
          <>
            {open.data && open.data.positions.length > 0 && <Summary data={open.data} />}
            {open.isLoading ? <Empty title="Loading positions" body="Fetching them from eToro." />
              : open.isError ? <Empty title="Can’t load positions" body={(open.error as Error).message} />
              : !open.data?.positions.length ? <Empty title="No open positions" body="Positions you open in eToro show up here." />
              : open.data.positions.map((p) => (
                <PositionCard key={p.id} p={p} currency={currency} showName selected={current?.position === p.id} onPress={() => openTicker(p.ticker, p.id)} />
              ))}
          </>
        )}

        {view === 1 && (
          <>
            <TickerSearch existing={[]} onAdd={setAlertFor} />
            <T kind="footnote" color={c.ink2}>Checked every 5 min from 9:30 to 16:00 New York. Prices from Yahoo run ~15 min late. eToro runs and notifies your stops and targets itself.</T>
            {alerts.isLoading ? <Empty title="Loading alerts" body="Fetching them from your server." />
              : !active.length && !fired.length ? <Empty title="No price alerts" body="Search a ticker above, or use “Price alert” on a ticker page." />
              : null}
            {active.length > 0 && (
              <Group title="Watching">
                {active.map((a) => <AlertRow key={a.id} a={a} price={quotes.data?.[a.ticker]?.price} onPress={() => openTicker(a.ticker)} onDelete={() => removeAlert(a.id)} />)}
              </Group>
            )}
            {fired.length > 0 && (
              <Group title="Triggered">
                {fired.map((a) => <AlertRow key={a.id} a={a} onPress={() => openTicker(a.ticker)} onDelete={() => removeAlert(a.id)} />)}
              </Group>
            )}
          </>
        )}

        {view === 2 && (
          <>
            {closed.data && closed.data.positions.length > 0 && (
              <View style={[styles.summary, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                <Stat label="Realized" value={money(closed.data.totals.pnl ?? 0, currency)} tone={(closed.data.totals.pnl ?? 0) >= 0 ? c.up : c.down} big />
                <Stat label="Trades" value={`${closed.data.totals.wins} won · ${closed.data.totals.losses} lost`} />
                <T kind="caption" color={c.ink3}>Since {new Date(closed.data.since).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} · from eToro</T>
              </View>
            )}
            {closed.isLoading ? <Empty title="Loading history" body="Fetching closed trades from eToro." />
              : closed.isError ? <Empty title="Can’t load history" body={(closed.error as Error).message} />
              : !closed.data?.positions.length ? <Empty title="No closed trades yet" body="Trades you close in eToro during the last year show up here." />
              : closed.data.positions.map((p) => <PositionCard key={`${p.id}-${p.closed_at}`} p={p} currency={currency} showName selected={current?.ticker === p.ticker && current.position == null} onPress={() => openTicker(p.ticker)} />)}
          </>
        )}
        {Platform.OS !== 'web' && <View style={{ height: 24 }} />}
      </ScrollView>
      <AlertSheet visible={!!alertFor} onClose={() => setAlertFor(null)} ticker={alertFor ?? ''} price={alertFor ? (quotes.data?.[alertFor]?.price ?? null) : null} />
    </>
  );

  if (!wide) return listView;
  return (
    <View style={styles.split}>
      <View style={[styles.listPane, { borderRightColor: c.hairline }]}>{listView}</View>
      <View style={styles.detailPane}>
        {current ? <TickerDetail key={`${current.ticker}-${current.position ?? ''}`} ticker={current.ticker} positionId={current.position} embedded onNavigate={(n) => setSelected({ ticker: n.ticker })} /> : null}
      </View>
    </View>
  );
}

function Summary({ data }: { data: Portfolio }) {
  const c = useColors();
  const t = data.totals;
  const pnl = t.pnl ?? 0;
  const m = (v: number, d = 2) => money(v, data.currency, d);
  const synced = new Date(data.fetched_at * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <View style={[styles.summary, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <Stat label="Open P&L" value={m(pnl)} sub={t.invested ? pct((pnl / t.invested) * 100, 2) : undefined} tone={pnl >= 0 ? c.up : c.down} big />
      <View style={styles.stats}>
        <Stat label="Invested" value={t.invested != null ? m(t.invested, 0) : '–'} />
        <Stat label="Worth now" value={t.value != null ? m(t.value, 0) : '–'} />
        <Stat label="Available" value={t.credit != null ? m(t.credit, 0) : '–'} />
      </View>
      {t.at_stop != null && <T kind="footnote" tabular color={t.at_stop < 0 ? c.down : c.up}>If every stop hits {m(t.at_stop, 0)} (positions with a stop)</T>}
      <T kind="caption" color={c.ink3}>
        From eToro at {synced}{data.eurusd && data.currency === 'USD' ? ` · P&L ≈ ${eur(pnl / data.eurusd)} at 1 € = ${fmt(data.eurusd, 4)} $` : ''}
      </T>
    </View>
  );
}

function Stat({ label, value, sub, tone, big }: { label: string; value: string; sub?: string; tone?: string; big?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: big ? undefined : 1, gap: 2 }}>
      <T kind="caption" color={c.ink2}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <T kind={big ? 'title2' : 'subhead'} tabular color={tone} style={{ fontWeight: big ? '700' : '600' }}>{value}</T>
        {sub ? <T kind="subhead" tabular color={tone}>{sub}</T> : null}
      </View>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <T kind="headline" style={{ paddingHorizontal: 4 }}>{title}</T>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.hairline }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  listPane: { width: '40%', minWidth: 460, maxWidth: 620, borderRightWidth: StyleSheet.hairlineWidth },
  detailPane: { flex: 1, minWidth: 0 },
  page: { padding: 16, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  summary: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  stats: { flexDirection: 'row', gap: 12 },
  group: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});

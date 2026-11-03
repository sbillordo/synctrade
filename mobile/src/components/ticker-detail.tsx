import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';

import { ListSheet } from '@/components/list-sheet';
import { SetupChart } from '@/components/chart';
import { ConditionStrip } from '@/components/condition-strip';
import { AlertRow, PositionCard } from '@/components/position-card';
import { AlertSheet } from '@/components/position-sheets';
import { TradeCalculator, tradeMath, type TradeInput } from '@/components/trade-calculator';
import { Button, Empty, Icon, Row, Section, Segmented, T } from '@/components/ui';
import { api, TIMEFRAMES, type Setup, type TF } from '@/lib/api';
import { eur, fmt, money, pct } from '@/lib/conditions';
import { useNames } from '@/lib/names';
import { load, save } from '@/lib/storage';
import { useAppState } from '@/lib/store';
import { radius, useColors } from '@/lib/theme';

const s2 = (v: number | null | undefined) => (v == null ? '' : v.toFixed(2));

/** Full page (route) or, with `embedded`, the right pane of the desktop split view. */
/** eToro time (UTC) as the chart's bar time: New York wall time sent as UTC, a date on 1d (like the server). */
function chartTime(iso: string, tf: TF): string | number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  if (tf === '1d') return `${parts.year}-${parts.month}-${parts.day}`;
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) / 1000;
}

/** positionId: opened from Portfolio, so that eToro position is drawn on the chart without asking. */
export function TickerDetail({ ticker, tfParam, embedded, onNavigate, positionId }: {
  ticker: string; tfParam?: TF; embedded?: boolean; onNavigate?: (n: { ticker: string; tf: TF }) => void; positionId?: number;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const qc = useQueryClient();
  const { sequence, costs } = useAppState();
  const detail = useQuery({ queryKey: ['ticker', ticker], queryFn: () => api.ticker(ticker) });
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: api.favorites });
  const company = useNames([ticker])[ticker];
  const [tf, setTf] = useState<TF>((tfParam as TF) ?? '4h');
  const [trade, setTrade] = useState<TradeInput>({
    amount: load('amount', '1000'), entry: '', stop: '', tp: '', leverage: load('leverage', 1), days: load('daysHeld', '5'),
  });
  const [showPos, setShowPos] = useState<boolean>(load('showPosition', false));
  const [listOpen, setListOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(load('chartCollapsed', false));
  const [showHist, setShowHist] = useState<boolean>(load('showHistPoc', true));
  const [alertOpen, setAlertOpen] = useState(false);
  const portfolio = useQuery({ queryKey: ['portfolio', 'open'], queryFn: () => api.portfolio(), retry: false });
  const currency = portfolio.data?.currency ?? 'USD';
  const alertsQ = useQuery({ queryKey: ['alerts'], queryFn: api.alerts });
  const positions = useMemo(() => (portfolio.data?.positions ?? []).filter((p) => p.ticker === ticker), [portfolio.data, ticker]);
  const alerts = useMemo(() => (alertsQ.data ?? []).filter((a) => a.ticker === ticker && !a.triggered_at), [alertsQ.data, ticker]);
  const removeAlert = (id: number) => api.deleteAlert(id).then(() => qc.invalidateQueries({ queryKey: ['alerts'] }));

  const d = detail.data;
  const res = (d?.results[tf] ?? null) as Setup | null;
  const chart = d?.charts[tf];
  const fav = (favorites.data ?? []).includes(ticker);

  // defaults change with the timeframe; the amount is the user's and is kept
  const priceNow = d?.price_now ?? res?.precio;
  const defaultsKey = `${ticker}|${tf}|${priceNow}|${res?.trade.stop}|${res?.trade.tp}`;
  const [appliedKey, setAppliedKey] = useState('');
  if (priceNow != null && appliedKey !== defaultsKey) {
    setAppliedKey(defaultsKey);
    // without a setup there are no suggested levels: start from -5% / +10% so the simulator works right away
    setTrade((t) => ({
      ...t, entry: s2(priceNow),
      stop: res ? s2(res.trade.stop) : s2(priceNow * 0.95),
      tp: res ? s2(res.trade.tp) : s2(priceNow * 1.1),
    }));
  }
  useEffect(() => save('amount', trade.amount), [trade.amount]);
  useEffect(() => save('leverage', trade.leverage), [trade.leverage]);
  useEffect(() => save('daysHeld', trade.days), [trade.days]);

  const favMut = useMutation({
    mutationFn: (on: boolean) => api.setFavorite(ticker, on),
    onMutate: async (on) => {
      Haptics.selectionAsync().catch(() => undefined);
      const prev = qc.getQueryData<string[]>(['favorites']) ?? [];
      qc.setQueryData(['favorites'], on ? [...prev, ticker] : prev.filter((x) => x !== ticker));
      return { prev };
    },
    onError: (_e, _on, ctx) => ctx && qc.setQueryData(['favorites'], ctx.prev),
  });

  const idx = sequence.findIndex((x) => x.ticker === ticker && x.tf === (tfParam ?? tf));
  const go = (step: number) => {
    const n = sequence[idx + step];
    if (!n) return;
    if (onNavigate) onNavigate(n);
    else router.replace({ pathname: '/ticker/[symbol]', params: { symbol: n.ticker, tf: n.tf } });
  };

  const math = tradeMath(trade, d?.eurusd ?? null, costs);
  const payload = useMemo(() => {
    if (!chart) return null;
    // the eToro position is drawn instead of the simulation: always when opened from Portfolio, else with the switch
    const real = positions.find((p) => p.id === positionId) ?? positions[0];
    const num = (v: string) => Number(v.replace(',', '.'));
    const position = real && (showPos || positionId != null)
      ? {
          entry: real.open_rate, stop: real.stop ?? null, tp: real.tp ?? null,
          openTime: real.opened_at ? chartTime(real.opened_at, chart.tf) : null,
          marker: `${real.is_buy ? 'Buy' : 'Sell'}${real.leverage > 1 ? ` x${real.leverage}` : ''}`,
          targetLabel: `Target ${fmt(real.tp ?? 0)}${real.at_tp != null ? `\n${money(real.at_tp, currency, 0)}` : ''}`,
          stopLabel: `Stop ${fmt(real.stop ?? 0)}${real.at_stop != null ? `\n${money(real.at_stop, currency, 0)}` : ''}`,
          entryLabel: `eToro ${fmt(real.open_rate)}${real.pnl != null ? ` · ${money(real.pnl, currency, 0)}` : ''}`,
        }
      : showPos && math.ok
      ? {
          entry: num(trade.entry), stop: num(trade.stop), tp: num(trade.tp),
          targetLabel: `Target ${fmt(num(trade.tp))}\n${pct(math.gainPct, 1)} · ${eur(math.gainEur, 0)}`,
          stopLabel: `Stop ${fmt(num(trade.stop))}\n${pct(math.lossPct, 1)} · ${eur(-math.lossEur, 0)}`,
          entryLabel: `R:R ${fmt(math.rr, 1)}`,
        }
      : null;
    return { chart, colors: c, histPoc: d?.hist_poc ?? null, showHistPoc: showHist, position, alerts: alerts.map((a) => a.price) };
  }, [chart, c, d?.hist_poc, showHist, showPos, positions, positionId, currency, alerts, math.ok, math.gainEur, math.lossEur, math.gainPct, math.lossPct, math.rr, trade.entry, trade.stop, trade.tp]);

  const header = embedded ? null : (
    <Stack.Screen
      options={{
        title: '',
        headerRight: () => (
          <View style={styles.pager}>
            {d && (
              <Pressable onPress={() => Linking.openURL(d.tv_urls[tf])} hitSlop={8} accessibilityRole="link" accessibilityLabel="Open in TradingView" style={[styles.tvHeader, { backgroundColor: c.accent }]}>
                <T kind="footnote" color={c.accentInk} style={{ fontWeight: '700' }}>TradingView</T>
                <Icon sf="arrow.up.right" web="open_in_new" size={12} color={c.accentInk} />
              </Pressable>
            )}
            {sequence.length > 1 && idx >= 0 ? (
              <>
              <T kind="footnote" tabular color={c.ink2}>{idx + 1} of {sequence.length}</T>
              <Pressable onPress={() => go(-1)} disabled={idx <= 0} hitSlop={8} accessibilityLabel="Previous setup" style={styles.headerBtn}>
                <Icon sf="chevron.up" web="expand_less" size={18} color={idx <= 0 ? c.ink3 : c.accent} />
              </Pressable>
              <Pressable onPress={() => go(1)} disabled={idx >= sequence.length - 1} hitSlop={8} accessibilityLabel="Next setup" style={styles.headerBtn}>
                <Icon sf="chevron.down" web="expand_more" size={18} color={idx >= sequence.length - 1 ? c.ink3 : c.accent} />
              </Pressable>
              </>
            ) : null}
          </View>
        ),
      }}
    />
  );

  if (detail.isLoading) return (<>{header}<Empty title={`Loading ${ticker}`} body="Downloading the latest bars and evaluating 1h, 4h and 1d." /></>);
  if (detail.isError || !d) return (<>{header}<Empty title={`Can’t load ${ticker}`} body={(detail.error as Error)?.message ?? 'Unknown error'} action={<Button label="Try again" kind="plain" onPress={() => detail.refetch()} />} /></>);

  const last = chart?.candles.at(-1)?.close ?? d.price_now ?? 0;
  const first = chart?.candles.at(-21)?.close ?? last;
  const chg = first ? (last / first - 1) * 100 : 0;
  const sig = d.signals.find((x) => x.tf === tf && x.active);

  return (
    <>
      {header}
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
        {embedded && (
          <View style={styles.bar}>
            {sequence.length > 1 && idx >= 0 ? (
              <View style={styles.pager}>
                <T kind="footnote" tabular color={c.ink2}>{idx + 1} of {sequence.length}</T>
                <Pressable onPress={() => go(-1)} disabled={idx <= 0} accessibilityLabel="Previous setup" style={[styles.barBtn, { backgroundColor: c.surfaceRaised, opacity: idx <= 0 ? 0.4 : 1 }]}>
                  <Icon sf="chevron.up" web="chevron_left" size={18} color={c.ink} />
                </Pressable>
                <Pressable onPress={() => go(1)} disabled={idx >= sequence.length - 1} accessibilityLabel="Next setup" style={[styles.barBtn, { backgroundColor: c.surfaceRaised, opacity: idx >= sequence.length - 1 ? 0.4 : 1 }]}>
                  <Icon sf="chevron.down" web="chevron_right" size={18} color={c.ink} />
                </Pressable>
              </View>
            ) : <View />}
            <Pressable onPress={() => Linking.openURL(d.tv_urls[tf])} accessibilityRole="link" style={[styles.tvBtn, { backgroundColor: c.accent }]}>
              <T kind="subhead" color={c.accentInk} style={{ fontWeight: '600' }}>TradingView</T>
              <Icon sf="arrow.up.right" web="open_in_new" size={14} color={c.accentInk} />
            </Pressable>
          </View>
        )}
        <View style={styles.titleRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.titleLine}>
              <T kind="largeTitle">{ticker}</T>
              <Pressable
                onPress={() => favMut.mutate(!fav)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={fav ? 'Remove from saved' : 'Save ticker'}
                style={styles.star}>
                <Icon sf={fav ? 'star.fill' : 'star'} web="star" size={24} color={fav ? c.warn : c.ink2} />
              </Pressable>
              <Pressable
                onPress={() => setListOpen(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Add to list"
                style={styles.star}>
                <Icon sf="text.badge.plus" web="playlist_add" size={24} color={c.ink2} />
              </Pressable>
            </View>
            <T kind="subhead" color={c.ink2} numberOfLines={1}>{company ? `${company} · ` : ''}{d.tv_symbol.split(':')[0]}</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T kind="title2" tabular>{fmt(d.price_now ?? last)}</T>
            <T kind="footnote" tabular color={chg >= 0 ? c.up : c.down}>{pct(chg, 2)} · 20 bars</T>
          </View>
        </View>

        {res && (
          <View style={[styles.summary, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <View style={styles.summaryHead}>
              <T kind="subhead" color={res.cumple === 5 ? c.up : c.ink} style={{ fontWeight: '600' }}>{res.cumple} of 5 conditions</T>
              <T kind="subhead" tabular color={c.ink2}>Score <T kind="subhead" tabular style={{ fontWeight: '600' }}>{Math.round(res.score)}</T></T>
            </View>
            <ConditionStrip setup={{ ...res, ticker, tf }} />
          </View>
        )}

        <View style={styles.tfRow}>
          <View style={{ flex: 1 }}>
            <Segmented
              values={TIMEFRAMES.map((t) => `${t}  ${d.results[t] ? `${d.results[t]!.cumple}/5` : '–'}`)}
              index={TIMEFRAMES.indexOf(tf)}
              onChange={(i) => setTf(TIMEFRAMES[i])}
            />
          </View>
          <Pressable
            onPress={() => { const v = !collapsed; setCollapsed(v); save('chartCollapsed', v); }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={collapsed ? 'Show chart and indicators' : 'Hide chart and indicators'}
            style={[styles.collapseBtn, { backgroundColor: c.surfaceRaised }]}>
            <Icon sf={collapsed ? 'chevron.down' : 'chevron.up'} web={collapsed ? 'expand_more' : 'expand_less'} size={20} color={c.ink} />
          </Pressable>
        </View>

        {!collapsed && payload && (
          <View style={{ marginHorizontal: -16 }}>
            <SetupChart payload={payload} height={embedded ? 540 : Math.round(Math.min(560, width * 1.15))} />
          </View>
        )}
        {!collapsed && <View style={styles.legend}>
          <Legend color={c.accent} label={res ? `Fib ${res.fib}` : 'Fib'} />
          <Legend color={c.ink3} label="Other fib" dashed />
          <Legend color={c.warn} label="Swing POC" />
          {d.hist_poc ? <Legend color={c.warn} label="All-time POC" dashed /> : null}
          {res?.gaps.length ? <Legend color={c.down} label="Open gap" box /> : null}
        </View>}
        {!collapsed && d.hist_poc ? (
          <Section>
            <Row first>
              <View style={{ flex: 1 }}>
                <T kind="body">All-time POC</T>
                <T kind="footnote" tabular color={c.ink2}>{fmt(d.hist_poc)} · from the full daily history</T>
              </View>
              <Switch value={showHist} onValueChange={(v) => { setShowHist(v); save('showHistPoc', v); }} trackColor={{ true: c.accent }} />
            </Row>
          </Section>
        ) : null}

        {!res && (
          <Section>
            <Row first style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <T kind="headline">No setup on {tf}</T>
              <T kind="footnote" color={c.ink2}>The last impulse on this timeframe is too small or the swing low was broken, so there are no fib levels to test.</T>
            </Row>
          </Section>
        )}

        {positions.length > 0 && (
          <View style={{ gap: 8 }}>
            <T kind="headline" style={{ paddingHorizontal: 4 }}>Your position{positions.length > 1 ? 's' : ''}</T>
            {positions.map((p) => <PositionCard key={p.id} p={p} currency={currency} />)}
          </View>
        )}

        {(res || priceNow != null) && (
          <TradeCalculator
            value={trade}
            onChange={setTrade}
            eurusd={d.eurusd}
            costs={costs}
            defaults={res ? { stop: s2(res.trade.stop), tp: s2(res.trade.tp) } : undefined}
            tpRule={res?.trade.tp_rule}
            showOnChart={showPos}
            onShowOnChart={(v) => { setShowPos(v); save('showPosition', v); }}
          />
        )}
        {(res || priceNow != null) && (
          <View style={styles.tradeActions}>
            <View style={{ flex: 1 }}>
              <Button label="Price alert" kind="plain" onPress={() => setAlertOpen(true)} icon={<Icon sf="bell" web="notifications" size={16} color={c.ink} />} />
            </View>
          </View>
        )}
        {alerts.length > 0 && (
          <Section title="Price alerts">
            {alerts.map((a) => <AlertRow key={a.id} a={a} price={d.price_now} onDelete={() => removeAlert(a.id)} />)}
          </Section>
        )}

        {!embedded && (
          <Button
            label="Open in TradingView"
            onPress={() => Linking.openURL(d.tv_urls[tf])}
            icon={<Icon sf="arrow.up.right" web="open_in_new" size={16} color={c.accentInk} />}
          />
        )}
        <View style={styles.history}>
          <Icon sf="bell" web="notifications" size={14} color={c.ink2} />
          <T kind="footnote" color={c.ink2} style={{ flex: 1 }}>
            {sig
              ? `First seen ${new Date(sig.first_seen).toLocaleString('en-US', { timeZone: 'America/New_York', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} NY · ${sig.alerted_cumple ? 'notified' : sig.max_cumple === 5 ? 'notification pending' : 'below the alert threshold (5 of 5)'}`
              : 'Not in the signal history: setups enter it at 3 of 5'}
          </T>
        </View>
        {Platform.OS !== 'web' && <View style={{ height: 24 }} />}
      </ScrollView>
      <ListSheet ticker={ticker} visible={listOpen} onClose={() => setListOpen(false)} />
      <AlertSheet visible={alertOpen} onClose={() => setAlertOpen(false)} ticker={ticker} price={d.price_now} />
    </>
  );
}

function Legend({ color, label, dashed, box }: { color: string; label: string; dashed?: boolean; box?: boolean }) {
  const c = useColors();
  return (
    <View style={styles.legendItem}>
      {box ? (
        <View style={{ width: 12, height: 10, borderRadius: 2, backgroundColor: c.downSoft, borderWidth: 1, borderColor: color }} />
      ) : (
        <View style={{ width: 14, borderTopWidth: 2, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />
      )}
      <T kind="caption" color={c.ink2}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  summary: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  summaryHead: { flexDirection: 'row', justifyContent: 'space-between' },
  tfRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  collapseBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: -6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  history: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tvHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 11, borderRadius: 15, marginRight: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tvBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 10 },
  headerBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  tradeActions: { flexDirection: 'row', gap: 8, marginTop: -4 },
});

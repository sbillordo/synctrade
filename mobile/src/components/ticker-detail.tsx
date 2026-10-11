import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';

import { SetupChart } from '@/components/chart';
import { ConditionStrip } from '@/components/condition-strip';
import { TradeCalculator, tradeMath, type TradeInput } from '@/components/trade-calculator';
import { Button, Empty, Icon, Row, Section, Segmented, T } from '@/components/ui';
import { api, CONDS, TIMEFRAMES, type Setup, type TF } from '@/lib/api';
import { eur, fmt, gauges, LABEL, pct } from '@/lib/conditions';
import { load, save } from '@/lib/storage';
import { useAppState } from '@/lib/store';
import { radius, useColors } from '@/lib/theme';

const s2 = (v: number | null | undefined) => (v == null ? '' : v.toFixed(2));

/** Full page (route) or, with `embedded`, the right pane of the desktop split view. */
export function TickerDetail({ ticker, tfParam, embedded, onNavigate }: {
  ticker: string; tfParam?: TF; embedded?: boolean; onNavigate?: (n: { ticker: string; tf: TF }) => void;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const qc = useQueryClient();
  const { sequence } = useAppState();
  const detail = useQuery({ queryKey: ['ticker', ticker], queryFn: () => api.ticker(ticker) });
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: api.favorites });
  const [tf, setTf] = useState<TF>((tfParam as TF) ?? '4h');
  const [trade, setTrade] = useState<TradeInput>({ amount: load('amount', '1000'), entry: '', stop: '', tp: '' });
  const [showPos, setShowPos] = useState<boolean>(load('showPosition', false));
  const [showHist, setShowHist] = useState<boolean>(load('showHistPoc', true));

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
    setTrade((t) => ({ ...t, entry: s2(priceNow), stop: s2(res?.trade.stop), tp: s2(res?.trade.tp) }));
  }
  useEffect(() => save('amount', trade.amount), [trade.amount]);

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

  const math = tradeMath(trade, d?.eurusd ?? null);
  const payload = useMemo(() => {
    if (!chart) return null;
    const num = (v: string) => Number(v.replace(',', '.'));
    const position = showPos && math.ok
      ? {
          entry: num(trade.entry), stop: num(trade.stop), tp: num(trade.tp),
          targetLabel: `Target ${fmt(num(trade.tp))}\n${pct(math.gainPct, 1)} · ${eur(math.gainEur, 0)}`,
          stopLabel: `Stop ${fmt(num(trade.stop))}\n${pct(math.lossPct, 1)} · ${eur(-math.lossEur, 0)}`,
          entryLabel: `R:R ${fmt(math.rr, 1)}`,
        }
      : null;
    return { chart, colors: c, histPoc: d?.hist_poc ?? null, showHistPoc: showHist, position };
  }, [chart, c, d?.hist_poc, showHist, showPos, math.ok, math.gainEur, math.lossEur, math.gainPct, math.lossPct, math.rr, trade.entry, trade.stop, trade.tp]);

  const header = embedded ? null : (
    <Stack.Screen
      options={{
        title: '',
        headerRight: () =>
          sequence.length > 1 && idx >= 0 ? (
            <View style={styles.pager}>
              <T kind="footnote" tabular color={c.ink2}>{idx + 1} of {sequence.length}</T>
              <Pressable onPress={() => go(-1)} disabled={idx <= 0} hitSlop={8} accessibilityLabel="Previous setup" style={styles.headerBtn}>
                <Icon sf="chevron.up" web="expand_less" size={18} color={idx <= 0 ? c.ink3 : c.accent} />
              </Pressable>
              <Pressable onPress={() => go(1)} disabled={idx >= sequence.length - 1} hitSlop={8} accessibilityLabel="Next setup" style={styles.headerBtn}>
                <Icon sf="chevron.down" web="expand_more" size={18} color={idx >= sequence.length - 1 ? c.ink3 : c.accent} />
              </Pressable>
            </View>
          ) : null,
      }}
    />
  );

  if (detail.isLoading) return (<>{header}<Empty title={`Loading ${ticker}`} body="Downloading the latest bars and evaluating 1h, 4h and 1d." /></>);
  if (detail.isError || !d) return (<>{header}<Empty title={`Can’t load ${ticker}`} body={(detail.error as Error)?.message ?? 'Unknown error'} action={<Button label="Try again" kind="plain" onPress={() => detail.refetch()} />} /></>);

  const last = chart?.candles.at(-1)?.close ?? d.price_now ?? 0;
  const first = chart?.candles.at(-21)?.close ?? last;
  const chg = first ? (last / first - 1) * 100 : 0;
  const g = res ? gauges({ ...res, ticker, tf }) : null;
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
            </View>
            <T kind="subhead" color={c.ink2}>{d.tv_symbol.split(':')[0]}</T>
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

        <Segmented
          values={TIMEFRAMES.map((t) => `${t}  ${d.results[t] ? `${d.results[t]!.cumple}/5` : '–'}`)}
          index={TIMEFRAMES.indexOf(tf)}
          onChange={(i) => setTf(TIMEFRAMES[i])}
        />

        {payload && (
          <View style={{ marginHorizontal: -16 }}>
            <SetupChart payload={payload} height={embedded ? 540 : Math.round(Math.min(560, width * 1.15))} />
          </View>
        )}
        <View style={styles.legend}>
          <Legend color={c.accent} label={res ? `Fib ${res.fib}` : 'Fib'} />
          <Legend color={c.ink3} label="Other fib" dashed />
          <Legend color={c.warn} label="Swing POC" />
          {d.hist_poc ? <Legend color={c.warn} label="All-time POC" dashed /> : null}
          {res?.gaps.length ? <Legend color={c.down} label="Open gap" box /> : null}
        </View>
        {d.hist_poc ? (
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

        {res && g ? (
          <Section title="Conditions" aside={`${res.cumple} of 5 met`}>
            {CONDS.map((k, i) => (
              <Row key={k} first={i === 0}>
                <View style={[styles.ok, { backgroundColor: g[k].met ? c.upSoft : c.downSoft }]}>
                  <Icon sf={g[k].met ? 'checkmark' : 'xmark'} web={g[k].met ? 'check' : 'close'} size={12} color={g[k].met ? c.up : c.down} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <T kind="headline">{LABEL[k]}</T>
                  <T kind="footnote" color={c.ink2}>{g[k].rule}</T>
                </View>
                <View style={{ alignItems: 'flex-end', maxWidth: 140 }}>
                  <T kind="body" tabular color={g[k].met ? c.ink : c.down} style={{ fontWeight: '600' }}>{g[k].long}</T>
                  <T kind="caption" tabular color={c.ink2} numberOfLines={2} style={{ textAlign: 'right' }}>{g[k].extra}</T>
                </View>
              </Row>
            ))}
          </Section>
        ) : (
          <Section>
            <Row first style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <T kind="headline">No setup on {tf}</T>
              <T kind="footnote" color={c.ink2}>The last impulse on this timeframe is too small or the swing low was broken, so there are no fib levels to test.</T>
            </Row>
          </Section>
        )}

        {res && (
          <TradeCalculator
            value={trade}
            onChange={setTrade}
            eurusd={d.eurusd}
            defaults={{ stop: s2(res.trade.stop), tp: s2(res.trade.tp) }}
            tpRule={res.trade.tp_rule}
            showOnChart={showPos}
            onShowOnChart={(v) => { setShowPos(v); save('showPosition', v); }}
          />
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
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: -6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ok: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  history: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tvBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 10 },
  headerBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
});

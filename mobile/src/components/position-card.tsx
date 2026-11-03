// An eToro position (open or closed) and a price alert, as shown in Portfolio and on the ticker page.
import { Pressable, StyleSheet, View } from 'react-native';

import type { Position, PriceAlert } from '@/lib/api';
import { fmt, money, pct } from '@/lib/conditions';
import { radius, useColors } from '@/lib/theme';

import { Icon, T } from './ui';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit' });
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

/** Stop ← entry → target, with a marker where the price is now (clamped to the ends when it is outside). */
function LevelBar({ stop, entry, tp, price }: { stop: number; entry: number; tp: number; price: number }) {
  const c = useColors();
  const span = tp - stop;
  const at = (v: number) => `${Math.max(0, Math.min(1, (v - stop) / span)) * 100}%` as const;
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.bar}>
        <View style={[styles.seg, { left: 0, width: at(entry), backgroundColor: c.downSoft, borderColor: c.down }]} />
        <View style={[styles.seg, { left: at(entry), right: 0, backgroundColor: c.upSoft, borderColor: c.up }]} />
        <View style={[styles.entry, { left: at(entry), backgroundColor: c.ink2 }]} />
        <View style={[styles.dot, { left: at(price), backgroundColor: price >= entry ? c.up : c.down, borderColor: c.surface }]} />
      </View>
      <View style={styles.barLabels}>
        <T kind="caption" tabular color={c.down}>Stop {fmt(stop)}</T>
        <T kind="caption" tabular color={c.ink2}>Entry {fmt(entry)}</T>
        <T kind="caption" tabular color={c.up}>Target {fmt(tp)}</T>
      </View>
    </View>
  );
}

export function PositionCard({ p, currency, showName, selected, onPress }: {
  p: Position; currency: string | null; showName?: boolean; selected?: boolean; onPress?: () => void;
}) {
  const c = useColors();
  const open = p.closed_at == null;
  const tone = p.pnl == null ? c.ink : p.pnl >= 0 ? c.up : c.down;
  const units = `${fmt(p.units, p.units % 1 ? 2 : 0)} units`;
  const m = (v: number, d = 2) => money(v, currency, d);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.card, { backgroundColor: pressed || selected ? c.surfaceRaised : c.surface, borderColor: selected ? c.accent : c.hairline }]}>
      <View style={styles.top}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={styles.tk}>
            <T kind="headline" style={{ fontSize: 18, fontWeight: '700' }}>{p.ticker}</T>
            {!p.is_buy && <View style={[styles.tag, { backgroundColor: c.downSoft }]}><T kind="label" color={c.down}>SHORT</T></View>}
            {p.leverage > 1 && <View style={[styles.tag, { backgroundColor: c.accentSoft }]}><T kind="label" color={c.accent}>X{p.leverage}</T></View>}
            {open && p.cfd && <View style={[styles.tag, { backgroundColor: c.surfaceHigh }]}><T kind="label" color={c.ink2}>CFD</T></View>}
          </View>
          {showName && p.name ? <T kind="caption" color={c.ink3} numberOfLines={1}>{p.name}</T> : null}
          <T kind="footnote" tabular color={c.ink2} numberOfLines={1}>
            {open
              ? `${units} @ ${fmt(p.open_rate)}${p.price != null ? ` · now ${fmt(p.price)}` : ''}`
              : `${day(p.opened_at)} → ${day(p.closed_at!)} · ${fmt(p.open_rate)} → ${p.close_rate != null ? fmt(p.close_rate) : '–'}`}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T kind="headline" tabular color={tone} style={{ fontSize: 18, fontWeight: '700' }}>{p.pnl != null ? m(p.pnl) : '–'}</T>
          <T kind="footnote" tabular color={c.ink2}>{p.pnl_pct != null ? pct(p.pnl_pct, 2) : ' '}</T>
        </View>
      </View>

      {open && p.is_buy && p.stop != null && p.tp != null && p.price != null && p.stop < p.tp && (
        <LevelBar stop={p.stop} entry={p.open_rate} tp={p.tp} price={p.price} />
      )}
      <T kind="footnote" tabular color={c.ink2}>
        {[
          p.amount != null ? `Invested ${m(p.amount, 0)}` : null,
          open ? (p.stop != null ? `Stop ${fmt(p.stop)}${p.at_stop != null ? ` → ${m(p.at_stop, 0)}` : ''}` : 'No stop') : null,
          open ? (p.tp != null ? `Target ${fmt(p.tp)}${p.at_tp != null ? ` → ${m(p.at_tp, 0)}` : ''}` : 'No target') : null,
          p.fees ? `Fees ${m(-Math.abs(p.fees))}` : null,
        ].filter(Boolean).join(' · ')}
      </T>
    </Pressable>
  );
}

export function AlertRow({ a, price, onPress, onDelete }: { a: PriceAlert; price?: number | null; onPress?: () => void; onDelete?: () => void }) {
  const c = useColors();
  const fired = !!a.triggered_at;
  const above = a.direction === 'above';
  const dist = price != null && !fired ? (a.price / price - 1) * 100 : null;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.alert, { backgroundColor: pressed ? c.surfaceRaised : 'transparent' }]}>
      <View style={[styles.alertIcon, { backgroundColor: fired ? c.accentSoft : c.surfaceRaised }]}>
        <Icon sf={above ? 'arrow.up.right' : 'arrow.down.right'} web={above ? 'north_east' : 'south_east'} size={14} color={fired ? c.accent : above ? c.up : c.down} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T kind="subhead" tabular style={{ fontWeight: '600' }}>
          {a.ticker} {above ? '≥' : '≤'} {fmt(a.price)}
        </T>
        <T kind="caption" color={c.ink2} numberOfLines={1}>
          {fired ? `Hit ${when(a.triggered_at!)} NY${a.triggered_price != null ? ` · ${fmt(a.triggered_price)}` : ''}` : `Since ${when(a.created_at)} NY`}
          {a.note ? ` · ${a.note}` : ''}
        </T>
      </View>
      {dist != null && <T kind="footnote" tabular color={c.ink2}>{pct(dist, 1)} away</T>}
      {onDelete && (
        <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete alert ${a.ticker} ${fmt(a.price)}`} style={styles.trash}>
          <Icon sf="xmark" web="close" size={15} color={c.ink3} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tk: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.tag },
  bar: { height: 14, justifyContent: 'center' },
  seg: { position: 'absolute', height: 6, borderTopWidth: 0, borderBottomWidth: 2 },
  entry: { position: 'absolute', width: 2, height: 12, marginLeft: -1 },
  dot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, marginLeft: -7, borderWidth: 2 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  trash: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 52 },
  alertIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

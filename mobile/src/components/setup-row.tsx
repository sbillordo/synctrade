import { Pressable, StyleSheet, View } from 'react-native';

import type { Setup } from '@/lib/api';
import { fmt, type Rule } from '@/lib/conditions';
import { radius, useColors } from '@/lib/theme';

import { ConditionStrip } from './condition-strip';
import { Icon, T } from './ui';

export function SetupRow({ s, favorite, rules, onPress, compact, selected }: {
  s: Setup; favorite?: boolean; rules?: Partial<Record<string, Rule>>; onPress: () => void; compact?: boolean; selected?: boolean;
}) {
  const c = useColors();
  const full = s.cumple === 5;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${s.ticker} ${s.tf}, ${s.cumple} of 5 conditions, score ${Math.round(s.score)}`}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => compact
        ? [styles.compact, { backgroundColor: selected ? c.accentSoft : pressed ? c.surfaceRaised : 'transparent', borderBottomColor: c.hairline }]
        : [styles.row, { backgroundColor: pressed ? c.surfaceRaised : c.surface, borderColor: c.hairline }]}>
      {compact ? (
        <>
          <View style={{ width: COMPACT_ID, minWidth: 0, gap: 2 }}>
            <View style={styles.tk}>
              <T kind="headline" style={{ fontSize: 15, fontWeight: '700' }}>{s.ticker}</T>
              <View style={[styles.tf, { backgroundColor: c.surfaceHigh }]}><T kind="label" color={c.ink2}>{s.tf.toUpperCase()}</T></View>
              {favorite && <Icon sf="star.fill" web="star" size={12} color={c.warn} />}
            </View>
            <T kind="caption" tabular color={c.ink2} numberOfLines={1}>Fib {s.fib} · {fmt(s.nivel)}</T>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}><ConditionStrip setup={s} rules={rules} labels={false} /></View>
          <View style={{ width: COMPACT_SCORE, alignItems: 'flex-end' }}>
            <T kind="headline" tabular style={{ fontSize: 15, fontWeight: '700' }}>{Math.round(s.score)}</T>
            <T kind="footnote" tabular color={full ? c.up : c.ink2} style={{ fontWeight: '600' }}>{s.cumple}/5</T>
          </View>
        </>
      ) : (<>
      <View style={styles.top}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={styles.tk}>
            <T kind="headline" style={{ fontSize: 18, fontWeight: '700' }}>{s.ticker}</T>
            <View style={[styles.tf, { backgroundColor: c.surfaceHigh }]}>
              <T kind="label" color={c.ink2}>{s.tf.toUpperCase()}</T>
            </View>
            {favorite && <Icon sf="star.fill" web="star" size={13} color={c.warn} />}
          </View>
          <T kind="footnote" tabular color={c.ink2} numberOfLines={1}>
            Fib {s.fib} · {fmt(s.nivel)} · last {fmt(s.precio)}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T kind="headline" tabular style={{ fontSize: 18, fontWeight: '700' }}>{Math.round(s.score)}</T>
          <T kind="footnote" tabular color={full ? c.up : c.ink2} style={{ fontWeight: '600' }}>{s.cumple}/5</T>
        </View>
      </View>
      <ConditionStrip setup={s} rules={rules} />
      </>)}
    </Pressable>
  );
}

export const COMPACT_ID = 128;
export const COMPACT_SCORE = 52;

const styles = StyleSheet.create({
  compact: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tk: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tf: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.tag },
});

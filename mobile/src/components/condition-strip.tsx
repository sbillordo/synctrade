// Signature element: five gauges, each a value against its threshold tick (passing the tick = met).
import { StyleSheet, View } from 'react-native';

import { CONDS, type Setup } from '@/lib/api';
import { gauges, LABEL, type Rule } from '@/lib/conditions';
import { useColors } from '@/lib/theme';

import { T } from './ui';

export function ConditionStrip({ setup, rules, labels = true }: { setup: Setup; rules?: Partial<Record<string, Rule>>; labels?: boolean }) {
  const c = useColors();
  const g = gauges(setup);
  return (
    <View style={styles.strip}>
      {CONDS.map((k) => {
        const x = g[k];
        const off = rules?.[k] === 'ignore';
        const fill = x.met ? c.up : c.down;
        return (
          <View key={k} style={[styles.gauge, off && { opacity: 0.35 }]} accessible accessibilityLabel={`${LABEL[k]} ${x.value}, ${x.met ? 'met' : 'not met'}`}>
            {labels && <T kind="label" color={c.ink2}>{LABEL[k]}</T>}
            <T kind="subhead" tabular numberOfLines={1} color={x.met ? c.ink : c.down} style={{ fontWeight: '600' }}>
              {x.value}
            </T>
            <View style={[styles.track, { backgroundColor: c.surfaceHigh }]}>
              <View style={[styles.fill, { width: `${x.x * 100}%`, backgroundColor: off ? c.ink3 : fill }]} />
              {x.tick != null && <View style={[styles.tick, { left: `${x.tick * 100}%`, backgroundColor: c.ink2 }]} />}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 6 },
  gauge: { flex: 1, minWidth: 0, gap: 2 },
  track: { height: 4, borderRadius: 2, marginTop: 5 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  tick: { position: 'absolute', top: -3, bottom: -3, width: 2, marginLeft: -1, borderRadius: 1 },
});

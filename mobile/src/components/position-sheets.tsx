// Price alert form. Positions come from eToro and are read-only here.
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { View } from 'react-native';

import { api } from '@/lib/api';
import { fmt } from '@/lib/conditions';
import { useColors } from '@/lib/theme';

import { FormSheet, num } from './form-sheet';
import { T } from './ui';

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ['alerts'] });
  };
}

function Preview({ lines }: { lines: { label: string; value: string; tone?: 'up' | 'down' }[] }) {
  const c = useColors();
  return (
    <View style={{ gap: 4 }}>
      {lines.map((l) => (
        <View key={l.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T kind="footnote" color={c.ink2}>{l.label}</T>
          <T kind="footnote" tabular color={l.tone === 'up' ? c.up : l.tone === 'down' ? c.down : c.ink} style={{ fontWeight: '600' }}>{l.value}</T>
        </View>
      ))}
    </View>
  );
}

/** "Tell me when TICKER reaches X": above or below follows from where the price is now. */
export function AlertSheet({ visible, onClose, ticker, price }: { visible: boolean; onClose: () => void; ticker: string; price: number | null }) {
  const refresh = useRefresh();
  const dir = (target: number) => (price != null && target < price ? 'below' : 'above');
  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title={`Price alert · ${ticker}`}
      subtitle={`${price != null ? `Last ${fmt(price)} $. ` : ''}Checked every 5 min in session; Yahoo prices run ~15 min late.`}
      fields={[
        { key: 'price', label: 'Price', suffix: '$' },
        { key: 'note', label: 'Note', kind: 'text' },
      ]}
      initial={{ price: '', note: '' }}
      action="Create alert"
      validate={(v) => {
        const target = num(v.price);
        if (!(target > 0)) return 'Type the price to watch.';
        if (price != null && Math.abs(target - price) < 0.005) return 'That is the current price.';
        return null;
      }}
      preview={(v) => {
        const target = num(v.price);
        const d = price ? ((target / price - 1) * 100) : null;
        return <Preview lines={[{ label: `Notify when it goes ${dir(target)}`, value: `${fmt(target)} $${d != null ? ` · ${d > 0 ? '+' : '−'}${fmt(Math.abs(d), 1)}%` : ''}` }]} />;
      }}
      onSubmit={async (v) => {
        await api.createAlert({ ticker, price: num(v.price), direction: dir(num(v.price)), note: v.note.trim() || undefined });
        refresh();
      }}
    />
  );
}

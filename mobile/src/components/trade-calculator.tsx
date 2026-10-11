// Trade calculator: the user sets amount (EUR), entry, stop and take profit; nothing here is a recommendation.
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { eur, fmt, pct } from '@/lib/conditions';
import { nums, radius, type, useColors } from '@/lib/theme';

import { Row, Section, T } from './ui';

export type TradeInput = { amount: string; entry: string; stop: string; tp: string };

export type TradeMath = {
  ok: boolean;
  error?: string;
  shares: number;
  usd: number;
  lossEur: number;
  gainEur: number;
  lossPct: number;
  gainPct: number;
  rr: number;
};

const num = (s: string) => Number(String(s).replace(',', '.'));

/** eurusd = dollars per euro. Shares can be fractional (most EU brokers allow it). */
export function tradeMath(t: TradeInput, eurusd: number | null): TradeMath {
  const amount = num(t.amount), entry = num(t.entry), stop = num(t.stop), tp = num(t.tp);
  const zero = { shares: 0, usd: 0, lossEur: 0, gainEur: 0, lossPct: 0, gainPct: 0, rr: 0 };
  if (!eurusd) return { ok: false, error: 'EUR/USD rate unavailable right now.', ...zero };
  if (![amount, entry, stop, tp].every((v) => Number.isFinite(v) && v > 0)) return { ok: false, error: 'Fill in every value.', ...zero };
  if (!(stop < entry && entry < tp)) return { ok: false, error: 'Stop must be below the entry and the take profit above it.', ...zero };
  const usd = amount * eurusd;
  const shares = usd / entry;
  const lossEur = (shares * (entry - stop)) / eurusd;
  const gainEur = (shares * (tp - entry)) / eurusd;
  return {
    ok: true, shares, usd, lossEur, gainEur,
    lossPct: ((stop - entry) / entry) * 100, gainPct: ((tp - entry) / entry) * 100, rr: (tp - entry) / (entry - stop),
  };
}

function Field({ label, hint, value, onChange, suffix }: { label: string; hint?: string; value: string; onChange: (v: string) => void; suffix: string }) {
  const c = useColors();
  return (
    <Row>
      <View style={{ flex: 1 }}>
        <T kind="body">{label}</T>
        {hint ? <T kind="footnote" color={c.ink2}>{hint}</T> : null}
      </View>
      <View style={[styles.input, { backgroundColor: c.surfaceRaised }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          selectTextOnFocus
          accessibilityLabel={label}
          style={[type.body, nums, styles.inputText, { color: c.ink }]}
        />
        <T kind="subhead" color={c.ink2}>{suffix}</T>
      </View>
    </Row>
  );
}

export function TradeCalculator({ value, onChange, eurusd, defaults, tpRule, showOnChart, onShowOnChart }: {
  value: TradeInput;
  onChange: (v: TradeInput) => void;
  eurusd: number | null;
  defaults: { stop: string; tp: string };
  tpRule: 'extension_0.618' | 'swing_high';
  showOnChart: boolean;
  onShowOnChart: (v: boolean) => void;
}) {
  const c = useColors();
  const m = tradeMath(value, eurusd);
  const set = (k: keyof TradeInput) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <Section title="Trade" aside={eurusd ? `1 € = ${fmt(eurusd, 4)} $` : undefined}>
      <Field label="Amount" value={value.amount} onChange={set('amount')} suffix="€" />
      <Field label="Entry" hint="Current price" value={value.entry} onChange={set('entry')} suffix="$" />
      <Field label="Stop loss" hint={`Default ${defaults.stop}`} value={value.stop} onChange={set('stop')} suffix="$" />
      <Field
        label="Take profit"
        hint={`Default ${defaults.tp} · ${tpRule === 'swing_high' ? 'swing high' : '0.618 projection'}`}
        value={value.tp}
        onChange={set('tp')}
        suffix="$"
      />
      {m.ok ? (
        <>
          <Row>
            <T kind="body" style={{ flex: 1 }}>If the stop hits</T>
            <T kind="body" tabular color={c.down} style={{ fontWeight: '600' }}>{eur(-m.lossEur)}</T>
            <T kind="footnote" tabular color={c.ink2} style={styles.side}>{pct(m.lossPct, 2)}</T>
          </Row>
          <Row>
            <T kind="body" style={{ flex: 1 }}>If the target hits</T>
            <T kind="body" tabular color={c.up} style={{ fontWeight: '600' }}>{eur(m.gainEur)}</T>
            <T kind="footnote" tabular color={c.ink2} style={styles.side}>{pct(m.gainPct, 2)}</T>
          </Row>
          <Row>
            <T kind="footnote" tabular color={c.ink2} style={{ flex: 1 }}>
              {fmt(m.shares, 2)} shares · {fmt(m.usd, 0)} $ · R:R {fmt(m.rr, 1)}
            </T>
          </Row>
        </>
      ) : (
        <Row>
          <T kind="footnote" color={c.down}>{m.error}</T>
        </Row>
      )}
      <Row>
        <T kind="body" style={{ flex: 1 }}>Show position on chart</T>
        <Switch value={showOnChart} onValueChange={onShowOnChart} trackColor={{ true: c.accent }} />
      </Row>
    </Section>
  );
}

const styles = StyleSheet.create({
  input: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.sm, paddingHorizontal: 10, minHeight: 40, minWidth: 128 },
  inputText: { flex: 1, textAlign: 'right', paddingVertical: 8 },
  side: { minWidth: 64, textAlign: 'right' },
});

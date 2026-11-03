// Trade calculator: the user sets amount (EUR), leverage, entry, stop and take profit; nothing here is a recommendation.
// Results include eToro's estimated costs (see lib/costs.ts), so the stop shows what the trade really costs.
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { eur, fmt, pct } from '@/lib/conditions';
import { LEVERAGES, type Costs } from '@/lib/costs';
import { nums, radius, type, useColors } from '@/lib/theme';

import { Row, Section, Segmented, T } from './ui';

export type TradeInput = { amount: string; entry: string; stop: string; tp: string; leverage: number; days: string };

export type TradeMath = {
  ok: boolean;
  error?: string;
  shares: number;
  usd: number;          // exposure in dollars (amount x leverage)
  lossEur: number;      // net: price move to the stop + every cost
  gainEur: number;      // net: price move to the target - every cost
  lossPct: number;      // net, % of the amount put in
  gainPct: number;
  rr: number;           // net reward / net risk
  moveLossEur: number;  // price move alone
  moveGainEur: number;
  openEur: number;      // commission or spread when opening
  closeStopEur: number; // commission or spread when closing at the stop
  closeTpEur: number;
  nightEur: number;     // overnight fee per night (0 without leverage)
  overnightEur: number; // nightEur x days held
  fxStopEur: number;    // EUR <-> USD conversion in and out
  fxTpEur: number;
  cashOpenEur: number;  // cash eToro needs to open: the amount plus the opening cost, which is charged on top
  cashEur: number;      // to keep in the account: also the nights held and the closing cost (at the target, the larger)
  beyondMargin: boolean; // the stop loses more than the amount: eToro closes the position first
};

const num = (s: string) => Number(String(s).replace(',', '.'));

/** eurusd = dollars per euro. Shares can be fractional. x1 is a real stock, x2 and up a CFD. */
export function tradeMath(t: TradeInput, eurusd: number | null, costs: Costs): TradeMath {
  const amount = num(t.amount), entry = num(t.entry), stop = num(t.stop), tp = num(t.tp);
  const days = t.days.trim() === '' ? 0 : num(t.days);
  const zero = {
    shares: 0, usd: 0, lossEur: 0, gainEur: 0, lossPct: 0, gainPct: 0, rr: 0, moveLossEur: 0, moveGainEur: 0,
    openEur: 0, closeStopEur: 0, closeTpEur: 0, nightEur: 0, overnightEur: 0, fxStopEur: 0, fxTpEur: 0,
    cashOpenEur: 0, cashEur: 0, beyondMargin: false,
  };
  if (!eurusd) return { ok: false, error: 'EUR/USD rate unavailable right now.', ...zero };
  if (![amount, entry, stop, tp].every((v) => Number.isFinite(v) && v > 0)) return { ok: false, error: 'Fill in every value.', ...zero };
  if (!(Number.isFinite(days) && days >= 0)) return { ok: false, error: 'Days held must be 0 or more.', ...zero };
  if (!(stop < entry && entry < tp)) return { ok: false, error: 'Stop must be below the entry and the take profit above it.', ...zero };
  const lev = t.leverage;
  const exposure = amount * lev;
  const usd = exposure * eurusd;
  const shares = usd / entry;
  const moveLossEur = (shares * (entry - stop)) / eurusd;
  const moveGainEur = (shares * (tp - entry)) / eurusd;
  // real stocks pay a flat commission per side; CFDs pay a spread on the trade value per side
  const side = (price: number) => (lev === 1 ? costs.commission : (costs.cfdSpread / 100) * shares * price) / eurusd;
  const openEur = side(entry), closeStopEur = side(stop), closeTpEur = side(tp);
  // financing on the whole exposure (as eToro's ticket shows); one weekday night counts three, so calendar days ~ nights
  const nightEur = lev === 1 ? 0 : ((costs.overnight / 100) * exposure) / 365;
  const overnightEur = nightEur * days;
  const fx = (back: number) => (costs.fx / 100) * (amount + Math.max(back, 0));
  const fxStopEur = fx(amount - moveLossEur), fxTpEur = fx(amount + moveGainEur);
  const lossEur = moveLossEur + openEur + closeStopEur + overnightEur + fxStopEur;
  const gainEur = moveGainEur - openEur - closeTpEur - overnightEur - fxTpEur;
  // eToro takes every fee from the available cash, not from the amount invested
  const cashOpenEur = amount + openEur;
  const cashEur = cashOpenEur + overnightEur + Math.max(closeStopEur, closeTpEur);
  return {
    ok: true, shares, usd, lossEur, gainEur,
    lossPct: (-lossEur / amount) * 100, gainPct: (gainEur / amount) * 100, rr: lossEur > 0 ? gainEur / lossEur : 0,
    moveLossEur, moveGainEur, openEur, closeStopEur, closeTpEur, nightEur, overnightEur, fxStopEur, fxTpEur,
    cashOpenEur, cashEur, beyondMargin: lev > 1 && moveLossEur >= amount,
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

export function TradeCalculator({ value, onChange, eurusd, costs, defaults, tpRule, showOnChart, onShowOnChart }: {
  value: TradeInput;
  onChange: (v: TradeInput) => void;
  eurusd: number | null;
  costs: Costs;
  defaults?: { stop: string; tp: string }; // absent when the ticker has no setup: levels are the user's own
  tpRule?: 'extension_0.618' | 'swing_high';
  showOnChart: boolean;
  onShowOnChart: (v: boolean) => void;
}) {
  const c = useColors();
  const m = tradeMath(value, eurusd, costs);
  const set = (k: 'amount' | 'entry' | 'stop' | 'tp' | 'days') => (v: string) => onChange({ ...value, [k]: v });
  const lev = value.leverage;
  const costsStop = m.openEur + m.closeStopEur + m.overnightEur + m.fxStopEur;
  const costsTp = m.openEur + m.closeTpEur + m.overnightEur + m.fxTpEur;
  const breakdown = [
    `${lev === 1 ? 'Commission' : 'Spread'} ${eur(m.openEur)} open · ${eur(m.closeStopEur)} close`,
    lev > 1 && `overnight ${eur(m.nightEur)}/night (weekend ${eur(m.nightEur * 3)}) · ${eur(m.overnightEur)} in ${fmt(num(value.days) || 0, 0)} d`,
    costs.fx > 0 && `FX ${eur(m.fxStopEur)}`,
  ].filter(Boolean).join(' · ');
  return (
    <Section title="Trade" aside={eurusd ? `1 € = ${fmt(eurusd, 4)} $` : undefined}>
      <Field label="Amount" hint={lev > 1 ? `Exposure ${eur(num(value.amount) * lev, 0)}` : undefined} value={value.amount} onChange={set('amount')} suffix="€" />
      <Row>
        <View style={{ flex: 1 }}>
          <T kind="body">Leverage</T>
          <T kind="footnote" color={c.ink2}>{lev === 1 ? 'Real stock' : 'CFD: spread and overnight fees'}</T>
        </View>
        <Segmented values={LEVERAGES.map((l) => `x${l}`)} index={Math.max(LEVERAGES.indexOf(lev), 0)} onChange={(i) => onChange({ ...value, leverage: LEVERAGES[i] })} style={{ width: 160 }} />
      </Row>
      {lev > 1 && <Field label="Days held" hint="Overnight fees, weekends included" value={value.days} onChange={set('days')} suffix="d" />}
      <Field label="Entry" hint="Current price" value={value.entry} onChange={set('entry')} suffix="$" />
      <Field label="Stop loss" hint={defaults ? `Default ${defaults.stop}` : 'Your own level'} value={value.stop} onChange={set('stop')} suffix="$" />
      <Field
        label="Take profit"
        hint={defaults ? `Default ${defaults.tp} · ${tpRule === 'swing_high' ? 'swing high' : '0.618 projection'}` : 'Your own level'}
        value={value.tp}
        onChange={set('tp')}
        suffix="$"
      />
      {m.ok ? (
        <>
          <Row>
            <View style={{ flex: 1 }}>
              <T kind="body">If the stop hits</T>
              <T kind="footnote" tabular color={c.ink2}>price {eur(-m.moveLossEur)} · costs {eur(-costsStop)}</T>
            </View>
            <T kind="body" tabular color={c.down} style={{ fontWeight: '600' }}>{eur(-m.lossEur)}</T>
            <T kind="footnote" tabular color={c.ink2} style={styles.side}>{pct(m.lossPct, 2)}</T>
          </Row>
          <Row>
            <View style={{ flex: 1 }}>
              <T kind="body">If the target hits</T>
              <T kind="footnote" tabular color={c.ink2}>price {eur(m.moveGainEur)} · costs {eur(-costsTp)}</T>
            </View>
            <T kind="body" tabular color={c.up} style={{ fontWeight: '600' }}>{eur(m.gainEur)}</T>
            <T kind="footnote" tabular color={c.ink2} style={styles.side}>{pct(m.gainPct, 2)}</T>
          </Row>
          <Row>
            <T kind="footnote" tabular color={c.ink2} style={{ flex: 1 }}>
              {breakdown}{'\n'}{fmt(m.shares, 2)} shares · {fmt(m.usd, 0)} $ · R:R {fmt(m.rr, 1)} after costs · % of the amount
            </T>
          </Row>
          <Row>
            <View style={{ flex: 1 }}>
              <T kind="body">Cash needed in eToro</T>
              <T kind="footnote" tabular color={c.ink2}>
                {eur(m.cashOpenEur)} to open · +{eur(m.cashEur - m.cashOpenEur)} for {lev > 1 ? `${fmt(num(value.days) || 0, 0)} nights and ` : ''}closing
              </T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T kind="body" tabular style={{ fontWeight: '600' }}>{eur(m.cashEur)}</T>
              {eurusd ? <T kind="footnote" tabular color={c.ink2}>= {fmt(m.cashEur * eurusd)} $ in eToro</T> : null}
            </View>
          </Row>
          {m.beyondMargin && (
            <Row>
              <T kind="footnote" color={c.down}>At x{lev} the stop loses more than the amount: eToro would close the position before it gets there.</T>
            </Row>
          )}
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

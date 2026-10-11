// One source for the condition strip, the filters and the detail page (same rules as the API).
import { CONDS, type Cond, type Setup, type TF } from './api';

export const TOL: Record<TF, number> = { '1h': 1.2, '4h': 2.0, '1d': 2.5 };
export const LABEL: Record<Cond, string> = { fib: 'FIB', poc: 'POC', rsi: 'RSI', ewo: 'EWO', gap: 'GAP' };
export const HELP: Record<Cond, string> = {
  fib: 'Price near the 0.618 / 0.786',
  poc: 'Volume POC above level and price',
  rsi: 'RSI at or near 30',
  ewo: 'Oscillator below zero',
  gap: 'No unfilled gap since the swing low',
};

export type Rule = 'count' | 'require' | 'ignore';
export type Filters = { min: number; tfs: TF[]; rule: Record<Cond, Rule>; sort: SortKey };
export type SortKey = 'score' | 'dist' | 'ticker';
export const DEFAULT_FILTERS: Filters = {
  min: 4,
  tfs: ['1h', '4h', '1d'],
  rule: { fib: 'count', poc: 'count', rsi: 'count', ewo: 'count', gap: 'count' },
  sort: 'score',
};

const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const fmt = (v: number, d = 2) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (v: number, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), d)}%`;
export const sgn = (v: number, d = 2) => `${v < 0 ? '−' : ''}${fmt(Math.abs(v), d)}`;
export const eur = (v: number, d = 2) => `${v < 0 ? '−' : ''}${fmt(Math.abs(v), d)} €`;

export type Gauge = { met: boolean; x: number; tick: number | null; value: string; long: string; rule: string; extra: string };

// Each gauge is a scale whose tick is the rule's threshold: a bar that passes the tick meets the condition.
//   FIB: distance to the level; 0 at the right end, ±tol at the tick (middle)
//   POC: POC above price and level; 0 at the tick (quarter)
//   RSI: 60 at the left end, 35 at the tick, 20 at the right end (uses the 5-bar low when it touched 30)
//   EWO: 0 at the tick (quarter), more negative further right
//   GAP: no scale, full when there is no open gap
export function gauges(s: Setup): Record<Cond, Gauge> {
  const tol = TOL[s.tf];
  const gap = ((s.poc - Math.max(s.nivel, s.precio)) / s.precio) * 100;
  const rsiEff = s.rsi_min <= 30 ? Math.min(s.rsi, s.rsi_min) : s.rsi;
  const open = s.gaps?.length ?? 0;
  return {
    fib: {
      met: s.c_fib, x: clamp(1 - Math.abs(s.dist_pct) / (2 * tol)), tick: 0.5, value: pct(s.dist_pct), long: pct(s.dist_pct, 2),
      rule: `Price within ±${tol}% of the ${s.fib} (${fmt(s.nivel)})`, extra: `level ${fmt(s.nivel)}`,
    },
    poc: {
      met: s.c_poc, x: clamp(0.25 + (gap / (4 * tol)) * 0.75), tick: 0.25, value: pct(gap), long: fmt(s.poc),
      rule: 'Swing point of control above the fib level and the price', extra: `${pct(gap)} vs price`,
    },
    rsi: {
      met: s.c_rsi, x: clamp((60 - rsiEff) / 40), tick: 0.625, value: fmt(s.rsi, 1), long: fmt(s.rsi, 1),
      rule: 'RSI ≤ 35 now, or touched 30 in the last 5 bars', extra: `low ${fmt(s.rsi_min, 1)}`,
    },
    ewo: {
      met: s.c_ewo, x: clamp(0.25 + (-s.ewo / s.precio / 0.03) * 0.75), tick: 0.25, value: sgn(s.ewo), long: sgn(s.ewo, 3),
      rule: 'Elliott Wave Oscillator below zero', extra: '5/35 SMA',
    },
    gap: {
      met: s.c_gap, x: open ? 0.15 : 1, tick: null, value: open ? `${open} open` : 'None', long: open ? `${open} open` : 'None',
      rule: s.tf === '1d' ? 'No unfilled daily gap since the swing low' : 'No unfilled session-open gap since the swing low',
      extra: open ? s.gaps.map((g) => `${fmt(g.bottom)}–${fmt(g.top)}`).join(' · ') : 'all filled',
    },
  };
}

export function passes(s: Setup, f: Filters): boolean {
  if (!f.tfs.includes(s.tf)) return false;
  if (CONDS.some((c) => f.rule[c] === 'require' && !s[`c_${c}`])) return false;
  const active = CONDS.filter((c) => f.rule[c] !== 'ignore');
  const met = active.filter((c) => s[`c_${c}`]).length;
  return met >= Math.min(f.min, active.length);
}

const TF_ORDER: Record<TF, number> = { '1h': 0, '4h': 1, '1d': 2 };
export const SORTS: Record<SortKey, { label: string; fn: (a: Setup, b: Setup) => number }> = {
  score: { label: 'Score', fn: (a, b) => b.cumple - a.cumple || b.score - a.score },
  dist: { label: 'Closest to fib', fn: (a, b) => Math.abs(a.dist_pct) - Math.abs(b.dist_pct) },
  ticker: { label: 'Ticker', fn: (a, b) => a.ticker.localeCompare(b.ticker) || TF_ORDER[a.tf] - TF_ORDER[b.tf] },
};

export const setupKey = (s: { ticker: string; tf: TF }) => `${s.ticker}·${s.tf}`;

// Client for the SyncTrade FastAPI server (reachable over Tailscale).
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { load, save } from './storage';

export type TF = '1h' | '4h' | '1d';
export const TIMEFRAMES: TF[] = ['1h', '4h', '1d'];
export type Cond = 'fib' | 'poc' | 'rsi' | 'ewo' | 'gap';
export const CONDS: Cond[] = ['fib', 'poc', 'rsi', 'ewo', 'gap'];

export type Gap = { date: string; from: string; bottom: number; top: number; time?: string | number };
export type TradeDefaults = {
  entry: number;
  stop: number;
  stop_level: number;
  tp: number;
  tp_rule: 'extension_0.618' | 'swing_high';
  retrace_low: number;
};
export type Setup = {
  ticker: string;
  tf: TF;
  as_of: string;
  fib: number;
  nivel: number;
  precio: number;
  dist_pct: number;
  tol_above?: number; // fib tolerance (%) above / below the level used for this result; absent in older saved results
  tol_below?: number;
  poc: number;
  rsi: number;
  rsi_min: number;
  ewo: number;
  gaps: Gap[];
  swing_low: number;
  swing_high: number;
  swing_low_at: string;
  swing_high_at: string;
  levels: Record<string, number>;
  c_fib: boolean;
  c_poc: boolean;
  c_rsi: boolean;
  c_ewo: boolean;
  c_gap: boolean;
  cumple: number;
  score: number;
  trade: TradeDefaults;
  premarket?: number;
  favorite?: boolean;
  tv_url?: string;
  updated_at?: string;
};
export type ChartPoint = { time: string | number; value: number };
export type Candle = { time: string | number; open: number; high: number; low: number; close: number };
export type Chart = {
  tf: TF;
  result: Omit<Setup, 'ticker' | 'tf'> | null;
  candles: Candle[];
  rsi: ChartPoint[];
  ewo: ChartPoint[];
  swing: { low: { time: string | number; price: number }; high: { time: string | number; price: number } } | null;
  gaps: Gap[];
};
export type WatchList = { id: number; name: string; tickers: string[] };
export type Signal = { key: string; ticker: string; tf: TF; first_seen: string; max_cumple: number; alerted_cumple: number; active: boolean };
export type TickerDetail = {
  ticker: string;
  results: Record<TF, Setup | null>;
  charts: Record<TF, Chart>;
  hist_poc: number | null;
  price_now: number | null;
  eurusd: number | null;
  favorite: boolean;
  tv_symbol: string;
  tv_urls: Record<TF, string>;
  signals: Signal[];
};
export type Scan = {
  id: number;
  started_at: string;
  finished_at: string | null;
  universe: string;
  tfs: string;
  trigger: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  stage: string | null;
  n_tickers: number;
  n_results: number;
  n_new_signals: number;
  error: string | null;
};
export type Status = {
  now_ny: string;
  market_open: boolean;
  busy: boolean;
  last_scan: Scan | null;
  push_devices: number;
  scheduler: { id: string; name: string; next: string | null }[];
};
/** An eToro position, open or closed. Money is in the eToro account currency (USD). */
export type Position = {
  id: number;
  ticker: string;         // Yahoo ticker (eToro suffixes like .RTH removed)
  symbol: string;         // as eToro shows it
  name: string | null;
  is_buy: boolean;
  leverage: number;
  units: number;
  open_rate: number;
  opened_at: string;
  amount: number | null;  // invested (the margin when leveraged)
  pnl: number | null;     // eToro's own P&L, fees included
  pnl_pct: number | null;
  fees: number | null;
  // open only
  cfd?: boolean;
  price?: number | null;
  stop?: number | null;
  tp?: number | null;
  at_stop?: number | null; // P&L if the stop hits
  at_tp?: number | null;
  // closed only
  close_rate?: number | null;
  closed_at?: string | null;
};
export type Portfolio = {
  positions: Position[];
  currency: string | null;
  eurusd: number | null;
  fetched_at: number;
  totals: { invested: number | null; pnl: number | null; value: number | null; at_stop: number | null; credit: number | null };
};
export type TradeHistory = {
  positions: Position[];
  since: string;
  eurusd: number | null;
  fetched_at: number;
  totals: { pnl: number | null; wins: number; losses: number };
};
export type PriceAlert = {
  id: number;
  ticker: string;
  price: number;
  direction: 'above' | 'below';
  note: string | null;
  created_at: string;
  triggered_at: string | null;
  triggered_price: number | null;
};
export type Universe = { id: string; label: string; count: number; updated_at: string | null };
// Shown while the server list loads or if it can't be fetched, so a scan can always be started.
export const FALLBACK_UNIVERSES: Universe[] = [
  { id: 'nasdaq100', label: 'Nasdaq-100', count: 0, updated_at: null },
  { id: 'nasdaq', label: 'NASDAQ (liquid)', count: 0, updated_at: null },
  { id: 'sp500', label: 'S&P 500', count: 0, updated_at: null },
  { id: 'favorites', label: 'Saved', count: 0, updated_at: null },
];
export type Params = {
  niveles: number[];
  rsi_cerca: number;
  rsi_banda: number;
  rsi_velas: number;
  ewo: 'negativo' | 'bajando';
  gap_min_pct: number;
  stop_buffer: number;
  tol_above_1h: number;
  tol_above_4h: number;
  tol_above_1d: number;
  tol_below_1h: number;
  tol_below_4h: number;
  tol_below_1d: number;
};

// on the web the app is served by the server itself; in the iPhone app the user sets the Tailscale address
const defaultUrl = Platform.OS === 'web' && typeof location !== 'undefined'
  ? location.origin
  : ((Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? '');
let baseUrl: string = load('serverUrl', defaultUrl);

export const getServerUrl = () => baseUrl;
export function setServerUrl(url: string) {
  baseUrl = url.trim().replace(/\/+$/, '');
  save('serverUrl', baseUrl);
}

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl) throw new ApiError('No server set. Add your server address in Settings.');
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that Tailscale is on and the address is right.');
  }
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new ApiError(String(detail), res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  status: () => call<Status>('/api/status'),
  universes: () => call<Universe[]>('/api/universes'),
  results: (universe: string) =>
    call<{ count: number; results: Setup[] }>(`/api/results?universe=${encodeURIComponent(universe)}&min_cond=0`),
  ticker: (symbol: string) => call<TickerDetail>(`/api/ticker/${encodeURIComponent(symbol)}`),
  favorites: () => call<string[]>('/api/favorites'),
  setFavorite: (symbol: string, on: boolean) =>
    call<void>(`/api/favorites/${encodeURIComponent(symbol)}`, { method: on ? 'PUT' : 'DELETE' }),
  quotes: (tickers: string[]) => call<Record<string, { price: number; chg_pct: number | null }>>(`/api/quotes?tickers=${encodeURIComponent(tickers.join(','))}`),
  names: (tickers: string[]) => call<Record<string, string>>(`/api/names?tickers=${encodeURIComponent(tickers.join(','))}`),
  search: (q: string) => call<string[]>(`/api/search?q=${encodeURIComponent(q)}`),
  lists: () => call<WatchList[]>('/api/lists'),
  createList: (name: string) => call<WatchList>('/api/lists', { method: 'POST', body: JSON.stringify({ name }) }),
  renameList: (id: number, name: string) => call<void>(`/api/lists/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteList: (id: number) => call<void>(`/api/lists/${id}`, { method: 'DELETE' }),
  setListTicker: (id: number, symbol: string, on: boolean) =>
    call<void>(`/api/lists/${id}/tickers/${encodeURIComponent(symbol)}`, { method: on ? 'PUT' : 'DELETE' }),
  portfolio: (fresh = false) => call<Portfolio>(`/api/positions?status=open${fresh ? '&fresh=1' : ''}`),
  history: (fresh = false) => call<TradeHistory>(`/api/positions?status=closed${fresh ? '&fresh=1' : ''}`),
  alerts: () => call<PriceAlert[]>('/api/alerts'),
  createAlert: (a: { ticker: string; price: number; direction: 'above' | 'below'; note?: string }) =>
    call<PriceAlert>('/api/alerts', { method: 'POST', body: JSON.stringify(a) }),
  deleteAlert: (id: number) => call<void>(`/api/alerts/${id}`, { method: 'DELETE' }),
  startScan: (body: { universe?: string; tickers?: string[]; tfs: TF[] }) =>
    call<Scan>('/api/scans', { method: 'POST', body: JSON.stringify(body) }),
  scan: (id: number) => call<Scan>(`/api/scans/${id}`),
  scans: (limit = 6) => call<Scan[]>(`/api/scans?limit=${limit}`),
  settings: () => call<{ params: Params; push_devices: number }>('/api/settings'),
  saveSettings: (p: Params) => call<{ params: Params }>('/api/settings', { method: 'PUT', body: JSON.stringify(p) }),
  pushRegister: (token: string, platform: string) =>
    call<void>('/api/push/register', { method: 'POST', body: JSON.stringify({ token, platform }) }),
  pushUnregister: (token: string) =>
    call<void>('/api/push/unregister', { method: 'POST', body: JSON.stringify({ token }) }),
  pushTest: () => call<{ ok: boolean }>('/api/push/test', { method: 'POST' }),
};

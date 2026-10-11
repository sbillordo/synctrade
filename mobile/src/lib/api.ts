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

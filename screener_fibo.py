#!/usr/bin/env python3
"""
Screener técnico: Fibonacci + POC de volumen + RSI + EWO
--------------------------------------------------------
Condiciones (por temporalidad 1h, 4h, 1d):
  1. FIB : el precio está cerca de un retroceso de Fibonacci (por defecto 0.618 y 0.786)
           del último impulso alcista (mínimo -> máximo).
  2. POC : el Point of Control del perfil de volumen (desde el mínimo del impulso hasta hoy)
           está POR ENCIMA del nivel de Fibonacci que se está testeando y del precio actual.
  3. RSI : RSI(14) está cerca de 30 (<= rsi_cerca) o ha tocado 30 en las últimas N velas.
  4. EWO : Elliott Wave Oscillator (SMA5 - SMA35 del precio medio) en rojo
           (por defecto: negativo; opcional: descendiendo).

Uso:
  pip install yfinance pandas numpy requests lxml
  python screener_fibo.py --tickers AAPL MSFT NVDA AMD
  python screener_fibo.py --file mis_tickers.txt
  python screener_fibo.py --sp500 --tf 4h 1d
  python screener_fibo.py --sp500 --min-cond 3      # muestra también las que cumplen 3 de 4

Herramienta de cribado técnico, no es una recomendación de inversión.
"""
import argparse
import io
import sys
from datetime import datetime

import numpy as np
import pandas as pd
import yfinance as yf

# ------------------------------------------------------------------ configuración
FIB_RATIOS = [0.382, 0.5, 0.618, 0.786]

# lookback  : nº de velas donde buscar el impulso (mínimo -> máximo)
# min_move  : tamaño mínimo del impulso (0.10 = 10 %) para considerarlo válido
# tol       : distancia máxima al nivel de Fibonacci (0.015 = 1,5 %)
TF_CONFIG = {
    "1h": dict(source="60m", lookback=300, min_move=0.05, tol=0.012),
    "4h": dict(source="60m", lookback=200, min_move=0.08, tol=0.020),
    "1d": dict(source="1d", lookback=150, min_move=0.15, tol=0.025),
}
DOWNLOAD = {"60m": "730d", "1d": "3y"}   # yfinance permite 1h hasta ~730 días
VP_BINS = 30                             # nº de filas del perfil de volumen
CHUNK = 50                               # tickers por descarga


# ------------------------------------------------------------------ indicadores
def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    """RSI de Wilder (igual que TradingView)."""
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn)


def ewo(df: pd.DataFrame, fast: int = 5, slow: int = 35) -> pd.Series:
    """Elliott Wave Oscillator: SMA(5) - SMA(35) del precio medio (H+L)/2."""
    mid = (df["High"] + df["Low"]) / 2
    return mid.rolling(fast).mean() - mid.rolling(slow).mean()


def find_swing(df: pd.DataFrame, lookback: int, min_move: float):
    """Último impulso alcista: máximo de la ventana y mínimo previo a ese máximo."""
    w = df.iloc[-lookback:]
    hi_idx = w["High"].idxmax()
    hi = w.at[hi_idx, "High"]
    before = w.loc[:hi_idx]
    if len(before) < 5:
        return None
    lo_idx = before["Low"].idxmin()
    lo = before.at[lo_idx, "Low"]
    after = w.loc[hi_idx:]
    if len(after) < 4:                      # aún no ha empezado a retroceder
        return None
    if (hi - lo) / lo < min_move:           # impulso demasiado pequeño
        return None
    if after["Low"].iloc[1:].min() < lo:    # ha perdido el mínimo: fibo invalidado
        return None
    return lo, hi, lo_idx, hi_idx


def poc_price(df: pd.DataFrame, lo: float, hi: float, bins: int = VP_BINS) -> float:
    """POC: reparte el volumen de cada vela de forma uniforme entre su mínimo y su máximo."""
    edges = np.linspace(lo, hi, bins + 1)
    e_lo, e_hi = edges[:-1][None, :], edges[1:][None, :]
    h = df["High"].to_numpy()[:, None]
    l = df["Low"].to_numpy()[:, None]
    v = df["Volume"].to_numpy()[:, None]
    rng = h - l
    overlap = np.clip(np.minimum(h, e_hi) - np.maximum(l, e_lo), 0, None)
    share = np.where(rng > 0, overlap / np.where(rng > 0, rng, 1), 0.0)
    # velas sin rango (h == l): todo el volumen a su fila
    flat = (rng[:, 0] == 0)
    if flat.any():
        idx = np.clip(np.searchsorted(edges, l[flat, 0]) - 1, 0, bins - 1)
        share[flat, :] = 0
        share[np.where(flat)[0], idx] = 1
    profile = (share * v).sum(axis=0)
    k = int(profile.argmax())
    return float((edges[k] + edges[k + 1]) / 2)


# ------------------------------------------------------------------ evaluación
def evaluate(df: pd.DataFrame, cfg: dict, args) -> dict | None:
    df = df.dropna(subset=["Open", "High", "Low", "Close"])
    df = df[df["Volume"].fillna(0) >= 0]
    if len(df) < max(60, min(cfg["lookback"], 100)):
        return None

    r, e = rsi(df["Close"]), ewo(df)
    sw = find_swing(df, cfg["lookback"], cfg["min_move"])
    if sw is None or pd.isna(r.iloc[-1]) or pd.isna(e.iloc[-1]):
        return None
    lo, hi, lo_idx, hi_idx = sw
    lo, hi = float(lo), float(hi)
    last = float(df["Close"].iloc[-1])

    levels = {f: hi - f * (hi - lo) for f in FIB_RATIOS}
    target = min(args.niveles, key=lambda f: abs(last - levels[f]))
    lvl = levels[target]
    dist = (last - lvl) / lvl

    poc = poc_price(df.loc[lo_idx:], lo, hi)
    rsi_last, rsi_min = float(r.iloc[-1]), float(r.iloc[-args.rsi_velas:].min())

    c_fib = abs(dist) <= cfg["tol"]
    c_poc = poc > lvl and poc > last
    c_rsi = rsi_last <= args.rsi_cerca or rsi_min <= args.rsi_banda
    c_ewo = e.iloc[-1] < 0 if args.ewo == "negativo" else e.iloc[-1] < e.iloc[-2]

    return {
        "fib": target, "nivel": round(lvl, 2), "precio": round(last, 2),
        "dist_%": round(dist * 100, 2), "poc": round(poc, 2),
        "rsi": round(rsi_last, 1), "rsi_min": round(rsi_min, 1),
        "ewo": round(float(e.iloc[-1]), 3),
        "swing_low": round(lo, 2), "swing_high": round(hi, 2),
        "FIB": c_fib, "POC": c_poc, "RSI": c_rsi, "EWO": bool(c_ewo),
        "cumple": int(c_fib) + int(c_poc) + int(c_rsi) + int(bool(c_ewo)),
    }


# ------------------------------------------------------------------ datos
def resample_4h(df: pd.DataFrame) -> pd.DataFrame:
    # Alinea las velas de 4h con la apertura de sesión USA (9:30), como TradingView
    agg = {"Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum"}
    return df.resample("4h", origin="start_day", offset="9h30min").agg(agg).dropna()


def download(tickers: list[str], interval: str) -> dict[str, pd.DataFrame]:
    out = {}
    for i in range(0, len(tickers), CHUNK):
        chunk = tickers[i:i + CHUNK]
        print(f"  descargando {interval}: {i + len(chunk)}/{len(tickers)}", file=sys.stderr)
        data = yf.download(chunk, period=DOWNLOAD[interval], interval=interval,
                           group_by="ticker", auto_adjust=True, threads=True, progress=False)
        for t in chunk:
            try:
                d = data[t] if isinstance(data.columns, pd.MultiIndex) else data
                d = d.dropna(how="all")
                if not d.empty:
                    out[t] = d
            except KeyError:
                pass
    return out


def sp500() -> list[str]:
    import requests
    html = requests.get("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
                        headers={"User-Agent": "Mozilla/5.0"}, timeout=20).text
    table = pd.read_html(io.StringIO(html))[0]
    return [s.replace(".", "-") for s in table["Symbol"]]


# ------------------------------------------------------------------ main
def main():
    p = argparse.ArgumentParser(description="Screener Fibonacci + POC + RSI + EWO")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--tickers", nargs="+")
    g.add_argument("--file", help="fichero con un ticker por línea")
    g.add_argument("--sp500", action="store_true")
    p.add_argument("--tf", nargs="+", default=["1h", "4h", "1d"], choices=TF_CONFIG)
    p.add_argument("--niveles", nargs="+", type=float, default=[0.618, 0.786])
    p.add_argument("--rsi-cerca", type=float, default=35, help="RSI <= este valor = 'por tocar'")
    p.add_argument("--rsi-banda", type=float, default=30)
    p.add_argument("--rsi-velas", type=int, default=5, help="velas para 'ha tocado 30'")
    p.add_argument("--ewo", choices=["negativo", "bajando"], default="negativo")
    p.add_argument("--min-cond", type=int, default=4, help="condiciones mínimas (1-4)")
    args = p.parse_args()

    if args.sp500:
        tickers = sp500()
    elif args.file:
        tickers = [l.strip().upper() for l in open(args.file) if l.strip() and not l.startswith("#")]
    else:
        tickers = [t.upper() for t in args.tickers]

    sources = {TF_CONFIG[tf]["source"] for tf in args.tf}
    data = {src: download(tickers, src) for src in sources}

    rows = []
    for tf in args.tf:
        cfg = TF_CONFIG[tf]
        for t, df in data[cfg["source"]].items():
            if tf == "4h":
                df = resample_4h(df)
            try:
                res = evaluate(df, cfg, args)
            except Exception as ex:  # un ticker con datos raros no para el escaneo
                print(f"  {t} {tf}: error {ex}", file=sys.stderr)
                continue
            if res and res["cumple"] >= args.min_cond:
                rows.append({"ticker": t, "tf": tf, **res})

    if not rows:
        print("Ninguna acción cumple las condiciones.")
        return
    out = pd.DataFrame(rows).sort_values(["cumple", "tf", "dist_%"],
                                         ascending=[False, True, True], key=lambda s: s.abs() if s.name == "dist_%" else s)
    pd.set_option("display.width", 200)
    pd.set_option("display.max_rows", 500)
    print(out.to_string(index=False))
    fname = f"screener_{datetime.now():%Y%m%d_%H%M}.csv"
    out.to_csv(fname, index=False)
    print(f"\nGuardado en {fname}")


if __name__ == "__main__":
    main()
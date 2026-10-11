"""Indicadores técnicos (mismas fórmulas que el screener original)."""
import numpy as np
import pandas as pd

from ..config import VP_BINS


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
    return float(lo), float(hi), lo_idx, hi_idx


def volume_profile(df: pd.DataFrame, lo: float, hi: float, bins: int = VP_BINS, edges: np.ndarray | None = None):
    """Reparte el volumen de cada vela de forma uniforme entre su mínimo y su máximo.

    Devuelve (bordes de las filas, volumen por fila). Con 'edges' se usan esos bordes en lugar de 'bins' iguales.
    """
    if edges is None:
        edges = np.linspace(lo, hi, bins + 1)
    bins = len(edges) - 1
    e_lo, e_hi = edges[:-1][None, :], edges[1:][None, :]
    h = df["High"].to_numpy()[:, None]
    l = df["Low"].to_numpy()[:, None]
    v = df["Volume"].fillna(0).to_numpy()[:, None]
    rng = h - l
    overlap = np.clip(np.minimum(h, e_hi) - np.maximum(l, e_lo), 0, None)
    share = np.where(rng > 0, overlap / np.where(rng > 0, rng, 1), 0.0)
    # velas sin rango (h == l): todo el volumen a su fila
    flat = (rng[:, 0] == 0)
    if flat.any():
        idx = np.clip(np.searchsorted(edges, l[flat, 0]) - 1, 0, bins - 1)
        share[flat, :] = 0
        share[np.where(flat)[0], idx] = 1
    return edges, (share * v).sum(axis=0)


def poc_price(df: pd.DataFrame, lo: float, hi: float, bins: int = VP_BINS) -> float:
    """POC: centro de la fila con más volumen del perfil."""
    edges, profile = volume_profile(df, lo, hi, bins)
    k = int(profile.argmax())
    return float((edges[k] + edges[k + 1]) / 2)


def historical_poc(daily: pd.DataFrame, step: float = 0.01) -> float | None:
    """POC de todo el histórico diario. Filas de anchura proporcional (1 %) para que sirva
    igual a una acción que ha ido de 1 $ a 200 $ que a una lateral."""
    d = daily.dropna(subset=["High", "Low"])
    d = d[d["Low"] > 0]
    if len(d) < 20:
        return None
    lo, hi = float(d["Low"].min()), float(d["High"].max())
    n = max(10, int(np.ceil(np.log(hi / lo) / np.log(1 + step))))
    edges, profile = volume_profile(d, lo, hi, edges=np.geomspace(lo, hi, n + 1))
    k = int(profile.argmax())
    return float(np.sqrt(edges[k] * edges[k + 1]))


def unfilled_gaps(bars: pd.DataFrame, since: pd.Timestamp, session_open_only: bool = False,
                  min_pct: float = 0.0) -> list[dict]:
    """Huecos alcistas abiertos desde 'since' (el swing low), en las velas del propio gráfico.

    Hay hueco entre la vela i-1 y la i cuando el mínimo de i queda por encima del máximo de i-1.
    En intradía (session_open_only) solo cuentan los de apertura: la primera vela de un día frente a la
    última del anterior. Está tapado cuando un mínimo posterior vuelve al máximo de i-1; si solo entra
    en parte, sigue abierto con su parte de arriba recortada.
    """
    d = bars[bars.index >= since]
    lows, highs = d["Low"].to_numpy(), d["High"].to_numpy()
    days = d.index.normalize()
    gaps = []
    for i in range(1, len(d)):
        if session_open_only and days[i] == days[i - 1]:
            continue
        bottom, top = highs[i - 1], lows[i]
        if top <= bottom * (1 + min_pct / 100):
            continue
        later = lows[i + 1:].min() if i + 1 < len(d) else np.inf
        if later <= bottom:
            continue                       # tapado del todo
        gaps.append({"date": d.index[i].strftime("%Y-%m-%d"), "from": d.index[i - 1].strftime("%Y-%m-%d"),
                     "bottom": round(float(bottom), 2), "top": round(float(min(top, later)), 2)})
    return gaps

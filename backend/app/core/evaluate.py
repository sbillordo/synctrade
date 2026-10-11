"""Evaluación de las 5 condiciones del setup, score, niveles por defecto del trade y datos para el gráfico."""
from datetime import timedelta

import numpy as np
import pandas as pd

from ..config import FIB_RATIOS, MARKET_TZ, TF_CONFIG, Params
from ..market import drop_incomplete
from .indicators import ewo, find_swing, historical_poc, poc_price, rsi, unfilled_gaps, volume_profile

CONDITIONS = ["fib", "poc", "rsi", "ewo", "gap"]
STOP_LEVELS = [0.618, 0.786, 1.0]      # niveles donde puede ir el stop por defecto (1.0 = swing low)
TP_EXTENSION = 0.618                   # TP de un retroceso al 0.618: proyección 0.618 desde el mínimo del retroceso
CHART_BARS = {"1h": 350, "4h": 300, "1d": 300}
OHLC = ["Open", "High", "Low", "Close"]


# ------------------------------------------------------------------ preparación
def resample_4h(df: pd.DataFrame) -> pd.DataFrame:
    # Alinea las velas de 4h con la apertura de sesión USA (9:30), como TradingView
    agg = {"Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum"}
    return df.resample("4h", origin="start_day", offset="9h30min").agg(agg).dropna(subset=OHLC)


def prepare(raw: pd.DataFrame, tf: str, now: pd.Timestamp | None = None) -> pd.DataFrame:
    """Limpia los datos descargados y deja solo velas cerradas de la temporalidad pedida."""
    df = raw.dropna(subset=OHLC)
    df = df[df["Volume"].fillna(0) >= 0]
    if df.index.tz is None:
        df = df.tz_localize(MARKET_TZ)
    else:
        df = df.tz_convert(MARKET_TZ)
    if tf == "1d":
        return drop_incomplete(df, None, now)
    df = drop_incomplete(df, timedelta(hours=1), now)
    if tf == "4h":
        df = drop_incomplete(resample_4h(df), timedelta(hours=4), now)
    return df


# ------------------------------------------------------------------ evaluación
def _clip01(x: float) -> float:
    return float(np.clip(x, 0.0, 1.0))


def trade_defaults(fib: float, lo: float, hi: float, retrace_low: float, entry: float, params: Params) -> dict:
    """Niveles por defecto que el usuario puede cambiar en la app (no es una recomendación).

    Stop: pegado por debajo del nivel fibo más alto que quede por debajo del precio
          (normalmente el nivel testeado; si el precio ya lo perdió, el siguiente).
    TP:   retroceso al 0.618 -> proyección 0.618 del impulso desde el mínimo del retroceso
          (Trend-Based Fib Extension de TradingView); retroceso al 0.786 -> swing high.
    """
    rng = hi - lo
    buffer = params.stop_buffer / 100
    stop_level = next((r for r in STOP_LEVELS if (hi - r * rng) * (1 - buffer) < entry), 1.0)
    stop = (hi - stop_level * rng) * (1 - buffer)
    if fib >= 0.786:
        tp, tp_rule = hi, "swing_high"
    else:
        tp, tp_rule = retrace_low + TP_EXTENSION * rng, "extension_0.618"
    return {
        "entry": round(entry, 2),
        "stop": round(stop, 2),
        "stop_level": stop_level,
        "tp": round(tp, 2),
        "tp_rule": tp_rule,
        "retrace_low": round(retrace_low, 2),
    }


def evaluate(df: pd.DataFrame, tf: str, params: Params) -> dict | None:
    """Evalúa un DataFrame ya preparado (velas cerradas). None si no hay impulso válido."""
    cfg = TF_CONFIG[tf]
    if len(df) < max(60, min(cfg["lookback"], 100)):
        return None

    r, e = rsi(df["Close"]), ewo(df)
    sw = find_swing(df, cfg["lookback"], cfg["min_move"])
    if sw is None or pd.isna(r.iloc[-1]) or pd.isna(e.iloc[-1]):
        return None
    lo, hi, lo_idx, hi_idx = sw
    last = float(df["Close"].iloc[-1])
    retrace_low = float(df.loc[hi_idx:, "Low"].iloc[1:].min())

    levels = {f: hi - f * (hi - lo) for f in FIB_RATIOS}
    target = min(params.niveles, key=lambda f: abs(last - (hi - f * (hi - lo))))
    lvl = hi - target * (hi - lo)
    dist = (last - lvl) / lvl

    poc = poc_price(df.loc[lo_idx:], lo, hi)
    rsi_last = float(r.iloc[-1])
    rsi_min = float(r.iloc[-params.rsi_velas:].min())
    ewo_last, ewo_prev = float(e.iloc[-1]), float(e.iloc[-2])

    # huecos abiertos desde el swing low: entre días en 1d, de apertura de sesión en 1h/4h
    gaps = unfilled_gaps(df, lo_idx, session_open_only=tf != "1d", min_pct=params.gap_min_pct)

    met = {
        "fib": abs(dist) <= cfg["tol"],
        "poc": poc > lvl and poc > last,
        "rsi": rsi_last <= params.rsi_cerca or rsi_min <= params.rsi_banda,
        "ewo": ewo_last < 0 if params.ewo == "negativo" else ewo_last < ewo_prev,
        "gap": not gaps,
    }
    # calidad continua 0..1 de cada condición (para ordenar dentro del mismo nº de condiciones)
    quality = {
        "fib": _clip01(1 - abs(dist) / cfg["tol"]),
        "poc": _clip01((poc - max(lvl, last)) / last / (3 * cfg["tol"])),
        "rsi": _clip01((params.rsi_cerca + 10 - rsi_min) / 30),
        "ewo": _clip01(-ewo_last / (0.03 * last)),
        "gap": 1.0 if not gaps else 0.0,
    }
    weight = 100 / len(CONDITIONS)
    score = sum(weight * (0.5 * met[c] + 0.5 * quality[c]) for c in CONDITIONS)

    return {
        "as_of": df.index[-1].isoformat(),
        "fib": target,
        "nivel": round(lvl, 2),
        "precio": round(last, 2),
        "dist_pct": round(dist * 100, 2),
        "poc": round(poc, 2),
        "rsi": round(rsi_last, 1),
        "rsi_min": round(rsi_min, 1),
        "ewo": round(ewo_last, 3),
        "gaps": gaps,
        "swing_low": round(lo, 2),
        "swing_high": round(hi, 2),
        "swing_low_at": lo_idx.isoformat(),
        "swing_high_at": hi_idx.isoformat(),
        "levels": {str(k): round(v, 2) for k, v in levels.items()},
        **{f"c_{c}": bool(met[c]) for c in CONDITIONS},
        "cumple": sum(bool(v) for v in met.values()),
        "score": round(score, 1),
        "trade": trade_defaults(target, lo, hi, retrace_low, last, params),
    }


def passes(row: dict, min_cond: int = 5, require: list[str] = (), ignore: list[str] = ()) -> bool:
    """Filtro flexible: condiciones exigidas, ignoradas y mínimo sobre las restantes."""
    if any(not row.get(f"c_{c}", True) for c in require):
        return False
    active = [c for c in CONDITIONS if c not in ignore]
    return sum(bool(row.get(f"c_{c}", False)) for c in active) >= min(min_cond, len(active))


# ------------------------------------------------------------------ gráfico
def _chart_time(ts: pd.Timestamp, tf: str):
    """Lightweight Charts dibuja en UTC: se envía la hora de Nueva York como si fuera UTC."""
    if tf == "1d":
        return ts.strftime("%Y-%m-%d")
    return int(ts.tz_localize(None).tz_localize("UTC").timestamp())


def chart_payload(df: pd.DataFrame, tf: str, params: Params) -> dict:
    """Velas, volumen, RSI, EWO, niveles fibo, POC, huecos y perfil de volumen para el gráfico."""
    res = evaluate(df, tf, params)
    r, e = rsi(df["Close"]), ewo(df)
    view = df.iloc[-CHART_BARS[tf]:]
    t = [_chart_time(ts, tf) for ts in view.index]

    def series(s: pd.Series) -> list[dict]:
        s = s.loc[view.index]
        return [{"time": ti, "value": round(float(v), 4)} for ti, v in zip(t, s) if pd.notna(v)]

    out = {
        "tf": tf,
        "result": res,
        "candles": [
            {"time": ti, "open": round(o, 4), "high": round(h, 4), "low": round(l, 4), "close": round(c, 4)}
            for ti, o, h, l, c in zip(t, view["Open"], view["High"], view["Low"], view["Close"])
        ],
        "volume": [{"time": ti, "value": float(v)} for ti, v in zip(t, view["Volume"].fillna(0))],
        "rsi": series(r),
        "ewo": series(e),
        "profile": None,
        "swing": None,
        "gaps": [],
    }
    if res:
        lo, hi = res["swing_low"], res["swing_high"]
        lo_at = pd.Timestamp(res["swing_low_at"])
        edges, prof = volume_profile(df.loc[lo_at:], lo, hi)
        out["profile"] = [{"low": round(float(a), 4), "high": round(float(b), 4), "volume": float(v)}
                          for a, b, v in zip(edges[:-1], edges[1:], prof)]
        out["swing"] = {
            "low": {"time": _chart_time(lo_at, tf), "price": lo},
            "high": {"time": _chart_time(pd.Timestamp(res["swing_high_at"]), tf), "price": hi},
        }
        # cada hueco se dibuja desde la vela anterior al hueco hasta el final del gráfico
        for g in res["gaps"]:
            start = view.index[view.index.normalize() <= pd.Timestamp(g["from"], tz=MARKET_TZ)]
            out["gaps"].append({**g, "time": _chart_time(start[-1] if len(start) else view.index[0], tf)})
    return out


def hist_poc(daily: pd.DataFrame | None) -> float | None:
    if daily is None or daily.empty:
        return None
    p = historical_poc(daily)
    return round(p, 2) if p else None

"""Caché incremental de velas en Parquet: un fichero por ticker e intervalo.

La primera vez se descarga el histórico completo; después solo las velas recientes.
Si las velas solapadas no coinciden (split, ajuste de Yahoo) se vuelve a bajar el histórico.
"""
import logging
import time
from pathlib import Path
from typing import Callable

import pandas as pd

from ..config import CACHE_DIR, MARKET_TZ
from ..market import now_ny
from .source import DataSource

log = logging.getLogger(__name__)

# 1d guarda todo el histórico: lo necesita el POC histórico (unas 6.000 velas por ticker como mucho)
FULL_PERIOD = {"60m": "1y", "1d": "max"}
KEEP_DAYS = {"60m": 370, "1d": None}
# periodos incrementales posibles (días que cubren, periodo de yfinance)
INCR_PERIODS = {
    "60m": [(5, "5d"), (28, "1mo"), (88, "3mo")],
    "1d": [(28, "1mo"), (88, "3mo"), (360, "1y")],
}
SPLIT_TOLERANCE = 0.01   # diferencia relativa máxima en el cierre de las velas solapadas


class OHLCVCache:
    def __init__(self, source: DataSource, root: Path = CACHE_DIR):
        self.source, self.root = source, root

    def _path(self, ticker: str, interval: str) -> Path:
        # la carpeta lleva el periodo completo: si cambia, se descarga de nuevo el histórico
        return self.root / f"{interval}-{FULL_PERIOD[interval]}" / f"{ticker.replace('/', '_')}.parquet"

    def load(self, ticker: str, interval: str) -> pd.DataFrame | None:
        p = self._path(ticker, interval)
        if not p.exists():
            return None
        try:
            return pd.read_parquet(p)
        except Exception as ex:
            log.warning("caché corrupta %s: %s", p, ex)
            return None

    def age_seconds(self, ticker: str, interval: str) -> float | None:
        """Segundos desde la última actualización del fichero (None si no existe)."""
        p = self._path(ticker, interval)
        return time.time() - p.stat().st_mtime if p.exists() else None

    def _save(self, ticker: str, interval: str, df: pd.DataFrame):
        p = self._path(ticker, interval)
        p.parent.mkdir(parents=True, exist_ok=True)
        if KEEP_DAYS[interval]:
            df = df[df.index >= now_ny() - pd.Timedelta(days=KEEP_DAYS[interval])]
        df.to_parquet(p)

    @staticmethod
    def _normalize(df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df.index = df.index.tz_localize(MARKET_TZ) if df.index.tz is None else df.index.tz_convert(MARKET_TZ)
        df.index.name = "ts"
        return df[~df.index.duplicated(keep="last")].sort_index()

    def update(self, tickers: list[str], interval: str,
               progress: Callable[[int, int], None] | None = None) -> dict[str, pd.DataFrame]:
        """Actualiza la caché de los tickers y devuelve sus datos completos."""
        now = now_ny()
        cached = {t: self.load(t, interval) for t in tickers}
        groups: dict[str, list[str]] = {}
        for t, df in cached.items():
            period = FULL_PERIOD[interval]
            if df is not None and not df.empty:
                gap = (now - df.index[-1]).days + 2
                period = next((p for days, p in INCR_PERIODS[interval] if gap <= days), period)
            groups.setdefault(period, []).append(t)

        total, done, out, refetch = len(tickers), 0, {}, []
        for period, group in groups.items():
            base = done
            fresh = self.source.fetch(group, interval, period,
                                      progress=(lambda d, _n: progress(base + d, total)) if progress else None)
            done += len(group)
            for t in group:
                new, old = fresh.get(t), cached.get(t)
                if new is None:
                    if old is not None:
                        out[t] = old       # sin datos nuevos: se usa lo que hay
                    continue
                new = self._normalize(new)
                if old is None or period == FULL_PERIOD[interval]:
                    merged = new
                else:
                    # la última vela guardada pudo estar aún abierta: no cuenta para detectar splits
                    common = old.index[:-1].intersection(new.index)
                    if len(common):
                        diff = (old.loc[common, "Close"] / new.loc[common, "Close"] - 1).abs().max()
                        if diff > SPLIT_TOLERANCE:
                            refetch.append(t)
                            continue
                    merged = pd.concat([old, new])
                    merged = merged[~merged.index.duplicated(keep="last")].sort_index()
                self._save(t, interval, merged)
                out[t] = merged

        if refetch:
            log.info("histórico re-descargado por ajuste/split: %s", refetch)
            for t, df in self.source.fetch(refetch, interval, FULL_PERIOD[interval]).items():
                df = self._normalize(df)
                self._save(t, interval, df)
                out[t] = df
        return out

"""Fuentes de datos OHLCV. Todo pasa por DataSource para poder cambiar de proveedor sin tocar el resto."""
import logging
import time
from typing import Callable, Protocol

import pandas as pd
import yfinance as yf

log = logging.getLogger(__name__)
COLUMNS = ["Open", "High", "Low", "Close", "Volume"]


class DataSource(Protocol):
    def fetch(self, tickers: list[str], interval: str, period: str,
              progress: Callable[[int, int], None] | None = None) -> dict[str, pd.DataFrame]: ...


class YFinanceSource:
    """Yahoo Finance por lotes, con reintentos y pausa entre lotes para no saturar a Yahoo.

    auto_adjust=False: precios ajustados por splits pero no por dividendos, como TradingView.
    """

    def __init__(self, chunk: int = 50, pause: float = 1.0, retries: int = 3):
        self.chunk, self.pause, self.retries = chunk, pause, retries

    def _download(self, tickers: list[str], interval: str, period: str) -> pd.DataFrame:
        for attempt in range(1, self.retries + 1):
            try:
                return yf.download(tickers, period=period, interval=interval, group_by="ticker",
                                   auto_adjust=False, threads=True, progress=False)
            except Exception as ex:  # red, rate limit...
                log.warning("yfinance %s %s intento %d: %s", interval, period, attempt, ex)
                time.sleep(5 * attempt)
        return pd.DataFrame()

    def premarket(self, tickers: list[str]) -> dict[str, float]:
        """Último precio incluyendo pre-market (solo informativo, no entra en los indicadores)."""
        if not tickers:
            return {}
        data = self._download_prepost(tickers)
        out = {}
        for t in tickers:
            try:
                d = data[t] if isinstance(data.columns, pd.MultiIndex) else data
                close = d["Close"].dropna()
                if not close.empty:
                    out[t] = round(float(close.iloc[-1]), 2)
            except KeyError:
                pass
        return out

    def _download_prepost(self, tickers):
        try:
            return yf.download(tickers, period="1d", interval="5m", prepost=True, group_by="ticker",
                               auto_adjust=False, threads=True, progress=False)
        except Exception as ex:
            log.warning("premarket: %s", ex)
            return pd.DataFrame()

    def fx(self, pair: str) -> float | None:
        """Último cambio de una divisa de Yahoo (p.ej. EURUSD=X = dólares por euro)."""
        try:
            d = yf.download(pair, period="5d", interval="1d", auto_adjust=False, progress=False)
            close = d["Close"].dropna()
            return round(float(close.iloc[-1].item() if hasattr(close.iloc[-1], "item") else close.iloc[-1]), 5)
        except Exception as ex:
            log.warning("fx %s: %s", pair, ex)
            return None

    def fetch(self, tickers, interval, period, progress=None):
        out = {}
        for i in range(0, len(tickers), self.chunk):
            chunk = tickers[i:i + self.chunk]
            data = self._download(chunk, interval, period)
            for t in chunk:
                try:
                    d = data[t] if isinstance(data.columns, pd.MultiIndex) else data
                except KeyError:
                    continue
                d = d[[c for c in COLUMNS if c in d.columns]].dropna(how="all")
                if not d.empty and len(d.columns) == len(COLUMNS):
                    out[t] = d
            if progress:
                progress(i + len(chunk), len(tickers))
            if i + self.chunk < len(tickers):
                time.sleep(self.pause)
        return out

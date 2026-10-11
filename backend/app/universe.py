"""Universos de tickers: Nasdaq-100, NASDAQ completo (filtrado por liquidez), S&P 500 y favoritos.

Las listas se guardan en SQLite y se refrescan como mucho una vez por semana.
Si la descarga falla se usa la última lista guardada.
"""
import io
import logging
from datetime import datetime, timedelta, timezone

import pandas as pd
import requests

from . import db

log = logging.getLogger(__name__)
UA = {"User-Agent": "Mozilla/5.0 (screener-fibo)"}
MAX_AGE = timedelta(days=7)
UNIVERSES = {
    "nasdaq100": "Nasdaq-100",
    "nasdaq": "NASDAQ (liquid)",
    "sp500": "S&P 500",
    "favorites": "Saved",
}
# filtro de liquidez para el NASDAQ completo
MIN_AVG_VOLUME = 500_000
MIN_PRICE = 5.0
NAME_EXCLUDE = ("warrant", " unit", " right", "preferred", " notes", "debenture")


def _yahoo(sym: str) -> str:
    return sym.strip().upper().replace(".", "-")


def _wiki_table(urls: tuple[str, ...], columns: tuple[str, ...]) -> list[str]:
    """Primera tabla con columna de tickers y >= 90 filas. Se prueban varias páginas por si Wikipedia cambia."""
    for url in urls:
        html = requests.get(url, headers=UA, timeout=20).text
        for table in pd.read_html(io.StringIO(html)):
            col = next((c for c in columns if c in table.columns), None)
            if col and len(table) >= 90:
                return sorted({_yahoo(s) for s in table[col].dropna().astype(str)})
    raise ValueError(f"tabla no encontrada en {urls}")


def fetch_nasdaq100() -> list[str]:
    return _wiki_table(("https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies",
                        "https://en.wikipedia.org/wiki/Nasdaq-100"), ("Ticker", "Symbol"))


def fetch_sp500() -> list[str]:
    return _wiki_table(("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",), ("Symbol",))


def fetch_nasdaq_listed() -> list[str]:
    """Todas las acciones comunes listadas en NASDAQ (sin ETFs, warrants, units, preferentes...)."""
    txt = requests.get("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt", headers=UA, timeout=30).text
    df = pd.read_csv(io.StringIO(txt), sep="|", dtype=str)
    df = df[~df["Symbol"].str.startswith("File Creation", na=True)]
    df = df[(df["Test Issue"] == "N") & (df["ETF"] == "N")]
    names = df["Security Name"].str.lower().fillna("")
    df = df[~names.apply(lambda n: any(x in n for x in NAME_EXCLUDE))]
    return sorted({_yahoo(s) for s in df["Symbol"] if s.isalpha()})


def liquid(daily: dict[str, pd.DataFrame]) -> list[str]:
    """Filtra por volumen medio de 50 sesiones y precio mínimo."""
    keep = []
    for t, df in daily.items():
        tail = df.dropna(subset=["Close"]).tail(50)
        if len(tail) >= 20 and tail["Volume"].mean() >= MIN_AVG_VOLUME and tail["Close"].iloc[-1] >= MIN_PRICE:
            keep.append(t)
    return sorted(keep)


def _stale(updated_at: str | None) -> bool:
    return updated_at is None or datetime.now(timezone.utc) - datetime.fromisoformat(updated_at) > MAX_AGE


def get(universe: str, refresh: bool = False, cache=None) -> list[str]:
    """Tickers de un universo. 'cache' (OHLCVCache) solo hace falta para refrescar el NASDAQ completo."""
    if universe == "favorites":
        return db.favorites()
    tickers, updated = db.universe_get(universe)
    if tickers and not refresh and not _stale(updated):
        return tickers
    try:
        if universe == "nasdaq100":
            fresh = fetch_nasdaq100()
        elif universe == "sp500":
            fresh = fetch_sp500()
        elif universe == "nasdaq":
            if cache is None:
                return tickers
            listed = fetch_nasdaq_listed()
            log.info("NASDAQ: %d listadas, filtrando liquidez...", len(listed))
            fresh = liquid(cache.update(listed, "1d"))
        else:
            raise ValueError(f"universo desconocido: {universe}")
        if fresh:
            db.universe_set(universe, fresh)
            return fresh
    except Exception as ex:
        log.warning("no se pudo refrescar %s (%s); uso la lista guardada", universe, ex)
    return tickers

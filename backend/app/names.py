"""Nombre de la empresa de cada ticker: se pide a Yahoo una sola vez y se guarda en SQLite."""
import logging
from concurrent.futures import ThreadPoolExecutor

import yfinance as yf

from . import db

log = logging.getLogger(__name__)
MAX_LOOKUPS = 30


def _fetch(ticker: str) -> str | None:
    try:
        info = yf.Ticker(ticker).get_info()
        return (info.get("shortName") or info.get("longName") or "").strip() or None
    except Exception as ex:  # sin red, símbolo inexistente...: no se guarda y se reintenta otro día
        log.info("sin nombre para %s (%s)", ticker, ex)
        return None


def lookup(tickers: list[str]) -> dict[str, str]:
    """Nombres conocidos; los que faltan se consultan en paralelo (hasta MAX_LOOKUPS por llamada)."""
    wanted = list(dict.fromkeys(t.strip().upper() for t in tickers if t.strip()))
    out = db.names_get(wanted)
    missing = [t for t in wanted if t not in out][:MAX_LOOKUPS]
    if missing:
        with ThreadPoolExecutor(max_workers=8) as pool:
            fresh = {t: n for t, n in zip(missing, pool.map(_fetch, missing)) if n}
        if fresh:
            db.names_set(fresh)
            out.update(fresh)
    return out

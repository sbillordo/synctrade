"""Calendario de la bolsa de Nueva York y filtrado de velas aún abiertas.

Los festivos están en una lista fija para no depender de una librería pesada.
VALIDAR cada año contra https://www.nyse.com/markets/hours-calendars y ampliar la lista.
Si un festivo faltara, el escaneo correría igual pero sin velas nuevas: no genera alertas falsas.
"""
from datetime import date, datetime, time, timedelta

import pandas as pd

from .config import MARKET_TZ

HOLIDAYS = {
    # 2026
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    # 2027
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
    "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
}
EARLY_CLOSES = {"2026-11-27", "2026-12-24", "2027-11-26"}   # cierre a las 13:00

OPEN = time(9, 30)
CLOSE = time(16, 0)
EARLY_CLOSE = time(13, 0)


def now_ny() -> pd.Timestamp:
    return pd.Timestamp.now(tz=MARKET_TZ)


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d.isoformat() not in HOLIDAYS


def session_close(d: date) -> pd.Timestamp:
    t = EARLY_CLOSE if d.isoformat() in EARLY_CLOSES else CLOSE
    return pd.Timestamp(datetime.combine(d, t), tz=MARKET_TZ)


def market_open_now(now: pd.Timestamp | None = None) -> bool:
    now = now or now_ny()
    d = now.date()
    start = pd.Timestamp(datetime.combine(d, OPEN), tz=MARKET_TZ)
    return is_trading_day(d) and start <= now < session_close(d)


def drop_incomplete(df: pd.DataFrame, bar: timedelta | None, now: pd.Timestamp | None = None) -> pd.DataFrame:
    """Quita las velas cuyo cierre aún no ha llegado.

    bar=None  -> velas diarias: la de hoy solo vale tras el cierre de la sesión.
    bar=delta -> velas intradía: cierran en start+bar o al cierre de la sesión, lo que llegue antes.
    """
    if df.empty:
        return df
    now = now or now_ny()
    idx = df.index
    if idx.tz is None:
        idx = idx.tz_localize(MARKET_TZ)
    else:
        idx = idx.tz_convert(MARKET_TZ)
    if bar is None:
        today = now.date()
        keep = [ts.date() < today or (ts.date() == today and now >= session_close(today)) for ts in idx]
    else:
        keep = [min(ts + bar, session_close(ts.date())) <= now for ts in idx]
    return df[keep]

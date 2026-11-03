"""Alertas de precio: comprobación cada 5 min en sesión.

Yahoo da los precios con ~15 min de retraso: los avisos sirven para enterarse, no para ejecutar. Se mira el
máximo y el mínimo de las velas de 5 min, no solo el último precio, para no perder un toque entre dos
comprobaciones. Las posiciones vienen de eToro (etoro.py), que ejecuta y avisa él mismo de sus stops y TPs.
"""
import logging
from datetime import datetime

import pandas as pd

from . import db
from . import notify as push
from .config import MARKET_TZ
from .data.source import DataSource

log = logging.getLogger(__name__)
# la app enseña el mismo precio retrasado: lo que pasó en esos 15 min antes de crear una alerta el usuario aún
# no lo ha visto, así que cuenta para dispararla
YAHOO_DELAY = pd.Timedelta(minutes=15)


# ------------------------------------------------------------------ comprobación de precios
def _since(df: pd.DataFrame | None, iso: str) -> pd.DataFrame | None:
    """Velas desde que se armó el aviso (menos el retraso de Yahoo)."""
    if df is None or df.empty:
        return None
    idx = df.index.tz_localize(MARKET_TZ) if df.index.tz is None else df.index
    start = pd.Timestamp(datetime.fromisoformat(iso)).tz_convert(MARKET_TZ) - YAHOO_DELAY
    out = df[idx >= start].dropna(subset=["High", "Low"])
    return None if out.empty else out


def check(source: DataSource) -> list[dict]:
    """Dispara las alertas de precio. Devuelve los avisos."""
    tickers = db.watched_tickers()
    if not tickers:
        return []
    bars = source.fetch(tickers, "5m", "1d")
    events = []
    for a in db.alerts(active=True):
        df = _since(bars.get(a["ticker"]), a["created_at"])
        if df is None:
            continue
        above = a["direction"] == "above"
        hit = df["High"].max() >= a["price"] if above else df["Low"].min() <= a["price"]
        if hit:
            last = round(float(df["Close"].iloc[-1]), 2)
            db.alert_trigger(a["id"], last)
            events.append({"kind": "alert", "ticker": a["ticker"], "level": a["price"], "direction": a["direction"],
                           "last": last, "note": a["note"]})
    if events:
        log.info("alertas de precio: %s", ", ".join(e["ticker"] for e in events))
        # quedan marcadas aunque el push falle: se ven en la pestaña Portfolio
        push.send_events(events)
    return events

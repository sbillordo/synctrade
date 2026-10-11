"""Enlaces a TradingView y a la propia app."""
from urllib.parse import quote

from . import db

TV_INTERVAL = {"1h": "60", "4h": "240", "1d": "D"}


def tv_symbol(ticker: str) -> str:
    nasdaq = set(db.universe_get("nasdaq100")[0]) | set(db.universe_get("nasdaq")[0])
    return f"NASDAQ:{ticker}" if ticker in nasdaq else ticker.replace("-", ".")


def tv_url(ticker: str, tf: str, symbol: str | None = None) -> str:
    sym = symbol or tv_symbol(ticker)
    return f"https://www.tradingview.com/chart/?symbol={quote(sym)}&interval={TV_INTERVAL[tf]}"


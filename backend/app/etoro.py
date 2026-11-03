"""Posiciones reales desde eToro (solo lectura): abiertas con el P&L que calcula eToro y operaciones cerradas.

Las claves van en el .env del servidor (ETORO_API_KEY, ETORO_USER_KEY) y nunca salen de aquí: ni a la base de datos
ni a los logs ni a la app. Con las dos claves se puede operar en la cuenta, así que este módulo solo hace GET.

La documentación de eToro no es coherente con el formato de los nombres (positionID en el esquema, positionId en
los ejemplos; P&L plano o dentro de unrealizedPnL), así que los campos se leen sin distinguir mayúsculas y en
los dos sitios. Los importes vienen en la divisa de la cuenta (accountCurrencyId 1 = USD).
"""
import logging
import threading
import time
import uuid
from datetime import date, timedelta

import requests

from .config import ETORO_API_KEY, ETORO_USER_KEY

log = logging.getLogger(__name__)
BASE = "https://public-api.etoro.com/api/v1"
OPEN_TTL = 30          # s: eToro pide no consultar la cartera más de una vez por minuto, y la app refresca cada 2 min
CLOSED_TTL = 300
HISTORY_DAYS = 364     # la API admite como mucho un año menos un día por consulta
PAGE_SIZE = 100
CURRENCIES = {1: "USD"}


class EtoroError(Exception):
    pass


class NotConfigured(EtoroError):
    pass


def configured() -> bool:
    return bool(ETORO_API_KEY and ETORO_USER_KEY)


def _get(path: str, params: dict | None = None):
    if not configured():
        raise NotConfigured("faltan ETORO_API_KEY y ETORO_USER_KEY en el .env del servidor")
    headers = {"x-api-key": ETORO_API_KEY, "x-user-key": ETORO_USER_KEY, "x-request-id": str(uuid.uuid4())}
    try:
        r = requests.get(f"{BASE}{path}", params=params, headers=headers, timeout=15)
    except requests.RequestException as e:
        raise EtoroError(f"eToro no responde ({type(e).__name__})") from None
    if r.status_code in (401, 403):
        raise EtoroError(f"eToro rechaza las claves ({r.status_code}): revisa que sean de la cuenta real y no hayan caducado")
    if r.status_code == 429:
        raise EtoroError("límite de peticiones de eToro alcanzado: prueba en un minuto")
    if not r.ok:
        raise EtoroError(f"eToro devolvió {r.status_code} en {path}")
    return r.json()


def _f(d: dict | None, *names: str):
    """Primer campo presente de los nombres dados, sin distinguir mayúsculas."""
    if not d:
        return None
    low = {k.lower(): v for k, v in d.items()}
    for n in names:
        v = low.get(n.lower())
        if v is not None:
            return v
    return None


def _num(v) -> float | None:
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def _r(v: float | None, d: int = 2) -> float | None:
    return None if v is None else round(v, d)


# ------------------------------------------------------------------ instrumentos (id -> ticker)
_instruments: dict[int, dict] = {}
# sufijos de eToro que Yahoo no conoce: SBUX.RTH es SBUX en horario regular
ETORO_SUFFIXES = (".RTH",)


def yahoo_ticker(symbol: str) -> str:
    for suffix in ETORO_SUFFIXES:
        if symbol.endswith(suffix):
            return symbol[: -len(suffix)]
    return symbol


def instruments(ids: set[int]) -> dict[int, dict]:
    """Ticker y nombre de cada instrumento. Se guardan en memoria: no cambian."""
    missing = sorted(i for i in ids if i not in _instruments)
    for chunk in (missing[i:i + 50] for i in range(0, len(missing), 50)):
        data = _get("/market-data/instruments", {"instrumentIds": ",".join(map(str, chunk))})
        for it in _f(data, "instrumentDisplayDatas") or []:
            iid = int(_f(it, "instrumentID"))
            symbol = str(_f(it, "symbolFull") or iid).upper()
            _instruments[iid] = {"ticker": yahoo_ticker(symbol), "symbol": symbol,
                                 "name": _f(it, "instrumentDisplayName")}
    return {i: _instruments.get(i, {"ticker": str(i), "symbol": str(i), "name": None}) for i in ids}


# ------------------------------------------------------------------ posiciones abiertas
def _level(p: dict, kind: str, open_rate: float) -> float | None:
    """Stop o TP real. eToro marca "sin stop / sin TP" con isNoStopLoss / isNoTakeProfit o con un nivel de relleno:
    0 o 0,0001, y en los largos sin TP el máximo que admite, +1000 % (apertura x 11)."""
    if _f(p, "isNoStopLoss" if kind == "stop" else "isNoTakeProfit"):
        return None
    v = _num(_f(p, "stopLossRate" if kind == "stop" else "takeProfitRate"))
    if not v or v <= open_rate * 0.001:
        return None
    if kind == "tp" and _f(p, "isBuy") and v >= open_rate * 10:
        return None
    return v


def position_view(p: dict, inst: dict) -> dict:
    pnl_obj = _f(p, "unrealizedPnL")
    pnl_obj = pnl_obj if isinstance(pnl_obj, dict) else p        # el ejemplo de eToro lo trae plano
    open_rate = _num(_f(p, "openRate")) or 0.0
    units = _num(_f(p, "units")) or 0.0
    amount = _num(_f(p, "amount"))
    is_buy = bool(_f(p, "isBuy"))
    price = _num(_f(pnl_obj, "closeRate"))
    pnl = _num(_f(pnl_obj, "pnL", "pnl"))
    conv = _num(_f(pnl_obj, "closeConversionRate")) or 1.0
    stop, tp = _level(p, "stop", open_rate), _level(p, "tp", open_rate)
    side = 1 if is_buy else -1

    def at(level: float | None) -> float | None:
        # P&L de eToro de ahora más lo que mueve el precio hasta el nivel: arrastra comisiones ya cobradas
        if level is None or pnl is None or price is None:
            return None
        return _r(pnl + (level - price) * units * side * conv)

    leverage = int(_num(_f(p, "leverage")) or 1)
    settlement = _f(p, "settlementTypeID")                       # 0 CFD, 1 acción real
    return {
        "id": _f(p, "positionID"),
        "ticker": inst["ticker"],
        "symbol": inst["symbol"],
        "name": inst["name"],
        "is_buy": is_buy,
        "leverage": leverage,
        "cfd": settlement == 0 if settlement is not None else leverage > 1 or not is_buy,
        "units": units,
        "open_rate": open_rate,
        "opened_at": _f(p, "openDateTime"),
        "amount": _r(amount),
        "price": price,
        "pnl": _r(pnl),
        "pnl_pct": _r(pnl / amount * 100) if pnl is not None and amount else None,
        "fees": _r(_num(_f(p, "totalFees"))),
        "stop": stop,
        "tp": tp,
        "at_stop": at(stop),
        "at_tp": at(tp),
    }


def _portfolio() -> dict:
    data = _get("/trading/info/real/pnl")
    cp = _f(data, "clientPortfolio") or {}
    raw = _f(cp, "positions") or []                               # sin copy trading: esas van en mirrors
    insts = instruments({int(_f(p, "instrumentID")) for p in raw})
    views = sorted((position_view(p, insts[int(_f(p, "instrumentID"))]) for p in raw),
                   key=lambda v: v["opened_at"] or "", reverse=True)

    def total(key: str) -> float | None:
        vals = [v[key] for v in views if v[key] is not None]
        return _r(sum(vals)) if vals else None

    invested, pnl = total("amount"), _num(_f(cp, "unrealizedPnL"))
    pnl = _r(pnl) if pnl is not None else total("pnl")
    return {
        "positions": views,
        "currency": CURRENCIES.get(_f(cp, "accountCurrencyId") or 1),
        "totals": {"invested": invested, "pnl": pnl,
                   "value": _r(invested + pnl) if invested is not None and pnl is not None else None,
                   "at_stop": total("at_stop"), "credit": _r(_num(_f(cp, "credit")))},
    }


# ------------------------------------------------------------------ operaciones cerradas
def trade_view(t: dict, inst: dict) -> dict:
    invested = _num(_f(t, "investment", "initialInvestment"))
    profit = _num(_f(t, "netProfit"))
    return {
        "id": _f(t, "positionId"),
        "ticker": inst["ticker"],
        "symbol": inst["symbol"],
        "name": inst["name"],
        "is_buy": bool(_f(t, "isBuy")),
        "leverage": int(_num(_f(t, "leverage")) or 1),
        "units": _num(_f(t, "units")),
        "open_rate": _num(_f(t, "openRate")),
        "close_rate": _num(_f(t, "closeRate")),
        "opened_at": _f(t, "openTimestamp"),
        "closed_at": _f(t, "closeTimestamp"),
        "amount": _r(invested),
        "pnl": _r(profit),
        "pnl_pct": _r(profit / invested * 100) if profit is not None and invested else None,
        "fees": _r(_num(_f(t, "fees"))),
    }


def _history() -> dict:
    min_date = (date.today() - timedelta(days=HISTORY_DAYS)).isoformat()
    raw: list[dict] = []
    for page in range(1, 21):
        batch = _get("/trading/info/trade/history", {"minDate": min_date, "page": page, "pageSize": PAGE_SIZE})
        batch = batch if isinstance(batch, list) else (_f(batch, "trades", "items") or [])
        raw += batch
        if len(batch) < PAGE_SIZE:
            break
    insts = instruments({int(_f(t, "instrumentId")) for t in raw})
    views = sorted((trade_view(t, insts[int(_f(t, "instrumentId"))]) for t in raw),
                   key=lambda v: v["closed_at"] or "", reverse=True)
    pnls = [v["pnl"] for v in views if v["pnl"] is not None]
    return {
        "positions": views,
        "since": min_date,
        "totals": {"pnl": _r(sum(pnls)) if pnls else None,
                   "wins": sum(1 for x in pnls if x > 0), "losses": sum(1 for x in pnls if x < 0)},
    }


# ------------------------------------------------------------------ caché
_cache: dict[str, tuple[float, dict]] = {}
_lock = threading.Lock()


def _cached(key: str, ttl: int, fn) -> dict:
    with _lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit[0] < ttl:
            return hit[1]
        out = {**fn(), "fetched_at": time.time()}
        _cache[key] = (time.monotonic(), out)
        return out


def portfolio(fresh: bool = False) -> dict:
    if fresh:
        _cache.pop("open", None)
    return _cached("open", OPEN_TTL, _portfolio)


def history(fresh: bool = False) -> dict:
    if fresh:
        _cache.pop("closed", None)
    return _cached("closed", CLOSED_TTL, _history)


def clear_cache():
    _cache.clear()
    _instruments.clear()

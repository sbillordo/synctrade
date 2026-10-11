"""Notificaciones push a la app (Expo Push Service -> APNs). Sustituye a Telegram.

La app registra su token con POST /api/push/register; aquí se manda un único aviso por escaneo
con el listado de setups nuevos. Al tocarlo, la app abre el ticker (si es uno) o la lista.
"""
import logging

import httpx

from . import db

log = logging.getLogger(__name__)
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
MAX_BODY_ITEMS = 6


def enabled() -> bool:
    return bool(db.push_tokens())


def _send(messages: list[dict]) -> bool:
    try:
        r = httpx.post(EXPO_PUSH_URL, json=messages, timeout=15,
                       headers={"Accept": "application/json", "Content-Type": "application/json"})
        r.raise_for_status()
    except httpx.HTTPError as ex:
        log.warning("push falló: %s", getattr(getattr(ex, "response", None), "status_code", "red"))
        return False
    ok = False
    for msg, ticket in zip(messages, r.json().get("data", [])):
        if ticket.get("status") == "ok":
            ok = True
        elif ticket.get("details", {}).get("error") == "DeviceNotRegistered":
            db.push_token_remove(msg["to"])          # app desinstalada o permisos retirados
        else:
            log.warning("push rechazado: %s", ticket.get("message"))
    return ok


def format_setups(items: list[tuple[dict, bool]], context: str) -> dict:
    """Título, texto y datos del aviso. items = [(fila, subió_de_nivel)]."""
    n = len(items)
    names = [f"{r['ticker']} {r['tf']}{' ↑' if up else ''}" for r, up in items[:MAX_BODY_ITEMS]]
    body = " · ".join(names) + (f" +{n - MAX_BODY_ITEMS} more" if n > MAX_BODY_ITEMS else "")
    return {
        "title": f"{n} new setup{'s' if n != 1 else ''}",
        "subtitle": context,
        "body": body,
        "data": {"type": "setups", "items": [{"ticker": r["ticker"], "tf": r["tf"]} for r, _ in items]},
    }


def send_setups(items: list[tuple[dict, bool]], context: str) -> bool:
    tokens = db.push_tokens()
    if not items or not tokens:
        if items:
            log.info("sin dispositivos registrados; aviso omitido")
        return False
    msg = format_setups(items, context)
    return _send([{"to": t, "sound": "default", **msg} for t in tokens])


def send_test() -> bool:
    tokens = db.push_tokens()
    return bool(tokens) and _send([{"to": t, "sound": "default", "title": "SyncTrade",
                                    "body": "Notifications are working.", "data": {"type": "test"}} for t in tokens])

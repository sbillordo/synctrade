import time

import pytest
from fastapi.testclient import TestClient

from app import db
from app.data.cache import OHLCVCache
from app.scanner import Scanner

from .conftest import FakeSource, make_frame


def row(cumple: int, ticker="AAA", low_at="2026-01-01", fib=0.618, score=80.0):
    return {"ticker": ticker, "tf": "1d", "fib": fib, "swing_low_at": low_at, "swing_high_at": "2026-02-01",
            "cumple": cumple, "score": score}


def test_signals_dedupe_and_upgrade():
    # 4/5: se guarda pero no alerta (ALERT_MIN_COND=5)
    assert Scanner.process_signals([row(4)], ["AAA"], ["1d"]) == []
    # sube a 5/5: alerta
    alerts = Scanner.process_signals([row(5)], ["AAA"], ["1d"])
    assert len(alerts) == 1
    # si el envío falla no se marca: el siguiente escaneo lo reintenta
    alerts = Scanner.process_signals([row(5)], ["AAA"], ["1d"])
    assert len(alerts) == 1
    Scanner.mark_alerted(alerts)
    # sigue 5/5 en el siguiente escaneo: sin alerta repetida
    assert Scanner.process_signals([row(5)], ["AAA"], ["1d"]) == []
    # baja a 4 y vuelve a 5 con el mismo swing: tampoco
    Scanner.process_signals([row(4)], ["AAA"], ["1d"])
    assert Scanner.process_signals([row(5)], ["AAA"], ["1d"]) == []
    # nuevo swing = setup nuevo
    new = Scanner.process_signals([row(5, low_at="2026-03-01")], ["AAA"], ["1d"])
    assert len(new) == 1
    Scanner.mark_alerted(new)
    # el swing anterior queda inactivo
    active = {s["key"] for s in db.signals(active=True)}
    assert active == {"AAA|1d|2026-03-01|2026-02-01|0.618"}


def test_cache_incremental_and_split(tmp_path):
    src = FakeSource()
    cache = OHLCVCache(src, tmp_path)
    cache.update(["AAA"], "1d")
    assert src.calls[-1][2] == "max"                     # primera vez: histórico completo
    cache.update(["AAA"], "1d")
    assert src.calls[-1][2] == "1mo"                     # después: incremental
    # split 2:1 -> las velas solapadas no coinciden -> se vuelve a bajar todo
    split = make_frame("1d")
    split[["Open", "High", "Low", "Close"]] /= 2
    src.override[("AAA", "1d")] = split
    out = cache.update(["AAA"], "1d")
    assert src.calls[-1][2] == "max"
    assert out["AAA"]["Close"].iloc[-1] == pytest.approx(split["Close"].iloc[-1])


def wait_scan(client, scan_id):
    for _ in range(100):
        s = client.get(f"/api/scans/{scan_id}").json()
        if s["status"] != "running":
            return s
        time.sleep(0.05)
    raise AssertionError("el escaneo no terminó")


@pytest.fixture
def client(tmp_path, monkeypatch):
    from app import main
    src = FakeSource()
    monkeypatch.setattr(main, "scanner", Scanner(src, OHLCVCache(src, tmp_path)))
    with TestClient(main.app) as c:
        yield c


def test_api_scan_results_and_ticker(client):
    r = client.post("/api/scans", json={"tickers": ["AAA", "BBB", "NODATA"], "tfs": ["1d", "4h"]})
    assert r.status_code == 202
    s = wait_scan(client, r.json()["id"])
    assert s["status"] == "done", s

    res = client.get("/api/results", params={"universe": "all", "tf": "1d", "min_cond": 5}).json()
    assert {x["ticker"] for x in res["results"]} == {"AAA", "BBB"}
    assert res["results"][0]["tv_url"].startswith("https://www.tradingview.com/chart/?symbol=")

    # ignorar condiciones y exigir otras
    assert client.get("/api/results", params={"universe": "all", "min_cond": 5, "ignore": "rsi"}).json()["count"] >= 2

    t = client.get("/api/ticker/aaa").json()
    assert t["ticker"] == "AAA" and t["results"]["1d"]["cumple"] == 5
    chart = t["charts"]["1d"]
    assert chart["candles"] and chart["rsi"] and chart["ewo"] and chart["profile"]
    assert isinstance(chart["candles"][0]["time"], str)                 # diario: 'YYYY-MM-DD'
    assert isinstance(t["charts"]["4h"]["candles"][0]["time"], int)     # intradía: timestamp
    trade = t["results"]["1d"]["trade"]
    assert trade["stop"] < trade["entry"] < trade["tp"]
    assert t["hist_poc"] and t["price_now"]

    assert client.get("/api/ticker/NODATA").status_code == 404
    assert len(client.get("/api/signals", params={"active": True}).json()) >= 2


def test_api_favorites_and_settings(client):
    assert client.put("/api/favorites/aapl").status_code == 204
    assert client.get("/api/favorites").json() == ["AAPL"]
    s = client.get("/api/settings").json()["params"]
    s["rsi_cerca"] = 40
    assert client.put("/api/settings", json=s).json()["params"]["rsi_cerca"] == 40
    s["ewo"] = "otro"
    assert client.put("/api/settings", json=s).status_code == 422


def test_push_message_and_register(client):
    from app import notify
    items = [({**row(5, "SBUX"), "tf": "1d"}, False), ({**row(5, "NVDA"), "tf": "1h"}, True)]
    msg = notify.format_setups(items, "Nasdaq-100 · 09/10 16:10 NY")
    assert msg["title"] == "2 new setups"
    assert msg["body"] == "SBUX 1d · NVDA 1h ↑"
    assert msg["data"]["items"][0] == {"ticker": "SBUX", "tf": "1d"}
    many = notify.format_setups([(row(5, f"T{i}"), False) for i in range(9)], "x")
    assert many["body"].endswith("+3 more")
    # sin dispositivos no se envía nada (y la señal no se marca como avisada)
    assert notify.send_setups(items, "x") is False
    assert client.post("/api/push/register", json={"token": "nope"}).status_code == 422
    assert client.post("/api/push/register", json={"token": "ExponentPushToken[abc123]", "platform": "ios"}).status_code == 204
    assert db.push_tokens() == ["ExponentPushToken[abc123]"]

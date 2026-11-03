import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import db, notify, watch
from app.config import MARKET_TZ

from .conftest import FakeSource


@pytest.fixture
def client(monkeypatch):
    from app import main
    main.scanner.source = FakeSource()
    monkeypatch.setattr(main.scanner, "fx_eurusd", lambda: 1.25)
    with TestClient(main.app) as c:
        yield c


def bars(lows: list[float], highs: list[float], start: pd.Timestamp | None = None) -> pd.DataFrame:
    """Velas de 5 min que empiezan ahora (dentro de la ventana de cualquier aviso recién armado)."""
    start = start or pd.Timestamp.now(tz=MARKET_TZ).floor("5min")
    idx = pd.date_range(start, periods=len(lows), freq="5min")
    close = [(lo + hi) / 2 for lo, hi in zip(lows, highs)]
    return pd.DataFrame({"Open": close, "High": highs, "Low": lows, "Close": close, "Volume": 1000.0}, index=idx)


def test_check_alerts(monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "send_events", lambda ev: sent.append(ev) or True)
    up = db.alert_create("AAA", 105, "above", "breakout")
    db.alert_create("AAA", 80, "below")
    src = FakeSource()
    src.override[("AAA", "5m")] = bars([99, 101], [103, 106])

    events = watch.check(src)
    assert [(e["ticker"], e["level"]) for e in events] == [("AAA", 105)]
    assert [a["id"] for a in db.alerts(active=False)] == [up["id"]]
    assert sent and len(sent[0]) == 1
    # mismos precios: nada repetido
    assert watch.check(src) == []
    # un toque anterior a crear la alerta (fuera del retraso de Yahoo) no cuenta
    old = pd.Timestamp.now(tz=MARKET_TZ).floor("5min") - pd.Timedelta(hours=2)
    db.alert_create("BBB", 50, "below")
    src.override[("BBB", "5m")] = bars([49, 52], [51, 53], start=old)
    assert watch.check(src) == []


def test_api_alerts(client):
    a = client.post("/api/alerts", json={"ticker": "bbb", "price": 50, "direction": "below", "note": " retest "}).json()
    assert a["ticker"] == "BBB" and a["note"] == "retest"
    assert [x["id"] for x in client.get("/api/alerts?status=active").json()] == [a["id"]]
    assert "BBB" in db.watched_tickers()
    assert client.delete(f"/api/alerts/{a['id']}").status_code == 204
    assert client.get("/api/alerts").json() == []


def test_event_messages():
    m = notify.format_event({"kind": "alert", "ticker": "AAA", "level": 105, "direction": "above", "last": 106,
                             "note": None})
    assert m["title"] == "AAA above 105.00"

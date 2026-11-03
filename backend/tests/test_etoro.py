import pytest
from fastapi.testclient import TestClient

from app import etoro

# respuestas inventadas con la forma de la documentación de eToro (una con el P&L dentro de unrealizedPnL y
# nombres del esquema, otra plana y con los nombres de los ejemplos)
PNL = {"clientPortfolio": {
    "credit": 500.0, "unrealizedPnL": 35.0, "accountCurrencyId": 1,
    "positions": [
        {"positionID": 1, "instrumentID": 1001, "isBuy": True, "leverage": 1, "settlementTypeID": 1,
         "openDateTime": "2026-10-01T14:00:00Z", "openRate": 100.0, "units": 10.0, "amount": 1000.0,
         "stopLossRate": 0.0001, "takeProfitRate": 0, "isNoTakeProfit": True, "totalFees": 2.0,
         "unrealizedPnL": {"pnL": 48.0, "closeRate": 105.0, "closeConversionRate": 1.0}},
        {"positionId": 2, "instrumentId": 1002, "isBuy": True, "leverage": 5, "settlementTypeId": 0,
         "openDateTime": "2026-10-20T14:00:00Z", "openRate": 50.0, "units": 100.0, "amount": 1000.0,
         "stopLossRate": 47.0, "takeProfitRate": 60.0, "totalFees": 9.5,
         "pnL": -13.0, "closeRate": 49.95, "closeConversionRate": 1.0},
        # sin TP: eToro pone el máximo, apertura x 11
        {"positionID": 3, "instrumentID": 1003, "isBuy": True, "leverage": 1, "settlementTypeID": 1,
         "openDateTime": "2026-09-01T14:00:00Z", "openRate": 233.06, "units": 1.0, "amount": 233.06,
         "stopLossRate": 227.0, "takeProfitRate": 2563.66, "totalFees": 0,
         "unrealizedPnL": {"pnL": 0.0, "closeRate": 233.06}},
    ],
}}
INSTRUMENTS = {"instrumentDisplayDatas": [
    {"instrumentID": 1001, "symbolFull": "aaa", "instrumentDisplayName": "Aaa Inc"},
    {"instrumentID": 1002, "symbolFull": "BBB", "instrumentDisplayName": "Bbb Corp"},
    {"instrumentID": 1003, "symbolFull": "CCC.RTH", "instrumentDisplayName": "Ccc Co"},
]}
HISTORY = [
    {"positionId": 9, "instrumentId": 1001, "isBuy": True, "leverage": 1, "units": 5, "openRate": 90, "closeRate": 99,
     "openTimestamp": "2026-03-01T14:00:00Z", "closeTimestamp": "2026-04-01T14:00:00Z", "investment": 450,
     "netProfit": 43, "fees": 2},
    {"positionId": 10, "instrumentId": 1002, "isBuy": True, "leverage": 2, "units": 10, "openRate": 50, "closeRate": 48,
     "openTimestamp": "2026-05-01T14:00:00Z", "closeTimestamp": "2026-05-03T14:00:00Z", "investment": 250,
     "netProfit": -21, "fees": 1},
]


@pytest.fixture
def api(monkeypatch):
    calls = []

    def fake_get(path, params=None):
        calls.append(path)
        if not etoro.configured():
            raise etoro.NotConfigured("faltan claves")
        return {"/trading/info/real/pnl": PNL, "/market-data/instruments": INSTRUMENTS,
                "/trading/info/trade/history": HISTORY}[path]

    monkeypatch.setattr(etoro, "ETORO_API_KEY", "k")
    monkeypatch.setattr(etoro, "ETORO_USER_KEY", "u")
    monkeypatch.setattr(etoro, "_get", fake_get)
    etoro.clear_cache()
    yield calls
    etoro.clear_cache()


def test_open_positions(api):
    out = etoro.portfolio()
    a, b, cc = sorted(out["positions"], key=lambda p: p["id"])
    assert cc["ticker"] == "CCC" and cc["symbol"] == "CCC.RTH"                 # Yahoo no conoce el sufijo .RTH
    assert cc["stop"] == 227.0 and cc["tp"] is None
    assert a["ticker"] == "AAA" and a["name"] == "Aaa Inc" and a["cfd"] is False
    assert a["stop"] is None and a["tp"] is None and a["at_stop"] is None        # niveles de relleno = sin stop / TP
    assert a["pnl"] == 48.0 and a["pnl_pct"] == pytest.approx(4.8) and a["price"] == 105.0
    assert b["ticker"] == "BBB" and b["leverage"] == 5 and b["cfd"] is True
    assert b["stop"] == 47.0 and b["tp"] == 60.0
    # P&L de eToro ahora + movimiento hasta el nivel: -13 + (47 - 49.95) * 100
    assert b["at_stop"] == pytest.approx(-308.0) and b["at_tp"] == pytest.approx(992.0)
    assert out["currency"] == "USD"
    assert out["totals"] == {"invested": 2233.06, "pnl": 35.0, "value": 2268.06, "at_stop": -314.06, "credit": 500.0}
    assert out["positions"][0]["id"] == 2                                     # más reciente primero
    # caché: la segunda lectura no vuelve a llamar a eToro, y los instrumentos se piden una vez
    etoro.portfolio()
    assert api.count("/trading/info/real/pnl") == 1
    etoro.portfolio(fresh=True)
    assert api.count("/trading/info/real/pnl") == 2 and api.count("/market-data/instruments") == 1


def test_history(api):
    out = etoro.history()
    assert [p["ticker"] for p in out["positions"]] == ["BBB", "AAA"]
    assert out["positions"][1]["pnl_pct"] == pytest.approx(43 / 450 * 100, abs=0.01)
    assert out["totals"] == {"pnl": 22.0, "wins": 1, "losses": 1}


def test_api(api, monkeypatch):
    from app import main
    monkeypatch.setattr(main.scanner, "fx_eurusd", lambda: 1.1)
    with TestClient(main.app) as c:
        r = c.get("/api/positions").json()
        assert len(r["positions"]) == 3 and r["eurusd"] == 1.1
        assert c.get("/api/positions?status=closed").json()["totals"]["wins"] == 1
        monkeypatch.setattr(etoro, "ETORO_API_KEY", "")
        r = c.get("/api/positions?fresh=1")
        assert r.status_code == 503 and "faltan" in r.json()["detail"]

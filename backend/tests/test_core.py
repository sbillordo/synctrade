from datetime import timedelta

import numpy as np
import pandas as pd

from app.config import MARKET_TZ, Params
from app.core.evaluate import evaluate, passes, prepare
from app.core.indicators import poc_price, rsi
from app.market import drop_incomplete

from .conftest import make_frame


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz=MARKET_TZ)


def test_rsi_extremes():
    up = pd.Series(np.arange(1, 50, dtype=float))
    assert rsi(up).iloc[-1] > 99
    assert rsi(up[::-1].reset_index(drop=True)).iloc[-1] < 1


def test_poc_on_heavy_volume_zone():
    df = pd.DataFrame({"High": [101, 111, 121], "Low": [99, 109, 119], "Volume": [1, 50, 1]})
    assert 109 <= poc_price(df, 99, 121) <= 111


def test_setup_daily_cumple_5():
    df = prepare(make_frame("1d"), "1d")
    res = evaluate(df, "1d", Params())
    assert res is not None
    assert res["fib"] == 0.618
    assert res["c_fib"] and res["c_poc"] and res["c_rsi"] and res["c_ewo"] and res["c_gap"], res
    assert res["cumple"] == 5
    assert res["poc"] > res["nivel"]
    t = res["trade"]
    # el precio está sobre el 0.618 -> stop pegado por debajo del 0.618; TP = proyección 0.618 desde el mínimo del retroceso
    assert t["stop_level"] == 0.618 and t["stop"] == round(res["nivel"] * 0.997, 2)
    assert t["tp_rule"] == "extension_0.618"
    assert t["tp"] == round(t["retrace_low"] + 0.618 * (res["swing_high"] - res["swing_low"]), 2)


def test_trade_defaults_below_level_and_786():
    from app.core.evaluate import trade_defaults
    # SBUX: precio 93.21 por debajo del 0.618 (95.12) -> stop bajo el 0.786 (90.93)
    t = trade_defaults(0.618, 85.60, 110.51, 92.00, 93.21, Params())
    assert t["stop_level"] == 0.786 and t["stop"] == round(90.93 * 0.997, 2)
    assert t["tp"] == round(92.00 + 0.618 * (110.51 - 85.60), 2)
    # retroceso al 0.786 -> TP en el swing high
    assert trade_defaults(0.786, 85.60, 110.51, 90.0, 91.5, Params())["tp"] == 110.51


def test_unfilled_daily_gaps():
    from app.core.indicators import unfilled_gaps
    idx = pd.bdate_range("2026-09-01", periods=6).tz_localize(MARKET_TZ)
    #        swing low   hueco 97->99 (abierto)   hueco 103->104 (tapado el día 6)
    d = pd.DataFrame({"Low": [95, 99, 100, 104, 104.5, 102.5], "High": [97, 101, 103, 106, 106, 105]}, index=idx)
    assert [(g["bottom"], g["top"]) for g in unfilled_gaps(d, idx[0])] == [(97, 99)]
    assert unfilled_gaps(d, idx[0], min_pct=3) == []
    # un día que baja a 98 recorta el hueco; uno que toca 97 lo tapa
    nxt = [idx[-1] + pd.Timedelta(days=3)]
    d98 = pd.concat([d, pd.DataFrame({"Low": [98], "High": [104]}, index=nxt)])
    assert unfilled_gaps(d98, idx[0])[0]["top"] == 98
    d97 = pd.concat([d, pd.DataFrame({"Low": [97], "High": [104]}, index=nxt)])
    assert unfilled_gaps(d97, idx[0]) == []


def test_session_open_gaps_intraday():
    from app.core.indicators import unfilled_gaps
    # caso real INTC 1h: cierre del 15/09 con máximo 97.42, apertura del 16/09 con mínimo 100.76, luego baja a 99.29
    idx = pd.DatetimeIndex(["2026-09-15 14:30", "2026-09-15 15:30", "2026-09-16 09:30", "2026-09-16 10:30",
                            "2026-09-16 11:30"]).tz_localize(MARKET_TZ)
    h = pd.DataFrame({"Low": [96.52, 96.91, 100.76, 102.0, 99.29], "High": [97.28, 97.42, 104.42, 103.5, 101.0]}, index=idx)
    assert [(g["bottom"], g["top"]) for g in unfilled_gaps(h, idx[0], session_open_only=True)] == [(97.42, 99.29)]
    # dentro de la misma sesión un salto no cuenta
    h2 = h.copy()
    h2.iloc[3, 0] = 104.5
    assert len(unfilled_gaps(h2, idx[0], session_open_only=True)) == 1


def test_historical_poc_finds_heavy_zone():
    from app.core.indicators import historical_poc
    idx = pd.bdate_range("2020-01-01", periods=60)
    close = np.r_[np.linspace(10, 50, 30), np.full(30, 40.0)]
    d = pd.DataFrame({"High": close * 1.01, "Low": close * 0.99, "Volume": np.r_[np.full(30, 1e5), np.full(30, 5e6)]}, index=idx)
    assert 39 < historical_poc(d) < 41


def test_passes_require_and_ignore():
    row = {"c_fib": True, "c_poc": True, "c_rsi": False, "c_ewo": True, "c_gap": True}
    assert not passes(row, 5)
    assert passes(row, 4)
    assert passes(row, 5, ignore=["rsi"])           # 4 de 4 activas
    assert not passes(row, 3, require=["rsi"])
    assert passes(row, 2, require=["fib", "poc"])


def test_drop_incomplete_hourly_and_4h():
    df = pd.DataFrame({"Close": [1, 2, 3]}, index=[ts("2026-10-08 09:30"), ts("2026-10-08 10:30"),
                                                   ts("2026-10-08 13:30")])
    # a las 11:00 la vela de 10:30 sigue abierta
    assert len(drop_incomplete(df, timedelta(hours=1), ts("2026-10-08 11:00"))) == 1
    # la vela de 4h de las 13:30 cierra a las 16:00 (cierre de sesión), no a las 17:30
    assert len(drop_incomplete(df.iloc[[2]], timedelta(hours=4), ts("2026-10-08 15:59"))) == 0
    assert len(drop_incomplete(df.iloc[[2]], timedelta(hours=4), ts("2026-10-08 16:00"))) == 1


def test_drop_incomplete_daily_and_early_close():
    df = pd.DataFrame({"Close": [1, 2]}, index=[ts("2026-11-25"), ts("2026-11-27")])
    assert len(drop_incomplete(df, None, ts("2026-11-27 12:00"))) == 1
    assert len(drop_incomplete(df, None, ts("2026-11-27 13:00"))) == 2   # cierre anticipado

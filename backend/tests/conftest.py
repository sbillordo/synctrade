import os
import tempfile

# antes de importar la app: base de datos y caché en un directorio temporal, sin programador
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="screener-test-")
os.environ["SCHEDULER_ENABLED"] = "0"
os.environ["STATIC_DIR"] = os.path.join(os.environ["DATA_DIR"], "no-static")

import numpy as np
import pandas as pd
import pytest

from app import db
from app.config import MARKET_TZ


def setup_path(n: int, lo: float = 100.0, hi: float = 150.0, seed: int = 0):
    """Precio lateral -> impulso lo->hi -> retroceso hasta el 0.618. Volumen alto en la zona 135-145."""
    rng = np.random.default_rng(seed)
    n_flat, n_up = int(n * 0.45), int(n * 0.35)
    n_down = n - n_flat - n_up
    target = hi - 0.618 * (hi - lo)
    close = np.concatenate([
        lo + 3 + rng.normal(0, 0.4, n_flat),
        np.linspace(lo, hi, n_up),
        np.linspace(hi, target, n_down + 1)[1:],
    ])
    close[n_flat] = lo + 0.5
    high = close * 1.004
    low = close * 0.996
    low[n_flat] = lo                                   # mínimo del impulso
    high[n_flat + n_up - 1] = hi                       # máximo del impulso
    open_ = np.r_[close[0], close[:-1]]
    vol = np.full(n, 1_000_000.0)
    vol[n_flat:n_flat + n_up][(close[n_flat:n_flat + n_up] > 135) & (close[n_flat:n_flat + n_up] < 145)] = 8_000_000
    return pd.DataFrame({"Open": open_, "High": np.maximum(high, open_), "Low": np.minimum(low, open_),
                         "Close": close, "Volume": vol})


def daily_index(n: int) -> pd.DatetimeIndex:
    end = pd.Timestamp.now(tz=MARKET_TZ).normalize() - pd.Timedelta(days=1)
    return pd.bdate_range(end=end.tz_localize(None), periods=n).tz_localize(MARKET_TZ)


def hourly_index(days: int) -> pd.DatetimeIndex:
    stamps = []
    for d in daily_index(days):
        stamps += [d + pd.Timedelta(hours=9, minutes=30) + pd.Timedelta(hours=h) for h in range(7)]
    return pd.DatetimeIndex(stamps)


def make_frame(interval: str, seed: int = 0) -> pd.DataFrame:
    idx = daily_index(200) if interval == "1d" else hourly_index(110)
    df = setup_path(len(idx), seed=seed)
    df.index = idx
    return df


class FakeSource:
    """Fuente de datos sin red: devuelve el mismo setup sintético para cualquier ticker."""

    def __init__(self):
        self.calls: list[tuple[list[str], str, str]] = []
        self.override: dict[tuple[str, str], pd.DataFrame] = {}

    def fetch(self, tickers, interval, period, progress=None):
        self.calls.append((list(tickers), interval, period))
        out = {t: self.override.get((t, interval), make_frame(interval)).copy() for t in tickers if t != "NODATA"}
        if progress:
            progress(len(tickers), len(tickers))
        return out


@pytest.fixture(autouse=True)
def clean_db():
    db.init()
    with db.connect() as con:
        for table in ("scans", "latest", "signals", "universe_members", "universe_meta", "favorites", "settings"):
            con.execute(f"DELETE FROM {table}")
    yield

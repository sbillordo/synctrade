"""Configuración global: variables de entorno y parámetros por defecto del screener."""
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
CACHE_DIR = DATA_DIR / "cache"
DB_PATH = DATA_DIR / "screener.db"
STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parents[2] / "mobile" / "dist"))   # export web de la app

SCHEDULER_ENABLED = os.getenv("SCHEDULER_ENABLED", "1") == "1"
SCHEDULED_UNIVERSE = os.getenv("SCHEDULED_UNIVERSE", "nasdaq100")
ALERT_MIN_COND = int(os.getenv("ALERT_MIN_COND", "5"))   # de 5 condiciones

MARKET_TZ = "America/New_York"
FIB_RATIOS = [0.382, 0.5, 0.618, 0.786]
VP_BINS = 30                                            # nº de filas del perfil de volumen

# source    : intervalo que se descarga (4h se construye desde 60m)
# lookback  : nº de velas donde buscar el impulso (mínimo -> máximo)
# min_move  : tamaño mínimo del impulso (0.10 = 10 %)
# tol       : distancia máxima al nivel de Fibonacci (0.015 = 1,5 %)
TF_CONFIG = {
    "1h": dict(source="60m", lookback=300, min_move=0.05, tol=0.012),
    "4h": dict(source="60m", lookback=200, min_move=0.08, tol=0.020),
    "1d": dict(source="1d", lookback=150, min_move=0.15, tol=0.025),
}
TIMEFRAMES = list(TF_CONFIG)


@dataclass
class Params:
    """Parámetros del screener editables desde la UI (se guardan en la tabla settings)."""
    niveles: list[float] = field(default_factory=lambda: [0.618, 0.786])
    rsi_cerca: float = 35       # RSI <= este valor = "por tocar"
    rsi_banda: float = 30       # banda inferior (sobreventa)
    rsi_velas: int = 5          # velas para "ha tocado la banda"
    ewo: str = "negativo"       # "negativo" | "bajando"
    gap_min_pct: float = 0.0    # tamaño mínimo de un hueco diario para contar (0 = cualquiera)
    stop_buffer: float = 0.3    # % por debajo del nivel fibo para el stop por defecto

    @classmethod
    def from_dict(cls, d: dict | None) -> "Params":
        d = d or {}
        known = {k: v for k, v in d.items() if k in cls.__dataclass_fields__}
        return cls(**known)

    def to_dict(self) -> dict:
        return asdict(self)

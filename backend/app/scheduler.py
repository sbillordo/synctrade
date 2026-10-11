"""Escaneos programados (hora de Nueva York, lunes a viernes, sin festivos).

07:30         1h + 4h + 1d   previo a la apertura (con precio pre-market)
10:35..15:35  1h             5 min después del cierre de cada vela de 1h
13:35         + 4h           cierra la primera vela de 4h
16:10         1h + 4h + 1d   cierre de la sesión
Sábado 08:00  refresco de universos (Nasdaq-100 y NASDAQ líquidas)
"""
import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from . import universe
from .config import MARKET_TZ, SCHEDULED_UNIVERSE
from .market import is_trading_day, now_ny
from .scanner import Scanner

log = logging.getLogger(__name__)

JOBS = [
    ("premarket", "7", "30", ["1h", "4h", "1d"], True),
    ("hourly", "10,11,12,14,15", "35", ["1h"], False),
    ("midday", "13", "35", ["1h", "4h"], False),
    ("close", "16", "10", ["1h", "4h", "1d"], False),
]


def _scan(scanner: Scanner, tfs: list[str], premarket: bool):
    if not is_trading_day(now_ny().date()):
        log.info("festivo o fin de semana: escaneo omitido")
        return
    scanner.start(SCHEDULED_UNIVERSE, tfs=tfs, trigger="cron", premarket=premarket, wait=True)


def _refresh_universes(scanner: Scanner):
    for name in ("nasdaq100", "nasdaq"):
        n = len(universe.get(name, refresh=True, cache=scanner.cache))
        log.info("universo %s: %d tickers", name, n)


def build(scanner: Scanner) -> BackgroundScheduler:
    sched = BackgroundScheduler(timezone=MARKET_TZ, job_defaults={"coalesce": True, "max_instances": 1,
                                                                  "misfire_grace_time": 600})
    for name, hour, minute, tfs, pre in JOBS:
        sched.add_job(_scan, CronTrigger(day_of_week="mon-fri", hour=hour, minute=minute, timezone=MARKET_TZ),
                      args=[scanner, tfs, pre], id=name, name=f"scan {name} {'+'.join(tfs)}")
    sched.add_job(_refresh_universes, CronTrigger(day_of_week="sat", hour=8, timezone=MARKET_TZ),
                  args=[scanner], id="universes", name="refresco de universos")
    return sched


def next_runs(sched: BackgroundScheduler) -> list[dict]:
    return sorted(({"id": j.id, "name": j.name, "next": j.next_run_time.isoformat() if j.next_run_time else None}
                   for j in sched.get_jobs()), key=lambda j: j["next"] or "")

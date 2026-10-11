"""API FastAPI + export web de la app (Expo) + programador, en un solo proceso."""
import logging
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db, notify, scheduler, universe
from .config import SCHEDULER_ENABLED, STATIC_DIR, TIMEFRAMES, Params
from .core.evaluate import CONDITIONS, passes
from .links import tv_symbol, tv_url
from .market import market_open_now, now_ny
from .scanner import Busy, Scanner

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("screener")

scanner = Scanner()
state: dict = {}

TF = Literal["1h", "4h", "1d"]
Cond = Literal["fib", "poc", "rsi", "ewo", "gap"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    db.mark_stale_scans()
    if SCHEDULER_ENABLED:
        state["sched"] = scheduler.build(scanner)
        state["sched"].start()
        log.info("programador activo")
    yield
    if "sched" in state:
        state["sched"].shutdown(wait=False)


app = FastAPI(title="SyncTrade", lifespan=lifespan)


def _csv(value: str | None) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()] if value else []


def _enrich(row: dict, fav: set[str]) -> dict:
    sym = tv_symbol(row["ticker"])
    return {**row, "favorite": row["ticker"] in fav, "tv_symbol": sym, "tv_url": tv_url(row["ticker"], row["tf"], sym)}


# ------------------------------------------------------------------ estado
@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/status")
def status():
    last = db.scans(1)
    return {
        "now_ny": now_ny().isoformat(),
        "market_open": market_open_now(),
        "busy": scanner.busy,
        "last_scan": last[0] if last else None,
        "push_devices": len(db.push_tokens()),
        "scheduler": scheduler.next_runs(state["sched"]) if "sched" in state else [],
    }


@app.get("/api/universes")
def universes():
    out = []
    for key, label in universe.UNIVERSES.items():
        tickers = db.favorites() if key == "favorites" else db.universe_get(key)[0]
        updated = None if key == "favorites" else db.universe_get(key)[1]
        out.append({"id": key, "label": label, "count": len(tickers), "updated_at": updated})
    return out


# ------------------------------------------------------------------ resultados
@app.get("/api/results")
def results(
    universe_id: str = Query("nasdaq100", alias="universe"),
    tf: str | None = Query(None, description="1h,4h,1d"),
    min_cond: int = Query(3, ge=0, le=5),
    require: str | None = Query(None, description="condiciones obligatorias: fib,poc,rsi,ewo"),
    ignore: str | None = Query(None, description="condiciones ignoradas"),
):
    """Últimos resultados del universo. El filtro fino también se puede hacer en el cliente."""
    tfs = [t for t in _csv(tf) if t in TIMEFRAMES] or TIMEFRAMES
    req = [c for c in _csv(require) if c in CONDITIONS]
    ign = [c for c in _csv(ignore) if c in CONDITIONS and c not in req]
    members = None if universe_id == "all" else (
        db.favorites() if universe_id == "favorites" else db.universe_get(universe_id)[0])
    rows = db.latest(members, tfs)
    fav = set(db.favorites())
    rows = [_enrich(r, fav) for r in rows if passes(r, min_cond, req, ign)]
    return {"count": len(rows), "results": rows}


@app.get("/api/ticker/{symbol}")
def ticker(symbol: str):
    """Las 3 temporalidades de golpe (resultado + gráfico) para cambiar de pestaña sin esperar."""
    try:
        data = scanner.ticker(symbol)
    except KeyError:
        raise HTTPException(404, f"sin datos para {symbol.upper()}")
    fav = set(db.favorites())
    sym = tv_symbol(data["ticker"])
    data["favorite"] = data["ticker"] in fav
    data["tv_symbol"] = sym
    data["tv_urls"] = {t: tv_url(data["ticker"], t, sym) for t in TIMEFRAMES}
    data["signals"] = db.signals(ticker=data["ticker"], limit=20)
    return data


@app.get("/api/signals")
def signals(active: bool | None = None, ticker: str | None = None, limit: int = Query(100, le=500)):
    return db.signals(active, ticker.upper() if ticker else None, limit)


# ------------------------------------------------------------------ escaneos
class ScanRequest(BaseModel):
    universe: str | None = "nasdaq100"
    tickers: list[str] | None = Field(None, description="si se indica, se ignora 'universe'")
    tfs: list[TF] = Field(default_factory=lambda: list(TIMEFRAMES))
    notify: bool = False


@app.post("/api/scans", status_code=202)
def scan_start(req: ScanRequest):
    if req.tickers is None and req.universe not in universe.UNIVERSES:
        raise HTTPException(400, "universo desconocido")
    try:
        scan_id = scanner.start(None if req.tickers else req.universe, req.tickers, req.tfs,
                                trigger="manual", notify=req.notify)
    except Busy:
        raise HTTPException(409, "ya hay un escaneo en curso")
    return db.scan(scan_id)


@app.get("/api/scans")
def scans(limit: int = Query(20, le=100)):
    return db.scans(limit)


@app.get("/api/scans/{scan_id}")
def scan_get(scan_id: int):
    s = db.scan(scan_id)
    if not s:
        raise HTTPException(404)
    return s


# ------------------------------------------------------------------ favoritos y ajustes
@app.get("/api/favorites")
def favorites():
    return db.favorites()


@app.put("/api/favorites/{symbol}", status_code=204)
def favorite_add(symbol: str):
    db.favorite_set(symbol.upper(), True)


@app.delete("/api/favorites/{symbol}", status_code=204)
def favorite_remove(symbol: str):
    db.favorite_set(symbol.upper(), False)


class ParamsModel(BaseModel):
    niveles: list[float] = Field(min_length=1)
    rsi_cerca: float = Field(ge=0, le=100)
    rsi_banda: float = Field(ge=0, le=100)
    rsi_velas: int = Field(ge=1, le=50)
    ewo: Literal["negativo", "bajando"]
    gap_min_pct: float = Field(0.0, ge=0, le=10)
    stop_buffer: float = Field(0.3, ge=0, le=5)


@app.get("/api/settings")
def settings_get():
    return {"params": scanner.params().to_dict(), "push_devices": len(db.push_tokens())}


@app.put("/api/settings")
def settings_put(p: ParamsModel):
    """Los parámetros nuevos se aplican en el próximo escaneo."""
    db.setting_set("params", Params.from_dict(p.model_dump()).to_dict())
    return settings_get()


@app.get("/api/fx")
def fx():
    """Dólares por euro, para pasar el importe en euros a acciones."""
    return {"eurusd": scanner.fx_eurusd()}


# ------------------------------------------------------------------ notificaciones push
class PushRegister(BaseModel):
    token: str = Field(pattern=r"^(Exponent|Expo)PushToken\[.+\]$")
    platform: str | None = None


@app.post("/api/push/register", status_code=204)
def push_register(req: PushRegister):
    db.push_token_add(req.token, req.platform)


@app.post("/api/push/unregister", status_code=204)
def push_unregister(req: PushRegister):
    db.push_token_remove(req.token)


@app.post("/api/push/test")
def push_test():
    if not db.push_tokens():
        raise HTTPException(400, "no hay dispositivos registrados")
    if not notify.send_test():
        raise HTTPException(502, "el servicio de push rechazó el aviso")
    return {"ok": True}


# ------------------------------------------------------------------ web estática
if (STATIC_DIR / "index.html").exists():
    root = STATIC_DIR.resolve()
    for assets in ("_expo", "assets"):
        if (root / assets).exists():
            app.mount(f"/{assets}", StaticFiles(directory=root / assets), name=assets)

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        # export estático de Expo Router: /setups -> setups.html, / -> index.html
        if path.startswith("api/"):
            raise HTTPException(404)
        # rutas dinámicas del export de Expo Router: /ticker/SBUX -> ticker/[symbol].html
        dynamic = root / "ticker" / "[symbol].html" if path.startswith("ticker/") else None
        for candidate in (root / path, root / f"{path}.html", root / path / "index.html", dynamic):
            if candidate is None:
                continue
            if path and candidate.is_file() and root in candidate.resolve().parents:
                return FileResponse(candidate)
        return FileResponse(root / "index.html")

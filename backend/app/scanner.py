"""Orquesta un escaneo: universo -> descarga incremental -> evaluación -> SQLite -> señales -> push."""
import logging
import threading

import pandas as pd

import time

from . import db, notify, universe
from .config import ALERT_MIN_COND, TF_CONFIG, TIMEFRAMES, Params
from .core.evaluate import chart_payload, evaluate, hist_poc, prepare
from .data.cache import OHLCVCache
from .data.source import DataSource, YFinanceSource
from .market import now_ny

log = logging.getLogger(__name__)
SIGNAL_MIN_COND = 3          # a partir de cuántas condiciones se guarda en el histórico
DOWNLOAD_WEIGHT = 0.85       # parte de la barra de progreso que corresponde a la descarga
TICKER_FRESH_SECONDS = 900   # en la ficha de un ticker no se re-descarga si la caché tiene < 15 min
FX_TTL = 1800                # el cambio EUR/USD se refresca cada 30 min


class Busy(Exception):
    pass


def signal_key(row: dict) -> str:
    return f"{row['ticker']}|{row['tf']}|{row['swing_low_at']}|{row['swing_high_at']}|{row['fib']}"


class Scanner:
    def __init__(self, source: DataSource | None = None, cache: OHLCVCache | None = None):
        self.source = source or YFinanceSource()
        self.cache = cache or OHLCVCache(self.source)
        self._lock = threading.Lock()
        self._fx: tuple[float, float] | None = None   # (valor, momento)

    @property
    def busy(self) -> bool:
        return self._lock.locked()

    @staticmethod
    def params() -> Params:
        return Params.from_dict(db.setting_get("params"))

    # -------------------------------------------------------------- escaneo
    def start(self, universe_name: str | None = None, tickers: list[str] | None = None,
              tfs: list[str] = TIMEFRAMES, trigger: str = "manual", premarket: bool = False,
              notify: bool = True, wait: bool = False) -> int:
        """Lanza un escaneo en segundo plano (o espera si wait=True). Devuelve el id del escaneo."""
        if not self._lock.acquire(blocking=wait, timeout=1800 if wait else -1):
            raise Busy("ya hay un escaneo en curso")
        label = universe_name or "custom"
        scan_id = db.scan_start(label, tfs, trigger, len(tickers or []))
        th = threading.Thread(target=self._run_locked, daemon=True,
                              args=(scan_id, universe_name, tickers, tfs, premarket, notify))
        th.start()
        if wait:
            th.join()
        return scan_id

    def _run_locked(self, scan_id, universe_name, tickers, tfs, premarket, notify):
        try:
            self.run(scan_id, universe_name, tickers, tfs, premarket, notify)
        except Exception as ex:
            log.exception("escaneo %s falló", scan_id)
            db.scan_finish(scan_id, error=str(ex)[:500])
        finally:
            self._lock.release()

    def run(self, scan_id: int, universe_name: str | None, tickers: list[str] | None,
            tfs: list[str], premarket: bool = False, notify: bool = True):
        params = self.params()
        if tickers is None:
            db.scan_progress(scan_id, 0, "universo")
            tickers = universe.get(universe_name, cache=self.cache)
        tickers = sorted({t.strip().upper() for t in tickers if t.strip()})
        if not tickers:
            raise ValueError("universo vacío")
        with db.connect() as con:
            con.execute("UPDATE scans SET n_tickers=? WHERE id=?", (len(tickers), scan_id))

        # 1. descarga incremental de cada intervalo necesario
        sources = sorted({TF_CONFIG[tf]["source"] for tf in tfs})
        data: dict[str, dict[str, pd.DataFrame]] = {}
        for k, src in enumerate(sources):
            def prog(done, total, k=k, src=src):
                frac = (k + done / max(total, 1)) / len(sources)
                db.scan_progress(scan_id, frac * DOWNLOAD_WEIGHT, f"descargando {src} {done}/{total}")
            prog(0, len(tickers))
            data[src] = self.cache.update(tickers, src, progress=prog)

        # 2. evaluación
        db.scan_progress(scan_id, DOWNLOAD_WEIGHT, "evaluando")
        now = now_ny()
        rows, gone = [], []
        for tf in tfs:
            for t in tickers:
                raw = data[TF_CONFIG[tf]["source"]].get(t)
                if raw is None:
                    continue
                try:
                    res = evaluate(prepare(raw, tf, now), tf, params)
                except Exception as ex:  # un ticker con datos raros no para el escaneo
                    log.warning("%s %s: %s", t, tf, ex)
                    continue
                if res is None:
                    gone.append((t, tf))
                else:
                    rows.append({"ticker": t, "tf": tf, **res})

        # 3. precio pre-market de los candidatos (solo informativo)
        if premarket and hasattr(self.source, "premarket"):
            cands = sorted({r["ticker"] for r in rows if r["cumple"] >= SIGNAL_MIN_COND})
            pm = self.source.premarket(cands)
            for r in rows:
                if r["ticker"] in pm:
                    r["premarket"] = pm[r["ticker"]]

        db.save_latest(rows, scan_id)
        db.delete_latest(gone)

        # 4. señales nuevas y alertas
        to_alert = self.process_signals(rows, tickers, tfs)
        if notify and to_alert:
            context = f"{universe.UNIVERSES.get(universe_name, universe_name or 'custom')} · " \
                      f"{now.strftime('%d/%m %H:%M')} NY"
            # solo se marca como avisado si el push salió: si falla, el siguiente escaneo lo reintenta
            if notify.send_setups(to_alert, context):
                self.mark_alerted(to_alert)
        db.scan_finish(scan_id, n_results=len(rows), n_new=len(to_alert))
        log.info("escaneo %s: %d tickers, %d resultados, %d alertas", scan_id, len(tickers), len(rows), len(to_alert))

    @staticmethod
    def process_signals(rows: list[dict], tickers: list[str], tfs: list[str]) -> list[tuple[dict, bool]]:
        """Registra setups (>= 3/5) y devuelve los que hay que alertar: nuevos o que suben de nivel.

        No los marca como avisados: eso lo hace mark_alerted() cuando el envío funciona.
        """
        to_alert, seen = [], set()
        for r in rows:
            if r["cumple"] < SIGNAL_MIN_COND:
                continue
            key = signal_key(r)
            seen.add(key)
            prev = db.signal_get(key)
            prev_alerted = prev["alerted_cumple"] if prev else 0
            alert = r["cumple"] >= ALERT_MIN_COND and r["cumple"] > prev_alerted
            db.signal_upsert(key, r, alerted=False)
            if alert:
                to_alert.append((r, prev_alerted > 0))
        db.signals_deactivate(tickers, tfs, seen)
        to_alert.sort(key=lambda x: (-x[0]["cumple"], -x[0]["score"]))
        return to_alert

    @staticmethod
    def mark_alerted(items: list[tuple[dict, bool]]):
        for r, _ in items:
            db.signal_mark_alerted(signal_key(r), r["cumple"])

    # -------------------------------------------------------------- ticker individual
    def fx_eurusd(self) -> float | None:
        if self._fx and time.time() - self._fx[1] < FX_TTL:
            return self._fx[0]
        v = self.source.fx("EURUSD=X") if hasattr(self.source, "fx") else None
        if v:
            self._fx = (v, time.time())
        return v or (self._fx[0] if self._fx else None)

    def ticker(self, ticker: str) -> dict:
        """Ficha de un ticker: resultado y gráfico de las 3 temporalidades, POC histórico y precio actual."""
        ticker = ticker.strip().upper()
        params = self.params()
        data = {}
        for src in sorted({c["source"] for c in TF_CONFIG.values()}):
            age = self.cache.age_seconds(ticker, src)
            if self.busy or (age is not None and age < TICKER_FRESH_SECONDS):
                df = self.cache.load(ticker, src)
            else:
                df = self.cache.update([ticker], src).get(ticker)
            if df is not None:
                data[src] = df
        if not data:
            raise KeyError(ticker)

        now = now_ny()
        daily = prepare(data["1d"], "1d", now) if "1d" in data else None
        results, charts = {}, {}
        for t in TIMEFRAMES:
            raw = data.get(TF_CONFIG[t]["source"])
            if raw is None:
                continue
            ch = chart_payload(prepare(raw, t, now), t, params)
            res = ch["result"]
            results[t] = {"ticker": ticker, "tf": t, **res} if res else None
            charts[t] = ch
        db.save_latest([r for r in results.values() if r], None)
        # precio actual: último dato descargado, incluida la vela en curso (solo para la entrada por defecto)
        live = data.get("60m", data.get("1d"))
        price_now = round(float(live["Close"].dropna().iloc[-1]), 2) if live is not None else None
        return {"ticker": ticker, "results": results, "charts": charts, "hist_poc": hist_poc(daily),
                "price_now": price_now, "eurusd": self.fx_eurusd()}

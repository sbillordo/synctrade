"""SQLite (stdlib): escaneos, últimos resultados, señales, universos, favoritos y ajustes."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    universe TEXT NOT NULL,
    tfs TEXT NOT NULL,
    trigger TEXT NOT NULL,              -- cron | manual | ticker
    status TEXT NOT NULL,               -- running | done | error
    progress REAL DEFAULT 0,
    stage TEXT,
    n_tickers INTEGER DEFAULT 0,
    n_results INTEGER DEFAULT 0,
    n_new_signals INTEGER DEFAULT 0,
    error TEXT
);
-- último resultado de cada ticker y temporalidad (lo que muestra la UI)
CREATE TABLE IF NOT EXISTS latest (
    ticker TEXT NOT NULL,
    tf TEXT NOT NULL,
    scan_id INTEGER,
    updated_at TEXT NOT NULL,
    cumple INTEGER NOT NULL,
    score REAL NOT NULL,
    data TEXT NOT NULL,                 -- JSON completo del resultado
    PRIMARY KEY (ticker, tf)
);
-- histórico de setups (3/4 o más) con deduplicación para las alertas
CREATE TABLE IF NOT EXISTS signals (
    key TEXT PRIMARY KEY,               -- ticker|tf|swing_low_at|swing_high_at|fib
    ticker TEXT NOT NULL,
    tf TEXT NOT NULL,
    fib REAL NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    max_cumple INTEGER NOT NULL,
    alerted_cumple INTEGER DEFAULT 0,
    alerted_at TEXT,
    active INTEGER DEFAULT 1,
    data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS signals_ticker ON signals(ticker, tf);
CREATE TABLE IF NOT EXISTS universe_members (
    universe TEXT NOT NULL,
    ticker TEXT NOT NULL,
    PRIMARY KEY (universe, ticker)
);
CREATE TABLE IF NOT EXISTS universe_meta (
    universe TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS favorites (
    ticker TEXT PRIMARY KEY,
    added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_tokens (
    token TEXT PRIMARY KEY,
    platform TEXT,
    added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init():
    with connect() as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.executescript(SCHEMA)


# ------------------------------------------------------------------ escaneos
def scan_start(universe: str, tfs: list[str], trigger: str, n_tickers: int) -> int:
    with connect() as con:
        cur = con.execute(
            "INSERT INTO scans (started_at, universe, tfs, trigger, status, n_tickers) VALUES (?,?,?,?,?,?)",
            (utcnow(), universe, ",".join(tfs), trigger, "running", n_tickers))
        return cur.lastrowid


def scan_progress(scan_id: int, progress: float, stage: str):
    with connect() as con:
        con.execute("UPDATE scans SET progress=?, stage=? WHERE id=?", (round(progress, 3), stage, scan_id))


def scan_finish(scan_id: int, n_results: int = 0, n_new: int = 0, error: str | None = None):
    with connect() as con:
        con.execute(
            "UPDATE scans SET finished_at=?, status=?, progress=1, stage=NULL, n_results=?, n_new_signals=?, error=? "
            "WHERE id=?", (utcnow(), "error" if error else "done", n_results, n_new, error, scan_id))


def scans(limit: int = 20) -> list[dict]:
    with connect() as con:
        return [dict(r) for r in con.execute("SELECT * FROM scans ORDER BY id DESC LIMIT ?", (limit,))]


def scan(scan_id: int) -> dict | None:
    with connect() as con:
        r = con.execute("SELECT * FROM scans WHERE id=?", (scan_id,)).fetchone()
        return dict(r) if r else None


def mark_stale_scans():
    """Al arrancar, los escaneos que quedaron 'running' (reinicio del contenedor) pasan a error."""
    with connect() as con:
        con.execute("UPDATE scans SET status='error', error='interrumpido', finished_at=? WHERE status='running'",
                    (utcnow(),))


# ------------------------------------------------------------------ resultados
def save_latest(rows: list[dict], scan_id: int | None):
    now = utcnow()
    with connect() as con:
        con.executemany(
            "INSERT OR REPLACE INTO latest (ticker, tf, scan_id, updated_at, cumple, score, data) VALUES (?,?,?,?,?,?,?)",
            [(r["ticker"], r["tf"], scan_id, now, r["cumple"], r["score"], json.dumps(r)) for r in rows])


def delete_latest(pairs: list[tuple[str, str]]):
    """Quita resultados de tickers que ya no tienen impulso válido."""
    with connect() as con:
        con.executemany("DELETE FROM latest WHERE ticker=? AND tf=?", pairs)


def latest(tickers: list[str] | None = None, tfs: list[str] | None = None, min_cond: int = 0) -> list[dict]:
    sql, args = "SELECT data, updated_at FROM latest WHERE cumple >= ?", [min_cond]
    if tfs:
        sql += f" AND tf IN ({','.join('?' * len(tfs))})"
        args += tfs
    with connect() as con:
        rows = con.execute(sql + " ORDER BY cumple DESC, score DESC", args).fetchall()
    wanted = set(tickers) if tickers is not None else None
    out = []
    for r in rows:
        d = json.loads(r["data"])
        if wanted is None or d["ticker"] in wanted:
            d["updated_at"] = r["updated_at"]
            out.append(d)
    return out


# ------------------------------------------------------------------ señales
def signal_get(key: str) -> dict | None:
    with connect() as con:
        r = con.execute("SELECT * FROM signals WHERE key=?", (key,)).fetchone()
        return dict(r) if r else None


def signal_upsert(key: str, row: dict, alerted: bool):
    now = utcnow()
    with connect() as con:
        con.execute("""
            INSERT INTO signals (key, ticker, tf, fib, first_seen, last_seen, max_cumple, alerted_cumple, alerted_at, active, data)
            VALUES (:key, :ticker, :tf, :fib, :now, :now, :cumple, :ac, :aat, 1, :data)
            ON CONFLICT(key) DO UPDATE SET
                last_seen=:now, active=1, data=:data,
                max_cumple=MAX(max_cumple, :cumple),
                alerted_cumple=CASE WHEN :alerted THEN :cumple ELSE alerted_cumple END,
                alerted_at=CASE WHEN :alerted THEN :now ELSE alerted_at END
        """, dict(key=key, ticker=row["ticker"], tf=row["tf"], fib=row["fib"], now=now, cumple=row["cumple"],
                  ac=row["cumple"] if alerted else 0, aat=now if alerted else None, alerted=alerted,
                  data=json.dumps(row)))


def signal_mark_alerted(key: str, cumple: int):
    with connect() as con:
        con.execute("UPDATE signals SET alerted_cumple=?, alerted_at=? WHERE key=?", (cumple, utcnow(), key))


def signals_deactivate(tickers: list[str], tfs: list[str], keep: set[str]):
    """Marca como inactivas las señales de lo escaneado que ya no aparecen."""
    if not tickers or not tfs:
        return
    with connect() as con:
        rows = con.execute(
            f"SELECT key, ticker FROM signals WHERE active=1 AND tf IN ({','.join('?' * len(tfs))})", tfs).fetchall()
        scanned = set(tickers)
        gone = [(r["key"],) for r in rows if r["ticker"] in scanned and r["key"] not in keep]
        con.executemany("UPDATE signals SET active=0 WHERE key=?", gone)


def signals(active: bool | None = None, ticker: str | None = None, limit: int = 200) -> list[dict]:
    sql, args = "SELECT * FROM signals WHERE 1=1", []
    if active is not None:
        sql += " AND active=?"
        args.append(int(active))
    if ticker:
        sql += " AND ticker=?"
        args.append(ticker)
    with connect() as con:
        rows = con.execute(sql + " ORDER BY first_seen DESC LIMIT ?", args + [limit]).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["data"] = json.loads(d["data"])
        d["active"] = bool(d["active"])
        out.append(d)
    return out


# ------------------------------------------------------------------ universos
def universe_set(universe: str, tickers: list[str]):
    with connect() as con:
        con.execute("DELETE FROM universe_members WHERE universe=?", (universe,))
        con.executemany("INSERT OR IGNORE INTO universe_members VALUES (?,?)", [(universe, t) for t in tickers])
        con.execute("INSERT OR REPLACE INTO universe_meta VALUES (?,?)", (universe, utcnow()))


def universe_get(universe: str) -> tuple[list[str], str | None]:
    with connect() as con:
        rows = con.execute("SELECT ticker FROM universe_members WHERE universe=? ORDER BY ticker", (universe,))
        tickers = [r["ticker"] for r in rows]
        meta = con.execute("SELECT updated_at FROM universe_meta WHERE universe=?", (universe,)).fetchone()
    return tickers, meta["updated_at"] if meta else None


# ------------------------------------------------------------------ favoritos y ajustes
def favorites() -> list[str]:
    with connect() as con:
        return [r["ticker"] for r in con.execute("SELECT ticker FROM favorites ORDER BY ticker")]


def favorite_set(ticker: str, on: bool):
    with connect() as con:
        if on:
            con.execute("INSERT OR IGNORE INTO favorites VALUES (?,?)", (ticker, utcnow()))
        else:
            con.execute("DELETE FROM favorites WHERE ticker=?", (ticker,))


def setting_get(key: str, default=None):
    with connect() as con:
        r = con.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return json.loads(r["value"]) if r else default


def setting_set(key: str, value):
    with connect() as con:
        con.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (key, json.dumps(value)))


# ------------------------------------------------------------------ notificaciones push
def push_tokens() -> list[str]:
    with connect() as con:
        return [r["token"] for r in con.execute("SELECT token FROM push_tokens")]


def push_token_add(token: str, platform: str | None):
    with connect() as con:
        con.execute("INSERT OR REPLACE INTO push_tokens VALUES (?,?,?)", (token, platform, utcnow()))


def push_token_remove(token: str):
    with connect() as con:
        con.execute("DELETE FROM push_tokens WHERE token=?", (token,))

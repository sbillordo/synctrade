#!/usr/bin/env python3
"""CLI del screener (sustituye a screener_fibo.py; usa la misma caché y base de datos que la app).

  python cli.py --universe nasdaq100
  python cli.py --tickers AAPL MSFT NVDA --tf 4h 1d
  python cli.py --file mis_tickers.txt --min-cond 3 --csv
  python cli.py --universe nasdaq --notify       # NASDAQ líquidas + notificaciones push

Herramienta de cribado técnico, no es una recomendación de inversión.
"""
import argparse
import logging
import sys
from datetime import datetime

import pandas as pd

from app import db
from app.config import TIMEFRAMES
from app.core.evaluate import CONDITIONS, passes
from app.scanner import Scanner
from app.universe import UNIVERSES

COLS = ["ticker", "tf", "cumple", "score", "fib", "nivel", "precio", "dist_pct", "poc", "rsi", "rsi_min", "ewo",
        "c_fib", "c_poc", "c_rsi", "c_ewo", "c_gap"]


def main():
    p = argparse.ArgumentParser(description="Screener Fibonacci + POC + RSI + EWO")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--universe", choices=list(UNIVERSES))
    g.add_argument("--tickers", nargs="+")
    g.add_argument("--file", help="fichero con un ticker por línea")
    p.add_argument("--tf", nargs="+", default=TIMEFRAMES, choices=TIMEFRAMES)
    p.add_argument("--min-cond", type=int, default=5, help="condiciones mínimas (1-5)")
    p.add_argument("--ignore", nargs="*", default=[], choices=CONDITIONS, help="condiciones a ignorar")
    p.add_argument("--notify", action="store_true", help="enviar notificaciones push")
    p.add_argument("--csv", action="store_true", help="guardar también un CSV")
    args = p.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stderr)
    db.init()
    if args.file:
        tickers = [l.strip().upper() for l in open(args.file) if l.strip() and not l.startswith("#")]
    else:
        tickers = [t.upper() for t in args.tickers] if args.tickers else None

    scanner = Scanner()
    scan_id = scanner.start(args.universe, tickers, args.tf, trigger="manual", notify=args.notify, wait=True)
    s = db.scan(scan_id)
    if s["status"] == "error":
        sys.exit(f"Error: {s['error']}")

    members = tickers if tickers else db.universe_get(args.universe)[0] if args.universe != "favorites" else db.favorites()
    rows = [r for r in db.latest(members, args.tf) if passes(r, args.min_cond, ignore=args.ignore)]
    if not rows:
        print("Ninguna acción cumple las condiciones.")
        return
    out = pd.DataFrame(rows)[COLS]
    pd.set_option("display.width", 220)
    pd.set_option("display.max_rows", 500)
    print(out.to_string(index=False))
    if args.csv:
        fname = f"screener_{datetime.now():%Y%m%d_%H%M}.csv"
        out.to_csv(fname, index=False)
        print(f"\nGuardado en {fname}")


if __name__ == "__main__":
    main()

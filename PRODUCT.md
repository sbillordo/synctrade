# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Stack

FastAPI backend (Python) on the user's server, single Docker container, SQLite + Parquet cache, reachable only over Tailscale. Client: Expo (React Native, SDK 57, Expo Router) iOS app distributed through TestFlight with the user's Apple Developer account; the same code exports to web. Push notifications through Expo Push replace Telegram. The single-file HTML prototype in prototype/ is the approved reference.

## Users

One user: the owner, a discretionary swing trader. Uses it equally on the phone (opening a setup straight from a Telegram alert, deciding in under a minute whether it deserves a look in TradingView) and on desktop (longer sessions filtering the list and comparing setups).

## Product Purpose

SyncTrade scans US stocks (Nasdaq-100 by default, full NASDAQ on demand, or a single ticker) on 1h, 4h and 1d and surfaces pullback setups that meet four conditions:

1. **FIB**: price near the 0.618 or 0.786 retracement of the last impulse.
2. **POC**: volume-profile point of control above the tested fib level and price.
3. **RSI**: RSI(14) at or near the lower band (30; 35 counts as "about to touch").
4. **EWO**: Elliott Wave Oscillator negative.
5. **GAP**: no unfilled price gap since the swing low (daily gaps on 1d; session-opening gaps on 1h/4h). The user distrusts setups with open gaps because price tends to return to fill them.

Success: the user sees every candidate clearly, filters to "4 of 4", "3 of 4" or "ignore condition X", and validates a setup visually before opening TradingView.

## Positioning

A personal screener for one specific setup, showing each condition's real value next to the pass/fail, plus a trade plan, so the decision happens before the charting platform is opened.

## Operating Context

- Automated scans in New York time: 07:30 pre-market, then 5 min after each 1h bar closes (10:35–15:35), with 4h at 13:35 and the full close scan at 16:10.
- Push notification from the app: one notification per scan listing new setups (ticker · tf); tapping opens the ticker (single) or the list.
- Accessed only through Tailscale from the user's own devices.
- TradingView is the next step: every setup links to the chart with the right symbol and interval.

## Capabilities and Constraints

- Results per ticker and timeframe: fib level (0.618/0.786), level price, distance %, POC, RSI and RSI min over the last 5 bars, EWO, swing low/high, score 0–100 (heuristic), conditions met n/4.
- Trade calculator (no recommendation): entry defaults to the current price, stop defaults just below the tested 0.618 / 0.786 (or the next level below price), take profit defaults to the 0.618 trend-based extension from the retracement low (0.618 setups) or the swing high (0.786 setups); all editable. The user enters an amount in euros invested; the app shows shares, loss at stop and gain at TP in euros (EUR/USD from Yahoo). A toggle projects the long position on the chart like TradingView's position tool.
- POC of the swing (condition) plus an all-time POC from the full daily history (information only).
- Manual scan of a universe or a single ticker, with progress.
- Favorites, editable parameters (fib levels, RSI thresholds, EWO mode), signal history (new / active / expired).
- Only closed bars are evaluated; data comes from Yahoo Finance with roughly 15 min of delay.
- Must stay lightweight on a small personal server.

## Brand Commitments

- Name: **SyncTrade**.
- UI language: English. Technical terms stay as traders use them (RSI, EWO, POC, R:R, fib).
- Visual direction (chosen 2026-10-09): the category standard, a dark trading app, executed at full craft. Quality bar: TradingView mobile, Linear and Revolut / Trade Republic.

## Evidence on Hand

Real scan output from 2026-10-09 (Nasdaq-100): SBUX 1d 4/4, INTC 1h, NXPI 1h, NBIS 1h, QCOM 1h, ROST 4h/1d, TTWO 1d, STX 4h, ARM 1h, BKNG 1d, NVDA 1h at 3/4. No testimonials, users or performance claims exist; never fabricate win rates or returns.

## Product Principles

- Decision speed over decoration: the answer to "is this worth opening?" is visible without scrolling.
- Show the number behind every check; a pass/fail alone is not enough.
- Conditions are the user's lens: easy to require, relax or ignore.
- Never present the plan or score as advice; they are tools.

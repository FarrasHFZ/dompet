# IDX Swing Screener

Personal swing-trade screener for IDX stocks. Live: https://farrashfz.github.io/dompet/screener/ (after the first Pages deploy).

## How the pieces connect

```
                      ┌───────────────────────── GitHub (this repo) ─────────────────────────┐
 Yahoo Finance ──┐    │  Action, weekdays 17:30 WIB                                           │
 Google News RSS ┼──► │  tools/build-snapshot.mjs ── runs apps-script/*.gs engine in Node ──► │ web/data/latest.json ─► GitHub Pages ─► web app
 KSEI ≥1% holders┘    │  + logs picks to data/history (forward test)                          │                                      ▲
                      └───────────────────────────────────────────────────────────────────────┘                                      │ optional "Source"
 GOOGLEFINANCE ──► Google Sheet ──► Apps Script (same engine) ──► Screener/News tabs + doGet JSON ───────────────────────────────────┘
                   (Universe, Themes, Config = your control panel; journal)
```

| Piece | Role |
|---|---|
| `apps-script/Indicators.gs` | The engine: indicators, support/resistance, score, narrative. Pure JS. **Single source of truth**: Node loads this very file (`tools/lib.mjs`). |
| `apps-script/News.gs` | Headline classifier (category, direction, roundup detection) and per-stock news score. |
| `apps-script/Code.gs` | Sheet glue: menu, GOOGLEFINANCE fetch, Screener tab, Telegram digest, `doGet` JSON API. |
| Google Sheet | Control panel (Universe, Themes, Config) + readable output + your notes. |
| `tools/` | Node scripts: snapshot build, backtest, news scoring, ownership. |
| `web/` | Static web app (no build step). Reads `data/latest.json`, or your Sheet's `doGet` URL. |

Without the Sheet, everything still runs from GitHub. The Sheet is worth keeping as the place you edit the universe and news themes, and as a notebook. Both paths emit the same JSON shape.

## What the measurements say (tools/backtest.mjs, tools/news-score.mjs)

27 liquid IDX stocks, 5 years of daily bars, walk-forward (score uses only past data), outcome = next 15 trading days.

- The first score (trend + momentum + breakout) had **no, slightly negative** predictive value. Trend/breakout chasing lost; short-term reversals worked. It was replaced.
- The v2 oversold-bounce score: top bucket (65+) hit +8%-before-stop **30%** vs 23.5% baseline, avg 15-day move **+1.1%** vs -0.2%; monthly rank-IC +0.09 (t≈4.8). Holds in the later half of the data (IC 0.13).
- It is a weak edge, not a money machine: with the plan's stop and 0.4% fees, expectancy per trade is roughly zero to +0.5%, and tight stops erase it (so the default stop is 2.5 ATR).
- The edge sits in **market-wide capitulation** (many names oversold at once); a lone oversold stock showed ~none. The app shows breadth for that reason. The number of independent episodes is small (about 18 months), so treat this as a hypothesis the forward test must confirm.
- News: not backtestable (no historical archive). Classifier accuracy on a fresh hand-labelled holdout: ~90% category, ~71% direction precision, ~52% recall. Relevance fix: a stock is tagged only if the headline names it; market wraps are down-weighted.
- Live forward test: every run appends picks to `data/history/`; after 15 trading days they are scored and shown on the Scorecard tab.

## Data you can add

| Data | Source | Status |
|---|---|---|
| Shareholders ≥1% | KSEI via IDX, monthly PDF (since Feb 2026). `tools/ownership.mjs` reads a community CSV conversion; direct route = parse IDX's PDF with pdfplumber in a monthly Action. | In app (context only: monthly, gaps for some state stakes) |
| Broker summary / foreign flow | IDX shows it on its site but has no public API and returns 403 to scripts. Vendors (Index Alpha, Invezgo, Sectors, GoAPI…) sell it. Cheapest plan found is about Rp200k/month; test any free tier first. | Not added. Add only after a backtest shows it helps |
| Fundamentals (P&L) | Yahoo fundamentals-timeseries: ~5 quarters of revenue, net income, equity for all 27 tickers. IDX filings (XBRL/Excel/PDF) are the official source but scripts get 403. | In app (context only, not scored: no point-in-time history to backtest it) |

## The Sheet
Sheet: https://docs.google.com/spreadsheets/d/1Jx8BhKPjgwVIPy2RscS8ULYvcltB8AqumdOMBfaBUHk/edit (account farrashafizh22@gmail.com, same as Dompet)
Script: https://script.google.com/d/1ZhRytpT--7paWSvmyqGBlQR8Gp_elY-8qNX6qDh5E5Ee4N3b0XJrKowZ/edit (pushed, version 1 deployed as web app).
First run needs a one-time Google authorization click, done from the Sheet menu.

## Deploy the Sheet side
Uses the `personal` clasp profile (separate from Dompet's script):

    cd swing-screener/apps-script
    clasp create --type sheets --title "IDX Swing Screener" --user personal
    clasp push --user personal

Open the Sheet, reload, menu **IDX Screener**: 1. Setup sheets, 2. Refresh news, 3. Run screener, Install daily triggers.
To serve JSON to the web app: Project Settings → Script Properties → `API_TOKEN`; Deploy → Web app (execute as you, anyone). Optional Telegram digest: `TG_TOKEN`, `TG_CHAT`.

Known limits: `IDX:COMPOSITE` for IHSG in GOOGLEFINANCE is unverified; GOOGLEFINANCE lags; Apps Script caps a run at 6 minutes (about 30-40 tickers). The Sheet path was smoke-tested against an in-memory fake (`tools/mock-sheet-test.mjs`), not yet inside Google.

## Commands
    node tools/build-snapshot.mjs      # rebuild web/data/latest.json
    node tools/backtest.mjs            # walk-forward test of the score
    node tools/news-score.mjs          # classifier accuracy vs hand labels
    node tools/ownership.mjs           # refresh data/ownership.json
    node tools/mock-sheet-test.mjs     # smoke-test the Apps Script entry points
    node tools/serve.mjs               # preview web/ on :5174

Not financial advice.

## Telegram alerts
What you get (one digest per run, only new items, never repeated): new risk / commissioner or director / insider-buying / government-investment / corporate-action / contract / earnings headlines about today's ACT picks and `data/watchlist.json`, sector-wide government or risk news for those picks' sectors, and once per signal day which stocks entered or left ACT.

1. Telegram → **@BotFather** → `/newbot` → copy the token.
2. Open your new bot and press **Start**.
3. `TG_TOKEN=<token> node tools/telegram-setup.mjs` (PowerShell: `$env:TG_TOKEN='<token>'; node tools/telegram-setup.mjs`) prints your chat id and sends a test message.
4. `gh secret set TG_TOKEN` and `gh secret set TG_CHAT_ID` (each prompts for the value).
5. Next workflow run sends a "connected" message and starts alerting. Add tickers to `data/watchlist.json`, e.g. `["BBCA","TLKM"]`.

`node tools/alerts-test.mjs` shows what would be sent, without sending anything.

## On your phone
Open https://farrashfz.github.io/dompet/screener/ and install it: iPhone Safari → Share → *Add to Home Screen*; Android Chrome → menu → *Install app*. It opens full-screen with its own icon, a bottom tab bar and one card per stock, and shows the last data when offline. This is a web app (PWA), not an App Store app.

## Out-of-sample check
`HOLDOUT=1 node tools/backtest.mjs` runs the same score on 40 IDX stocks that were not used to design it (`tools/holdout-universe.json`). The edge replicates but smaller (top bucket +0.9% vs 0.0% baseline, IC 0.08), and expectancy after stops and fees is about zero.

## Universe and news coverage
- **Universe: 100 stocks** (`UNIVERSE_SEED` in `apps-script/Code.gs`). The score was designed on 27 of them (`tools/design-universe.json`); the other 73 are out-of-sample (`HOLDOUT=1 node tools/backtest.mjs`).
- **News: a rolling 35-day archive**, 30 days shown. One Google News query returns at most ~100 items, which for an active stock covers only 2-3 weeks, so `tools/news.mjs` splits each query into date windows and halves any window that hits the cap, down to single days. First runs back-fill the month in resumable chunks (progress survives in the CI cache and in the published `data/news-30d.json`); after that hot stocks (top 30 by liquidity, ACT picks, watchlist) and themes refresh hourly and everything every 6 hours.
- Coverage is measured, not assumed: the News tab shows headlines per day, stocks with news, and which stocks are thin.
- Limit: this is what Google News indexes, not every Indonesian outlet. Scoring still uses only the last 7 days (with decay); the month is for context and search.

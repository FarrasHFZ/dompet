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
    node tools/flow-daily.mjs          # NeoBDM snapshot -> public flow labels + forward-test scorecard
    node tools/experiment-flow.mjs     # 4-year IDX foreign-flow backtest of ACT

Not financial advice.

## Broker-flow workflow (NeoBDM + IDX foreign flow)
Goal: read who is buying (bandar, non-retail, institution, sultan, foreign) and who is on the other side (retail), every
day, the same way, and only let that read change a pick once it has proven itself out of sample.

**The read** (`tools/flow-model.mjs`, rules fixed 2026-10-09, versioned): big money = Bandar, Non-retail, Institution and
Sultan, weighted, each at half weight when NeoBDM rates its method a poor fit for the stock (compatibility < 0.5). Flows are
the group's net buy as a share of turnover over 5 and 20 sessions. Phase = 20-day big money against the 20-day price move:
accumulation (buying into weakness, the case that matters for an oversold bounce), markup, distribution, markdown,
neutral. Retail moving against big money confirms the transfer. Crossing or Clean <= -3 halves everything. Tag: FLOW+,
FLOW~, FLOW-, or AVOID (Pinky or illiquid).

**Daily, after NeoBDM updates (about 19:00-22:00 WIB):**
1. `node tools/flow-receiver.mjs` (local only, port 5175)
2. In Chrome, logged in, open `https://neobdm.tech/new-market-summary/` and run `tools/neobdm-pull.js` (DevTools console,
   or ask Claude in Chrome). About 2 minutes: 20 page reads of the `swing-screener` screener on the `swing-100` stock list,
   then the tab hands the data to the receiver -> `data/neobdm-snap/DATE.json` (git-ignored, paid data).
3. `node tools/flow-daily.mjs` -> `data/neobdm-tags-DATE.json` (directions only, public) and `data/flow-scorecard.json`.
4. Commit those two files and push. The site's **Broker flow** tab and each pick's NeoBDM section update on the next build.

Missed days are fine, but labels older than 5 days stop affecting badges automatically.

**2-year replay (2026-10-10, `tools/nb-hist-pull.js` -> `tools/experiment-nb.mjs`, pre-registered and committed before
the pull).** NeoBDM's stock pages embed their Transaction Chart: each group's cumulative net value per session, about 474
sessions back (from 2024-10). Group flow over w sessions / Yahoo turnover reproduces the screener's `<g>_cn_<w>` columns
(checked against the 2026-10-09 snapshot to 4 digits), so the flow model can be replayed on 454 sessions x 100 stocks. The
Inventory Analysis API adds daily net lots per broker for 1 year (max 10 brokers per call; each stock's 20 most active
brokers by gross value). About 400 requests at 3-5 s spacing, stopping at the first error; raw data stays local
(`data/nb-history.json`). Results:
- T1 (the forward checklist, replayed): FLOW+ minus FLOW- -0.13% per 5 sessions (adjusted t -0.5), halves +0.18 / -0.43,
  15 sessions -0.14 -> **fail**. "Accumulation" stocks did -0.18% vs the field (t -2.6).
- T2 (FLOW- as a veto on ACT): per episode FLOW- looked worse (t 2.2) but by day the sign flipped (t -0.5), unseen ~0 and
  the second half reversed -> **fail**. On the live trade (ACT + bounce candle) FLOW- bounces did +0.80% vs -0.44% for
  neutral flow; the veto would have cut the account from +7.3% to +0.1% a year.
- T3 (FLOW+ ranks first), T4 (accumulation vs distribution), T5 (broker concentration: top 3 buyers + top 3 sellers) -> **fail**.
- Exploratory (`tools/explore-nb.mjs`): 5-session bandar buying came before slight underperformance (rank IC -0.037, t -2.9;
  -0.027 after removing the price move), only in the second year. Now forward-tested as hypothesis C1 in
  `tools/flow-forward.mjs` (bandar-sold-most third minus bought-most third; 60 days, adjusted t >= 2, both halves).

So the ACT+ / ACT? sub-badges were retired: they implied flow-up bounces were better, which the replay contradicts.
Public outputs: `data/nb-study.json` (aggregates) and `data/nb-history-tags.json` (60-session FLOW+/~/- strip per stock,
extended by `flow-daily.mjs` each day). Re-run order: pull, `node tools/experiment-nb.mjs`, then `node tools/explore-nb.mjs`
(it adds its block to nb-study.json).

**What flow may do, and when that changes.** Today: veto (Pinky, illiquid -> SKIP) only; flow is shown as context. It may
not promote a pick. `tools/flow-forward.mjs` scores every saved snapshot 5 and 15 sessions later against the same-day
average, and prints a promotion checklist fixed in advance: at least 60 resolved days and 150 FLOW+ stock-days,
FLOW+ minus FLOW- 5-session spread with overlap-adjusted t >= 2 (t / sqrt(5), since consecutive days share 4 of 5
sessions), positive in both halves, and a positive 15-session spread. Earliest possible pass: about 65 trading days of
snapshots (mid-January 2027). Only then change `tierOf` in `tools/neobdm.mjs`, deliberately, as a new version.

**Foreign flow has 4 years of free history** (IDX daily stock summary: foreign buy/sell per stock). `tools/experiment-flow.mjs`
tests whether 5-day foreign net buying improves ACT trades, with the decision rule written in the file before the run;
its result is published as `data/flow-experiment.json`. Result (2026-10-09, 982 trading days, 3,319 ACT signals): raw
gap +0.75 points per trade for F5 > 0 (t=2.2), but only +0.39 (t=0.9) clustered by day and +0.20 (t=0.3) with one trade
per stock episode. Not adopted; foreign flow stays a small part of the NeoBDM note. Across all stocks (not just ACT) it
predicts nothing (monthly rank IC -0.01). Refresh: open `https://www.idx.co.id/en/market-data/trading-summary/stock-summary`
in a normal browser tab (plain scripts get a Cloudflare 403; this repo does not try to get around that), pull days into
the page's IndexedDB, export, then `node tools/idx-flow-import.mjs <export>`.

NeoBDM limits: the screener has today's values only (history comes from the stock pages, ~2 years, and the
inventory API, 1 year, see above), screener max 15 columns, 20 rows per page; a bulk pull of every
column (~1,700 requests) got a 429 block on 2026-10-07. The daily pull stays at about 24 requests at human pace and stops
at the first rate-limit answer.

## Conglomerate groups and rotation (Groups tab)
The market habit of playing a conglomerate's stocks together ("saham PP", "saham Haji Isam", Bakrie, MNC...) and then
rotating to another group. `tools/groups-map.json` is the hand-curated map (16 groups: Prajogo/Barito, Haji Isam/Jhonlin,
Happy Hapsoro, Aguan, Salim, Sinar Mas, Djarum, Astra, Thohir-Saratoga, Bakrie, MNC, Lippo, Emtek, Triputra, Medco, BUMN).
`node tools/groups.mjs` checks every link against the latest KSEI >=1% holder file and writes `data/groups.json` with the
holder line as evidence (a `*` marks a known link whose holding company is not named, e.g. DEWA, BNBR, MLPL, state banks
held through Danantara). Re-run it when a new monthly KSEI file appears; edit the map to add a group or member.

Group index = equal-weight daily return of members trading >= Rp 1 B/day (60-session average), from a member's `since`
date. The build (hourly) prices every member, including those outside the 100, and publishes: rank by 20-session return
vs the IHSG, rotation quadrant (leading / weakening / lagging / improving), a 26-week rank heatmap, "hot" groups (index
+10% in 5 sessions within the last 10), and each pick's group in its story.

**Study** (`tools/experiment-groups.mjs`, pre-registered in commit 286bd9b, 2022-01..2026-10):
- Group stocks do co-move beyond sector: same-group pairs correlate 0.32 vs 0.25 for same-sector pairs in different groups.
- Rotation is fast: a group stays in the top 3 for a median of 2 weeks; the #1 group changed in 105 of 225 weeks.
- H1 (primary) top-3 minus bottom-3 groups over the next 20 sessions: +1.67%, both halves positive, adjusted t 1.2 -> no
  reliable momentum or reversal.
- H3 oversold bounces in leading/improving groups vs lagging/weakening: +0.55% vs +0.22% per trade, t 0.5 -> fail; the badge
  is unchanged.
- H4 (secondary, bar 2.5) after a group index jumps >= 10% in 5 sessions: +2.17% vs IHSG over the next 10 sessions,
  t 2.7, 173 cases, both halves positive -> pass. Same-day cases overlap, so certainty is lower than t says; it failed for
  Haji Isam, Aguan and Emtek. Shown as a "hot group" note (a momentum observation, not the screener's trade); events after
  2026-10-10 are scored automatically on the Groups tab as the live record.
Caveat: membership is today's for the whole period (dated exceptions in the map), which flatters older history.

## Bandarmetrics read (context only)
Bandarmetrics (bandarmetrics.com, paid) has history back to 2022 for its own indicators, so unlike NeoBDM it could be
backtested. What each one is, from its "Panduan Kombinasi Indikator" and the app's own code:

| Indicator | Question it answers | How it is read here (`tools/bm-model.mjs`) |
|---|---|---|
| LPM, Liquidity Pressure Model (`q3_200`) | Where to? Cumulative pressure from large orders; leads price; wins every conflict | 20-session change vs its own past year: rising / flat / falling (±0.25 sd) |
| Intensity (`momentum`) | When? How aggressively large orders are being split; timing only, never direction | spike = last 3 sessions above the 90th percentile of the prior 120 |
| Volume Rotation (`volume_ratio`) | How healthy? Efficiency of the transfer | BM's own bands: <=3 efficient, <=7 fading, >7 churn |
| Money Flow (`bai`) | Short-term lens of top buyers/sellers, for locally-driven stocks | 10-session change |
| Foreign Flow (`ff`) + Corr F / Par F | Lens for foreign-driven stocks (participation > 20-30%, correlation > 0.5) | from IDX data: Par F 180d >= 25% and return~net-foreign corr 120d >= 0.5 |

The read chains them as BM does: LPM direction, then the lens confirms (accumulation confirmed / building, distribution
confirmed / starting, hidden distribution, churn, flat).

**Result** (`tools/experiment-bm.mjs`, rules fixed before the run, 2022-10..2026-09, 3,319 ACT signals): no test passed.
LPM rising vs not among ACT trades: -0.05 points per trade (t=-0.1); accumulation vs distribution +0.11 (t=0.2); Intensity
spike or lens confirmation on top of LPM rising made trades slightly worse; the bounce-candle subset -0.31. Exploratory
checks across all stocks and at 20/40/60 sessions found no significant edge (best: LPM rising +0.96% excess at 60
sessions, t=1.6). So the read is shown beside each pick and in the Broker flow tab as context and a warning, and never
changes a badge.

**Experimental accumulation score** (`tools/experiment-bm-score.mjs`): instead of BM's rules, input weights were learned on
Apr 2023 - Sep 2024 and judged on Oct 2024 - Sep 2026 only. Trained on ACT trades it kept one input, the 60-session LPM trend;
out of sample the top half beat the bottom half by +0.49/trade (t=0.7), +1.03 by day (t=1.9), +0.95 on unseen stocks: right
direction everywhere, below the bar. It is shown as a 0-100 rank (today's percentile across the 100 stocks), logged in the
ledger as `bmScore` and tracked live in Track record ("By Bandarmetrics accumulation score"). It never changes a badge.

**Refresh (daily, by the scheduled evening task; labels go stale after 10 days):** start `node tools/flow-receiver.mjs`; in a logged-in
Bandarmetrics chart tab paste `tools/bm-pull.js`, set `__bmStart` to ~60 days back, `await __bmReset()`, switch the chart's
stock once, then repeat `await __bmBurst(38000)` until all 100 are stored (switch stock again after a 401); export with
`__bmChunk(0, 100)` to `bm-snap/<date>.json` through the receiver's `/upload` page; run `node tools/bm-labels.mjs`; commit
`data/bm-tags-<date>.json`. Raw Bandarmetrics data (`bm-history.json`, `bm-snap/`) stays local.

## v4 study: filings, fundamentals, exits, portfolio, market filter (`tools/experiment-v4.mjs`)
New data: IDX company announcements (20.7k, 2023-07..; `tools/ann-pull.js` in a browser tab, `tools/ann-import.mjs`) and Stockbit
quarterly revenue / net income (24 quarters, read from the logged-in financials page; used point-in-time from each
report's IDX release date). Raw files stay local; `data/idx-filings-recent.json` (last 45 days, meaningful types) is public.

Pre-registered tests on the live trade (rules in the file header): no filing type (capital raise, buyback, IDX query,
dividend, report release), no fundamental (profitable TTM, revenue or profit growth) and no exit change (20-day-average
target, 10/20-day hold, breakeven stop) passed. Filings are shown as context.

Portfolio test (max 5 positions, 20% each, fees): 2022-10..2026-10 the live rule made -3.4%/yr (worst drawdown -37%),
about the IHSG (-3.1%/yr). The edge is relative, not absolute. Walk-forward market filter: chosen on 2022-10..2024-09
among IHSG > 50-day / > 200-day / no -5% month, then judged on 2024-10..: **IHSG > 200-day average** gave +6.3%/yr vs 0.0%
and -12.7% vs -36.8% drawdown -> adopted (tier PAUSE when off). Full period with idle cash at 4.5%: +2.6%/yr, -12.7%.
Robustness: every window (100-250 days) and position count (3/5/8) cut drawdown; returns are noisier. Not adopted but
noted: more, smaller positions (8) helped in every variant.

## Big buyers' cost lines (`tools/broker-cost.mjs`, context only)
From NeoBDM's per-broker inventory (`tools/nb-inv-pull.js` -> `data/nb-inventory.json`, local; 1 year, each stock's 20
most active brokers by gross value): find the highest-volume session of the last 60, then per broker since that peak the
net lots and the average BUY price. The cost line = average buy price of the top 3 net buyers; plus who they are
(one broker / a few / broad, and broker type), how big the buying is (share of lots traded) and whether they are still
in (adding / holding / unloading over the last 5 sessions). Shown on every stock page ("Who's buying, and at what
cost"), on the trade map, and in the coverage panel. Public data carries broker TYPES, not codes (codes stay in
`data/broker-cost-local.json`). Refreshed on a weekly rotation (a fifth of the universe each evening, step A4c).

**Broker names and classes** (`tools/broker-directory.mjs` -> `data/broker-directory.json`): official names from the
IDX member list (`tools/idx-brokers.json`, 89 members). Classes are written down from what each firm is: retail
(mass-market apps and bank brokers: XL Stockbit, XC Ajaib, PD Indo Premier, YP Mirae, SQ BCA, NI BNI, KK Phillip, EP MNC,
CP KB Valbury, RO Pluang, GI Webull), foreign institutional (AK UBS, BK JP Morgan, ZP Maybank, KZ CLSA, RX Macquarie,
DP DBS, ...), mixed (CC Mandiri, YU CGS: big retail and institutional books), local (all other local houses). Then
checked against behaviour: each broker's daily net buying vs NeoBDM's foreign flow and Bandar estimate, averaged over the
stocks where it is active. Retail brokers trade against that money (correlation -0.2 to -0.45), foreign desks with it
(+0.14 to +0.5); CC Mandiri is neutral, hence "mixed". "Bandar" is treated as a behaviour, not a broker: per stock,
the driver is "one local player (bandar-style)" when a single local non-retail broker did >= 50% of the net buying since
the volume peak, "retail crowd" when retail brokers did >= 60%, etc. Names and codes are public on the site (the user
asked for them on 2026-10-10).

Pre-registered test (`tools/experiment-brokercost.mjs`, commit c4512c3, Jan-Sep 2026 signals on the tested 100):
near a holding accumulator's cost vs the rest -2.32% vs -1.92%/trade (t -0.3) -> fail; >5% below their cost vs not
-> fail; unloading almost never triggered. A falling market and ~50 vs 260 episodes: too little data to prove anything
either way. So it never changes a badge; it is the "who and at what price" context for your own conviction.

## Position count (adopted 2026-10-10, `tools/experiment-sizing.mjs`)
Walk-forward, pre-registered (commit before the run): candidates max 3 / 5 / 8 / 10 equal-weight positions and a
risk-based variant (1.5% of equity at the stop, max 8), all with the market filter and 4.5% idle cash, live rule on the
tested 100. Picked on 2022-10..2024-09: **10 positions** (+6.9%/yr, DD -4.7%). Checked on 2024-10..: +6.8%/yr vs +6.3%
for 5, drawdown -8.7% vs -12.7% -> adopted. Full period +6.5%/yr, DD -8.7% (5 positions: +2.6%, -12.7%).
The site uses it: each oversold stock page has a "How much to buy" box (account size kept in the browser; lots of
100, 0.4% fees, loss at the stop and gain at the target) and a **Paper-trade this** button feeding a local journal in
Track record. The market-filter banner shows how far the IHSG is from its 200-day average and how fast that average is
moving, and Telegram announces the day the filter flips.

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

## Stock chart and call markers
Tapping a stock opens its page (full screen on a phone) with a candle chart: 1H / 4H / 1D / 1W, volume, MA20 / MA50, and
the plan levels. Each Pages run writes `web/data/ohlc/<TICKER>.json` (`tools/ohlc.mjs`: ~2 years daily, ~3 months hourly
from Yahoo; 4H and weekly are merged in the browser; not committed). `tools/signals.mjs` replays the live rules over the
daily bars and marks every **ACT call** (buy next open, wide stop, plan target, 15 sessions), its **TP / SL / 15-day exit**,
and each **oversold spell that never got an ACT badge** (WAIT / PAUSE / SKIP / THIN). The newest day uses the live badge;
earlier days use neutral news and no NeoBDM veto, so they are replays, not calls the site made at the time. An open trade
draws its own entry / TP / SL lines and a status box ("near TP" / "near SL" within 2%). Chart only: nothing here changes a
score. `node tools/ohlc-local.mjs` builds the files from cached prices for a local preview.

## Out-of-sample check
`HOLDOUT=1 node tools/backtest.mjs` runs the same score on 40 IDX stocks that were not used to design it (`tools/holdout-universe.json`). The edge replicates but smaller (top bucket +0.9% vs 0.0% baseline, IC 0.08), and expectancy after stops and fees is about zero.

## Universe and news coverage
- **Universe: 300 stocks** (`UNIVERSE_SEED` in `apps-script/Code.gs`). The score was designed on 27 of the original 100 (`tools/design-universe.json`); the other 73 are out-of-sample (`HOLDOUT=1 node tools/backtest.mjs`).
- **The 200 added on 2026-10-10** (`tools/expand-universe.mjs`: next 200 by median traded value over 120 sessions, no stock with
  more than 5 zero-volume sessions or a price under Rp 50; sector from Yahoo's industry with hand fixes) were a clean holdout.
  Pre-registered test (`tools/experiment-expand.mjs`, commit e1018d8): live rule vs other stocks +0.83%/trade, t 1.4,
  negative by day -> **fail** (original 100: +1.07%, t 3.0, pass). As an account, adding them turned +2.6%/yr into -10.2%,
  drawdown -13% -> -38%. So their setups are tiered **SKIP** (marked "new"), they are never announced on Telegram, and the
  ledger logs them with `set: 'new'` so the live record stays the tested 100 (their own record is kept separately).
  They still feed groups, news and the rankings. About half trade under Rp 5 B/day and are skipped as illiquid by the engine.
  Broker flow for them comes from their NeoBDM **stock pages** (`tools/nb-pages.mjs`): the Transaction Chart gives each
  group's cumulative net value, which reproduces the screener columns, so the same flow model labels them without
  changing the `swing-100` list in the NeoBDM account (200 page reads in the evening task, step A4b). Labels say
  "stock page" because method-fit, dirty-tape and Pinky flags are not on the page. Bandarmetrics still covers the
  original 100. The Sheet path does not know about the SKIP rule yet.
- **News: a rolling 35-day archive**, 30 days shown. One Google News query returns at most ~100 items, which for an active stock covers only 2-3 weeks, so `tools/news.mjs` splits each query into date windows and halves any window that hits the cap, down to single days. First runs back-fill the month in resumable chunks (progress survives in the CI cache and in the published `data/news-30d.json`); after that hot stocks (top 30 by liquidity, ACT picks, watchlist) and themes refresh hourly and everything every 6 hours.
- Coverage is measured, not assumed: the News tab shows headlines per day, stocks with news, and which stocks are thin.
- Limit: this is what Google News indexes, not every Indonesian outlet. Scoring still uses only the last 7 days (with decay); the month is for context and search.

## Track record: how the method is kept honest
- Every signal day the build logs **all** ranked stocks (not only ACT) to `data/history/`.
- `tools/tracker.mjs` replays each logged signal against later prices with realistic rules: entry at the **next session's open**, the plan's stop/target price levels, 15 trading days, a bar touching both stop and target counts as a loss, gaps fill at the open, 0.4% fees, one position per stock at a time.
- ACT picks are compared with the **rest of the universe on the same days** (control group): a win rate only means something next to the base rate.
- Shown on the *Track record* tab: win rate with a 95% range, average net return, profit factor, open and closed trades, and breakdowns by setup, score, market regime, RSI, news, sector and stock.
- Telegram sends a message when an ACT trade hits its target, is stopped out, or expires.
- `node tools/tracker-replay.mjs` replays the last ~270 days through the same tracker (not live; today's universe, neutral news). Result of the first replay: ACT hit the +8% target 36% of the time vs 37% for the rest (no edge by that measure) and the average trade lost 0.8% net. Holding 15 days with no stop did better (ACT +0.3% vs rest -0.2% net), which is the same small edge the earlier backtest found.

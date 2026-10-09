// Builds web/data/latest.json: runs the same engine as the Sheet (apps-script/*.gs) on Yahoo prices + Google News.
// Also appends today's picks to data/history/ (forward-test ledger) and scores older entries against what happened.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
import { refreshNewsStore, newsCoverage, archiveForWeb } from './news.mjs';
import { buildOwnership } from './ownership.mjs';
import { fetchFundamentals } from './fundamentals.mjs';
import { runAlerts } from './alerts.mjs';
import { buildTracker, readLedger } from './tracker.mjs';
import { loadNeobdm, tierOf } from './neobdm.mjs';

const cfg = { targetPct: +(process.env.TARGET || 8), horizon: +(process.env.HORIZON || 15), stopMult: +(process.env.STOPMULT || 2.5), minValueB: 5 };
const api = loadEngine();
const uni = universe(api);
const OUT = path.join(ROOT, 'web', 'data');
const HIST = path.join(ROOT, 'data', 'history');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(HIST, { recursive: true });

const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '2y', process.env.USE_CACHE === '1');
// Intraday: Yahoo's last daily bar is today's partial bar. The score was validated on completed closes, so signals use the
// last completed bar and today's partial bar is shown only as a live quote.
const NOW = process.env.FAKE_NOW ? new Date(process.env.FAKE_NOW).getTime() : Date.now(); // FAKE_NOW: test hook for the intraday path
const wib = new Date(NOW + 7 * 3600e3);
const todayWib = wib.toISOString().slice(0, 10);
const wibMin = wib.getUTCHours() * 60 + wib.getUTCMinutes();
const sessionOpen = wib.getUTCDay() >= 1 && wib.getUTCDay() <= 5 && wibMin >= 9 * 60 && wibMin < 16 * 60 + 15;
const live = {};
function splitLive(sym, b) {
  if (!b || b.c.length < 2) return b;
  const n = b.c.length;
  if (!(sessionOpen && b.d[n - 1].toISOString().slice(0, 10) === todayWib)) return b;
  live[sym] = { price: b.c[n - 1], prev: b.c[n - 2], chg: b.c[n - 1] / b.c[n - 2] - 1, high: b.h[n - 1], low: b.l[n - 1], volume: b.v[n - 1] };
  const cut = a => a.slice(0, n - 1);
  return { d: cut(b.d), o: cut(b.o), h: cut(b.h), l: cut(b.l), c: cut(b.c), v: cut(b.v) };
}
Object.keys(px).forEach(k => { px[k] = splitLive(k, px[k]); });
const idx = px['^JKSE'] ? px['^JKSE'].c : null;
if (!uni.some(u => px[u.ticker + '.JK'])) throw new Error('no price data fetched');

// Hot stocks get news every run (hourly); the rest on a 6-hourly full sweep. Hot = most liquid 30 from the last published
// snapshot + current ACT picks + the watchlist.
let prevPicks = [];
try { prevPicks = JSON.parse(fs.readFileSync(path.join(OUT, 'latest.json'), 'utf8')).picks || []; } catch { /* first build */ }
let watch = [];
try { watch = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'watchlist.json'), 'utf8')).map(t => String(t).toUpperCase()); } catch { /* none */ }
const hot = [...new Set(prevPicks.slice().sort((a, b) => b.valueB - a.valueB).slice(0, 30).map(p => p.ticker)
  .concat(prevPicks.filter(p => p.action === 'ACT').map(p => p.ticker), watch))];
const hourUtc = new Date(NOW).getUTCHours();

let newsRows = [], newsStatus = { state: 'error', note: 'News fetch crashed; see build log.' }, newsBackfill = {}, newsKeys = 0;
try {
  ({ rows: newsRows, status: newsStatus, backfill: newsBackfill, keys: newsKeys } = await refreshNewsStore(api, uni, {
    storeFile: path.join(ROOT, 'data', 'news-store.json'), legacyFile: path.join(ROOT, 'data', 'news-cache.json'), hot, fullSweep: hourUtc % 6 === 0,
  }));
} catch (e) { console.error('news failed', e.message); }
console.log('news:', newsStatus.state, '-', newsStatus.note);
const coverage = newsCoverage(api, uni, newsRows, newsBackfill, newsKeys);
console.log(`news coverage: ${coverage.headlines} headlines / 30d, ${coverage.tickersCovered}/${coverage.tickers} stocks, ${coverage.daysWithNews}/30 days, oldest ${coverage.oldest}, back-fill ${coverage.backfilled}/${coverage.keys}`);
const news = api.scoreNews_(newsRows, uni, Date.now());

let ownership = null;
try { ownership = await buildOwnership(uni.map(u => u.ticker)); } catch (e) { console.error('ownership failed', e.message); }

let fundamentals = {};
try { fundamentals = await fetchFundamentals(uni.map(u => u.ticker)); } catch (e) { console.error('fundamentals failed', e.message); }

const nbd = loadNeobdm();
// Flow labels older than 5 calendar days no longer change tiers (shown as stale): old broker flow says little about a
// setup two weeks later, and a silently frozen file must not keep promoting or demoting picks.
const nbStale = nbd ? (NOW - new Date(nbd.asOf + 'T10:00:00Z').getTime()) / 864e5 > 5 : true;
// Bandarmetrics read (tools/bm-labels.mjs): context only, never changes a tier (tools/experiment-bm.mjs found no edge).
const bmFile = fs.readdirSync(path.join(ROOT, 'data')).filter(f => /^bm-tags-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1);
const bmd = bmFile ? { asOf: bmFile.slice(8, 18), by: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', bmFile), 'utf8')) } : null;
const bmStale = bmd ? (NOW - new Date(bmd.asOf + 'T10:00:00Z').getTime()) / 864e5 > 10 : true;
const picks = [], skipped = [];
let lastBar = null;
uni.forEach(u => {
  const b = px[u.ticker + '.JK'];
  if (!b) { skipped.push({ ticker: u.ticker, why: 'no data' }); return; }
  const a = api.analyse_(b, idx, cfg);
  if (!a) { skipped.push({ ticker: u.ticker, why: 'short history' }); return; }
  if (a.avgValue / 1e9 < cfg.minValueB) { skipped.push({ ticker: u.ticker, why: 'illiquid' }); return; }
  const nw = news[u.ticker];
  const d = b.d[b.d.length - 1]; if (!lastBar || d > lastBar) lastBar = d;
  const own = ownership && ownership.byTicker ? ownership.byTicker[u.ticker] : null;
  const pk = api.buildPick_(u, b, a, nw, own, cfg);
  pk.fundamentals = fundamentals[u.ticker] || null;
  pk.live = live[u.ticker + '.JK'] || null;
  const m = b.c.length;
  pk.confirm = b.c[m - 1] > b.h[m - 2] || (b.c[m - 1] > b.o[m - 1] && b.c[m - 1] > b.c[m - 2]);
  pk.wideStop = api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down');
  const nb = nbd && nbd.by[u.ticker];
  const ov = nb && !nbStale ? nb : { tag: 'NONE', pts: 0, note: 'Not covered by NeoBDM.' };
  pk.neobdm = nb ? { asOf: nbd.asOf, stale: nbStale, ...nb } : null;
  pk.bm = bmd && bmd.by[u.ticker] ? { ...bmd.by[u.ticker], stale: bmStale } : null;
  pk.tier = tierOf(pk.score, api.ACT_SCORE, pk.confirm, ov);
  picks.push(pk);
});
picks.sort((x, y) => y.score - x.score);
const market = api.marketRead_(picks, idx);
market.idxLive = live['^JKSE'] || null;

// ---- forward-test ledger + live track record ----
const asOf = lastBar.toISOString().slice(0, 10);
// Every ranked stock is logged once per signal day (first run after the close), so later news can never rewrite the
// signal. Logging ALL stocks, not just ACT, gives the control group that makes a win rate meaningful.
const ledgerFile = path.join(HIST, `${asOf}.json`);
const LEDGER_V = 2; // v2 adds sector/RSI/regime for pattern analysis and logs the whole universe
let existing = null;
try { existing = JSON.parse(fs.readFileSync(ledgerFile, 'utf8')); } catch { /* none */ }
if (!process.env.FAKE_NOW && (!existing || (existing.v || 1) < LEDGER_V)) {
  fs.writeFileSync(ledgerFile, JSON.stringify({
    v: LEDGER_V, asOf, cfg, regime: market.regime, breadth: market.breadth,
    picks: picks.map(p => ({ ticker: p.ticker, sector: p.sector, score: p.score, action: p.action, setup: p.setup, rsi: p.rsi, dist20Atr: p.dist20Atr, rr: p.rr, atrPct: p.atrPct, entry: p.entry, stop: p.stop, target: p.target, newsScore: p.newsScore, bmScore: p.bm && !p.bm.stale && p.bm.score != null ? p.bm.score : null })),
  }));
}
const tracker = buildTracker({ ledger: readLedger(HIST), bars: px, horizon: cfg.horizon });
fs.writeFileSync(path.join(OUT, 'tracker.json'), JSON.stringify(tracker));
const replayFile = path.join(ROOT, 'data', 'replay-tracker.json');
if (fs.existsSync(replayFile)) fs.copyFileSync(replayFile, path.join(OUT, 'replay-tracker.json'));
console.log(`tracker: ${tracker.signalDays} signal day(s), ACT closed ${tracker.act.n} (open ${tracker.act.open}), control closed ${tracker.control.n}`);

const bt = fs.existsSync(path.join(ROOT, 'data', 'backtest-summary.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'backtest-summary.json'), 'utf8')) : null;
// latest.json carries the last 7 days (fast first paint); the 30-day archive is a separate file loaded on demand.
const weekAgo = Date.now() - 7 * 864e5;
const newsOut = newsRows.filter(r => new Date(r[0]).getTime() >= weekAgo && (r[5] || r[4] !== 'OTHER')).slice(0, 900).map(r => {
  const cl = api.classify_(r[2]);
  return { published: new Date(r[0]).toISOString(), source: r[1], title: r[2], link: r[3], category: r[4], tickers: r[5] ? r[5].split(',') : [], sectors: r[6] ? r[6].split(',') : [], sentiment: r[7], roundup: !!cl.roundup };
});
fs.writeFileSync(path.join(OUT, 'news-30d.json'), JSON.stringify(archiveForWeb(api, newsRows, newsBackfill)));

const na = path.join(ROOT, 'data', 'news-accuracy.json');
const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); } catch { return null; } };
const out = {
  meta: {
    generatedAt: new Date().toISOString(), asOf,
    session: { state: sessionOpen ? 'open' : 'closed', note: sessionOpen ? "IDX is open: scores use the last completed close; live quotes are today's partial bar." : 'IDX is closed: scores use the latest close.' }, engine: 'oversold-v2', commit: (process.env.GITHUB_SHA || '').slice(0, 7), actScore: api.ACT_SCORE,
    params: cfg, universe: uni.length, ranked: picks.length, skipped, newsCount: newsRows.length, newsStatus, newsCoverage: coverage, sample: false,
    sources: { prices: 'Yahoo Finance daily bars (.JK)', news: 'Google News RSS (Indonesian)', ownership: ownership ? `${ownership.source} (as of ${ownership.asOf})` : null, fundamentals: 'Yahoo Finance fundamentals-timeseries (unofficial, last ~5 quarters)', neobdm: nbd ? 'NeoBDM Market Summary, ' + nbd.asOf + (nbStale ? ' (stale: not used for tiers)' : '') + ' (pulled from a logged-in browser; forward test running)' : null },
  },
  // Broker-flow workflow: forward-test scorecard (tools/flow-forward.mjs) and the IDX foreign-flow backtest (tools/experiment-flow.mjs).
  flow: { asOf: nbd ? nbd.asOf : null, stale: nbStale, scorecard: readJson('flow-scorecard.json'), foreignBacktest: readJson('flow-experiment.json'),
    bm: { asOf: bmd ? bmd.asOf : null, stale: bmStale, experiment: readJson('bm-experiment.json'), scoreExperiment: readJson('bm-score-experiment.json') } },
  backtestHoldout:fs.existsSync(path.join(ROOT, 'data', 'backtest-holdout.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'backtest-holdout.json'), 'utf8')) : null,
  newsAccuracy: fs.existsSync(na) ? JSON.parse(fs.readFileSync(na, 'utf8')) : null, market, picks, news: newsOut, ownership: ownership ? { asOf: ownership.asOf, note: ownership.note } : null, backtest: bt, trackerSummary: { signalDays: tracker.signalDays, act: tracker.act, control: tracker.control, open: tracker.open.length, rules: tracker.rules },
};
fs.writeFileSync(path.join(OUT, 'latest.json'), JSON.stringify(out));
console.log(`snapshot ${asOf}: ${picks.length} ranked (${picks.filter(p => p.action === 'ACT').length} ACT), ${skipped.length} skipped, ${newsRows.length} headlines, ${Math.round(fs.statSync(path.join(OUT, 'latest.json')).size / 1024)} KB`);
picks.slice(0, 8).forEach(p => console.log(`${p.ticker} ${p.score} ${p.action} ${p.setup} rsi ${p.rsi && p.rsi.toFixed(0)} news ${p.newsScore}`));

// Telegram digest (no-op unless TG_TOKEN / TG_CHAT_ID are set, or DRY_ALERTS=1). Never lets a failure break the build.
if (!process.env.FAKE_NOW) { try { await runAlerts({ api, picks, newsRows, meta: out.meta, market, tracker }); } catch (e) { console.error('alerts failed', e.message); } }

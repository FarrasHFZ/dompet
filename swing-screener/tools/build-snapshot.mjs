// Builds web/data/latest.json: runs the same engine as the Sheet (apps-script/*.gs) on Yahoo prices + Google News.
// Also appends today's picks to data/history/ (forward-test ledger) and scores older entries against what happened.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, expansionTickers } from './lib.mjs';
import { refreshNewsStore, newsCoverage, archiveForWeb } from './news.mjs';
import { buildOwnership } from './ownership.mjs';
import { fetchFundamentals } from './fundamentals.mjs';
import { runAlerts } from './alerts.mjs';
import { writeOhlc } from './ohlc.mjs';
import { stockSignals } from './signals.mjs';
import { momentumBook } from './momentum.mjs';
import { buildTracker, readLedger } from './tracker.mjs';
import { loadNeobdm, tierOf } from './neobdm.mjs';
import { loadGroups, groupSeries, groupSummary, groupReadAt } from './groups.mjs';

const cfg = { targetPct: +(process.env.TARGET || 8), horizon: +(process.env.HORIZON || 15), stopMult: +(process.env.STOPMULT || 2.5), minValueB: 5 };
const api = loadEngine();
const uni = universe(api);
const NEWSET = expansionTickers(); // 200 stocks added 2026-10-10: shown, never traded (tools/experiment-expand.mjs)
const OUT = path.join(ROOT, 'web', 'data');
const HIST = path.join(ROOT, 'data', 'history');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(HIST, { recursive: true });

// Conglomerate groups (tools/groups.mjs): members outside the 100 are priced too, only for the group indices.
const gmap = loadGroups();
const groupTks = gmap ? [...new Set(gmap.groups.flatMap(g => g.members.map(m => m.tk)))].filter(t => !uni.some(u => u.ticker === t)) : [];
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE'], groupTks.map(t => t + '.JK')), '2y', process.env.USE_CACHE === '1');
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
const rawPx = { ...px }; // chart files keep today's partial bar
Object.keys(px).forEach(k => { px[k] = splitLive(k, px[k]); });
const idx = px['^JKSE'] ? px['^JKSE'].c : null;
// Market filter (tools/experiment-v4.mjs, walk-forward): new bounce trades only while IHSG is above its 200-day average.
const ihsgSma200 = idx && idx.length >= 200 ? idx.slice(-200).reduce((s, x) => s + x, 0) / 200 : null;
const marketOk = ihsgSma200 == null ? true : idx[idx.length - 1] > ihsgSma200;
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
// IDX company filings, last 45 days, meaningful types only (tools/ann-import.mjs; pulled in a browser, IDX blocks scripts).
let filings = null;
try { filings = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'idx-filings-recent.json'), 'utf8')); } catch { /* none yet */ }
// Flow labels older than 5 calendar days no longer change tiers (shown as stale): old broker flow says little about a
// setup two weeks later, and a silently frozen file must not keep promoting or demoting picks.
const nbStale = nbd ? (NOW - new Date(nbd.asOf + 'T10:00:00Z').getTime()) / 864e5 > 5 : true;
// Bandarmetrics read (tools/bm-labels.mjs): context only, never changes a tier (tools/experiment-bm.mjs found no edge).
const bmFile = fs.readdirSync(path.join(ROOT, 'data')).filter(f => /^bm-tags-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1);
const bmd = bmFile ? { asOf: bmFile.slice(8, 18), by: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', bmFile), 'utf8')) } : null;
const bmStale = bmd ? (NOW - new Date(bmd.asOf + 'T10:00:00Z').getTime()) / 864e5 > 10 : true;
// NeoBDM 2-year replay (tools/experiment-nb.mjs): study summary + replayed flow-tag history per stock (labels only).
let nbStudy = null, nbHist = null;
try { nbStudy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-study.json'), 'utf8')); } catch { /* not run */ }
try { nbHist = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-history-tags.json'), 'utf8')); } catch { /* not run */ }
const flowVeto = !!(nbStudy && nbStudy.vetoAdopted);
// Broker cost lines (tools/broker-cost.mjs): refreshed per stock on a weekly rotation, so each carries its own date.
// Who moves each stock (tools/flow-read.mjs, run in the evening task): foreign-driven?, foreign buying, retail share.
const flowRead = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'flow-read.json'), 'utf8')); } catch { return null; } })();
let bcost = null;
try { bcost = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'broker-cost-tags.json'), 'utf8')); } catch { /* not built */ }
// Group rotation: today's read per group + the forward record of the "hot group" rule (tools/experiment-groups.mjs H4:
// after a group index jumps >= 10% in 5 sessions it beat the IHSG over the next 10, in the 5-year test). Events after the
// pre-registration date are scored here from prices, so the live record builds itself.
let groups = null;
const GROUP_RULE_FROM = '2026-10-10';
if (gmap && px['^JKSE']) {
  try {
    const S = groupSeries(px, gmap, px['^JKSE']), T = S.days.length - 1;
    groups = groupSummary(S, gmap);
    const hot = [], live = [];
    for (const g of gmap.groups) {
      let last = -1e9;
      for (let t = 70; t <= T; t++) {
        const r = groupReadAt(S, g.id, t); if (!r || r.active < 2 || r.r5 == null || r.r5 < 0.10 || t - last < 20) continue;
        last = t;
        const done = t + 11 <= T, l = S.g[g.id].lvl;
        const out = t + 1 <= T ? { id: g.id, d: S.days[t], age: T - t, x: done ? (l[t + 11] / l[t + 1]) - (S.ihsg[t + 11] / S.ihsg[t + 1]) : null } : null;
        if (out && T - t <= 10) hot.push(out);
        if (out && S.days[t] >= GROUP_RULE_FROM) live.push(out);
      }
    }
    groups.hot = hot; groups.live = live; groups.liveFrom = GROUP_RULE_FROM;
    groups.byTicker = {};
    gmap.groups.forEach(g => { const r = groups.groups.find(x => x.id === g.id); g.members.forEach(m => { groups.byTicker[m.tk] = { id: g.id, name: g.name, alias: g.alias, rank: groups.rankNow[g.id] || null, of: Object.keys(groups.rankNow).length, quad: r && r.read ? r.read.quad : null, hot: hot.some(h => h.id === g.id), evidence: m.evidence, soft: m.soft }; }); });
  } catch (e) { console.error('groups failed', e.message); }
}
function readJsonSafe(f) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); } catch { return null; } }
const picks = [], skipped = [];
let lastBar = null;
uni.forEach(u => {
  const b = px[u.ticker + '.JK'];
  if (!b) { skipped.push({ ticker: u.ticker, why: 'no data' }); return; }
  const a = api.analyse_(b, idx, cfg);
  if (!a) { skipped.push({ ticker: u.ticker, why: 'short history' }); return; }
  // Below the liquidity bar (Rp 5 B/day over 20 sessions): still scored and shown, tier THIN, never traded, not logged.
  const thin = a.avgValue / 1e9 < cfg.minValueB;
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
  pk.flowHist = nbHist && nbHist.by[u.ticker] ? nbHist.by[u.ticker] : null;
  pk.group = groups && groups.byTicker[u.ticker] ? groups.byTicker[u.ticker] : null;
  pk.who = flowRead && flowRead.by[u.ticker] ? { ...flowRead.by[u.ticker], stale: (NOW - new Date(flowRead.by[u.ticker].d + 'T10:00:00Z').getTime()) / 864e5 > 6 } : null;
  pk.brokerCost = bcost && bcost.by[u.ticker] ? { ...bcost.by[u.ticker], stale: (NOW - new Date(bcost.by[u.ticker].day + 'T10:00:00Z').getTime()) / 864e5 > 10 } : null;
  pk.untested = NEWSET.has(u.ticker);
  pk.thin = thin;
  // No volume in the last 3 sessions: suspended (or halted). Shown, never traded.
  pk.suspended = b.v.slice(-3).every(v => !v);
  pk.tier = pk.suspended ? 'SUSP' : thin ? (pk.score >= api.ACT_SCORE ? 'THIN' : 'WATCH') : tierOf(pk.score, api.ACT_SCORE, pk.confirm, ov, marketOk, flowVeto, pk.untested);
  pk.filings = filings && filings.by[u.ticker] ? filings.by[u.ticker] : [];
  picks.push(pk);
});
picks.sort((x, y) => y.score - x.score);
const market = api.marketRead_(picks.filter(p => !p.thin), idx); // same definition as before: liquid stocks only
// Big money per conglomerate group: members' NeoBDM tags and Bandarmetrics LPM direction, counted (context only).
if (groups) {
  const pb = Object.fromEntries(picks.map(p => [p.ticker, p]));
  groups.groups.forEach(g => {
    const ms = g.members.map(m => pb[m.tk]).filter(Boolean);
    const nb = ms.filter(p => p.neobdm && !p.neobdm.stale), bm = ms.filter(p => p.bm && !p.bm.stale);
    g.flow = { members: ms.length, nb: nb.length, plus: nb.filter(p => p.neobdm.tag === 'FLOW+').length, minus: nb.filter(p => p.neobdm.tag === 'FLOW-').length,
      accum: nb.filter(p => p.neobdm.phase === 'ACCUMULATION' || p.neobdm.phase === 'MARKUP').length, distrib: nb.filter(p => p.neobdm.phase === 'DISTRIBUTION' || p.neobdm.phase === 'MARKDOWN').length,
      bm: bm.length, lpmUp: bm.filter(p => p.bm.lpm === 'rising').length, lpmDown: bm.filter(p => p.bm.lpm === 'falling').length };
  });
}
// Data coverage, counted (not assumed) per source over the whole universe: what the site can say about every stock.
const newsTk = new Set(newsRows.flatMap(r => (r[5] ? String(r[5]).split(',') : [])));
const covCount = f => uni.filter(f).length;
const pkBy = Object.fromEntries(picks.map(p => [p.ticker, p]));
const dataCoverage = {
  universe: uni.length,
  prices: covCount(u => px[u.ticker + '.JK']),
  scored: picks.length, liquid: picks.filter(p => !p.thin).length, suspended: picks.filter(p => p.suspended).map(p => p.ticker),
  bmTooNew: uni.filter(u => pkBy[u.ticker] && pkBy[u.ticker].bm && pkBy[u.ticker].bm.score == null).map(u => u.ticker),
  neobdm: covCount(u => pkBy[u.ticker] && pkBy[u.ticker].neobdm), neobdmPage: covCount(u => pkBy[u.ticker] && pkBy[u.ticker].neobdm && pkBy[u.ticker].neobdm.source === 'chart'),
  neobdmFresh: covCount(u => pkBy[u.ticker] && pkBy[u.ticker].neobdm && !pkBy[u.ticker].neobdm.stale),
  flowStrip: covCount(u => pkBy[u.ticker] && pkBy[u.ticker].flowHist),
  brokerCost: covCount(u => pkBy[u.ticker] && pkBy[u.ticker].brokerCost),
  bm: covCount(u => pkBy[u.ticker] && pkBy[u.ticker].bm), bmScore: covCount(u => pkBy[u.ticker] && pkBy[u.ticker].bm && pkBy[u.ticker].bm.score != null),
  news30d: covCount(u => newsTk.has(u.ticker)),
  owners: covCount(u => pkBy[u.ticker] && pkBy[u.ticker].ownership), groups: covCount(u => pkBy[u.ticker] && pkBy[u.ticker].group),
  missing: { prices: uni.filter(u => !px[u.ticker + '.JK']).map(u => u.ticker), neobdm: uni.filter(u => !(pkBy[u.ticker] && pkBy[u.ticker].neobdm)).map(u => u.ticker), bm: uni.filter(u => !(pkBy[u.ticker] && pkBy[u.ticker].bm)).map(u => u.ticker) },
};
console.log('data coverage', JSON.stringify({ ...dataCoverage, missing: Object.fromEntries(Object.entries(dataCoverage.missing).map(([k, v]) => [k, v.length])) }));
market.idxLive = live['^JKSE'] || null;
// sma200 four weeks ago: how fast the bar the IHSG must clear is moving (for the 'how far to ON' gauge)
const sma200ago = idx && idx.length >= 220 ? idx.slice(-220, -20).reduce((a, x) => a + x, 0) / 200 : null;
market.filter = { ok: marketOk, ihsg: idx ? idx[idx.length - 1] : null, sma200: ihsgSma200, sma200ago, positions: (readJsonSafe('sizing-study.json') || {}).rule?.max || 5 };

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
    v: LEDGER_V, asOf, cfg, regime: market.regime, breadth: market.breadth, marketOk,
    picks: picks.filter(p => !p.thin && !p.suspended).map(p => ({ ticker: p.ticker, sector: p.sector, score: p.score, action: p.action, setup: p.setup, rsi: p.rsi, dist20Atr: p.dist20Atr, rr: p.rr, atrPct: p.atrPct, entry: p.entry, stop: p.stop, target: p.target, newsScore: p.newsScore, bmScore: p.bm && !p.bm.stale && p.bm.score != null ? p.bm.score : null, ...(p.untested ? { set: 'new' } : {}) })),
  }));
}
const tracker = buildTracker({ ledger: readLedger(HIST), bars: px, horizon: cfg.horizon });
fs.writeFileSync(path.join(OUT, 'tracker.json'), JSON.stringify(tracker));
const replayFile = path.join(ROOT, 'data', 'replay-tracker.json');
if (fs.existsSync(replayFile)) fs.copyFileSync(replayFile, path.join(OUT, 'replay-tracker.json'));
console.log(`tracker: ${tracker.signalDays} signal day(s), ACT closed ${tracker.act.n} (open ${tracker.act.open}), control closed ${tracker.control.n}`);

// Momentum 10 (tools/momentum.mjs): the paper-only second strategy, its current list and forward record.
let momentum = null;
try { momentum = momentumBook({ px, tickers: uni.map(u => u.ticker), names: Object.fromEntries(uni.map(u => [u.ticker, u.name])), histDir: path.join(ROOT, 'data', 'history-mom'), todayWib, live, write: !process.env.FAKE_NOW }); } catch (e) { console.error('momentum failed', e.message); }
if (momentum) console.log(`momentum: list of ${momentum.rebalance} (filter ${momentum.filterOn ? 'on' : 'off'}), ${momentum.record.length} recorded month(s)`);

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
    dataCoverage,
    generatedAt: new Date().toISOString(), asOf,
    session: { state: sessionOpen ? 'open' : 'closed', note: sessionOpen ? "IDX is open: scores use the last completed close; live quotes are today's partial bar." : 'IDX is closed: scores use the latest close.' }, engine: 'oversold-v2', commit: (process.env.GITHUB_SHA || '').slice(0, 7), actScore: api.ACT_SCORE,
    params: cfg, universe: uni.length, ranked: picks.length, skipped, newsCount: newsRows.length, newsStatus, newsCoverage: coverage, sample: false,
    sources: { prices: 'Yahoo Finance daily bars (.JK)', news: 'Google News RSS (Indonesian)', ownership: ownership ? `${ownership.source} (as of ${ownership.asOf})` : null, fundamentals: 'Yahoo Finance fundamentals-timeseries (unofficial, last ~5 quarters)', neobdm: nbd ? 'NeoBDM Market Summary, ' + nbd.asOf + (nbStale ? ' (stale: not used for tiers)' : '') + ' (pulled from a logged-in browser; forward test running)' : null },
  },
  // Broker-flow workflow: forward-test scorecard (tools/flow-forward.mjs) and the IDX foreign-flow backtest (tools/experiment-flow.mjs).
  groups: groups ? { ...groups, byTicker: undefined, study: readJson('groups-study.json') } : null,
  // 10-year check (2026-10-10): no edge over shuffled prices; shown at the top of Track record.
  momentum: momentum ? { ...momentum, study: readJson('momentum-study.json'), pit: readJson('momentum-pit.json') } : null,
  // Signal lab: hypotheses tested on 2026-10-10 and the live forward test of foreign flow.
  lab: (() => { const f = readJson('flow2-study.json'), r = readJson('foreign-rep.json'); return { flow2: f ? { H1: f['H1 retail share (high = worse)'], H2: f['H2 foreign buying, high-fcorr stocks'], H2c: f['   control: foreign buying, low-fcorr stocks'], H3: f['H3 LPM 60-session change (z), all stocks'] } : null, rep: r, forward: readJson('flow-read-forward.json') }; })(),
  tenYear: { trend: readJson('trend-study.json'), own: readJson('own-holdout.json'), perm: readJson('permutation-study.json') },
  expansion: readJson('expand-study.json'), brokerCostStudy: readJson('brokercost-study.json'), brokerDirectory: readJson('broker-directory.json'), sizing: readJson('sizing-study.json'), research: readJson('v4-study.json'), filingsAsOf: filings ? filings.asOf : null,
  flow: { asOf: nbd ? nbd.asOf : null, stale: nbStale, scorecard: readJson('flow-scorecard.json'), foreignBacktest: readJson('flow-experiment.json'), history: nbStudy, flowVeto,
    bm: { asOf: bmd ? bmd.asOf : null, stale: bmStale, experiment: readJson('bm-experiment.json'), scoreExperiment: readJson('bm-score-experiment.json') } },
  backtestHoldout:fs.existsSync(path.join(ROOT, 'data', 'backtest-holdout.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'backtest-holdout.json'), 'utf8')) : null,
  newsAccuracy: fs.existsSync(na) ? JSON.parse(fs.readFileSync(na, 'utf8')) : null, market, picks, news: newsOut, ownership: ownership ? { asOf: ownership.asOf, note: ownership.note } : null, backtest: bt, trackerSummary: { signalDays: tracker.signalDays, act: tracker.act, control: tracker.control, newSet: tracker.newSet, open: tracker.open.length, rules: tracker.rules },
};
fs.writeFileSync(path.join(OUT, 'latest.json'), JSON.stringify(out));
console.log(`snapshot ${asOf}: ${picks.length} ranked (${picks.filter(p => p.action === 'ACT').length} ACT), ${skipped.length} skipped, ${newsRows.length} headlines, ${Math.round(fs.statSync(path.join(OUT, 'latest.json')).size / 1024)} KB`);
picks.slice(0, 8).forEach(p => console.log(`${p.ticker} ${p.score} ${p.action} ${p.setup} rsi ${p.rsi && p.rsi.toFixed(0)} news ${p.newsScore}`));

// Candle files for the stock chart (1H/4H/1D/1W). A Yahoo hiccup here only costs the chart, never the snapshot.
// Chart markers: every past ACT call / oversold-but-not-ACT day with its outcome, replayed with the live rules.
try {
  const signals = {}, t0 = Date.now(), byT = new Map(picks.map(p => [p.ticker, p]));
  for (const u of uni) {
    const sym = u.ticker + '.JK', pk = byT.get(u.ticker);
    if (!rawPx[sym] || !px[sym] || !px['^JKSE']) continue;
    signals[u.ticker] = stockSignals(api, rawPx[sym], px[sym].c.length, px['^JKSE'], { cfg, untested: NEWSET.has(u.ticker), live: pk ? { score: pk.score, tier: pk.tier } : null });
  }
  const liveFrom = fs.readdirSync(HIST).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort()[0];
  console.log(`signals: ${Object.values(signals).flat().filter(e => e.k === 'call').length} calls replayed in ${Date.now() - t0} ms`);
  await writeOhlc(rawPx, uni.map(u => u.ticker), { useCache: process.env.USE_CACHE === '1', signals, liveFrom: liveFrom ? liveFrom.slice(0, 10) : null });
} catch (e) { console.error('ohlc failed', e.message); }

// Telegram digest (no-op unless TG_TOKEN / TG_CHAT_ID are set, or DRY_ALERTS=1). Never lets a failure break the build.
if (!process.env.FAKE_NOW) { try { await runAlerts({ api, picks, newsRows, meta: out.meta, market, tracker }); } catch (e) { console.error('alerts failed', e.message); } }

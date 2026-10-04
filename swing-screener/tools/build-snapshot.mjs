// Builds web/data/latest.json: runs the same engine as the Sheet (apps-script/*.gs) on Yahoo prices + Google News.
// Also appends today's picks to data/history/ (forward-test ledger) and scores older entries against what happened.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
import { fetchNewsRows } from './news.mjs';
import { buildOwnership } from './ownership.mjs';

const cfg = { targetPct: +(process.env.TARGET || 8), horizon: +(process.env.HORIZON || 15), stopMult: +(process.env.STOPMULT || 2.5), minValueB: 5 };
const api = loadEngine();
const uni = universe(api);
const OUT = path.join(ROOT, 'web', 'data');
const HIST = path.join(ROOT, 'data', 'history');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(HIST, { recursive: true });

const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '2y', process.env.USE_CACHE === '1');
const idx = px['^JKSE'] ? px['^JKSE'].c : null;
if (!uni.some(u => px[u.ticker + '.JK'])) throw new Error('no price data fetched');

let newsRows = [];
try { newsRows = await fetchNewsRows(api, uni); } catch (e) { console.error('news failed', e.message); }
const news = api.scoreNews_(newsRows, uni, Date.now());

let ownership = null;
try { ownership = await buildOwnership(uni.map(u => u.ticker)); } catch (e) { console.error('ownership failed', e.message); }

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
  picks.push(api.buildPick_(u, b, a, nw, own, cfg));
});
picks.sort((x, y) => y.score - x.score);
const market = api.marketRead_(picks, idx);

// ---- forward-test ledger ----
const asOf = lastBar.toISOString().slice(0, 10);
fs.writeFileSync(path.join(HIST, `${asOf}.json`), JSON.stringify({
  asOf, cfg, picks: picks.map(p => ({ ticker: p.ticker, score: p.score, action: p.action, setup: p.setup, entry: p.entry, stop: p.stop, target: p.target, newsScore: p.newsScore })),
}));
function forwardStats() {
  const files = fs.readdirSync(HIST).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const rows = [];
  files.forEach(f => {
    const h = JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8'));
    h.picks.forEach(p => {
      const b = px[p.ticker + '.JK'];
      if (!b) return;
      const i0 = b.d.findIndex(d => d.toISOString().slice(0, 10) === h.asOf);
      if (i0 < 0 || i0 + cfg.horizon >= b.c.length) return; // not resolved yet
      let res = 'timeout', exit = b.c[i0 + cfg.horizon];
      for (let j = i0 + 1; j <= i0 + cfg.horizon; j++) {
        if (b.l[j] <= p.stop) { res = 'loss'; exit = p.stop; break; }
        if (b.h[j] >= p.target) { res = 'win'; exit = p.target; break; }
      }
      rows.push({ score: p.score, action: p.action, win: res === 'win' ? 1 : 0, ret: exit / p.entry - 1 - 0.004 });
    });
  });
  const agg = g => ({ n: g.length, hit: g.length ? g.reduce((s, x) => s + x.win, 0) / g.length : null, avgNetRet: g.length ? g.reduce((s, x) => s + x.ret, 0) / g.length : null });
  return { days: files.length, resolved: rows.length, act: agg(rows.filter(r => r.action === 'ACT')), all: agg(rows), note: 'Live forward test: picks logged each run, resolved after the horizon. Net of 0.4% fees.' };
}

const bt = fs.existsSync(path.join(ROOT, 'data', 'backtest-summary.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'backtest-summary.json'), 'utf8')) : null;
const newsOut = newsRows.slice(0, 400).map(r => {
  const cl = api.classify_(r[2]);
  return { published: new Date(r[0]).toISOString(), source: r[1], title: r[2], link: r[3], category: r[4], tickers: r[5] ? r[5].split(',') : [], sectors: r[6] ? r[6].split(',') : [], sentiment: r[7], roundup: !!cl.roundup };
});

const na = path.join(ROOT, 'data', 'news-accuracy.json');
const out = {
  meta: {
    generatedAt: new Date().toISOString(), asOf, engine: 'oversold-v2', commit: (process.env.GITHUB_SHA || '').slice(0, 7), actScore: api.ACT_SCORE,
    params: cfg, universe: uni.length, ranked: picks.length, skipped, newsCount: newsRows.length, sample: false,
    sources: { prices: 'Yahoo Finance daily bars (.JK)', news: 'Google News RSS (Indonesian)', ownership: ownership ? `${ownership.source} (as of ${ownership.asOf})` : null },
  },
  newsAccuracy: fs.existsSync(na) ? JSON.parse(fs.readFileSync(na, 'utf8')) : null, market, picks, news: newsOut, ownership: ownership ? { asOf: ownership.asOf, note: ownership.note } : null, backtest: bt, forward: forwardStats(),
};
fs.writeFileSync(path.join(OUT, 'latest.json'), JSON.stringify(out));
console.log(`snapshot ${asOf}: ${picks.length} ranked (${picks.filter(p => p.action === 'ACT').length} ACT), ${skipped.length} skipped, ${newsRows.length} headlines, ${Math.round(fs.statSync(path.join(OUT, 'latest.json')).size / 1024)} KB`);
picks.slice(0, 8).forEach(p => console.log(`${p.ticker} ${p.score} ${p.action} ${p.setup} rsi ${p.rsi && p.rsi.toFixed(0)} news ${p.newsScore}`));

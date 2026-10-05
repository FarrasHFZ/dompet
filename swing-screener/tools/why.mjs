// Why is ACT not better than the rest? Dissects the replay trades: outcome mix, drawdown before the bounce,
// gap at the open, volatility, and the IHSG trend at the time of the signal.
import fs from 'node:fs';
import path from 'node:path';
process.env.TRACKER_TRADES = '1';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
import { buildTracker } from './tracker.mjs';

const api = loadEngine(), uni = universe(api);
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const DAYS = +(process.env.DAYS || 270), WINDOW = 270;
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']));
const idx = px['^JKSE'], idxBy = new Map(idx.d.map((d, i) => [d.toISOString().slice(0, 10), i]));
const ref = px['BBCA.JK'];
const ledger = [], extra = {};
for (let t = ref.c.length - DAYS; t < ref.c.length - 1; t++) {
  const day = ref.d[t].toISOString().slice(0, 10), ii = idxBy.get(day);
  const idxC = ii === undefined ? null : idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1);
  const idxSma200 = ii >= 199 ? idx.c.slice(ii - 199, ii + 1).reduce((s, x) => s + x, 0) / 200 : null;
  const idxTrend = idxSma200 ? (idx.c[ii] > idxSma200 ? 'IHSG above 200d' : 'IHSG below 200d') : null;
  const picks = [];
  for (const u of uni) {
    const b = px[u.ticker + '.JK'];
    if (!b) continue;
    const k = b.d.findIndex(d => d.toISOString().slice(0, 10) === day);
    if (k < 250) continue;
    const lo = Math.max(0, k + 1 - WINDOW);
    const w = { d: b.d.slice(lo, k + 1), o: b.o.slice(lo, k + 1), h: b.h.slice(lo, k + 1), l: b.l.slice(lo, k + 1), c: b.c.slice(lo, k + 1), v: b.v.slice(lo, k + 1) };
    const a = api.analyse_(w, idxC, cfg);
    if (!a || a.avgValue / 1e9 < 5) continue;
    const score = api.score_(a, 0);
    const gap = k + 1 < b.c.length ? b.o[k + 1] / b.c[k] - 1 : null;
    extra[day + '|' + u.ticker] = { atrPct: a.atrPct, stopPct: (a.entry - a.stop) / a.entry, gap, idxTrend, ret20: a.chg20d };
    picks.push({ ticker: u.ticker, sector: u.sector, score, action: score >= api.ACT_SCORE ? 'ACT' : 'WATCH', setup: a.setup, rsi: a.rsi, entry: a.entry, stop: a.stop, target: a.target, newsScore: 0 });
  }
  ledger.push({ asOf: day, regime: api.marketRead_(picks, null).regime, breadth: 0, picks });
}
const tr = buildTracker({ ledger, bars: px, horizon: 15 });
const T = tr._trades.filter(t => ['win', 'loss', 'timeout'].includes(t.status)).map(t => ({ ...t, ...extra[t.signal + '|' + t.ticker] }));
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pc = x => (x == null ? 'n/a' : (x * 100).toFixed(1) + '%');
function block(label, g) {
  const n = g.length;
  console.log(label.padEnd(26), 'n', String(n).padStart(4),
    '| win', pc(g.filter(t => t.status === 'win').length / n), 'loss', pc(g.filter(t => t.status === 'loss').length / n), 'timeout', pc(g.filter(t => t.status === 'timeout').length / n),
    '| avgNet', pc(mean(g.map(t => t.ret))), '| medMAE', pc(med(g.map(t => t.mae))), 'medMFE', pc(med(g.map(t => t.mfe))),
    '| ATR%', pc(mean(g.map(t => t.atrPct))), 'stop%', pc(mean(g.map(t => t.stopPct))), 'gap', pc(mean(g.filter(t => t.gap != null).map(t => t.gap))));
}
const act = T.filter(t => t.action === 'ACT'), rest = T.filter(t => t.action !== 'ACT');
block('ACT', act); block('rest', rest);
console.log('\n-- by IHSG trend at signal');
for (const k of ['IHSG above 200d', 'IHSG below 200d']) { block('ACT ' + k, act.filter(t => t.idxTrend === k)); block('rest ' + k, rest.filter(t => t.idxTrend === k)); }
console.log('\n-- ACT: first-hit analysis');
const early = act.filter(t => t.status === 'loss'); console.log('stopped trades: median days to stop', med(early.map(t => t.days)), '| share stopped within 3 days', pc(early.filter(t => t.days <= 3).length / early.length));
const wins = act.filter(t => t.status === 'win'); console.log('winning trades: median days to target', med(wins.map(t => t.days)), '| median MAE before winning', pc(med(wins.map(t => t.mae))));
console.log('\n-- ACT by stock volatility (ATR% at signal)');
for (const [lo, hi] of [[0, 0.02], [0.02, 0.03], [0.03, 0.045], [0.045, 1]]) { const g = T.filter(t => t.atrPct >= lo && t.atrPct < hi); block(`all, ATR ${lo * 100}-${hi * 100}%`, g.filter(t => t.action === 'ACT')); block(`   rest same ATR`, g.filter(t => t.action !== 'ACT')); }

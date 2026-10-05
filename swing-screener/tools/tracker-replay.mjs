// Replays the last ~12 months of signals through the SAME tracker the live site uses (next-open entry, plan stop/target,
// 15 days, control group). Not live: it uses today's universe and neutral news. It exists to show which stocks,
// sectors, setups and market regimes the method has worked in, and as a test of the tracker.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
import { buildTracker } from './tracker.mjs';

const api = loadEngine(), uni = universe(api);
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const DAYS = +(process.env.DAYS || 270), WINDOW = 270;
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']));
const idx = px['^JKSE'];
const idxBy = new Map(idx.d.map((d, i) => [d.toISOString().slice(0, 10), i]));
const ref = px['BBCA.JK'];
const ledger = [];
for (let t = ref.c.length - DAYS; t < ref.c.length - 1; t++) {
  const day = ref.d[t].toISOString().slice(0, 10), ii = idxBy.get(day);
  const idxC = ii === undefined ? null : idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1);
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
    picks.push({ ticker: u.ticker, sector: u.sector, score, action: score >= api.ACT_SCORE ? 'ACT' : 'WATCH', setup: a.setup, rsi: a.rsi, entry: a.entry, stop: process.env.HOLD15 ? 0 : a.stop, target: process.env.HOLD15 ? 1e9 : process.env.TARGET_ATR ? a.entry + (+process.env.TARGET_ATR) * a.atr : a.target, newsScore: 0 });
  }
  const m = api.marketRead_(picks, null);
  ledger.push({ asOf: day, regime: m.regime, breadth: m.breadth, picks });
}
const tr = buildTracker({ ledger, bars: px, horizon: cfg.horizon });
tr.replay = { days: DAYS, from: ledger[0].asOf, to: ledger[ledger.length - 1].asOf, note: 'Replay with today\'s universe and neutral news; not live results.' };
tr.open = []; tr.closed = tr.closed.slice(0, 40); tr.events = []; tr.resolvedIds = [];
if (!process.env.TARGET_ATR && !process.env.HOLD15) fs.writeFileSync(path.join(ROOT, 'data', 'replay-tracker.json'), JSON.stringify(tr));
const pc = x => (x == null ? 'n/a' : (x * 100).toFixed(1) + '%');
const row = (k, g) => console.log(String(k).padEnd(22), 'n', String(g.n).padStart(5), 'win', pc(g.winRate).padStart(6), 'CI', `${pc(g.ci[0])}-${pc(g.ci[1])}`.padEnd(13), 'avgNet', pc(g.avgNet).padStart(6), 'PF', g.profitFactor ? g.profitFactor.toFixed(2) : 'n/a');
console.log(`replay ${tr.replay.from} -> ${tr.replay.to}, ${ledger.length} signal days`);
row('ACT', tr.act); row('control (rest)', tr.control); row('all', tr.all);
console.log('-- by score'); tr.byScore.forEach(g => row(g.key, g));
console.log('-- ACT by setup'); tr.bySetup.forEach(g => row(g.key, g));
console.log('-- ACT by regime'); tr.byRegime.forEach(g => row(g.key, g));
console.log('-- ACT by RSI'); tr.byRsi.forEach(g => row(g.key, g));
console.log('-- ACT by sector'); tr.bySector.forEach(g => row(g.key, g));
console.log('-- ACT top tickers'); tr.byTicker.slice(0, 8).forEach(g => row(g.key, g));

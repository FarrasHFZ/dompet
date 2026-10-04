// Walk-forward test of the screener score on real IDX history (Yahoo, 5y).
// For every (ticker, day): compute the score using ONLY data up to that day, then see what
// actually happened over the next HORIZON days using the plan's own stop and target.
// News is excluded (no historical news archive), so news is held neutral here.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';

const api = loadEngine();
const uni = universe(api);
const cfg = { targetPct: +(process.env.TARGET || 8), stopMult: +(process.env.STOPMULT || 2.5), horizon: +(process.env.HORIZON || 15) };
const STEP = 2, WARM = 250, WINDOW = 270, SPLIT = new Date('2024-10-01');
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']));
const idx = px['^JKSE'];
const idxByDate = new Map(idx.d.map((d, i) => [d.toISOString().slice(0, 10), i]));

const samples = [];
for (const u of uni) {
  const b = px[u.ticker + '.JK'];
  if (!b || b.c.length < WARM + cfg.horizon + 5) continue;
  for (let t = WARM; t < b.c.length - cfg.horizon - 1; t += STEP) {
    const lo = Math.max(0, t + 1 - WINDOW);
    const w = { d: b.d.slice(lo, t + 1), o: b.o.slice(lo, t + 1), h: b.h.slice(lo, t + 1), l: b.l.slice(lo, t + 1), c: b.c.slice(lo, t + 1), v: b.v.slice(lo, t + 1) };
    const ii = idxByDate.get(b.d[t].toISOString().slice(0, 10));
    const idxC = ii === undefined ? null : idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1);
    const a = api.analyse_(w, idxC, cfg);
    if (!a || a.avgValue / 1e9 < 5 || a.rr === null) continue;
    // Outcome with the plan's own stop/target; stop wins ties.
    let res = 'timeout';
    for (let j = t + 1; j <= t + cfg.horizon; j++) {
      if (b.l[j] <= a.stop) { res = 'loss'; break; }
      if (b.h[j] >= a.target) { res = 'win'; break; }
    }
    const risk = a.entry - a.stop;
    const fwd = b.c[t + cfg.horizon] / b.c[t] - 1;
    const R = res === 'win' ? (a.target - a.entry) / risk : res === 'loss' ? -1 : (b.c[t + cfg.horizon] - a.entry) / risk;
    const parts = api.scoreParts_(a, 0);
    samples.push({ tk: u.ticker, date: b.d[t], score: api.score_(a, 0), parts, setup: a.setup, trend: a.trend, res, fwd, R, win: res === 'win' ? 1 : 0, rsi: a.rsi, rs3m: a.rs3m, hitRate: a.hitRate, rr: a.rr, volRatio: a.volRatio });
  }
}

const mean = xs => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const rank = xs => { const o = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length); let i = 0; while (i < o.length) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const pearson = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, dx = 0, dy = 0; for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; } return n / Math.sqrt(dx * dy || 1); };
const spearman = (x, y) => pearson(rank(x), rank(y));
// Block bootstrap-free CI: use per-month IC series.
function monthlyIC(S, f) {
  const by = {};
  S.forEach(s => { const k = s.date.toISOString().slice(0, 7); (by[k] = by[k] || []).push(s); });
  const ics = Object.values(by).filter(g => g.length >= 40).map(g => spearman(g.map(f), g.map(s => s.fwd)));
  const m = mean(ics), sd = Math.sqrt(mean(ics.map(x => (x - m) ** 2)));
  return { ic: m, t: m / (sd / Math.sqrt(ics.length) || 1), months: ics.length, pos: ics.filter(x => x > 0).length / ics.length };
}
const pct = x => (x * 100).toFixed(1) + '%';

function report(label, S) {
  console.log(`\n=== ${label}: ${S.length} samples, ${new Set(S.map(s => s.tk)).size} tickers ===`);
  console.log(`baseline  hit ${pct(mean(S.map(s => s.win)))}  avg fwd${cfg.horizon}d ${pct(mean(S.map(s => s.fwd)))}  avg R ${mean(S.map(s => s.R)).toFixed(2)}`);
  const buckets = [[0, 35], [35, 45], [45, 55], [55, 65], [65, 101]];
  console.log('score bucket      n    hit%   fwd%    avgR');
  buckets.forEach(([lo, hi]) => {
    const g = S.filter(s => s.score >= lo && s.score < hi);
    if (g.length < 20) { console.log(`${String(lo).padStart(3)}-${String(hi - 1).padEnd(3)}        ${String(g.length).padStart(5)}  (too few)`); return; }
    console.log(`${String(lo).padStart(3)}-${String(hi - 1).padEnd(3)}        ${String(g.length).padStart(5)}  ${pct(mean(g.map(s => s.win))).padStart(6)} ${pct(mean(g.map(s => s.fwd))).padStart(7)}  ${mean(g.map(s => s.R)).toFixed(2).padStart(6)}`);
  });
  const ic = monthlyIC(S, s => s.score);
  console.log(`score IC (monthly cross-sectional Spearman vs fwd return): ${ic.ic.toFixed(3)}  t=${ic.t.toFixed(2)}  positive in ${pct(ic.pos)} of ${ic.months} months`);
  console.log('setup           n    hit%   fwd%    avgR');
  ['Oversold bounce', 'Neutral', 'Breakout (low edge)', 'Extended (do not chase)'].forEach(k => {
    const g = S.filter(s => s.setup === k);
    if (g.length < 20) return;
    console.log(`${k.padEnd(19)} ${String(g.length).padStart(5)}  ${pct(mean(g.map(s => s.win))).padStart(6)} ${pct(mean(g.map(s => s.fwd))).padStart(7)}  ${mean(g.map(s => s.R)).toFixed(2).padStart(6)}`);
  });
  topK(S);
  console.log('component IC (higher component score -> higher fwd return?)');
  Object.keys(S[0].parts).filter(k => k !== 'news').forEach(k => {
    const r = monthlyIC(S, s => s.parts[k]);
    console.log(`  ${k.padEnd(9)} IC ${r.ic.toFixed(3).padStart(7)}  t=${r.t.toFixed(2).padStart(6)}`);
  });
}

// How you would actually use it: each day keep only the top K by score.
function topK(S) {
  const by = {};
  S.forEach(s => { const k = s.date.toISOString().slice(0, 10); (by[k] = by[k] || []).push(s); });
  [3, 5].forEach(K => {
    const picks = [];
    Object.values(by).forEach(g => g.sort((a, c) => c.score - a.score).slice(0, K).forEach(x => picks.push(x)));
    console.log(`top ${K}/day  n=${picks.length}  hit ${pct(mean(picks.map(s => s.win)))}  fwd ${pct(mean(picks.map(s => s.fwd)))}  avgR ${mean(picks.map(s => s.R)).toFixed(2)}`);
  });
}
const train = samples.filter(s => s.date < SPLIT), test = samples.filter(s => s.date >= SPLIT);
report('ALL', samples);
report('IN-SAMPLE (before 2024-10)', train);
report('OUT-OF-SAMPLE (2024-10 onward)', test);

fs.writeFileSync(path.join(ROOT, 'data', 'cache', 'backtest_samples.json'), JSON.stringify(samples.map(s => ({ ...s, date: s.date.toISOString().slice(0, 10) }))));

// Compact summary for the web app's Scorecard tab.
function summarize(S) {
  const buckets = [[0, 35], [35, 45], [45, 55], [55, 65], [65, 101]].map(([lo, hi]) => {
    const g = S.filter(s => s.score >= lo && s.score < hi);
    return { label: hi > 100 ? `${lo}+` : `${lo}-${hi - 1}`, n: g.length, hit: g.length ? mean(g.map(s => s.win)) : null, fwd: g.length ? mean(g.map(s => s.fwd)) : null };
  });
  const ic = monthlyIC(S, s => s.score);
  const setups = ['Oversold bounce', 'Neutral', 'Breakout (low edge)', 'Extended (do not chase)'].map(k => {
    const g = S.filter(s => s.setup === k);
    return { setup: k, n: g.length, hit: g.length ? mean(g.map(s => s.win)) : null, fwd: g.length ? mean(g.map(s => s.fwd)) : null };
  });
  return { n: S.length, baselineHit: mean(S.map(s => s.win)), baselineFwd: mean(S.map(s => s.fwd)), buckets, ic: ic.ic, icT: ic.t, icMonthsPositive: ic.pos, setups };
}
const summary = {
  generated: new Date().toISOString().slice(0, 10),
  params: { ...cfg, tickers: new Set(samples.map(s => s.tk)).size, from: '2022-10', to: '2026-09', source: 'Yahoo Finance daily bars, 27 IDX large caps' },
  all: summarize(samples), inSample: summarize(train), outOfSample: summarize(test),
  caveats: ['News is excluded (no historical news archive); it is the only unvalidated score component.', 'Weights and cut-offs were chosen after looking at this same history; only the 2024-10+ half is a fair test of the rules chosen on the earlier half, and even that was seen during design.', '27 liquid large caps, one market regime: do not extrapolate to small caps.'],
};
fs.writeFileSync(path.join(ROOT, 'data', 'backtest-summary.json'), JSON.stringify(summary, null, 1));

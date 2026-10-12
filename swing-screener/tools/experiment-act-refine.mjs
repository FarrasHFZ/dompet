// ACT REFINE (pre-registered 2026-10-12, committed before the first run).
//
// Goal (owner): MORE ACT calls that actually work. tools/experiment-act-window.mjs showed the 5-session window (W5:
// score >= 65 on any of the last 5 sessions + bounce candle today) gives ~2.4x the calls but worse ones. Question: does
// one fixed, simple filter on the bounce day pick out W5 calls that make money, on stocks and years never used?
//
// CANDIDATES: W5 signals (liquid Rp 5 B/day), trade = the live plan on the bounce day (next open, wide stop, +8%, 15
// sessions, 0.4% fees), one open trade per stock per filter. 12 filters, fixed here:
//   F1  capitulation   >= 30% of the set's liquid stocks scored >= 65 the day before (market-wide panic)
//   F2  isolated       < 10% did (a lone drop)
//   F3  strong stock   12-1 month return > 0 (a dip in a winner)
//   F4  above 200      close > its 200-session average
//   F5  small liquid   20-session traded value Rp 5-20 B
//   F6  deep drop      5-session return to the day before <= -10%
//   F7  volume         bounce-day volume >= 1.5x its 20-session average (buyers came in)
//   F8  strong close   close in the top 25% of the day's range
//   F9  reversal open  opened below yesterday's close, closed above it
//   F10 high cleared   close above yesterday's high (the stronger of the two bounce candles)
//   F11 market up      IHSG closed up on the bounce day
//   F12 hammer         lower wick >= 50% of the day's range
// SETS: DISCOVERY = the 300 site stocks, signals 2017-10-01 .. 2021-12-31. CONFIRM-A = the 613 never-used IDX stocks,
// all years. CONFIRM-B = the 300, signals 2022-01-01 .. end.
// PASS (a filter, all must hold; nothing is retuned):
//   D  discovery: mean net per trade > W5 unfiltered mean AND > 0, with t >= 2.9 (per-month means; ~p 0.05/12).
//   A  CONFIRM-A: mean > 0 with t >= 2 (per-month means).
//   B  CONFIRM-B: mean > 0 AND >= the live same-day rule's mean there.
//   M  more: in CONFIRM-B it makes at least as many trades as the live same-day rule.
// A filter passing D, A and B but not M is reported as "better, not more". A full pass replaces the ACT rule on the
// site (W5 + that filter), for all 300 stocks if A holds (the 613 are a fresh, unselected sample).
// Usage: node tools/experiment-act-refine.mjs
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, CACHE } from './lib.mjs';
import { scoreCached, sim, bounce, planAt, iso } from './act-funnel.mjs';

const api = loadEngine(), U = universe(api).map(u => u.ticker), S300 = new Set(U);
const OTHER = JSON.parse(fs.readFileSync(path.join(CACHE, 'rank-all.json'), 'utf8')).map(r => r.c).filter(c => !S300.has(c));
const ACT = api.ACT_SCORE, cfg = { targetPct: 8, stopMult: 2.5, horizon: 15, minValueB: 5 }, START = '2017-10-01', SPLIT = '2022-01-01';
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN), sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const FN = ['F1 capitulation', 'F2 isolated', 'F3 strong stock', 'F4 above 200', 'F5 small liquid', 'F6 deep drop', 'F7 volume', 'F8 strong close', 'F9 reversal open', 'F10 high cleared', 'F11 market up', 'F12 hammer'];

const px = await loadPrices(U.concat(OTHER).map(t => t + '.JK').concat(['^JKSE']), '10y', true), idx = px['^JKSE'], idxBy = new Map(idx.d.map((d, i) => [iso(d), i]));
// pass 1: scores for every stock; breadth per set and day
const S = {}, br = { 300: new Map(), other: new Map() };
for (const tk of U.concat(OTHER)) {
  const b = px[tk + '.JK']; if (!b || b.c.length < 300) continue;
  const set = S300.has(tk) ? 300 : 'other', s = S[tk] = scoreCached(api, tk, b, idx, cfg, S300.has(tk) ? 45 : 65);
  for (let k = 250; k < b.c.length; k++) {
    if (!s.liq[k]) continue;
    const d = iso(b.d[k]), m = br[set]; if (!m.has(d)) m.set(d, [0, 0]);
    const x = m.get(d); x[1]++; if ((s.rows.get(k) || { score: 0 }).score >= ACT) x[0]++;
  }
}
console.log('scores loaded');
// pass 2: W5 candidates with features and trades
const C = [];
for (const tk of U.concat(OTHER)) {
  const b = px[tk + '.JK'], s = S[tk]; if (!s) continue;
  const set = S300.has(tk) ? 300 : 'other', sc = k => (s.rows.get(k) || { score: 0 }).score;
  for (let k = 256; k < b.c.length - 16; k++) {
    const day = iso(b.d[k]); if (day < START || !s.liq[k] || !bounce(b, k)) continue;
    const L = sc(k) >= ACT; if (!L && ![1, 2, 3, 4].some(i => sc(k - i) >= ACT)) continue;
    const plan = planAt(api, b, k, idx, cfg); if (!plan) continue;
    const x = sim(b, k, plan.stop, plan.target); if (!x) continue;
    const bp = br[set].get(iso(b.d[k - 1])), breadth = bp && bp[1] >= 20 ? bp[0] / bp[1] : null;
    let val = 0; for (let i = k - 19; i <= k; i++) val += b.c[i] * b.v[i]; val /= 20e9;
    const sma200 = b.c.slice(k - 199, k + 1).reduce((a, c) => a + c, 0) / 200, av20 = b.v.slice(k - 20, k).reduce((a, c) => a + c, 0) / 20;
    const rng = b.h[k] - b.l[k], ii = idxBy.get(day);
    const f = [breadth != null && breadth >= 0.30, breadth != null && breadth < 0.10, b.c[k - 20] / b.c[k - 250] - 1 > 0, b.c[k] > sma200, val >= 5 && val <= 20,
      b.c[k - 1] / b.c[k - 6] - 1 <= -0.10, av20 > 0 && b.v[k] >= 1.5 * av20, rng > 0 && (b.c[k] - b.l[k]) / rng >= 0.75, b.o[k] < b.c[k - 1] && b.c[k] > b.c[k - 1],
      b.c[k] > b.h[k - 1], ii != null && ii > 0 && idx.c[ii] > idx.c[ii - 1], rng > 0 && (Math.min(b.o[k], b.c[k]) - b.l[k]) / rng >= 0.5];
    C.push({ tk, k, j1: x.j1, day, b: breadth, grp: set === 'other' ? 'A' : day < SPLIT ? 'D' : 'B', L, f, ret: x.ret });
  }
}
console.log(`candidates ${C.length}`);
if (process.env.DUMP) fs.writeFileSync(path.join(CACHE, 'act-refine-cands.json'), JSON.stringify(C));
const take = rows => { const busy = {}, out = []; rows.sort((a, b) => (a.tk < b.tk ? -1 : a.tk > b.tk ? 1 : a.k - b.k)).forEach(r => { if (busy[r.tk] != null && r.k <= busy[r.tk]) return; busy[r.tk] = r.j1; out.push(r); }); return out; };
const st = tr => { const by = new Map(); tr.forEach(t => { const m = t.day.slice(0, 7); if (!by.has(m)) by.set(m, []); by.get(m).push(t.ret); }); const xs = [...by.values()].map(mean);
  return { n: tr.length, mean: mean(tr.map(t => t.ret)), t: xs.length > 1 ? mean(xs) / (sd(xs) / Math.sqrt(xs.length)) : 0, win: tr.filter(t => t.ret > 0).length / (tr.length || 1) }; };
const res = {}, out = [], P = s => { out.push(s); console.log(s); };
const base = {};
for (const g of ['D', 'A', 'B']) base[g] = { W5: st(take(C.filter(c => c.grp === g))), L: st(take(C.filter(c => c.grp === g && c.L))) };
P(`base           D: W5 ${base.D.W5.n} ${pct(base.D.W5.mean)} | L ${base.D.L.n} ${pct(base.D.L.mean)}    A: W5 ${base.A.W5.n} ${pct(base.A.W5.mean)} | L ${base.A.L.n} ${pct(base.A.L.mean)}    B: W5 ${base.B.W5.n} ${pct(base.B.W5.mean)} | L ${base.B.L.n} ${pct(base.B.L.mean)}`);
FN.forEach((name, i) => {
  const r = Object.fromEntries(['D', 'A', 'B'].map(g => [g, st(take(C.filter(c => c.grp === g && c.f[i])))]));
  const D = r.D.mean > base.D.W5.mean && r.D.mean > 0 && r.D.t >= 2.9, A = r.A.mean > 0 && r.A.t >= 2, B = r.B.mean > 0 && r.B.mean >= base.B.L.mean, M = r.B.n >= base.B.L.n;
  res[name] = { stats: r, D, A, B, M, pass: D && A && B && M };
  P(`${name.padEnd(17)} D n ${String(r.D.n).padStart(4)} ${pct(r.D.mean).padStart(7)} t ${r.D.t.toFixed(2).padStart(5)} | A n ${String(r.A.n).padStart(4)} ${pct(r.A.mean).padStart(7)} t ${r.A.t.toFixed(2).padStart(5)} | B n ${String(r.B.n).padStart(4)} ${pct(r.B.mean).padStart(7)} t ${r.B.t.toFixed(2).padStart(5)}  ${[D && 'D', A && 'A', B && 'B', M && 'M'].filter(Boolean).join('') || '-'}${res[name].pass ? '  PASS' : ''}`);
});
const winners = Object.entries(res).filter(([, v]) => v.pass).map(([k]) => k);
P(winners.length ? `RESULT: PASS ${winners.join(', ')}` : 'RESULT: no filter passes');
fs.writeFileSync(path.join(ROOT, 'data', 'act-refine-study.json'), JSON.stringify({ asOf: iso(new Date()), base, filters: res, winners, lines: out }, null, 1));

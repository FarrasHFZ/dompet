// EXIT 2: PER-STOCK TARGETS x LONGER HOLDS (pre-registered 2026-10-12, committed before the first run).
//
// Owner's questions: (1) is the target adjusted per stock, or is +8% already ideal? (2) should we hold longer?
// Facts before the run: the live target is a FIXED +8% for every stock (apps-script/Indicators.gs analyse_: close x
// 1.08); the hold is 15 sessions. tools/experiment-payoff.mjs (80 exits) tried ATR targets (1.5 / 2.5 ATR), the 20-day
// average and an 8-session hold on the tested 100, and failed; holds LONGER than 15 and a target learned from each
// stock's own past bounces were never tried.
//
// ENTRIES: the live ACT signal (score >= 65 + bounce candle the same day, Rp 5 B/day), buy next open, live wide stop
// min(plan stop, C - 3.5 ATR), 0.4% fees, gaps fill at the open, a bar touching stop and target is a loss.
// TARGETS (5):  P8   C x 1.08 [live]
//               R2   C + 2 ATR          R4   C + 4 ATR        (scale with each stock's volatility)
//               OWN  each stock's own median best gain within 15 sessions over its PREVIOUS completed signals
//                    (>= 5 needed, else +8%), floored at +3%: a per-stock target learned only from the past
//               NONE no target: exit on the stop or at the end of the hold
// HOLDS (5):    15 [live], 20, 30, 40, 60 sessions.   -> 25 variants, one open trade per stock per variant.
// SETS: D = the 300 site stocks, signals 2017-10-01 .. 2021-12-31; A = the 613 never-used IDX stocks, all years;
//       B = the 300, signals 2022-01-01 .. end.
// PICK: the variant with the highest mean net return per trade on D (>= 100 trades).
// PASS (all): A1 pick's mean on A > 0 with t >= 2, t counted per SIGNAL DAY (one value per day: a market-wide rebound
//   day is one bet); A2 pick's mean on B > 0 and > the live P8-15 mean on B; A3 pick beats P8-15 on A.
// A pass changes the live target / hold on the site. Reported regardless: the full 25-cell grid per set, and a
// fixed-target curve (+3% .. +20% at 15 sessions) to show where the "ideal" fixed target sits.
// Usage: node tools/experiment-exit2.mjs
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, CACHE } from './lib.mjs';
import { scoreCached, bounce, planAt, iso, FEE } from './act-funnel.mjs';

const api = loadEngine(), U = universe(api).map(u => u.ticker), S300 = new Set(U);
const OTHER = JSON.parse(fs.readFileSync(path.join(CACHE, 'rank-all.json'), 'utf8')).map(r => r.c).filter(c => !S300.has(c));
const ACT = api.ACT_SCORE, cfg = { targetPct: 8, stopMult: 2.5, horizon: 15, minValueB: 5 }, START = '2017-10-01', SPLIT = '2022-01-01';
const TG = ['P8', 'R2', 'R4', 'OWN', 'NONE'], HOLD = [15, 20, 30, 40, 60], CURVE = [3, 4, 5, 6, 8, 10, 12, 15, 20];
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN), sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

function run(b, k, stop, tp, h) {
  const j0 = k + 1, last = j0 + h - 1; if (last >= b.c.length) return null;
  const entry = b.o[j0], out = (j, px) => ({ ret: px / entry - 1 - FEE, j1: j });
  for (let j = j0; j <= last; j++) {
    if (b.o[j] <= stop) return out(j, b.o[j]);
    if (tp != null && b.o[j] >= tp) return out(j, b.o[j]);
    if (b.l[j] <= stop) return out(j, stop);
    if (tp != null && b.h[j] >= tp) return out(j, tp);
  }
  return out(last, b.c[last]);
}
const px = await loadPrices(U.concat(OTHER).map(t => t + '.JK').concat(['^JKSE']), '10y', true), idx = px['^JKSE'];
const T = {}; // variant -> trades
const add = (v, t) => (T[v] = T[v] || []).push(t);
let done = 0; const t0 = Date.now();
for (const tk of U.concat(OTHER)) {
  const b = px[tk + '.JK']; if (!b || b.c.length < 300) continue;
  const grpOf = day => (!S300.has(tk) ? 'A' : day < SPLIT ? 'D' : 'B');
  const S = scoreCached(api, tk, b, idx, cfg, S300.has(tk) ? 45 : 65), sc = k => (S.rows.get(k) || { score: 0 }).score;
  const busy = {}, past = []; // past: { done: k+16, mfe } of this stock's earlier signals
  for (let k = 256; k < b.c.length - 2; k++) {
    if (!S.liq[k] || sc(k) < ACT || !bounce(b, k)) continue;
    const day = iso(b.d[k]); if (day < START) continue;
    const plan = planAt(api, b, k, idx, cfg); if (!plan) continue;
    const C = b.c[k], atr = (() => { let s = 0; for (let i = k - 13; i <= k; i++) s += Math.max(b.h[i] - b.l[i], Math.abs(b.h[i] - b.c[i - 1]), Math.abs(b.l[i] - b.c[i - 1])); return s / 14; })();
    const prior = past.filter(p => p.done <= k).map(p => p.mfe).sort((x, y) => x - y);
    const own = prior.length >= 5 ? Math.max(0.03, prior[prior.length >> 1]) : 0.08;
    const tps = { P8: plan.target, R2: C + 2 * atr, R4: C + 4 * atr, OWN: C * (1 + own), NONE: null };
    const g = grpOf(day);
    for (const tg of TG) for (const h of HOLD) {
      const v = `${tg}-${h}`; if (busy[v] != null && k <= busy[v]) continue;
      const x = run(b, k, plan.stop, tps[tg], h); if (!x) continue;
      busy[v] = x.j1; add(v, { g, day, ret: x.ret });
    }
    for (const p of CURVE) {
      const v = `C${p}`; if (busy[v] != null && k <= busy[v]) continue;
      const x = run(b, k, plan.stop, C * (1 + p / 100), 15); if (!x) continue;
      busy[v] = x.j1; add(v, { g, day, ret: x.ret });
    }
    // this signal's own best gain over 15 sessions from the next open (known only after k + 16)
    if (k + 16 < b.c.length) past.push({ done: k + 16, mfe: Math.max(...b.h.slice(k + 1, k + 16)) / b.o[k + 1] - 1 });
  }
  if (++done % 150 === 0) console.log(`${done} stocks, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const st = tr => { const by = new Map(); tr.forEach(t => { if (!by.has(t.day)) by.set(t.day, []); by.get(t.day).push(t.ret); }); const xs = [...by.values()].map(mean);
  return { n: tr.length, mean: mean(tr.map(t => t.ret)), win: tr.filter(t => t.ret > 0).length / (tr.length || 1), days: xs.length, tDay: xs.length > 1 ? mean(xs) / (sd(xs) / Math.sqrt(xs.length)) : 0 }; };
const grid = {};
for (const v of Object.keys(T)) grid[v] = Object.fromEntries(['D', 'A', 'B'].map(g => [g, st(T[v].filter(t => t.g === g))]));
const out = [], P = s => { out.push(s); console.log(s); };
P('variant     D: n   mean   win   | A: n   mean   tDay  | B: n   mean   tDay');
for (const v of TG.flatMap(tg => HOLD.map(h => `${tg}-${h}`)).concat(CURVE.map(c => `C${c}`))) {
  const r = grid[v]; P(`${v.padEnd(9)}  ${String(r.D.n).padStart(5)} ${pct(r.D.mean).padStart(7)} ${pct(r.D.win, 0).padStart(4)} | ${String(r.A.n).padStart(5)} ${pct(r.A.mean).padStart(7)} ${r.A.tDay.toFixed(2).padStart(5)} | ${String(r.B.n).padStart(5)} ${pct(r.B.mean).padStart(7)} ${r.B.tDay.toFixed(2).padStart(5)}`);
}
const cands = TG.flatMap(tg => HOLD.map(h => `${tg}-${h}`)).filter(v => grid[v].D.n >= 100).sort((a, b) => grid[b].D.mean - grid[a].D.mean);
const pick = cands[0], g = grid[pick], live = grid['P8-15'];
const checks = [
  { id: 'A1', ok: g.A.mean > 0 && g.A.tDay >= 2, v: [g.A.mean, g.A.tDay] },
  { id: 'A2', ok: g.B.mean > 0 && g.B.mean > live.B.mean, v: [g.B.mean, live.B.mean] },
  { id: 'A3', ok: g.A.mean > live.A.mean, v: [g.A.mean, live.A.mean] },
];
P(`PICK on D: ${pick} (${pct(g.D.mean)})`);
checks.forEach(c => P(`${c.ok ? 'PASS' : 'fail'} ${c.id} ${JSON.stringify(c.v.map(x => +x.toFixed(4)))}`));
const pass = checks.every(c => c.ok);
P(pass ? `RESULT: PASS - adopt ${pick}` : 'RESULT: FAIL - target and hold stay (+8%, 15 sessions)');
fs.writeFileSync(path.join(ROOT, 'data', 'exit2-study.json'), JSON.stringify({ asOf: iso(new Date()), grid, pick, checks, pass, lines: out }, null, 1));

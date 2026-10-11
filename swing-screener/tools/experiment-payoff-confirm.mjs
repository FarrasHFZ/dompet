// PAYOFF CONFIRMATION (pre-registered 2026-10-11, committed before the first run).
//
// Why: tools/experiment-payoff.mjs FAILED its pre-registered bar (its in-sample pick, A2-MA-15, fell apart out of
// sample). But the full grid showed one family positive in every segment: KEEP the live wide stop, change only the
// TARGET from a fixed +8% to the 20-day average (W-MA-15: IS +1.30%, OOS +0.66%, holdout +0.53% a trade, vs the live
// W-P8-15: 0.00%, +0.27%, -0.18%). That was found by looking, and an MA20 target was rejected once before (v4 X1,
// 2022-26 only), so it can only be adopted if it holds on data never used for the bounce rule.
//
// SAMPLE: the IDX stocks OUTSIDE the site's 300 (tools/cache rank-all.json: 613 codes with Yahoo 10-year history;
// used once, for the breakout study, never for the oversold bounce or its exits). Same entry rule as live (oversold
// score >= 65 + bounce candle + Rp 5 B/day over 20 sessions), signals 2017-10-01 .. end, buy next open, 0.4% fees.
//   A = W-MA-15: stop min(plan stop, C - 3.5 ATR); target = 20-day average if >= 2% above the close C, else C x 1.08;
//       15 sessions.
//   B = W-P8-15: the live exit (target C x 1.08).
//   Secondary, reported only: W-R25-15 (target C + 2.5 ATR).
// Non-overlapping trades per exit (one open trade per stock).
//
// PASS (all must hold, else nothing changes):
//   C1 mean net return per trade of A > 0.
//   C2 A beats B on the same signals: paired difference (A's trades, B's exit on those same signals), averaged per
//      calendar month, t >= 2 over months.
//   C3 the paired difference is positive in both halves (signals before / from 2022-10-01).
//   C4 permutation: A's mean on real prices is above A's mean on all but at most 1 of 20 shuffled histories (p <= 0.05).
// Reported: win rate, payoff, profit factor, Kelly, days held, account (10 slots) for A and B.
//
// Usage: node tools/experiment-payoff-confirm.mjs
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, CACHE } from './lib.mjs';

const api = loadEngine(), IN300 = new Set(universe(api).map(u => u.ticker));
const OTHER = JSON.parse(fs.readFileSync(path.join(CACHE, 'rank-all.json'), 'utf8')).map(r => r.c).filter(c => !IN300.has(c));
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 }, FEE = 0.004, WINDOW = 270, START = '2017-10-01', SPLIT = '2022-10-01', H = 15;
const iso = d => d.toISOString().slice(0, 10), mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
let seed = 20261012; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const lin = x => Math.max(0, Math.min(1, x));
const osOf = (rsi, r5, d20) => 0.35 * (rsi == null ? 0 : lin((45 - rsi) / 17)) + 0.30 * (r5 == null ? 0 : lin((-0.01 - r5) / 0.07)) + 0.35 * lin((-0.5 - d20) / 2.5);

function sim(b, k, stop, tp) {
  const j0 = k + 1, last = j0 + H - 1; if (last >= b.c.length) return null;
  const entry = b.o[j0], out = (j, px) => ({ ret: px / entry - 1 - FEE, j1: j, n: j - k });
  for (let j = j0; j <= last; j++) {
    if (b.o[j] <= stop) return out(j, b.o[j]);
    if (b.o[j] >= tp) return out(j, b.o[j]);
    if (b.l[j] <= stop) return out(j, stop);
    if (b.h[j] >= tp) return out(j, tp);
  }
  return out(last, b.c[last]);
}
function scan(px) {
  const idx = px['^JKSE'], idxBy = new Map(idx.d.map((d, i) => [iso(d), i])), sig = [];
  for (const t of OTHER) {
    const b = px[t + '.JK']; if (!b || b.c.length < 300) continue;
    for (let k = 250; k < b.c.length - 1; k++) {
      if (!(b.c[k] > b.h[k - 1] || (b.c[k] > b.o[k] && b.c[k] > b.c[k - 1]))) continue;
      const day = iso(b.d[k]); if (day < START) continue;
      let val = 0; for (let i = k - 19; i <= k; i++) val += b.c[i] * b.v[i]; if (val / 20 / 1e9 < 5) continue;
      const lo = Math.max(0, k + 1 - WINDOW), s = x => x.slice(lo, k + 1), bars = { d: s(b.d), o: s(b.o), h: s(b.h), l: s(b.l), c: s(b.c), v: s(b.v) };
      const c = bars.c, n = c.length, rsi = api.rsi_(c, 14), atr = api.atrSeries_(bars, 14)[n - 1], m20 = api.sma_(c, 20);
      if (80 * osOf(rsi, n > 5 ? c[n - 1] / c[n - 6] - 1 : null, m20 != null && atr ? (c[n - 1] - m20) / atr : 0) + 15 < api.ACT_SCORE - 0.5) continue;
      const ii = idxBy.get(day);
      const a = api.analyse_(bars, ii == null ? null : idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
      if (!a || api.score_(a, 0) < api.ACT_SCORE) continue;
      const C = a.entry, W = api.roundToTick_(Math.min(a.stop, C - 3.5 * a.atr), 'down');
      const ex = { A: sim(b, k, W, a.targetMR && a.targetMR >= C * 1.02 ? a.targetMR : a.target), B: sim(b, k, W, a.target), R25: sim(b, k, W, api.roundToTick_(C + 2.5 * a.atr, 'up')) };
      if (!ex.A || !ex.B) continue;
      sig.push({ tk: t, day, k, score: api.score_(a, 0), ex });
    }
  }
  return sig;
}
function trades(sig, id) {
  const busy = {}, out = [];
  for (const s of sig) { if (!s.ex[id]) continue; if (busy[s.tk] != null && s.k <= busy[s.tk]) continue; busy[s.tk] = s.ex[id].j1; out.push({ ...s, ...s.ex[id] }); }
  return out;
}
function stats(tr) {
  const r = tr.map(t => t.ret), w = r.filter(x => x > 0), l = r.filter(x => x <= 0), win = r.length ? w.length / r.length : null, R = l.length && w.length ? mean(w) / -mean(l) : null;
  return { n: r.length, mean: mean(r), win, payoff: R, pf: l.length ? w.reduce((s, x) => s + x, 0) / -l.reduce((s, x) => s + x, 0) : null, kelly: win != null && R ? win - (1 - win) / R : null, days: mean(tr.map(t => t.n)), worst: Math.min(...r) };
}
function account(tr, px) {
  const byDay = new Map(); tr.forEach(t => { if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push(t); });
  const at = new Map(), ix = (tk, day) => { if (!at.has(tk)) at.set(tk, new Map(px[tk + '.JK'].d.map((d, i) => [iso(d), i]))); return at.get(tk).get(day); };
  let cash = 1, open = [], pk = 1, dd = 0, n = 0, eq = 1;
  for (const d of px['^JKSE'].d) {
    const day = iso(d); if (day < START) continue;
    open = open.filter(p => { if (p.exitDay <= day) { cash += p.amt * (1 + p.ret); return false; } return true; });
    for (const p of open) { const i = ix(p.tk, day), b = px[p.tk + '.JK']; if (i != null) p.last = p.amt * b.c[i] / b.o[p.k + 1]; }
    eq = cash + open.reduce((s, p) => s + p.last, 0);
    for (const t of (byDay.get(day) || []).sort((a, b) => b.score - a.score)) {
      if (open.length >= 10 || open.some(p => p.tk === t.tk)) continue;
      const amt = Math.min(eq / 10, cash); if (amt <= 0) break;
      cash -= amt; open.push({ tk: t.tk, k: t.k, amt, last: amt, ret: t.ret, exitDay: iso(px[t.tk + '.JK'].d[t.j1]) });
    }
    eq = cash + open.reduce((s, p) => s + p.last, 0); pk = Math.max(pk, eq); dd = Math.min(dd, eq / pk - 1); n++;
  }
  return { cagr: Math.pow(eq, 245 / n) - 1, mdd: dd };
}
function shuffled(b) {
  const n = b.c.length, idxs = [...Array(n - 1).keys()].map(i => i + 1);
  for (let i = idxs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idxs[i], idxs[j]] = [idxs[j], idxs[i]]; }
  const o = [b.o[0]], h = [b.h[0]], l = [b.l[0]], c = [b.c[0]], v = [b.v[0]];
  idxs.forEach(i => { const p = c.at(-1), base = b.c[i - 1]; o.push(p * b.o[i] / base); h.push(p * b.h[i] / base); l.push(p * b.l[i] / base); c.push(p * b.c[i] / base); v.push(b.v[i]); });
  return { d: b.d, o, h, l, c, v };
}

const t0 = Date.now();
const px = await loadPrices(OTHER.map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const sig = scan(px), A = trades(sig, 'A'), B = trades(sig, 'B'), R25 = trades(sig, 'R25');
const sA = stats(A), sB = stats(B), sR = stats(R25);
// paired: A's non-overlapping trades, B's exit on the same signals; averaged per month
const months = new Map(); A.forEach(t => { const m = t.day.slice(0, 7); if (!months.has(m)) months.set(m, []); months.get(m).push(t.ex.A.ret - t.ex.B.ret); });
const md = [...months.entries()].sort().map(([m, a]) => ({ m, v: mean(a) })), mv = md.map(x => x.v);
const tPair = mean(mv) / (sd(mv) / Math.sqrt(mv.length));
const half = f => mean(A.filter(t => f(t.day)).map(t => t.ex.A.ret - t.ex.B.ret));
const h1 = half(d => d < SPLIT), h2 = half(d => d >= SPLIT);
console.log(`stocks ${OTHER.length}, signals ${sig.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
for (const [l, s] of [['A  W-MA-15 ', sA], ['B  live    ', sB], ['W-R25-15   ', sR]]) console.log(`${l} n ${s.n}  mean ${pct(s.mean)}  win ${(s.win * 100).toFixed(0)}%  payoff ${s.payoff.toFixed(2)}  PF ${s.pf.toFixed(2)}  Kelly ${s.kelly.toFixed(3)}  days ${s.days.toFixed(1)}  worst ${pct(s.worst, 0)}`);
console.log(`paired A-B per trade ${pct(mean(A.map(t => t.ex.A.ret - t.ex.B.ret)))}, ${mv.length} months, t ${tPair.toFixed(2)}; halves ${pct(h1)} / ${pct(h2)}`);
const accA = account(A, px), accB = account(B, px);
console.log(`account (10 slots): A ${pct(accA.cagr, 1)}/yr DD ${pct(accA.mdd, 1)} | B ${pct(accB.cagr, 1)}/yr DD ${pct(accB.mdd, 1)}`);
const NS = 20, nul = [];
for (let r = 0; r < NS; r++) {
  const sh = Object.fromEntries(Object.entries(px).filter(([, b]) => b).map(([k, b]) => [k, k === '^JKSE' ? b : shuffled(b)]));
  const m = stats(trades(scan(sh), 'A')).mean; nul.push(m);
  console.log(`shuffle ${r + 1}/${NS}: A mean ${pct(m)}`);
}
const above = nul.filter(x => x >= sA.mean).length;
const checks = [
  { id: 'C1', rule: 'A mean > 0', ok: sA.mean > 0, value: sA.mean },
  { id: 'C2', rule: 'paired A-B monthly t >= 2', ok: tPair >= 2, value: tPair },
  { id: 'C3', rule: 'paired A-B > 0 in both halves', ok: h1 > 0 && h2 > 0, value: [h1, h2] },
  { id: 'C4', rule: 'real A mean beats >= 19 of 20 shuffles', ok: above <= 1, value: above },
];
const pass = checks.every(c => c.ok);
checks.forEach(c => console.log(`${c.ok ? 'PASS' : 'fail'} ${c.id} ${c.rule}: ${JSON.stringify(c.value)}`));
console.log(pass ? 'RESULT: PASS - adopt the 20-day-average target (wide stop kept).' : 'RESULT: FAIL - the live exit stays.');
fs.writeFileSync(path.join(ROOT, 'data', 'payoff-confirm.json'), JSON.stringify({ asOf: iso(new Date()), stocks: OTHER.length, signals: sig.length, A: sA, B: sB, R25: sR,
  paired: { mean: mean(A.map(t => t.ex.A.ret - t.ex.B.ret)), months: mv.length, t: tPair, h1, h2 }, account: { A: accA, B: accB }, shuffles: nul, checks, pass }, null, 1));
console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);

// Does a Bandarmetrics ACCUMULATION PATTERN tell good oversold bounces from bad ones, even in a bear market?
//
// PRE-REGISTERED 2026-10-10, committed before the first run.
// Why: the user wants LPM / Money Flow / Intensity dynamics in the score as a supporting pattern, and ACT calls in
// bear markets. Earlier BM tests (experiment-bm.mjs, experiment-bm-score.mjs) failed, but only on the tested 100 and
// only on trades that had already passed the market filter and the bounce candle. This one covers ALL 300 stocks and
// EVERY oversold spell, gates off, so it can answer "does accumulation make an oversold stock worth buying anyway?"
// Samples: score >= 65 (live engine, neutral news), liquid (Rp 5 B a day), 2023-03 .. 2026-09 (BM z-scores need a year
// of history). One sample per stock episode: after a sample, the stock is skipped until its trade has closed.
// Outcome: the live trade (buy next open, wide stop, plan target, 15 sessions, 0.4% fees).
// Pattern (fixed now; Bandarmetrics' own idea of accumulation, no tuning):
//   P1 divergence   LPM 20-session change > 0 (z vs its own year) while the price fell over the same 20 sessions
//   P2 money flow   Money Flow 20-session change z > 0
//   P3 intensity    the max Intensity of the last 3 sessions is in the top 20% of the stock's own previous 120 sessions
//   ACCUM = P1 AND (P2 OR P3)
// ACCUM PASSES only if ALL hold (ACCUM episodes minus the rest, mean trade return):
//   a. gap > 0 with Welch t >= 2 (episodes never overlap within a stock),
//   b. permutation: ACCUM labels shuffled across episodes within each calendar month, 2000 runs, p < 0.05,
//   c. gap > 0 in both halves (split 2024-12-01),
//   d. gap > 0 in BEAR episodes (IHSG under its 200-day average) AND the mean ACCUM trade in bear episodes > 0.
// If it passes: ACCUM adds a "big money accumulating" supporting point to the score, and an oversold stock with ACCUM
// and a bounce candle becomes ACT even while the market filter is off ("ACT · accumulation"). If a, b, c pass but d
// fails: score support only, the filter stays. If it fails: nothing changes.
// Reported only: each of P1, P2, P3 alone; bull vs bear; the 100 vs the 200.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, expansionTickers } from './lib.mjs';
import { mean, sd, rnd } from './study-lib.mjs';

const api = loadEngine(), NEW = expansionTickers(), uni = universe(api);
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 }, FEE = 0.004, WINDOW = 270, SPLIT = '2024-12-01';
const iso = d => d.toISOString().slice(0, 10);
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '10y', true);
const BM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bm-history.json'), 'utf8'));
const idx = px['^JKSE'], idxBy = new Map(idx.d.map((d, i) => [iso(d), i]));

function sim(b, i0, stop, target) {
  const j0 = i0 + 1, last = j0 + cfg.horizon - 1; if (last >= b.c.length) return null;
  const entry = b.o[j0]; if (!(entry > 0)) return null;
  for (let j = j0; j <= last; j++) {
    if (b.l[j] <= stop) return { ret: Math.min(stop, b.o[j]) / entry - 1 - FEE, j1: j };
    if (b.h[j] >= target) return { ret: Math.max(target, b.o[j]) / entry - 1 - FEE, j1: j };
  }
  return { ret: b.c[last] / entry - 1 - FEE, j1: last };
}
const zch = (arr, k, w) => { if (k < w + 250) return null; const ch = []; for (let j = k - 250; j <= k; j += 5) if (arr[j] != null && arr[j - w] != null) ch.push(arr[j] - arr[j - w]); if (ch.length < 30 || arr[k] == null || arr[k - w] == null) return null; const m = mean(ch), s = sd(ch); return s ? (arr[k] - arr[k - w] - m) / s : null; };

const eps = [];
const t0 = Date.now();
for (const u of uni) {
  const b = px[u.ticker + '.JK'], B = BM[u.ticker]; if (!b || !B || b.c.length < 300) continue;
  const bi = new Map(B.d.map((d, i) => [d, i]));
  let busy = -1;
  for (let k = 250; k < b.c.length - cfg.horizon - 1; k++) {
    if (k <= busy) continue;
    const day = iso(b.d[k]); if (day < '2023-03-01') continue;
    const ii = idxBy.get(day), q = bi.get(day); if (ii == null || ii < 200 || q == null) continue;
    const lo = Math.max(0, k + 1 - WINDOW), s = x => x.slice(lo, k + 1);
    const a = api.analyse_({ d: s(b.d), o: s(b.o), h: s(b.h), l: s(b.l), c: s(b.c), v: s(b.v) }, idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
    if (!a || a.avgValue / 1e9 < 5 || api.score_(a, 0) < api.ACT_SCORE) continue;
    const zl = zch(B.l, q, 20), zm = zch(B.m, q, 20);
    const iw = B.i.slice(Math.max(0, q - 122), q - 2).filter(x => x != null), imax = Math.max(...B.i.slice(q - 2, q + 1).filter(x => x != null));
    if (zl == null || zm == null || iw.length < 90 || !isFinite(imax)) continue;
    const p1 = zl > 0 && b.c[k] < b.c[k - 20], p2 = zm > 0, p3 = imax >= iw.slice().sort((x, y) => x - y)[Math.floor(iw.length * 0.8)];
    const stop = api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down');
    const tr = sim(b, k, stop, a.target); if (!tr) continue;
    const bear = idx.c[ii] <= idx.c.slice(ii - 199, ii + 1).reduce((x, y) => x + y, 0) / 200;
    const candle = b.c[k] > b.h[k - 1] || (b.c[k] > b.o[k] && b.c[k] > b.c[k - 1]);
    eps.push({ tk: u.ticker, day, ym: day.slice(0, 7), set: NEW.has(u.ticker) ? 'new200' : 'tested100', p1, p2, p3, accum: p1 && (p2 || p3), bear, candle, ret: tr.ret });
    busy = tr.j1;
  }
}
console.log(`${eps.length} oversold episodes (300 stocks, ${eps[0] && eps.map(e => e.day).sort()[0]} .. ${eps.map(e => e.day).sort().at(-1)}), ${eps.filter(e => e.bear).length} in bear markets, ${eps.filter(e => e.accum).length} with ACCUM  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

const welch = (a, b) => { const g = mean(a) - mean(b), se = Math.sqrt(sd(a) ** 2 / (a.length || 1) + sd(b) ** 2 / (b.length || 1)); return { gap: g, t: se ? g / se : 0, nA: a.length, nB: b.length, mA: mean(a), mB: mean(b) }; };
const cmp = (rows, f) => welch(rows.filter(f).map(e => e.ret), rows.filter(e => !f(e)).map(e => e.ret));
const show = (name, r) => console.log(`${name.padEnd(36)} with ${String(r.nA).padStart(4)}: ${pct(r.mA).padStart(7)}   without ${String(r.nB).padStart(4)}: ${pct(r.mB).padStart(7)}   gap ${pct(r.gap).padStart(7)}  t ${r.t.toFixed(2).padStart(5)}`);

const out = { asOf: new Date().toISOString().slice(0, 10), episodes: eps.length };
console.log('\n--- PRIMARY: ACCUM = divergence AND (money flow OR intensity) ---');
const A = cmp(eps, e => e.accum); show('all episodes', A);
let hits = 0; const months = [...new Set(eps.map(e => e.ym))];
for (let r = 0; r < 2000; r++) {
  const lab = new Map(); for (const m of months) { const g = eps.filter(e => e.ym === m), l = g.map(e => e.accum); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } g.forEach((e, i) => lab.set(e, l[i])); }
  const x = eps.filter(e => lab.get(e)).map(e => e.ret), y = eps.filter(e => !lab.get(e)).map(e => e.ret);
  if (mean(x) - mean(y) >= A.gap) hits++;
}
const p = hits / 2000;
const H1 = cmp(eps.filter(e => e.day < SPLIT), e => e.accum), H2 = cmp(eps.filter(e => e.day >= SPLIT), e => e.accum);
const BE = cmp(eps.filter(e => e.bear), e => e.accum), BU = cmp(eps.filter(e => !e.bear), e => e.accum);
show('first half (before 2024-12)', H1); show('second half', H2); show('BEAR markets', BE); show('bull markets (reported)', BU);
show('bear + bounce candle (reported)', cmp(eps.filter(e => e.bear && e.candle), e => e.accum));
show('tested 100 (reported)', cmp(eps.filter(e => e.set === 'tested100'), e => e.accum));
show('new 200 (reported)', cmp(eps.filter(e => e.set === 'new200'), e => e.accum));
console.log(`permutation within month: p ${p.toFixed(3)}`);
console.log('\n--- reported only: each part alone ---');
show('P1 divergence (LPM up, price down)', cmp(eps, e => e.p1)); show('P2 money flow rising', cmp(eps, e => e.p2)); show('P3 intensity spike', cmp(eps, e => e.p3));
const pa = A.gap > 0 && A.t >= 2, pb = p < 0.05, pc = H1.gap > 0 && H2.gap > 0, pd = BE.gap > 0 && BE.mA > 0;
out.primary = { ...A, p, first: H1, second: H2, bear: BE, bull: BU }; out.verdict = { a: pa, b: pb, c: pc, d: pd, scoreSupport: pa && pb && pc, bearAct: pa && pb && pc && pd };
console.log(`\nVERDICT  a (gap>0, t>=2) ${pa ? 'PASS' : 'FAIL'} · b (permutation p<0.05) ${pb ? 'PASS' : 'FAIL'} · c (both halves) ${pc ? 'PASS' : 'FAIL'} · d (works in bear markets) ${pd ? 'PASS' : 'FAIL'} -> ${out.verdict.bearAct ? 'ADD to score AND allow ACT in bear markets' : out.verdict.scoreSupport ? 'ADD to score only' : 'not added'}`);
fs.writeFileSync(path.join(ROOT, 'data', 'bmpattern-study.json'), JSON.stringify(out, null, 1));

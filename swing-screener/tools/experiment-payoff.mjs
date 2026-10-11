// PAYOFF STUDY (pre-registered 2026-10-11; rules below were committed before the first run).
//
// Problem: the live bounce trade wins ~64% of the time but its average loss is ~1.8x its average win: the wide stop
// (min(plan stop, close - 3.5 ATR)) sits 12-30% away (once below zero: DSSA) for a fixed +8% target. Question: does
// a different EXIT turn the same entries into a positive, robust expectancy? Entries are NOT changed: oversold score
// >= 65 + bounce candle + Rp 5 B/day liquidity, buy at the next open, 0.4% round-trip fee, no market filter (owner's
// decision 2026-10-10). Earlier exit attempts counted here: v4 X1-X4 (MA20 target, 10 / 20-session hold, breakeven
// stop) on 2022-26 only, none adopted.
//
// GRID (5 x 4 x 2 x 2 = 80 variants; levels anchored to the signal close C and its 14-day ATR, like the live plan):
//   stop    W   = min(plan stop, C - 3.5 ATR)            [live]
//           A2  = C - 2.0 ATR        A3 = C - 3.0 ATR
//           C10 = max(W, C x 0.90)   C15 = max(W, C x 0.85)   (W, but never more than 10% / 15% below C)
//   target  P8  = C x 1.08                               [live]
//           R15 = C + 1.5 ATR        R25 = C + 2.5 ATR
//           MA  = 20-day average if it is at least 2% above C, else C x 1.08
//   hold    15 sessions [live] or 8
//   early   off [live], or: at the close of session 5 (buy session = 1), exit if that close is below the entry
// Fills: gap through the stop or target fills at the open (entry bar included); a bar touching both is a loss.
// One trade per stock at a time (non-overlapping), per variant.
//
// DATA: Yahoo daily, 10 years. Selection set = the tested 100 (universe minus the 200 added 2026-10-10).
//   In-sample (IS)  signals 2017-10-01 .. 2022-09-30   -> pick the variant with the highest mean net return per trade
//                                                          among variants with >= 100 IS trades.
//   Out-of-sample   signals 2022-10-01 .. end (tested 100)
//   Holdout         the 200 added stocks, whole period (never used for any rule before)
//
// PASS (all must hold, else nothing changes on the site):
//   P1 OOS mean of the pick > OOS mean of the live exit, and > 0.
//   P2 Holdout mean of the pick > holdout mean of the live exit, and > 0.
//   P3 Plateau: the median IS mean of the pick's one-step neighbours (change one dimension by one level) > live IS mean.
//   P4 Search-aware permutation: on SHUFFLES shuffled price histories (each stock's daily bars permuted), rerun the SAME
//      80-variant search on IS and record the pick's OOS mean. p = share of shuffles whose OOS mean >= the real one;
//      needs p <= 0.05 (40 shuffles: at most 2).
//   P5 Account (10 slots, 10% each, daily mark-to-market, idle cash 0%) tested 100, whole period: CAGR above the live
//      exit's, max drawdown no more than 5 points worse.
// Also reported (not part of the bar): win rate, payoff, profit factor, Kelly fraction, days held, by year.
//
// Usage: node tools/experiment-payoff.mjs        (SHUFFLES=40 default; SHUFFLES=0 skips P4 for a dry check)
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, expansionTickers } from './lib.mjs';

const api = loadEngine(), NEW = expansionTickers(), ALL = universe(api);
const TESTED = ALL.filter(u => !NEW.has(u.ticker)).map(u => u.ticker), HOLD = ALL.filter(u => NEW.has(u.ticker)).map(u => u.ticker);
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const FEE = 0.004, WINDOW = 270, IS_END = '2022-09-30', OOS_START = '2022-10-01', START = '2017-10-01', MIN_IS = 100;
const iso = d => d.toISOString().slice(0, 10);
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
let seed = 20261011; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const STOPS = ['W', 'A2', 'A3', 'C10', 'C15'], TGTS = ['P8', 'R15', 'R25', 'MA'], HOLDS = [15, 8], EARLY = [0, 1];
const VARS = []; for (const s of STOPS) for (const t of TGTS) for (const h of HOLDS) for (const e of EARLY) VARS.push({ id: `${s}-${t}-${h}${e ? '-E' : ''}`, s, t, h, e });
const LIVE = 'W-P8-15';

// same formula as Indicators.gs oversold_ (used only as a cheap pre-filter; the score itself comes from analyse_/score_)
const lin = x => Math.max(0, Math.min(1, x));
const osOf = (rsi, r5, d20) => 0.35 * (rsi == null ? 0 : lin((45 - rsi) / 17)) + 0.30 * (r5 == null ? 0 : lin((-0.01 - r5) / 0.07)) + 0.35 * lin((-0.5 - d20) / 2.5);

function levels(a) {
  const C = a.entry, A = a.atr, W = api.roundToTick_(Math.min(a.stop, C - 3.5 * A), 'down');
  const stop = { W, A2: api.roundToTick_(C - 2 * A, 'down'), A3: api.roundToTick_(C - 3 * A, 'down'), C10: Math.max(W, api.roundToTick_(C * 0.90, 'down')), C15: Math.max(W, api.roundToTick_(C * 0.85, 'down')) };
  const tgt = { P8: a.target, R15: api.roundToTick_(C + 1.5 * A, 'up'), R25: api.roundToTick_(C + 2.5 * A, 'up'), MA: a.targetMR && a.targetMR >= C * 1.02 ? a.targetMR : a.target };
  return { stop, tgt };
}
function sim(b, k, stop, tp, H, early) {
  const j0 = k + 1, last = j0 + H - 1; if (last >= b.c.length) return null;
  const entry = b.o[j0], out = (j, px) => ({ ret: px / entry - 1 - FEE, j1: j, n: j - k });
  for (let j = j0; j <= last; j++) {
    if (b.o[j] <= stop) return out(j, b.o[j]);
    if (b.o[j] >= tp) return out(j, b.o[j]);
    if (b.l[j] <= stop) return out(j, stop);
    if (b.h[j] >= tp) return out(j, tp);
    if (early && j === j0 + 4 && b.c[j] < entry) return out(j, b.c[j]);
  }
  return out(last, b.c[last]);
}
// Every live signal (entry rule unchanged), with the result of all 80 exits.
function scan(px, tickers) {
  const idx = px['^JKSE'], idxBy = new Map(idx.d.map((d, i) => [iso(d), i])), sig = [];
  for (const t of tickers) {
    const b = px[t + '.JK']; if (!b || b.c.length < 300) continue;
    for (let k = 250; k < b.c.length - 1; k++) {
      if (!(b.c[k] > b.h[k - 1] || (b.c[k] > b.o[k] && b.c[k] > b.c[k - 1]))) continue; // bounce candle first: cheap
      const day = iso(b.d[k]); if (day < START) continue;
      let val = 0; for (let i = k - 19; i <= k; i++) val += b.c[i] * b.v[i]; if (val / 20 / 1e9 < 5) continue;
      const lo = Math.max(0, k + 1 - WINDOW), s = x => x.slice(lo, k + 1), bars = { d: s(b.d), o: s(b.o), h: s(b.h), l: s(b.l), c: s(b.c), v: s(b.v) };
      const c = bars.c, n = c.length, rsi = api.rsi_(c, 14), atr = api.atrSeries_(bars, 14)[n - 1], m20 = api.sma_(c, 20);
      const os = osOf(rsi, n > 5 ? c[n - 1] / c[n - 6] - 1 : null, m20 != null && atr ? (c[n - 1] - m20) / atr : 0);
      if (80 * os + 10 + 5 < api.ACT_SCORE - 0.5) continue; // cannot reach the ACT bar even with full support + neutral news
      const ii = idxBy.get(day);
      const a = api.analyse_(bars, ii == null ? null : idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
      if (!a || api.score_(a, 0) < api.ACT_SCORE) continue;
      const L = levels(a), ex = {};
      for (const v of VARS) { const r = sim(b, k, L.stop[v.s], L.tgt[v.t], v.h, v.e); if (r) ex[v.id] = r; }
      if (!ex[LIVE]) continue;
      sig.push({ tk: t, day, k, score: api.score_(a, 0), ex, stopPct: L.stop.W / b.o[k + 1] - 1 });
    }
  }
  return sig;
}
// Non-overlapping trades of one variant (one open trade per stock, chronological).
function trades(sig, id, from = '0000', to = '9999') {
  const busy = {}, out = [];
  for (const s of sig) {
    if (s.day < from || s.day > to || !s.ex[id]) continue;
    if (busy[s.tk] != null && s.k <= busy[s.tk]) continue;
    busy[s.tk] = s.ex[id].j1; out.push({ tk: s.tk, day: s.day, k: s.k, score: s.score, ...s.ex[id] });
  }
  return out;
}
function stats(tr) {
  const r = tr.map(t => t.ret), w = r.filter(x => x > 0), l = r.filter(x => x <= 0);
  const aw = mean(w), al = mean(l), win = r.length ? w.length / r.length : null, R = al ? aw / -al : null;
  return { n: r.length, mean: r.length ? mean(r) : null, median: median(r), win, avgWin: w.length ? aw : null, avgLoss: l.length ? al : null, payoff: R,
    pf: l.length ? w.reduce((s, x) => s + x, 0) / -l.reduce((s, x) => s + x, 0) : null, kelly: win != null && R ? win - (1 - win) / R : null,
    worst: r.length ? Math.min(...r) : null, days: mean(tr.map(t => t.n)) };
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
  return { cagr: Math.pow(eq, 245 / n) - 1, mdd: dd, final: eq };
}
const neighbours = v => VARS.filter(w => [w.s !== v.s && Math.abs(STOPS.indexOf(w.s) - STOPS.indexOf(v.s)) === 1 && w.t === v.t && w.h === v.h && w.e === v.e,
  w.t !== v.t && Math.abs(TGTS.indexOf(w.t) - TGTS.indexOf(v.t)) === 1 && w.s === v.s && w.h === v.h && w.e === v.e,
  w.h !== v.h && w.s === v.s && w.t === v.t && w.e === v.e, w.e !== v.e && w.s === v.s && w.t === v.t && w.h === v.h].some(Boolean));
const pickBest = sig => { let best = null; for (const v of VARS) { const s = stats(trades(sig, v.id, START, IS_END)); if (s.n >= MIN_IS && (!best || s.mean > best.mean)) best = { id: v.id, mean: s.mean }; } return best; };

function shuffled(b) {
  const n = b.c.length, idxs = [...Array(n - 1).keys()].map(i => i + 1);
  for (let i = idxs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idxs[i], idxs[j]] = [idxs[j], idxs[i]]; }
  const o = [b.o[0]], h = [b.h[0]], l = [b.l[0]], c = [b.c[0]], v = [b.v[0]];
  idxs.forEach(i => { const p = c.at(-1), base = b.c[i - 1]; o.push(p * b.o[i] / base); h.push(p * b.h[i] / base); l.push(p * b.l[i] / base); c.push(p * b.c[i] / base); v.push(b.v[i]); });
  return { d: b.d, o, h, l, c, v };
}

// ---------------------------------------------------------------- run
const t0 = Date.now();
const px = await loadPrices(TESTED.concat(HOLD).map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const sigT = scan(px, TESTED), sigH = scan(px, HOLD);
console.log(`signals: tested ${sigT.length}, holdout ${sigH.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
const rows = VARS.map(v => ({ ...v, is: stats(trades(sigT, v.id, START, IS_END)), oos: stats(trades(sigT, v.id, OOS_START)), hold: stats(trades(sigH, v.id)), all: stats(trades(sigT, v.id)) }));
const R = id => rows.find(r => r.id === id), live = R(LIVE);
const pick = pickBest(sigT), P = R(pick.id), nb = neighbours(P).map(w => R(w.id).is.mean);
console.log('\nvariant              IS mean   n   |  OOS mean   n  | holdout mean  n  | win  payoff  PF   days');
rows.slice().sort((a, b) => b.is.mean - a.is.mean).forEach(r => console.log(`${r.id.padEnd(16)} ${pct(r.is.mean).padStart(8)} ${String(r.is.n).padStart(4)} | ${pct(r.oos.mean).padStart(8)} ${String(r.oos.n).padStart(4)} | ${pct(r.hold.mean).padStart(8)} ${String(r.hold.n).padStart(4)} | ${(r.all.win * 100).toFixed(0)}% ${r.all.payoff == null ? '–' : r.all.payoff.toFixed(2)} ${r.all.pf == null ? '–' : r.all.pf.toFixed(2)} ${r.all.days.toFixed(1)}${r.id === LIVE ? '  <- live' : ''}${r.id === pick.id ? '  <- PICK' : ''}`));
const accLive = account(trades(sigT, LIVE), px), accPick = account(trades(sigT, pick.id), px);
const N = +(process.env.SHUFFLES ?? 40), null_ = [];
for (let r = 0; r < N; r++) {
  const sh = Object.fromEntries(Object.entries(px).filter(([k, b]) => b && (k === '^JKSE' || TESTED.includes(k.replace('.JK', '')))).map(([k, b]) => [k, k === '^JKSE' ? b : shuffled(b)]));
  const s = scan(sh, TESTED), bp = pickBest(s);
  const oos = bp ? stats(trades(s, bp.id, OOS_START)).mean : null;
  null_.push({ pick: bp && bp.id, isMean: bp && bp.mean, oos });
  console.log(`shuffle ${r + 1}/${N}: pick ${bp ? bp.id : '–'} IS ${pct(bp && bp.mean)} OOS ${pct(oos)}`);
}
const p4 = N ? null_.filter(x => x.oos != null && x.oos >= P.oos.mean).length / N : null;
const checks = [
  { id: 'P1', rule: 'OOS mean > live OOS mean and > 0', ok: P.oos.mean > live.oos.mean && P.oos.mean > 0, value: [P.oos.mean, live.oos.mean] },
  { id: 'P2', rule: 'holdout mean > live holdout mean and > 0', ok: P.hold.mean > live.hold.mean && P.hold.mean > 0, value: [P.hold.mean, live.hold.mean] },
  { id: 'P3', rule: 'median IS mean of neighbours > live IS mean', ok: median(nb) > live.is.mean, value: [median(nb), live.is.mean] },
  { id: 'P4', rule: `search-aware permutation p <= 0.05 (${N} shuffles)`, ok: p4 != null && p4 <= 0.05, value: p4 },
  { id: 'P5', rule: 'account CAGR > live, max DD no more than 5 pts worse', ok: accPick.cagr > accLive.cagr && accPick.mdd >= accLive.mdd - 0.05, value: [accPick, accLive] },
];
const pass = checks.every(c => c.ok);
console.log(`\nPICK ${pick.id}: IS ${pct(P.is.mean)} (n ${P.is.n}), OOS ${pct(P.oos.mean)} (n ${P.oos.n}), holdout ${pct(P.hold.mean)} (n ${P.hold.n}); live IS ${pct(live.is.mean)} OOS ${pct(live.oos.mean)} holdout ${pct(live.hold.mean)}`);
console.log(`account: pick ${pct(accPick.cagr, 1)}/yr DD ${pct(accPick.mdd, 1)} | live ${pct(accLive.cagr, 1)}/yr DD ${pct(accLive.mdd, 1)}`);
checks.forEach(c => console.log(`${c.ok ? 'PASS' : 'fail'} ${c.id} ${c.rule}: ${JSON.stringify(c.value, (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v))}`));
console.log(pass ? '\nRESULT: PASS - adopt the picked exit.' : '\nRESULT: FAIL - the live exit stays.');
const byYear = id => { const o = {}; trades(sigT, id).forEach(t => { const y = t.day.slice(0, 4); (o[y] = o[y] || []).push(t.ret); }); return Object.fromEntries(Object.entries(o).map(([y, a]) => [y, { n: a.length, mean: mean(a) }])); };
fs.writeFileSync(path.join(ROOT, 'data', 'payoff-study.json'), JSON.stringify({ asOf: iso(new Date()), live: LIVE, pick: pick.id, pass, checks, shuffles: null_, p4,
  rows: rows.map(r => ({ id: r.id, s: r.s, t: r.t, h: r.h, e: r.e, is: r.is, oos: r.oos, hold: r.hold, all: r.all })), account: { pick: accPick, live: accLive },
  byYear: { live: byYear(LIVE), pick: byYear(pick.id) }, signals: { tested: sigT.length, holdout: sigH.length } }, null, 1));
console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);

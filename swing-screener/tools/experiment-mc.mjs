// Why so few ACT calls, and is the edge real? Exploratory, 2026-10-10. NOTHING IS ADOPTED FROM THIS RUN: any variant that
// looks better here becomes its own pre-registered test first.
//
// 5 years x the tested 100 stocks (the 200 added in Oct 2026 failed their own test and are left out).
//  1. Funnel: every liquid stock-day with score >= 65, split by why it was or was not an ACT call
//     (market filter off -> PAUSE, no bounce candle -> WAIT, else ACT).
//  2. Variants of the live rule (next open, wide 3.5-ATR stop, plan target, 15 sessions, 0.4% fees):
//       LIVE        market filter + bounce candle (today's rule)
//       NOCANDLE    market filter only (WAIT days also bought)
//       NOFILTER    bounce candle only (PAUSE days also bought)
//       RAW         neither
//  3. Monte Carlo null, 2000 runs: each trade is swapped for a random OTHER liquid stock on the SAME signal day, entered
//     the same way with the same % stop and % target. p = share of runs whose mean trade beats the variant's mean.
//     Answers "does the score pick better stocks than chance on those days?"
//  4. Account: 10 equal slots (the adopted sizing), idle cash 4.5%/yr. Bootstrap of monthly returns (3-month blocks,
//     5000 runs, 4-year paths): spread of yearly return and worst drawdown, chance of losing money.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, expansionTickers } from './lib.mjs';

const api = loadEngine(), NEW = expansionTickers(), uni = universe(api).filter(u => !NEW.has(u.ticker));
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const FEE = 0.004, WINDOW = 270, CY = +(process.env.CY ?? 0.045), SLOTS = 10, iso = d => d.toISOString().slice(0, 10);
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '5y', true);
const idx = px['^JKSE'], idxBy = new Map(idx.d.map((d, i) => [iso(d), i]));
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const pct = (x, d = 1) => (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
let seed = 20261010; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function sim(b, i0, stop, target) {
  const j0 = i0 + 1, last = j0 + cfg.horizon - 1; if (last >= b.c.length) return null;
  const entry = b.o[j0];
  for (let j = j0; j <= last; j++) {
    if (b.l[j] <= stop) return { ret: Math.min(stop, b.o[j]) / entry - 1 - FEE, j0, j1: j };
    if (b.h[j] >= target) return { ret: Math.max(target, b.o[j]) / entry - 1 - FEE, j0, j1: j };
  }
  return { ret: b.c[last] / entry - 1 - FEE, j0, j1: last };
}

// ---- scan every stock-day once ----
const days = new Map(); // day -> [{ tk, k, score, liquid }]   (every liquid stock that day, for the null)
const sig = [];         // score >= 65 liquid stock-days with their tier reasons
const t0 = Date.now();
for (const u of uni) {
  const b = px[u.ticker + '.JK']; if (!b || b.c.length < 300) continue;
  for (let k = 250; k < b.c.length - cfg.horizon - 1; k++) {
    const day = iso(b.d[k]), ii = idxBy.get(day); if (ii == null || ii < 200) continue;
    const lo = Math.max(0, k + 1 - WINDOW), s = x => x.slice(lo, k + 1);
    const a = api.analyse_({ d: s(b.d), o: s(b.o), h: s(b.h), l: s(b.l), c: s(b.c), v: s(b.v) }, idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
    if (!a || a.avgValue / 1e9 < 5) continue;
    if (!days.has(day)) days.set(day, []);
    days.get(day).push({ tk: u.ticker, k });
    const score = api.score_(a, 0);
    if (score < api.ACT_SCORE) continue;
    const sma = idx.c.slice(ii - 199, ii + 1).reduce((x, y) => x + y, 0) / 200;
    const mOk = idx.c[ii] > sma;
    const candle = b.c[k] > b.h[k - 1] || (b.c[k] > b.o[k] && b.c[k] > b.c[k - 1]);
    const stop = api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down');
    const tr = sim(b, k, stop, a.target);
    if (!tr) continue;
    const entry = b.o[k + 1];
    sig.push({ tk: u.ticker, day, k, score, mOk, candle, ...tr, stopPct: stop / entry - 1, tpPct: a.target / entry - 1, year: day.slice(0, 4) });
  }
}
const allDays = [...days.keys()].sort();
console.log(`scanned ${uni.length} stocks, ${allDays[0]} .. ${allDays.at(-1)}, ${sig.length} oversold stock-days, ${((Date.now() - t0) / 1000).toFixed(0)}s`);

// ---- 1. funnel ----
const F = { all: sig.length, pause: sig.filter(x => !x.mOk).length, wait: sig.filter(x => x.mOk && !x.candle).length, act: sig.filter(x => x.mOk && x.candle).length };
const onDays = new Set(sig.filter(x => x.mOk).map(x => x.day));
const mOkDays = allDays.filter(d => { const ii = idxBy.get(d); return idx.c[ii] > idx.c.slice(ii - 199, ii + 1).reduce((x, y) => x + y, 0) / 200; }).length;
console.log(`\n===== 1. FUNNEL (liquid stock-days with score >= ${api.ACT_SCORE}) =====`);
console.log(`oversold ${F.all} -> PAUSE (IHSG under 200d) ${F.pause} (${pct(F.pause / F.all, 0)}) -> WAIT (no bounce candle) ${F.wait} (${pct(F.wait / F.all, 0)}) -> ACT ${F.act} (${pct(F.act / F.all, 0)})`);
console.log(`market filter on ${mOkDays} of ${allDays.length} sessions (${pct(mOkDays / allDays.length, 0)}); oversold days with filter on: ${onDays.size}`);
const byYear = {};
sig.forEach(x => { const y = byYear[x.year] ||= { all: 0, pause: 0, wait: 0, act: 0 }; y.all++; if (!x.mOk) y.pause++; else if (!x.candle) y.wait++; else y.act++; });
Object.entries(byYear).forEach(([y, v]) => console.log(`  ${y}: oversold ${v.all}, PAUSE ${v.pause}, WAIT ${v.wait}, ACT ${v.act}`));

// ---- 2-4. variants ----
const VAR = { LIVE: x => x.mOk && x.candle, NOCANDLE: x => x.mOk, NOFILTER: x => x.candle, RAW: () => true };
function nullMean(trades, runs = 2000) {
  const out = [];
  for (let r = 0; r < runs; r++) {
    let s = 0, n = 0;
    for (const t of trades) {
      const pool = days.get(t.day); if (!pool || pool.length < 2) continue;
      let o; do { o = pool[Math.floor(rnd() * pool.length)]; } while (o.tk === t.tk);
      const b = px[o.tk + '.JK'], e = b.o[o.k + 1];
      const tr = sim(b, o.k, e * (1 + t.stopPct), e * (1 + t.tpPct));
      if (tr) { s += tr.ret; n++; }
    }
    out.push(s / (n || 1));
  }
  return out.sort((a, b) => a - b);
}
const dayIdx = new Map(uni.map(u => { const b = px[u.ticker + '.JK']; return [u.ticker, b ? new Map(b.d.map((d, i) => [iso(d), i])) : new Map()]; }));
// Open positions are valued at each close (mark to market), so drawdowns include paper losses.
const mtm = (p, day) => { const b = px[p.tk + '.JK'], i = dayIdx.get(p.tk).get(day); return i == null ? p.last : (p.last = p.amt * b.c[i] / b.o[p.j0]); };
function account(trades) { // 10 slots, highest score first, one position per stock; monthly equity
  const byDay = new Map(); trades.forEach(t => { if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push(t); });
  let cash = 1, open = [];
  const monthEq = new Map(), dailyEq = [];
  const ref = px['BBCA.JK'];
  for (let k = 0; k < ref.d.length; k++) {
    const day = iso(ref.d[k]);
    if (day < allDays[0] || day > allDays.at(-1)) continue;
    cash *= 1 + CY / 245;
    open = open.filter(p => { if (p.exitDay <= day) { cash += p.amt * (1 + p.ret); return false; } return true; });
    const eq = cash + open.reduce((s, p) => s + mtm(p, day), 0);
    for (const t of (byDay.get(day) || []).sort((a, b) => b.score - a.score)) {
      if (open.length >= SLOTS || open.some(p => p.tk === t.tk)) continue;
      const amt = Math.min(eq / SLOTS, cash); if (amt <= 0) break;
      cash -= amt;
      open.push({ tk: t.tk, amt, last: amt, j0: t.j0, ret: t.ret, exitDay: iso(px[t.tk + '.JK'].d[t.j1]) });
    }
    monthEq.set(day.slice(0, 7), cash + open.reduce((s, p) => s + mtm(p, day), 0)); dailyEq.push(cash + open.reduce((s, p) => s + p.last, 0));
  }
  const eqs = [...monthEq.values()], rets = eqs.slice(1).map((v, i) => v / eqs[i] - 1);
  return { rets, cagr: Math.pow(eqs.at(-1), 12 / rets.length) - 1, dd: maxDD(dailyEq) };
}
function maxDD(eqs) { let pk = -Infinity, dd = 0; for (const v of eqs) { pk = Math.max(pk, v); dd = Math.min(dd, v / pk - 1); } return dd; }
function bootstrap(rets, runs = 5000, months = 48, block = 3) {
  const cagr = [], dd = [];
  for (let r = 0; r < runs; r++) {
    const eq = [1];
    while (eq.length <= months) { const s = Math.floor(rnd() * (rets.length - block)); for (let b = 0; b < block && eq.length <= months; b++) eq.push(eq.at(-1) * (1 + rets[s + b])); }
    cagr.push(Math.pow(eq.at(-1), 12 / months) - 1); dd.push(maxDD(eq));
  }
  cagr.sort((a, b) => a - b); dd.sort((a, b) => a - b);
  const q = (a, p) => a[Math.floor(p * (a.length - 1))];
  return { c5: q(cagr, 0.05), c50: q(cagr, 0.5), c95: q(cagr, 0.95), pLoss: cagr.filter(x => x < 0).length / runs, dd50: q(dd, 0.5), dd5: q(dd, 0.05) };
}
const ihsg0 = idx.c[idxBy.get(allDays[0])], ihsg1 = idx.c[idxBy.get(allDays.at(-1))];
const yrs = allDays.length / 245;
console.log(`\nIHSG over the same window: ${pct(Math.pow(ihsg1 / ihsg0, 1 / yrs) - 1)}/yr (price only)`);
const result = { asOf: new Date().toISOString().slice(0, 10), from: allDays[0], to: allDays.at(-1), stocks: uni.length, funnel: { ...F, byYear, filterOnShare: mOkDays / allDays.length }, ihsgCagr: Math.pow(ihsg1 / ihsg0, 1 / yrs) - 1, variants: {} };
console.log('\n===== 2-4. VARIANTS =====');
console.log('variant    trades  /yr  win%   mean    null mean [5-95%]           p     account/yr  maxDD   bootstrap 4y: 5% / median / 95%   P(loss)  median DD');
for (const [name, f] of Object.entries(VAR)) {
  const tr = sig.filter(f), wins = tr.filter(t => t.ret > 0).length, m = mean(tr.map(t => t.ret));
  const nm = nullMean(tr), p = nm.filter(x => x >= m).length / nm.length;
  const acc = account(tr), bs = bootstrap(acc.rets);
  result.variants[name] = { n: tr.length, perYear: tr.length / yrs, win: wins / tr.length, mean: m, nullMean: mean(nm), null5: nm[Math.floor(0.05 * nm.length)], null95: nm[Math.floor(0.95 * nm.length)], p, cagr: acc.cagr, dd: acc.dd, boot: bs };
  console.log(`${name.padEnd(10)} ${String(tr.length).padStart(6)} ${String(Math.round(tr.length / yrs)).padStart(4)}  ${(wins / tr.length * 100).toFixed(0).padStart(3)}%  ${pct(m, 2).padStart(7)}   ${pct(mean(nm), 2).padStart(7)} [${pct(nm[100], 2)}, ${pct(nm[1900], 2)}]  ${p.toFixed(3).padStart(5)}   ${pct(acc.cagr).padStart(7)}   ${pct(acc.dd).padStart(6)}   ${pct(bs.c5).padStart(7)} / ${pct(bs.c50).padStart(6)} / ${pct(bs.c95).padStart(6)}   ${(bs.pLoss * 100).toFixed(0).padStart(4)}%   ${pct(bs.dd50)}`);
}
if (!process.env.CY) fs.writeFileSync(path.join(ROOT, 'data', 'mc-study.json'), JSON.stringify(result, null, 1));

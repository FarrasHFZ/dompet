// Pullback inside the stock's OWN uptrend: can it trade while the IHSG filter is off?
//
// PRE-REGISTERED 2026-10-10, committed before the first run.
// Why: 68% of oversold signals are PAUSE (IHSG under its 200-day average, tools/experiment-mc.mjs). Dropping the filter
// entirely added trades but doubled drawdowns. Hypothesis: a stock still in its own uptrend is buying a dip, not
// catching a falling knife, even when the index is weak ("pullback in uptrend": mean-reversion timing, trend direction).
//
// Data: Yahoo 10y daily, the tested 100 stocks (today's list: survivorship flatters every rule equally), IHSG.
// Trade (unchanged live rule): score >= 65 + bounce candle, buy next open, wide stop min(plan, entry - 3.5 ATR), plan
// target, 15 sessions, 0.4% fees. Account: 10 equal slots, highest score first, one position per stock, marked to market.
//   Stock uptrend (fixed, no tuning): close > SMA200 AND SMA50 > SMA200, both on the signal day.
// Rules:
//   LIVE   IHSG > its 200d average                                     (today)
//   UNION  IHSG > its 200d average OR the stock is in its own uptrend  (PRIMARY candidate)
//   OWN    the stock's own uptrend only, no index filter               (reported)
// ADOPT UNION only if ALL hold:
//   A. Both halves, 2017-10..2022-09 and 2022-10..2026-09: UNION account return/yr (no interest on idle cash) > LIVE.
//   B. 2022-10..2026-09: UNION max drawdown no more than 3 points deeper than LIVE's.
//   C. The ADDED trades (index filter off, stock in uptrend), whole period: mean beats a same-day random-stock Monte
//      Carlo null (2000 runs, same % stop and target) with p < 0.05.
// Guard, run first: the live rule on SHUFFLED prices (each stock's daily bars permuted, IHSG too) must show no edge
// over its null (p > 0.05). If it does, there is a look-ahead leak and nothing below counts.
// Reported only: Sharpe / Sortino / profit factor, accounts with 4.5%/yr on idle cash, a 3-ATR target on the same
// entries, a Kelly estimate for the adopted rule.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, expansionTickers } from './lib.mjs';

const api = loadEngine(), NEW = expansionTickers(), uni = universe(api).filter(u => !NEW.has(u.ticker));
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const FEE = 0.004, WINDOW = 270, SLOTS = 10, SPLIT = '2022-10-01', iso = d => d.toISOString().slice(0, 10);
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const pct = (x, d = 1) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
let seed = 20261010; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const real = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '10y', true);

function sim(b, i0, stop, target) {
  const j0 = i0 + 1, last = j0 + cfg.horizon - 1; if (last >= b.c.length) return null;
  const entry = b.o[j0];
  for (let j = j0; j <= last; j++) {
    if (b.l[j] <= stop) return { ret: Math.min(stop, b.o[j]) / entry - 1 - FEE, j0, j1: j };
    if (b.h[j] >= target) return { ret: Math.max(target, b.o[j]) / entry - 1 - FEE, j0, j1: j };
  }
  return { ret: b.c[last] / entry - 1 - FEE, j0, j1: last };
}

function scan(px) {
  const idx = px['^JKSE'], idxBy = new Map(idx.d.map((d, i) => [iso(d), i]));
  const days = new Map(), sig = [];
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
      const candle = b.c[k] > b.h[k - 1] || (b.c[k] > b.o[k] && b.c[k] > b.c[k - 1]);
      if (!candle) continue;
      const mOk = idx.c[ii] > idx.c.slice(ii - 199, ii + 1).reduce((x, y) => x + y, 0) / 200;
      const up = a.sma200 != null && a.sma50 != null && b.c[k] > a.sma200 && a.sma50 > a.sma200;
      const stop = api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down');
      const tr = sim(b, k, stop, a.target); if (!tr) continue;
      const atrT = sim(b, k, stop, a.entry + 3 * a.atr);
      const entry = b.o[k + 1];
      sig.push({ tk: u.ticker, day, k, score, mOk, up, ...tr, retAtr: atrT ? atrT.ret : null, stopPct: stop / entry - 1, tpPct: a.target / entry - 1 });
    }
  }
  return { sig, days };
}

function nullTest(trades, days, px, runs = 2000) {
  const m = mean(trades.map(t => t.ret)), out = [];
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
  out.sort((a, b) => a - b);
  return { mean: m, nullMean: mean(out), p: out.filter(x => x >= m).length / runs };
}

function maxDD(eqs) { let pk = -Infinity, dd = 0; for (const v of eqs) { pk = Math.max(pk, v); dd = Math.min(dd, v / pk - 1); } return dd; }
function account(trades, px, from, to, cy) {
  const dayIdx = new Map(), byDay = new Map();
  trades.forEach(t => { if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push(t); });
  const at = (tk, day) => { if (!dayIdx.has(tk)) dayIdx.set(tk, new Map(px[tk + '.JK'].d.map((d, i) => [iso(d), i]))); return dayIdx.get(tk).get(day); };
  const val = (p, day) => { const i = at(p.tk, day); if (i != null) p.last = p.amt * px[p.tk + '.JK'].c[i] / px[p.tk + '.JK'].o[p.j0]; return p.last; };
  let cash = 1, open = [];
  const daily = [], month = new Map();
  for (const d of px['^JKSE'].d) {
    const day = iso(d); if (day < from || day > to) continue;
    cash *= 1 + cy / 245;
    open = open.filter(p => { if (p.exitDay <= day) { cash += p.amt * (1 + p.ret); return false; } return true; });
    const eq = cash + open.reduce((s, p) => s + val(p, day), 0);
    for (const t of (byDay.get(day) || []).sort((a, b) => b.score - a.score)) {
      if (open.length >= SLOTS || open.some(p => p.tk === t.tk)) continue;
      const amt = Math.min(eq / SLOTS, cash); if (amt <= 0) break;
      cash -= amt;
      open.push({ tk: t.tk, amt, last: amt, j0: t.j0, ret: t.ret, exitDay: iso(px[t.tk + '.JK'].d[t.j1]) });
    }
    const e = cash + open.reduce((s, p) => s + p.last, 0);
    daily.push(e); month.set(day.slice(0, 7), e);
  }
  const m = [...month.values()], r = m.slice(1).map((v, i) => v / m[i] - 1), sd = x => Math.sqrt(mean(x.map(y => (y - mean(x)) ** 2)));
  const down = Math.sqrt(mean(r.map(y => Math.min(0, y) ** 2)));
  return { cagr: Math.pow(daily.at(-1), 245 / daily.length) - 1, dd: maxDD(daily), sharpe: mean(r) / (sd(r) || 1) * Math.sqrt(12), sortino: mean(r) / (down || 1) * Math.sqrt(12) };
}
const pf = tr => { const g = tr.filter(t => t.ret > 0).reduce((s, t) => s + t.ret, 0), l = -tr.filter(t => t.ret < 0).reduce((s, t) => s + t.ret, 0); return l ? g / l : null; };

// ---------- guard: shuffled prices ----------
function shuffled(b) {
  const n = b.c.length, idxs = [...Array(n - 1).keys()].map(i => i + 1);
  for (let i = idxs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idxs[i], idxs[j]] = [idxs[j], idxs[i]]; }
  const o = [b.o[0]], h = [b.h[0]], l = [b.l[0]], c = [b.c[0]], v = [b.v[0]];
  idxs.forEach(i => { const p = c.at(-1), base = b.c[i - 1]; o.push(p * b.o[i] / base); h.push(p * b.h[i] / base); l.push(p * b.l[i] / base); c.push(p * b.c[i] / base); v.push(b.v[i]); });
  return { d: b.d, o, h, l, c, v };
}
const t0 = Date.now();
const shufPx = Object.fromEntries(Object.entries(real).filter(([, b]) => b).map(([k, b]) => [k, shuffled(b)]));
const S = scan(shufPx), sLive = S.sig.filter(x => x.mOk), g = nullTest(sLive, S.days, shufPx, 500);
const guardOk = g.p > 0.05;
console.log(`GUARD shuffled prices: live rule ${sLive.length} trades, mean ${pct(g.mean, 2)} vs null ${pct(g.nullMean, 2)}, p ${g.p.toFixed(3)} -> ${guardOk ? 'no edge on noise (OK)' : 'EDGE ON NOISE: LEAK SUSPECTED'}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

// ---------- the test ----------
const R = scan(real), allDays = [...R.days.keys()].sort();
const RULES = { LIVE: x => x.mOk, UNION: x => x.mOk || x.up, OWN: x => x.up };
const HALVES = [['2017-10', allDays[0], '2022-09-30'], ['2022-10', SPLIT, allDays.at(-1)]];
console.log(`\nreal prices ${allDays[0]} .. ${allDays.at(-1)}, ${R.sig.length} oversold + bounce-candle signals (${R.sig.filter(x => !x.mOk).length} while the IHSG filter was off, ${R.sig.filter(x => !x.mOk && x.up).length} of those in their own uptrend)`);
const res = { asOf: new Date().toISOString().slice(0, 10), from: allDays[0], to: allDays.at(-1), guard: { ...g, n: sLive.length, ok: guardOk }, halves: {} };
console.log('\nhalf     rule    trades  win%   mean    PF     acct/yr  maxDD   Sharpe Sortino | +4.5% cash acct/yr | 3-ATR target mean');
for (const [name, from, to] of HALVES) {
  res.halves[name] = {};
  for (const [rn, f] of Object.entries(RULES)) {
    const tr = R.sig.filter(x => f(x) && x.day >= from && x.day <= to);
    const a0 = account(tr, real, from, to, 0), a45 = account(tr, real, from, to, 0.045);
    res.halves[name][rn] = { n: tr.length, win: tr.filter(t => t.ret > 0).length / tr.length, mean: mean(tr.map(t => t.ret)), pf: pf(tr), ...a0, cagrCash: a45.cagr, meanAtr: mean(tr.filter(t => t.retAtr != null).map(t => t.retAtr)) };
    const x = res.halves[name][rn];
    console.log(`${name}  ${rn.padEnd(6)} ${String(x.n).padStart(6)}  ${(x.win * 100).toFixed(0).padStart(3)}%  ${pct(x.mean, 2).padStart(7)}  ${x.pf == null ? '–' : x.pf.toFixed(2)}   ${pct(x.cagr).padStart(7)}  ${pct(x.dd).padStart(6)}  ${x.sharpe.toFixed(2).padStart(5)}  ${x.sortino.toFixed(2).padStart(5)}  | ${pct(x.cagrCash).padStart(7)}            | ${pct(x.meanAtr, 2)}`);
  }
}
const added = R.sig.filter(x => !x.mOk && x.up), ad = nullTest(added, R.days, real);
res.added = { n: added.length, ...ad };
console.log(`\nADDED trades (filter off, own uptrend): ${added.length}, mean ${pct(ad.mean, 2)} vs same-day random ${pct(ad.nullMean, 2)}, p ${ad.p.toFixed(3)}`);
const H = res.halves;
const A = H['2017-10'].UNION.cagr > H['2017-10'].LIVE.cagr && H['2022-10'].UNION.cagr > H['2022-10'].LIVE.cagr;
const B = H['2022-10'].UNION.dd >= H['2022-10'].LIVE.dd - 0.03;
const C = ad.p < 0.05 && ad.mean > ad.nullMean;
res.verdict = { A, B, C, guardOk, adopt: guardOk && A && B && C };
console.log(`\nVERDICT  A (beats LIVE both halves) ${A ? 'PASS' : 'FAIL'} · B (drawdown within 3 pts) ${B ? 'PASS' : 'FAIL'} · C (added trades beat random, p<0.05) ${C ? 'PASS' : 'FAIL'} · guard ${guardOk ? 'OK' : 'FAIL'} -> ${res.verdict.adopt ? 'ADOPT UNION' : 'KEEP LIVE'}`);
// Kelly estimate (reported): f* = W - (1 - W) / R on the rule that is live after this test
const kt = R.sig.filter(res.verdict.adopt ? RULES.UNION : RULES.LIVE), W = kt.filter(t => t.ret > 0).length / kt.length;
const Rr = mean(kt.filter(t => t.ret > 0).map(t => t.ret)) / -mean(kt.filter(t => t.ret <= 0).map(t => t.ret));
res.kelly = { W, R: Rr, f: W - (1 - W) / Rr };
console.log(`Kelly (${res.verdict.adopt ? 'UNION' : 'LIVE'}, ${kt.length} trades): W ${(W * 100).toFixed(0)}%, avg win / avg loss ${Rr.toFixed(2)} -> f* ${pct(res.kelly.f)} per trade (half-Kelly ${pct(res.kelly.f / 2)}); the site uses 10% per position`);
fs.writeFileSync(path.join(ROOT, 'data', 'trend-study.json'), JSON.stringify(res, null, 1));

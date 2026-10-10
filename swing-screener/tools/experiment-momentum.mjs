// Cross-sectional momentum on IDX: does holding last year's winners beat holding everything?
//
// PRE-REGISTERED 2026-10-10, committed before the first run.
// Why: the oversold bounce (mean reversion) showed no edge over 10 years (experiment-trend / -permutation). Momentum has
// the deeper evidence base (Jegadeesh-Titman 1993; time-series momentum, Moskowitz-Ooi-Pedersen 2012), though it is
// known to be weaker in emerging markets, so this may fail too.
//
// Rule MOM10 (no tuning, textbook settings):
//   On the last trading day of each month, among liquid stocks (average traded value >= Rp 5 B over 20 sessions),
//   rank by 12-1 month return: close 21 sessions ago / close 252 sessions ago - 1. Hold the top 10, equal weight,
//   bought at the next open, held until the next month's rebalance open. 0.2% fee on each buy and each sell (0.4% round
//   trip), charged only on names that change. Market filter as on the site: invest only if the IHSG closed above its
//   200-day average on the rebalance day, else cash (0%).
// Benchmark EW: every liquid stock, equal weight, same months, same filter, same fees.
// Null RND10: 10 random liquid stocks each month (same filter months), 2000 runs. Months never overlap, so each month
// is independent evidence (the overlap problem that sank the bounce test does not arise).
// Data: Yahoo 10y daily. Design set = the tested 100; holdout = the 200 added on 2026-10-10. Today's lists, so dead
// stocks are missing: that flatters momentum more than EW (losers that delisted are gone), a known bias, stated.
// MOM10 PASSES only if ALL hold:
//   A. Tested 100, both halves (2017-10..2022-09 and 2022-10..2026-09 rebalances): MOM10 return/yr > EW's.
//   B. Tested 100, whole period: MOM10 return/yr beats RND10 with p < 0.05.
//   C. Holdout 200, whole period: MOM10 return/yr > EW's AND beats RND10 with p < 0.10.
// Guard, run first: forward returns shuffled ACROSS stocks within each month (ranking can no longer know anything);
// MOM10 must then NOT beat RND10 (p > 0.05), else there is a look-ahead bug.
// If it passes: a paper-only "Momentum 10" list on the site with its own forward record. Not money.
// Reported only: without the filter, IHSG, max drawdown (daily, marked to market), Sharpe, Sortino, idle cash at 4.5%.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, expansionTickers } from './lib.mjs';

const api = loadEngine(), NEW = expansionTickers(), ALL = universe(api);
const FEE = 0.002, TOP = 10, SPLIT = '2022-10', iso = d => d.toISOString().slice(0, 10);
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const pct = (x, d = 1) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
let seed = 20261010; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

async function build(tickers) {
  const px = await loadPrices(tickers.map(t => t + '.JK').concat(['^JKSE']), '10y', true);
  const idx = px['^JKSE'], days = idx.d.map(iso);
  const at = {}; for (const t of tickers) { const b = px[t + '.JK']; if (b) at[t] = new Map(b.d.map((d, i) => [iso(d), i])); }
  // rebalance = last IHSG session of each month; entry = next session's open
  const reb = days.map((d, i) => i).filter(i => i + 1 < days.length && days[i].slice(0, 7) !== days[i + 1].slice(0, 7) && i >= 252);
  const months = [];
  for (let m = 0; m + 1 < reb.length; m++) {
    const i = reb[m], e0 = days[i + 1], e1 = days[reb[m + 1] + 1];
    if (!e1) break;
    const sma = idx.c.slice(i - 199, i + 1).reduce((s, x) => s + x, 0) / 200;
    const rows = [];
    for (const t of tickers) {
      const b = px[t + '.JK'], M = at[t]; if (!b) continue;
      const k = M.get(days[i]), a = M.get(e0), z = M.get(e1);
      if (k == null || a == null || z == null || k < 252) continue;
      const val = mean(b.c.slice(k - 19, k + 1).map((c, j) => c * b.v[k - 19 + j]));
      if (val < 5e9 || !b.c[k - 252] || b.v.slice(k - 2, k + 1).every(v => !v)) continue;
      rows.push({ t, mom: b.c[k - 21] / b.c[k - 252] - 1, ret: b.o[z] / b.o[a] - 1, a, z });
    }
    months.push({ d: days[i], ym: days[i].slice(0, 7), on: idx.c[i] > sma, rows, e0, e1 });
  }
  return { px, idx, days, months };
}

// Monthly portfolio returns for a picker (rows -> chosen tickers), fees on names that change.
function run(months, pick, { filter = true, cash = 0 } = {}) {
  let prev = new Set();
  return months.map(m => {
    if (filter && !m.on) { const r = cash / 12 - (prev.size ? FEE : 0); prev = new Set(); return { ym: m.ym, r, held: [] }; }
    const ch = pick(m.rows); if (!ch.length) { prev = new Set(); return { ym: m.ym, r: cash / 12, held: [] }; }
    const set = new Set(ch.map(x => x.t)), newN = ch.filter(x => !prev.has(x.t)).length, outN = [...prev].filter(t => !set.has(t)).length;
    const r = mean(ch.map(x => x.ret)) - FEE * (newN / ch.length) - (prev.size ? FEE * (outN / prev.size) : 0);
    prev = set;
    return { ym: m.ym, r, held: ch };
  });
}
const top = rows => rows.slice().sort((a, b) => b.mom - a.mom).slice(0, TOP);
const ew = rows => rows;
const rand = rows => { const a = rows.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, TOP); };
const cagr = rs => { const g = rs.reduce((e, x) => e * (1 + x.r), 1); return Math.pow(g, 12 / (rs.length || 1)) - 1; };
const stats = rs => { const r = rs.map(x => x.r), sd = Math.sqrt(mean(r.map(y => (y - mean(r)) ** 2))), dn = Math.sqrt(mean(r.map(y => Math.min(0, y) ** 2)));
  let e = 1, pk = 1, dd = 0; for (const x of r) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.min(dd, e / pk - 1); }
  return { cagr: cagr(rs), sharpe: mean(r) / (sd || 1) * Math.sqrt(12), sortino: mean(r) / (dn || 1) * Math.sqrt(12), mddMonthly: dd }; };
// Daily marked-to-market drawdown for the real picks
function dailyDD(B, res) {
  let e = 1, pk = 1, dd = 0;
  for (const m of res) {
    if (!m.held.length) continue;
    const w = 1 / m.held.length, base = e;
    const series = m.held.map(h => { const b = B.px[h.t + '.JK']; return b.c.slice(h.a, h.z).map(c => c / b.o[h.a]); });
    const n = Math.max(...series.map(s => s.length));
    for (let j = 0; j < n; j++) { const v = base * mean(series.map(s => s[Math.min(j, s.length - 1)])); pk = Math.max(pk, v); dd = Math.min(dd, v / pk - 1); }
    e = base * (1 + m.r); pk = Math.max(pk, e);
  }
  return dd;
}
function nullP(months, real, opts, runs = 2000) {
  const sims = []; for (let r = 0; r < runs; r++) sims.push(cagr(run(months, rand, opts)));
  sims.sort((a, b) => a - b);
  return { p: sims.filter(x => x >= real).length / runs, med: sims[runs >> 1], lo: sims[Math.floor(runs * 0.05)], hi: sims[Math.floor(runs * 0.95)] };
}
const half = (res, a) => res.filter(m => (a ? m.ym < SPLIT : m.ym >= SPLIT));

const out = { asOf: new Date().toISOString().slice(0, 10) };
const T = await build(ALL.filter(u => !NEW.has(u.ticker)).map(u => u.ticker));
console.log(`tested 100: ${T.months.length} monthly rebalances ${T.months[0].ym} .. ${T.months.at(-1).ym}, filter on in ${T.months.filter(m => m.on).length}, avg ${mean(T.months.map(m => m.rows.length)).toFixed(0)} liquid stocks a month`);

// guard: forward returns shuffled across stocks within each month
const G = T.months.map(m => { const rs = m.rows.map(r => r.ret); for (let i = rs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rs[i], rs[j]] = [rs[j], rs[i]]; } return { ...m, rows: m.rows.map((r, i) => ({ ...r, ret: rs[i] })) }; });
const gReal = cagr(run(G, top)), gN = nullP(G, gReal, {}, 1000);
out.guard = { cagr: gReal, ...gN, ok: gN.p > 0.05 };
console.log(`GUARD returns shuffled across stocks: MOM10 ${pct(gReal)}/yr vs random-10 median ${pct(gN.med)}, p ${gN.p.toFixed(3)} -> ${out.guard.ok ? 'OK (ranking knows nothing, as it should)' : 'LOOK-AHEAD SUSPECTED'}`);

const report = (B, label) => {
  const r = {};
  for (const [name, f, o] of [['MOM10', top, {}], ['EW', ew, {}], ['MOM10 no filter', top, { filter: false }], ['EW no filter', ew, { filter: false }]]) {
    const res = run(B.months, f, o), s = stats(res);
    r[name] = { ...s, first: cagr(half(res, true)), second: cagr(half(res, false)), cash45: cagr(run(B.months, f, { ...o, cash: 0.045 })), dd: dailyDD(B, res) };
  }
  const i0 = B.days.indexOf(B.months[0].e0), i1 = B.days.indexOf(B.months.at(-1).e1);
  r.IHSG = { cagr: Math.pow(B.idx.c[i1] / B.idx.c[i0], 245 / (i1 - i0)) - 1 };
  console.log(`\n${label}           /yr     2017-22   2022-26   Sharpe Sortino  maxDD(daily)  idle cash 4.5%`);
  for (const [k, v] of Object.entries(r)) if (k !== 'IHSG') console.log(`  ${k.padEnd(16)} ${pct(v.cagr).padStart(7)}  ${pct(v.first).padStart(7)}  ${pct(v.second).padStart(7)}   ${v.sharpe.toFixed(2).padStart(5)}  ${v.sortino.toFixed(2).padStart(5)}   ${pct(v.dd).padStart(7)}      ${pct(v.cash45)}`);
  console.log(`  IHSG (price)     ${pct(r.IHSG.cagr).padStart(7)}`);
  return r;
};
out.tested = report(T, 'TESTED 100');
const nT = nullP(T.months, out.tested.MOM10.cagr, {});
out.tested.null = nT;
console.log(`  random-10 (filtered) median ${pct(nT.med)}/yr [5-95%: ${pct(nT.lo)}, ${pct(nT.hi)}], MOM10 p ${nT.p.toFixed(3)}`);

const H = await build(ALL.filter(u => NEW.has(u.ticker)).map(u => u.ticker));
out.holdout = report(H, 'HOLDOUT 200');
const nH = nullP(H.months, out.holdout.MOM10.cagr, {});
out.holdout.null = nH;
console.log(`  random-10 (filtered) median ${pct(nH.med)}/yr [5-95%: ${pct(nH.lo)}, ${pct(nH.hi)}], MOM10 p ${nH.p.toFixed(3)}`);

const t = out.tested, h = out.holdout;
const A = t.MOM10.first > t.EW.first && t.MOM10.second > t.EW.second;
const Bp = nT.p < 0.05;
const C = h.MOM10.cagr > h.EW.cagr && nH.p < 0.10;
out.verdict = { A, B: Bp, C, guard: out.guard.ok, pass: out.guard.ok && A && Bp && C };
console.log(`\nVERDICT  A (beats EW both halves) ${A ? 'PASS' : 'FAIL'} · B (beats random, p<0.05) ${Bp ? 'PASS' : 'FAIL'} · C (holdout beats EW and random p<0.10) ${C ? 'PASS' : 'FAIL'} · guard ${out.guard.ok ? 'OK' : 'FAIL'} -> ${out.verdict.pass ? 'MOM10 PASSES: paper-only list with a forward record' : 'MOM10 FAILS'}`);
const last = T.months.at(-1);
console.log(`(latest rebalance ${last.ym}, filter ${last.on ? 'on' : 'OFF'}; top 10 by 12-1 momentum: ${top(last.rows).map(x => x.t + ' ' + pct(x.mom, 0)).join(', ')})`);
fs.writeFileSync(path.join(ROOT, 'data', 'momentum-study.json'), JSON.stringify(out, null, 1));

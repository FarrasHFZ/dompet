// Momentum without hindsight: a point-in-time universe.
//
// PRE-REGISTERED 2026-10-10, committed before the first run.
// Why: experiment-momentum.mjs passed, but on TODAY's 100 / 200 most-traded stocks. Stocks that became big winners
// are in those lists because they won, which flatters momentum (survivorship / look-ahead in the universe).
// Fix: every IDX code with Yahoo history (913 codes from data/cache/rank-all.json, the KSEI holder file of 2026-10),
// and at EACH month-end the universe is rebuilt from what was known then:
//   the 100 codes with the highest MEDIAN daily traded value over the previous 60 sessions, last close >= Rp 50,
//   traded in each of the last 3 sessions, and with 252+ sessions of history.
// Rule MOM10, benchmark EW, null RND10, fees, filter, halves: exactly as in experiment-momentum.mjs.
// Still biased: stocks delisted before 2026-10 have no Yahoo data and are missing (mostly small, illiquid names).
// MOM10 PASSES the hindsight check only if ALL hold:
//   A. Return/yr > EW's in both halves (2017-10..2022-09, 2022-10..2026-09 rebalances).
//   B. Whole period: beats RND10 (2000 runs) with p < 0.05.
// If it fails, the momentum result is treated as a survivorship artefact and the paper list says so.
// Reported only: a top-200 universe, without the filter, drawdowns, Sharpe / Sortino.
import fs from 'node:fs';
import path from 'node:path';
import { loadPrices, ROOT, CACHE, loadEngine, universe } from './lib.mjs';

const FEE = 0.002, TOP = 10, SPLIT = '2022-10', iso = d => d.toISOString().slice(0, 10);
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const pct = (x, d = 1) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
let seed = 20261010; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const codes = JSON.parse(fs.readFileSync(path.join(CACHE, 'rank-all.json'), 'utf8')).map(r => r.c);
const px = await loadPrices(codes.map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const have = codes.filter(t => px[t + '.JK'] && px[t + '.JK'].c.length > 300);
console.log(`${have.length} of ${codes.length} codes have 10y Yahoo history (>300 sessions)`);
const idx = px['^JKSE'], days = idx.d.map(iso);
const at = {}; for (const t of have) at[t] = new Map(px[t + '.JK'].d.map((d, i) => [iso(d), i]));
const reb = days.map((d, i) => i).filter(i => i + 1 < days.length && days[i].slice(0, 7) !== days[i + 1].slice(0, 7) && i >= 252);

function months(N) {
  const out = [];
  for (let m = 0; m + 1 < reb.length; m++) {
    const i = reb[m], e0 = days[i + 1], e1 = days[reb[m + 1] + 1]; if (!e1) break;
    const sma = idx.c.slice(i - 199, i + 1).reduce((s, x) => s + x, 0) / 200;
    const cand = [];
    for (const t of have) {
      const b = px[t + '.JK'], M = at[t], k = M.get(days[i]), a = M.get(e0), z = M.get(e1);
      if (k == null || a == null || z == null || k < 252 || b.c[k] < 50 || b.v.slice(k - 2, k + 1).some(v => !v)) continue;
      const med = median(b.c.slice(k - 59, k + 1).map((c, j) => c * b.v[k - 59 + j]));
      cand.push({ t, med, mom: b.c[k - 21] / b.c[k - 252] - 1, ret: b.o[z] / b.o[a] - 1, a, z });
    }
    const rows = cand.sort((x, y) => y.med - x.med).slice(0, N);
    out.push({ d: days[i], ym: days[i].slice(0, 7), on: idx.c[i] > sma, rows, e0, e1 });
  }
  return out;
}
function run(ms, pick, { filter = true } = {}) {
  let prev = new Set();
  return ms.map(m => {
    if (filter && !m.on) { const r = prev.size ? -FEE : 0; prev = new Set(); return { ym: m.ym, r, held: [] }; }
    const ch = pick(m.rows); if (!ch.length) { prev = new Set(); return { ym: m.ym, r: 0, held: [] }; }
    const set = new Set(ch.map(x => x.t)), newN = ch.filter(x => !prev.has(x.t)).length, outN = [...prev].filter(t => !set.has(t)).length;
    const r = mean(ch.map(x => x.ret)) - FEE * (newN / ch.length) - (prev.size ? FEE * (outN / prev.size) : 0);
    prev = set;
    return { ym: m.ym, r, held: ch };
  });
}
const top = rows => rows.slice().sort((a, b) => b.mom - a.mom).slice(0, TOP);
const ew = rows => rows;
const rand = rows => { const a = rows.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, TOP); };
const cagr = rs => Math.pow(rs.reduce((e, x) => e * (1 + x.r), 1), 12 / (rs.length || 1)) - 1;
const half = (rs, a) => rs.filter(m => (a ? m.ym < SPLIT : m.ym >= SPLIT));
function stats(rs) {
  const r = rs.map(x => x.r), sd = Math.sqrt(mean(r.map(y => (y - mean(r)) ** 2))), dn = Math.sqrt(mean(r.map(y => Math.min(0, y) ** 2)));
  let e = 1, pk = 1, dd = 0; for (const x of r) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.min(dd, e / pk - 1); }
  return { cagr: cagr(rs), first: cagr(half(rs, true)), second: cagr(half(rs, false)), sharpe: mean(r) / (sd || 1) * Math.sqrt(12), sortino: mean(r) / (dn || 1) * Math.sqrt(12), mddMonthly: dd };
}
function nullP(ms, real, runs = 2000) {
  const s = []; for (let r = 0; r < runs; r++) s.push(cagr(run(ms, rand)));
  s.sort((a, b) => a - b);
  return { p: s.filter(x => x >= real).length / runs, med: s[runs >> 1], lo: s[Math.floor(runs * 0.05)], hi: s[Math.floor(runs * 0.95)] };
}

const out = { asOf: new Date().toISOString().slice(0, 10), codes: codes.length, withHistory: have.length };
for (const N of [100, 200]) {
  const ms = months(N), r = {};
  for (const [name, f, o] of [['MOM10', top, {}], ['EW', ew, {}], ['MOM10 no filter', top, { filter: false }], ['EW no filter', ew, { filter: false }]]) r[name] = stats(run(ms, f, o));
  r.null = nullP(ms, r.MOM10.cagr);
  // how much of the universe is "hindsight": share of the monthly universe that is NOT in today's 300
  const today = new Set(universe(loadEngine()).map(u => u.ticker));
  r.outsideToday300 = mean(ms.map(m => m.rows.filter(x => !today.has(x.t)).length / (m.rows.length || 1)));
  out['top' + N] = r;
  console.log(`\nPOINT-IN-TIME TOP ${N} (${ms[0].ym} .. ${ms.at(-1).ym}; on average ${pct(r.outsideToday300, 0)} of each month's universe is NOT in today's 300)`);
  console.log('  rule              /yr     2017-22   2022-26   Sharpe Sortino  worst month-end DD');
  for (const [k, v] of Object.entries(r)) if (v && v.cagr != null) console.log(`  ${k.padEnd(16)} ${pct(v.cagr).padStart(7)}  ${pct(v.first).padStart(7)}  ${pct(v.second).padStart(7)}   ${v.sharpe.toFixed(2).padStart(5)}  ${v.sortino.toFixed(2).padStart(5)}   ${pct(v.mddMonthly)}`);
  console.log(`  random-10 median ${pct(r.null.med)}/yr [5-95%: ${pct(r.null.lo)}, ${pct(r.null.hi)}], MOM10 p ${r.null.p.toFixed(3)}`);
}
const t = out.top100;
const A = t.MOM10.first > t.EW.first && t.MOM10.second > t.EW.second, B = t.null.p < 0.05;
out.verdict = { A, B, pass: A && B };
console.log(`\nVERDICT (top 100, pre-registered)  A (beats EW both halves) ${A ? 'PASS' : 'FAIL'} · B (beats random, p<0.05) ${B ? 'PASS' : 'FAIL'} -> ${out.verdict.pass ? 'momentum survives the hindsight check' : 'momentum result looks like a survivorship artefact'}`);
fs.writeFileSync(path.join(ROOT, 'data', 'momentum-pit.json'), JSON.stringify(out, null, 1));

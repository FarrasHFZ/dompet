// How many positions, and how big? The v4 study noticed "8 smaller positions beat 5 in every variant" but that was not
// pre-registered, so it was never adopted. This is the proper test.
//
// PRE-REGISTERED 2026-10-10, before the first run. Same walk-forward recipe that picked the market filter:
//   Trades: the live rule on the tested 100 (ACT + bounce candle, wide 3.5-ATR stop, +8%, 15 sessions, next open, 0.4%
//   fees), only while IHSG > 200-day average (the adopted filter); idle cash earns 4.5%/yr. Highest score first.
//   Candidates:
//     N3, N5 (today), N8, N10   equal weight, 1/N of equity per position, at most N open
//     R8                        risk-based: each position sized so its stop loses 1.5% of equity, capped at 1/5 of
//                               equity, at most 8 open
//   Choose the candidate with the best CAGR on the FIRST half (2022-10 .. 2024-09). ADOPT it only if on the SECOND half
//   (2024-10 ..) its CAGR beats N5 AND its max drawdown is no more than 2 points deeper than N5's. If N5 itself wins
//   the first half, nothing changes.
//   Reported only: full-period numbers for every candidate, trades, time invested.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, expansionTickers } from './lib.mjs';

const api = loadEngine(), NEW = expansionTickers(), uni = universe(api).filter(u => !NEW.has(u.ticker));
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const FEE = 0.004, WINDOW = 270, CY = 0.045, iso = d => d.toISOString().slice(0, 10);
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '5y', process.env.REFRESH !== '1');
const idx = px['^JKSE'], idxBy = new Map(idx.d.map((d, i) => [iso(d), i]));
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const pc = x => (x * 100).toFixed(2) + '%';

function sim(b, i0, stop, target) {
  const j0 = i0 + 1, last = j0 + 14; if (last >= b.c.length) return null;
  const entry = b.o[j0];
  for (let j = j0; j <= last; j++) {
    if (b.l[j] <= stop) return { ret: Math.min(stop, b.o[j]) / entry - 1 - FEE, exitIdx: j, entryIdx: j0, risk: 1 - stop / entry };
    if (b.h[j] >= target) return { ret: Math.max(target, b.o[j]) / entry - 1 - FEE, exitIdx: j, entryIdx: j0, risk: 1 - stop / entry };
  }
  return { ret: b.c[last] / entry - 1 - FEE, exitIdx: last, entryIdx: j0, risk: 1 - stop / entry };
}
const LIVE = [];
for (const u of uni) {
  const b = px[u.ticker + '.JK']; if (!b || b.c.length < 300) continue;
  for (let t = 250; t < b.c.length - 17; t++) {
    const day = iso(b.d[t]), ii = idxBy.get(day); if (ii == null || ii < 200) continue;
    if (!(idx.c[ii] > mean(idx.c.slice(ii - 199, ii + 1)))) continue; // market filter
    const lo = Math.max(0, t + 1 - WINDOW);
    const w = { d: b.d.slice(lo, t + 1), o: b.o.slice(lo, t + 1), h: b.h.slice(lo, t + 1), l: b.l.slice(lo, t + 1), c: b.c.slice(lo, t + 1), v: b.v.slice(lo, t + 1) };
    const a = api.analyse_(w, idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
    if (!a || a.avgValue / 1e9 < 5 || a.stop >= a.entry) continue;
    const score = api.score_(a, 0); if (score < api.ACT_SCORE) continue;
    const n = w.c.length; if (!(w.c[n - 1] > w.h[n - 2] || (w.c[n - 1] > w.o[n - 1] && w.c[n - 1] > w.c[n - 2]))) continue;
    const tr = sim(b, t, api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down'), a.target); if (!tr) continue;
    LIVE.push({ tk: u.ticker, day, score, ...tr });
  }
}
const first = LIVE.map(s => s.day).sort()[0];
console.log(`live-rule signals (filter on): ${LIVE.length}, from ${first}`);

function portfolio(cand, from, to) {
  const sig = {}; LIVE.forEach(s => { (sig[s.day] = sig[s.day] || []).push(s); });
  const cal = idx.d.map(iso).filter(d => d >= (from || first) && d <= (to || '9999') && d <= iso(idx.d.at(-1)));
  const cd = (1 + CY) ** (1 / 245) - 1;
  let cash = 1, pos = [], curve = [], trades = 0, inv = 0;
  for (const day of cal) {
    cash *= 1 + cd;
    pos = pos.filter(p => { if (iso(px[p.tk + '.JK'].d[p.exitIdx]) <= day) { cash += p.size * (1 + p.ret); trades++; return false; } return true; });
    const val = cash + pos.reduce((s, p) => { const b = px[p.tk + '.JK']; let i = b.d.findIndex(d => iso(d) === day); if (i < 0) i = p.lastI ?? p.entryIdx; p.lastI = i; return s + p.size * (b.c[i] / b.o[p.entryIdx]); }, 0);
    curve.push([day, val]); inv += (val - cash) / val;
    for (const s of (sig[day] || []).filter(s => !pos.some(p => p.tk === s.tk)).sort((a, b) => b.score - a.score)) {
      if (pos.length >= cand.max) break;
      const want = cand.risk ? Math.min(val * cand.risk / Math.max(0.02, s.risk), val * cand.cap) : val / cand.max;
      const size = Math.min(cash, want); if (size <= val * 0.01) break;
      cash -= size; pos.push({ tk: s.tk, size, ret: s.ret, exitIdx: s.exitIdx, entryIdx: s.entryIdx });
    }
  }
  const yrs = (Date.parse(curve.at(-1)[0]) - Date.parse(curve[0][0])) / 31557600000;
  let pk = 0, mdd = 0; curve.forEach(([, v]) => { pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); });
  return { cagr: curve.at(-1)[1] ** (1 / yrs) - 1, mdd, trades, invested: inv / curve.length, final: curve.at(-1)[1], curve: curve.filter((_, i) => i % 5 === 0) };
}
const C = { N3: { max: 3 }, N5: { max: 5 }, N8: { max: 8 }, N10: { max: 10 }, R8: { max: 8, risk: 0.015, cap: 0.2 } };
const H1 = ['2022-10-01', '2024-09-30'], H2 = ['2024-10-01', null];
const res = {};
for (const [k, c] of Object.entries(C)) res[k] = { first: portfolio(c, ...H1), second: portfolio(c, ...H2), full: portfolio(c) };
console.log('\ncandidate   first half CAGR / maxDD   second half CAGR / maxDD   full CAGR / maxDD   trades  invested');
for (const [k, r] of Object.entries(res)) console.log(`  ${k.padEnd(4)}      ${pc(r.first.cagr).padStart(7)} / ${pc(r.first.mdd).padStart(8)}      ${pc(r.second.cagr).padStart(7)} / ${pc(r.second.mdd).padStart(8)}      ${pc(r.full.cagr).padStart(7)} / ${pc(r.full.mdd).padStart(8)}   ${String(r.full.trades).padStart(4)}   ${pc(r.full.invested)}`);
const pick = Object.keys(C).sort((a, b) => res[b].first.cagr - res[a].first.cagr)[0];
const adopt = pick !== 'N5' && res[pick].second.cagr > res.N5.second.cagr && res[pick].second.mdd >= res.N5.second.mdd - 0.02;
console.log(`\npicked on the first half: ${pick} -> ${pick === 'N5' ? 'no change (today\'s rule won)' : adopt ? 'ADOPT' : 'do not adopt (failed the second half)'}`);
fs.writeFileSync(path.join(ROOT, 'data', 'sizing-study.json'), JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), candidates: C, pick, adopt, rule: adopt ? C[pick] : C.N5, results: Object.fromEntries(Object.entries(res).map(([k, r]) => [k, { first: { cagr: r.first.cagr, mdd: r.first.mdd }, second: { cagr: r.second.cagr, mdd: r.second.mdd }, full: { cagr: r.full.cagr, mdd: r.full.mdd, trades: r.full.trades, invested: r.full.invested, curve: r.full.curve } }])) }));

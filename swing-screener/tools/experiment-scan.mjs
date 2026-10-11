// Broad, disciplined scan: which stock traits predict the next 20 sessions on IDX?
//
// PRE-REGISTERED 2026-10-12, committed before the first run (round 2 after experiment-bottoms.mjs failed all six).
// Why: the bottoms study found the OPPOSITE of "buy the bottom" (low in range -> worse, in all three sets). Instead of
// guessing one idea at a time, test a fixed list of 16 well-known traits at once, with a correction for the number of
// tests, and keep only what survives on stocks the scan never saw.
//
// Data, grid and outcome as experiment-bottoms.mjs, but with 260 sessions of lookback (grid from ~2017-11): every
// 20th IHSG session, liquid stocks (Rp 5 B a day), excess return over 20 sessions from the next open.
// Traits (sign = the direction tested; top tercile minus bottom tercile of the signed trait):
//   T1  pos1y high      close position in the 1-year high-low range (near the high)
//   T2  hi52 near       close / 52-week high (closer = higher)
//   T3  mom 12-1        return from 250 to 20 sessions ago
//   T4  mom 6-1         return from 120 to 20 sessions ago
//   T5  rev 5           MINUS the 5-session return (short-term reversal)
//   T6  rev 20          MINUS the 20-session return
//   T7  low vol         MINUS the 60-session daily-return standard deviation
//   T8  low max         MINUS the largest one-day return in 20 sessions ("lottery" stocks do worse)
//   T9  above 200       close / 200-session average
//   T10 obv 60          on-balance volume over 60 sessions / volume
//   T11 vol trend       20-session / 120-session average traded value (volume coming in)
//   T12 small size      MINUS log traded value (60-session average)
//   T13 clv 20          average close location in the day's range over 20 sessions (closes near highs)
//   T14 up days         share of up days in 20 sessions
//   T15 tight 60        MINUS the 60-session high / low range
//   T16 trend r2        R² of a straight line through 60 log closes, times the sign of its slope (smooth uptrend)
// PASS (each trait): DISCOVERY = the 300 stocks before 2022-01-01: permutation p < 0.05/16 = 0.003, t >= 2, same sign
// in both halves (split at the middle date); CONFIRM 1 = the 613 never-used stocks, all years: t >= 2; CONFIRM 2 = the
// 300 stocks from 2022: spread > 0. A pass becomes a ranked list on the site (like Momentum 10) with a forward test;
// combining passes into a score is a separate, later pre-registration. Nothing is retuned after the run.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, CACHE } from './lib.mjs';
import { mean, sd, terciles, fmt } from './study-lib.mjs';

const IN300 = universe(loadEngine()).map(u => u.ticker), S300 = new Set(IN300);
const OTHER = JSON.parse(fs.readFileSync(path.join(CACHE, 'rank-all.json'), 'utf8')).map(r => r.c).filter(c => !S300.has(c));
const H = 20, STEP = 20, LB = 260, DISC_END = '2022-01-01', iso = d => d.toISOString().slice(0, 10);
const px = await loadPrices(IN300.concat(OTHER).map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const idx = px['^JKSE'], grid = [];
for (let i = LB + 5; i + H + 1 < idx.c.length; i += STEP) grid.push(iso(idx.d[i]));
const GRID = new Set(grid);
const TR = ['T1 pos1y high', 'T2 hi52 near', 'T3 mom 12-1', 'T4 mom 6-1', 'T5 rev 5', 'T6 rev 20', 'T7 low vol', 'T8 low max', 'T9 above 200', 'T10 obv 60', 'T11 vol trend', 'T12 small size', 'T13 clv 20', 'T14 up days', 'T15 tight 60', 'T16 trend r2'];

const rows = [];
for (const t of IN300.concat(OTHER)) {
  const b = px[t + '.JK']; if (!b || b.c.length < LB + 30) continue;
  const set = S300.has(t) ? '300' : 'other';
  let obv = 0; const OBV = b.c.map((c, k) => (k ? (obv += c > b.c[k - 1] ? b.v[k] : c < b.c[k - 1] ? -b.v[k] : 0) : 0));
  for (let k = LB; k + H + 1 < b.c.length; k++) {
    const day = iso(b.d[k]); if (!GRID.has(day)) continue;
    const tv = i => b.c[i] * b.v[i];
    let v20 = 0; for (let i = k - 19; i <= k; i++) v20 += tv(i); v20 /= 20;
    if (v20 < 5e9 || !b.v[k] || !b.v[k - 1] || !b.v[k - 2] || !(b.o[k + 1] > 0) || !(b.c[k - 250] > 0)) continue;
    const fwd = b.o[k + H + 1] / b.o[k + 1] - 1; if (!isFinite(fwd) || Math.abs(fwd) > 3) continue;
    let hi = -Infinity, lo = Infinity; for (let i = k - 249; i <= k; i++) { hi = Math.max(hi, b.h[i]); if (b.l[i] > 0) lo = Math.min(lo, b.l[i]); }
    const rets = []; for (let i = k - 59; i <= k; i++) if (b.c[i - 1] > 0) rets.push(b.c[i] / b.c[i - 1] - 1);
    let mx = -Infinity, up = 0, clv = 0; for (let i = k - 19; i <= k; i++) { const r = b.c[i] / b.c[i - 1] - 1; mx = Math.max(mx, r); if (r > 0) up++; clv += b.h[i] > b.l[i] ? (b.c[i] - b.l[i]) / (b.h[i] - b.l[i]) : 0.5; }
    let v120 = 0, v60 = 0, vol60 = 0, hi6 = -Infinity, lo6 = Infinity; for (let i = k - 119; i <= k; i++) v120 += tv(i); for (let i = k - 59; i <= k; i++) { v60 += tv(i); vol60 += b.v[i]; hi6 = Math.max(hi6, b.h[i]); if (b.l[i] > 0) lo6 = Math.min(lo6, b.l[i]); }
    const sma200 = mean(b.c.slice(k - 199, k + 1));
    const ys = b.c.slice(k - 59, k + 1).map(Math.log), xm = 29.5, ym = mean(ys); let sxy = 0, sxx = 0, syy = 0; ys.forEach((y, i) => { sxy += (i - xm) * (y - ym); sxx += (i - xm) ** 2; syy += (y - ym) ** 2; });
    const r2 = syy ? (sxy * sxy) / (sxx * syy) : 0;
    rows.push({ t, set, date: day, fwd, f: [
      hi > lo ? (b.c[k] - lo) / (hi - lo) : null, b.c[k] / hi, b.c[k - 20] / b.c[k - 250] - 1, b.c[k - 20] / b.c[k - 120] - 1,
      -(b.c[k] / b.c[k - 5] - 1), -(b.c[k] / b.c[k - 20] - 1), -sd(rets), -mx, b.c[k] / sma200, vol60 ? (OBV[k] - OBV[k - 60]) / vol60 : null,
      v120 ? v20 / (v120 / 120) : null, -Math.log(v60 / 60), clv / 20, up / 20, lo6 > 0 ? -(hi6 / lo6 - 1) : null, r2 * Math.sign(sxy)] });
  }
}
const dm = new Map(); for (const r of rows) { const a = dm.get(r.date) || [0, 0]; a[0] += r.fwd; a[1]++; dm.set(r.date, a); }
for (const r of rows) r.ex = r.fwd - dm.get(r.date)[0] / dm.get(r.date)[1];
const parts = { disc: r => r.set === '300' && r.date < DISC_END, c1: r => r.set === 'other', c2: r => r.set === '300' && r.date >= DISC_END };
const mid = p => { const d = [...new Set(rows.filter(p).map(r => r.date))].sort(); return d[d.length >> 1]; };
const out = { asOf: iso(new Date()), rows: rows.length, grid: grid.length, from: grid[0], to: grid.at(-1), traits: {} };
console.log(`${rows.length} stock-dates (${rows.filter(parts.disc).length} discovery, ${rows.filter(parts.c1).length} on the 613, ${rows.filter(parts.c2).length} 300-since-2022), ${grid.length} dates ${grid[0]} .. ${grid.at(-1)}`);
TR.forEach((name, i) => {
  const run = p => terciles(rows.filter(p).map(r => ({ date: r.date, tk: r.t, sig: r.f[i], fwd: r.ex })).filter(x => x.sig != null && isFinite(x.sig)), { split: mid(p), runs: 1000 });
  const d = run(parts.disc), c1 = run(parts.c1), c2 = run(parts.c2);
  const pass = d.p < 0.05 / 16 && d.t >= 2 && d.first > 0 && d.second > 0 && c1.t >= 2 && c2.spread > 0;
  out.traits[name] = { disc: d, c1, c2, pass };
  console.log(`${name.padEnd(15)} disc ${fmt(d.spread)} t ${d.t.toFixed(2).padStart(5)} p ${d.p.toFixed(3)} halves ${fmt(d.first)} / ${fmt(d.second)} | 613 ${fmt(c1.spread)} t ${c1.t.toFixed(2).padStart(5)} | 300 since 2022 ${fmt(c2.spread)} t ${c2.t.toFixed(2).padStart(5)} -> ${pass ? 'PASS' : 'fail'}`);
});
fs.writeFileSync(path.join(ROOT, 'data', 'scan-study.json'), JSON.stringify(out, null, 1));

// Beyond "oversold": do SIDEWAYS stocks, stocks at the BOTTOM of their range, or quiet accumulation predict returns?
//
// PRE-REGISTERED 2026-10-12, committed before the first run.
// Why: the user asks why ACT only looks at crashed stocks (none in Jul-Aug 2026), and whether sideways stocks or stocks
// "in the bottom" are better entries, with NeoBDM / Bandarmetrics / catalysts on top. The base -> breakout study
// (experiment-base.mjs, 2026-10-10) already failed; this tests the entry BEFORE a breakout.
//
// Data: daily bars, ~10 years, for the 300 screener stocks AND the 613 other IDX stocks never used to build any rule.
// A stock counts on a date only if it was liquid THEN (Rp 5 B a day over 20 sessions, traded the last 3 sessions).
// Grid: every 20th IHSG session (non-overlapping), outcome = return from the next open over 20 sessions, minus the
// mean of all liquid stocks on that date (excess). Features use bars up to the signal day only.
//
// Features (fixed now):
//   pos2y   where the close sits in the 2-year high-low range (0 = at the low, 1 = at the high)
//   range60 the 60-session high / low - 1 (small = sideways)
//   fresh   a new 2-year low was made in the last 20 sessions (still falling)
//   obv60   on-balance volume over 60 sessions / total volume (-1 .. 1): volume on up days vs down days
//   ret60   60-session price change
//
// Hypotheses (6 tests, so the bar is p < 0.05/6 = 0.0083):
//   H1 factor  lower pos2y -> higher excess (tercile spread, within-date permutation; study-lib terciles)
//   H2 factor  lower range60 (tighter) -> higher excess
//   H3 event   BOTTOM BASE: pos2y <= 0.25 and range60 <= 0.25 and NOT fresh
//   H4 factor  higher obv60 with |ret60| <= 10% (price flat, volume buying) -> higher excess
//   H5 event   BOTTOM BASE (H3) and obv60 > 0 (accumulation in the base)
//   H6 event   BOTTOM SPRING: H3 and today's volume >= 2x its 20-session average and close up >= 3% (the base wakes)
// Events: mean excess per date first (one market day counts once), then mean and t over dates.
//
// A hypothesis PASSES only if ALL hold:
//   a. DISCOVERY (the 300 stocks, 2016-01-01 .. 2021-12-31): p < 0.0083 (factors: permutation p; events: one-sided
//      t-test over dates, t >= 2.64), t >= 2, same sign in both halves (split 2019-01-01);
//   b. CONFIRM 1 (the 613 never-used stocks, all years 2016-2026): same sign, t >= 2;
//   c. CONFIRM 2 (the 300 stocks, 2022-01-01 onward): same sign (mean > 0 for events / spread > 0 for factors);
//   d. events only: mean excess > 0.4% (the round-trip fee) in discovery and both confirms, and >= 100 events.
// Pass -> a new ACT setup on the site, paper first, with its own forward test. Fail -> reported, never a badge.
// Reported only (cannot pass: data starts 2022, 300 stocks only): H5 events split by Bandarmetrics LPM rising
// (40-session change > 0) on the signal day. Catalysts: no history before 2026-08, so only a forward test is possible.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, CACHE } from './lib.mjs';
import { mean, sd, terciles, fmt } from './study-lib.mjs';

const IN300 = universe(loadEngine()).map(u => u.ticker), S300 = new Set(IN300);
const OTHER = JSON.parse(fs.readFileSync(path.join(CACHE, 'rank-all.json'), 'utf8')).map(r => r.c).filter(c => !S300.has(c));
const H = 20, STEP = 20, FEE = 0.004, DISC_END = '2022-01-01', DISC_SPLIT = '2019-01-01', START = '2016-01-01';
const iso = d => d.toISOString().slice(0, 10);
const px = await loadPrices(IN300.concat(OTHER).map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const BM = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bm-history.json'), 'utf8')); } catch { return {}; } })();
const idx = px['^JKSE'], grid = [];
for (let i = 520; i + H + 1 < idx.c.length; i += STEP) if (iso(idx.d[i]) >= START) grid.push(iso(idx.d[i]));
const GRID = new Set(grid);

const rows = [];
for (const t of IN300.concat(OTHER)) {
  const b = px[t + '.JK']; if (!b || b.c.length < 560) continue;
  const set = S300.has(t) ? '300' : 'other';
  let obv = 0; const OBV = b.c.map((c, k) => (k ? (obv += c > b.c[k - 1] ? b.v[k] : c < b.c[k - 1] ? -b.v[k] : 0) : 0));
  for (let k = 500; k + H + 1 < b.c.length; k++) {
    const day = iso(b.d[k]); if (!GRID.has(day)) continue;
    let val = 0; for (let i = k - 19; i <= k; i++) val += b.c[i] * b.v[i];
    if (val / 20 < 5e9 || !b.v[k] || !b.v[k - 1] || !b.v[k - 2] || !(b.o[k + 1] > 0)) continue;
    let hi2 = -Infinity, lo2 = Infinity; for (let i = k - 499; i <= k; i++) { if (b.h[i] > hi2) hi2 = b.h[i]; if (b.l[i] > 0 && b.l[i] < lo2) lo2 = b.l[i]; }
    let hi6 = -Infinity, lo6 = Infinity, v60 = 0; for (let i = k - 59; i <= k; i++) { hi6 = Math.max(hi6, b.h[i]); if (b.l[i] > 0) lo6 = Math.min(lo6, b.l[i]); v60 += b.v[i]; }
    let lo20 = Infinity; for (let i = k - 19; i <= k; i++) if (b.l[i] > 0) lo20 = Math.min(lo20, b.l[i]);
    const v20 = mean(b.v.slice(k - 20, k));
    const fwd = b.o[k + H + 1] / b.o[k + 1] - 1;
    if (!isFinite(fwd) || Math.abs(fwd) > 3) continue;
    rows.push({ t, set, date: day, fwd, pos2y: hi2 > lo2 ? (b.c[k] - lo2) / (hi2 - lo2) : null, range60: lo6 > 0 ? hi6 / lo6 - 1 : null,
      fresh: lo20 <= lo2 * 1.0001, obv60: v60 ? (OBV[k] - OBV[k - 60]) / v60 : null, ret60: b.c[k] / b.c[k - 60] - 1,
      spike: v20 > 0 && b.v[k] >= 2 * v20 && b.c[k] / b.c[k - 1] - 1 >= 0.03 });
  }
}
// excess vs the same-date mean of all liquid stocks (both sets)
const dm = new Map(); for (const r of rows) { const a = dm.get(r.date) || [0, 0]; a[0] += r.fwd; a[1]++; dm.set(r.date, a); }
for (const r of rows) r.ex = r.fwd - dm.get(r.date)[0] / dm.get(r.date)[1];

const DISC = r => r.set === '300' && r.date < DISC_END, C1 = r => r.set === 'other', C2 = r => r.set === '300' && r.date >= DISC_END;
const base = r => r.pos2y != null && r.range60 != null && r.pos2y <= 0.25 && r.range60 <= 0.25 && !r.fresh;
const EV = { H3: base, H5: r => base(r) && r.obv60 > 0, H6: r => base(r) && r.spike };
const FAC = { H1: r => (r.pos2y == null ? null : -r.pos2y), H2: r => (r.range60 == null ? null : -r.range60), H4: r => (r.obv60 == null || Math.abs(r.ret60) > 0.1 ? null : r.obv60) };

function event(sel, part, split) {
  const by = new Map(); for (const r of rows) if (part(r) && sel(r)) { const a = by.get(r.date) || []; a.push(r.ex); by.set(r.date, a); }
  const d = [...by.entries()].sort().map(([date, a]) => ({ date, v: mean(a), n: a.length })), v = d.map(x => x.v);
  const m = mean(v), t = v.length > 2 ? m / (sd(v) / Math.sqrt(v.length)) : 0, h = a => mean(d.filter(x => (a ? x.date < split : x.date >= split)).map(x => x.v));
  return { events: d.reduce((s, x) => s + x.n, 0), dates: d.length, mean: m, t, first: h(true), second: h(false), win: mean(rows.filter(r => part(r) && sel(r)).map(r => (r.fwd > FEE ? 1 : 0))) };
}
const factor = (f, part, split) => terciles(rows.filter(part).map(r => ({ date: r.date, tk: r.t, sig: f(r), fwd: r.ex })).filter(x => x.sig != null), { split, runs: 1000 });

const out = { asOf: iso(new Date()), stocks: { s300: IN300.length, other: OTHER.length }, rows: rows.length, grid: grid.length, from: grid[0], to: grid.at(-1), tests: {} };
console.log(`${rows.length} stock-dates, ${grid.length} dates ${grid[0]} .. ${grid.at(-1)}`);
for (const [k, f] of Object.entries(FAC)) {
  const d = factor(f, DISC, DISC_SPLIT), c1 = factor(f, C1, '2021-01-01'), c2 = factor(f, C2, '2024-06-01');
  const pass = d.p < 0.0083 && d.t >= 2 && d.first > 0 && d.second > 0 && c1.t >= 2 && c2.spread > 0;
  out.tests[k] = { type: 'factor', disc: d, c1, c2, pass };
  console.log(`${k} factor  disc ${fmt(d.spread)} t ${d.t.toFixed(2)} p ${d.p.toFixed(3)} halves ${fmt(d.first)} / ${fmt(d.second)} | 613 ${fmt(c1.spread)} t ${c1.t.toFixed(2)} | 300 since 2022 ${fmt(c2.spread)} t ${c2.t.toFixed(2)} -> ${pass ? 'PASS' : 'fail'}`);
}
for (const [k, f] of Object.entries(EV)) {
  const d = event(f, DISC, DISC_SPLIT), c1 = event(f, C1, '2021-01-01'), c2 = event(f, C2, '2024-06-01');
  const pass = d.t >= 2.64 && d.first > 0 && d.second > 0 && c1.t >= 2 && c2.mean > 0 && d.mean > FEE && c1.mean > FEE && c2.mean > FEE && d.events >= 100;
  out.tests[k] = { type: 'event', disc: d, c1, c2, pass };
  console.log(`${k} event   disc n ${d.events} ${fmt(d.mean)} t ${d.t.toFixed(2)} halves ${fmt(d.first)} / ${fmt(d.second)} win ${fmt(d.win, 0)} | 613 n ${c1.events} ${fmt(c1.mean)} t ${c1.t.toFixed(2)} | 300 since 2022 n ${c2.events} ${fmt(c2.mean)} t ${c2.t.toFixed(2)} -> ${pass ? 'PASS' : 'fail'}`);
}
// reported only: H5 events since 2022 split by Bandarmetrics LPM rising on the signal day
const lpmUp = r => { const B = BM[r.t]; if (!B) return null; let q = -1; for (let i = B.d.length - 1; i >= 0; i--) if (B.d[i] <= r.date) { q = i; break; } return q >= 40 && B.l[q] != null && B.l[q - 40] != null ? B.l[q] > B.l[q - 40] : null; };
const h5 = rows.filter(r => r.set === '300' && r.date >= '2022-03-01' && EV.H5(r)).map(r => ({ ...r, lpm: lpmUp(r) })).filter(r => r.lpm != null);
const g = v => { const a = h5.filter(r => r.lpm === v).map(r => r.ex); return { n: a.length, mean: mean(a) }; };
out.reported = { h5LpmUp: g(true), h5LpmDown: g(false) };
console.log(`reported: H5 since 2022 with LPM rising n ${out.reported.h5LpmUp.n} ${fmt(out.reported.h5LpmUp.mean)}, LPM falling n ${out.reported.h5LpmDown.n} ${fmt(out.reported.h5LpmDown.mean)}`);
// How often each event fires per month (the "why so few calls in Jul-Aug" question)
out.perMonth = {}; for (const [k, f] of Object.entries(EV)) { const m = {}; rows.filter(r => r.date >= '2026-01-01' && f(r)).forEach(r => (m[r.date.slice(0, 7)] = (m[r.date.slice(0, 7)] || 0) + 1)); out.perMonth[k] = m; }
console.log('2026 events per grid month:', JSON.stringify(out.perMonth));
fs.writeFileSync(path.join(ROOT, 'data', 'bottoms-study.json'), JSON.stringify(out, null, 1));

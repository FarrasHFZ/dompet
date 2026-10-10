// Volume peaks: what triggers them, who is behind them, and what they say about the next weeks.
//
// PRE-REGISTERED 2026-10-10, committed before the first run.
// SPIKE: volume >= 4x the median of the previous 60 sessions, that day's traded value >= Rp 5 B, 20-session average
//   value >= Rp 2 B; one per stock per 10 sessions. All 300 stocks, 2017-11 .. 2026-09 (price only), NeoBDM 2024-11 on.
// TYPE, from the spike-day candle (clv = close location in the day's range, 0 = low, 1 = high):
//   UP      day return >= +4% and clv >= 0.6            (buying thrust)
//   DOWN    day return <= -4% and clv <= 0.4            (capitulation selling)
//   ABSORB  low <= prior close x 0.96, clv >= 0.6, day return > -4%   (selling absorbed, buyers took it back)
//   CHURN   |day return| < 2%                           (huge volume, no move: hand-over)
//   OTHER   the rest
// OUTCOME: excess return from the next open over 10 sessions (primary; 5 and 20 reported) minus the same-date average of
//   all stocks meeting the same liquidity bar. Statistics by date (events on a date averaged first), t over dates.
// HYPOTHESES (6 looks: each needs one-sided p < 0.05/6, i.e. t >= 2.4, plus the same sign in both halves AND in both
//   stock sets, the tested 100 and the new 200):
//   V1 UP continues (excess > 0)          V2 DOWN reverses (excess > 0)          V3 ABSORB rises (excess > 0)
//   V4 CHURN falls (excess < 0)
//   V5 spikes where NeoBDM bandar was a net BUYER that day beat spikes where it was a net SELLER (Welch t)
//   V6 the same for the foreign group
// Descriptive (not tests): how often an IDX filing lands within a day of a spike vs on ordinary days (2023-07 on), the
//   filing titles behind spikes, and which group's net flow dominated the spike day, by type.
// What passing changes: a passing type becomes a signal on the site (V1-V3 long setups, V4 a warning); V5/V6 a
//   confirmation. Everything else is shown as context on the chart (spike markers with type and who drove them).
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, expansionTickers } from './lib.mjs';
import { mean, sd } from './study-lib.mjs';

const NEW = expansionTickers(), U = universe(loadEngine()).map(u => u.ticker), iso = d => d.toISOString().slice(0, 10);
const px = await loadPrices(U.map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const NB = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-history.json'), 'utf8'));
let ANN = {}; try { ANN = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'idx-announcements.json'), 'utf8')); } catch { /* none */ }
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const ok = b => b && b.c.length > 300;
const val20 = (b, k) => b.c.slice(k - 19, k + 1).reduce((s, c, j) => s + c * b.v[k - 19 + j], 0) / 20;
const fwd = (b, k, H) => (k + H + 1 < b.c.length && b.o[k + 1] > 0 && b.o[k + H + 1] > 0 ? b.o[k + H + 1] / b.o[k + 1] - 1 : null);

// same-date universe means (same liquidity bar)
const um = { 5: new Map(), 10: new Map(), 20: new Map() };
for (const t of U) { const b = px[t + '.JK']; if (!ok(b)) continue; for (let k = 260; k < b.c.length - 6; k++) { if (val20(b, k) < 2e9) continue; const d = iso(b.d[k]); for (const H of [5, 10, 20]) { const f = fwd(b, k, H); if (f == null) continue; const m = um[H].get(d) || [0, 0]; m[0] += f; m[1]++; um[H].set(d, m); } } }
const ex = (b, k, d, H) => { const f = fwd(b, k, H), m = um[H].get(d); return f == null || !m || m[1] < 20 ? null : f - m[0] / m[1]; };
const atDay = (arr, day) => { let lo = 0, hi = arr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= day) { r = m; lo = m + 1; } else hi = m - 1; } return r; };

const ev = [];
for (const t of U) {
  const b = px[t + '.JK']; if (!ok(b)) continue;
  const G = NB[t] && NB[t].g, ann = (ANN[t] || []).map(a => [a[0].slice(0, 10), a[1]]);
  let busy = -1;
  for (let k = 260; k < b.c.length - 6; k++) {
    if (k <= busy) continue;
    const mv = median(b.v.slice(k - 60, k)); if (!(mv > 0) || b.v[k] < 4 * mv) continue;
    if (b.c[k] * b.v[k] < 5e9 || val20(b, k - 1) < 2e9) continue;
    const d = iso(b.d[k]), x10 = ex(b, k, d, 10); if (x10 == null) continue;
    busy = k + 10;
    const r = b.c[k] / b.c[k - 1] - 1, clv = b.h[k] > b.l[k] ? (b.c[k] - b.l[k]) / (b.h[k] - b.l[k]) : 0.5;
    const type = r >= 0.04 && clv >= 0.6 ? 'UP' : r <= -0.04 && clv <= 0.4 ? 'DOWN' : b.l[k] <= b.c[k - 1] * 0.96 && clv >= 0.6 && r > -0.04 ? 'ABSORB' : Math.abs(r) < 0.02 ? 'CHURN' : 'OTHER';
    const e = { tk: t, set: NEW.has(t) ? 'new200' : 'tested100', day: d, type, r, clv, volx: b.v[k] / mv, x5: ex(b, k, d, 5), x10, x20: ex(b, k, d, 20) };
    if (G) { const q = G.d.indexOf(d); if (q > 0) { for (const [g, nm] of [['m', 'bandar'], ['f', 'foreign'], ['z', 'retail'], ['s', 'sultan'], ['i', 'inst']]) if (G[g] && G[g][q] != null && G[g][q - 1] != null) e[nm] = (G[g][q] - G[g][q - 1]) * 1e9 / (b.c[k] * b.v[k]); } }
    if (ann.length) { e.filing = ann.filter(a => a[0] >= iso(b.d[k - 1]) && a[0] <= (b.d[k + 1] ? iso(b.d[k + 1]) : d)).map(a => a[1]); e.annCovered = d >= '2023-07-01'; }
    ev.push(e);
  }
}
const byDate = (rs, key) => { const m = new Map(); rs.forEach(r => { if (r[key] == null) return; if (!m.has(r.day)) m.set(r.day, []); m.get(r.day).push(r[key]); }); const xs = [...m.values()].map(mean); const mm = mean(xs); return { n: rs.filter(r => r[key] != null).length, ex: mm, t: xs.length > 1 ? mm / (sd(xs) / Math.sqrt(xs.length) || 1) : 0 }; };
const welch = (a, b) => { const g = mean(a) - mean(b), se = Math.sqrt(sd(a) ** 2 / (a.length || 1) + sd(b) ** 2 / (b.length || 1)); return { gap: g, t: se ? g / se : 0, nA: a.length, nB: b.length }; };
console.log(`${ev.length} volume spikes (300 stocks, ${ev.map(e => e.day).sort()[0]} .. ${ev.map(e => e.day).sort().at(-1)})`);
const types = ['UP', 'DOWN', 'ABSORB', 'CHURN', 'OTHER'];
console.log('\ntype      n     share   avg day   5-session  10-session (t)      20-session   1st half / 2nd half   tested100 / new200');
const res = { asOf: new Date().toISOString().slice(0, 10), spikes: ev.length, types: {}, tests: {} };
for (const ty of types) {
  const rs = ev.filter(e => e.type === ty), a = byDate(rs, 'x10');
  const h1 = byDate(rs.filter(e => e.day < '2022-01-01'), 'x10'), h2 = byDate(rs.filter(e => e.day >= '2022-01-01'), 'x10');
  const s1 = byDate(rs.filter(e => e.set === 'tested100'), 'x10'), s2 = byDate(rs.filter(e => e.set === 'new200'), 'x10');
  res.types[ty] = { n: rs.length, x5: byDate(rs, 'x5').ex, x10: a.ex, t10: a.t, x20: byDate(rs, 'x20').ex, h1: h1.ex, h2: h2.ex, s1: s1.ex, s2: s2.ex, day: mean(rs.map(e => e.r)) };
  console.log(`${ty.padEnd(8)} ${String(rs.length).padStart(5)}  ${pct(rs.length / ev.length, 0).padStart(5)}   ${pct(mean(rs.map(e => e.r)), 1).padStart(6)}   ${pct(res.types[ty].x5).padStart(7)}   ${pct(a.ex).padStart(7)} (${a.t.toFixed(2).padStart(5)})   ${pct(res.types[ty].x20).padStart(7)}     ${pct(h1.ex)} / ${pct(h2.ex)}      ${pct(s1.ex)} / ${pct(s2.ex)}`);
}
const T = res.types, chk = (ty, dir) => { const v = T[ty]; return dir * v.t10 >= 2.4 && dir * v.h1 > 0 && dir * v.h2 > 0 && dir * v.s1 > 0 && dir * v.s2 > 0; };
res.tests.V1 = chk('UP', 1); res.tests.V2 = chk('DOWN', 1); res.tests.V3 = chk('ABSORB', 1); res.tests.V4 = chk('CHURN', -1);
// V5 / V6: flow on the spike day
const nbEv = ev.filter(e => e.bandar != null);
console.log(`\n--- who was behind the spike (NeoBDM, ${nbEv.length} spikes since ${nbEv.map(e => e.day).sort()[0]}) ---`);
for (const [g, key] of [['bandar', 'V5'], ['foreign', 'V6']]) {
  const rs = ev.filter(e => e[g] != null), buy = rs.filter(e => e[g] > 0), sell = rs.filter(e => e[g] <= 0), w = welch(buy.map(e => e.x10), sell.map(e => e.x10));
  const mid = rs.map(e => e.day).sort()[rs.length >> 1];
  const half = f => { const x = rs.filter(f); return mean(x.filter(e => e[g] > 0).map(e => e.x10)) - mean(x.filter(e => e[g] <= 0).map(e => e.x10)); };
  const set = s => { const x = rs.filter(e => e.set === s); return mean(x.filter(e => e[g] > 0).map(e => e.x10)) - mean(x.filter(e => e[g] <= 0).map(e => e.x10)); };
  const h1 = half(e => e.day < mid), h2 = half(e => e.day >= mid), s1 = set('tested100'), s2 = set('new200');
  res.tests[key] = w.t >= 2.4 && h1 > 0 && h2 > 0 && s1 > 0 && s2 > 0;
  res[g] = { buy: mean(buy.map(e => e.x10)), sell: mean(sell.map(e => e.x10)), nBuy: buy.length, nSell: sell.length, t: w.t, h1, h2, s1, s2 };
  console.log(`${g.padEnd(8)} net BUYER on the spike day ${pct(mean(buy.map(e => e.x10)))} (n ${buy.length}) vs net SELLER ${pct(mean(sell.map(e => e.x10)))} (n ${sell.length})  gap t ${w.t.toFixed(2)}  halves ${pct(h1)} / ${pct(h2)}  sets ${pct(s1)} / ${pct(s2)}`);
}
// cross-tab reported: type x bandar side
console.log('\n--- reported: type x bandar side (10-session excess, n) ---');
res.cross = {};
for (const ty of types) { const rs = nbEv.filter(e => e.type === ty), b = rs.filter(e => e.bandar > 0), s = rs.filter(e => e.bandar <= 0); res.cross[ty] = { buy: mean(b.map(e => e.x10)), nB: b.length, sell: mean(s.map(e => e.x10)), nS: s.length }; console.log(`${ty.padEnd(8)} bandar buying ${pct(res.cross[ty].buy)} (${b.length})   bandar selling ${pct(res.cross[ty].sell)} (${s.length})`); }
// dominant group on spike day
console.log('\n--- reported: which group dominated the spike day (largest |net|), share of spikes by type ---');
for (const ty of types) { const rs = nbEv.filter(e => e.type === ty && e.foreign != null && e.retail != null); const cnt = {}; rs.forEach(e => { const g = ['bandar', 'foreign', 'retail', 'sultan', 'inst'].filter(x => e[x] != null).sort((a, c) => Math.abs(e[c]) - Math.abs(e[a]))[0]; const side = e[g] > 0 ? '+' : '-'; cnt[g + side] = (cnt[g + side] || 0) + 1; }); console.log(`${ty.padEnd(8)} ${Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${pct(v / rs.length, 0)}`).join(', ')}`); }
// triggers
const annEv = ev.filter(e => e.annCovered);
if (annEv.length) {
  const withF = annEv.filter(e => e.filing && e.filing.length);
  // baseline: share of ordinary liquid stock-days (sampled) with a filing in the same window
  let base = 0, bn = 0; for (const t of U) { const b = px[t + '.JK']; if (!ok(b) || !ANN[t]) continue; const ad = new Set(ANN[t].map(a => a[0].slice(0, 10))); for (let k = b.c.length - 700; k < b.c.length - 1; k += 7) { if (k < 1 || iso(b.d[k]) < '2023-07-01') continue; bn++; if ([k - 1, k, k + 1].some(j => ad.has(iso(b.d[j])))) base++; } }
  console.log(`\n--- triggers: a filing within a day of the spike in ${pct(withF.length / annEv.length, 0)} of spikes vs ${pct(base / (bn || 1), 0)} of ordinary days ---`);
  const words = {}; withF.forEach(e => e.filing.forEach(f => { const k = f.replace(/\s*\(.*?\)/g, '').slice(0, 48); words[k] = (words[k] || 0) + 1; }));
  Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
  res.triggers = { spikesWithFiling: withF.length / annEv.length, ordinaryDays: base / (bn || 1), top: Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 12) };
  const fx = byDate(withF, 'x10'), nf = byDate(annEv.filter(e => !e.filing || !e.filing.length), 'x10');
  res.triggers.withFiling = fx.ex; res.triggers.withoutFiling = nf.ex;
  console.log(`  10-session excess: spikes WITH a filing ${pct(fx.ex)} (n ${fx.n}), WITHOUT ${pct(nf.ex)} (n ${nf.n})`);
}
console.log(`\nVERDICT  V1 UP ${res.tests.V1 ? 'PASS' : 'fail'} · V2 DOWN ${res.tests.V2 ? 'PASS' : 'fail'} · V3 ABSORB ${res.tests.V3 ? 'PASS' : 'fail'} · V4 CHURN ${res.tests.V4 ? 'PASS' : 'fail'} · V5 bandar ${res.tests.V5 ? 'PASS' : 'fail'} · V6 foreign ${res.tests.V6 ? 'PASS' : 'fail'}`);
fs.writeFileSync(path.join(ROOT, 'data', 'volume-study.json'), JSON.stringify(res, null, 1));

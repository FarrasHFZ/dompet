// V6 (foreign net BUYER on a volume-spike day) passed in experiment-volume.mjs: +2.27% vs -0.42% excess over 10 sessions,
// t 2.96, both halves and both stock sets positive. Before it becomes a signal: replication on independent data + stress.
//
// PRE-REGISTERED 2026-10-10, committed before the first run.
// REPLICATION (decisive): IDX's own daily foreign buy and sell volume (data/idx-foreign-flow.json, the tested 100,
//   2022-09 .. 2024-10-10: a different data source AND a period no volume study has used). Same spike definition, same
//   outcome. Foreign net on the spike day = foreign buy - foreign sell (shares). PASSES if net-buy spikes beat net-sell
//   spikes by > 0 with Welch t >= 2 and both halves (split at the middle date) positive.
// STRESS on the NeoBDM sample (2024-10 on, 300 stocks), all must hold for the signal to be called robust:
//   S1 net of costs: average absolute 10-session return of foreign-buy spikes after 0.4% fees and 0.5% slippage > 0
//   S2 horizons: the buy-minus-sell gap > 0 at 5 AND 20 sessions
//   S3 by date: gap > 0 on dates that have both kinds of spikes (t reported)
//   S4 permutation: foreign side shuffled across spikes within each calendar month, 2000 runs: p < 0.05
//   S5 robustness: gap > 0 without the best 5% of buy-spike outcomes
//   S6 regime: foreign-buy spikes positive excess with the IHSG above AND below its 200-day average
//   S7 dose: spikes with foreign net >= 5% of the day's value beat those with 0..5% (reported; supports the mechanism)
// If REPLICATION and S1-S6 pass: a new ACT setup "ACT · foreign-backed volume spike" (entry next open, hold 10 sessions)
// with its own forward record. If the replication fails: shown as context only.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, expansionTickers } from './lib.mjs';
import { mean, sd, rnd } from './study-lib.mjs';

const NEW = expansionTickers(), U = universe(loadEngine()).map(u => u.ticker), iso = d => d.toISOString().slice(0, 10);
const px = await loadPrices(U.map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const NB = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-history.json'), 'utf8'));
const FF = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'idx-foreign-flow.json'), 'utf8'));
const idx = px['^JKSE'], iAt = new Map(idx.d.map((d, i) => [iso(d), i]));
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const val20 = (b, k) => b.c.slice(k - 19, k + 1).reduce((s, c, j) => s + c * b.v[k - 19 + j], 0) / 20;
const fwd = (b, k, H) => (k + H + 1 < b.c.length && b.o[k + 1] > 0 && b.o[k + H + 1] > 0 ? b.o[k + H + 1] / b.o[k + 1] - 1 : null);
const um = { 5: new Map(), 10: new Map(), 20: new Map() };
for (const t of U) { const b = px[t + '.JK']; if (!b) continue; for (let k = 260; k < b.c.length - 6; k++) { if (val20(b, k) < 2e9) continue; const d = iso(b.d[k]); for (const H of [5, 10, 20]) { const f = fwd(b, k, H); if (f == null) continue; const m = um[H].get(d) || [0, 0]; m[0] += f; m[1]++; um[H].set(d, m); } } }
const ex = (b, k, d, H) => { const f = fwd(b, k, H), m = um[H].get(d); return f == null || !m || m[1] < 20 ? null : f - m[0] / m[1]; };
const welch = (a, b) => { const g = mean(a) - mean(b), se = Math.sqrt(sd(a) ** 2 / (a.length || 1) + sd(b) ** 2 / (b.length || 1)); return { gap: g, t: se ? g / se : 0 }; };

function spikes(tickers, from, to, foreignOf) {
  const ev = [];
  for (const t of tickers) {
    const b = px[t + '.JK']; if (!b || b.c.length < 300) continue; let busy = -1;
    for (let k = 260; k < b.c.length - 6; k++) {
      if (k <= busy) continue; const d = iso(b.d[k]); if (d < from || d > to) continue;
      const mv = median(b.v.slice(k - 60, k)); if (!(mv > 0) || b.v[k] < 4 * mv || b.c[k] * b.v[k] < 5e9 || val20(b, k - 1) < 2e9) continue;
      const x10 = ex(b, k, d, 10); if (x10 == null) continue;
      busy = k + 10;
      const fn = foreignOf(t, d, b, k); if (fn == null) continue;
      const ii = iAt.get(d), up = ii >= 199 && idx.c[ii] > idx.c.slice(ii - 199, ii + 1).reduce((s, x) => s + x, 0) / 200;
      ev.push({ tk: t, day: d, ym: d.slice(0, 7), fn, x5: ex(b, k, d, 5), x10, x20: ex(b, k, d, 20), raw: fwd(b, k, 10), up });
    }
  }
  return ev;
}
const gap = (rs, key = 'x10') => welch(rs.filter(e => e.fn > 0 && e[key] != null).map(e => e[key]), rs.filter(e => e.fn <= 0 && e[key] != null).map(e => e[key]));
const res = { asOf: new Date().toISOString().slice(0, 10) };

// ---- replication on IDX data ----
const ffDays = new Set(Object.keys(FF));
const idxForeign = (t, d, b, k) => { const key = d.replace(/-/g, ''); if (!ffDays.has(key)) return null; const r = FF[key][t]; return r && r[1] ? (r[4] - r[5]) / r[1] : null; };
const R = spikes(U.filter(t => !NEW.has(t)), '2022-09-01', '2024-10-10', idxForeign);
const rg = gap(R), rmid = R.map(e => e.day).sort()[R.length >> 1], rh1 = gap(R.filter(e => e.day < rmid)), rh2 = gap(R.filter(e => e.day >= rmid));
const repPass = rg.gap > 0 && rg.t >= 2 && rh1.gap > 0 && rh2.gap > 0;
res.replication = { n: R.length, buy: mean(R.filter(e => e.fn > 0).map(e => e.x10)), sell: mean(R.filter(e => e.fn <= 0).map(e => e.x10)), nBuy: R.filter(e => e.fn > 0).length, gap: rg.gap, t: rg.t, h1: rh1.gap, h2: rh2.gap, pass: repPass };
console.log(`REPLICATION (IDX foreign data, tested 100, 2022-09..2024-10): ${R.length} spikes; foreign net buyer ${pct(res.replication.buy)} (n ${res.replication.nBuy}) vs seller ${pct(res.replication.sell)}; gap ${pct(rg.gap)} t ${rg.t.toFixed(2)}; halves ${pct(rh1.gap)} / ${pct(rh2.gap)} -> ${repPass ? 'REPLICATES' : 'does not replicate'}`);

// ---- stress on the NeoBDM sample ----
const nbForeign = (t, d, b, k) => { const G = NB[t] && NB[t].g; if (!G || !G.f) return null; const q = G.d.indexOf(d); return q > 0 && G.f[q] != null && G.f[q - 1] != null ? (G.f[q] - G.f[q - 1]) * 1e9 / (b.c[k] * b.v[k]) : null; };
const N = spikes(U, '2024-10-11', '2026-12-31', nbForeign), buy = N.filter(e => e.fn > 0);
const s1 = mean(buy.map(e => (1 + e.raw) / 1.005 - 1 - 0.004));
const g5 = gap(N, 'x5'), g20 = gap(N, 'x20');
const byD = new Map(); N.forEach(e => { if (!byD.has(e.day)) byD.set(e.day, []); byD.get(e.day).push(e); });
const dg = [...byD.values()].filter(a => a.some(e => e.fn > 0) && a.some(e => e.fn <= 0)).map(a => mean(a.filter(e => e.fn > 0).map(e => e.x10)) - mean(a.filter(e => e.fn <= 0).map(e => e.x10)));
const s3 = { gap: mean(dg), t: dg.length > 1 ? mean(dg) / (sd(dg) / Math.sqrt(dg.length)) : 0, dates: dg.length };
const real = gap(N).gap; let hits = 0; const months = [...new Set(N.map(e => e.ym))];
for (let r = 0; r < 2000; r++) { const lab = new Map(); for (const m of months) { const g = N.filter(e => e.ym === m), s = g.map(e => e.fn); for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } g.forEach((e, i) => lab.set(e, s[i])); } const b2 = N.filter(e => lab.get(e) > 0).map(e => e.x10), s2 = N.filter(e => !(lab.get(e) > 0)).map(e => e.x10); if (mean(b2) - mean(s2) >= real) hits++; }
const s4 = hits / 2000;
const sb = buy.map(e => e.x10).sort((a, b) => a - b), s5 = mean(sb.slice(0, Math.floor(sb.length * 0.95))) - mean(N.filter(e => e.fn <= 0).map(e => e.x10));
const s6 = { up: mean(buy.filter(e => e.up).map(e => e.x10)), dn: mean(buy.filter(e => !e.up).map(e => e.x10)), nUp: buy.filter(e => e.up).length, nDn: buy.filter(e => !e.up).length };
const big = buy.filter(e => e.fn >= 0.05), small = buy.filter(e => e.fn < 0.05);
res.stress = { n: N.length, nBuy: buy.length, s1, g5: g5.gap, g20: g20.gap, s3, s4, s5, s6, dose: { big: mean(big.map(e => e.x10)), nBig: big.length, small: mean(small.map(e => e.x10)), nSmall: small.length } };
console.log(`\nSTRESS (NeoBDM, 300 stocks, 2024-10..): ${N.length} spikes, ${buy.length} with foreign net buying`);
console.log(`  S1 net of fees + slippage, avg 10-session return of foreign-buy spikes: ${pct(s1)}  ${s1 > 0 ? 'ok' : 'FAIL'}`);
console.log(`  S2 gap at 5 sessions ${pct(g5.gap)} (t ${g5.t.toFixed(2)}), at 20 sessions ${pct(g20.gap)} (t ${g20.t.toFixed(2)})  ${g5.gap > 0 && g20.gap > 0 ? 'ok' : 'FAIL'}`);
console.log(`  S3 by date (${s3.dates} dates with both kinds): gap ${pct(s3.gap)} t ${s3.t.toFixed(2)}  ${s3.gap > 0 ? 'ok' : 'FAIL'}`);
console.log(`  S4 permutation within month: p ${s4.toFixed(3)}  ${s4 < 0.05 ? 'ok' : 'FAIL'}`);
console.log(`  S5 gap without the best 5% of buy outcomes: ${pct(s5)}  ${s5 > 0 ? 'ok' : 'FAIL'}`);
console.log(`  S6 foreign-buy spikes, IHSG above 200d ${pct(s6.up)} (n ${s6.nUp}), below ${pct(s6.dn)} (n ${s6.nDn})  ${s6.up > 0 && s6.dn > 0 ? 'ok' : 'FAIL'}`);
console.log(`  S7 dose (reported): foreign net >= 5% of the day's value ${pct(res.stress.dose.big)} (n ${big.length}) vs 0-5% ${pct(res.stress.dose.small)} (n ${small.length})`);
const stressPass = s1 > 0 && g5.gap > 0 && g20.gap > 0 && s3.gap > 0 && s4 < 0.05 && s5 > 0 && s6.up > 0 && s6.dn > 0;
res.verdict = { replication: repPass, stress: stressPass, adopt: repPass && stressPass };
console.log(`\nVERDICT: replication ${repPass ? 'PASS' : 'FAIL'} · stress ${stressPass ? 'PASS' : 'FAIL'} -> ${res.verdict.adopt ? 'ADOPT: ACT setup "foreign-backed volume spike"' : 'context only'}`);
fs.writeFileSync(path.join(ROOT, 'data', 'volume-stress.json'), JSON.stringify(res, null, 1));

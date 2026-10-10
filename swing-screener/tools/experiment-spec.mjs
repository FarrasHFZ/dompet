// The one theme that kept coming back in experiment-crack.mjs: breakouts in CHEAP, VOLATILE stocks.
//
// PRE-REGISTERED 2026-10-10, committed before the first run.
// Origin (seen data): in experiment-crack.mjs no track beat its null search, but the same pair topped T1 discovery
// (2017-21: +2.73% excess per 10 sessions) and stayed positive in T1 validation (2022-24: +1.64%), and T3 found it again
// (Dec 2024-Jun 2025 +9.44%, Jul-Dec 2025 +12.88%, t 3.4). A theme recurring across separate periods is the hypothesis;
// it is now FROZEN with the T1 discovery cut points and tested ONCE on data never used for it.
// SPEC = breakout (close above the prior 20-session high) AND price < Rp 854 (ln price < 6.75) AND 60-session daily
//   volatility > 3.21%, liquid (Rp 5 B a day), one event per stock per 10 sessions.
// Outcome: excess 10-session return (next open -> open 10 sessions later minus the same-date average of all liquid stocks
//   in the same stock set), statistics by date.
// HOLDOUT A (time): the 300 screener stocks, signals 2026-01-01 .. 2026-09 (after every period looked at).
// HOLDOUT B (stocks): the other IDX codes with Yahoo history (909 minus the 300), all signals 2017-11 .. 2026-09; never
//   used by any study.
// PASSES only if: excess > 0 with t >= 2 in BOTH holdouts, AND stress on holdout B: (a) average absolute return net of
//   0.4% fees and 0.5% slippage > 0, (b) 20-session excess > 0, (c) excess > 0 with the IHSG above AND below its
//   200-day average, (d) excess > 0 without the best 5% of events, (e) excess > 0 in both halves (split 2022-01).
// If it passes: an ACT setup on the site ("ACT · speculative breakout") with its own forward record and a small-size
// warning (these stocks swing hard). If it fails: no breakout pattern survives, and that is reported plainly.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, CACHE } from './lib.mjs';
import { mean, sd } from './study-lib.mjs';

const iso = d => d.toISOString().slice(0, 10), LPX = 6.75, VOL = 0.0321;
const S300 = new Set(universe(loadEngine()).map(u => u.ticker));
const ALL = JSON.parse(fs.readFileSync(path.join(CACHE, 'rank-all.json'), 'utf8')).map(r => r.c);
const px = await loadPrices(ALL.concat([...S300]).filter((v, i, a) => a.indexOf(v) === i).map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const idx = px['^JKSE'], iAt = new Map(idx.d.map((d, i) => [iso(d), i]));
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const ok = b => b && b.c.length > 300 && b.c.every(c => c > 0) && b.o.every(o => o > 0);
const liquidAt = (b, k) => k >= 20 && b.c.slice(k - 19, k + 1).reduce((s, c, j) => s + c * b.v[k - 19 + j], 0) / 20 >= 5e9 && !b.v.slice(k - 2, k + 1).some(v => !v);
const fwd = (b, k, H) => (k + H + 1 < b.c.length ? b.o[k + H + 1] / b.o[k + 1] - 1 : null);

function run(tickers, from, to) {
  const um = new Map(), um20 = new Map();
  for (const t of tickers) { const b = px[t + '.JK']; if (!ok(b)) continue; for (let k = 260; k < b.c.length - 11; k++) { if (!liquidAt(b, k)) continue; const d = iso(b.d[k]); if (d < from || d > to) continue; const f = fwd(b, k, 10), g = fwd(b, k, 20); const m = um.get(d) || [0, 0]; m[0] += f; m[1]++; um.set(d, m); if (g != null) { const n = um20.get(d) || [0, 0]; n[0] += g; n[1]++; um20.set(d, n); } } }
  const ev = [];
  for (const t of tickers) {
    const b = px[t + '.JK']; if (!ok(b)) continue; let busy = -1;
    for (let k = 260; k < b.c.length - 11; k++) {
      if (k <= busy) continue; const d = iso(b.d[k]); if (d < from || d > to || !liquidAt(b, k)) continue;
      if (!(b.c[k] > Math.max(...b.h.slice(k - 20, k)))) continue;
      const m = um.get(d); if (!m || m[1] < 20) continue;
      busy = k + 10;
      const rets = []; for (let j = k - 59; j <= k; j++) rets.push(b.c[j] / b.c[j - 1] - 1);
      if (!(Math.log(b.c[k]) < LPX && sd(rets) > VOL)) continue;
      const ii = iAt.get(d), up = ii >= 199 && idx.c[ii] > idx.c.slice(ii - 199, ii + 1).reduce((s, x) => s + x, 0) / 200;
      const f = fwd(b, k, 10), g = fwd(b, k, 20), m2 = um20.get(d);
      ev.push({ tk: t, day: d, raw: f, ex: f - m[0] / m[1], ex20: g != null && m2 ? g - m2[0] / m2[1] : null, up });
    }
  }
  return ev;
}
function stat(ev) {
  const by = new Map(); ev.forEach(e => { if (!by.has(e.day)) by.set(e.day, []); by.get(e.day).push(e.ex); });
  const xs = [...by.values()].map(mean), m = mean(xs);
  return { n: ev.length, dates: xs.length, ex: m, t: xs.length > 1 ? m / (sd(xs) / Math.sqrt(xs.length)) : 0, raw: mean(ev.map(e => e.raw)), win: ev.filter(e => e.raw > 0).length / (ev.length || 1) };
}
const show = (l, s) => console.log(`${l.padEnd(44)} events ${String(s.n).padStart(5)} on ${String(s.dates).padStart(4)} dates  10-session ${pct(s.raw).padStart(7)}  excess ${pct(s.ex).padStart(7)}  t ${s.t.toFixed(2).padStart(5)}  win ${(s.win * 100).toFixed(0)}%`);

const others = ALL.filter(t => !S300.has(t));
const A = run([...S300], '2026-01-01', '2026-12-31'), B = run(others, '2017-11-01', '2026-12-31');
const sA = stat(A), sB = stat(B);
console.log(`stock holdout: ${others.filter(t => ok(px[t + '.JK'])).length} other IDX codes with clean 10y history`);
show('HOLDOUT A: 300 stocks, 2026', sA); show('HOLDOUT B: ~600 other stocks, 2017-2026', sB);
const net = mean(B.map(e => (1 + e.raw) / 1.005 - 1 - 0.004)), ex20 = mean(B.filter(e => e.ex20 != null).map(e => e.ex20));
const up = stat(B.filter(e => e.up)), dn = stat(B.filter(e => !e.up)), srt = B.map(e => e.ex).sort((a, b) => a - b), trim = mean(srt.slice(0, Math.floor(srt.length * 0.95)));
const h1 = stat(B.filter(e => e.day < '2022-01-01')), h2 = stat(B.filter(e => e.day >= '2022-01-01'));
console.log(`stress on B: net after fees+slippage ${pct(net)}, 20-session excess ${pct(ex20)}, IHSG up ${pct(up.ex)} (n ${up.n}) / down ${pct(dn.ex)} (n ${dn.n}), without best 5% ${pct(trim)}, halves ${pct(h1.ex)} / ${pct(h2.ex)}`);
const byYear = {}; B.forEach(e => { const y = e.day.slice(0, 4); (byYear[y] = byYear[y] || []).push(e); });
console.log('B by year: ' + Object.entries(byYear).sort().map(([y, a]) => `${y} ${pct(stat(a).ex, 1)} (n ${a.length})`).join(', '));
const pass = sA.ex > 0 && sA.t >= 2 && sB.ex > 0 && sB.t >= 2 && net > 0 && ex20 > 0 && up.ex > 0 && dn.ex > 0 && trim > 0 && h1.ex > 0 && h2.ex > 0;
const out = { asOf: new Date().toISOString().slice(0, 10), rule: { lpx: LPX, priceMax: Math.round(Math.exp(LPX)), vol60: VOL }, A: sA, B: sB, stress: { net, ex20, up: up.ex, dn: dn.ex, trim, h1: h1.ex, h2: h2.ex }, byYear: Object.fromEntries(Object.entries(byYear).map(([y, a]) => [y, stat(a)])), pass };
console.log(`\nVERDICT: ${pass ? 'PASSES -> ACT setup "speculative breakout"' : 'FAILS'}`);
fs.writeFileSync(path.join(ROOT, 'data', 'spec-study.json'), JSON.stringify(out, null, 1));

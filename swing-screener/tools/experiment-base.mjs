// Sideways base -> accumulation -> breakout: a second ACT setup for stocks that are NOT oversold?
//
// PRE-REGISTERED 2026-10-10, committed before the first run.
// Why: the user's scenario "sideways -> bandar accumulates -> rally" (Wyckoff accumulation). ACT only sees crashed
// stocks, so these moves are invisible to it.
// Stocks: all 300, liquid (Rp 5 B a day over 20 sessions). Definitions (fixed now, no tuning):
//   BASE      the 40 sessions before day k traded within a 25% range (max high / min low - 1 <= 0.25)
//   BREAKOUT  close on day k above that base high, with volume >= 1.5x the base's average volume
//   ACCUM, measured over the base (the 40 sessions before k), three versions:
//     A bandar   NeoBDM bandar group net buying >= 2% of the base's traded value          (data 2024-10 on)
//     B LPM      Bandarmetrics LPM 40-session change, z vs its own year > 0.5            (data 2022 on)
//     C foreign  NeoBDM foreign group net buying >= 2% of the base's traded value         (data 2024-10 on)
// Events: BASE + BREAKOUT days; one per stock until 15 sessions have passed. Outcome: return from the next open over
// 15 sessions, minus the average of all liquid stocks over the same 15 sessions (excess). Statistics by date (events
// on the same date averaged first), so one market day never counts as many.
// A version PASSES (3 versions, so p < 0.05/3) only if ALL hold:
//   a. mean excess of breakouts WITH that accumulation > 0, t >= 2 and one-sided p < 0.0167,
//   b. it beats breakouts WITHOUT that accumulation (difference > 0),
//   c. positive mean excess in both halves (split at the middle event date),
//   d. at least 40 events.
// If one passes: it becomes an ACT setup on the site ("ACT · breakout after accumulation"); bases with accumulation
// that have not broken out yet are shown as "coiling" (watch). If none passes: shown as watch only, forward-tested.
// Reported only: all breakouts from a base (no accumulation filter); a breakout trade with stop at the base low.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
import { mean, sd } from './study-lib.mjs';

const U = universe(loadEngine()).map(u => u.ticker), iso = d => d.toISOString().slice(0, 10);
const W = 40, H = 15, RANGE = 0.25, VOLX = 1.5, NB_MIN = 0.02, LPM_Z = 0.5, FEE = 0.004;
const px = await loadPrices(U.map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const BM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bm-history.json'), 'utf8'));
const NB = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-history.json'), 'utf8'));
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const atDay = (arr, day) => { let lo = 0, hi = arr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= day) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
const zch = (arr, k, w) => { if (k < w + 250) return null; const ch = []; for (let j = k - 250; j <= k; j += 5) if (arr[j] != null && arr[j - w] != null) ch.push(arr[j] - arr[j - w]); if (ch.length < 30 || arr[k] == null || arr[k - w] == null) return null; const s = sd(ch); return s ? (arr[k] - arr[k - w] - mean(ch)) / s : null; };

// same-day universe mean of the 15-session forward return (liquid stocks), for excess returns
const fwdOf = (b, k) => (k + H + 1 < b.c.length && b.o[k + 1] > 0 ? b.o[k + H + 1] / b.o[k + 1] - 1 : null);
const liquid = (b, k) => k >= 20 && mean(b.c.slice(k - 19, k + 1).map((c, j) => c * b.v[k - 19 + j])) >= 5e9 && !b.v.slice(k - 2, k + 1).some(v => !v);
const uniMean = new Map();
for (const t of U) { const b = px[t + '.JK']; if (!b) continue; for (let k = 300; k < b.c.length - H - 1; k++) { if (!liquid(b, k)) continue; const f = fwdOf(b, k); if (f == null) continue; const d = iso(b.d[k]); const m = uniMean.get(d) || [0, 0]; m[0] += f; m[1]++; uniMean.set(d, m); } }

const ev = [];
for (const t of U) {
  const b = px[t + '.JK'], B = BM[t], G = NB[t] && NB[t].g; if (!b) continue;
  let busy = -1;
  for (let k = 300; k < b.c.length - H - 1; k++) {
    if (k <= busy || !liquid(b, k)) continue;
    const hiB = Math.max(...b.h.slice(k - W, k)), loB = Math.min(...b.l.slice(k - W, k));
    if (!(loB > 0) || hiB / loB - 1 > RANGE) continue;
    if (!(b.c[k] > hiB && b.v[k] >= VOLX * mean(b.v.slice(k - W, k)))) continue;
    const day = iso(b.d[k]), f = fwdOf(b, k), um = uniMean.get(day); if (f == null || !um || um[1] < 20) continue;
    const prevDay = iso(b.d[k - 1]), startDay = iso(b.d[k - W]), valW = b.c.slice(k - W, k).reduce((s, c, j) => s + c * b.v[k - W + j], 0);
    let bandar = null, foreign = null, lpm = null;
    if (G && G.d[0] <= startDay) { const q1 = atDay(G.d, prevDay), q0 = atDay(G.d, startDay);
      if (q0 >= 0 && q1 > q0) { if (G.m && G.m[q1] != null && G.m[q0] != null) bandar = (G.m[q1] - G.m[q0]) * 1e9 / valW >= NB_MIN; if (G.f && G.f[q1] != null && G.f[q0] != null) foreign = (G.f[q1] - G.f[q0]) * 1e9 / valW >= NB_MIN; } }
    if (B) { const q = atDay(B.d, prevDay); if (q >= 0) { const z = zch(B.l, q, W); if (z != null) lpm = z > LPM_Z; } }
    // reported: breakout trade with stop at the base low, target 2x the risk, 15 sessions
    const e = b.o[k + 1], stop = loB, tgt = e + 2 * (e - stop); let tr = b.c[k + H] / e - 1 - FEE;
    if (e > stop) for (let j = k + 1; j <= k + H; j++) { if (b.l[j] <= stop) { tr = Math.min(stop, b.o[j]) / e - 1 - FEE; break; } if (b.h[j] >= tgt) { tr = Math.max(tgt, b.o[j]) / e - 1 - FEE; break; } }
    ev.push({ tk: t, day, ex: f - um[0] / um[1], raw: f, bandar, foreign, lpm, tr, risk: 1 - stop / e });
    busy = k + H;
  }
}
const days = ev.map(e => e.day).sort();
console.log(`${ev.length} breakouts from a 40-session base (${days[0]} .. ${days.at(-1)}); with bandar data ${ev.filter(e => e.bandar != null).length}, LPM data ${ev.filter(e => e.lpm != null).length}`);

// statistics by date
function stat(rs) {
  const by = new Map(); rs.forEach(r => { if (!by.has(r.day)) by.set(r.day, []); by.get(r.day).push(r.ex); });
  const xs = [...by.values()].map(a => mean(a)), m = mean(xs), t = m / (sd(xs) / Math.sqrt(xs.length) || 1);
  const ds = rs.map(r => r.day).sort(), mid = ds[ds.length >> 1];
  return { n: rs.length, dates: xs.length, ex: m, t, p: 1 - normCdf(t), raw: mean(rs.map(r => r.raw)), win: rs.filter(r => r.raw > 0).length / (rs.length || 1), first: mean(rs.filter(r => r.day < mid).map(r => r.ex)), second: mean(rs.filter(r => r.day >= mid).map(r => r.ex)), trade: mean(rs.map(r => r.tr)) };
}
function normCdf(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
const show = (name, s) => console.log(`${name.padEnd(40)} n ${String(s.n).padStart(4)}  15-session ${pct(s.raw).padStart(7)}  excess ${pct(s.ex).padStart(7)}  t ${s.t.toFixed(2).padStart(5)}  p ${s.p.toFixed(3)}  halves ${pct(s.first)} / ${pct(s.second)}  win ${(s.win * 100).toFixed(0)}%  stop-at-base trade ${pct(s.trade)}`);

const out = { asOf: new Date().toISOString().slice(0, 10), events: ev.length, versions: {} };
show('ALL base breakouts (reported)', stat(ev)); out.all = stat(ev);
for (const [key, label] of [['bandar', 'A bandar accumulation'], ['lpm', 'B LPM rising'], ['foreign', 'C foreign accumulation']]) {
  const have = ev.filter(e => e[key] != null), yes = have.filter(e => e[key]), no = have.filter(e => !e[key]);
  const sy = stat(yes), sn = stat(no);
  console.log(`\n--- ${label} ---`); show('  with accumulation', sy); show('  without (control)', sn);
  const pass = sy.n >= 40 && sy.ex > 0 && sy.t >= 2 && sy.p < 0.05 / 3 && sy.ex > sn.ex && sy.first > 0 && sy.second > 0;
  out.versions[key] = { with: sy, without: sn, pass };
  console.log(`  -> ${pass ? 'PASS' : 'fail'} (a ${sy.ex > 0 && sy.t >= 2 && sy.p < 0.0167 ? 'ok' : 'x'} · b ${sy.ex > sn.ex ? 'ok' : 'x'} · c ${sy.first > 0 && sy.second > 0 ? 'ok' : 'x'} · d ${sy.n >= 40 ? 'ok' : 'x'})`);
}
out.passed = Object.entries(out.versions).filter(([, v]) => v.pass).map(([k]) => k);
console.log(`\nVERDICT: ${out.passed.length ? 'PASS: ' + out.passed.join(', ') + ' -> new ACT setup' : 'no version passes -> watch only, forward-tested'}`);
fs.writeFileSync(path.join(ROOT, 'data', 'base-study.json'), JSON.stringify(out, null, 1));

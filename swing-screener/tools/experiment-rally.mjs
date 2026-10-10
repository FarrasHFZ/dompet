// What comes BEFORE a rally? Discovery on one period, confirmation on the next.
//
// PRE-REGISTERED 2026-10-10 (the procedure, including how the winners are picked), committed before the first run.
// Why: the user sees many stocks rally without an ACT call. ACT only looks for crashed stocks starting to bounce, so
// rallies from a base / breakout / uptrend are invisible to it. This looks for what precedes rallies in general.
// Stocks: all 300, liquid (Rp 5 B a day over 20 sessions) on the date. Dates every 10 sessions, 2024-11 .. 2026-09
// (NeoBDM group history starts 2024-10). Outcome: return from the next open to the open 10 sessions later; a "rally"
// is +10% or more.
// Candidate drivers, all known on the date:
//   price/volume: r5, r20, r60 returns; hi52 (close vs 52-week high); brk60 (close vs prior 60-session high);
//     volx (5-session / 60-session average volume); comp (ATR20 / ATR120: quiet before a move); rsi14
//   Bandarmetrics: lpm20z, lpm60z, mf20z (change vs the stock's own year), ispk (intensity, last 3 vs own 120), vr20
//   NeoBDM groups: 20-session net buying as % of traded value for bandar (m), foreign (f), retail (z), sultan (s),
//     institution (i), non-retail (nr); retail share of trading (1 - pi)
// DISCOVERY (2024-11 .. 2025-09 only): for each driver, the per-date top-minus-bottom third spread of the 10-session
//   return, its t over dates, and the rally rate in the top vs the bottom third. The 3 drivers with the largest |t|
//   are picked automatically, each with the direction it showed.
// CONFIRMATION (2025-10 .. 2026-09, never looked at in discovery): tools/study-lib.mjs terciles() in that direction.
//   A driver CONFIRMS only with p < 0.05/3, t >= 2 and the same sign in both halves of the confirmation period.
// If one confirms: a "rally watch" signal on the site (paper, forward-tested), separate from ACT. Reported only: every
//   driver's confirmation numbers, and the recent rallies with their pre-rally readings.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
import { terciles, mean, sd } from './study-lib.mjs';

const U = universe(loadEngine()).map(u => u.ticker), iso = d => d.toISOString().slice(0, 10);
const H = 10, STEP = 10, D0 = '2024-11-01', SPLIT = '2025-10-01', RALLY = 0.10;
const px = await loadPrices(U.map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const BM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bm-history.json'), 'utf8'));
const NB = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-history.json'), 'utf8'));
const days = px['^JKSE'].d.map(iso);
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const zch = (arr, k, w) => { if (k < w + 250) return null; const ch = []; for (let j = k - 250; j <= k; j += 5) if (arr[j] != null && arr[j - w] != null) ch.push(arr[j] - arr[j - w]); if (ch.length < 30 || arr[k] == null || arr[k - w] == null) return null; const s = sd(ch); return s ? (arr[k] - arr[k - w] - mean(ch)) / s : null; };
const atr = (b, k, n) => { let s = 0; for (let j = k - n + 1; j <= k; j++) s += Math.max(b.h[j] - b.l[j], Math.abs(b.h[j] - b.c[j - 1]), Math.abs(b.l[j] - b.c[j - 1])); return s / n; };
const rsi = (c, k, n = 14) => { let g = 0, l = 0; for (let j = k - n + 1; j <= k; j++) { const d = c[j] - c[j - 1]; if (d > 0) g += d; else l -= d; } return l ? 100 - 100 / (1 + g / l) : 100; };
const idxOf = {}; for (const t of U) if (px[t + '.JK']) idxOf[t] = new Map(px[t + '.JK'].d.map((d, i) => [iso(d), i]));
const atDay = (arr, day) => { let lo = 0, hi = arr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= day) { r = m; lo = m + 1; } else hi = m - 1; } return r; };

function features(t, day) {
  const b = px[t + '.JK'], k = idxOf[t] && idxOf[t].get(day);
  if (k == null || k < 260 || k + H + 1 >= b.c.length || !(b.o[k + 1] > 0)) return null;
  const val = b.c.slice(k - 19, k + 1).map((c, j) => c * b.v[k - 19 + j]), v20 = val.reduce((s, x) => s + x, 0);
  if (v20 / 20 < 5e9 || b.v.slice(k - 2, k + 1).some(v => !v)) return null;
  const f = {
    r5: b.c[k] / b.c[k - 5] - 1, r20: b.c[k] / b.c[k - 20] - 1, r60: b.c[k] / b.c[k - 60] - 1,
    hi52: b.c[k] / Math.max(...b.h.slice(k - 251, k + 1)) - 1, brk60: b.c[k] / Math.max(...b.h.slice(k - 60, k)) - 1,
    volx: mean(b.v.slice(k - 4, k + 1)) / (mean(b.v.slice(k - 59, k + 1)) || 1), comp: atr(b, k, 20) / (atr(b, k, 120) || 1), rsi14: rsi(b.c, k),
  };
  const B = BM[t]; if (B) { const q = atDay(B.d, day); if (q >= 0 && B.d[q] >= day.slice(0, 8) + '01') {
    f.lpm20z = zch(B.l, q, 20); f.lpm60z = zch(B.l, q, 60); f.mf20z = zch(B.m, q, 20);
    const iw = B.i.slice(Math.max(0, q - 122), q - 2).filter(x => x != null).sort((a, c) => a - c), im = Math.max(...B.i.slice(q - 2, q + 1).filter(x => x != null));
    if (iw.length >= 90 && isFinite(im)) f.ispk = atDay(iw, im) / iw.length;
    const vr = B.v.slice(q - 19, q + 1).filter(x => x != null); if (vr.length >= 15) f.vr20 = mean(vr);
  } }
  const G = NB[t] && NB[t].g; if (G) { const q = atDay(G.d, day); if (q >= 20) {
    for (const [g, name] of [['m', 'bandar'], ['f', 'foreign'], ['z', 'retail'], ['s', 'sultan'], ['i', 'institution'], ['nr', 'nonretail']])
      if (G[g] && G[g][q] != null && G[g][q - 20] != null) f[name] = (G[g][q] - G[g][q - 20]) * 1e9 / v20;
    const pi = G.pi ? G.pi.slice(q - 19, q + 1).filter(x => x != null) : []; if (pi.length >= 15) f.retailShare = 1 - mean(pi);
  } }
  return { f, fwd: b.o[k + H + 1] / b.o[k + 1] - 1 };
}

const grid = days.filter(d => d >= D0).filter((d, i) => i % STEP === 0);
const rows = [];
for (const day of grid) for (const t of U) { const r = features(t, day); if (r) rows.push({ date: day, tk: t, ...r }); }
const NAMES = [...new Set(rows.flatMap(r => Object.keys(r.f)))];
const disc = rows.filter(r => r.date < SPLIT), conf = rows.filter(r => r.date >= SPLIT);
console.log(`${rows.length} stock-dates (${grid.length} dates); discovery ${disc.length}, confirmation ${conf.length}; base rally rate (+10% in 10 sessions): discovery ${pct(disc.filter(r => r.fwd >= RALLY).length / disc.length, 1)}, confirmation ${pct(conf.filter(r => r.fwd >= RALLY).length / conf.length, 1)}`);

// ---- discovery ----
const byDate = rs => { const m = new Map(); rs.forEach(r => { if (!m.has(r.date)) m.set(r.date, []); m.get(r.date).push(r); }); return [...m.values()]; };
function discover(name) {
  const sp = [], top = [], bot = [];
  for (const g of byDate(disc.filter(r => r.f[name] != null && isFinite(r.f[name])))) {
    if (g.length < 30) continue;
    const s = g.slice().sort((a, b) => a.f[name] - b.f[name]), k = Math.floor(s.length / 3);
    sp.push(mean(s.slice(-k).map(r => r.fwd)) - mean(s.slice(0, k).map(r => r.fwd)));
    top.push(...s.slice(-k)); bot.push(...s.slice(0, k));
  }
  const t = mean(sp) / (sd(sp) / Math.sqrt(sp.length) || 1);
  return { name, dates: sp.length, spread: mean(sp), t, rallyTop: top.filter(r => r.fwd >= RALLY).length / (top.length || 1), rallyBot: bot.filter(r => r.fwd >= RALLY).length / (bot.length || 1) };
}
const D = NAMES.map(discover).filter(d => d.dates >= 10).sort((a, b) => Math.abs(b.t) - Math.abs(a.t));
console.log('\n===== DISCOVERY (2024-11 .. 2025-09): top third minus bottom third, 10-session return =====');
console.log('driver          dates  spread     t    rally rate top / bottom third');
D.forEach(d => console.log(`${d.name.padEnd(14)} ${String(d.dates).padStart(5)}  ${pct(d.spread).padStart(7)}  ${d.t.toFixed(2).padStart(5)}    ${pct(d.rallyTop, 1)} / ${pct(d.rallyBot, 1)}`));
const picked = D.slice(0, 3).map(d => ({ name: d.name, dir: Math.sign(d.t) }));
console.log(`\npicked automatically: ${picked.map(p => `${p.name} (${p.dir > 0 ? 'high' : 'low'} = better)`).join(', ')}`);

// ---- confirmation ----
console.log('\n===== CONFIRMATION (2025-10 .. 2026-09, unseen) =====');
const out = { asOf: new Date().toISOString().slice(0, 10), discovery: D, picked, confirm: {} };
const confDates = [...new Set(conf.map(r => r.date))].sort(), mid = confDates[confDates.length >> 1];
for (const d of D) {
  const p = picked.find(x => x.name === d.name), dir = p ? p.dir : Math.sign(d.t) || 1;
  const s = conf.filter(r => r.f[d.name] != null && isFinite(r.f[d.name])).map(r => ({ date: r.date, tk: r.tk, sig: r.f[d.name], fwd: r.fwd }));
  if (new Set(s.map(x => x.date)).size < 6) continue;
  const r = terciles(s, { split: mid, dir, runs: p ? 2000 : 500, minN: 30 });
  const ok = p ? r.p < 0.05 / 3 && dir * r.t >= 2 && dir * r.first > 0 && dir * r.second > 0 : null;
  out.confirm[d.name] = { ...r, dir, picked: !!p, confirms: ok };
  console.log(`${(p ? '* ' : '  ') + d.name.padEnd(14)} dir ${dir > 0 ? 'high' : 'low '}  spread ${pct(dir * r.spread).padStart(7)}  t ${(dir * r.t).toFixed(2).padStart(5)}  p ${r.p.toFixed(3)}  halves ${pct(dir * r.first)} / ${pct(dir * r.second)}${p ? (ok ? '  CONFIRMS' : '  does not confirm') : ''}`);
}

// ---- recent rallies: what did they look like before? ----
const last = days.length - 1, start = days[last - 10];
const rec = U.map(t => { const b = px[t + '.JK'], k = idxOf[t] && idxOf[t].get(days[last]), k0 = idxOf[t] && idxOf[t].get(start); if (k == null || k0 == null) return null; return { t, ret: b.c[k] / b.c[k0] - 1 }; }).filter(Boolean).sort((a, b) => b.ret - a.ret);
const ral = rec.filter(r => r.ret >= RALLY);
console.log(`\n===== RECENT: ${ral.length} of ${rec.length} stocks rose ${pct(RALLY, 0)}+ from ${start} to ${days[last]} =====`);
const pre = ral.slice(0, 15).map(r => { const k0 = idxOf[r.t].get(start), b = px[r.t + '.JK']; const g = { r20: b.c[k0] / b.c[k0 - 20] - 1, hi52: b.c[k0] / Math.max(...b.h.slice(k0 - 251, k0 + 1)) - 1, rsi14: rsi(b.c, k0) };
  return `${r.t.padEnd(5)} ${pct(r.ret, 0).padStart(5)}   before: 20-day ${pct(g.r20, 0).padStart(5)}, ${pct(g.hi52, 0)} from 52w high, RSI ${g.rsi14.toFixed(0)} ${g.rsi14 < 35 ? '(oversold: ACT territory)' : '(not oversold: ACT cannot see it)'}`; });
pre.forEach(l => console.log(l));
out.recent = { from: start, to: days[last], rallies: ral.length, of: rec.length, top: ral.slice(0, 15) };
out.verdict = Object.entries(out.confirm).filter(([, v]) => v.confirms).map(([k]) => k);
console.log(`\nVERDICT: ${out.verdict.length ? 'confirmed rally driver(s): ' + out.verdict.join(', ') : 'no picked driver confirmed on the unseen period'}`);
fs.writeFileSync(path.join(ROOT, 'data', 'rally-study.json'), JSON.stringify(out, null, 1));

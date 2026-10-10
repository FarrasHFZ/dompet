// Do retail crowds, foreign flow and Bandarmetrics LPM predict returns, once each is read on the right stocks?
//
// PRE-REGISTERED 2026-10-10, committed before the first run. Harness: tools/study-lib.mjs (non-overlapping dates every
// 20 sessions, within-date permutation null, 2000 runs, both halves). Forward return: next open to the open 20
// sessions later. Liquid stocks only (Rp 5 B a day over 20 sessions, point in time). Halves split at the middle
// sample date of each test. PASS = permutation p < 0.05 in the expected direction AND the same sign in both halves.
//
// H1 RETAIL CROWD (the user's "retail-dominated stocks are bad"). NeoBDM participation bars, 300 stocks, ~2 years:
//    retail share of trading = 1 - pi (the stacked bars: z = 1, i = everything except retail), averaged over 20
//    sessions. Expect the most retail-dominated third to do WORSE than the least (dir -1).
// H2 FOREIGN FLOW WHERE FOREIGNERS MOVE THE PRICE (the user's "foreign flow matters for stocks with high foreign
//    correlation", Bandarmetrics f_cor idea). IDX daily foreign buy/sell, tested 100, 2022-09 on:
//    fcorr = correlation over the previous 120 sessions between the day's foreign net (shares, % of volume) and the
//    day's return. Among the top third by fcorr on each date, F20 = foreign net over the last 20 sessions as % of
//    volume. Expect the top third by F20 to beat the bottom third (dir +1).
//    Control (reported): the same inside the bottom third by fcorr (expected ~0).
// H3 BANDARMETRICS LPM. 300 stocks, 2023 on: LPM change over 60 sessions, as a z-score against the stock's own
//    60-session changes over the previous 250 sessions (unit-free). Expect the top third to beat the bottom third
//    (dir +1). The 60-session window comes from tools/experiment-bm-score.mjs (held direction, t 1.9, below its bar),
//    so this is a confirmation on the stricter harness, not a fresh idea.
//    Reported only, NOT tests (multiple looks): the same z for Money Flow; Intensity and Volume Rotation levels;
//    H3 inside low-fcorr (domestic) stocks.
// What passing changes (decided now):
//    H1 -> the most retail-dominated third gets a "retail crowd" flag and its oversold setups become SKIP.
//    H2 -> foreign-driven stocks with top-third foreign buying get a "foreign buying" confirmation (ACT ✓).
//    H3 -> top-third LPM gets a "big-money accumulation" confirmation (ACT ✓).
//    Confirmed signals also feed a paper "flow picks" list with its own forward record. Nothing that fails is used.
import fs from 'node:fs';
import path from 'node:path';
import { loadPrices, ROOT, loadEngine, universe, expansionTickers } from './lib.mjs';
import { terciles, passes, fmt, mean } from './study-lib.mjs';

const api = loadEngine(), NEW = expansionTickers(), U = universe(api).map(u => u.ticker), TESTED = U.filter(t => !NEW.has(t));
const iso = d => d.toISOString().slice(0, 10), STEP = 20, H = 20;
const px = await loadPrices(U.map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const days = px['^JKSE'].d.map(iso);
const at = {}; for (const t of U) if (px[t + '.JK']) at[t] = new Map(px[t + '.JK'].d.map((d, i) => [iso(d), i]));
const sampleDays = from => days.filter(d => d >= from).filter((d, i) => i % STEP === 0);
// forward return from the next open, H sessions; liquidity at the date
function fwd(t, day) {
  const b = px[t + '.JK'], k = at[t] && at[t].get(day);
  if (k == null || k < 20 || k + H + 1 >= b.c.length) return null;
  const val = mean(b.c.slice(k - 19, k + 1).map((c, j) => c * b.v[k - 19 + j]));
  if (val < 5e9 || b.v.slice(k - 2, k + 1).some(v => !v)) return null;
  return b.o[k + H + 1] / b.o[k + 1] - 1;
}
const midSplit = s => { const ds = [...new Set(s.map(x => x.date))].sort(); return ds[ds.length >> 1]; };
const res = { asOf: new Date().toISOString().slice(0, 10) };
const show = (name, r, dir) => console.log(`${name.padEnd(46)} dates ${String(r.dates).padStart(3)}  avg ${r.avgN.toFixed(0).padStart(3)} stocks  top-bottom ${fmt(r.spread).padStart(7)}  t ${r.t.toFixed(2).padStart(5)}  p ${r.p.toFixed(3)}  halves ${fmt(r.first)} / ${fmt(r.second)}  ${dir ? (passes(r, dir) ? 'PASS' : 'fail') : '(reported)'}`);
const run = (name, s, dir, test) => { const r = terciles(s, { split: midSplit(s), dir }); res[name] = { ...r, dir, test, pass: test ? passes(r, dir) : null }; show(name, r, test ? dir : 0); return r; };

// ---- H1 retail crowd (NeoBDM participation) ----
const nb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-history.json'), 'utf8'));
const h1 = [];
for (const day of sampleDays('2024-11-01')) for (const t of U) {
  const g = nb[t] && nb[t].g; if (!g || !g.pi) continue;
  const k = g.d.lastIndexOf(g.d.filter(x => x <= day).pop()); if (k < 19) continue;
  const w = g.pi.slice(k - 19, k + 1).filter(x => x != null); if (w.length < 15) continue;
  const f = fwd(t, day); if (f == null) continue;
  h1.push({ date: day, tk: t, sig: 1 - mean(w), fwd: f });
}
console.log('\n===== H1 RETAIL CROWD =====');
run('H1 retail share (high = worse)', h1, -1, true);

// ---- H2 foreign flow, where foreigners move the price (IDX foreign data) ----
const ff = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'idx-foreign-flow.json'), 'utf8'));
const fdays = Object.keys(ff).sort(), fdIso = fdays.map(d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`);
const series = {}; // t -> arrays aligned to fdays: net% and return
for (const t of TESTED) {
  const net = [], ret = [];
  fdays.forEach((d, i) => {
    const r = ff[d][t], p = i ? ff[fdays[i - 1]][t] : null;
    net.push(r && r[1] ? (r[4] - r[5]) / r[1] : null);
    ret.push(r && p && p[0] ? r[0] / p[0] - 1 : null);
  });
  series[t] = { net, ret, vol: fdays.map(d => (ff[d][t] ? ff[d][t][1] : null)), fb: fdays.map(d => (ff[d][t] ? ff[d][t][4] - ff[d][t][5] : null)) };
}
const corr = (a, b) => { const p = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x != null && y != null); if (p.length < 80) return null; const mx = mean(p.map(q => q[0])), my = mean(p.map(q => q[1])); let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of p) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; } return sxy / Math.sqrt(sxx * syy || 1); };
const fRows = [];
for (const day of sampleDays(fdIso[140])) {
  const i = fdIso.lastIndexOf(fdIso.filter(x => x <= day).pop()); if (i < 140) continue;
  for (const t of TESTED) {
    const S = series[t], c = corr(S.net.slice(i - 119, i + 1), S.ret.slice(i - 119, i + 1)); if (c == null) continue;
    const vb = S.vol.slice(i - 19, i + 1), nb2 = S.fb.slice(i - 19, i + 1); if (vb.some(v => v == null)) continue;
    const f = fwd(t, day); if (f == null) continue;
    fRows.push({ date: day, tk: t, fcorr: c, f20: nb2.reduce((s, x) => s + x, 0) / (vb.reduce((s, x) => s + x, 0) || 1), fwd: f });
  }
}
const third = (rows, pickTop) => { const out = []; const by = new Map(); rows.forEach(r => { if (!by.has(r.date)) by.set(r.date, []); by.get(r.date).push(r); });
  for (const rs of by.values()) { const s = rs.slice().sort((a, b) => a.fcorr - b.fcorr), k = Math.floor(s.length / 3); out.push(...(pickTop ? s.slice(-k) : s.slice(0, k))); } return out; };
console.log('\n===== H2 FOREIGN FLOW x FOREIGN CORRELATION =====');
console.log(`  median fcorr ${mean(fRows.map(r => r.fcorr)).toFixed(2)} (share of days foreign net and price move together)`);
run('H2 foreign buying, high-fcorr stocks', third(fRows, true).map(r => ({ ...r, sig: r.f20 })), 1, true);
run('   control: foreign buying, low-fcorr stocks', third(fRows, false).map(r => ({ ...r, sig: r.f20 })), 1, false);
run('   foreign buying, all tested stocks', fRows.map(r => ({ ...r, sig: r.f20 })), 1, false);

// ---- H3 Bandarmetrics LPM (and the other indicators, reported) ----
const bm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bm-history.json'), 'utf8'));
const zChange = (arr, k, w = 60) => { if (k < w + 250) return null; const ch = []; for (let j = k - 250; j <= k; j += 5) if (arr[j] != null && arr[j - w] != null) ch.push(arr[j] - arr[j - w]); if (ch.length < 30 || arr[k] == null || arr[k - w] == null) return null; const m = mean(ch), s = Math.sqrt(mean(ch.map(x => (x - m) ** 2))); return s ? (arr[k] - arr[k - w] - m) / s : null; };
const lvl = (arr, k, w = 20) => { const v = arr.slice(k - w + 1, k + 1).filter(x => x != null); return v.length >= w * 0.75 ? mean(v) : null; };
const bmRows = { l: [], m: [], i: [], v: [] };
const fcorrNow = new Map(); // date|tk -> fcorr for the domestic split
fRows.forEach(r => fcorrNow.set(r.date + '|' + r.tk, r.fcorr));
for (const day of sampleDays('2023-03-01')) for (const t of U) {
  const B = bm[t]; if (!B) continue;
  const k = B.d.lastIndexOf(B.d.filter(x => x <= day).pop()); if (k < 0 || B.d[k] < day.slice(0, 8) + '01') continue;
  const f = fwd(t, day); if (f == null) continue;
  const base = { date: day, tk: t, fwd: f, fcorr: fcorrNow.get(day + '|' + t) };
  const zl = zChange(B.l, k), zm = zChange(B.m, k), li = lvl(B.i, k), lv = lvl(B.v, k);
  if (zl != null) bmRows.l.push({ ...base, sig: zl });
  if (zm != null) bmRows.m.push({ ...base, sig: zm });
  if (li != null) bmRows.i.push({ ...base, sig: li });
  if (lv != null) bmRows.v.push({ ...base, sig: lv });
}
console.log('\n===== H3 BANDARMETRICS =====');
run('H3 LPM 60-session change (z), all stocks', bmRows.l, 1, true);
run('   Money Flow 60-session change (z)', bmRows.m, 1, false);
run('   Intensity, 20-session level', bmRows.i, 1, false);
run('   Volume Rotation, 20-session level', bmRows.v, 1, false);
const dom = bmRows.l.filter(r => r.fcorr != null), cut = (() => { const s = dom.map(r => r.fcorr).sort((a, b) => a - b); return s[Math.floor(s.length / 3)]; })();
run('   LPM inside low-fcorr (domestic) stocks', dom.filter(r => r.fcorr <= cut), 1, false);

res.verdict = { H1: res['H1 retail share (high = worse)'].pass, H2: res['H2 foreign buying, high-fcorr stocks'].pass, H3: res['H3 LPM 60-session change (z), all stocks'].pass };
console.log(`\nVERDICT  H1 retail crowd ${res.verdict.H1 ? 'PASS' : 'FAIL'} · H2 foreign flow on foreign-driven stocks ${res.verdict.H2 ? 'PASS' : 'FAIL'} · H3 LPM ${res.verdict.H3 ? 'PASS' : 'FAIL'}`);
fs.writeFileSync(path.join(ROOT, 'data', 'flow2-study.json'), JSON.stringify(res, null, 1));

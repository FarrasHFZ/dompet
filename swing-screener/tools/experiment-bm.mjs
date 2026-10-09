// Does the Bandarmetrics read (tools/bm-model.mjs) improve the oversold-bounce ACT signal?
// Data: data/bm-history.json (tools/bm-pull.js, 2022-01..), data/idx-foreign-flow.json (IDX, 2022-09..),
// samples data/cache/experiment_v3.json (every 2nd day x 100 stocks, ACT and non-ACT, trade results with the live rules).
//
// PRE-REGISTERED 2026-10-09, before the first run:
// PRIMARY H1: among ACT signals, LPM rising over 20 sessions (d20 > 0) beats LPM not rising, on wide-stop net return.
//   Why: ACT stocks have just fallen, so LPM rising = BM's "quiet accumulation" (pressure ahead of price), the exact case
//   in which an oversold bounce should work. Adopt only if ALL hold:
//   (a) one trade per stock episode (no new signal within 15 sessions): Welch t >= 2
//   (b) clustered by day (one gap per day that has both groups): t >= 2
//   (c) gap > 0 on the 73 stocks the score was not designed on, and (d) in both halves (split 2024-10-01).
// SECONDARY (6 more looks, so each needs (a)-(d) with t >= 2.5 instead of 2):
//   H2 BM read ACCUM_* vs DISTRIB_* ; H3 LPM falling (z <= -0.25) as a veto ; H4 Volume Rotation red as a veto ;
//   H5 Intensity spike with LPM rising ; H6 flow lens up with LPM rising ; H7 same as H1 on the bounce-candle subset.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';
import { bmRead, foreignProfile } from './bm-model.mjs';

const BM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bm-history.json'), 'utf8'));
const FLOW = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'idx-foreign-flow.json'), 'utf8'));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache', 'experiment_v3.json'), 'utf8'));
const fdays = Object.keys(FLOW).sort(), fdi = new Map(fdays.map((d, i) => [d, i]));
const allDays = [...new Set(S.map(s => s.day))].sort(), dayIdx = new Map(allDays.map((d, i) => [d, i]));
const bmIdx = Object.fromEntries(Object.entries(BM).map(([tk, s]) => [tk, new Map(s.d.map((d, i) => [d, i]))]));
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const SPLIT = '2024-10-01';

const rows = [];
for (const s of S) {
  const b = BM[s.tk], t = bmIdx[s.tk] && bmIdx[s.tk].get(s.day);
  if (!b || t == null) continue;
  const fi = fdi.get(s.day.replace(/-/g, ''));
  let fp = null, chg20 = null;
  if (fi != null && fi >= 20) {
    const fr = fdays.slice(Math.max(0, fi - 180), fi + 1).map(d => FLOW[d][s.tk] || null);
    fp = foreignProfile(fr);
    const now = FLOW[fdays[fi]][s.tk], then = FLOW[fdays[fi - 20]][s.tk];
    if (now && then) chg20 = now[0] / then[0] - 1;
  }
  const r = bmRead(b, t, { chg20 }, fp);
  if (r) rows.push({ ...s, bm: r });
}
const ACT = rows.filter(s => s.act);
console.log(`samples with BM read: ${rows.length} of ${S.length}; ACT ${ACT.length}; ${rows[0] && rows[0].day}..${rows.at(-1) && rows.at(-1).day}`);

const pc = x => (x == null || Number.isNaN(x) ? 'n/a' : (x * 100).toFixed(2) + '%');
function welch(a, b) {
  if (a.length < 10 || b.length < 10) return { gap: null, t: null, na: a.length, nb: b.length };
  const ma = mean(a), mb = mean(b), va = a.reduce((s, x) => s + (x - ma) ** 2, 0) / (a.length - 1), vb = b.reduce((s, x) => s + (x - mb) ** 2, 0) / (b.length - 1);
  return { gap: ma - mb, t: (ma - mb) / Math.sqrt(va / a.length + vb / b.length), na: a.length, nb: b.length, ma, mb };
}
function episodes(A) {
  const by = {}, ep = []; A.forEach(s => { (by[s.tk] = by[s.tk] || []).push(s); });
  Object.values(by).forEach(l => { l.sort((a, b) => a.day.localeCompare(b.day)); let last = -1e9; l.forEach(s => { const i = dayIdx.get(s.day); if (i - last >= 8) { ep.push(s); last = i; } }); }); // 8 sampled days = 16 sessions (samples are every 2nd session)
  return ep;
}
function clustered(A, inA, inB) {
  const by = {}; A.forEach(s => { (by[s.day] = by[s.day] || []).push(s); });
  const g = Object.values(by).map(l => { const p = l.filter(inA), q = l.filter(inB); return p.length && q.length ? mean(p.map(s => s.rw)) - mean(q.map(s => s.rw)) : null; }).filter(x => x != null);
  if (g.length < 10) return { gap: null, t: null, days: g.length };
  const m = mean(g), v = g.reduce((s, x) => s + (x - m) ** 2, 0) / (g.length - 1);
  return { gap: m, t: m / Math.sqrt(v / g.length), days: g.length };
}
function test(name, A, inA, inB, bar) {
  const ep = episodes(A);
  const e = welch(ep.filter(inA).map(s => s.rw), ep.filter(inB).map(s => s.rw));
  const c = clustered(A, inA, inB);
  const un = welch(A.filter(s => !s.design && inA(s)).map(s => s.rw), A.filter(s => !s.design && inB(s)).map(s => s.rw));
  const h1 = welch(A.filter(s => s.day < SPLIT && inA(s)).map(s => s.rw), A.filter(s => s.day < SPLIT && inB(s)).map(s => s.rw));
  const h2 = welch(A.filter(s => s.day >= SPLIT && inA(s)).map(s => s.rw), A.filter(s => s.day >= SPLIT && inB(s)).map(s => s.rw));
  const pass = e.t != null && c.t != null && e.t >= bar && c.t >= bar && un.gap > 0 && h1.gap > 0 && h2.gap > 0;
  const f = x => (x == null ? 'n/a' : x.toFixed(2));
  console.log(`\n${name}\n  episodes: A ${e.na} ${pc(e.ma)} vs B ${e.nb} ${pc(e.mb)} gap ${pc(e.gap)} t=${f(e.t)} | by day: gap ${pc(c.gap)} t=${f(c.t)} (${c.days} d)\n  unseen gap ${pc(un.gap)} | first half ${pc(h1.gap)} | second half ${pc(h2.gap)} -> ${pass ? 'PASS' : 'fail'} (bar t>=${bar})`);
  return { name, pass, bar, episodes: e, clustered: c, unseen: un.gap, firstHalf: h1.gap, secondHalf: h2.gap };
}

const up = s => s.bm.lpmUp20, notUp = s => !s.bm.lpmUp20;
const accum = s => s.bm.read.startsWith('ACCUM'), distrib = s => s.bm.read.startsWith('DISTRIB') || s.bm.read === 'HIDDEN_DISTRIBUTION';
const results = [
  test('H1 PRIMARY  ACT: LPM up 20d vs not', ACT, up, notUp, 2),
  test('H2 ACT: BM read accumulation vs distribution', ACT, accum, distrib, 2.5),
  test('H3 ACT: LPM not falling vs falling (veto)', ACT, s => s.bm.lpm !== 'falling', s => s.bm.lpm === 'falling', 2.5),
  test('H4 ACT: Volume Rotation not red vs red (veto)', ACT, s => s.bm.band !== 'red', s => s.bm.band === 'red', 2.5),
  test('H5 ACT & LPM up: Intensity spike vs none', ACT.filter(up), s => s.bm.spike, s => !s.bm.spike, 2.5),
  test('H6 ACT & LPM up: flow lens up vs not', ACT.filter(up), s => s.bm.lensDir === 'up', s => s.bm.lensDir !== 'up', 2.5),
  test('H7 ACT + bounce candle: LPM up 20d vs not', ACT.filter(s => s.confirm), up, notUp, 2.5),
];

console.log('\n-- descriptive: ACT wide-stop avg net by BM read (all samples, overlapping) --');
const reads = {}; ACT.forEach(s => { (reads[s.bm.read] = reads[s.bm.read] || []).push(s.rw); });
Object.entries(reads).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => console.log(k.padEnd(20), String(v.length).padStart(5), pc(mean(v))));
const bands = {}; ACT.forEach(s => { (bands[s.bm.band] = bands[s.bm.band] || []).push(s.rw); });
console.log('VR band', Object.entries(bands).map(([k, v]) => `${k} n${v.length} ${pc(mean(v))}`).join(' | '));
console.log('control (non-ACT) avg net', pc(mean(rows.filter(s => !s.act).map(s => s.rw))));
console.log('foreign-driven share of ACT samples', (ACT.filter(s => s.bm.foreignDriven).length / ACT.length * 100).toFixed(0) + '%');

fs.writeFileSync(path.join(ROOT, 'data', 'bm-experiment.json'), JSON.stringify({
  asOf: new Date().toISOString().slice(0, 10), samples: rows.length, act: ACT.length, from: rows[0].day, to: rows.at(-1).day,
  results: results.map(r => ({ name: r.name, pass: r.pass, bar: r.bar, gapEpisodes: r.episodes.gap, tEpisodes: r.episodes.t, nA: r.episodes.na, nB: r.episodes.nb, gapByDay: r.clustered.gap, tByDay: r.clustered.t, unseen: r.unseen, firstHalf: r.firstHalf, secondHalf: r.secondHalf })),
  byRead: Object.fromEntries(Object.entries(reads).map(([k, v]) => [k, { n: v.length, avg: mean(v) }])),
}));

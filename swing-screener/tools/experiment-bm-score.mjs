// Can a DATA-WEIGHTED Bandarmetrics score (instead of BM's own rules) improve the screener?
// PRE-REGISTERED 2026-10-10, before the first run:
//   Features (all known at the signal day, each turned into a cross-sectional percentile 0..1 on that day):
//     lpm20  LPM 20-session change / sd of its own past year      lpm60  same over 60 sessions
//     lpm5   same over 5 sessions (turn)                           int    max Intensity of last 3 sessions, percentile in own prior 120
//     vr     5-session mean Volume Rotation                        mf10   Money Flow 10-session change / sd of own past year
//     f5     IDX 5-session foreign net / volume                    div    lpm20 percentile minus 20-session price-change percentile (pressure ahead of price)
//   TRAIN (up to Sep 2024; in practice Apr 2023 - Sep 2024, since features need 260+ sessions of BM history; all 100 stocks): for each feature, the monthly rank IC vs the wide-stop trade return.
//     A feature gets weight sign(IC) if |t of IC| >= 1.5, else 0. Score = weighted mean of percentiles.
//     Two scores are trained separately: (S_all) on all signals, (S_act) on ACT signals only.
//   TEST (Oct 2024 - Sep 2026, never used for training). Adopt a score only if ALL hold:
//     (a) ACT signals, score top half vs bottom half: one-trade-per-episode Welch t >= 2
//     (b) same, clustered by day: t >= 2
//     (c) gap > 0 on the 73 stocks the original score was not designed on
//     (d) for S_all also: test-period monthly rank IC > 0 with t >= 2 on all signals
// If nothing passes, Bandarmetrics stays context only.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const BM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bm-history.json'), 'utf8'));
const FLOW = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'idx-foreign-flow.json'), 'utf8'));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache', 'experiment_v3.json'), 'utf8'));
const SPLIT = '2024-10-01';
const fdays = Object.keys(FLOW).sort(), fdi = new Map(fdays.map((d, i) => [d, i]));
const allDays = [...new Set(S.map(s => s.day))].sort(), dayIdx = new Map(allDays.map((d, i) => [d, i]));
const bmIdx = Object.fromEntries(Object.entries(BM).map(([tk, s]) => [tk, new Map(s.d.map((d, i) => [d, i]))]));
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sdv = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const FEATS = ['lpm20', 'lpm60', 'lpm5', 'int', 'vr', 'mf10', 'f5', 'div'];

function zChange(arr, t, n) {
  if (t < n + 260 || arr[t] == null || arr[t - n] == null) return null;
  const h = []; for (let k = t - 250; k < t; k++) if (arr[k] != null && arr[k - n] != null) h.push(arr[k] - arr[k - n]);
  const s = sdv(h); return h.length > 100 && s ? (arr[t] - arr[t - n]) / s : null;
}
// raw features
const rows = [];
for (const s of S) {
  const b = BM[s.tk], t = bmIdx[s.tk] && bmIdx[s.tk].get(s.day);
  if (!b || t == null || t < 270) continue;
  const prior = b.i.slice(t - 122, t - 2).filter(x => x != null), cur = Math.max(...b.i.slice(t - 2, t + 1).map(x => x ?? -Infinity));
  const intP = prior.length > 60 && Number.isFinite(cur) ? prior.filter(x => x < cur).length / prior.length : null;
  const vr5 = b.v.slice(t - 4, t + 1).filter(x => x != null);
  const fi = fdi.get(s.day.replace(/-/g, ''));
  let f5 = null, chg20 = null;
  if (fi != null && fi >= 20) {
    let net = 0, vol = 0, ok = true;
    for (let k = fi - 4; k <= fi; k++) { const r = FLOW[fdays[k]][s.tk]; if (!r) { ok = false; break; } net += r[4] - r[5]; vol += r[1]; }
    if (ok && vol) f5 = net / vol;
    const a = FLOW[fdays[fi]][s.tk], c = FLOW[fdays[fi - 20]][s.tk]; if (a && c) chg20 = a[0] / c[0] - 1;
  }
  const f = { lpm20: zChange(b.l, t, 20), lpm60: zChange(b.l, t, 60), lpm5: zChange(b.l, t, 5), int: intP, vr: vr5.length ? mean(vr5) : null, mf10: zChange(b.m, t, 10), f5, chg20 };
  if (FEATS.filter(k => k !== 'div').some(k => f[k] == null) || chg20 == null) continue;
  rows.push({ ...s, f });
}
// cross-sectional percentiles per day
const byDay = {}; rows.forEach(r => { (byDay[r.day] = byDay[r.day] || []).push(r); });
for (const list of Object.values(byDay)) {
  const pr = key => { const v = list.map(r => r.f[key]).sort((a, b) => a - b); list.forEach(r => { r.p = r.p || {}; r.p[key] = list.length > 1 ? v.indexOf(r.f[key]) / (list.length - 1) : 0.5; }); };
  [...FEATS.filter(k => k !== 'div'), 'chg20'].forEach(pr);
  list.forEach(r => { r.p.div = (r.p.lpm20 - r.p.chg20 + 1) / 2; });
}
console.log(`rows with all features: ${rows.length} of ${S.length} (${rows[0].day}..${rows.at(-1).day})`);

const rk = a => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = []; o.forEach(([, i], k) => { r[i] = k; }); return r; };
const sp = (x, y) => { const rx = rk(x), ry = rk(y), mx = mean(rx), my = mean(ry); let n = 0, a = 0, b = 0; for (let i = 0; i < x.length; i++) { n += (rx[i] - mx) * (ry[i] - my); a += (rx[i] - mx) ** 2; b += (ry[i] - my) ** 2; } return a && b ? n / Math.sqrt(a * b) : 0; };
function monthlyIC(A, val, minN) {
  const by = {}; A.forEach(r => { (by[r.day.slice(0, 7)] = by[r.day.slice(0, 7)] || []).push(r); });
  const ics = Object.values(by).filter(g => g.length >= minN).map(g => sp(g.map(val), g.map(r => r.rw)));
  const m = mean(ics), s = sdv(ics); return { ic: m, t: ics.length > 2 ? m / (s / Math.sqrt(ics.length)) : 0, months: ics.length };
}
function train(A, minN, label) {
  const w = {};
  console.log(`\nTRAIN ${label} (${A.length} signals):`);
  FEATS.forEach(k => { const r = monthlyIC(A, x => x.p[k], minN); w[k] = Math.abs(r.t) >= 1.5 ? Math.sign(r.ic) : 0; console.log(`  ${k.padEnd(6)} IC ${r.ic.toFixed(3).padStart(7)} t ${r.t.toFixed(2).padStart(6)} -> weight ${w[k]}`); });
  return w;
}
const score = (r, w) => { const ks = FEATS.filter(k => w[k]); return ks.length ? mean(ks.map(k => (w[k] > 0 ? r.p[k] : 1 - r.p[k]))) : null; };

function welch(a, b) { if (a.length < 10 || b.length < 10) return { gap: null, t: null }; const ma = mean(a), mb = mean(b), va = sdv(a) ** 2, vb = sdv(b) ** 2; return { gap: ma - mb, t: (ma - mb) / Math.sqrt(va / a.length + vb / b.length), ma, mb, na: a.length, nb: b.length }; }
function episodes(A) { const by = {}, ep = []; A.forEach(s => { (by[s.tk] = by[s.tk] || []).push(s); }); Object.values(by).forEach(l => { l.sort((a, b) => a.day.localeCompare(b.day)); let last = -1e9; l.forEach(s => { const i = dayIdx.get(s.day); if (i - last >= 8) { ep.push(s); last = i; } }); }); return ep; }
function evaluate(label, w, testAct, testAll) {
  const sc = r => score(r, w);
  if (!FEATS.some(k => w[k])) { console.log(`\nTEST ${label}: no feature passed training -> nothing to test`); return { label, pass: false, empty: true }; }
  const med = (() => { const v = testAct.map(sc).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; })();
  const top = r => sc(r) > med, bot = r => !top(r);
  const ep = episodes(testAct), e = welch(ep.filter(top).map(r => r.rw), ep.filter(bot).map(r => r.rw));
  const byD = {}; testAct.forEach(r => { (byD[r.day] = byD[r.day] || []).push(r); });
  const g = Object.values(byD).map(l => { const p = l.filter(top), q = l.filter(bot); return p.length && q.length ? mean(p.map(r => r.rw)) - mean(q.map(r => r.rw)) : null; }).filter(x => x != null);
  const ct = g.length > 10 ? mean(g) / (sdv(g) / Math.sqrt(g.length)) : null;
  const un = welch(testAct.filter(r => !r.design && top(r)).map(r => r.rw), testAct.filter(r => !r.design && bot(r)).map(r => r.rw));
  const ic = testAll ? monthlyIC(testAll, sc, 150) : null;
  const pass = e.t >= 2 && ct >= 2 && un.gap > 0 && (!ic || (ic.ic > 0 && ic.t >= 2));
  const f = x => (x == null ? 'n/a' : x.toFixed(2));
  console.log(`\nTEST ${label}: ACT top half vs bottom half (out of sample)\n  episodes ${e.na} ${(e.ma * 100).toFixed(2)}% vs ${e.nb} ${(e.mb * 100).toFixed(2)}%, gap ${(e.gap * 100).toFixed(2)} t=${f(e.t)} | by day gap ${(mean(g) * 100).toFixed(2)} t=${f(ct)} (${g.length} d) | unseen gap ${(un.gap * 100).toFixed(2)}${ic ? ` | all-signal monthly IC ${ic.ic.toFixed(3)} t=${f(ic.t)}` : ''} -> ${pass ? 'PASS' : 'fail'}`);
  return { label, pass, weights: w, gapEpisodes: e.gap, tEpisodes: e.t, gapByDay: mean(g), tByDay: ct, unseen: un.gap, ic: ic && ic.ic, icT: ic && ic.t };
}
const TR = rows.filter(r => r.day < SPLIT), TE = rows.filter(r => r.day >= SPLIT);
const wAll = train(TR, 150, 'S_all on all signals'), wAct = train(TR.filter(r => r.act), 15, 'S_act on ACT signals');
const res = [evaluate('S_all', wAll, TE.filter(r => r.act), TE), evaluate('S_act', wAct, TE.filter(r => r.act), null)];
fs.writeFileSync(path.join(ROOT, 'data', 'bm-score-experiment.json'), JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), split: SPLIT, rows: rows.length, results: res }));

// Day-clustered significance for the v3 experiment + today's picks under each rule.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache', 'experiment_v3.json'), 'utf8'));
const ACT = S.filter(s => s.act), C = S.filter(s => !s.act);
const byDay = (A, key) => { const m = {}; A.forEach(s => { (m[s.day] = m[s.day] || []).push(s[key]); }); return m; };
const mean = x => x.reduce((a, b) => a + b, 0) / x.length;
// cluster-mean per day then t-stat across days
function tstat(vals) { const m = mean(vals), sd = Math.sqrt(mean(vals.map(v => (v - m) ** 2))); return [m, m / (sd / Math.sqrt(vals.length)), vals.length]; }
function diffVsControl(A, key) { // per day: mean(A) - mean(control same day)
  const a = byDay(A, key), c = byDay(C, key), d = [];
  Object.keys(a).forEach(k => { if (c[k]) d.push(mean(a[k]) - mean(c[k])); });
  return tstat(d);
}
const p = x => (x * 100).toFixed(2) + '%';
for (const [name, A, key] of [['ACT base', ACT, 'r'], ['ACT wide', ACT, 'rw'], ['ACT+confirm base', ACT.filter(s => s.confirm), 'r'], ['ACT+confirm wide', ACT.filter(s => s.confirm), 'rw']]) {
  const dm = Object.values(byDay(A, key)).map(mean);
  const [m, t, n] = tstat(dm), [dd, dt, dn] = diffVsControl(A, key);
  console.log(name.padEnd(20), 'days', n, 'avg-by-day', p(m), 't', t.toFixed(2), '| minus control same-day:', p(dd), 't', dt.toFixed(2), 'days', dn);
}
// confirm effect inside ACT: confirmed vs unconfirmed
const cf = ACT.filter(s => s.confirm), nc = ACT.filter(s => !s.confirm);
console.log('confirmed wide', p(mean(cf.map(s => s.rw))), 'vs unconfirmed wide', p(mean(nc.map(s => s.rw))), '| base', p(mean(cf.map(s => s.r))), 'vs', p(mean(nc.map(s => s.r))));
// signals per day for the best rule
const perDay = Object.values(byDay(cf, 'rw')).map(a => a.length);
console.log('confirm+wide: signal days', perDay.length, 'avg picks/day', mean(perDay).toFixed(1), 'max', Math.max(...perDay));
// per-year stability
const yr = {};
cf.forEach(s => { const y = s.day.slice(0, 4); (yr[y] = yr[y] || []).push(s.rw); });
Object.entries(yr).sort().forEach(([y, a]) => console.log('  confirm+wide', y, 'n', a.length, 'avgNet', p(mean(a))));
const yr2 = {};
ACT.forEach(s => { const y = s.day.slice(0, 4); (yr2[y] = yr2[y] || []).push(s.rw); });
Object.entries(yr2).sort().forEach(([y, a]) => console.log('  ACT wide     ', y, 'n', a.length, 'avgNet', p(mean(a))));

// today's picks
const api = loadEngine(), uni = universe(api);
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']));
const idx = px['^JKSE'], cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const rows = [];
for (const u of uni) {
  const b = px[u.ticker + '.JK']; if (!b) continue;
  const n = b.c.length, lo = Math.max(0, n - 270);
  const w = { d: b.d.slice(lo), o: b.o.slice(lo), h: b.h.slice(lo), l: b.l.slice(lo), c: b.c.slice(lo), v: b.v.slice(lo) };
  const a = api.analyse_(w, idx.c.slice(-270), cfg); if (!a || a.avgValue / 1e9 < 5) continue;
  const sc = api.score_(a, 0), m = w.c.length;
  const confirm = w.c[m - 1] > w.h[m - 2] || (w.c[m - 1] > w.o[m - 1] && w.c[m - 1] > w.c[m - 2]);
  rows.push({ t: u.ticker, sec: u.sector, sc, confirm, close: a.close, stop: a.stop, wide: api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down'), tgt: a.target, rsi: a.rsi });
}
const date = px['BBCA.JK'].d.at(-1).toISOString().slice(0, 10);
console.log('\nlatest bar', date, '| ACT now:', rows.filter(r => r.sc >= 65).length, '| ACT + confirm:', rows.filter(r => r.sc >= 65 && r.confirm).length);
rows.filter(r => r.sc >= 65).sort((a, b) => b.sc - a.sc).forEach(r => console.log(' ', r.t.padEnd(6), r.sec.padEnd(12), 'score', r.sc, r.confirm ? 'CONFIRMED' : 'waiting  ', 'close', Math.round(r.close), 'stop', r.stop, '->wide', r.wide, 'tgt', r.tgt, 'RSI', r.rsi.toFixed(0)));

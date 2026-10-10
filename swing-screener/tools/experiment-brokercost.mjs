// Does a bounce work better near the big buyers' cost? (tools/broker-cost.mjs). Data: one year of NeoBDM broker
// inventory for the tested 100 (data/nb-inventory.json), read point-in-time at every session from the 60th.
//
// PRE-REGISTERED 2026-10-10, written and committed before data/nb-inventory.json existed:
//   Trades: ACT signals (score >= 65, liquidity >= Rp 5 B/day), every session, the live trade (next open, wide 3.5-ATR
//   stop, +8%, 15 sessions, 0.4% fees). Episodes: one signal per stock per 15 sessions.
//   H1 PRIMARY  "supported" (top-3 accumulators since the 60-session volume peak hold >= 5% of the lots traded since,
//       are not unloading, and the price is within +-5% of their average buy price) (A) vs all other ACT signals (B).
//       PASS = episode Welch t >= 2 AND by-day t >= 2 AND gap > 0 on the 73 unseen stocks AND gap > 0 in both halves
//       (split at the middle signal date). One year is short: a fail here may be lack of data, not proof of no effect.
//   H2 secondary (t >= 2.5): price more than 5% BELOW the accumulators' cost ("big buyers underwater") vs within or above.
//   H3 secondary (t >= 2.5): among signals with accumulation (>= 5%), accumulators unloading vs not unloading (B better?
//       tested as not-unloading (A) vs unloading (B)).
//   Descriptive: concentration (one broker / a few / broad) and the all-stock rank IC of the gap vs next 5 sessions.
//   Whatever the result, the cost line never changes a badge from this one-year test; a pass makes it a highlighted
//   conviction check and starts a forward record.
//   Known bias: each stock's broker list is its 20 most active by GROSS value over the whole year (not by net), so the
//   list itself has mild look-ahead; the cost reads only use data up to the signal day.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, expansionTickers } from './lib.mjs';
import { costRead, supported } from './broker-cost.mjs';

const INV = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-inventory.json'), 'utf8'));
const api = loadEngine(), NEW = expansionTickers(), uni = universe(api).filter(u => !NEW.has(u.ticker) && INV[u.ticker]);
const DESIGN = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'design-universe.json'), 'utf8')));
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const FEE = 0.004, WINDOW = 270, iso = d => d.toISOString().slice(0, 10);
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '5y', process.env.REFRESH !== '1');
const idx = px['^JKSE'], idxBy = new Map(idx.d.map((d, i) => [iso(d), i]));
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sdv = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const pc = x => (x == null || Number.isNaN(x) ? 'n/a' : (x * 100).toFixed(2) + '%'), f2 = x => (x == null || Number.isNaN(x) ? 'n/a' : x.toFixed(2));
function sim(b, i0, stop, target) {
  const j0 = i0 + 1, last = j0 + 14; if (last >= b.c.length) return null;
  const entry = b.o[j0];
  for (let j = j0; j <= last; j++) {
    if (b.l[j] <= stop) return Math.min(stop, b.o[j]) / entry - 1 - FEE;
    if (b.h[j] >= target) return Math.max(target, b.o[j]) / entry - 1 - FEE;
  }
  return b.c[last] / entry - 1 - FEE;
}
const S = [], IC = {};
for (const u of uni) {
  const b = px[u.ticker + '.JK'], rec = INV[u.ticker]; if (!b || !rec) continue;
  const bi = new Map(b.d.map((d, i) => [iso(d), i]));
  for (let k = 60; k < rec.d.length; k++) {
    const day = rec.d[k], t = bi.get(day), ii = idxBy.get(day); if (t == null || t < 250 || ii == null) continue;
    const cr = costRead(rec, k); if (!cr || cr.none) continue;
    if (t + 6 < b.c.length) (IC[day] = IC[day] || []).push([cr.gap, b.c[t + 5] / b.o[t + 1] - 1]);
    const lo = Math.max(0, t + 1 - WINDOW);
    const w = { d: b.d.slice(lo, t + 1), o: b.o.slice(lo, t + 1), h: b.h.slice(lo, t + 1), l: b.l.slice(lo, t + 1), c: b.c.slice(lo, t + 1), v: b.v.slice(lo, t + 1) };
    const a = api.analyse_(w, idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
    if (!a || a.avgValue / 1e9 < 5 || a.stop >= a.entry) continue;
    if (api.score_(a, 0) < api.ACT_SCORE) continue;
    const ret = sim(b, t, api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down'), a.target); if (ret == null) continue;
    S.push({ tk: u.ticker, day, ret, design: DESIGN.has(u.ticker), cr, sup: supported(cr) });
  }
}
const days = [...new Set(S.map(s => s.day))].sort(), di = new Map(days.map((d, i) => [d, i])), MID = days[Math.floor(days.length / 2)];
console.log(`ACT signal-days with a cost read: ${S.length} (${days[0]}..${days.at(-1)}), supported ${S.filter(s => s.sup).length}`);
const episodes = L => { const by = {}, ep = []; L.forEach(s => { (by[s.tk] = by[s.tk] || []).push(s); }); Object.values(by).forEach(l => { l.sort((a, b) => a.day.localeCompare(b.day)); let last = -1e9; l.forEach(s => { const i = di.get(s.day); if (i - last >= 15) { ep.push(s); last = i; } }); }); return ep; };
const welch = (a, b) => (a.length < 6 || b.length < 6 ? { gap: a.length && b.length ? mean(a) - mean(b) : null, t: null, na: a.length, nb: b.length, ma: a.length ? mean(a) : null, mb: b.length ? mean(b) : null } : { gap: mean(a) - mean(b), t: (mean(a) - mean(b)) / Math.sqrt(sdv(a) ** 2 / a.length + sdv(b) ** 2 / b.length), ma: mean(a), mb: mean(b), na: a.length, nb: b.length });
const results = [];
function test(id, name, bar, L, inA, inB) {
  const v = s => s.ret, ep = episodes(L), e = welch(ep.filter(inA).map(v), ep.filter(inB).map(v));
  const by = {}; L.forEach(s => { (by[s.day] = by[s.day] || []).push(s); });
  const g = Object.values(by).map(l => { const a = l.filter(inA), b = l.filter(inB); return a.length && b.length ? mean(a.map(v)) - mean(b.map(v)) : null; }).filter(x => x != null);
  const tDay = g.length > 5 ? mean(g) / (sdv(g) / Math.sqrt(g.length)) : null;
  const un = welch(L.filter(s => !s.design && inA(s)).map(v), L.filter(s => !s.design && inB(s)).map(v));
  const h1 = welch(L.filter(s => s.day < MID && inA(s)).map(v), L.filter(s => s.day < MID && inB(s)).map(v));
  const h2 = welch(L.filter(s => s.day >= MID && inA(s)).map(v), L.filter(s => s.day >= MID && inB(s)).map(v));
  const pass = e.t != null && tDay != null && e.t >= bar && tDay >= bar && un.gap > 0 && h1.gap > 0 && h2.gap > 0;
  console.log(`\n${id} ${name}\n  episodes A ${e.na} ${pc(e.ma)} vs B ${e.nb} ${pc(e.mb)}: gap ${pc(e.gap)} t=${f2(e.t)} | by day ${pc(mean(g))} t=${f2(tDay)} (${g.length} d) | unseen ${pc(un.gap)} | halves ${pc(h1.gap)} / ${pc(h2.gap)} -> ${pass ? 'PASS' : 'fail'} (bar ${bar})`);
  results.push({ id, name, bar, pass, nA: e.na, nB: e.nb, avgA: e.ma, avgB: e.mb, gap: e.gap, t: e.t, gapDay: mean(g), tDay, unseen: un.gap, h1: h1.gap, h2: h2.gap });
}
test('H1', 'near a holding accumulator\'s cost (A) vs all other ACT (B)  [PRIMARY]', 2, S, s => s.sup, s => !s.sup);
test('H2', 'price > 5% below the accumulators\' cost (A) vs within or above (B)', 2.5, S, s => s.cr.gap < -0.05, s => s.cr.gap >= -0.05);
const ACC = S.filter(s => s.cr.netShare >= 0.05);
test('H3', 'accumulators not unloading (A) vs unloading (B), accumulation >= 5%', 2.5, ACC, s => s.cr.status !== 'unloading', s => s.cr.status === 'unloading');
const byConc = Object.fromEntries(['one broker', 'a few brokers', 'broad'].map(c => { const l = episodes(S.filter(s => s.cr.conc === c)); return [c, { n: l.length, avg: l.length ? mean(l.map(s => s.ret)) : null }]; }));
console.log('\n  descriptive, by concentration (episodes):', Object.entries(byConc).map(([k, v]) => `${k} ${v.n} ${pc(v.avg)}`).join(' | '));
const rk = a => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = []; o.forEach(([, i], k) => { r[i] = k; }); return r; };
const corr = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, a = 0, b = 0; for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); a += (x[i] - mx) ** 2; b += (y[i] - my) ** 2; } return a && b ? n / Math.sqrt(a * b) : 0; };
const icDays = Object.keys(IC).sort().filter((_, i) => i % 5 === 0), ics = icDays.map(d => IC[d]).filter(p => p.length >= 20).map(p => { const m = mean(p.map(x => x[1])); return corr(rk(p.map(x => x[0])), rk(p.map(x => x[1] - m))); });
const icT = ics.length > 3 ? mean(ics) / (sdv(ics) / Math.sqrt(ics.length)) : null;
console.log(`  descriptive, all stocks: rank IC of (price vs cost) with the next 5 sessions ${f2(mean(ics))} (t ${f2(icT)}, ${ics.length} non-overlapping sessions)`);
fs.writeFileSync(path.join(ROOT, 'data', 'brokercost-study.json'), JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), from: days[0], to: days.at(-1), signals: S.length, supported: S.filter(s => s.sup).length, results, byConc, ic: { mean: mean(ics), t: icT, n: ics.length } }));
console.log('\nwrote data/brokercost-study.json');

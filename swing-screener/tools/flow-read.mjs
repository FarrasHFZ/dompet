// "Who moves this stock": a daily per-stock read from NeoBDM history (local, paid) + Yahoo prices, published as derived
// labels only (data/flow-read.json, committed) and logged for a forward test (data/flow-read-history/<date>.json).
//   fcorr   correlation over 120 sessions between the day's foreign net (NeoBDM foreign group, % of traded value) and the
//           day's return: how much foreigners move the price. Top third of liquid stocks = "foreign-driven".
//   f20     foreign net over the last 20 sessions as % of traded value; ranked into thirds among foreign-driven stocks.
//   retail  retail share of trading over 20 sessions (NeoBDM participation bars, 1 - pi).
// Evidence (tools/experiment-flow2.mjs, experiment-foreign-rep.mjs): foreign buying inside foreign-driven stocks pointed
// the right way three times (+1.34% / +2.62% per 20 sessions) but never passed (p 0.096, 0.113). Retail-heavy stocks did
// NOT do worse. So these are context; the forward test below decides.
// FORWARD TEST (pre-registered 2026-10-10, before any forward data): on dates 20 sessions apart from the first logged
// day, top-minus-bottom third of f20 inside foreign-driven stocks, next-open to open 20 sessions later, harness
// tools/study-lib.mjs. PROMOTE to a "convinced" confirmation only with >= 12 forward dates AND passes() (p < 0.05,
// t >= 2, both halves positive). Until then, nothing here changes a badge.
// Usage: node tools/flow-read.mjs            (writes the read + today's ledger; needs data/nb-history.json)
//        node tools/flow-read.mjs --score    (also scores the forward test into data/flow-read-forward.json)
import fs from 'node:fs';
import path from 'node:path';
import { loadPrices, ROOT, loadEngine, universe } from './lib.mjs';
import { terciles, passes, mean } from './study-lib.mjs';

const W = 120, iso = d => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
const U = universe(loadEngine()).map(u => u.ticker);
const nb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-history.json'), 'utf8'));
const px = await loadPrices(U.map(t => t + '.JK'), '2y', process.env.USE_CACHE === '1');
const corr = (a, b) => { const p = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x != null && y != null && isFinite(x) && isFinite(y)); if (p.length < 80) return null; const mx = mean(p.map(q => q[0])), my = mean(p.map(q => q[1])); let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of p) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; } return sxy / Math.sqrt(sxx * syy || 1); };

const rows = [], spikeBy = {};
for (const t of U) {
  const g = nb[t] && nb[t].g, b = px[t + '.JK']; if (!g || !g.f || !b || g.d.length < W + 2) continue;
  const bi = new Map(b.d.map((d, i) => [iso(d), i]));
  // Volume spikes over the chart window (tools/experiment-volume.mjs): volume >= 4x the 60-session median, value >= Rp 5 B.
  // Published per spike: date, candle type, volume multiple, and the SIGN of foreign / bandar net that day (NeoBDM).
  const gi = new Map(g.d.map((d, i) => [d, i])), sps = [];
  for (let k = Math.max(61, b.c.length - 500); k < b.c.length; k++) {
    const med = b.v.slice(k - 60, k).slice().sort((x, y) => x - y)[30]; if (!(med > 0) || b.v[k] < 4 * med || b.c[k] * b.v[k] < 5e9) continue;
    const r = b.c[k] / b.c[k - 1] - 1, clv = b.h[k] > b.l[k] ? (b.c[k] - b.l[k]) / (b.h[k] - b.l[k]) : 0.5;
    const type = r >= 0.04 && clv >= 0.6 ? 'UP' : r <= -0.04 && clv <= 0.4 ? 'DOWN' : b.l[k] <= b.c[k - 1] * 0.96 && clv >= 0.6 && r > -0.04 ? 'ABSORB' : Math.abs(r) < 0.02 ? 'CHURN' : 'OTHER';
    const q = gi.get(iso(b.d[k])), side = key => (q > 0 && g[key] && g[key][q] != null && g[key][q - 1] != null ? Math.sign(g[key][q] - g[key][q - 1]) : null);
    sps.push([iso(b.d[k]), type, +(b.v[k] / med).toFixed(1), side('f'), side('m')]);
  }
  spikeBy[t] = sps;
  const net = [], ret = [], val = [], raw = [];
  for (let j = 1; j < g.d.length; j++) {
    const k = bi.get(g.d[j]); if (k == null || k < 1) continue;
    const v = b.c[k] * b.v[k], n = g.f[j] != null && g.f[j - 1] != null ? (g.f[j] - g.f[j - 1]) * 1e9 : null;
    net.push(v && n != null ? n / v : null); ret.push(b.c[k] / b.c[k - 1] - 1); val.push(v); raw.push(n || 0);
  }
  if (net.length < W) continue;
  const fcorr = corr(net.slice(-W), ret.slice(-W)); if (fcorr == null) continue;
  const v20 = val.slice(-20).reduce((s, x) => s + x, 0);
  const pi = g.pi ? g.pi.slice(-20).filter(x => x != null) : [];
  // accumulation over the last 40 sessions (tools/experiment-base.mjs): group net buying >= 2% of traded value
  const v40 = val.slice(-40).reduce((s, x) => s + x, 0), acc = key => { const a = g[key]; if (!a || a.length < 41 || a.at(-1) == null || a.at(-41) == null || !v40) return null; return (a.at(-1) - a.at(-41)) * 1e9 / v40 >= 0.02; };
  rows.push({ ab: acc('m'), af: acc('f'), t, asOf: g.d.at(-1), fcorr, f20: v20 ? raw.slice(-20).reduce((s, x) => s + x, 0) / v20 : 0, retail: pi.length >= 15 ? 1 - mean(pi) : null, liquid: v20 / 20 >= 5e9 });
}
// thirds among liquid stocks
const liq = rows.filter(r => r.liquid);
const cut = (arr, f) => { const s = arr.map(f).filter(x => x != null).sort((a, b) => a - b); return [s[Math.floor(s.length / 3)], s[Math.floor(2 * s.length / 3)]]; };
const ter = (x, c) => (x == null ? null : x < c[0] ? 1 : x < c[1] ? 2 : 3);
const cf = cut(liq, r => r.fcorr), cr = cut(liq, r => r.retail);
rows.forEach(r => { r.fcorrT = ter(r.fcorr, cf); r.retailT = ter(r.retail, cr); });
const driven = liq.filter(r => r.fcorrT === 3), cb = cut(driven, r => r.f20);
rows.forEach(r => { r.f20T = r.fcorrT === 3 && r.liquid ? ter(r.f20, cb) : null; });
const asOf = rows.map(r => r.asOf).sort().at(-1);
const out = { asOf, built: new Date().toISOString(), cuts: { fcorr: cf.map(x => +x.toFixed(2)) }, by: {} };
// retail share to the nearest 5%: NeoBDM is paid data, only coarse reads are published
for (const r of rows) out.by[r.t] = { d: r.asOf, fc: +r.fcorr.toFixed(2), fcT: r.fcorrT, fb: r.f20 > 0.005 ? 'buy' : r.f20 < -0.005 ? 'sell' : 'flat', fbT: r.f20T, rs: r.retail == null ? null : Math.round(r.retail * 20) * 5, rsT: r.retailT, liq: r.liquid, ab: r.ab, af: r.af, sp: spikeBy[r.t] || [] };
fs.writeFileSync(path.join(ROOT, 'data', 'flow-read.json'), JSON.stringify(out));
const histDir = path.join(ROOT, 'data', 'flow-read-history');
fs.mkdirSync(histDir, { recursive: true });
// ledger: [ticker, fcorr third, percentile rank of f20 among foreign-driven stocks] (ranks only, no NeoBDM values)
const drvToday = rows.filter(r => r.liquid && r.asOf === asOf && r.fcorrT === 3).sort((a, b) => a.f20 - b.f20);
const rk = new Map(drvToday.map((r, i) => [r.t, +(i / Math.max(1, drvToday.length - 1)).toFixed(3)]));
fs.writeFileSync(path.join(histDir, `${asOf}.json`), JSON.stringify(rows.filter(r => r.liquid && r.asOf === asOf).map(r => [r.t, r.fcorrT, rk.has(r.t) ? rk.get(r.t) : null])));
const vsDir = path.join(ROOT, 'data', 'volume-spike-history'); fs.mkdirSync(vsDir, { recursive: true });
const todaySp = rows.filter(r => r.liquid).map(r => [r.t, (spikeBy[r.t] || []).find(s => s[0] === asOf)]).filter(([, s]) => s && s[3] != null).map(([t, s]) => [t, s[3], s[1]]);
fs.writeFileSync(path.join(vsDir, `${asOf}.json`), JSON.stringify(todaySp));
console.log(`volume spikes ${asOf}: ${todaySp.length} (foreign buying on ${todaySp.filter(x => x[1] > 0).length})`);
console.log(`flow-read ${asOf}: ${rows.length} stocks read, ${liq.length} liquid, ${driven.length} foreign-driven (fcorr >= ${cf[1].toFixed(2)}), ${rows.filter(r => r.f20T === 3).length} of them with top-third foreign buying`);

if (process.argv.includes('--score')) {
  const files = fs.readdirSync(histDir).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
  const pxs = await loadPrices(U.map(t => t + '.JK').concat(['^JKSE']), '2y', true);
  const days = pxs['^JKSE'].d.map(iso), first = files[0] && files[0].slice(0, 10);
  const grid = first ? days.filter(d => d >= first).filter((d, i) => i % 20 === 0) : [];
  const samples = [];
  for (const day of grid) {
    const f = path.join(histDir, `${day}.json`); if (!fs.existsSync(f)) continue;
    for (const [t, fcT, f20] of JSON.parse(fs.readFileSync(f, 'utf8'))) {
      if (fcT !== 3) continue;
      const b = pxs[t + '.JK'], k = b && b.d.findIndex(d => iso(d) === day); if (k == null || k < 0 || k + 21 >= b.c.length) continue;
      samples.push({ date: day, tk: t, sig: f20, fwd: b.o[k + 21] / b.o[k + 1] - 1 });
    }
  }
  const dates = [...new Set(samples.map(s => s.date))].sort();
  const r = dates.length ? terciles(samples, { split: dates[dates.length >> 1], dir: 1, minN: 6 }) : null;
  const res = { asOf: new Date().toISOString().slice(0, 10), from: first, dates: dates.length, needed: 12, result: r, promote: !!(r && dates.length >= 12 && passes(r, 1)) };
  fs.writeFileSync(path.join(ROOT, 'data', 'flow-read-forward.json'), JSON.stringify(res));
  console.log(`forward test: ${dates.length} of 12 scored dates${r ? `, spread ${(r.spread * 100).toFixed(2)}%, t ${r.t.toFixed(2)}, p ${r.p.toFixed(3)}` : ''} -> ${res.promote ? 'PROMOTE' : 'not yet'}`);
}

// FORWARD TEST of foreign-backed volume spikes (tools/experiment-volume*.mjs): passed 2024-26 on NeoBDM (t 2.96) and
// IDX data agrees for 2024-26, but it failed on 2022-24 and is carried by its best 5% of trades. PRE-REGISTERED
// 2026-10-10 before any forward data: spikes logged from 2026-10-12; outcome next open -> open 10 sessions later minus
// the same-day average of liquid stocks. PROMOTE to an ACT setup only with >= 100 foreign-buy spikes, buy-minus-sell gap
// with Welch t >= 2, positive in both halves, and still positive without the best 5% of buy outcomes.
if (process.argv.includes('--score')) {
  const { welchT } = { welchT: (a, b) => { const g = mean(a) - mean(b), s = x => Math.sqrt(mean(x.map(y => (y - mean(x)) ** 2))); const se = Math.sqrt(s(a) ** 2 / (a.length || 1) + s(b) ** 2 / (b.length || 1)); return se ? g / se : 0; } };
  const vsDir = path.join(ROOT, 'data', 'volume-spike-history'), FROM = '2026-10-12';
  const files = fs.readdirSync(vsDir).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f) && f.slice(0, 10) >= FROM).sort();
  const pv = await loadPrices(U.map(t => t + '.JK'), '2y', true), ev = [];
  for (const f of files) {
    const day = f.slice(0, 10), fw = t => { const b = pv[t + '.JK']; if (!b) return null; const k = b.d.findIndex(d => iso(d) === day); return k < 0 || k + 11 >= b.c.length ? null : b.o[k + 11] / b.o[k + 1] - 1; };
    const all = U.map(fw).filter(x => x != null); if (all.length < 50) continue; const m = mean(all);
    for (const [t, side] of JSON.parse(fs.readFileSync(path.join(vsDir, f), 'utf8'))) { const x = fw(t); if (x != null) ev.push({ day, side, ex: x - m }); }
  }
  const B = ev.filter(e => e.side > 0).map(e => e.ex), S = ev.filter(e => e.side <= 0).map(e => e.ex);
  const mid = ev.map(e => e.day).sort()[ev.length >> 1], hg = f => { const x = ev.filter(f); return mean(x.filter(e => e.side > 0).map(e => e.ex)) - mean(x.filter(e => e.side <= 0).map(e => e.ex)); };
  const trimmed = mean(B.slice().sort((a, b) => a - b).slice(0, Math.floor(B.length * 0.95))) - mean(S);
  const r = { asOf: new Date().toISOString().slice(0, 10), from: FROM, buy: B.length, sell: S.length, needed: 100, gap: mean(B) - mean(S), t: welchT(B, S), h1: hg(e => e.day < mid), h2: hg(e => e.day >= mid), trimmed };
  r.promote = B.length >= 100 && r.t >= 2 && r.h1 > 0 && r.h2 > 0 && trimmed > 0;
  fs.writeFileSync(path.join(ROOT, 'data', 'volume-forward.json'), JSON.stringify(r));
  console.log(`volume-spike forward test: ${B.length} of 100 foreign-buy spikes resolved${B.length ? `, gap ${(r.gap * 100).toFixed(2)}% (t ${r.t.toFixed(2)})` : ''} -> ${r.promote ? 'PROMOTE' : 'not yet'}`);
}

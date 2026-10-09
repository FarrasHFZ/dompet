// EXPLORATORY (not a test, no decision): looked at AFTER tools/experiment-nb.mjs, because its descriptive table showed
// 5-session Bandar net buying ranking BELOW-average next-5-session returns (and retail buying above). Question: is that
// just short-term price reversal (flow follows price; price mean-reverts), or does flow add something beyond price?
// Method: every 5th session, cross-sectional rank IC of each group's 5-session share vs next-5-session excess return,
// raw and after removing the 5-session price change (rank residual). Any rule that comes out of this must be forward-tested
// (see the contrarian hypothesis in tools/flow-forward.mjs), never adopted from this replay.
import fs from 'node:fs';
import path from 'node:path';
import { universe, loadEngine, loadPrices, ROOT } from './lib.mjs';

const NB = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-history.json'), 'utf8'));
const DESIGN = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'design-universe.json'), 'utf8')));
const uni = universe(loadEngine());
const px = await loadPrices(uni.map(u => u.ticker + '.JK'), '5y', true);
const iso = d => d.toISOString().slice(0, 10), FEE = 0.004, SPLIT = '2025-10-01';
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sdv = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const rk = a => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = []; o.forEach(([, i], k) => { r[i] = k / (a.length - 1) - 0.5; }); return r; };
const corr = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, a = 0, b = 0; for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); a += (x[i] - mx) ** 2; b += (y[i] - my) ** 2; } return a && b ? n / Math.sqrt(a * b) : 0; };
const resid = (y, x) => { const mx = mean(x), my = mean(y); let n = 0, d = 0; for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); d += (x[i] - mx) ** 2; } const b = d ? n / d : 0; return y.map((v, i) => v - my - b * (x[i] - mx)); };

const tks = Object.keys(NB).filter(tk => NB[tk].g && px[tk + '.JK']);
const pi = Object.fromEntries(tks.map(tk => [tk, new Map(px[tk + '.JK'].d.map((d, i) => [iso(d), i]))]));
const tv = Object.fromEntries(tks.map(tk => { const b = px[tk + '.JK']; return [tk, b.c.map((c, i) => c * b.v[i] / 1e9)]; }));
const gi = Object.fromEntries(tks.map(tk => [tk, new Map(NB[tk].g.d.map((d, i) => [d, i]))]));
const days = [...new Set(tks.flatMap(tk => NB[tk].g.d))].sort().slice(25).filter((_, i) => i % 5 === 0);
const share = (tk, g, day, w) => { const k = gi[tk].get(day), t = pi[tk].get(day), a = NB[tk].g[g]; if (k == null || t == null || k < w || t < w || !a || a[k] == null || a[k - w] == null) return null; let s = 0; for (let j = t - w + 1; j <= t; j++) s += tv[tk][j]; return s ? (a[k] - a[k - w]) / s : null; };

console.log(`EXPLORATORY: ${tks.length} stocks, ${days.length} non-overlapping sessions`);
const out = {};
for (const g of ['m', 'nr', 'i', 's', 'f', 'z']) {
  const raw = [], part = [], h = { a: [], b: [] }, un = [];
  for (const day of days) {
    const pts = tks.map(tk => { const b = px[tk + '.JK'], t = pi[tk].get(day); if (t == null || t < 5 || t + 5 >= b.c.length) return null; const f = share(tk, g, day, 5); if (f == null) return null; return { tk, f, c5: b.c[t] / b.c[t - 5] - 1, r: b.c[t + 5] / b.o[t + 1] - 1 - FEE }; }).filter(Boolean);
    if (pts.length < 20) continue;
    const rf = rk(pts.map(p => p.f)), rc = rk(pts.map(p => p.c5)), rr = rk(pts.map(p => p.r));
    const ic = corr(rf, rr), pic = corr(resid(rf, rc), resid(rr, rc));
    raw.push(ic); part.push(pic); (day < SPLIT ? h.a : h.b).push(pic);
    const u = pts.map((p, i) => [p, i]).filter(([p]) => !DESIGN.has(p.tk)).map(([, i]) => i);
    if (u.length > 15) un.push(corr(resid(u.map(i => rf[i]), u.map(i => rc[i])), resid(u.map(i => rr[i]), u.map(i => rc[i]))));
  }
  const t = v => mean(v) / (sdv(v) / Math.sqrt(v.length));
  out[g] = { ic: mean(raw), t: t(raw), partial: mean(part), tPartial: t(part), h1: mean(h.a), h2: mean(h.b), unseen: mean(un), n: raw.length };
  console.log(`  ${g.padEnd(3)} raw IC ${mean(raw).toFixed(3)} (t ${t(raw).toFixed(2)}) | beyond 5-day price change: ${mean(part).toFixed(3)} (t ${t(part).toFixed(2)}), halves ${mean(h.a).toFixed(3)} / ${mean(h.b).toFixed(3)}, unseen ${mean(un).toFixed(3)}`);
}
// price reversal on its own, for comparison
{
  const v = [];
  for (const day of days) {
    const pts = tks.map(tk => { const b = px[tk + '.JK'], t = pi[tk].get(day); if (t == null || t < 5 || t + 5 >= b.c.length) return null; return [b.c[t] / b.c[t - 5] - 1, b.c[t + 5] / b.o[t + 1] - 1]; }).filter(Boolean);
    if (pts.length >= 20) v.push(corr(rk(pts.map(p => p[0])), rk(pts.map(p => p[1]))));
  }
  out.price5 = { ic: mean(v), t: mean(v) / (sdv(v) / Math.sqrt(v.length)) };
  console.log(`  5-day price change itself: IC ${mean(v).toFixed(3)} (t ${out.price5.t.toFixed(2)})`);
}
const f = path.join(ROOT, 'data', 'nb-study.json'), st = JSON.parse(fs.readFileSync(f, 'utf8'));
st.explore = out; fs.writeFileSync(f, JSON.stringify(st));
console.log('added "explore" to data/nb-study.json');

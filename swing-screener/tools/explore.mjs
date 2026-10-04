// Feature scan: which simple signals actually relate to the next-15-day return on IDX large caps?
// Reports monthly cross-sectional Spearman IC with t-stat, split in-sample / out-of-sample.
import { loadEngine, universe, loadPrices } from './lib.mjs';
const api = loadEngine();
const uni = universe(api);
const H = +(process.env.HORIZON || 15), STEP = 2, WARM = 260, SPLIT = new Date('2024-10-01');
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']));
const idx = px['^JKSE'];
const idxBy = new Map(idx.d.map((d, i) => [d.toISOString().slice(0, 10), i]));
const mean = xs => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const rank = xs => { const o = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length); let i = 0; while (i < o.length) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const pearson = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, dx = 0, dy = 0; for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; } return n / Math.sqrt(dx * dy || 1); };
const spearman = (x, y) => pearson(rank(x), rank(y));

const S = [];
for (const u of uni) {
  const b = px[u.ticker + '.JK'];
  if (!b) continue;
  const atrS = api.atrSeries_(b, 14);
  for (let t = WARM; t < b.c.length - H - 1; t += STEP) {
    const c = b.c, close = c[t];
    const ii = idxBy.get(b.d[t].toISOString().slice(0, 10));
    if (ii === undefined || ii < 130 || ii + H >= idx.c.length) continue;
    let val = 0; for (let i = t - 19; i <= t; i++) val += c[i] * b.v[i];
    if (val / 20 / 1e9 < 5) continue;
    const s20 = api.sma_(c, 20, t), s50 = api.sma_(c, 50, t), s200 = api.sma_(c, 200, t);
    const rsi = api.rsi_(c.slice(t - 120, t + 1), 14);
    const atr = atrS[t];
    const hi252 = Math.max(...b.h.slice(t - 251, t + 1)), hi20 = Math.max(...b.h.slice(t - 19, t + 1));
    const f = {
      rsi14: rsi,
      ret1: close / c[t - 1] - 1, ret5: close / c[t - 5] - 1, ret20: close / c[t - 20] - 1, ret60: close / c[t - 60] - 1,
      mom12_1: c[t - 21] / c[t - 252] - 1,
      dist_sma20_atr: (close - s20) / atr, dist_sma50_atr: (close - s50) / atr, dist_sma200: close / s200 - 1,
      off_high52: close / hi252 - 1, off_high20: close / hi20 - 1,
      atr_pct: atr / close, vol_ratio: b.v[t] / api.sma_(b.v, 20, t),
      rs60: (close / c[t - 60] - 1) - (idx.c[ii] / idx.c[ii - 60] - 1),
      log_value: Math.log(val / 20),
    };
    const fwd = c[t + H] / close - 1, fwdEx = fwd - (idx.c[ii + H] / idx.c[ii] - 1);
    S.push({ date: b.d[t], f, fwd, fwdEx });
  }
}
function ic(rows, key, tgt) {
  const by = {};
  rows.forEach(s => { const k = s.date.toISOString().slice(0, 7); (by[k] = by[k] || []).push(s); });
  const ics = Object.values(by).filter(g => g.length >= 12).map(g => spearman(g.map(s => s.f[key]), g.map(s => s[tgt])));
  const m = mean(ics), sd = Math.sqrt(mean(ics.map(x => (x - m) ** 2)));
  return { m, t: m / (sd / Math.sqrt(ics.length) || 1), n: ics.length };
}
const tr = S.filter(s => s.date < SPLIT), te = S.filter(s => s.date >= SPLIT);
console.log(`${S.length} samples. IC vs fwd${H}d return (raw) and excess-vs-IHSG. in-sample | out-of-sample`);
console.log('feature            IS ic    t  |  OOS ic   t  | OOS excess ic  t');
Object.keys(S[0].f).forEach(k => {
  const a = ic(tr, k, 'fwd'), b = ic(te, k, 'fwd'), c = ic(te, k, 'fwdEx');
  console.log(`${k.padEnd(16)} ${a.m.toFixed(3).padStart(7)} ${a.t.toFixed(1).padStart(5)} | ${b.m.toFixed(3).padStart(7)} ${b.t.toFixed(1).padStart(5)} | ${c.m.toFixed(3).padStart(7)} ${c.t.toFixed(1).padStart(5)}`);
});

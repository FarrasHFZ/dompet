import { loadEngine, universe, loadPrices } from './lib.mjs';
const api = loadEngine(); const uni = universe(api);
const H = 15, STEP = 2, WARM = 260;
const px = await loadPrices(uni.map(u => u.ticker + '.JK'));
const mean = xs => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const S = [];
for (const u of uni) {
  const b = px[u.ticker + '.JK']; if (!b) continue;
  const atrS = api.atrSeries_(b, 14), c = b.c;
  for (let t = WARM; t < c.length - H - 1; t += STEP) {
    let val = 0; for (let i = t - 19; i <= t; i++) val += c[i] * b.v[i];
    if (val / 20 / 1e9 < 5) continue;
    const s20 = api.sma_(c, 20, t), s200 = api.sma_(c, 200, t), s50 = api.sma_(c, 50, t);
    S.push({ d: b.d[t], dist: (c[t] - s20) / atrS[t], rsi: api.rsi_(c.slice(t - 120, t + 1), 14), ret5: c[t] / c[t - 5] - 1,
      above200: c[t] > s200, up50: s50 > api.sma_(c, 50, t - 10), fwd: c[t + H] / c[t] - 1,
      win: (() => { const tg = c[t] * 1.08, st = c[t] - 1.5 * atrS[t]; for (let j = t + 1; j <= t + H; j++) { if (b.l[j] <= st) return 0; if (b.h[j] >= tg) return 1; } return 0; })() });
  }
}
function table(name, key, edges, filt, label) {
  console.log(`\n${name} ${label || ''}`);
  const rows = S.filter(filt || (() => true));
  for (let i = 0; i < edges.length - 1; i++) {
    const g = rows.filter(s => s[key] >= edges[i] && s[key] < edges[i + 1]);
    if (g.length < 30) continue;
    const og = g.filter(s => s.d >= new Date('2024-10-01'));
    console.log(`${String(edges[i]).padStart(6)}..${String(edges[i + 1]).padEnd(6)} n=${String(g.length).padStart(5)} fwd ${(mean(g.map(s => s.fwd)) * 100).toFixed(2).padStart(6)}%  hit ${(mean(g.map(s => s.win)) * 100).toFixed(1).padStart(5)}%  | OOS n=${String(og.length).padStart(4)} fwd ${(mean(og.map(s => s.fwd)) * 100).toFixed(2).padStart(6)}%`);
  }
}
table('dist from SMA20 in ATR', 'dist', [-99, -4, -3, -2, -1, 0, 1, 2, 3, 99]);
table('RSI14', 'rsi', [0, 25, 30, 35, 40, 45, 50, 55, 60, 70, 101]);
table('ret5', 'ret5', [-1, -0.08, -0.05, -0.03, -0.01, 0.01, 0.03, 0.05, 1]);
table('dist from SMA20 in ATR, only above SMA200', 'dist', [-99, -3, -2, -1, 0, 1, 2, 99], s => s.above200);
table('dist from SMA20 in ATR, only BELOW SMA200', 'dist', [-99, -3, -2, -1, 0, 1, 2, 99], s => !s.above200);

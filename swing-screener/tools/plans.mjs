// Which exit plan fits the oversold-bounce signal? Net return per trade incl. 0.4% round-trip fees.
import { loadEngine, universe, loadPrices } from './lib.mjs';
const api = loadEngine(); const uni = universe(api);
const H = +(process.env.HORIZON || 15), FEE = 0.004, SPLIT = new Date('2024-10-01');
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']));
const idx = px['^JKSE']; const idxBy = new Map(idx.d.map((d, i) => [d.toISOString().slice(0, 10), i]));
const mean = xs => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const trades = [];
for (const u of uni) {
  const b = px[u.ticker + '.JK']; if (!b) continue;
  for (let t = 250; t < b.c.length - H - 1; t++) {
    const lo = Math.max(0, t - 269);
    const w = { d: b.d.slice(lo, t + 1), o: b.o.slice(lo, t + 1), h: b.h.slice(lo, t + 1), l: b.l.slice(lo, t + 1), c: b.c.slice(lo, t + 1), v: b.v.slice(lo, t + 1) };
    const a = api.analyse_(w, null, { targetPct: 8, stopMult: 1.5, horizon: H });
    if (!a || a.avgValue / 1e9 < 5) continue;
    const sc = api.score_(a, 0);
    if (sc < 60) continue;
    trades.push({ t, b, a, sc, date: b.d[t] });
  }
}
// de-cluster: at most one open trade per ticker (skip entries while the previous one is still open)
function run(label, plan) {
  const last = {}; const res = [];
  trades.forEach(tr => {
    const key = tr.b;
    if (last.get ? 0 : 0) {}
  });
  const lastEnd = new Map();
  trades.forEach(tr => {
    if ((lastEnd.get(tr.b) ?? -1) >= tr.t) return;
    const { b, a, t } = tr; const e = b.c[t];
    const { target, stop, maxHold } = plan(a);
    let exit = b.c[Math.min(t + maxHold, b.c.length - 1)], end = t + maxHold;
    for (let j = t + 1; j <= t + maxHold; j++) {
      if (b.l[j] <= stop) { exit = Math.min(stop, b.o[j]); end = j; break; }
      if (b.h[j] >= target) { exit = Math.max(target, b.o[j] > target ? b.o[j] : target); end = j; break; }
    }
    lastEnd.set(b, end);
    res.push({ date: tr.date, r: exit / e - 1 - FEE });
  });
  const f = (xs) => `n=${String(xs.length).padStart(4)} avg ${(mean(xs.map(x => x.r)) * 100).toFixed(2).padStart(5)}%  win ${(mean(xs.map(x => x.r > 0)) * 100).toFixed(0).padStart(2)}%`;
  console.log(`${label.padEnd(34)} ALL ${f(res)} | IS ${f(res.filter(x => x.date < SPLIT))} | OOS ${f(res.filter(x => x.date >= SPLIT))}`);
}
console.log(`score>=60 entries (one open trade per ticker), net of ${FEE * 100}% fees`);
run('+8% / 1.5 ATR stop / 15d', a => ({ target: a.entry * 1.08, stop: a.entry - 1.5 * a.atr, maxHold: 15 }));
run('+8% / plan stop (support) / 15d', a => ({ target: a.entry * 1.08, stop: a.stop, maxHold: 15 }));
run('SMA20 target / 1.5 ATR / 15d', a => ({ target: Math.max(a.sma20, a.entry * 1.02), stop: a.entry - 1.5 * a.atr, maxHold: 15 }));
run('SMA20 target / 2.5 ATR / 15d', a => ({ target: Math.max(a.sma20, a.entry * 1.02), stop: a.entry - 2.5 * a.atr, maxHold: 15 }));
run('SMA20 target / no stop / 15d', a => ({ target: Math.max(a.sma20, a.entry * 1.02), stop: 0, maxHold: 15 }));
run('+5% / 2 ATR / 10d', a => ({ target: a.entry * 1.05, stop: a.entry - 2 * a.atr, maxHold: 10 }));
run('time exit only 10d', a => ({ target: 1e9, stop: 0, maxHold: 10 }));
run('time exit only 15d', a => ({ target: 1e9, stop: 0, maxHold: 15 }));

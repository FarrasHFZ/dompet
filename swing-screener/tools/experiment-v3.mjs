// Experiment: do NeoBDM-inspired, Yahoo-computable inputs improve the ACT signal?
// Walk-forward over 5y x 100 stocks. Trades use the SAME rules as the live tracker (tracker.mjs resolveTrade):
// entry = next open, plan stop/target, 15 days, 0.4% fees. Compared against the rest of the universe on the same days.
// Features per signal day (all use data up to that day only):
//   confirm   close > prev high, or green candle closing above prev close   (bounce confirmation)
//   rvolSpike max volume / 20d-avg over last 3 days >= 1.5                  (capitulation volume)
//   rotImp    stock/IHSG ratio above its 5d-ago value but below its 50d mean (rotation "improving")
//   seasUp    this ticker's hit-rate in this calendar month, prior years >= 50% (n>=3)
//   wide      stop widened to 3.5 ATR when that is lower than the plan stop
//   notCalm   ATR% >= 1.5
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
import { resolveTrade, wilson } from './tracker.mjs';

const api = loadEngine(), uni = universe(api);
const DESIGN = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'design-universe.json'), 'utf8')));
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const STEP = +(process.env.STEP || 2), WARM = 250, WINDOW = 270, SPLIT = '2024-10-01';
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']));
const idx = px['^JKSE'];
const idxBy = new Map(idx.d.map((d, i) => [d.toISOString().slice(0, 10), i]));
const iso = d => d.toISOString().slice(0, 10);

// monthly closes per ticker for walk-forward seasonality
function monthly(b) {
  const m = new Map();
  b.d.forEach((d, i) => m.set(iso(d).slice(0, 7), { i, c: b.c[i] }));
  return [...m.entries()].map(([k, v]) => ({ k, ...v }));
}

const samples = [];
for (const u of uni) {
  const b = px[u.ticker + '.JK'];
  if (!b || b.c.length < WARM + 40) continue;
  const mo = monthly(b);
  for (let t = WARM; t < b.c.length - cfg.horizon - 2; t += STEP) {
    const lo = Math.max(0, t + 1 - WINDOW);
    const w = { d: b.d.slice(lo, t + 1), o: b.o.slice(lo, t + 1), h: b.h.slice(lo, t + 1), l: b.l.slice(lo, t + 1), c: b.c.slice(lo, t + 1), v: b.v.slice(lo, t + 1) };
    const day = iso(b.d[t]), ii = idxBy.get(day);
    if (ii === undefined || ii < 60) continue;
    const idxC = idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1);
    const a = api.analyse_(w, idxC, cfg);
    if (!a || a.avgValue / 1e9 < 5) continue;
    const score = api.score_(a, 0);
    if (a.stop >= a.entry) continue;

    const n = w.c.length;
    const confirm = w.c[n - 1] > w.h[n - 2] || (w.c[n - 1] > w.o[n - 1] && w.c[n - 1] > w.c[n - 2]);
    let mv = 0; const av20 = api.sma_(w.v, 20, n - 4) || 0;
    for (let k = 1; k <= 3; k++) mv = Math.max(mv, av20 ? w.v[n - k] / av20 : 0);
    const rvolSpike = mv >= 1.5;
    // rotation: ratio of stock to IHSG over the last 60 days
    const ratio = [];
    for (let k = 59; k >= 0; k--) { const j = ii - k; const sj = b.d[t - k] && idxBy.get(iso(b.d[t - k])); if (sj === undefined) { ratio.length = 0; break; } ratio.push(b.c[t - k] / idx.c[sj]); }
    let rotImp = false;
    if (ratio.length === 60) {
      const cur = ratio[59], ago = ratio[54], mean50 = ratio.slice(10).reduce((s, x) => s + x, 0) / 50;
      rotImp = cur > ago && cur < mean50;
    }
    // seasonality: prior years' return of this calendar month
    const mk = day.slice(5, 7), curK = day.slice(0, 7);
    const rets = [];
    mo.forEach((m, q) => { if (q > 0 && m.k.slice(5, 7) === mk && m.k < curK) rets.push(m.c / mo[q - 1].c - 1); });
    const seasUp = rets.length >= 3 ? rets.filter(x => x > 0).length / rets.length >= 0.5 : null;

    const wideStop = api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down');
    const mk_ = stop => resolveTrade({ ticker: u.ticker, score, action: 'ACT', setup: a.setup, stop, target: a.target }, day, b, cfg.horizon);
    const base = mk_(a.stop), wide = mk_(wideStop);
    if (!['win', 'loss', 'timeout'].includes(base.status)) continue;
    samples.push({
      tk: u.ticker, sector: u.sector, day, score, act: score >= api.ACT_SCORE, design: DESIGN.has(u.ticker),
      confirm, rvolSpike, rotImp, seasUp, notCalm: a.atrPct >= 0.015, rsi: a.rsi, base, wide,
    });
  }
}

const pc = x => (x == null ? '  n/a' : (x * 100).toFixed(1) + '%');
function stats(S, key = 'base') {
  const T = S.map(s => s[key]), n = T.length;
  if (!n) return { n: 0 };
  const w = T.filter(t => t.status === 'win').length, l = T.filter(t => t.status === 'loss').length;
  const rets = T.map(t => t.ret), avg = rets.reduce((s, x) => s + x, 0) / n;
  const g = rets.filter(r => r > 0).reduce((s, r) => s + r, 0), ls = -rets.filter(r => r < 0).reduce((s, r) => s + r, 0);
  const [lo, hi] = wilson(w, n);
  const early = T.filter(t => t.status === 'loss' && t.days <= 3).length;
  return { n, win: w / n, loss: l / n, ci: [lo, hi], avg, pf: ls ? g / ls : null, early3: l ? early / l : null, days: new Set(S.map(s => s.day)).size };
}
const fmt = (k, s) => console.log(String(k).padEnd(34), 'n', String(s.n).padStart(5), 'win', pc(s.win).padStart(6), `CI ${pc(s.ci?.[0])}-${pc(s.ci?.[1])}`.padEnd(17), 'avgNet', pc(s.avg).padStart(6), 'PF', s.pf ? s.pf.toFixed(2) : ' n/a', ' stop<=3d', pc(s.early3));

const ACT = samples.filter(s => s.act), CTRL = samples.filter(s => !s.act);
const variants = {
  'A  ACT baseline': s => true,
  'B  + confirm': s => s.confirm,
  'C  + rvol spike': s => s.rvolSpike,
  'D  + rotation improving': s => s.rotImp,
  'E  + seasonality up': s => s.seasUp === true,
  'F  + not calm (ATR%>=1.5)': s => s.notCalm,
  'G  confirm + rvol': s => s.confirm && s.rvolSpike,
  'H  confirm + rotation': s => s.confirm && s.rotImp,
  'I  confirm + rvol + rotation': s => s.confirm && s.rvolSpike && s.rotImp,
  'J  confirm + notCalm': s => s.confirm && s.notCalm,
};
function table(title, A, C) {
  console.log(`\n=== ${title} | ACT ${A.length} signals, control ${C.length} ===`);
  fmt('control (non-ACT)', stats(C));
  for (const [k, f] of Object.entries(variants)) fmt(k, stats(A.filter(f)));
  console.log('-- wide stop (3.5 ATR) on same signals');
  fmt('A  baseline, wide stop', stats(A, 'wide'));
  fmt('B  + confirm, wide stop', stats(A.filter(variants['B  + confirm']), 'wide'));
  fmt('control, wide stop', stats(C, 'wide'));
}
table('ALL 100 stocks, 5y', ACT, CTRL);
table('IN-SAMPLE design 27', ACT.filter(s => s.design), CTRL.filter(s => s.design));
table('OUT-OF-SAMPLE 73 unseen stocks', ACT.filter(s => !s.design), CTRL.filter(s => !s.design));
table(`LATER HALF (>= ${SPLIT}), all stocks`, ACT.filter(s => s.day >= SPLIT), CTRL.filter(s => s.day >= SPLIT));

// Composition: base ACT vs the best combo, by sector and top tickers.
const compo = (S, label) => {
  const by = (f) => { const m = {}; S.forEach(s => { m[f(s)] = (m[f(s)] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  console.log(`\n${label}: ${S.length} signals on ${new Set(S.map(s => s.day)).size} days`);
  console.log(' sectors:', by(s => s.sector).slice(0, 6).map(([k, v]) => `${k} ${(100 * v / S.length).toFixed(0)}%`).join(', '));
  console.log(' tickers:', by(s => s.tk).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(', '));
};
compo(ACT, 'ACT baseline'); compo(ACT.filter(variants['B  + confirm']), 'ACT + confirm'); compo(ACT.filter(variants['I  confirm + rvol + rotation']), 'ACT + confirm + rvol + rotation');

fs.writeFileSync(path.join(ROOT, 'data', 'cache', 'experiment_v3.json'), JSON.stringify(samples.map(s => ({ ...s, base: undefined, wide: undefined, r: s.base.ret, st: s.base.status, rw: s.wide.ret, stw: s.wide.status }))));

// Does the oversold-bounce edge hold on the 200 stocks added on 2026-10-10 (tools/expand-universe.mjs)? None of the
// screener's rules were designed or tuned on them, so they are a clean holdout.
//
// PRE-REGISTERED 2026-10-10, before the first run:
//   Trade = the live rule: score >= 65, bounce candle, entry next open, wide 3.5-ATR stop, +8% target, 15 sessions,
//   0.4% fees, liquidity >= Rp 5 B/day (the engine's own filter). Control = every other stock-day of the same stocks
//   (score < 65), same trade mechanics. Samples: every session, 5 years of Yahoo bars.
//   PASS (new stocks may trade like the original 100) if ALL hold on the NEW 200:
//     (a) one-trade-per-episode (15 sessions) live-rule average minus control average > 0 with Welch t >= 2
//     (b) by-day gap (live rule minus control, days that have both) > 0
//     (c) gap > 0 in both halves (split 2024-10-01)
//   Also reported, not decided on: the same on the original 100, and the 5-position portfolio with the market filter.
//   If it FAILS, ACT setups on the new stocks are shown but tiered SKIP ("edge not confirmed on these stocks").
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';

const api = loadEngine(), uni = universe(api);
const src = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const NEW = new Set([...src.slice(src.indexOf('// ---- expansion 2026-10-10')).matchAll(/\['([A-Z]{4})',/g)].map(m => m[1]));
if (!NEW.size) throw new Error('expansion rows not found in Code.gs');
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const FEE = 0.004, WINDOW = 270, SPLIT = '2024-10-01', iso = d => d.toISOString().slice(0, 10);
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '5y', process.env.REFRESH !== '1');
const idx = px['^JKSE'], idxBy = new Map(idx.d.map((d, i) => [iso(d), i]));
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sdv = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const pc = x => (x == null || Number.isNaN(x) ? 'n/a' : (x * 100).toFixed(2) + '%'), f2 = x => (x == null || Number.isNaN(x) ? 'n/a' : x.toFixed(2));
function sim(b, i0, stop, target) {
  const j0 = i0 + 1, last = j0 + 14; if (last >= b.c.length) return null;
  const entry = b.o[j0];
  for (let j = j0; j <= last; j++) {
    if (b.l[j] <= stop) return { ret: Math.min(stop, b.o[j]) / entry - 1 - FEE, exitIdx: j, entryIdx: j0 };
    if (b.h[j] >= target) return { ret: Math.max(target, b.o[j]) / entry - 1 - FEE, exitIdx: j, entryIdx: j0 };
  }
  return { ret: b.c[last] / entry - 1 - FEE, exitIdx: last, entryIdx: j0 };
}
const S = [];
for (const u of uni) {
  const b = px[u.ticker + '.JK']; if (!b || b.c.length < 300) continue;
  for (let t = 250; t < b.c.length - 17; t++) {
    const day = iso(b.d[t]), ii = idxBy.get(day); if (ii == null || ii < 200) continue;
    const lo = Math.max(0, t + 1 - WINDOW);
    const w = { d: b.d.slice(lo, t + 1), o: b.o.slice(lo, t + 1), h: b.h.slice(lo, t + 1), l: b.l.slice(lo, t + 1), c: b.c.slice(lo, t + 1), v: b.v.slice(lo, t + 1) };
    const a = api.analyse_(w, idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
    if (!a || a.avgValue / 1e9 < 5 || a.stop >= a.entry) continue;
    const score = api.score_(a, 0), n = w.c.length;
    const confirm = w.c[n - 1] > w.h[n - 2] || (w.c[n - 1] > w.o[n - 1] && w.c[n - 1] > w.c[n - 2]);
    const tr = sim(b, t, api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down'), a.target); if (!tr) continue;
    const s200 = mean(idx.c.slice(ii - 199, ii + 1));
    S.push({ tk: u.ticker, day, score, live: score >= api.ACT_SCORE && confirm, ctrl: score < api.ACT_SCORE, isNew: NEW.has(u.ticker), tr, marketOk: idx.c[ii] > s200 });
  }
}
const days = [...new Set(S.map(s => s.day))].sort(), di = new Map(days.map((d, i) => [d, i]));
const episodes = L => { const by = {}, ep = []; L.forEach(s => { (by[s.tk] = by[s.tk] || []).push(s); }); Object.values(by).forEach(l => { l.sort((a, b) => a.day.localeCompare(b.day)); let last = -1e9; l.forEach(s => { const i = di.get(s.day); if (i - last >= 15) { ep.push(s); last = i; } }); }); return ep; };
function evaluate(label, L) {
  const live = L.filter(s => s.live), ctrl = L.filter(s => s.ctrl), ep = episodes(live).map(s => s.tr.ret), cv = ctrl.map(s => s.tr.ret);
  const t = ep.length > 8 ? (mean(ep) - mean(cv)) / Math.sqrt(sdv(ep) ** 2 / ep.length + sdv(cv) ** 2 / cv.length) : null;
  const by = {}; L.forEach(s => { if (s.live || s.ctrl) (by[s.day] = by[s.day] || []).push(s); });
  const g = Object.values(by).map(l => { const a = l.filter(s => s.live), c = l.filter(s => s.ctrl); return a.length && c.length ? mean(a.map(s => s.tr.ret)) - mean(c.map(s => s.tr.ret)) : null; }).filter(x => x != null);
  const half = h => { const A = L.filter(s => (h ? s.day >= SPLIT : s.day < SPLIT)); const e = episodes(A.filter(s => s.live)).map(s => s.tr.ret), c = A.filter(s => s.ctrl).map(s => s.tr.ret); return e.length ? mean(e) - mean(c) : null; };
  const r = { label, stocks: new Set(L.map(s => s.tk)).size, episodes: ep.length, avgLive: mean(ep), avgCtrl: mean(cv), gap: mean(ep) - mean(cv), t, gapDay: mean(g), daysBoth: g.length, h1: half(0), h2: half(1), win: mean(ep.map(x => (x > 0 ? 1 : 0))) };
  r.pass = r.t >= 2 && r.gapDay > 0 && r.h1 > 0 && r.h2 > 0;
  console.log(`${label.padEnd(14)} ${r.stocks} stocks, ${r.episodes} live-rule episodes: ${pc(r.avgLive)} (positive ${pc(r.win)}) vs control ${pc(r.avgCtrl)} -> gap ${pc(r.gap)} t=${f2(r.t)} | by day ${pc(r.gapDay)} (${r.daysBoth} d) | halves ${pc(r.h1)} / ${pc(r.h2)} -> ${r.pass ? 'PASS' : 'fail'}`);
  return r;
}
console.log(`signal-days: ${S.length} (${days[0]}..${days.at(-1)}); new stocks in the expansion: ${NEW.size}`);
const rNew = evaluate('NEW 200', S.filter(s => s.isNew)), rOld = evaluate('original 100', S.filter(s => !s.isNew));
// portfolio, reported only: 5 positions, market filter, cash 4.5%, all 300 vs original 100
function portfolio(L) {
  const sig = {}; L.filter(s => s.live && s.marketOk).forEach(s => { (sig[s.day] = sig[s.day] || []).push(s); });
  const cal = idx.d.map(iso).filter(d => d >= days[0] && d <= days.at(-1)), cd = 1.045 ** (1 / 245) - 1;
  let cash = 1, pos = [], curve = [], trades = 0;
  for (const day of cal) {
    cash *= 1 + cd;
    pos = pos.filter(p => { if (iso(px[p.tk + '.JK'].d[p.exitIdx]) <= day) { cash += p.size * (1 + p.ret); trades++; return false; } return true; });
    const val = cash + pos.reduce((s, p) => { const b = px[p.tk + '.JK']; let i = b.d.findIndex(d => iso(d) === day); if (i < 0) i = p.lastI ?? p.entryIdx; p.lastI = i; return s + p.size * (b.c[i] / b.o[p.entryIdx]); }, 0);
    curve.push(val);
    for (const s of (sig[day] || []).filter(s => !pos.some(p => p.tk === s.tk)).sort((a, b) => b.score - a.score)) { if (pos.length >= 5) break; const size = Math.min(cash, val / 5); if (size <= val * 0.01) break; cash -= size; pos.push({ tk: s.tk, size, ret: s.tr.ret, exitIdx: s.tr.exitIdx, entryIdx: s.tr.entryIdx }); }
  }
  let pk = 0, mdd = 0; curve.forEach(v => { pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); });
  const yrs = cal.length / 245;
  return { cagr: curve.at(-1) ** (1 / yrs) - 1, mdd, trades };
}
const P100 = portfolio(S.filter(s => !s.isNew)), P300 = portfolio(S);
console.log(`portfolio (5 positions, market filter, cash 4.5%): original 100 CAGR ${pc(P100.cagr)} maxDD ${pc(P100.mdd)} trades ${P100.trades} | all 300 CAGR ${pc(P300.cagr)} maxDD ${pc(P300.mdd)} trades ${P300.trades}`);
fs.writeFileSync(path.join(ROOT, 'data', 'expand-study.json'), JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), from: days[0], to: days.at(-1), pass: rNew.pass, newStocks: rNew, original: rOld, portfolio: { original: P100, all: P300 } }));
console.log(`\nverdict: ${rNew.pass ? 'PASS - new stocks trade like the original 100' : 'FAIL - ACT setups on new stocks are tiered SKIP'}; wrote data/expand-study.json`);

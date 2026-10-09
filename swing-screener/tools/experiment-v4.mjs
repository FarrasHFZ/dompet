// v4 study: do IDX company announcements, point-in-time fundamentals, or better exits improve the live trade
// (ACT + bounce candle, wide 3.5-ATR stop, +8% target, 15 sessions, entry next open, 0.4% fees)? And what does the live
// rule look like as an actual portfolio?
//
// PRE-REGISTERED 2026-10-10, before the first run. Pass bar for a PRIMARY: one-trade-per-episode t >= 2 AND by-day
// clustered t >= 2 AND gap > 0 on the 73 stocks the score was not designed on AND gap > 0 in both halves. SECONDARY: same
// with t >= 2.5 (more looks). Episodes: one signal per stock per 15 sessions. Exit tests are PAIRED (same trades, two
// exits), so their t is on per-trade differences.
//   EVENTS (IDX announcements exist from 2023-07, so signals from 2023-08-01; halves split 2025-03-01; ACT signals):
//     E1 PRIMARY  dilutive capital raise (HMETD / PMTHMETD / private placement / penambahan modal) announced in the 30
//                 calendar days up to the signal -> WORSE (A = no event, B = event; pass = A beats B)
//     E2 buyback plan in prior 30d -> better   E3 IDX query (volatility / Permintaan Penjelasan) in prior 10d (two-sided)
//     E4 dividend announcement in prior 30d -> better   E5 financial report released in prior 10d (two-sided)
//   FUNDAMENTALS (Stockbit quarterly revenue / net income; a quarter counts only from its IDX release date, else 90 days
//   after quarter end; signals 2022-10.., halves split 2024-10-01; ACT signals):
//     F1 PRIMARY  trailing-4-quarter net income > 0 beats loss-making
//     F2 latest quarter revenue up YoY beats down      F3 latest quarter net income up YoY beats down
//   EXITS (ACT + bounce candle, the live trade; paired vs the current exit):
//     X1 PRIMARY  target = 20-day average (the mean-reversion target) when it is above entry, else +8%
//     X2 hold 10 sessions   X3 hold 20 sessions   X4 stop moves to breakeven once the high reaches +4%
//   PORTFOLIO (reported, not a test): live rule, max 5 positions, 20% of equity each, highest score first, vs IHSG.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';

const api = loadEngine(), uni = universe(api);
const DESIGN = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'design-universe.json'), 'utf8')));
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const FEE = 0.004, WARM = 250, WINDOW = 270;
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '5y', process.env.REFRESH !== '1');
const idx = px['^JKSE'];
const iso = d => d.toISOString().slice(0, 10);
const idxBy = new Map(idx.d.map((d, i) => [iso(d), i]));
const ANN = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'idx-announcements.json'), 'utf8'));
const FIN = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fundamentals-quarterly.json'), 'utf8'));
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sdv = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

// ---------- events ----------
const EV = {
  dilution: t => /penambahan modal|hmetd|pmthmetd|private placement|rights? issue|tanpa (memberikan )?hak memesan/i.test(t) && !/penggunaan dana|hasil pelaksanaan|realisasi/i.test(t),
  buyback: t => /pembelian kembali saham|buy ?back/i.test(t) && !/pengalihan|hasil buy ?back|laporan/i.test(t),
  idxQuery: t => /volatilitas transaksi|permintaan penjelasan bursa|unusual market activity/i.test(t),
  dividend: t => /dividen/i.test(t),
  report: t => /laporan keuangan/i.test(t) && !/rencana penyampaian|bukti iklan|pemberitahuan/i.test(t),
};
const events = {}; // tk -> type -> [timestamps]
for (const [tk, rows] of Object.entries(ANN)) {
  events[tk] = {};
  for (const r of rows) { const txt = r[1] + ' ' + r[2] + ' ' + r[3]; for (const [k, f] of Object.entries(EV)) if (f(txt)) (events[tk][k] = events[tk][k] || []).push(r[0]); }
}
const hasEvent = (tk, type, day, lookDays) => {
  const end = day + 'T15:50:00', start = new Date(Date.parse(day) - lookDays * 864e5).toISOString().slice(0, 10);
  return ((events[tk] || {})[type] || []).some(ts => ts <= end && ts.slice(0, 10) > start);
};

// ---------- fundamentals, point in time ----------
const qEnd = q => { const [Q, y] = q.split(' '); return `${y}-${{ Q1: '03-31', Q2: '06-30', Q3: '09-30', Q4: '12-31' }[Q]}`; };
const fin = {};
for (const [tk, f] of Object.entries(FIN)) {
  if (!f.q) continue;
  const reports = ((events[tk] || {}).report || []).map(ts => ts.slice(0, 10)).sort();
  fin[tk] = f.q.map((q, k) => {
    const end = qEnd(q), fallback = new Date(Date.parse(end) + 90 * 864e5).toISOString().slice(0, 10);
    const rel = reports.find(d => d > end && d <= fallback) || fallback;
    return { q, end, rel, rev: f.rev[k], ni: f.ni[k] };
  }).sort((a, b) => a.end.localeCompare(b.end));
}
function fundAt(tk, day) {
  const k = (fin[tk] || []).filter(x => x.rel <= day);
  if (k.length < 5) return null;
  const last = k.at(-1), yearAgo = k.find(x => x.end.slice(5) === last.end.slice(5) && +x.end.slice(0, 4) === +last.end.slice(0, 4) - 1);
  const ttm = k.slice(-4); if (ttm.some(x => x.ni == null)) return null;
  return { ttmNi: ttm.reduce((s, x) => s + x.ni, 0), revYoY: yearAgo && yearAgo.rev && last.rev != null ? last.rev / yearAgo.rev - 1 : null, niUp: yearAgo && last.ni != null && yearAgo.ni != null ? last.ni > yearAgo.ni : null };
}

// ---------- trade simulation (same rules as tools/tracker.mjs resolveTrade) ----------
function sim(b, i0, stop, target, horizon, beAt = null) {
  const j0 = i0 + 1; if (j0 >= b.c.length) return null;
  const entry = b.o[j0], last = Math.min(j0 + horizon - 1, b.c.length - 1);
  if (last < j0 + horizon - 1) return null; // not resolved yet
  let s = stop;
  for (let j = j0; j <= last; j++) {
    const stopHit = b.l[j] <= s, tgtHit = b.h[j] >= target;
    if (stopHit) { const x = Math.min(s, b.o[j]); return { ret: x / entry - 1 - FEE, exitIdx: j, entryIdx: j0, win: false }; }
    if (tgtHit) { const x = Math.max(target, b.o[j]); return { ret: x / entry - 1 - FEE, exitIdx: j, entryIdx: j0, win: true }; }
    if (beAt != null && b.h[j] >= entry * (1 + beAt)) s = Math.max(s, entry * (1 + FEE)); // from the next bar on
  }
  return { ret: b.c[last] / entry - 1 - FEE, exitIdx: last, entryIdx: j0, win: false };
}

// ---------- samples: every day, every stock ----------
const samples = [];
for (const u of uni) {
  const b = px[u.ticker + '.JK']; if (!b || b.c.length < WARM + 40) continue;
  for (let t = WARM; t < b.c.length - 2; t++) {
    const lo = Math.max(0, t + 1 - WINDOW);
    const w = { d: b.d.slice(lo, t + 1), o: b.o.slice(lo, t + 1), h: b.h.slice(lo, t + 1), l: b.l.slice(lo, t + 1), c: b.c.slice(lo, t + 1), v: b.v.slice(lo, t + 1) };
    const day = iso(b.d[t]), ii = idxBy.get(day); if (ii === undefined || ii < 60) continue;
    const a = api.analyse_(w, idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
    if (!a || a.avgValue / 1e9 < 5 || a.stop >= a.entry) continue;
    const score = api.score_(a, 0); if (score < api.ACT_SCORE) continue;
    const n = w.c.length, confirm = w.c[n - 1] > w.h[n - 2] || (w.c[n - 1] > w.o[n - 1] && w.c[n - 1] > w.c[n - 2]);
    const wide = api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down');
    const base = sim(b, t, wide, a.target, 15); if (!base) continue;
    const mrT = a.targetMR && a.targetMR > b.c[t] ? a.targetMR : a.target;
    samples.push({
      tk: u.ticker, day, t, score, confirm, design: DESIGN.has(u.ticker), base,
      x1: sim(b, t, wide, mrT, 15), x2: sim(b, t, wide, a.target, 10), x3: sim(b, t, wide, a.target, 20), x4: sim(b, t, wide, a.target, 15, 0.04),
      ev: Object.fromEntries(['dilution', 'buyback', 'dividend'].map(k => [k, hasEvent(u.ticker, k, day, 30)]).concat(['idxQuery', 'report'].map(k => [k, hasEvent(u.ticker, k, day, 10)]))),
      fd: fundAt(u.ticker, day),
    });
  }
}
const days = [...new Set(samples.map(s => s.day))].sort(), dIdx = new Map(days.map((d, i) => [d, i]));
console.log(`ACT signal-days: ${samples.length} (${samples[0].day}..${samples.at(-1).day}); with bounce candle ${samples.filter(s => s.confirm).length}`);

// ---------- statistics ----------
function episodes(A) { const by = {}, ep = []; A.forEach(s => { (by[s.tk] = by[s.tk] || []).push(s); }); Object.values(by).forEach(l => { l.sort((a, b) => a.day.localeCompare(b.day)); let last = -1e9; l.forEach(s => { const i = dIdx.get(s.day); if (i - last >= 15) { ep.push(s); last = i; } }); }); return ep; }
function welch(a, b) { if (a.length < 8 || b.length < 8) return { gap: null, t: null, na: a.length, nb: b.length }; const ma = mean(a), mb = mean(b); return { gap: ma - mb, t: (ma - mb) / Math.sqrt(sdv(a) ** 2 / a.length + sdv(b) ** 2 / b.length), ma, mb, na: a.length, nb: b.length }; }
function byDay(A, inA, inB, val) { const by = {}; A.forEach(s => { (by[s.day] = by[s.day] || []).push(s); }); const g = Object.values(by).map(l => { const p = l.filter(inA), q = l.filter(inB); return p.length && q.length ? mean(p.map(val)) - mean(q.map(val)) : null; }).filter(x => x != null); return g.length > 5 ? { gap: mean(g), t: mean(g) / (sdv(g) / Math.sqrt(g.length)), days: g.length } : { gap: null, t: null, days: g.length }; }
const f2 = x => (x == null || Number.isNaN(x) ? 'n/a' : x.toFixed(2)), pc = x => (x == null || Number.isNaN(x) ? 'n/a' : (x * 100).toFixed(2) + '%');
const results = [];
function groupTest(name, primary, A, inA, inB, split) {
  const val = s => s.base.ret, bar = primary ? 2 : 2.5, ep = episodes(A);
  const e = welch(ep.filter(inA).map(val), ep.filter(inB).map(val)), c = byDay(A, inA, inB, val);
  const un = welch(A.filter(s => !s.design && inA(s)).map(val), A.filter(s => !s.design && inB(s)).map(val));
  const h1 = welch(A.filter(s => s.day < split && inA(s)).map(val), A.filter(s => s.day < split && inB(s)).map(val));
  const h2 = welch(A.filter(s => s.day >= split && inA(s)).map(val), A.filter(s => s.day >= split && inB(s)).map(val));
  const pass = e.t != null && c.t != null && e.t >= bar && c.t >= bar && un.gap > 0 && h1.gap > 0 && h2.gap > 0;
  console.log(`\n${name}${primary ? '  [PRIMARY]' : ''}\n  episodes A ${e.na} ${pc(e.ma)} vs B ${e.nb} ${pc(e.mb)}: gap ${pc(e.gap)} t=${f2(e.t)} | by day ${pc(c.gap)} t=${f2(c.t)} (${c.days} d) | unseen ${pc(un.gap)} | halves ${pc(h1.gap)} / ${pc(h2.gap)} -> ${pass ? 'PASS' : 'fail'}`);
  results.push({ name, primary, pass, nA: e.na, nB: e.nb, avgA: e.ma, avgB: e.mb, gap: e.gap, t: e.t, gapDay: c.gap, tDay: c.t, unseen: un.gap, h1: h1.gap, h2: h2.gap });
}
function pairedTest(name, primary, A, key, split) {
  const bar = primary ? 2 : 2.5, d = s => s[key].ret - s.base.ret;
  const ep = episodes(A).filter(s => s[key]), dv = ep.map(d);
  const t = dv.length > 8 ? mean(dv) / (sdv(dv) / Math.sqrt(dv.length)) : null;
  const by = {}; A.filter(s => s[key]).forEach(s => { (by[s.day] = by[s.day] || []).push(d(s)); }); const g = Object.values(by).map(mean); const tc = g.length > 5 ? mean(g) / (sdv(g) / Math.sqrt(g.length)) : null;
  const un = mean(A.filter(s => !s.design && s[key]).map(d)), h1 = mean(A.filter(s => s.day < split && s[key]).map(d)), h2 = mean(A.filter(s => s.day >= split && s[key]).map(d));
  const pass = t >= bar && tc >= bar && un > 0 && h1 > 0 && h2 > 0;
  const win = k => mean(ep.map(s => (s[k].win ? 1 : 0)));
  console.log(`\n${name}${primary ? '  [PRIMARY]' : ''}\n  ${ep.length} episodes: current exit ${pc(mean(ep.map(s => s.base.ret)))} (target hit ${pc(win('base'))}) vs new ${pc(mean(ep.map(s => s[key].ret)))} (${pc(win(key))}): diff ${pc(mean(dv))} t=${f2(t)} | by day t=${f2(tc)} | unseen ${pc(un)} | halves ${pc(h1)} / ${pc(h2)} -> ${pass ? 'PASS' : 'fail'}`);
  results.push({ name, primary, pass, n: ep.length, base: mean(ep.map(s => s.base.ret)), alt: mean(ep.map(s => s[key].ret)), diff: mean(dv), t, tDay: tc, unseen: un, h1, h2 });
}

const EVW = samples.filter(s => s.day >= '2023-08-01');
console.log(`\n===== EVENTS (ACT, ${EVW.length} signal-days from 2023-08) =====`);
['dilution', 'buyback', 'idxQuery', 'dividend', 'report'].forEach(k => console.log(`  ${k}: ${EVW.filter(s => s.ev[k]).length} signal-days with the event`));
groupTest('E1 no dilutive raise (A) vs dilutive raise in prior 30d (B)', true, EVW, s => !s.ev.dilution, s => s.ev.dilution, '2025-03-01');
groupTest('E2 buyback plan in prior 30d (A) vs none (B)', false, EVW, s => s.ev.buyback, s => !s.ev.buyback, '2025-03-01');
groupTest('E3 IDX query in prior 10d (A) vs none (B)', false, EVW, s => s.ev.idxQuery, s => !s.ev.idxQuery, '2025-03-01');
groupTest('E4 dividend news in prior 30d (A) vs none (B)', false, EVW, s => s.ev.dividend, s => !s.ev.dividend, '2025-03-01');
groupTest('E5 report released in prior 10d (A) vs not (B)', false, EVW, s => s.ev.report, s => !s.ev.report, '2025-03-01');

const FW = samples.filter(s => s.fd);
console.log(`\n===== FUNDAMENTALS (ACT, ${FW.length} signal-days with point-in-time data) =====`);
console.log(`  loss-making (TTM) share: ${pc(mean(FW.map(s => (s.fd.ttmNi <= 0 ? 1 : 0))))}`);
groupTest('F1 profitable TTM (A) vs loss-making (B)', true, FW, s => s.fd.ttmNi > 0, s => s.fd.ttmNi <= 0, '2024-10-01');
groupTest('F2 revenue up YoY (A) vs down (B)', false, FW.filter(s => s.fd.revYoY != null), s => s.fd.revYoY > 0, s => s.fd.revYoY <= 0, '2024-10-01');
groupTest('F3 net income up YoY (A) vs down (B)', false, FW.filter(s => s.fd.niUp != null), s => s.fd.niUp, s => !s.fd.niUp, '2024-10-01');

const LIVE = samples.filter(s => s.confirm);
console.log(`\n===== EXITS (ACT + bounce candle, ${LIVE.length} signal-days) =====`);
pairedTest('X1 target = 20-day average', true, LIVE, 'x1', '2024-10-01');
pairedTest('X2 hold 10 sessions', false, LIVE, 'x2', '2024-10-01');
pairedTest('X3 hold 20 sessions', false, LIVE, 'x3', '2024-10-01');
pairedTest('X4 breakeven stop after +4%', false, LIVE, 'x4', '2024-10-01');

// ---------- portfolio ----------
function portfolio(filter, exitKey = 'base', maxPos = 5, opt = {}) {
  const sig = {}; LIVE.filter(filter).forEach(s => { (sig[s.day] = sig[s.day] || []).push(s); });
  const first = LIVE.map(s => s.day).sort()[0], lastBar = Math.min(...Object.values(px).filter(Boolean).map(b => +b.d.at(-1)));
  const cal = idx.d.filter(d => +d <= lastBar).map(iso).filter(d => d >= (opt.from || first) && d <= (opt.to || '9999'));
  const cashDaily = (1 + (opt.cashYield || 0)) ** (1 / 245) - 1; // idle cash in a money-market fund
  let cash = 1, pos = [], curve = [], trades = [], exposure = 0;
  for (let k = 0; k < cal.length; k++) {
    const day = cal[k];
    cash *= 1 + cashDaily;
    // close positions whose exit day is today (exit at the trade's exit price)
    pos = pos.filter(p => { const b = px[p.tk + '.JK']; if (iso(b.d[p.exitIdx]) <= day) { cash += p.size * (1 + p.ret); trades.push(p.ret); return false; } return true; });
    // value
    const val = cash + pos.reduce((s, p) => { const b = px[p.tk + '.JK']; let i = b.d.findIndex(d => iso(d) === day); if (i < 0) i = p.lastI ?? p.entryIdx; p.lastI = i; return s + p.size * (b.c[i] / b.o[p.entryIdx]); }, 0);
    curve.push([day, val]); exposure += pos.length / maxPos;
    // new entries signalled today (enter next open)
    const cands = (sig[day] || []).filter(s => !pos.some(p => p.tk === s.tk)).sort((a, b) => b.score - a.score);
    for (const s of cands) { if (pos.length >= maxPos) break; const size = Math.min(cash, val / maxPos); if (size <= val * 0.01) break; cash -= size; pos.push({ tk: s.tk, size, ret: s[exitKey].ret, exitIdx: s[exitKey].exitIdx, entryIdx: s[exitKey].entryIdx }); }
  }
  const yrs = (Date.parse(curve.at(-1)[0]) - Date.parse(curve[0][0])) / 31557600000;
  let peak = 0, mdd = 0; curve.forEach(([, v]) => { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
  return { from: curve[0][0], to: curve.at(-1)[0], final: curve.at(-1)[1], cagr: curve.at(-1)[1] ** (1 / yrs) - 1, mdd, trades: trades.length, win: mean(trades.map(r => (r > 0 ? 1 : 0))), avg: mean(trades), exposure: exposure / curve.length, curve: curve.filter((_, i) => i % 5 === 0) };
}
const P = portfolio(() => true);
const i0 = idx.d.findIndex(d => iso(d) >= P.from), i1 = idx.d.findIndex(d => iso(d) >= P.to);
const ihsg = idx.c[i1] / idx.c[i0], yrs = (Date.parse(P.to) - Date.parse(P.from)) / 31557600000;
let pk = 0, ihsgDD = 0; for (let i = i0; i <= i1; i++) { pk = Math.max(pk, idx.c[i]); ihsgDD = Math.min(ihsgDD, idx.c[i] / pk - 1); }
console.log(`\n===== PORTFOLIO: live rule, max 5 positions, ${P.from}..${P.to} =====`);
console.log(`  ${P.trades} trades, win ${pc(P.win)}, avg ${pc(P.avg)} | growth x${P.final.toFixed(2)}, CAGR ${pc(P.cagr)}, max drawdown ${pc(P.mdd)}, invested ${pc(P.exposure)} of the time`);
console.log(`  IHSG buy & hold: x${ihsg.toFixed(2)}, CAGR ${pc(ihsg ** (1 / yrs) - 1)}, max drawdown ${pc(ihsgDD)}`);
const passed = results.filter(r => r.pass);
const extra = {};
if (passed.length) {
  const fe = passed.find(r => r.name.startsWith('E1')), ff = passed.find(r => r.name.startsWith('F1')), fx = passed.find(r => r.name.startsWith('X1'));
  const filt = s => (!fe || !s.ev.dilution) && (!ff || !s.fd || s.fd.ttmNi > 0);
  extra.improved = portfolio(filt, fx ? 'x1' : 'base');
  console.log(`  WITH passed rules (${passed.map(r => r.name.slice(0, 2)).join(', ')}): ${extra.improved.trades} trades, x${extra.improved.final.toFixed(2)}, CAGR ${pc(extra.improved.cagr)}, max DD ${pc(extra.improved.mdd)}`);
}
fs.writeFileSync(path.join(ROOT, 'data', 'v4-study.json'), JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), results, portfolio: { ...P, ihsg: { growth: ihsg, cagr: ihsg ** (1 / yrs) - 1, mdd: ihsgDD } }, improved: extra.improved || null }));

// ---------- PORTFOLIO RISK FILTER (walk-forward; rule fixed 2026-10-10 before this section first ran) ----------
// Candidates, all known at the signal day: R1 IHSG close > its 50-day average; R2 > its 200-day average; R3 IHSG 20-day
// change > -5% (no market crash under way). Pick the candidate with the best CAGR on the FIRST half (2022-10..2024-09);
// adopt it only if on the SECOND half (2024-10..) it beats the unfiltered rule on CAGR AND has a smaller max drawdown.
// Idle cash earns 4.5%/yr (Indonesian money-market fund) in every variant here, including the baseline.
const ihsgAt = day => { const i = idxBy.get(day); if (i == null || i < 200) return null; const c = idx.c; const sma = n => mean(c.slice(i - n + 1, i + 1)); return { c: c[i], s50: sma(50), s200: sma(200), ch20: c[i] / c[i - 20] - 1 }; };
const R = { none: () => true, R1: s => { const x = ihsgAt(s.day); return x && x.c > x.s50; }, R2: s => { const x = ihsgAt(s.day); return x && x.c > x.s200; }, R3: s => { const x = ihsgAt(s.day); return x && x.ch20 > -0.05; } };
const CY = 0.045, H1 = { to: '2024-09-30', cashYield: CY }, H2 = { from: '2024-10-01', cashYield: CY };
console.log('\n===== REGIME FILTER, walk-forward (idle cash 4.5%/yr) =====');
const first = {}; for (const [k, f] of Object.entries(R)) { first[k] = portfolio(f, 'base', 5, H1); console.log(`  first half  ${k.padEnd(4)} x${first[k].final.toFixed(2)} CAGR ${pc(first[k].cagr)} maxDD ${pc(first[k].mdd)} trades ${first[k].trades}`); }
const pick = Object.keys(R).filter(k => k !== 'none').sort((a, b) => first[b].cagr - first[a].cagr)[0];
const s0 = portfolio(R.none, 'base', 5, H2), s1 = portfolio(R[pick], 'base', 5, H2);
const adopt = s1.cagr > s0.cagr && s1.mdd > s0.mdd;
console.log(`  picked on first half: ${pick}
  second half  none x${s0.final.toFixed(2)} CAGR ${pc(s0.cagr)} maxDD ${pc(s0.mdd)} | ${pick} x${s1.final.toFixed(2)} CAGR ${pc(s1.cagr)} maxDD ${pc(s1.mdd)} -> ${adopt ? 'ADOPT' : 'do not adopt'}`);
for (const k of Object.keys(R)) if (k !== pick && k !== 'none') { const z = portfolio(R[k], 'base', 5, H2); console.log(`  (for reference, not used to decide) second half ${k} x${z.final.toFixed(2)} CAGR ${pc(z.cagr)} maxDD ${pc(z.mdd)}`); }
const full0 = portfolio(R.none, 'base', 5, { cashYield: CY }), full1 = portfolio(R[pick], 'base', 5, { cashYield: CY });
console.log(`  full period with cash yield: none x${full0.final.toFixed(2)} CAGR ${pc(full0.cagr)} maxDD ${pc(full0.mdd)} | ${pick} x${full1.final.toFixed(2)} CAGR ${pc(full1.cagr)} maxDD ${pc(full1.mdd)}`);
const prev = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'v4-study.json'), 'utf8'));
prev.regime = { candidates: Object.keys(R), pick, firstHalf: Object.fromEntries(Object.entries(first).map(([k, v]) => [k, { cagr: v.cagr, mdd: v.mdd, trades: v.trades }])), secondHalf: { none: { cagr: s0.cagr, mdd: s0.mdd, trades: s0.trades }, [pick]: { cagr: s1.cagr, mdd: s1.mdd, trades: s1.trades } }, adopt, full: { none: { final: full0.final, cagr: full0.cagr, mdd: full0.mdd, curve: full0.curve }, [pick]: { final: full1.final, cagr: full1.cagr, mdd: full1.mdd, curve: full1.curve } }, cashYield: CY };
fs.writeFileSync(path.join(ROOT, 'data', 'v4-study.json'), JSON.stringify(prev));

// ---------- robustness of the adopted filter (reported only; the decision above is already made) ----------
console.log('\n===== ROBUSTNESS (full period, cash 4.5%/yr): is the result knife-edge? =====');
for (const n of [100, 150, 200, 250]) {
  const f = s => { const i = idxBy.get(s.day); if (i == null || i < n) return false; return idx.c[i] > mean(idx.c.slice(i - n + 1, i + 1)); };
  for (const mp of [3, 5, 8]) { const z = portfolio(f, 'base', mp, { cashYield: CY }); console.log(`  IHSG > ${String(n).padStart(3)}-day avg, max ${mp} positions: x${z.final.toFixed(2)} CAGR ${pc(z.cagr)} maxDD ${pc(z.mdd)} trades ${z.trades}`); }
}
for (const mp of [3, 8]) { const z = portfolio(() => true, 'base', mp, { cashYield: CY }); console.log(`  no filter, max ${mp} positions: x${z.final.toFixed(2)} CAGR ${pc(z.cagr)} maxDD ${pc(z.mdd)}`); }
// per-trade view: are trades opened above the 200-day average better trades, or is it only fewer trades in bad markets?
const above = s => { const i = idxBy.get(s.day); return i != null && i >= 200 && idx.c[i] > mean(idx.c.slice(i - 199, i + 1)); };
const epL = episodes(LIVE);
console.log(`  per trade (episodes): above 200d ${pc(mean(epL.filter(above).map(s => s.base.ret)))} (n ${epL.filter(above).length}) vs below ${pc(mean(epL.filter(s => !above(s)).map(s => s.base.ret)))} (n ${epL.filter(s => !above(s)).length})`);
const nowI = idx.c.length - 1;
console.log(`  today: IHSG ${idx.c[nowI].toFixed(0)} vs 200-day avg ${mean(idx.c.slice(nowI - 199)).toFixed(0)} -> filter ${idx.c[nowI] > mean(idx.c.slice(nowI - 199)) ? 'ON (trade)' : 'OFF (stand aside)'}`);

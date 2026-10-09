// NeoBDM HISTORY study: two years of NeoBDM's own Transaction Chart (cumulative net value per actor group) and one year
// of per-broker inventory (tools/nb-hist-pull.js -> data/nb-history.json, local). Until now the flow model could only be
// tested forward from 2026-10-09 (earliest verdict ~mid-Jan 2027). The history lets us REPLAY it.
//
// Reconstruction: NeoBDM's screener column <g>_cn_<w> = group g's net value over the last w sessions / turnover over the
// same sessions. From the chart: (cum_g[t] - cum_g[t-w]) / sum of Yahoo close x volume. Checked on the 2026-10-09
// snapshot (ADRO): 1-day bandar net 3.396 bn = m_dn_0 x tval exactly; f_cn_5 -0.0755 vs -0.0755. Fields the chart does
// not carry (comp_* method fit, crossing / Clean, Pinky, liquid) are left out, so the replay trusts every group fully and
// never tags AVOID. That is the one known gap between the replay and the live tag.
//
// PRE-REGISTERED 2026-10-10, written before data/nb-history.json existed (nothing below was tuned on it):
//  T1 PRIMARY  forward-test replay. Every session in the history becomes a "snapshot"; tools/flow-forward.mjs scoreSnaps()
//     (the exact code and checklist of the live forward test) scores it. PASS = all 5 forward checks, plus
//     (e) FLOW+ minus FLOW- 5-session spread > 0 on the 73 stocks the score was not designed on, and
//     (f) the same spread on every 5th session only (no overlapping windows): t >= 2.
//  T2 PRIMARY  the trade. ACT signals (score >= 65, every session, live trade: wide 3.5-ATR stop, +8%, 15 sessions, next
//     open, 0.4% fees): not FLOW- (A) vs FLOW- (B). PASS = one-trade-per-episode Welch t >= 2 AND by-day t >= 2 AND gap > 0
//     on the 73 unseen stocks AND gap > 0 in both halves (split 2025-10-01).
//     ADOPT the veto (FLOW- turns ACT into SKIP) only if T2 passes AND the 5-position portfolio with the veto (market
//     filter on, cash 4.5%/yr) does not have a lower CAGR or a deeper max drawdown than without it over the same window.
//  T3 secondary (t >= 2.5): ACT, FLOW+ (A) vs FLOW~ (B)            -> would justify ranking ACT+ first
//  T4 secondary (t >= 2.5): ACT, phase ACCUMULATION (A) vs DISTRIBUTION or MARKDOWN (B)
//  T5 secondary (broker inventory, 1 year): concentration BC20 = (3 largest 20-session net buyers + 3 largest net sellers,
//     in lots, among each stock's 20 most active brokers by gross 1-year value) / 20-session volume. Every 5th session,
//     cross-sectional rank IC vs next-5-session excess return. PASS = mean IC t >= 2.5, IC > 0 in both halves and on unseen.
//  T6 descriptive only (no decision): the same IC for each group's 5- and 20-session share.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
import { readFlow } from './flow-model.mjs';
import { scoreSnaps } from './flow-forward.mjs';

const NB = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-history.json'), 'utf8'));
const api = loadEngine(), uni = universe(api);
const DESIGN = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'design-universe.json'), 'utf8')));
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const FEE = 0.004, WINDOW = 270, SPLIT = '2025-10-01', CY = 0.045;
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '5y', process.env.REFRESH !== '1');
const idx = px['^JKSE'];
const iso = d => d.toISOString().slice(0, 10);
const idxBy = new Map(idx.d.map((d, i) => [iso(d), i]));
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sdv = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const f2 = x => (x == null || Number.isNaN(x) ? 'n/a' : x.toFixed(2)), pc = x => (x == null || Number.isNaN(x) ? 'n/a' : (x * 100).toFixed(2) + '%');
const G = ['m', 'nr', 'i', 's', 'f', 'z'], W = [5, 10, 20, 50];

// ---------- reconstruct NeoBDM screener rows for every stock-day ----------
const rowsBy = {}; // tk -> date -> row
const pxIdx = {};
for (const [tk, rec] of Object.entries(NB)) {
  const b = px[tk + '.JK'], g = rec.g; if (!b || !g) continue;
  const bi = pxIdx[tk] = new Map(b.d.map((d, i) => [iso(d), i]));
  const tv = b.c.map((c, i) => c * b.v[i] / 1e9);
  rowsBy[tk] = {};
  g.d.forEach((day, k) => {
    const t = bi.get(day); if (t == null || k < 20) return;
    const row = {};
    for (const w of W) {
      if (k < w || t < w) continue;
      let turn = 0; for (let j = t - w + 1; j <= t; j++) turn += tv[j];
      if (!turn) continue;
      for (const gg of G) { const a = g[gg]; if (a && a[k] != null && a[k - w] != null) row[gg + '_cn_' + w] = (a[k] - a[k - w]) / turn; }
    }
    rowsBy[tk][day] = row;
  });
}
const tks = Object.keys(rowsBy).sort();
const allDays = [...new Set(tks.flatMap(tk => Object.keys(rowsBy[tk])))].sort();
console.log(`NeoBDM history: ${tks.length} stocks, ${allDays.length} sessions with flow rows (${allDays[0]}..${allDays.at(-1)})`);
const flowAt = (tk, day) => {
  const r = rowsBy[tk] && rowsBy[tk][day]; if (!r) return null;
  const b = px[tk + '.JK'], t = pxIdx[tk].get(day); if (t == null || t < 20) return null;
  return readFlow(r, { chg5: b.c[t] / b.c[t - 5] - 1, chg20: b.c[t] / b.c[t - 20] - 1 });
};

// ---------- T1: forward-test replay ----------
const bars = Object.fromEntries(tks.map(tk => [tk + '.JK', px[tk + '.JK']]));
const snapsFor = (filter, step = 1) => allDays.filter((_, i) => i % step === 0).map(date => ({ date, rows: Object.fromEntries(tks.filter(filter).filter(tk => rowsBy[tk][date] && Object.keys(rowsBy[tk][date]).length).map(tk => [tk, rowsBy[tk][date]])) })).filter(s => Object.keys(s.rows).length > 10);
const sc = scoreSnaps(snapsFor(() => true), bars);
const scUnseen = scoreSnaps(snapsFor(tk => !DESIGN.has(tk)), bars);
const scStep = scoreSnaps(snapsFor(() => true, 5), bars);
const h5 = sc.horizons[5], h15 = sc.horizons[15];
console.log('\n===== T1 PRIMARY: forward-test replay (live checklist, every session) =====');
for (const [k, g] of Object.entries({ ...h5.tags, ...h5.phases })) if (g.n) console.log(`  ${k.padEnd(13)} n ${String(g.n).padStart(6)}  5-session net ${pc(g.avgNet).padStart(7)} excess ${pc(g.avgExcess).padStart(7)} t ${f2(g.t)}`);
console.log(`  FLOW+ minus FLOW-: 5s ${pc(h5.spread.avg)} t ${f2(h5.spread.t)} (adj ${f2(h5.spread.tAdj)}) over ${h5.spread.days} d; halves ${pc(h5.spread.firstHalf)} / ${pc(h5.spread.secondHalf)}; 15s ${pc(h15.spread.avg)}`);
const extra = [
  { rule: '(e) spread > 0 on the 73 unseen stocks', ok: scUnseen.horizons[5].spread.avg > 0, value: +(scUnseen.horizons[5].spread.avg * 100).toFixed(2) },
  { rule: '(f) every 5th session only: spread t >= 2', ok: scStep.horizons[5].spread.avg > 0 && scStep.horizons[5].spread.t >= 2, value: +f2(scStep.horizons[5].spread.t) },
];
const t1checks = sc.promotion.checks.concat(extra), t1pass = t1checks.every(c => c.ok);
t1checks.forEach(c => console.log(`  ${c.ok ? '[x]' : '[ ]'} ${c.rule} -> ${JSON.stringify(c.value)}`));
console.log(`  T1 -> ${t1pass ? 'PASS' : 'fail'}`);

// ---------- ACT signals in the window, live trade ----------
function sim(b, i0, stop, target, horizon) {
  const j0 = i0 + 1; if (j0 >= b.c.length) return null;
  const entry = b.o[j0], last = j0 + horizon - 1; if (last >= b.c.length) return null;
  for (let j = j0; j <= last; j++) {
    if (b.l[j] <= stop) return { ret: Math.min(stop, b.o[j]) / entry - 1 - FEE, exitIdx: j, entryIdx: j0 };
    if (b.h[j] >= target) return { ret: Math.max(target, b.o[j]) / entry - 1 - FEE, exitIdx: j, entryIdx: j0 };
  }
  return { ret: b.c[last] / entry - 1 - FEE, exitIdx: last, entryIdx: j0 };
}
const S = [];
for (const tk of tks) {
  const b = px[tk + '.JK'];
  for (const day of Object.keys(rowsBy[tk])) {
    const t = pxIdx[tk].get(day), ii = idxBy.get(day); if (t == null || t < 250 || ii == null || ii < 200) continue;
    const lo = Math.max(0, t + 1 - WINDOW);
    const w = { d: b.d.slice(lo, t + 1), o: b.o.slice(lo, t + 1), h: b.h.slice(lo, t + 1), l: b.l.slice(lo, t + 1), c: b.c.slice(lo, t + 1), v: b.v.slice(lo, t + 1) };
    const a = api.analyse_(w, idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
    if (!a || a.avgValue / 1e9 < 5 || a.stop >= a.entry) continue;
    const score = api.score_(a, 0); if (score < api.ACT_SCORE) continue;
    const wide = api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down');
    const tr = sim(b, t, wide, a.target, 15); if (!tr) continue;
    const fr = flowAt(tk, day); if (!fr) continue;
    const n = w.c.length, confirm = w.c[n - 1] > w.h[n - 2] || (w.c[n - 1] > w.o[n - 1] && w.c[n - 1] > w.c[n - 2]);
    const s200 = mean(idx.c.slice(ii - 199, ii + 1));
    S.push({ tk, day, score, confirm, design: DESIGN.has(tk), tr, tag: fr.tag, phase: fr.phase, marketOk: idx.c[ii] > s200 });
  }
}
const sdays = [...new Set(S.map(s => s.day))].sort(), dIdx = new Map(sdays.map((d, i) => [d, i]));
console.log(`\nACT signal-days with a flow read: ${S.length} (${sdays[0]}..${sdays.at(-1)}); tags ${JSON.stringify(Object.fromEntries(['FLOW+', 'FLOW~', 'FLOW-'].map(k => [k, S.filter(s => s.tag === k).length])))}`);
function episodes(A) { const by = {}, ep = []; A.forEach(s => { (by[s.tk] = by[s.tk] || []).push(s); }); Object.values(by).forEach(l => { l.sort((a, b) => a.day.localeCompare(b.day)); let last = -1e9; l.forEach(s => { const i = dIdx.get(s.day); if (i - last >= 15) { ep.push(s); last = i; } }); }); return ep; }
function welch(a, b) { if (a.length < 8 || b.length < 8) return { gap: null, t: null, na: a.length, nb: b.length, ma: a.length ? mean(a) : null, mb: b.length ? mean(b) : null }; const ma = mean(a), mb = mean(b); return { gap: ma - mb, t: (ma - mb) / Math.sqrt(sdv(a) ** 2 / a.length + sdv(b) ** 2 / b.length), ma, mb, na: a.length, nb: b.length }; }
function byDay(A, inA, inB) { const by = {}; A.forEach(s => { (by[s.day] = by[s.day] || []).push(s); }); const g = Object.values(by).map(l => { const p = l.filter(inA), q = l.filter(inB); return p.length && q.length ? mean(p.map(s => s.tr.ret)) - mean(q.map(s => s.tr.ret)) : null; }).filter(x => x != null); return g.length > 5 ? { gap: mean(g), t: mean(g) / (sdv(g) / Math.sqrt(g.length)), days: g.length } : { gap: null, t: null, days: g.length }; }
const results = [];
function groupTest(id, name, primary, A, inA, inB) {
  const v = s => s.tr.ret, bar = primary ? 2 : 2.5, ep = episodes(A);
  const e = welch(ep.filter(inA).map(v), ep.filter(inB).map(v)), c = byDay(A, inA, inB);
  const un = welch(A.filter(s => !s.design && inA(s)).map(v), A.filter(s => !s.design && inB(s)).map(v));
  const h1 = welch(A.filter(s => s.day < SPLIT && inA(s)).map(v), A.filter(s => s.day < SPLIT && inB(s)).map(v));
  const h2 = welch(A.filter(s => s.day >= SPLIT && inA(s)).map(v), A.filter(s => s.day >= SPLIT && inB(s)).map(v));
  const pass = e.t != null && c.t != null && e.t >= bar && c.t >= bar && un.gap > 0 && h1.gap > 0 && h2.gap > 0;
  console.log(`\n${id} ${name}${primary ? '  [PRIMARY]' : ''}\n  episodes A ${e.na} ${pc(e.ma)} vs B ${e.nb} ${pc(e.mb)}: gap ${pc(e.gap)} t=${f2(e.t)} | by day ${pc(c.gap)} t=${f2(c.t)} (${c.days} d) | unseen ${pc(un.gap)} | halves ${pc(h1.gap)} / ${pc(h2.gap)} -> ${pass ? 'PASS' : 'fail'}`);
  const r = { id, name, primary, pass, bar, nA: e.na, nB: e.nb, avgA: e.ma, avgB: e.mb, gap: e.gap, t: e.t, gapDay: c.gap, tDay: c.t, unseen: un.gap, h1: h1.gap, h2: h2.gap };
  results.push(r); return r;
}
const T2 = groupTest('T2', 'ACT: not FLOW- (A) vs FLOW- (B)', true, S, s => s.tag !== 'FLOW-', s => s.tag === 'FLOW-');
groupTest('T3', 'ACT: FLOW+ (A) vs FLOW~ (B)', false, S, s => s.tag === 'FLOW+', s => s.tag === 'FLOW~');
groupTest('T4', 'ACT: accumulation (A) vs distribution/markdown (B)', false, S, s => s.phase === 'ACCUMULATION', s => s.phase === 'DISTRIBUTION' || s.phase === 'MARKDOWN');
console.log('\n  descriptive, live trade only (ACT + bounce candle), episodes:');
const LIVE = S.filter(s => s.confirm), epL = episodes(LIVE);
const byTag = Object.fromEntries(['FLOW+', 'FLOW~', 'FLOW-'].map(k => { const l = epL.filter(s => s.tag === k); return [k, { n: l.length, avg: l.length ? mean(l.map(s => s.tr.ret)) : null, win: l.length ? mean(l.map(s => (s.tr.ret > 0 ? 1 : 0))) : null }]; }));
Object.entries(byTag).forEach(([k, v]) => console.log(`   ${k} n ${v.n} avg ${pc(v.avg)} positive ${pc(v.win)}`));

// ---------- portfolio: live rule (ACT + bounce, market filter), with and without the FLOW- veto ----------
function portfolio(filter, maxPos = 5) {
  const sig = {}; LIVE.filter(s => s.marketOk && filter(s)).forEach(s => { (sig[s.day] = sig[s.day] || []).push(s); });
  const cal = idx.d.map(iso).filter(d => d >= sdays[0] && d <= sdays.at(-1));
  const cashDaily = (1 + CY) ** (1 / 245) - 1;
  let cash = 1, pos = [], curve = [], trades = 0;
  for (const day of cal) {
    cash *= 1 + cashDaily;
    pos = pos.filter(p => { const b = px[p.tk + '.JK']; if (iso(b.d[p.exitIdx]) <= day) { cash += p.size * (1 + p.ret); trades++; return false; } return true; });
    const val = cash + pos.reduce((s, p) => { const b = px[p.tk + '.JK'], i = pxIdx[p.tk].get(day) ?? p.lastI ?? p.entryIdx; p.lastI = i; return s + p.size * (b.c[i] / b.o[p.entryIdx]); }, 0);
    curve.push([day, val]);
    for (const s of (sig[day] || []).filter(s => !pos.some(p => p.tk === s.tk)).sort((a, b) => b.score - a.score)) { if (pos.length >= maxPos) break; const size = Math.min(cash, val / maxPos); if (size <= val * 0.01) break; cash -= size; pos.push({ tk: s.tk, size, ret: s.tr.ret, exitIdx: s.tr.exitIdx, entryIdx: s.tr.entryIdx }); }
  }
  const yrs = (Date.parse(curve.at(-1)[0]) - Date.parse(curve[0][0])) / 31557600000;
  let peak = 0, mdd = 0; curve.forEach(([, v]) => { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
  return { from: curve[0][0], to: curve.at(-1)[0], final: curve.at(-1)[1], cagr: curve.at(-1)[1] ** (1 / yrs) - 1, mdd, trades, curve: curve.filter((_, i) => i % 5 === 0) };
}
const P0 = portfolio(() => true), P1 = portfolio(s => s.tag !== 'FLOW-');
const vetoAdopt = T2.pass && P1.cagr >= P0.cagr && P1.mdd >= P0.mdd;
console.log(`\n===== PORTFOLIO ${P0.from}..${P0.to} (5 positions, market filter, cash 4.5%) =====\n  live rule        x${P0.final.toFixed(3)} CAGR ${pc(P0.cagr)} maxDD ${pc(P0.mdd)} trades ${P0.trades}\n  + FLOW- veto     x${P1.final.toFixed(3)} CAGR ${pc(P1.cagr)} maxDD ${pc(P1.mdd)} trades ${P1.trades}\n  -> veto ${vetoAdopt ? 'ADOPTED' : 'not adopted'}${T2.pass ? '' : ' (T2 failed)'}`);

// ---------- IC machinery (T5, T6): every 5th session, next-5-session excess return ----------
const fwd5 = (tk, day) => { const b = px[tk + '.JK'], t = pxIdx[tk] && pxIdx[tk].get(day); if (t == null || t + 5 >= b.c.length) return null; return b.c[t + 5] / b.o[t + 1] - 1 - FEE; };
const rk = a => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = []; o.forEach(([, i], k) => { r[i] = k; }); return r; };
const spear = (x, y) => { const rx = rk(x), ry = rk(y), mx = mean(rx), my = mean(ry); let n = 0, a = 0, b = 0; for (let i = 0; i < x.length; i++) { n += (rx[i] - mx) * (ry[i] - my); a += (rx[i] - mx) ** 2; b += (ry[i] - my) ** 2; } return a && b ? n / Math.sqrt(a * b) : 0; };
function icTest(days, feat, only = () => true) {
  const ics = [];
  days.forEach(day => {
    const pts = tks.filter(only).map(tk => { const f = feat(tk, day), r = fwd5(tk, day); return f == null || r == null ? null : [f, r]; }).filter(Boolean);
    if (pts.length < 20) return;
    const m = mean(pts.map(p => p[1]));
    ics.push({ day, ic: spear(pts.map(p => p[0]), pts.map(p => p[1] - m)) });
  });
  const v = ics.map(x => x.ic), half = ics.filter(x => x.day < SPLIT).map(x => x.ic), half2 = ics.filter(x => x.day >= SPLIT).map(x => x.ic);
  return { n: v.length, ic: mean(v), t: v.length > 3 ? mean(v) / (sdv(v) / Math.sqrt(v.length)) : null, h1: half.length ? mean(half) : null, h2: half2.length ? mean(half2) : null };
}
const step5 = allDays.filter((_, i) => i % 5 === 0);

// T5 broker concentration
const invIdx = {};
for (const tk of tks) { const inv = NB[tk].inv; if (inv && inv.d) invIdx[tk] = new Map(inv.d.map((d, i) => [d, i])); }
const bc20 = (tk, day) => {
  const inv = NB[tk].inv, k = invIdx[tk] && invIdx[tk].get(day); if (k == null || k < 19) return null;
  const nets = Object.values(inv.n).map(a => { let s = 0; for (let j = k - 19; j <= k; j++) s += a[j] || 0; return s; }).sort((a, b) => b - a);
  let vol = 0; for (let j = k - 19; j <= k; j++) vol += (inv.vol[j] || 0) / 100;
  if (!vol || nets.length < 6) return null;
  return (nets[0] + nets[1] + nets[2] + nets.at(-1) + nets.at(-2) + nets.at(-3)) / vol;
};
const invDays = step5.filter(d => tks.some(tk => invIdx[tk] && invIdx[tk].get(d) >= 19));
const T5 = icTest(invDays, bc20), T5u = icTest(invDays, bc20, tk => !DESIGN.has(tk));
// halves for the 1-year inventory: split at its own midpoint
const invMid = invDays[Math.floor(invDays.length / 2)];
const T5h = (() => { const a = icTest(invDays.filter(d => d < invMid), bc20), b = icTest(invDays.filter(d => d >= invMid), bc20); return [a.ic, b.ic]; })();
const t5pass = T5.t >= 2.5 && T5h[0] > 0 && T5h[1] > 0 && T5u.ic > 0;
console.log(`\n===== T5 broker concentration BC20 (1 year, ${T5.n} non-overlapping sessions) =====\n  mean IC ${f2(T5.ic)} t ${f2(T5.t)} | halves ${f2(T5h[0])} / ${f2(T5h[1])} | unseen ${f2(T5u.ic)} -> ${t5pass ? 'PASS' : 'fail'}`);
results.push({ id: 'T5', name: 'Broker concentration (top 3 buyers + top 3 sellers, 20 sessions) vs next 5 sessions, all stocks', primary: false, pass: t5pass, bar: 2.5, ic: T5.ic, t: T5.t, h1: T5h[0], h2: T5h[1], unseen: T5u.ic, n: T5.n });

// T6 descriptive group IC table
console.log('\n===== T6 descriptive: rank IC of each group share vs next 5 sessions (every 5th session) =====');
const t6 = {};
for (const g of G) for (const w of [5, 20]) {
  const r = icTest(step5, (tk, day) => { const row = rowsBy[tk][day]; return row ? row[g + '_cn_' + w] ?? null : null; });
  t6[g + w] = r; console.log(`  ${(g + ' ' + w + 's').padEnd(7)} IC ${f2(r.ic).padStart(6)} t ${f2(r.t).padStart(6)} | halves ${f2(r.h1)} / ${f2(r.h2)}  (${r.n} d)`);
}

// ---------- public-safe outputs ----------
// Study summary (aggregates only) for the site, and per-stock replayed TAG history (labels only, no NeoBDM numbers).
const tagHist = {};
for (const tk of tks) {
  const days = Object.keys(rowsBy[tk]).sort().slice(-60);
  tagHist[tk] = { d0: days[0], d1: days.at(-1), t: days.map(d => { const fr = flowAt(tk, d); return fr ? ({ 'FLOW+': '+', 'FLOW-': '-', 'FLOW~': '~' })[fr.tag] || '?' : '.'; }).join(''), ph: (flowAt(tk, days.at(-1)) || {}).phase || null };
  // how many sessions the current phase has lasted (within the history)
  let run = 0; for (let k = Object.keys(rowsBy[tk]).length - 1, all = Object.keys(rowsBy[tk]).sort(); k >= 0; k--) { const fr = flowAt(tk, all[k]); if (!fr || fr.phase !== tagHist[tk].ph) break; run++; }
  tagHist[tk].phDays = run;
}
fs.writeFileSync(path.join(ROOT, 'data', 'nb-history-tags.json'), JSON.stringify({ asOf: allDays.at(-1), from: allDays[0], by: tagHist }));
const strip = r => ({ ...r });
fs.writeFileSync(path.join(ROOT, 'data', 'nb-study.json'), JSON.stringify({
  asOf: new Date().toISOString().slice(0, 10), from: allDays[0], to: allDays.at(-1), stocks: tks.length, sessions: allDays.length,
  t1: { pass: t1pass, checks: t1checks, tags: Object.fromEntries(Object.entries(h5.tags).map(([k, g]) => [k, { n: g.n, avgExcess: g.avgExcess, t: g.t }])), phases: Object.fromEntries(Object.entries(h5.phases).map(([k, g]) => [k, { n: g.n, avgExcess: g.avgExcess, t: g.t }])), spread5: h5.spread, spread15: h15.spread.avg, unseen: scUnseen.horizons[5].spread.avg, step5: { avg: scStep.horizons[5].spread.avg, t: scStep.horizons[5].spread.t, days: scStep.horizons[5].spread.days } },
  act: { signals: S.length, from: sdays[0], to: sdays.at(-1), liveByTag: byTag }, results: results.map(strip),
  portfolio: { base: { cagr: P0.cagr, mdd: P0.mdd, trades: P0.trades, final: P0.final, curve: P0.curve }, veto: { cagr: P1.cagr, mdd: P1.mdd, trades: P1.trades, final: P1.final, curve: P1.curve }, from: P0.from, to: P0.to },
  vetoAdopted: vetoAdopt, groupIC: t6, invFrom: invDays[0], invTo: invDays.at(-1),
}));
console.log('\nwrote data/nb-study.json and data/nb-history-tags.json');

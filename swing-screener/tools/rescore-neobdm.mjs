// Re-score today's screener with: (1) bounce confirmation + 3.5 ATR stop (backtested, tools/experiment-v3.mjs)
// and (2) a NeoBDM overlay (NOT backtested: NeoBDM only shows today's values, so it is logged for a forward test).
// Usage: node tools/rescore-neobdm.mjs data/neobdm-YYYY-MM-DD.csv
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';

const file = process.argv[2] || path.join(ROOT, 'data', 'neobdm-2026-10-07.csv');
const nb = {};
fs.readFileSync(file, 'utf8').trim().split('\n').slice(1).forEach(l => { const [s, close, liquid, m, compM, tval, cross, fi, clean, nr, f, i, pinky, compNr] = l.split(','); nb[s] = { close: +close, liquid: +liquid, mPct: +m, compM: +compM, tval: +tval, cross: +cross, fi: +fi, clean: +clean, nr: +nr, f: +f, i: +i, pinky: +pinky, compNr: +compNr }; });

const api = loadEngine(), uni = universe(api), cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '5y', process.env.REFRESH !== '0' ? false : true);
const idx = px['^JKSE'];
const asOf = px['BBCA.JK'].d.at(-1).toISOString().slice(0, 10);

// NeoBDM overlay. Flow only counts when transactions are clean (NeoBDM's own rule: dirty/crossing flow is unreliable).
function overlay(n) {
  if (!n) return { tag: 'no data', pts: 0, note: 'not covered by NeoBDM' };
  if (n.pinky) return { tag: 'AVOID', pts: -9, note: 'Pinky flag (possible special-interest/repo activity)' };
  if (!n.liquid) return { tag: 'AVOID', pts: -9, note: 'NeoBDM: not liquid' };
  const dirty = n.cross || n.clean <= -3;
  let pts = 0;
  if (n.nr > 0) pts += 1; else if (n.nr < 0) pts -= 1;      // non-retail net buying / selling today
  if (n.i > 0) pts += 1; else if (n.i < 0) pts -= 1;        // institution
  if (n.f > 0) pts += 0.5; else if (n.f < 0) pts -= 0.5;    // foreign
  if (n.mPct > 0.05) pts += 1; else if (n.mPct < -0.05) pts -= 1; // bandar flow share of turnover
  if (!n.compNr) pts *= 0.5;                                  // non-retail method not compatible with this stock
  if (dirty) pts *= 0.5;
  const tag = pts >= 2 ? 'FLOW+' : pts <= -2 ? 'FLOW-' : 'FLOW~';
  return { tag, pts: +pts.toFixed(1), note: (dirty ? 'dirty flow (halved)' : 'clean') + (n.compNr ? '' : ', NR not compatible') };
}

const rows = [];
for (const u of uni) {
  const b = px[u.ticker + '.JK']; if (!b) continue;
  const n = b.c.length, lo = Math.max(0, n - 270);
  const w = { d: b.d.slice(lo), o: b.o.slice(lo), h: b.h.slice(lo), l: b.l.slice(lo), c: b.c.slice(lo), v: b.v.slice(lo) };
  const a = api.analyse_(w, idx.c.slice(-270), cfg); if (!a || a.avgValue / 1e9 < 5) continue;
  const m = w.c.length, score = api.score_(a, 0);
  const confirm = w.c[m - 1] > w.h[m - 2] || (w.c[m - 1] > w.o[m - 1] && w.c[m - 1] > w.c[m - 2]);
  const wide = api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down');
  const ov = overlay(nb[u.ticker]);
  // Final tier: only technical rules are backtested; NeoBDM can only veto (AVOID) or annotate, never promote on its own.
  let tier;
  if (score < api.ACT_SCORE) tier = 'WATCH';
  else if (ov.tag === 'AVOID') tier = 'SKIP';
  else if (!confirm) tier = 'WAIT';
  else tier = ov.tag === 'FLOW+' ? 'ACT+' : ov.tag === 'FLOW-' ? 'ACT?' : 'ACT';
  rows.push({ ticker: u.ticker, sector: u.sector, score, confirm, tier, close: a.close, stop: a.stop, wideStop: wide, target: a.target, rsi: a.rsi, nb: nb[u.ticker] || null, overlay: ov });
}
rows.sort((x, y) => y.score - x.score);
const order = { 'ACT+': 0, ACT: 1, 'ACT?': 2, WAIT: 3, SKIP: 4, WATCH: 5 };
const act = rows.filter(r => r.score >= api.ACT_SCORE).sort((x, y) => order[x.tier] - order[y.tier] || y.score - x.score);
console.log(`as of ${asOf} (prices) | NeoBDM ${path.basename(file)} | covered ${rows.filter(r => r.nb).length}/${rows.length}`);
const cnt = {}; act.forEach(r => { cnt[r.tier] = (cnt[r.tier] || 0) + 1; });
console.log('old ACT:', act.length, '| tiers:', JSON.stringify(cnt));
const f = x => (x == null ? '' : String(x));
console.log('\ntier  ticker sector       score cfm close  stop->wide   tgt   | NR    F     I     %M    clean x  comp | overlay');
act.forEach(r => { const n = r.nb || {}; console.log(r.tier.padEnd(5), r.ticker.padEnd(6), r.sector.padEnd(12), String(r.score).padStart(3), r.confirm ? ' Y ' : ' - ', String(Math.round(r.close)).padStart(6), `${r.stop}->${r.wideStop}`.padEnd(12), String(r.target).padStart(5), '|', f(n.nr).padStart(6), f(n.f).padStart(6), f(n.i).padStart(6), (n.mPct != null ? (n.mPct * 100).toFixed(0) + '%' : '').padStart(5), f(n.clean).padStart(5), n.cross ? 'X' : '-', n.compNr ? 'NR' : '--', '|', r.overlay.tag, r.overlay.pts, r.overlay.note); });
fs.mkdirSync(path.join(ROOT, 'data', 'neobdm-ledger'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'neobdm-ledger', `${asOf}.json`), JSON.stringify({ asOf, neobdmFile: path.basename(file), picks: act }, null, 1));

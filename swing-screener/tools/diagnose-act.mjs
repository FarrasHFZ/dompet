// DIAGNOSIS (2026-10-12): why so few "convinced ACT" calls? Not a test of an edge: it counts where stocks drop out of the
// ACT funnel and checks each suspect (the target, the stock list, the score/candle timing, the market) on the 300.
// Usage: node tools/diagnose-act.mjs [from=2024-10-01]
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, expansionTickers, loadPrices, ROOT } from './lib.mjs';
import { scoreCached, sim, bounce, iso } from './act-funnel.mjs';

const api = loadEngine(), NEW = expansionTickers(), U = universe(api).map(u => u.ticker);
const FROM = process.argv[2] || '2024-10-01', ACT = api.ACT_SCORE, cfg = { targetPct: 8, stopMult: 2.5, horizon: 15, minValueB: 5 };
const px = await loadPrices(U.map(t => t + '.JK').concat(['^JKSE']), '10y', true), idx = px['^JKSE'];
const pct = (x, d = 1) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

const F = { stockDays: 0, liquid: 0, radar: 0, radarTested: 0, act: 0 };
const episodes = [], bounceDays = [], calls = [], troughs = [];
let t0 = Date.now(), done = 0;
for (const tk of U) {
  const b = px[tk + '.JK']; if (!b || b.c.length < 300) continue;
  const S = scoreCached(api, tk, b, idx, cfg, 45), sc = k => (S.rows.get(k) || { score: 0 }).score, tested = !NEW.has(tk);
  let ep = null;
  for (let k = 251; k < b.c.length - 1; k++) {
    const day = iso(b.d[k]); if (day < FROM) continue;
    F.stockDays++; if (!S.liq[k]) { if (ep) { episodes.push(ep); ep = null; } continue; }
    F.liquid++;
    const s = sc(k), bo = bounce(b, k);
    if (bo) bounceDays.push({ tk, k, day, s, prev: sc(k - 1), max5: Math.max(...[1, 2, 3, 4, 5].map(i => sc(k - i))), tested });
    if (s >= ACT) {
      F.radar++; if (tested) F.radarTested++;
      if (!ep) ep = { tk, start: day, k0: k, len: 0, act: false, actDay: null, tested, after: null };
      ep.len++;
      if (bo && tested) { ep.act = true; F.act++; const r = S.rows.get(k), x = sim(b, k, api.roundToTick_(Math.min(r.stop, r.entry - 3.5 * r.atr), 'down'), r.target); if (x) calls.push({ tk, day, ...x }); }
    } else if (ep) {
      // the first bounce candle within 5 sessions after the episode ended (score already back under the bar)
      ep.endK = k;
      for (let j = k; j < Math.min(b.c.length - 1, k + 5); j++) if (bounce(b, j)) { ep.after = { lag: j - k + 1, score: sc(j) }; break; }
      episodes.push(ep); ep = null;
    }
  }
  if (ep) episodes.push(ep);
  // Rally starts: a 20-session closing low followed by +8% (close) within 15 sessions. Was the stock flagged around it?
  for (let k = 271; k < b.c.length - 16; k++) {
    if (iso(b.d[k]) < FROM || !S.liq[k]) continue;
    if (b.c[k] > Math.min(...b.c.slice(k - 20, k))) continue;
    if (Math.max(...b.c.slice(k + 1, k + 16)) / b.c[k] - 1 < 0.08) continue;
    const near = [0, 1, 2, 3].map(i => sc(k + i));
    troughs.push({ tk, day: iso(b.d[k]), tested, radar: near.some(x => x >= ACT), act: [0, 1, 2, 3].some(i => sc(k + i) >= ACT && bounce(b, k + i)), lowScore: sc(k) });
    k += 15;
  }
  if (++done % 50 === 0) console.log(`${done} stocks, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

const ep = episodes, epT = ep.filter(e => e.tested);
const out = [];
const P = s => { out.push(s); console.log(s); };
P(`ACT FUNNEL on the 300, ${FROM} .. ${iso(idx.d.at(-1))} (neutral news, replay rules)`);
P(`  stock-days ${F.stockDays}; liquid ${F.liquid}; score >= ${ACT} ${F.radar}; on the 100 tested stocks ${F.radarTested}; ACT (bounce candle the same day) ${F.act}`);
P(`  stocks the badge can never reach: ${NEW.size} of ${U.length} (the 200 added 2026-10-10 are SKIP by rule)`);
P(`  oversold episodes (score >= ${ACT} run): ${ep.length}; on tested stocks ${epT.length}; of those with an ACT ${epT.filter(e => e.act).length} (${pct(epT.filter(e => e.act).length / epT.length, 0)})`);
P(`  tested episodes with NO ACT whose first bounce candle came 1-5 sessions AFTER the score fell under ${ACT}: ${epT.filter(e => !e.act && e.after).length}; score on that bounce day avg ${mean(epT.filter(e => !e.act && e.after).map(e => e.after.score))?.toFixed(1)}`);
const bd = bounceDays.filter(x => x.max5 >= ACT || x.prev >= ACT);
P(`  bounce candles right after an oversold day (prev score >= ${ACT}): ${bounceDays.filter(x => x.prev >= ACT).length}; of those still >= ${ACT} on the bounce day ${bounceDays.filter(x => x.prev >= ACT && x.s >= ACT).length}; avg score drop on the bounce day ${mean(bounceDays.filter(x => x.prev >= ACT).map(x => x.s - x.prev))?.toFixed(1)} points`);
P(`  bounce candles with any of the last 5 days >= ${ACT}: ${bd.length} (vs same-day ACT ${bounceDays.filter(x => x.s >= ACT).length})`);
// Target check
const cl = calls;
P(`TARGET: ${cl.length} ACT trades; +8% hit ${pct(cl.filter(c => c.res === 'tp').length / cl.length, 0)}, stop ${pct(cl.filter(c => c.res === 'sl').length / cl.length, 0)}, time ${pct(cl.filter(c => c.res === 'time').length / cl.length, 0)}; mean ${pct(mean(cl.map(c => c.ret)), 2)}`);
P(`  best high within 15 sessions (MFE): reached +3% ${pct(cl.filter(c => c.mfe >= 0.03).length / cl.length, 0)}, +5% ${pct(cl.filter(c => c.mfe >= 0.05).length / cl.length, 0)}, +8% ${pct(cl.filter(c => c.mfe >= 0.08).length / cl.length, 0)}, +12% ${pct(cl.filter(c => c.mfe >= 0.12).length / cl.length, 0)}`);
// Rally coverage
const tr = troughs, trT = tr.filter(x => x.tested);
P(`RALLIES: ${tr.length} rally starts (20-day closing low, then +8% within 15 sessions); on tested stocks ${trT.length}`);
P(`  flagged score >= ${ACT} within 3 sessions: ${pct(tr.filter(x => x.radar).length / tr.length, 0)}; ACT within 3 sessions (tested only): ${pct(trT.filter(x => x.act).length / trT.length, 0)}; score at the low avg ${mean(tr.map(x => x.lowScore))?.toFixed(0)}`);
P(`  rally starts whose low scored < 50: ${pct(tr.filter(x => x.lowScore < 50).length / tr.length, 0)} (the oversold score never sees them)`);
fs.writeFileSync(path.join(ROOT, 'data', 'act-diagnosis.json'), JSON.stringify({ asOf: iso(new Date()), from: FROM, lines: out, funnel: F, episodes: ep.length, episodesTested: epT.length }, null, 1));

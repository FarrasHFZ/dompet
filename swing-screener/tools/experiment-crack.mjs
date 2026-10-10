// Crack the breakout: a search-aware hunt for a breakout pattern that holds out of sample.
//
// PRE-REGISTERED 2026-10-10 (the whole procedure), committed before the first run.
// Problem: search enough patterns and the best one always looks great by chance. So the SEARCH ITSELF is tested:
// the identical search is rerun 100 times on data where outcomes are replaced by a random liquid stock's outcome on the
// same date (pattern-outcome link broken, market timing kept). The real winner must beat the 95th percentile of those
// null winners before validation is even looked at.
//
// Events: breakout days of liquid stocks (Rp 5 B a day): close above the prior 20-session high. One per stock per 10
// sessions. Outcome: excess 10-session return (next open -> open 10 sessions later, minus the same-date average of all
// liquid stocks). Statistics by date (events on one date averaged first), t over dates.
// Features on the breakout day (no look-ahead):
//   technical: tight40 (40-session base range), comp (ATR20/ATR120), volx (volume / 20-session avg), brk (close vs the
//     prior 20-session high), clv (close location in the day's range), gap (open vs prior close), day (day's return),
//     r60, r120 (trend before the day), hi52 (vs 52-week high), rs60 (r60 minus IHSG r60), mkt (IHSG vs its 200-day
//     average), mkt20 (IHSG 20-session return), vol60 (daily volatility), liq (log traded value), lpx (log price),
//     new60 / new120 (also a 60 / 120-session high: binary)
//   Bandarmetrics: lpm20z, lpm40z, mf20z, ispk (intensity rank vs own 120), vr20
//   NeoBDM: bandar40, foreign40, sultan40, inst40 (net buying over 40 sessions, % of traded value), retailShare
// Conditions: each feature's top third and bottom third (cut points from the discovery events; binaries = 1 / 0);
//   then AND-pairs among the 15 best single conditions. Ranked by t (positive = long pattern), min 80 events and 25
//   dates for singles, 50 events and 20 dates for pairs, in discovery.
// Tracks (periods by signal date):
//   T1 technical only, 300 stocks: discovery 2017-10..2021-12, validation 2022-01..2024-06, holdout 2024-07..2026-09
//   T2 technical + Bandarmetrics: discovery 2023-03..2024-09, validation 2024-10..2025-09, holdout 2025-10..2026-09
//   T3 technical + NeoBDM groups: discovery 2024-12..2025-06, validation 2025-07..2025-12, holdout 2026-01..2026-09
// A track CRACKS only if ALL hold:
//   1. search-aware: the best discovery t beats the 95th percentile of the 100 null-search best t's,
//   2. validation: among the top 10 discovery conditions, the best one with excess > 0 and t >= 2 in validation is
//      the winner (none -> fail),
//   3. holdout (looked at once): winner's excess > 0 with t >= 2, and excess > 0 in both stock sets (tested 100, new 200),
//   4. stress (on validation + holdout together): (a) net of 0.4% fees and 0.5% slippage the average absolute return
//      is > 0, (b) the same condition with a 20-session horizon has excess > 0, (c) excess > 0 both when the IHSG is
//      above and below its 200-day average, (d) excess > 0 after dropping the best 5% of events.
// A cracked pattern becomes an ACT setup on the site with its own forward record. If no track cracks, that is the
// finding: on this data, no breakout pattern beats chance after an honest search; the best candidate stays a watch.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, expansionTickers } from './lib.mjs';
import { mean, sd, rnd } from './study-lib.mjs';

const NEW = expansionTickers(), U = universe(loadEngine()).map(u => u.ticker), iso = d => d.toISOString().slice(0, 10);
const NULLS = +(process.env.NULLS || 100);
const px = await loadPrices(U.map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const BM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bm-history.json'), 'utf8'));
const NB = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-history.json'), 'utf8'));
const idx = px['^JKSE'], idays = idx.d.map(iso), iAt = new Map(idays.map((d, i) => [d, i]));
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const atDay = (arr, day) => { let lo = 0, hi = arr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= day) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
const zch = (arr, k, w) => { if (k < w + 250) return null; const ch = []; for (let j = k - 250; j <= k; j += 5) if (arr[j] != null && arr[j - w] != null) ch.push(arr[j] - arr[j - w]); if (ch.length < 30 || arr[k] == null || arr[k - w] == null) return null; const s = sd(ch); return s ? (arr[k] - arr[k - w] - mean(ch)) / s : null; };
const atr = (b, k, n) => { let s = 0; for (let j = k - n + 1; j <= k; j++) s += Math.max(b.h[j] - b.l[j], Math.abs(b.h[j] - b.c[j - 1]), Math.abs(b.l[j] - b.c[j - 1])); return s / n; };

// ---- per-date universe outcomes (liquid stocks), 10 and 20 sessions ----
const liquidAt = (b, k) => k >= 20 && b.c.slice(k - 19, k + 1).reduce((s, c, j) => s + c * b.v[k - 19 + j], 0) / 20 >= 5e9 && !b.v.slice(k - 2, k + 1).some(v => !v);
const fwd = (b, k, H) => (k + H + 1 < b.c.length && b.o[k + 1] > 0 && b.o[k + H + 1] > 0 ? b.o[k + H + 1] / b.o[k + 1] - 1 : null);
const uni10 = new Map(), uni20 = new Map();
for (const t of U) { const b = px[t + '.JK']; if (!b) continue; for (let k = 260; k < b.c.length - 11; k++) { if (!liquidAt(b, k)) continue; const d = iso(b.d[k]), f = fwd(b, k, 10), g = fwd(b, k, 20); if (f != null) { if (!uni10.has(d)) uni10.set(d, []); uni10.get(d).push(f); } if (g != null) { if (!uni20.has(d)) uni20.set(d, []); uni20.get(d).push(g); } } }
const um10 = new Map([...uni10].map(([d, a]) => [d, mean(a)])), um20 = new Map([...uni20].map(([d, a]) => [d, mean(a)]));

// ---- events + features ----
const ev = [];
for (const t of U) {
  const b = px[t + '.JK'], B = BM[t], G = NB[t] && NB[t].g; if (!b) continue;
  let busy = -1;
  for (let k = 260; k < b.c.length - 11; k++) {
    if (k <= busy || !liquidAt(b, k)) continue;
    const h20 = Math.max(...b.h.slice(k - 20, k)); if (!(b.c[k] > h20)) continue;
    const day = iso(b.d[k]), f10 = fwd(b, k, 10), m10 = um10.get(day); if (f10 == null || m10 == null || uni10.get(day).length < 20) continue;
    const ii = iAt.get(day); if (ii == null || ii < 260) continue;
    busy = k + 10;
    const rets = []; for (let j = k - 59; j <= k; j++) rets.push(b.c[j] / b.c[j - 1] - 1);
    const val20 = b.c.slice(k - 19, k + 1).reduce((s, c, j) => s + c * b.v[k - 19 + j], 0), val40 = b.c.slice(k - 40, k).reduce((s, c, j) => s + c * b.v[k - 40 + j], 0);
    const isma = idx.c.slice(ii - 199, ii + 1).reduce((s, x) => s + x, 0) / 200, r60 = b.c[k - 1] / b.c[k - 61] - 1;
    const F = {
      tight40: Math.max(...b.h.slice(k - 40, k)) / Math.min(...b.l.slice(k - 40, k)) - 1, comp: atr(b, k - 1, 20) / (atr(b, k - 1, 120) || 1),
      volx: b.v[k] / (mean(b.v.slice(k - 20, k)) || 1), brk: b.c[k] / h20 - 1, clv: b.h[k] > b.l[k] ? (b.c[k] - b.l[k]) / (b.h[k] - b.l[k]) : 0.5,
      gap: b.o[k] / b.c[k - 1] - 1, day: b.c[k] / b.c[k - 1] - 1, r60, r120: b.c[k - 1] / b.c[k - 121] - 1,
      hi52: b.c[k] / Math.max(...b.h.slice(k - 251, k + 1)) - 1, rs60: r60 - (idx.c[ii - 1] / idx.c[ii - 61] - 1),
      mkt: idx.c[ii] / isma - 1, mkt20: idx.c[ii] / idx.c[ii - 20] - 1, vol60: sd(rets), liq: Math.log(val20 / 20), lpx: Math.log(b.c[k]),
      new60: b.c[k] > Math.max(...b.h.slice(k - 60, k)) ? 1 : 0, new120: b.c[k] > Math.max(...b.h.slice(k - 120, k)) ? 1 : 0,
    };
    if (B) { const q = atDay(B.d, iso(b.d[k - 1])); if (q >= 0 && B.d[q] >= iso(b.d[k - 5])) {
      F.lpm20z = zch(B.l, q, 20); F.lpm40z = zch(B.l, q, 40); F.mf20z = zch(B.m, q, 20);
      const iw = B.i.slice(Math.max(0, q - 122), q - 2).filter(x => x != null).sort((a, c) => a - c), im = Math.max(...B.i.slice(q - 2, q + 1).filter(x => x != null));
      if (iw.length >= 90 && isFinite(im)) F.ispk = atDay(iw, im) / iw.length;
      const vr = B.v.slice(q - 19, q + 1).filter(x => x != null); if (vr.length >= 15) F.vr20 = mean(vr);
    } }
    if (G) { const q1 = atDay(G.d, iso(b.d[k - 1])), q0 = atDay(G.d, iso(b.d[k - 40])); if (q0 >= 0 && q1 - q0 >= 30 && G.d[q1] >= iso(b.d[k - 5])) {
      for (const [g, nm] of [['m', 'bandar40'], ['f', 'foreign40'], ['s', 'sultan40'], ['i', 'inst40']]) if (G[g] && G[g][q1] != null && G[g][q0] != null) F[nm] = (G[g][q1] - G[g][q0]) * 1e9 / (val40 || 1);
      const pi = G.pi ? G.pi.slice(q1 - 19, q1 + 1).filter(x => x != null) : []; if (pi.length >= 15) F.retailShare = 1 - mean(pi);
    } }
    for (const key of Object.keys(F)) if (F[key] == null || !isFinite(F[key])) delete F[key];
    const f20 = fwd(b, k, 20), m20 = um20.get(day);
    ev.push({ tk: t, set: NEW.has(t) ? 'new200' : 'tested100', day, ex: f10 - m10, raw: f10, ex20: f20 != null && m20 != null ? f20 - m20 : null, up: idx.c[ii] > isma, F });
  }
}
console.log(`${ev.length} breakout events (${ev.map(e => e.day).sort()[0]} .. ${ev.map(e => e.day).sort().at(-1)})`);
const dayList = [...new Set(ev.map(e => e.day))].sort(), dIdx = new Map(dayList.map((d, i) => [d, i]));
ev.forEach(e => { e.di = dIdx.get(e.day); });

// ---- evaluation by date ----
const S = new Float64Array(dayList.length), C = new Float64Array(dayList.length);
function evalMask(ids, mask, exArr, minN, minD) {
  const touched = []; let n = 0;
  for (const i of ids) { if (!mask[i]) continue; const d = ev[i].di; if (!C[d]) touched.push(d); S[d] += exArr[i]; C[d]++; n++; }
  const xs = touched.map(d => S[d] / C[d]); touched.forEach(d => { S[d] = 0; C[d] = 0; });
  if (n < minN || xs.length < minD) return null;
  const m = mean(xs), s = sd(xs);
  return { n, dates: xs.length, ex: m, t: s ? m / (s / Math.sqrt(xs.length)) : 0 };
}
const TRACKS = {
  T1: { feats: ['tight40', 'comp', 'volx', 'brk', 'clv', 'gap', 'day', 'r60', 'r120', 'hi52', 'rs60', 'mkt', 'mkt20', 'vol60', 'liq', 'lpx', 'new60', 'new120'], P: [['2017-10-01', '2021-12-31'], ['2022-01-01', '2024-06-30'], ['2024-07-01', '2026-12-31']] },
  T2: { feats: ['tight40', 'comp', 'volx', 'brk', 'clv', 'gap', 'day', 'r60', 'r120', 'hi52', 'rs60', 'mkt', 'mkt20', 'vol60', 'liq', 'lpx', 'new60', 'new120', 'lpm20z', 'lpm40z', 'mf20z', 'ispk', 'vr20'], need: 'lpm20z', P: [['2023-03-01', '2024-09-30'], ['2024-10-01', '2025-09-30'], ['2025-10-01', '2026-12-31']] },
  T3: { feats: ['tight40', 'comp', 'volx', 'brk', 'clv', 'gap', 'day', 'r60', 'r120', 'hi52', 'rs60', 'mkt', 'mkt20', 'vol60', 'liq', 'lpx', 'new60', 'new120', 'bandar40', 'foreign40', 'sultan40', 'inst40', 'retailShare'], need: 'bandar40', P: [['2024-12-01', '2025-06-30'], ['2025-07-01', '2025-12-31'], ['2026-01-01', '2026-12-31']] },
};
const out = { asOf: new Date().toISOString().slice(0, 10), events: ev.length, tracks: {} };
const exReal = Float64Array.from(ev, e => e.ex);

for (const [tn, T] of Object.entries(TRACKS)) {
  const inP = (e, p) => e.day >= p[0] && e.day <= p[1] && (!T.need || e.F[T.need] != null);
  const ids = T.P.map(p => ev.map((e, i) => (inP(e, p) ? i : -1)).filter(i => i >= 0));
  // conditions: cut points from discovery events
  const conds = [];
  for (const f of T.feats) {
    const vals = ids[0].map(i => ev[i].F[f]).filter(v => v != null).sort((a, b) => a - b); if (vals.length < 100) continue;
    if (f === 'new60' || f === 'new120') { for (const v of [1, 0]) conds.push({ name: `${f}=${v}`, mask: Uint8Array.from(ev, e => (e.F[f] === v ? 1 : 0)) }); continue; }
    const lo = vals[Math.floor(vals.length / 3)], hi = vals[Math.floor(2 * vals.length / 3)];
    conds.push({ name: `${f} high (>${+hi.toPrecision(3)})`, f, side: 'hi', cut: hi, mask: Uint8Array.from(ev, e => (e.F[f] != null && e.F[f] > hi ? 1 : 0)) });
    conds.push({ name: `${f} low (<${+lo.toPrecision(3)})`, f, side: 'lo', cut: lo, mask: Uint8Array.from(ev, e => (e.F[f] != null && e.F[f] < lo ? 1 : 0)) });
  }
  // the search procedure (run on real and on null outcomes)
  function search(exArr) {
    const singles = conds.map(c => ({ c, r: evalMask(ids[0], c.mask, exArr, 80, 25) })).filter(x => x.r).sort((a, b) => b.r.t - a.r.t);
    const top = singles.slice(0, 15), pairs = [];
    for (let a = 0; a < top.length; a++) for (let b = a + 1; b < top.length; b++) {
      if (top[a].c.f && top[a].c.f === top[b].c.f) continue;
      const mask = top[a].c.mask.map((v, i) => v & top[b].c.mask[i]);
      const r = evalMask(ids[0], mask, exArr, 50, 20); if (r) pairs.push({ c: { name: top[a].c.name + ' AND ' + top[b].c.name, mask, parts: [top[a].c, top[b].c] }, r });
    }
    return singles.concat(pairs).sort((a, b) => b.r.t - a.r.t);
  }
  const real = search(exReal);
  // null searches
  const nullBest = [];
  const pools = new Map([...uni10].map(([d, a]) => [d, a.map(x => x - um10.get(d))]));
  for (let r = 0; r < NULLS; r++) {
    const exN = Float64Array.from(ev, e => { const p = pools.get(e.day); return p[Math.floor(rnd() * p.length)]; });
    const s = search(exN); nullBest.push(s.length ? s[0].r.t : 0);
  }
  nullBest.sort((a, b) => a - b);
  const n95 = nullBest[Math.floor(0.95 * nullBest.length)], bestT = real.length ? real[0].r.t : 0;
  console.log(`\n================ ${tn} ================  events: discovery ${ids[0].length}, validation ${ids[1].length}, holdout ${ids[2].length}`);
  console.log(`search-aware check: best real discovery t ${bestT.toFixed(2)} vs null-search best t: median ${nullBest[nullBest.length >> 1].toFixed(2)}, 95th ${n95.toFixed(2)} -> ${bestT > n95 ? 'BEATS CHANCE' : 'within chance'}`);
  console.log('top 10 discovery conditions -> validation:');
  const top10 = real.slice(0, 10).map(x => ({ ...x, v: evalMask(ids[1], x.c.mask, exReal, 1, 1) }));
  top10.forEach(x => console.log(`  ${x.c.name.padEnd(70)} disc n ${String(x.r.n).padStart(4)} ex ${pct(x.r.ex).padStart(7)} t ${x.r.t.toFixed(2).padStart(5)} | valid ${x.v ? `n ${String(x.v.n).padStart(4)} ex ${pct(x.v.ex).padStart(7)} t ${x.v.t.toFixed(2).padStart(5)}` : '–'}`));
  const T_ = { bestT, null95: n95, nullMedian: nullBest[nullBest.length >> 1], top10: top10.map(x => ({ name: x.c.name, disc: x.r, valid: x.v })), cracked: false };
  out.tracks[tn] = T_;
  const pass1 = bestT > n95;
  const surv = top10.filter(x => x.v && x.v.ex > 0 && x.v.t >= 2).sort((a, b) => b.v.t - a.v.t);
  if (!pass1 || !surv.length) { console.log(`-> ${tn} does not crack (${!pass1 ? 'the search found nothing beyond chance' : 'no top-10 condition held in validation'})`); T_.reason = !pass1 ? 'chance' : 'validation'; T_.candidate = surv[0] ? surv[0].c.name : top10[0] && top10[0].c.name; continue; }
  const W = surv[0];
  const H = evalMask(ids[2], W.c.mask, exReal, 1, 1);
  const setEx = s => { const xs = ids[2].filter(i => W.c.mask[i] && ev[i].set === s).map(i => ev[i].ex); return xs.length ? mean(xs) : null; };
  const h100 = setEx('tested100'), h200 = setEx('new200');
  console.log(`winner: ${W.c.name}\n  holdout: n ${H ? H.n : 0}, excess ${pct(H && H.ex)}, t ${H ? H.t.toFixed(2) : '–'}; tested 100 ${pct(h100)}, new 200 ${pct(h200)}`);
  const pass3 = H && H.ex > 0 && H.t >= 2 && h100 > 0 && h200 > 0;
  // stress on validation + holdout
  const vh = ids[1].concat(ids[2]).filter(i => W.c.mask[i]).map(i => ev[i]);
  const netAbs = mean(vh.map(e => (1 + e.raw) / 1.005 - 1 - 0.004)), ex20 = mean(vh.filter(e => e.ex20 != null).map(e => e.ex20));
  const upEx = mean(vh.filter(e => e.up).map(e => e.ex)), dnEx = mean(vh.filter(e => !e.up).map(e => e.ex));
  const sorted = vh.map(e => e.ex).sort((a, b) => a - b), trimmed = mean(sorted.slice(0, Math.floor(sorted.length * 0.95)));
  const st = { netAbs, ex20, upEx, dnEx, trimmed, nUp: vh.filter(e => e.up).length, nDn: vh.filter(e => !e.up).length };
  const pass4 = netAbs > 0 && ex20 > 0 && upEx > 0 && dnEx > 0 && trimmed > 0;
  console.log(`  stress: net after fees+slippage ${pct(netAbs)}, 20-session excess ${pct(ex20)}, IHSG up ${pct(upEx)} (n ${st.nUp}) / down ${pct(dnEx)} (n ${st.nDn}), without best 5% ${pct(trimmed)}`);
  Object.assign(T_, { winner: W.c.name, parts: W.c.parts ? W.c.parts.map(p => ({ f: p.f, side: p.side, cut: p.cut, name: p.name })) : [{ f: conds.find(c => c.name === W.c.name).f, side: conds.find(c => c.name === W.c.name).side, cut: conds.find(c => c.name === W.c.name).cut, name: W.c.name }], valid: W.v, holdout: H, h100, h200, stress: st, cracked: pass1 && pass3 && pass4 });
  console.log(`-> ${tn} ${T_.cracked ? 'CRACKED' : 'does not crack (' + (!pass3 ? 'holdout' : 'stress') + ')'}`);
}
out.cracked = Object.entries(out.tracks).filter(([, t]) => t.cracked).map(([k]) => k);
console.log(`\nVERDICT: ${out.cracked.length ? 'cracked in ' + out.cracked.join(', ') : 'no track cracked'}`);
fs.writeFileSync(path.join(ROOT, 'data', 'crack-study.json'), JSON.stringify(out, null, 1));

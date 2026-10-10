// Can a long-only stock picker make money while the IHSG is in a downtrend?
//
// PRE-REGISTERED 2026-10-10, committed before the first run.
// Why: the user wants to make money in bear markets, not wait for the 200-day filter. The oversold bounce lost money in
// bear markets (that is why PAUSE exists), so this looks for selections that hold up in BEAR MONTHS only.
// Universe: point in time, as in experiment-momentum-pit.mjs: each month-end, the 100 IDX codes (of 909 with Yahoo
// history) with the highest 60-session median traded value, close >= Rp 50, traded in each of the last 3 sessions,
// 252+ sessions of history. Hold 10 stocks equal weight from the next open to the next month's rebalance open,
// 0.2% fee per buy and per sell on names that change. Bear month = IHSG closed below its 200-day average on the
// rebalance day. 2017-10 .. 2026-08.
// Candidates (textbook, no tuning; 4 tests, so each needs p < 0.05 / 4 = 0.0125):
//   B1 MOM12  top 10 by 12-1 month return (close 21 sessions ago / 252 sessions ago)
//   B2 MOM3   top 10 by 3-month return skipping the last week (close 5 / close 63 sessions ago)
//   B3 LOWVOL the 10 with the lowest standard deviation of daily returns over 60 sessions
//   B4 CALM-MOM top 10 by 12-1 return among the calmer half (60-session volatility below the median)
// A candidate PASSES only if ALL hold over bear months:
//   a. average monthly return > 0 (it actually made money),
//   b. beats 10 random stocks from the same universe in the same months (2000 runs) with p < 0.0125,
//   c. average excess over equal weight (EW) positive in both halves of the bear months (split at 2022-10),
//   d. t-stat of the monthly excess over EW >= 2 (months never overlap).
// If one passes: a paper-only "Bear-market list" next to Momentum 10, used only while the IHSG is below its 200-day
// average, with its own forward record. If several pass, the one with the highest t. Reported only: bull months.
import fs from 'node:fs';
import path from 'node:path';
import { loadPrices, ROOT, CACHE } from './lib.mjs';
import { mean, sd, rnd } from './study-lib.mjs';

const FEE = 0.002, TOP = 10, SPLIT = '2022-10', iso = d => d.toISOString().slice(0, 10);
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const codes = JSON.parse(fs.readFileSync(path.join(CACHE, 'rank-all.json'), 'utf8')).map(r => r.c);
const px = await loadPrices(codes.map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const have = codes.filter(t => px[t + '.JK'] && px[t + '.JK'].c.length > 300);
const idx = px['^JKSE'], days = idx.d.map(iso);
const at = {}; for (const t of have) at[t] = new Map(px[t + '.JK'].d.map((d, i) => [iso(d), i]));
const reb = days.map((d, i) => i).filter(i => i + 1 < days.length && days[i].slice(0, 7) !== days[i + 1].slice(0, 7) && i >= 252);

const months = [];
for (let m = 0; m + 1 < reb.length; m++) {
  const i = reb[m], e0 = days[i + 1], e1 = days[reb[m + 1] + 1]; if (!e1) break;
  const sma = idx.c.slice(i - 199, i + 1).reduce((s, x) => s + x, 0) / 200;
  const cand = [];
  for (const t of have) {
    const b = px[t + '.JK'], M = at[t], k = M.get(days[i]), a = M.get(e0), z = M.get(e1);
    if (k == null || a == null || z == null || k < 252 || b.c[k] < 50 || b.v.slice(k - 2, k + 1).some(v => !v)) continue;
    const rets = []; for (let j = k - 59; j <= k; j++) rets.push(b.c[j] / b.c[j - 1] - 1);
    cand.push({ t, med: median(b.c.slice(k - 59, k + 1).map((c, j) => c * b.v[k - 59 + j])), m12: b.c[k - 21] / b.c[k - 252] - 1, m3: b.c[k - 5] / b.c[k - 63] - 1, vol: sd(rets), ret: b.o[z] / b.o[a] - 1 });
  }
  const rows = cand.sort((x, y) => y.med - x.med).slice(0, 100);
  const ia = days.indexOf(e0), iz = days.indexOf(e1);
  months.push({ ym: days[i].slice(0, 7), bear: idx.c[i] <= sma, rows, ihsg: idx.o[iz] / idx.o[ia] - 1 });
}
const by = k => rows => rows.slice().sort((a, b) => b[k] - a[k]).slice(0, TOP);
const PICK = {
  B1_MOM12: by('m12'), B2_MOM3: by('m3'),
  B3_LOWVOL: rows => rows.slice().sort((a, b) => a.vol - b.vol).slice(0, TOP),
  B4_CALM_MOM: rows => { const mv = median(rows.map(r => r.vol)); return by('m12')(rows.filter(r => r.vol < mv)); },
};
const EW = rows => rows;
const RAND = rows => { const a = rows.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, TOP); };
// monthly returns over a set of months (fees on changes; holdings reset when a month is skipped)
function run(ms, pick) {
  let prev = new Set(), lastYm = null;
  return ms.map(m => {
    const ch = pick(m.rows), set = new Set(ch.map(x => x.t));
    const contiguous = lastYm && (new Date(m.ym + '-01') - new Date(lastYm + '-01')) / 864e5 < 32;
    const held = contiguous ? prev : new Set();
    const newN = ch.filter(x => !held.has(x.t)).length, outN = [...held].filter(t => !set.has(t)).length;
    const r = mean(ch.map(x => x.ret)) - FEE * newN / ch.length - (held.size ? FEE * outN / held.size : 0);
    prev = set; lastYm = m.ym;
    return { ym: m.ym, r };
  });
}
const bear = months.filter(m => m.bear), bull = months.filter(m => !m.bear);
console.log(`${have.length} codes, ${months.length} months (${months[0].ym} .. ${months.at(-1).ym}): ${bear.length} bear, ${bull.length} bull`);
const ew = run(bear, EW), ewBull = run(bull, EW);
console.log(`bear months: IHSG ${pct(mean(bear.map(m => m.ihsg)))} a month, equal weight top-100 ${pct(mean(ew.map(x => x.r)))}; bull months: IHSG ${pct(mean(bull.map(m => m.ihsg)))}, EW ${pct(mean(ewBull.map(x => x.r)))}`);
const randMeans = []; for (let r = 0; r < 2000; r++) randMeans.push(mean(run(bear, RAND).map(x => x.r)));
randMeans.sort((a, b) => a - b);
console.log(`random 10 in bear months: median ${pct(randMeans[1000])} a month [5-95%: ${pct(randMeans[100])}, ${pct(randMeans[1900])}]\n`);
console.log('candidate      bear/month  win months  vs EW    t     1st half  2nd half  p(random)  bull/month  verdict');
const out = { asOf: new Date().toISOString().slice(0, 10), bearMonths: bear.length, ewBear: mean(ew.map(x => x.r)), ihsgBear: mean(bear.map(m => m.ihsg)), results: {} };
for (const [name, f] of Object.entries(PICK)) {
  const r = run(bear, f), ex = r.map((x, i) => x.r - ew[i].r), m = mean(r.map(x => x.r));
  const t = mean(ex) / (sd(ex) / Math.sqrt(ex.length) || 1);
  const h1 = mean(ex.filter((_, i) => bear[i].ym < SPLIT)), h2 = mean(ex.filter((_, i) => bear[i].ym >= SPLIT));
  const p = randMeans.filter(x => x >= m).length / randMeans.length, bl = mean(run(bull, f).map(x => x.r));
  const pass = m > 0 && p < 0.0125 && h1 > 0 && h2 > 0 && t >= 2;
  out.results[name] = { mean: m, win: r.filter(x => x.r > 0).length / r.length, excess: mean(ex), t, first: h1, second: h2, p, bull: bl, pass };
  console.log(`${name.padEnd(14)} ${pct(m).padStart(8)}   ${(out.results[name].win * 100).toFixed(0).padStart(5)}%    ${pct(mean(ex)).padStart(7)} ${t.toFixed(2).padStart(5)}  ${pct(h1).padStart(7)}  ${pct(h2).padStart(7)}   ${p.toFixed(4).padStart(6)}   ${pct(bl).padStart(7)}    ${pass ? 'PASS' : 'fail'}`);
}
const passed = Object.entries(out.results).filter(([, v]) => v.pass).sort((a, b) => b[1].t - a[1].t);
out.winner = passed.length ? passed[0][0] : null;
console.log(`\nVERDICT: ${out.winner ? out.winner + ' passes -> paper Bear-market list' : 'no bear-market selection passes'}`);
const last = months.at(-1);
if (out.winner) console.log(`latest (${last.ym}, ${last.bear ? 'bear' : 'bull'}): ${PICK[out.winner](last.rows).map(x => x.t).join(', ')}`);
fs.writeFileSync(path.join(ROOT, 'data', 'bear-study.json'), JSON.stringify(out, null, 1));

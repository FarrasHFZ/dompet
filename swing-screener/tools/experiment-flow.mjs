// Does foreign flow (from IDX's own daily stock summary) improve the ACT signal?
// Data: data/idx-foreign-flow.json = {YYYYMMDD: {TICKER: [close, volume, value, freq, foreignBuy, foreignSell]}} (shares, Rp).
// Samples: data/cache/experiment_v3.json (every ACT/non-ACT signal day 2022-10..2026-09 with next-open trade results, from experiment-v3.mjs).
// Pre-registered primary test (fixed BEFORE looking at results): F5 > 0, where
//   F5 = sum over the 5 sessions ending on the signal day of (foreignBuy - foreignSell) / sum of volume.
// Secondary (reported for transparency, so the number of looks is visible): F1 (signal day alone) and F20.
// Outcome = net trade return with the plan stop (r) and with the 3.5 ATR stop (rw), 0.4% fees, same rules as the live tracker.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const FLOW = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'idx-foreign-flow.json'), 'utf8'));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache', 'experiment_v3.json'), 'utf8'));
const days = Object.keys(FLOW).sort();
const di = new Map(days.map((d, i) => [d, i]));
const mean = x => x.reduce((a, b) => a + b, 0) / (x.length || 1);

function F(tk, day, n) {
  const i = di.get(day.replace(/-/g, ''));
  if (i === undefined || i < n - 1) return null;
  let net = 0, vol = 0;
  for (let k = i - n + 1; k <= i; k++) { const r = FLOW[days[k]][tk]; if (!r) return null; net += r[4] - r[5]; vol += r[1]; }
  return vol ? net / vol : null;
}
const rows = S.map(s => ({ ...s, f1: F(s.tk, s.day, 1), f5: F(s.tk, s.day, 5), f20: F(s.tk, s.day, 20) })).filter(s => s.f5 !== null && s.f20 !== null && s.f1 !== null);
console.log(`flow days ${days.length} (${days[0]}..${days[days.length - 1]}), samples with flow ${rows.length} of ${S.length}`);

const pc = x => (x == null || Number.isNaN(x) ? '  n/a' : (x * 100).toFixed(2) + '%');
function tByDay(A, key) { // mean per signal day, then t across days
  const m = {}; A.forEach(s => { (m[s.day] = m[s.day] || []).push(s[key]); });
  const v = Object.values(m).map(mean); const mu = mean(v), sd = Math.sqrt(mean(v.map(x => (x - mu) ** 2)));
  return { mu, t: v.length > 2 ? mu / (sd / Math.sqrt(v.length)) : null, days: v.length };
}
function line(label, A) {
  if (A.length < 20) return console.log(label.padEnd(34), 'n', String(A.length).padStart(5), '(too few)');
  const a = tByDay(A, 'r'), b = tByDay(A, 'rw');
  console.log(label.padEnd(34), 'n', String(A.length).padStart(5), 'days', String(a.days).padStart(4), '| plan stop avg', pc(mean(A.map(s => s.r))).padStart(7), 'win', pc(mean(A.map(s => (s.st === 'win' ? 1 : 0)))).padStart(6), '| wide stop avg', pc(mean(A.map(s => s.rw))).padStart(7), 'win', pc(mean(A.map(s => (s.stw === 'win' ? 1 : 0)))).padStart(6), 't(day)', b.t == null ? 'n/a' : b.t.toFixed(2));
}
function spearman(x, y) {
  const rk = a => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); o.forEach(([, i], k) => { r[i] = k; }); return r; };
  const rx = rk(x), ry = rk(y), mx = mean(rx), my = mean(ry); let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) { n += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return n / Math.sqrt(dx * dy || 1);
}
const split = '2024-10-01';
function block(title, A) {
  console.log(`\n=== ${title} (ACT signals with flow data: ${A.length}) ===`);
  line('ACT all', A);
  line('PRIMARY  F5 > 0 (foreign buying)', A.filter(s => s.f5 > 0));
  line('         F5 <= 0', A.filter(s => s.f5 <= 0));
  line('F5 top third', [...A].sort((a, b) => b.f5 - a.f5).slice(0, Math.floor(A.length / 3)));
  line('F5 bottom third', [...A].sort((a, b) => a.f5 - b.f5).slice(0, Math.floor(A.length / 3)));
  line('secondary F1 > 0', A.filter(s => s.f1 > 0));
  line('secondary F20 > 0', A.filter(s => s.f20 > 0));
  line('F5>0 AND confirm candle', A.filter(s => s.f5 > 0 && s.confirm));
  line('confirm candle only', A.filter(s => s.confirm));
  if (A.length > 50) console.log('  rank IC of F5 vs wide-stop net return (pooled):', spearman(A.map(s => s.f5), A.map(s => s.rw)).toFixed(3), '| F1', spearman(A.map(s => s.f1), A.map(s => s.rw)).toFixed(3), '| F20', spearman(A.map(s => s.f20), A.map(s => s.rw)).toFixed(3));
}
const ACT = rows.filter(s => s.act);
block('ALL ACT', ACT);
block('73 unseen stocks', ACT.filter(s => !s.design));
block(`later half (>= ${split})`, ACT.filter(s => s.day >= split));
block(`earlier half (< ${split})`, ACT.filter(s => s.day < split));
console.log('\n-- by year, F5>0 vs F5<=0, ACT wide stop avg net');
for (const y of ['2022', '2023', '2024', '2025', '2026']) {
  const A = ACT.filter(s => s.day.startsWith(y)), p = A.filter(s => s.f5 > 0), q = A.filter(s => s.f5 <= 0);
  console.log(y, 'F5>0 n', p.length, pc(mean(p.map(s => s.rw))), '| F5<=0 n', q.length, pc(mean(q.map(s => s.rw))));
}
// Does foreign flow predict returns for ALL stocks (not just ACT)? Cross-sectional IC by month on forward trade net return.
const byM = {}; rows.forEach(s => { (byM[s.day.slice(0, 7)] = byM[s.day.slice(0, 7)] || []).push(s); });
const ics = Object.values(byM).filter(g => g.length > 150).map(g => spearman(g.map(s => s.f5), g.map(s => s.rw)));
const mu = mean(ics), sd = Math.sqrt(mean(ics.map(x => (x - mu) ** 2)));
console.log(`\nAll signals (not only ACT): monthly cross-sectional rank IC of F5 vs wide-stop net return = ${mu.toFixed(3)} (t=${(mu / (sd / Math.sqrt(ics.length))).toFixed(2)}, ${ics.length} months, ${(ics.filter(x => x > 0).length / ics.length * 100).toFixed(0)}% positive)`);

// ---- Decision (rule fixed before the run, 2026-10-09) and data/flow-experiment.json for the site ----
// Foreign flow becomes a trading rule (ACT needs F5 > 0) only if, with the wide stop:
//   (a) ACT with F5 > 0 beats ACT with F5 <= 0 by Welch t >= 2 on all stocks, AND
//   (b) the gap has the same sign on the 73 unseen stocks and in both halves of the period.
// AMENDED 2026-10-09, after the first full run (disclosed, not hidden): (a) treats ~3,300 overlapping trades as independent.
// A stock that stays oversold for a week yields five near-identical trades, which inflates t. The first run passed (a)
// with t=2.2 but failed both corrected versions, so adoption now ALSO needs
//   (c) day-clustered gap (one observation per day with both groups) t >= 2, and
//   (d) one trade per stock episode (no new signal within 15 sessions of the last) Welch t >= 2.
function welch(a, b) {
  const va = a.map(s => s.rw), vb = b.map(s => s.rw), ma = mean(va), mb = mean(vb);
  const sa = va.reduce((s, x) => s + (x - ma) ** 2, 0) / (va.length - 1), sb = vb.reduce((s, x) => s + (x - mb) ** 2, 0) / (vb.length - 1);
  return { gap: ma - mb, t: (ma - mb) / Math.sqrt(sa / va.length + sb / vb.length) };
}
const gapOf = A => welch(A.filter(s => s.f5 > 0), A.filter(s => s.f5 <= 0));
const all = gapOf(ACT), unseen = gapOf(ACT.filter(s => !s.design)), early = gapOf(ACT.filter(s => s.day < split)), late = gapOf(ACT.filter(s => s.day >= split));
// (c) day-clustered
const tOf = v => { const m = mean(v), sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); return m / (sd / Math.sqrt(v.length)); };
const byDayA = {}; ACT.forEach(s => { (byDayA[s.day] = byDayA[s.day] || []).push(s); });
const dayGaps = Object.values(byDayA).map(l => { const p = l.filter(s => s.f5 > 0), q = l.filter(s => s.f5 <= 0); return p.length && q.length ? mean(p.map(s => s.rw)) - mean(q.map(s => s.rw)) : null; }).filter(x => x != null);
const clustered = { gap: mean(dayGaps), t: tOf(dayGaps), days: dayGaps.length };
// (d) one trade per stock episode
const ep = []; const byTk = {}; ACT.forEach(s => { (byTk[s.tk] = byTk[s.tk] || []).push(s); });
Object.values(byTk).forEach(l => { l.sort((a, b) => a.day.localeCompare(b.day)); let last = -1e9; l.forEach(s => { const i = di.get(s.day.replace(/-/g, '')); if (i - last >= 15) { ep.push(s); last = i; } }); });
const episodes = { ...gapOf(ep), n: ep.length };
const adopt = all.t >= 2 && unseen.gap > 0 && early.gap > 0 && late.gap > 0 && clustered.t >= 2 && episodes.t >= 2;
console.log(`\nDECISION: F5>0 minus F5<=0 (wide stop) gap ${pc(all.gap)} t=${all.t.toFixed(2)} | unseen ${pc(unseen.gap)} | early ${pc(early.gap)} | late ${pc(late.gap)}`);
console.log(`  clustered by day: gap ${pc(clustered.gap)} t=${clustered.t.toFixed(2)} (${clustered.days} days) | one per episode: gap ${pc(episodes.gap)} t=${episodes.t.toFixed(2)} (${episodes.n} trades) -> ${adopt ? 'ADOPT as a rule' : 'do NOT adopt'}`);
const row = (label, A) => ({ label, n: A.length, avg: mean(A.map(s => s.rw)), win: mean(A.map(s => (s.stw === 'win' ? 1 : 0))), t: A.length > 20 ? tByDay(A, 'rw').t : null });
fs.writeFileSync(path.join(ROOT, 'data', 'flow-experiment.json'), JSON.stringify({
  asOf: new Date().toISOString().slice(0, 10), from: days[0], to: days.at(-1), adopt,
  gap: { all, unseen, early, late, clustered, episodes },
  summary: `IDX daily foreign buy/sell, ${days[0]} to ${days.at(-1)}, ${ACT.length} ACT signals. Test fixed in advance: does 5-day foreign net buying (F5 > 0) improve ACT trades? Gap ${(all.gap * 100).toFixed(2)} points per trade (t=${all.t.toFixed(1)}); 73 unseen stocks ${(unseen.gap * 100).toFixed(2)}, first half ${(early.gap * 100).toFixed(2)}, second half ${(late.gap * 100).toFixed(2)}. Corrected for overlapping trades: clustered by day ${(clustered.gap * 100).toFixed(2)} (t=${clustered.t.toFixed(1)}), one trade per episode ${(episodes.gap * 100).toFixed(2)} (t=${episodes.t.toFixed(1)}). Verdict: ${adopt ? 'adopted as a rule' : 'not adopted: the raw gap looks real but does not survive the overlap correction, so foreign flow stays a note, not a rule'}.`,
  rows: [row('All ACT', ACT), row('ACT, foreign buying 5d (F5 > 0)', ACT.filter(s => s.f5 > 0)), row('ACT, foreign selling 5d', ACT.filter(s => s.f5 <= 0)),
    row('ACT + bounce candle', ACT.filter(s => s.confirm)), row('ACT + bounce candle + F5 > 0', ACT.filter(s => s.confirm && s.f5 > 0)), row('ACT + bounce candle, F5 <= 0', ACT.filter(s => s.confirm && s.f5 <= 0))],
}));

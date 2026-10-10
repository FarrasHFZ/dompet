// Shared validation harness for signal studies (2026-10-10). It bakes in the lessons of the 10-year check:
//  - samples are taken on NON-OVERLAPPING dates (every `step` sessions), so one price move is never counted twice;
//  - the null is a PERMUTATION of the signal across stocks within each date: market timing stays, stock information
//    goes. (A same-day random-stock null rewarded stock type and passed on shuffled prices; this one cannot.)
//  - results are reported per half, and a pass needs the same sign in both.
// A sample is { date, tk, sig, fwd } where fwd is the forward return measured from the NEXT session's open.

export const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
export const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
let seed = 20261010;
export const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
export const reseed = s => { seed = s; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Per date: mean forward return (excess over that date's sample mean) of the top third by signal minus the bottom third.
function spreads(byDate, minN) {
  const out = [];
  for (const [date, rows] of byDate) {
    if (rows.length < minN) continue;
    const s = rows.slice().sort((a, b) => a.sig - b.sig), k = Math.floor(s.length / 3);
    out.push({ date, v: mean(s.slice(-k).map(r => r.fwd)) - mean(s.slice(0, k).map(r => r.fwd)), n: s.length });
  }
  return out;
}
const group = samples => { const m = new Map(); for (const x of samples) { if (!m.has(x.date)) m.set(x.date, []); m.get(x.date).push(x); } return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)); };

// Top-third minus bottom-third spread with a within-date permutation p-value (one-sided in `dir`: +1 expects top > bottom).
export function terciles(samples, { split, dir = 1, runs = 2000, minN = 9 } = {}) {
  const byDate = group(samples);
  const real = spreads(byDate, minN);
  const m = mean(real.map(x => x.v)), t = m / (sd(real.map(x => x.v)) / Math.sqrt(real.length || 1) || 1);
  const half = a => real.filter(x => (a ? x.date < split : x.date >= split)).map(x => x.v);
  let hits = 0;
  for (let r = 0; r < runs; r++) {
    const perm = byDate.map(([d, rows]) => { const sigs = shuffle(rows.map(x => x.sig)); return [d, rows.map((x, i) => ({ ...x, sig: sigs[i] }))]; });
    const pm = mean(spreads(perm, minN).map(x => x.v));
    if (dir * pm >= dir * m) hits++;
  }
  return { dates: real.length, avgN: mean(real.map(x => x.n)), spread: m, t, p: hits / runs, first: mean(half(true)), second: mean(half(false)), nFirst: half(true).length, nSecond: half(false).length };
}

// Pass rule used by every pre-registered study built on this harness. The t-stat over non-overlapping dates is required
// too: for signals that are a stable trait of a stock (volatility, retail share), within-date shuffling breaks the
// persistence and makes the permutation null too narrow (found 2026-10-10: Volume Rotation p 0.001 with t only 1.7).
export const passes = (r, dir = 1, alpha = 0.05, tMin = 2) => r.p < alpha && dir * r.t >= tMin && dir * r.first > 0 && dir * r.second > 0;
export const fmt = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');

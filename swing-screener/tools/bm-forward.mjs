// Forward test of two Bandarmetrics leads on oversold stocks (tools/experiment-bmpattern.mjs, reported, not tests):
//   MF  Money Flow 20-session change above its own year's norm: +0.95% vs +0.09% per trade, t 1.84 (looked helpful)
//   IS  Intensity spike (max of last 3 sessions in the stock's top 20% of 120): -0.42% vs +0.69%, t -2.25 (looked harmful)
// PRE-REGISTERED 2026-10-10, before any forward data. Samples: ledger days from 2026-10-13 with bmMf / bmInt logged,
// score >= 65, one per stock episode (skip until the trade closes). Outcome: the live trade (next open, stop
// min(plan stop, entry - 3.5 ATR), plan target, 15 sessions, 0.4% fees).
// PROMOTE only with >= 150 resolved episodes AND Welch t >= 2 in the expected direction AND the same sign in both
// halves: MF -> +1 supporting point in the score ("money flowing in"); IS -> veto, oversold setups become SKIP ("selling
// not done"). Until then they are logged and shown only in the Signal lab.
import fs from 'node:fs';
import path from 'node:path';
import { loadPrices, ROOT } from './lib.mjs';
import { mean, sd } from './study-lib.mjs';

const FROM = '2026-10-13', FEE = 0.004, H = 15, iso = d => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
const HIST = path.join(ROOT, 'data', 'history');
const days = fs.readdirSync(HIST).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f) && f.slice(0, 10) >= FROM).sort();
const led = days.map(f => ({ day: f.slice(0, 10), picks: JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8')).picks }));
const tks = [...new Set(led.flatMap(l => l.picks.filter(p => p.score >= 65 && (p.bmMf != null || p.bmInt != null)).map(p => p.ticker)))];
const px = tks.length ? await loadPrices(tks.map(t => t + '.JK'), '2y', process.env.USE_CACHE === '1') : {};
const eps = [], busy = {};
for (const l of led) for (const p of l.picks) {
  if (p.score < 65 || (p.bmMf == null && p.bmInt == null) || !p.atr) continue;
  const b = px[p.ticker + '.JK']; if (!b) continue;
  const k = b.d.findIndex(d => iso(d) === l.day); if (k < 0 || (busy[p.ticker] != null && k <= busy[p.ticker])) continue;
  if (k + H >= b.c.length) { busy[p.ticker] = Infinity; continue; } // unresolved: wait, and keep the episode blocked
  const stop = Math.min(p.stop, p.entry - 3.5 * p.atr), e = b.o[k + 1];
  let ret = b.c[k + H] / e - 1 - FEE, j1 = k + H;
  for (let j = k + 1; j <= k + H; j++) { if (b.l[j] <= stop) { ret = Math.min(stop, b.o[j]) / e - 1 - FEE; j1 = j; break; } if (b.h[j] >= p.target) { ret = Math.max(p.target, b.o[j]) / e - 1 - FEE; j1 = j; break; } }
  busy[p.ticker] = j1;
  eps.push({ day: l.day, mf: p.bmMf, is: p.bmInt, ret });
}
const welch = (a, b) => { const g = mean(a) - mean(b), se = Math.sqrt(sd(a) ** 2 / (a.length || 1) + sd(b) ** 2 / (b.length || 1)); return { gap: g, t: se ? g / se : 0, n: a.length + b.length }; };
const test = (key, dir) => {
  const rs = eps.filter(e => e[key] != null), mid = rs.map(e => e.day).sort()[rs.length >> 1];
  const all = welch(rs.filter(e => e[key]).map(e => e.ret), rs.filter(e => !e[key]).map(e => e.ret));
  const h = f => welch(rs.filter(e => f(e) && e[key]).map(e => e.ret), rs.filter(e => f(e) && !e[key]).map(e => e.ret));
  const a = h(e => e.day < mid), b = h(e => e.day >= mid);
  return { ...all, first: a.gap, second: b.gap, promote: rs.length >= 150 && dir * all.t >= 2 && dir * a.gap > 0 && dir * b.gap > 0 };
};
const res = { asOf: new Date().toISOString().slice(0, 10), from: FROM, episodes: eps.length, needed: 150, mf: test('mf', 1), is: test('is', -1) };
fs.writeFileSync(path.join(ROOT, 'data', 'bm-forward.json'), JSON.stringify(res));
console.log(`bm forward: ${eps.length} of 150 resolved episodes; money flow gap ${(res.mf.gap * 100).toFixed(2)}% (t ${res.mf.t.toFixed(2)})${res.mf.promote ? ' PROMOTE' : ''}; intensity spike gap ${(res.is.gap * 100).toFixed(2)}% (t ${res.is.t.toFixed(2)})${res.is.promote ? ' PROMOTE' : ''}`);

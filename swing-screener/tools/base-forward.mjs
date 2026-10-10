// Forward test of "sideways base -> accumulation -> breakout" (tools/experiment-base.mjs failed on history: all three
// accumulation versions; the LPM version pointed the right way, +1.03% excess vs -0.58% without, t 0.76).
// PRE-REGISTERED 2026-10-10, before any forward data. Events: ledger days from 2026-10-13 with base = 'brk', one per
// stock per 15 sessions. Outcome: next open -> open 15 sessions later, minus the same-day average of every ledger stock.
// Versions: acc contains B (bandar), L (LPM) or F (foreign). PROMOTE a version to an ACT setup only with >= 60 events
// in it, mean excess > 0 with t >= 2 (by date) and > breakouts without it, and positive in both halves.
import fs from 'node:fs';
import path from 'node:path';
import { loadPrices, ROOT } from './lib.mjs';
import { mean, sd } from './study-lib.mjs';

const FROM = '2026-10-13', H = 15, iso = d => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
const HIST = path.join(ROOT, 'data', 'history');
const led = fs.readdirSync(HIST).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f) && f.slice(0, 10) >= FROM).sort().map(f => ({ day: f.slice(0, 10), picks: JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8')).picks }));
const tks = [...new Set(led.flatMap(l => l.picks.map(p => p.ticker)))];
const px = tks.length ? await loadPrices(tks.map(t => t + '.JK'), '2y', process.env.USE_CACHE === '1') : {};
const fwd = (t, day) => { const b = px[t + '.JK']; if (!b) return null; const k = b.d.findIndex(d => iso(d) === day); return k < 0 || k + H + 1 >= b.c.length ? null : b.o[k + H + 1] / b.o[k + 1] - 1; };
const ev = [], last = {};
for (const l of led) {
  const all = l.picks.map(p => fwd(p.ticker, l.day)).filter(x => x != null); if (all.length < 20) continue;
  const um = mean(all);
  for (const p of l.picks) {
    if (p.base !== 'brk' || (last[p.ticker] && tks && l.day <= last[p.ticker])) continue;
    const f = fwd(p.ticker, l.day); if (f == null) continue;
    const b = px[p.ticker + '.JK'], k = b.d.findIndex(d => iso(d) === l.day); last[p.ticker] = iso(b.d[Math.min(b.d.length - 1, k + H)]);
    ev.push({ day: l.day, acc: p.acc || '', ex: f - um });
  }
}
const stat = rs => { const by = new Map(); rs.forEach(r => { if (!by.has(r.day)) by.set(r.day, []); by.get(r.day).push(r.ex); }); const xs = [...by.values()].map(mean); const ds = rs.map(r => r.day).sort(), mid = ds[ds.length >> 1];
  return { n: rs.length, ex: mean(xs), t: xs.length > 1 ? mean(xs) / (sd(xs) / Math.sqrt(xs.length) || 1) : 0, first: mean(rs.filter(r => r.day < mid).map(r => r.ex)), second: mean(rs.filter(r => r.day >= mid).map(r => r.ex)) }; };
const res = { asOf: new Date().toISOString().slice(0, 10), from: FROM, events: ev.length, needed: 60, versions: {} };
for (const [k, c] of [['bandar', 'B'], ['lpm', 'L'], ['foreign', 'F']]) {
  const y = stat(ev.filter(e => e.acc.includes(c))), n = stat(ev.filter(e => !e.acc.includes(c)));
  res.versions[k] = { with: y, without: n, promote: y.n >= 60 && y.ex > 0 && y.t >= 2 && y.ex > n.ex && y.first > 0 && y.second > 0 };
}
fs.writeFileSync(path.join(ROOT, 'data', 'base-forward.json'), JSON.stringify(res));
console.log(`base forward: ${ev.length} breakout events since ${FROM}; ` + Object.entries(res.versions).map(([k, v]) => `${k} ${v.with.n}/60${v.promote ? ' PROMOTE' : ''}`).join(', '));

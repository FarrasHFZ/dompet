// Speculation-season meter + speculative-breakout watch (from experiment-crack / experiment-spec, 2026-10-10).
// SPEC breakout: close above the prior 20-session high, price < Rp 854, 60-session daily volatility > 3.21%, liquid.
// Tested as a fixed pattern it FAILED (2026: -1.25% excess; 612 unseen stocks +0.16%, -4.6% without the best 5%). An
// exploratory, contaminated look found it pays only in speculative seasons (+3.2% excess when it had worked over the
// previous 60 sessions, but -2.2% without the best 5%: a lottery). So it is shown as a watch with a season meter.
// FORWARD TEST (pre-registered 2026-10-10, before any forward data): ledger days from 2026-10-13 with spec = 1 while the
// season is ON; outcome next open -> open 10 sessions later minus the same-day average of all ledger stocks.
// PROMOTE to an ACT setup only with >= 100 events, excess > 0 with t >= 2 by date, and an equal-weight basket of all of
// them positive net of 0.4% fees. Until then: watch only.
import { mean, sd } from './study-lib.mjs';

export const SPEC = { priceMax: 854, vol60: 0.0321, from: '2026-10-13' };
const iso = d => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
const liq = (b, k) => k >= 20 && b.c.slice(k - 19, k + 1).reduce((s, c, j) => s + c * b.v[k - 19 + j], 0) / 20 >= 5e9 && !b.v.slice(k - 2, k + 1).some(v => !v);
const isSpec = (b, k) => { if (k < 80 || !(b.c[k] > Math.max(...b.h.slice(k - 20, k))) || !(b.c[k] < SPEC.priceMax) || !liq(b, k)) return false; const r = []; for (let j = k - 59; j <= k; j++) r.push(b.c[j] / b.c[j - 1] - 1); return sd(r) > SPEC.vol60; };

// px: completed daily bars by 'TICK.JK'. Returns the season meter (trailing 60 sessions of RESOLVED spec breakouts across
// the universe, excess over the same-day average) and today's spec breakouts.
export function specRead(px, tickers) {
  const ref = px['^JKSE']; if (!ref) return null;
  const days = ref.d.map(iso), di = new Map(days.map((d, i) => [d, i])), n = days.length;
  const um = new Map(), ev = [], today = [];
  for (const t of tickers) { const b = px[t + '.JK']; if (!b) continue; for (let k = Math.max(20, b.c.length - 130); k < b.c.length - 11; k++) { if (!liq(b, k)) continue; const d = iso(b.d[k]), m = um.get(d) || [0, 0]; m[0] += b.o[k + 11] / b.o[k + 1] - 1; m[1]++; um.set(d, m); } }
  for (const t of tickers) {
    const b = px[t + '.JK']; if (!b) continue; let busy = -1;
    for (let k = Math.max(80, b.c.length - 130); k < b.c.length; k++) {
      if (k <= busy || !isSpec(b, k)) continue; busy = k + 10;
      const d = iso(b.d[k]);
      if (k === b.c.length - 1) today.push(t);
      else if (k + 11 < b.c.length && um.get(d)) { const m = um.get(d); ev.push({ t, d, i: di.get(d), ex: b.o[k + 11] / b.o[k + 1] - 1 - m[0] / m[1] }); }
    }
  }
  const recent = ev.filter(e => e.i != null && e.i > n - 1 - 71 && e.i <= n - 1 - 11);
  const meter = recent.length ? mean(recent.map(e => e.ex)) : null;
  return { asOf: days[n - 1], on: recent.length >= 10 && meter > 0, meter, events: recent.length, today };
}

// ledger: [{ day, specOn, picks: [{ ticker, spec }] }]
export function specForward(ledger, px) {
  const ev = [];
  for (const L of ledger) {
    if (L.day < SPEC.from || !L.specOn) continue;
    const rows = L.picks.map(p => { const b = px[p.ticker + '.JK']; if (!b) return null; const k = b.d.findIndex(d => iso(d) === L.day); return k < 0 || k + 11 >= b.c.length ? null : { p, f: b.o[k + 11] / b.o[k + 1] - 1 }; }).filter(Boolean);
    if (rows.length < 20) continue;
    const m = mean(rows.map(r => r.f));
    rows.filter(r => r.p.spec).forEach(r => ev.push({ d: L.day, ex: r.f - m, raw: r.f }));
  }
  const by = new Map(); ev.forEach(e => { if (!by.has(e.d)) by.set(e.d, []); by.get(e.d).push(e.ex); });
  const xs = [...by.values()].map(mean), ex = mean(xs), t = xs.length > 1 ? ex / (sd(xs) / Math.sqrt(xs.length) || 1) : 0, net = mean(ev.map(e => e.raw - 0.004));
  return { from: SPEC.from, events: ev.length, needed: 100, ex, t, net, promote: ev.length >= 100 && ex > 0 && t >= 2 && net > 0 };
}

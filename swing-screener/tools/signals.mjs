// Past calls per stock, for the chart markers (web/data/ohlc/<TICKER>.json "ev"). Same engine, badge rules and trade rule
// as the live site, replayed over the daily bars:
//   radar  score reached the ACT bar (>= 65) but the badge was not ACT (WAIT / PAUSE / SKIP / THIN): oversold, not a buy yet
//   call   badge ACT: buy at the next open, wide stop (3.5 ATR), plan target, exit after 15 sessions; resolved to tp / sl /
//          time, or still open / pending (signal on the last close, entry tomorrow)
// Replayed days use neutral news and no NeoBDM veto (no history for either), like tools/tracker-replay.mjs. The latest
// completed day uses the live score and badge, so the newest marker always matches the site. One trade per stock at a time.
const WINDOW = 270, FEE = 0.004;
const dayOf = d => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10); // WIB calendar day

function resolve(b, k, nDone, stop, tp, horizon) {
  if (k + 1 >= b.c.length) return { res: 'pending', entry: null };
  const entry = b.o[k + 1], partial = b.c.length > nDone;
  // n: the session the trade closed on, counting the buy (entry) session as day 1: "TP on day 3" = two sessions after buying.
  const out = (j, px, res) => ({ res, entry, x: dayOf(b.d[j]), xp: px, ret: px / entry - 1 - FEE, n: j - k, j, ...(partial && j === b.c.length - 1 ? { today: true } : {}) });
  for (let j = k + 1; j < b.c.length && j <= k + horizon; j++) {
    if (b.o[j] <= stop) return out(j, b.o[j], 'sl'); // gap through the stop fills at the open
    // A gap through the target fills at the open, the entry bar included (the open is the entry, so that trade nets -fee
    // instead of being booked at a target below the price paid; same rule as tools/tracker.mjs).
    if (b.o[j] >= tp) return out(j, b.o[j], 'tp');
    if (b.l[j] <= stop) return out(j, stop, 'sl'); // a bar touching both counts as a loss (tracker rule)
    if (b.h[j] >= tp) return out(j, tp, 'tp');
  }
  if (k + horizon < nDone) return out(k + horizon, b.c[k + horizon], 'time');
  const last = b.c.length - 1;
  return { res: 'open', entry, now: b.c[last] / entry - 1, age: last - k };
}

// raw: daily bars including today's partial bar (if the session is open); nDone: number of completed bars;
// idx: IHSG completed daily bars; live: { score, tier } for the last completed bar.
export function stockSignals(api, raw, nDone, idx, { cfg, untested = false, live = null }) {
  const idxBy = new Map(idx.d.map((d, i) => [dayOf(d), i]));
  const ev = [];
  let streak = false, busyUntil = -1;
  for (let k = 250; k < nDone; k++) {
    const ii = idxBy.get(dayOf(raw.d[k]));
    const lo = Math.max(0, k + 1 - WINDOW), s = x => x.slice(lo, k + 1);
    const a = api.analyse_({ d: s(raw.d), o: s(raw.o), h: s(raw.h), l: s(raw.l), c: s(raw.c), v: s(raw.v) },
      ii == null ? null : idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
    if (!a) continue;
    const isLast = k === nDone - 1 && live;
    const score = isLast ? live.score : api.score_(a, 0);
    if (score < api.ACT_SCORE) { streak = false; continue; }
    const sma200 = ii != null && ii >= 199 ? idx.c.slice(ii - 199, ii + 1).reduce((x, y) => x + y, 0) / 200 : null;
    const dn = sma200 != null && idx.c[ii] <= sma200; // IHSG under its 200-day average: logged as context, not a gate
    let tier = isLast ? live.tier : null;
    if (!tier) {
      const confirm = raw.c[k] > raw.h[k - 1] || (raw.c[k] > raw.o[k] && raw.c[k] > raw.c[k - 1]);
      tier = a.avgValue / 1e9 < cfg.minValueB ? 'THIN' : !confirm ? 'WAIT' : 'ACT'; // added stocks get ACT too since 2026-10-12, flagged u // no market-filter gate since 2026-10-10 (owner's decision)
    }
    if (k <= busyUntil) { streak = true; continue; } // already holding this stock
    const d = dayOf(raw.d[k]);
    if (tier === 'ACT') {
      const stop = api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down');
      const r = resolve(raw, k, nDone, stop, a.target, cfg.horizon);
      busyUntil = r.j ?? Infinity;
      delete r.j;
      ev.push({ d, k: 'call', s: score, stop, tp: a.target, ...(dn ? { dn: 1 } : {}), ...(untested ? { u: 1 } : {}), ...r });
    } else if (!streak) ev.push({ d, k: 'radar', s: score, tier });
    streak = true;
  }
  return ev;
}

// Scorecard of the replayed ACT calls across all stocks: the numbers that decide whether a rule makes money.
// Win rate alone misleads (many small wins can hide a few large losses), so it is read with the average win and loss,
// the payoff ratio, profit factor and expectancy, and with an account: 10 equal slots (10% of equity each, the site's
// sizing), each call taken if a slot is free on its signal day, realised at its exit, worst drawdown on closed trades.
export function callStats(signals) {
  // Calls on the added (unproven) stocks are kept out of the main scorecard and account, and summarised on their own.
  const every = Object.entries(signals).flatMap(([t, ev]) => ev.filter(e => e.k === 'call').map(e => ({ t, ...e })));
  const all = every.filter(c => !c.u), unp = every.filter(c => c.u);
  const sum = calls => {
    const cl = calls.filter(c => c.x && c.ret != null), w = cl.filter(c => c.ret > 0), l = cl.filter(c => c.ret <= 0);
    const avg = a => (a.length ? a.reduce((s, c) => s + c.ret, 0) / a.length : null);
    const gw = w.reduce((s, c) => s + c.ret, 0), gl = -l.reduce((s, c) => s + c.ret, 0);
    let streak = 0, worstStreak = 0;
    cl.slice().sort((a, b) => (a.x < b.x ? -1 : 1)).forEach(c => { streak = c.ret <= 0 ? streak + 1 : 0; worstStreak = Math.max(worstStreak, streak); });
    const rets = cl.map(c => c.ret).sort((a, b) => a - b);
    const days = r => { const a = cl.filter(c => c.res === r && c.n != null); return a.length ? a.reduce((s, c) => s + c.n, 0) / a.length : null; };
    return { daysTp: days('tp'), daysSl: days('sl'), n: calls.length, closed: cl.length, open: calls.length - cl.length, tp: cl.filter(c => c.res === 'tp').length, sl: cl.filter(c => c.res === 'sl').length, time: cl.filter(c => c.res === 'time').length,
      winRate: cl.length ? w.length / cl.length : null, avgWin: avg(w), avgLoss: avg(l), payoff: avg(w) != null && avg(l) ? avg(w) / -avg(l) : null,
      profitFactor: gl ? gw / gl : null, expectancy: avg(cl), median: rets.length ? rets[rets.length >> 1] : null, worst: rets[0] ?? null, best: rets.at(-1) ?? null, worstStreak };
  };
  // account: 10 slots, chronological; equity changes when a trade closes
  const cl = all.filter(c => c.x && c.ret != null).sort((a, b) => (a.d < b.d ? -1 : 1));
  let eq = 1, peak = 1, dd = 0; const open = []; const months = {};
  const close = upto => { open.sort((a, b) => (a.x < b.x ? -1 : 1)); while (open.length && open[0].x <= upto) { const p = open.shift(); eq += p.amt * p.ret; peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1); months[p.x.slice(0, 7)] = eq; } };
  for (const c of cl) { close(c.d); if (open.length < 10 && !open.some(p => p.t === c.t)) open.push({ t: c.t, x: c.x, ret: c.ret, amt: eq / 10 }); }
  close('9999');
  const mv = Object.entries(months).sort(), mret = mv.map(([m, v], i) => [m, v / (i ? mv[i - 1][1] : 1) - 1]);
  const byMonth = {}; all.forEach(c => { const m = c.d.slice(0, 7); (byMonth[m] = byMonth[m] || []).push(c); });
  return { from: all.map(c => c.d).sort()[0] || null, all: sum(all), unproven: sum(unp), up: sum(all.filter(c => !c.dn)), down: sum(all.filter(c => c.dn)),
    account: { slots: 10, total: eq - 1, maxDD: dd, monthsUp: mret.filter(x => x[1] > 0).length, months: mret.length, worstMonth: mret.length ? Math.min(...mret.map(x => x[1])) : null },
    byMonth: Object.fromEntries(Object.entries(byMonth).sort().map(([m, a]) => [m, sum(a)])),
    // Every replayed call, one row each, for the Track record table (newest first; ~200 rows a year).
    recent: all.slice().sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : a.t < b.t ? -1 : 1)).slice(0, 400)
      .map(c => ({ t: c.t, d: c.d, s: c.s, entry: c.entry ?? null, stop: c.stop, tp: c.tp, res: c.res, x: c.x || null, ret: c.ret ?? null, n: c.n ?? null, now: c.now ?? null, age: c.age ?? null, dn: c.dn || 0 })) };
}

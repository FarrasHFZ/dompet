// Live track record. Every signal day the build logs ALL ranked stocks (not just ACT) to data/history/. This module
// replays each logged signal against the prices that came after it and answers: did it hit the target before the stop?
//
// Trade definition (deliberately realistic, stricter than the backtest):
//   - signal on day D's close; you can only act the next session, so ENTRY = open of D+1
//   - STOP and TARGET are the plan's price levels (target = entry-at-signal-close +8%, stop = support/ATR stop)
//   - 15 trading days from entry; if neither is hit, exit at the close of day 15 (timeout)
//   - if one bar touches both stop and target, it counts as a LOSS (conservative); gaps fill at the open
//   - net return = exit/entry - 1 - 0.4% round-trip fees
// ACT picks are compared with the rest of the universe on the same days (the control group): a win rate only means
// something next to the base rate, because a +8% target is hit by plenty of random stocks.
import fs from 'node:fs';
import path from 'node:path';

const FEE = 0.004;

export function wilson(w, n, z = 1.96) {
  if (!n) return [null, null];
  const p = w / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

export function readLedger(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

// bars: column bars {d,o,h,l,c}. Returns a trade record.
export function resolveTrade(p, asOf, bars, horizon) {
  const i0 = bars.d.findIndex(d => d.toISOString().slice(0, 10) === asOf);
  const base = { ticker: p.ticker, signal: asOf, score: p.score, action: p.action, setup: p.setup, sector: p.sector || null, regime: p.regime || null, rsi: p.rsi ?? null, news: p.newsScore ?? null, bm: p.bmScore ?? null, stop: p.stop, target: p.target };
  if (i0 < 0 || i0 + 1 >= bars.c.length) return { ...base, status: 'pending' };
  const j0 = i0 + 1, entry = bars.o[j0];
  const last = Math.min(j0 + horizon - 1, bars.c.length - 1);
  let status = 'open', exit = null, exitIdx = null;
  let hi = -Infinity, lo = Infinity;
  for (let j = j0; j <= last; j++) {
    hi = Math.max(hi, bars.h[j]); lo = Math.min(lo, bars.l[j]);
    const stopHit = bars.l[j] <= p.stop, tgtHit = bars.h[j] >= p.target;
    if (stopHit) { status = 'loss'; exit = Math.min(p.stop, bars.o[j]); exitIdx = j; break; }
    if (tgtHit) { status = 'win'; exit = Math.max(p.target, bars.o[j] > p.target ? bars.o[j] : p.target); exitIdx = j; break; }
  }
  if (status === 'open' && last === j0 + horizon - 1) { status = 'timeout'; exit = bars.c[last]; exitIdx = last; }
  const ref = exit ?? bars.c[last];
  return {
    ...base, status, entryDate: bars.d[j0].toISOString().slice(0, 10), entry,
    exitDate: exitIdx !== null ? bars.d[exitIdx].toISOString().slice(0, 10) : null, days: (exitIdx ?? last) - j0 + 1,
    exit: exit ?? null, last: bars.c[last], ret: ref / entry - 1 - (status === 'open' ? 0 : FEE), unrealized: status === 'open' ? bars.c[last] / entry - 1 : null,
    mfe: hi / entry - 1, mae: lo / entry - 1, daysLeft: status === 'open' ? horizon - ((last) - j0 + 1) : 0,
  };
}

function agg(ts) {
  const closed = ts.filter(t => ['win', 'loss', 'timeout'].includes(t.status));
  const w = closed.filter(t => t.status === 'win').length, l = closed.filter(t => t.status === 'loss').length;
  const [lo, hi] = wilson(w, closed.length);
  const rets = closed.map(t => t.ret);
  const gains = rets.filter(r => r > 0).reduce((s, r) => s + r, 0), losses = -rets.filter(r => r < 0).reduce((s, r) => s + r, 0);
  return {
    n: closed.length, open: ts.filter(t => t.status === 'open').length, wins: w, losses: l, timeouts: closed.length - w - l,
    winRate: closed.length ? w / closed.length : null, ci: [lo, hi], avgNet: closed.length ? rets.reduce((s, r) => s + r, 0) / closed.length : null,
    profitFactor: losses > 0 ? gains / losses : null, avgDays: closed.length ? closed.reduce((s, t) => s + t.days, 0) / closed.length : null,
  };
}

function groupBy(ts, keyFn, minN = 1) {
  const m = {};
  ts.forEach(t => { const k = keyFn(t); if (k !== null && k !== undefined) (m[k] = m[k] || []).push(t); });
  return Object.entries(m).map(([k, v]) => ({ key: k, ...agg(v) })).filter(g => g.n >= minN).sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1));
}

// One position per stock at a time. A stock that stays oversold for 10 days produces 10 near-identical signals; counting
// them all would make one episode look like ten wins. Keep a signal only if the previous trade in that group is closed.
export function oneAtATime(ts) {
  const byT = {}, kept = [];
  ts.forEach(t => { if (t.status !== 'pending') (byT[t.ticker] = byT[t.ticker] || []).push(t); });
  Object.values(byT).forEach(list => {
    list.sort((a, b) => a.signal.localeCompare(b.signal));
    let busyUntil = '';
    list.forEach(t => { if (t.signal <= busyUntil) return; kept.push(t); busyUntil = t.status === 'open' ? '9999-12-31' : t.exitDate; });
  });
  return kept;
}

export function buildTracker({ ledger, bars, horizon = 15, previousResolved = [] }) {
  // Picks logged with set 'new' (the 200 stocks added 2026-10-10, never traded) are scored separately, so the main
  // record stays the tested universe and stays comparable with its first days.
  const trades = [], newTrades = [];
  ledger.forEach(day => day.picks.forEach(p => {
    const b = bars[p.ticker + '.JK'];
    if (!b) return;
    (p.set === 'new' ? newTrades : trades).push(resolveTrade({ ...p, regime: day.regime }, day.asOf, b, horizon));
  }));
  const newSet = { act: agg(oneAtATime(newTrades.filter(t => t.action === 'ACT'))), control: agg(oneAtATime(newTrades.filter(t => t.action !== 'ACT'))) };
  const resolved = trades.filter(t => ['win', 'loss', 'timeout'].includes(t.status));
  const rawAct = trades.filter(t => t.action === 'ACT'), rawRest = trades.filter(t => t.action !== 'ACT');
  const act = oneAtATime(rawAct), rest = oneAtATime(rawRest), uniq = act.concat(rest);
  const bucket = s => (s >= 85 ? '85+' : s >= 75 ? '75-84' : s >= 65 ? '65-74' : s >= 45 ? '45-64' : '<45');
  const rsiBand = r => (r === null ? null : r < 25 ? '<25' : r < 30 ? '25-30' : r < 35 ? '30-35' : '35+');
  const prevSet = new Set(previousResolved);
  const id = t => `${t.signal}|${t.ticker}`;
  const events = act.filter(t => ['win', 'loss', 'timeout'].includes(t.status) && !prevSet.has(id(t))).sort((a, b) => (b.exitDate || '').localeCompare(a.exitDate || ''));
  return {
    asOf: new Date().toISOString(), horizon, fee: FEE, signalDays: ledger.length,
    rules: 'Entry next session open; plan stop/target as price levels; 15 trading days; a bar touching both counts as a loss; gaps fill at the open; net of 0.4% fees.',
    act: agg(act), control: agg(rest), all: agg(uniq), newSet, rawSignals: { act: rawAct.length, control: rawRest.length }, pendingAct: rawAct.filter(x => x.status === 'pending').length,
    byScore: groupBy(uniq, t => bucket(t.score)),
    bySetup: groupBy(uniq, t => t.setup, 5), bySector: groupBy(act, t => t.sector, 3), byRegime: groupBy(act, t => t.regime, 3),
    byRsi: groupBy(act, t => rsiBand(t.rsi), 3),
    // Forward test of the experimental Bandarmetrics accumulation score (logged from 2026-10-12).
    byBm: groupBy(act, t => (t.bm == null ? null : t.bm >= 50 ? 'BM score top half' : 'BM score bottom half'), 1),
    byNews: groupBy(act, t => (t.news === null ? null : t.news >= 0.5 ? 'news supports' : t.news <= -0.5 ? 'news against' : 'no clear news'), 3),
    byTicker: groupBy(act, t => t.ticker, 2).slice(0, 12),
    open: act.filter(t => t.status === 'open').sort((a, b) => b.score - a.score),
    closed: act.filter(t => ['win', 'loss', 'timeout'].includes(t.status)).sort((a, b) => (b.exitDate || '').localeCompare(a.exitDate || '')).slice(0, 150),
    ...(process.env.TRACKER_TRADES ? { _trades: uniq } : {}),
    events, resolvedIds: act.filter(t => ['win', 'loss', 'timeout'].includes(t.status)).map(id),
  };
}

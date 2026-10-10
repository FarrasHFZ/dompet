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
  const out = (j, px, res) => ({ res, entry, x: dayOf(b.d[j]), xp: px, ret: px / entry - 1 - FEE, j, ...(partial && j === b.c.length - 1 ? { today: true } : {}) });
  for (let j = k + 1; j < b.c.length && j <= k + horizon; j++) {
    if (b.o[j] <= stop) return out(j, b.o[j], 'sl'); // gap through the stop fills at the open
    if (j > k + 1 && b.o[j] >= tp) return out(j, b.o[j], 'tp');
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
    let tier = isLast ? live.tier : null;
    if (!tier) {
      const confirm = raw.c[k] > raw.h[k - 1] || (raw.c[k] > raw.o[k] && raw.c[k] > raw.c[k - 1]);
      tier = a.avgValue / 1e9 < cfg.minValueB ? 'THIN' : untested ? 'SKIP' : !confirm ? 'WAIT' : 'ACT'; // no market-filter gate since 2026-10-10 (owner's decision)
    }
    if (k <= busyUntil) { streak = true; continue; } // already holding this stock
    const d = dayOf(raw.d[k]);
    if (tier === 'ACT') {
      const stop = api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down');
      const r = resolve(raw, k, nDone, stop, a.target, cfg.horizon);
      busyUntil = r.j ?? Infinity;
      delete r.j;
      ev.push({ d, k: 'call', s: score, stop, tp: a.target, ...r });
    } else if (!streak) ev.push({ d, k: 'radar', s: score, tier });
    streak = true;
  }
  return ev;
}

// Survivorship and selection-bias audit (2026-10-11) -> data/survivorship.json (shown in Track record, "Reality check").
// Three ways the backtests could look better than real trading:
//  1. Delisted stocks are missing (Yahoo returns 404 for every delisted IDX code tried). IDX's own daily stock summary
//     goes back to 2020-01; comparing its stock lists on 13 dates from 2020-01-02 to 2026-01-05 with 2026-10-09
//     (pulled in a browser on 2026-10-11, before IDX switched to a Cloudflare check) found ~26 codes that traded and
//     are gone. All but one traded about Rp 0-4 B a day on the sampled dates, below the Rp 5 B rule; the exception,
//     FREN, merged into EXCL (XLSmart) in 2025: holders got shares, it was not a wipe-out. Before 2020 there is no data.
//  2. Universe chosen with hindsight: the "tested 100" are today's most traded stocks. The same live trade is compared
//     across the tested 100, the 200 added later, and the 613 stocks never used for it (experiment-payoff*.mjs).
//  3. Freezes: a stock suspended (or on the call-auction board) while held cannot be sold, so its stop does not work.
//     Counted from the Yahoo cache: runs of 10+ zero-volume sessions that began while the stock traded >= Rp 5 B a day.
// Usage: node tools/survivorship.mjs   (needs data/payoff-study.json, data/payoff-confirm.json and the 10-year cache)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CACHE } from './lib.mjs';

const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); } catch { return null; } };
const P = rd('payoff-study.json'), C = rd('payoff-confirm.json');
const live = P && P.rows.find(r => r.id === P.live);
const sets = [];
if (live) {
  const n = live.is.n + live.oos.n, m = (live.is.mean * live.is.n + live.oos.mean * live.oos.n) / n;
  sets.push({ set: 'Tested 100 (today\'s most traded; the rule was built on them)', n, mean: m });
  sets.push({ set: '200 added in Oct 2026 (holdout)', n: live.hold.n, mean: live.hold.mean });
}
if (C) sets.push({ set: '613 other IDX stocks (never used for this rule)', n: C.B.n, mean: C.B.mean });
const all = sets.reduce((s, x) => s + x.n, 0), pit = all ? sets.reduce((s, x) => s + x.mean * x.n, 0) / all : null;

const freezes = [];
for (const f of fs.readdirSync(CACHE).filter(f => /^px_[A-Z0-9]+_JK_10y\.json$/.test(f))) {
  const b = JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8')), n = b.c.length; if (n < 300) continue;
  let run = 0, start = -1;
  for (let i = 1; i < n; i++) {
    const flat = !b.v[i];
    if (flat) { if (!run) start = i; run++; }
    if ((!flat || i === n - 1) && run >= 10) {
      let val = 0; for (let k = Math.max(0, start - 20); k < start; k++) val += b.c[k] * b.v[k];
      if (val / 20 / 1e9 >= 5) freezes.push({ tk: f.slice(3, -12), from: String(b.d[start]).slice(0, 10), days: run, gap: flat ? null : b.c[i] / b.c[start - 1] - 1 });
    }
    if (!flat) run = 0;
  }
}
const byYear = {}; freezes.forEach(x => { const y = x.from.slice(0, 4); byYear[y] = (byYear[y] || 0) + 1; });
const gaps = freezes.map(x => x.gap).filter(x => x != null).sort((a, b) => a - b);
const out = {
  asOf: new Date().toISOString().slice(0, 10),
  delisting: { from: '2020-01-02', codesGone: 26, liquidGone: ['FREN (merged into EXCL / XLSmart, 2025; not a wipe-out)'], note: 'IDX daily stock summary, 13 dates 2020-01-02 .. 2026-01-05 vs 2026-10-09. No IDX data before 2020; Yahoo has no delisted IDX codes.' },
  universe: { sets, pitMean: pit, trades: all },
  freezes: { count: freezes.length, stocks: new Set(freezes.map(x => x.tk)).size, byYear, medianGap: gaps.length ? gaps[gaps.length >> 1] : null, worst: freezes.slice().sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0)).slice(0, 5), recent: freezes.filter(x => x.from >= '2025-01-01').map(x => x.tk) },
};
fs.writeFileSync(path.join(ROOT, 'data', 'survivorship.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ universe: out.universe, freezes: { count: out.freezes.count, stocks: out.freezes.stocks, byYear, medianGap: out.freezes.medianGap } }, null, 1));

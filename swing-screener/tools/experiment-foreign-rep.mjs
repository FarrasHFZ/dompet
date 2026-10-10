// Replication of H2 (foreign flow predicts returns on stocks where foreign flow moves the price) on DIFFERENT stocks.
//
// PRE-REGISTERED 2026-10-10, committed before the first run.
// Origin: tools/experiment-flow2.mjs H2 on the tested 100 with IDX foreign data, 2022-09 on: top-minus-bottom third of
// foreign buying inside high-fcorr stocks +1.34% per 20 sessions, both halves positive (+1.48% / +1.21%), control
// (low-fcorr) +0.38%, permutation p 0.096, t 1.83: a near miss, in exactly the shape the user predicted.
// Replication: the 200 stocks added on 2026-10-10 (never in the IDX foreign data, never used for H2), with NeoBDM's
// foreign group (cumulative net value, billions IDR; daily net = its daily change) and Yahoo prices, 2024-10 on.
// Same definitions: daily foreign net as % of the day's traded value; fcorr = correlation of that with the day's return
// over the previous 120 sessions; F20 = foreign net over 20 sessions as % of traded value; top third by fcorr on each
// date; forward return next open -> open 20 sessions later; liquid (Rp 5 B a day); dates every 20 sessions.
// REPLICATES if: top-minus-bottom spread > 0 in both halves AND within-date permutation p < 0.10 (one-sided).
// (Looser than a fresh test on purpose: it asks only whether the near miss repeats in the same direction on new
// stocks; ~18 months of NeoBDM history gives few dates.)
// If it replicates: "foreign-driven" stocks with top-third foreign buying get a paper "foreign buying ✓" confirmation
// (ACT ✓ on oversold setups, and a paper Flow picks list with its own forward record). If not: shown as context only.
// Reported only: the same on the tested 100 with NeoBDM data (a data-source cross-check of H2, same stocks).
import fs from 'node:fs';
import path from 'node:path';
import { loadPrices, ROOT, loadEngine, universe, expansionTickers } from './lib.mjs';
import { terciles, fmt, mean } from './study-lib.mjs';

const api = loadEngine(), NEW = expansionTickers(), U = universe(api).map(u => u.ticker);
const iso = d => d.toISOString().slice(0, 10), STEP = 20, H = 20, W = 120;
const px = await loadPrices(U.map(t => t + '.JK').concat(['^JKSE']), '10y', true);
const nb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-history.json'), 'utf8'));
const days = px['^JKSE'].d.map(iso);
const corr = (a, b) => { const p = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x != null && y != null && isFinite(x) && isFinite(y)); if (p.length < 80) return null; const mx = mean(p.map(q => q[0])), my = mean(p.map(q => q[1])); let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of p) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; } return sxy / Math.sqrt(sxx * syy || 1); };

function rows(tickers) {
  const S = {};
  for (const t of tickers) {
    const g = nb[t] && nb[t].g, b = px[t + '.JK']; if (!g || !g.f || !b) continue;
    const bi = new Map(b.d.map((d, i) => [iso(d), i]));
    const d = [], net = [], ret = [], val = [];
    for (let j = 1; j < g.d.length; j++) {
      const k = bi.get(g.d[j]); if (k == null || k < 1 || g.f[j] == null || g.f[j - 1] == null) continue;
      const v = b.c[k] * b.v[k]; d.push(g.d[j]); val.push(v);
      net.push(v ? (g.f[j] - g.f[j - 1]) * 1e9 / v : null); ret.push(b.c[k] / b.c[k - 1] - 1);
    }
    S[t] = { d, net, ret, val, raw: d.map((x, i) => (net[i] == null ? 0 : net[i] * val[i])), bi };
  }
  const out = [];
  const grid = days.filter(x => x >= '2025-03-01').filter((x, i) => i % STEP === 0);
  for (const day of grid) for (const t of Object.keys(S)) {
    const s = S[t], i = s.d.lastIndexOf(s.d.filter(x => x <= day).pop()); if (i < W) continue;
    const c = corr(s.net.slice(i - W + 1, i + 1), s.ret.slice(i - W + 1, i + 1)); if (c == null) continue;
    const b = px[t + '.JK'], k = s.bi.get(day); if (k == null || k + H + 1 >= b.c.length) continue;
    const v20 = mean(b.c.slice(k - 19, k + 1).map((x, j) => x * b.v[k - 19 + j])); if (v20 < 5e9 || b.v.slice(k - 2, k + 1).some(v => !v)) continue;
    const f20 = s.raw.slice(i - 19, i + 1).reduce((a, x) => a + x, 0) / (s.val.slice(i - 19, i + 1).reduce((a, x) => a + x, 0) || 1);
    out.push({ date: day, tk: t, fcorr: c, f20, fwd: b.o[k + H + 1] / b.o[k + 1] - 1 });
  }
  return out;
}
const topCorr = (rs, top = true) => { const by = new Map(); rs.forEach(r => { if (!by.has(r.date)) by.set(r.date, []); by.get(r.date).push(r); }); const out = []; for (const x of by.values()) { const s = x.slice().sort((a, b) => a.fcorr - b.fcorr), k = Math.floor(s.length / 3); out.push(...(top ? s.slice(-k) : s.slice(0, k))); } return out.map(r => ({ ...r, sig: r.f20 })); };
const mid = s => { const ds = [...new Set(s.map(x => x.date))].sort(); return ds[ds.length >> 1]; };
const show = (name, r, verdict) => console.log(`${name.padEnd(44)} dates ${String(r.dates).padStart(3)}  avg ${r.avgN.toFixed(0).padStart(3)}  top-bottom ${fmt(r.spread).padStart(7)}  t ${r.t.toFixed(2).padStart(5)}  p ${r.p.toFixed(3)}  halves ${fmt(r.first)} / ${fmt(r.second)}${verdict ? '  ' + verdict : ''}`);

const res = { asOf: new Date().toISOString().slice(0, 10) };
const R200 = rows(U.filter(t => NEW.has(t)));
console.log(`200 new stocks: median fcorr ${(() => { const s = R200.map(r => r.fcorr).sort((a, b) => a - b); return s[s.length >> 1].toFixed(2); })()}`);
const s1 = topCorr(R200), r1 = terciles(s1, { split: mid(s1), dir: 1 });
res.replication = { ...r1, replicates: r1.p < 0.10 && r1.first > 0 && r1.second > 0 };
show('REPLICATION: high-fcorr, 200 new stocks', r1, res.replication.replicates ? 'REPLICATES' : 'does not replicate');
const c1 = topCorr(R200, false), rc = terciles(c1, { split: mid(c1), dir: 1 }); res.control200 = rc;
show('   control: low-fcorr, 200 new stocks', rc);
const R100 = rows(U.filter(t => !NEW.has(t))), s2 = topCorr(R100), r2 = terciles(s2, { split: mid(s2), dir: 1 }); res.crossCheck100 = r2;
show('   cross-check: high-fcorr, tested 100 (NeoBDM)', r2);
console.log(`\nVERDICT ${res.replication.replicates ? 'H2 REPLICATES on new stocks -> paper "foreign buying" confirmation' : 'H2 does NOT replicate -> foreign flow stays context only'}`);
fs.writeFileSync(path.join(ROOT, 'data', 'foreign-rep.json'), JSON.stringify(res, null, 1));

// Forward test of the NeoBDM broker-flow read (tools/flow-model.mjs). NeoBDM shows only today's numbers, so the only
// honest test is to save a snapshot every trading day (tools/neobdm-pull.js -> data/neobdm-snap/) and score each one
// later against what prices did next. Writes data/flow-scorecard.json (aggregate statistics only, public-safe; committed, the build shows it).
//
// Outcome per stock-day: buy at the next session's open, sell at the close 5 / 15 sessions later, minus 0.4% fees.
// "Excess" = that return minus the average of all 100 stocks on the same day (removes the market's move).
//
// PROMOTION RULE (fixed 2026-10-09, before any forward result): the flow tag may start to change tiers (e.g. let FLOW+
// upgrade a WAIT to ACT, or FLOW- demote an ACT) only when ALL of these hold for FLOW+ minus FLOW- excess return:
//   1. at least 60 snapshot days with a resolved 5-session outcome, and at least 150 FLOW+ stock-days
//   2. 5-session spread positive with overlap-adjusted t >= 2. Each day's spread is one observation, but consecutive
//      days' 5-session windows share 4 of 5 sessions, so t is divided by sqrt(5). (The IDX foreign-flow test showed how
//      badly overlapping samples overstate t: 2.2 raw, 0.9 clustered.)
//   3. 5-session spread positive in the first and in the second half of those days
//   4. 15-session spread also positive (direction check only)
// Until then the tag only annotates and Pinky / not-liquid only veto. If a promoted rule later shows a negative spread
// over its last 40 days, it goes back to annotation only.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
import { readFlow, FLOW_MODEL_V } from './flow-model.mjs';

const FEE = 0.004, H = [5, 15];
const SNAP = path.join(ROOT, 'data', 'neobdm-snap');
export function readSnaps() {
  if (!fs.existsSync(SNAP)) return [];
  return fs.readdirSync(SNAP).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map(f => {
    const j = JSON.parse(fs.readFileSync(path.join(SNAP, f), 'utf8')); const d = f.slice(0, 10);
    return { date: d, ...(j[d] || j) };
  }).filter(s => s.rows && Object.keys(s.rows).length);
}

const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
function tStat(v) {
  if (v.length < 3) return null;
  const m = mean(v), sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
  return sd ? m / (sd / Math.sqrt(v.length)) : null;
}

export function scoreSnaps(snaps, bars) {
  const obs = []; // one per stock-day
  for (const s of snaps) {
    for (const [tk, r] of Object.entries(s.rows)) {
      const b = bars[tk + '.JK']; if (!b) continue;
      const i0 = b.d.findIndex(d => d.toISOString().slice(0, 10) === s.date); if (i0 < 20) continue;
      const fr = readFlow(r, { chg5: b.c[i0] / b.c[i0 - 5] - 1, chg20: b.c[i0] / b.c[i0 - 20] - 1 });
      const o = { date: s.date, tk, tag: fr.tag, phase: fr.phase, retail: fr.retail, m5: r.m_cn_5 == null || r.m_cn_5 === '' ? null : +r.m_cn_5 };
      const entry = b.o[i0 + 1];
      H.forEach(h => { o['r' + h] = entry && b.c[i0 + h] ? b.c[i0 + h] / entry - 1 - FEE : null; });
      obs.push(o);
    }
  }
  // excess vs same-day universe mean
  const byDay = {}; obs.forEach(o => { (byDay[o.date] = byDay[o.date] || []).push(o); });
  Object.values(byDay).forEach(list => H.forEach(h => {
    const ok = list.filter(o => o['r' + h] != null), m = mean(ok.map(o => o['r' + h]));
    ok.forEach(o => { o['x' + h] = o['r' + h] - m; });
  }));
  const group = (key, val, h) => {
    const per = Object.entries(byDay).map(([, l]) => l.filter(o => o[key] === val && o['x' + h] != null)).filter(l => l.length);
    const all = per.flat();
    return { n: all.length, days: per.length, avgNet: all.length ? mean(all.map(o => o['r' + h])) : null, avgExcess: all.length ? mean(all.map(o => o['x' + h])) : null, t: tStat(per.map(l => mean(l.map(o => o['x' + h])))) };
  };
  const out = { v: FLOW_MODEL_V, snapshots: snaps.length, firstSnap: snaps[0]?.date || null, lastSnap: snaps.at(-1)?.date || null, horizons: {} };
  H.forEach(h => {
    const tags = Object.fromEntries(['FLOW+', 'FLOW~', 'FLOW-', 'AVOID'].map(t => [t, group('tag', t, h)]));
    const phases = Object.fromEntries(['ACCUMULATION', 'MARKUP', 'DISTRIBUTION', 'MARKDOWN', 'NEUTRAL'].map(p => [p, group('phase', p, h)]));
    // primary: daily spread FLOW+ minus FLOW-
    const spreadDays = Object.keys(byDay).sort().map(d => {
      const l = byDay[d], p = l.filter(o => o.tag === 'FLOW+' && o['x' + h] != null), q = l.filter(o => o.tag === 'FLOW-' && o['x' + h] != null);
      return p.length && q.length ? mean(p.map(o => o['x' + h])) - mean(q.map(o => o['x' + h])) : null;
    }).filter(x => x != null);
    const half = Math.floor(spreadDays.length / 2);
    out.horizons[h] = { tags, phases, spread: { days: spreadDays.length, avg: spreadDays.length ? mean(spreadDays) : null, t: tStat(spreadDays), firstHalf: half ? mean(spreadDays.slice(0, half)) : null, secondHalf: half ? mean(spreadDays.slice(half)) : null } };
  });
  const p = out.horizons[5], plus = p.tags['FLOW+'], l = out.horizons[15];
  const tAdj = p.spread.t == null ? null : p.spread.t / Math.sqrt(5);
  p.spread.tAdj = tAdj;
  const checks = [
    { rule: '>= 60 resolved snapshot days (5 sessions)', ok: p.spread.days >= 60, value: p.spread.days },
    { rule: '>= 150 FLOW+ stock-days', ok: plus.n >= 150, value: plus.n },
    { rule: 'FLOW+ minus FLOW- 5-session spread, overlap-adjusted t >= 2', ok: tAdj != null && p.spread.avg > 0 && tAdj >= 2, value: tAdj == null ? null : +tAdj.toFixed(2) },
    { rule: '5-session spread positive in both halves', ok: p.spread.firstHalf > 0 && p.spread.secondHalf > 0, value: [p.spread.firstHalf, p.spread.secondHalf].map(x => (x == null ? null : +(x * 100).toFixed(2))) },
    { rule: '15-session spread also positive', ok: l.spread.avg > 0, value: l.spread.avg == null ? null : +(l.spread.avg * 100).toFixed(2) },
  ];
  out.promotion = { promoted: checks.every(c => c.ok), checks };

  // CONTRARIAN HYPOTHESIS C1, fixed 2026-10-10 from the 2-year replay (tools/experiment-nb.mjs, explore-nb.mjs), where
  // 5-session Bandar net buying ranked below-average next-5-session returns even after removing the 5-day price move.
  // The replay found it, so only the FORWARD record can confirm it. Each snapshot day: stocks in the bottom third of
  // m_cn_5 (bandar sold most) minus the top third (bandar bought most), 5-session excess. Confirmed only if: >= 60 resolved
  // days, overlap-adjusted t >= 2, positive in both halves. Until then it is shown, never used.
  const cDays = Object.keys(byDay).sort().map(d => {
    const l = byDay[d].filter(o => o.m5 != null && o.x5 != null); if (l.length < 30) return null;
    const s = l.slice().sort((a, b) => a.m5 - b.m5), k = Math.floor(s.length / 3);
    return mean(s.slice(0, k).map(o => o.x5)) - mean(s.slice(-k).map(o => o.x5));
  }).filter(x => x != null);
  const ch = Math.floor(cDays.length / 2), ct = tStat(cDays);
  out.contrarian = { days: cDays.length, avg: cDays.length ? mean(cDays) : null, tAdj: ct == null ? null : ct / Math.sqrt(5), firstHalf: ch ? mean(cDays.slice(0, ch)) : null, secondHalf: ch ? mean(cDays.slice(ch)) : null };
  out.contrarian.confirmed = cDays.length >= 60 && out.contrarian.avg > 0 && out.contrarian.tAdj >= 2 && out.contrarian.firstHalf > 0 && out.contrarian.secondHalf > 0;
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('flow-forward.mjs')) {
  const snaps = readSnaps();
  const api = loadEngine(), uni = universe(api);
  const bars = await loadPrices(uni.map(u => u.ticker + '.JK'), '2y', process.env.REFRESH !== '1');
  const sc = scoreSnaps(snaps, bars);
  const pc = x => (x == null ? '  n/a' : (x * 100).toFixed(2) + '%');
  console.log(`flow model v${sc.v}: ${sc.snapshots} snapshot(s) ${sc.firstSnap}..${sc.lastSnap}`);
  for (const h of H) {
    const o = sc.horizons[h];
    console.log(`\n-- ${h} sessions --`);
    for (const [k, g] of Object.entries({ ...o.tags, ...o.phases })) console.log(k.padEnd(13), 'n', String(g.n).padStart(5), 'days', String(g.days).padStart(3), 'net', pc(g.avgNet).padStart(7), 'excess', pc(g.avgExcess).padStart(7), 't', g.t == null ? 'n/a' : g.t.toFixed(2));
    console.log('FLOW+ minus FLOW-:', pc(o.spread.avg), 't', o.spread.t == null ? 'n/a' : o.spread.t.toFixed(2), 'over', o.spread.days, 'days');
  }
  console.log('\npromotion:', sc.promotion.promoted ? 'PASSED' : 'not yet'); sc.promotion.checks.forEach(c => console.log(c.ok ? ' [x]' : ' [ ]', c.rule, '->', JSON.stringify(c.value)));

  fs.writeFileSync(path.join(ROOT, 'data', 'flow-scorecard.json'), JSON.stringify({ ...sc, asOf: new Date().toISOString() }));
}

// Conglomerate rotation study. The market belief: money plays one conglomerate's stocks together ("saham PP", "saham
// Haji Isam"), then rotates to another group after a while. Data: Yahoo daily bars, 5 years, for every member in
// data/groups.json (tools/groups.mjs; index rules there). Not financial advice.
//
// PRE-REGISTERED 2026-10-10, before the first run (nothing below was tuned on the result):
//  H1 PRIMARY  does a hot group STAY hot, or rotate out? Every 5th session (groups with >= 2 active members, >= 8 groups
//     that day): rank by 20-session return relative to the IHSG; spread = top 3 minus bottom 3 over the NEXT 20 sessions
//     (close t+1 to close t+21, so the signal close is not traded). Windows overlap 4:1, so t is divided by 2.
//     MOMENTUM if spread > 0, adjusted t >= 2, both halves (split 2024-10-01) > 0. ROTATION if all three hold with the sign
//     reversed. Otherwise: no reliable pattern. Same at 5 and 60 sessions reported, not decided on.
//  H2 descriptive  is it a GROUP effect or just a sector effect? Mean pairwise correlation of daily returns (last 500
//     sessions) for same-group pairs vs different-group pairs in the same sector (screener sectors, members in the 100).
//  H3 the screener: ACT signals (score >= 65, live trade: wide stop, +8%, 15 sessions, fees) in group stocks, group quadrant
//     LEADING or IMPROVING (A) vs LAGGING or WEAKENING (B). PASS = one-trade-per-episode t >= 2, by-day t >= 2, gap > 0 on
//     the 73 unseen stocks and in both halves. If it passes, ACT picks with a group tailwind are listed first and labelled;
//     the badge itself does not change.
//  H4 secondary (t >= 2.5): after a group index jumps >= 10% in 5 sessions (first jump per group per 20 sessions), does it
//     beat the IHSG over the next 10 sessions? t over events, both halves > 0.
//  Descriptive: how many weeks a group stays in the top 3, and how often the #1 group changes.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
import { loadGroups, groupSeries, groupReadAt } from './groups.mjs';

const api = loadEngine(), uni = universe(api), sector = Object.fromEntries(uni.map(u => [u.ticker, u.sector]));
const DESIGN = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'design-universe.json'), 'utf8')));
const gm = loadGroups(); if (!gm) throw new Error('run node tools/groups.mjs first');
const tks = [...new Set(gm.groups.flatMap(g => g.members.map(m => m.tk)).concat(uni.map(u => u.ticker)))];
const px = await loadPrices(tks.map(t => t + '.JK').concat(['^JKSE']), '5y', process.env.REFRESH !== '1');
const idx = px['^JKSE'], S = groupSeries(px, gm, idx), ids = gm.groups.map(g => g.id), T = S.days.length;
const SPLIT = '2024-10-01', FEE = 0.004, WINDOW = 270, iso = d => d.toISOString().slice(0, 10);
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sdv = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const tst = a => (a.length > 3 ? mean(a) / (sdv(a) / Math.sqrt(a.length)) : null);
const f2 = x => (x == null || Number.isNaN(x) ? 'n/a' : x.toFixed(2)), pc = x => (x == null || Number.isNaN(x) ? 'n/a' : (x * 100).toFixed(2) + '%');
const fwd = (id, t, h) => { const l = S.g[id].lvl; return t + 1 + h < T ? l[t + 1 + h] / l[t + 1] - 1 : null; };
const fwdI = (t, h) => (t + 1 + h < T ? S.ihsg[t + 1 + h] / S.ihsg[t + 1] - 1 : null);

// ---------- H1 ----------
function persistence(h) {
  const obs = [];
  for (let t = 70; t < T - 1 - h; t += 5) {
    const r = ids.map(id => [id, groupReadAt(S, id, t)]).filter(([, x]) => x && x.rs != null && x.active >= 2).sort((a, b) => b[1].rs - a[1].rs);
    if (r.length < 8) continue;
    const f = id => fwd(id, t, h), top = r.slice(0, 3).map(([id]) => f(id)), bot = r.slice(-3).map(([id]) => f(id));
    if ([...top, ...bot].some(x => x == null)) continue;
    obs.push({ d: S.days[t], s: mean(top) - mean(bot), top: r.slice(0, 3).map(([id]) => id) });
  }
  const v = obs.map(o => o.s), adj = Math.sqrt(Math.max(1, h / 5));
  const a = obs.filter(o => o.d < SPLIT).map(o => o.s), b = obs.filter(o => o.d >= SPLIT).map(o => o.s);
  return { h, n: obs.length, from: obs[0] && obs[0].d, avg: mean(v), tAdj: tst(v) / adj, h1: mean(a), h2: mean(b), obs };
}
const P = { 5: persistence(5), 20: persistence(20), 60: persistence(60) }, p = P[20];
const h1 = p.avg > 0 && p.tAdj >= 2 && p.h1 > 0 && p.h2 > 0 ? 'MOMENTUM' : p.avg < 0 && p.tAdj <= -2 && p.h1 < 0 && p.h2 < 0 ? 'ROTATION' : 'NEITHER';
console.log(`groups: ${ids.length}; index from ${S.days[0]}\n\n===== H1 PRIMARY: top 3 minus bottom 3 groups by 20-session relative strength =====`);
for (const x of Object.values(P)) console.log(`  next ${String(x.h).padStart(2)} sessions: ${pc(x.avg)} per period, adj t ${f2(x.tAdj)} (${x.n} looks from ${x.from}); halves ${pc(x.h1)} / ${pc(x.h2)}`);
console.log(`  -> ${h1}`);

// descriptive: leadership runs
const wk = []; for (let t = 70; t < T; t += 5) { const r = ids.map(id => [id, groupReadAt(S, id, t)]).filter(([, x]) => x && x.rs != null && x.active >= 2).sort((a, b) => b[1].rs - a[1].rs); if (r.length >= 8) wk.push(r.map(([id]) => id)); }
const runs = []; const cur = {};
wk.forEach((r, k) => { ids.forEach(id => { const inTop = r.slice(0, 3).includes(id); if (inTop) cur[id] = (cur[id] || 0) + 1; else if (cur[id]) { runs.push(cur[id]); cur[id] = 0; } }); });
const leadChanges = wk.filter((r, k) => k && r[0] !== wk[k - 1][0]).length;
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const timesTop = Object.fromEntries(ids.map(id => [id, wk.filter(r => r.slice(0, 3).includes(id)).length]));
console.log(`  descriptive: a top-3 stay lasts median ${med(runs)} week(s), mean ${mean(runs).toFixed(1)} (${runs.length} stays); the #1 group changed in ${leadChanges} of ${wk.length - 1} weeks`);

// ---------- H2 ----------
const rets = tk => { const b = px[tk + '.JK']; if (!b) return null; const m = new Map(); for (let i = Math.max(1, b.c.length - 500); i < b.c.length; i++) m.set(iso(b.d[i]), b.c[i] / b.c[i - 1] - 1); return m; };
const corr = (A, B) => { const x = [], y = []; A.forEach((v, d) => { if (B.has(d) && Math.abs(v) < 0.5 && Math.abs(B.get(d)) < 0.5) { x.push(v); y.push(B.get(d)); } }); if (x.length < 200) return null; const mx = mean(x), my = mean(y); let n = 0, a = 0, b = 0; for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); a += (x[i] - mx) ** 2; b += (y[i] - my) ** 2; } return n / Math.sqrt(a * b); };
const inUni = gm.groups.flatMap(g => g.members.filter(m => sector[m.tk]).map(m => ({ tk: m.tk, g: g.id, s: sector[m.tk] })));
const R = Object.fromEntries(inUni.map(x => [x.tk, rets(x.tk)]));
const same = [], cross = [], sameAll = [];
for (let i = 0; i < inUni.length; i++) for (let j = i + 1; j < inUni.length; j++) {
  const a = inUni[i], b = inUni[j], c = corr(R[a.tk], R[b.tk]); if (c == null) continue;
  if (a.g === b.g) { sameAll.push(c); if (a.s === b.s) same.push(c); } else if (a.s === b.s) cross.push(c);
}
console.log(`\n===== H2 descriptive: daily-return correlation, last 500 sessions (members inside the 100) =====\n  same group, any sector ${f2(mean(sameAll))} (${sameAll.length} pairs) | same group AND same sector ${f2(mean(same))} (${same.length}) | different group, same sector ${f2(mean(cross))} (${cross.length})`);

// ---------- H3: ACT signals with the group read ----------
function sim(b, i0, stop, target, horizon) {
  const j0 = i0 + 1; if (j0 >= b.c.length) return null;
  const entry = b.o[j0], last = j0 + horizon - 1; if (last >= b.c.length) return null;
  for (let j = j0; j <= last; j++) {
    if (b.l[j] <= stop) return Math.min(stop, b.o[j]) / entry - 1 - FEE;
    if (b.h[j] >= target) return Math.max(target, b.o[j]) / entry - 1 - FEE;
  }
  return b.c[last] / entry - 1 - FEE;
}
const sdi = new Map(S.days.map((d, i) => [d, i]));
const A = [];
for (const u of uni) {
  const gid = gm.byTicker[u.ticker]; if (!gid) continue;
  const b = px[u.ticker + '.JK']; if (!b) continue;
  for (let t = 250; t < b.c.length - 17; t++) {
    const day = iso(b.d[t]), ii = sdi.get(day); if (ii == null || ii < 200) continue;
    const lo = Math.max(0, t + 1 - WINDOW);
    const w = { d: b.d.slice(lo, t + 1), o: b.o.slice(lo, t + 1), h: b.h.slice(lo, t + 1), l: b.l.slice(lo, t + 1), c: b.c.slice(lo, t + 1), v: b.v.slice(lo, t + 1) };
    const a = api.analyse_(w, idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), { targetPct: 8, stopMult: 2.5, horizon: 15 });
    if (!a || a.avgValue / 1e9 < 5 || a.stop >= a.entry) continue;
    const score = api.score_(a, 0); if (score < api.ACT_SCORE) continue;
    const gr = groupReadAt(S, gid, ii); if (!gr || !gr.quad || gr.active < 2) continue;
    const ret = sim(b, t, api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down'), a.target, 15); if (ret == null) continue;
    A.push({ tk: u.ticker, day, ret, design: DESIGN.has(u.ticker), quad: gr.quad, gid });
  }
}
const ad = [...new Set(A.map(s => s.day))].sort(), adi = new Map(ad.map((d, i) => [d, i]));
const episodes = L => { const by = {}, ep = []; L.forEach(s => { (by[s.tk] = by[s.tk] || []).push(s); }); Object.values(by).forEach(l => { l.sort((a, b) => a.day.localeCompare(b.day)); let last = -1e9; l.forEach(s => { const i = adi.get(s.day); if (i - last >= 15) { ep.push(s); last = i; } }); }); return ep; };
const welch = (a, b) => (a.length < 8 || b.length < 8 ? { gap: null, t: null, na: a.length, nb: b.length } : { gap: mean(a) - mean(b), t: (mean(a) - mean(b)) / Math.sqrt(sdv(a) ** 2 / a.length + sdv(b) ** 2 / b.length), ma: mean(a), mb: mean(b), na: a.length, nb: b.length });
const tail = s => s.quad === 'LEADING' || s.quad === 'IMPROVING', head = s => !tail(s);
const ep = episodes(A), e = welch(ep.filter(tail).map(s => s.ret), ep.filter(head).map(s => s.ret));
const byD = {}; A.forEach(s => { (byD[s.day] = byD[s.day] || []).push(s); });
const g = Object.values(byD).map(l => { const x = l.filter(tail), y = l.filter(head); return x.length && y.length ? mean(x.map(s => s.ret)) - mean(y.map(s => s.ret)) : null; }).filter(v => v != null);
const un = welch(A.filter(s => !s.design && tail(s)).map(s => s.ret), A.filter(s => !s.design && head(s)).map(s => s.ret));
const ha = welch(A.filter(s => s.day < SPLIT && tail(s)).map(s => s.ret), A.filter(s => s.day < SPLIT && head(s)).map(s => s.ret));
const hb = welch(A.filter(s => s.day >= SPLIT && tail(s)).map(s => s.ret), A.filter(s => s.day >= SPLIT && head(s)).map(s => s.ret));
const tDay = g.length > 5 ? tst(g) : null;
const h3pass = e.t >= 2 && tDay >= 2 && un.gap > 0 && ha.gap > 0 && hb.gap > 0;
const byQuad = Object.fromEntries(['LEADING', 'IMPROVING', 'WEAKENING', 'LAGGING'].map(q => { const l = ep.filter(s => s.quad === q); return [q, { n: l.length, avg: l.length ? mean(l.map(s => s.ret)) : null }]; }));
console.log(`\n===== H3: ACT signals in group stocks (${A.length} signal-days, ${ep.length} episodes) =====\n  group leading/improving ${e.na} ${pc(e.ma)} vs lagging/weakening ${e.nb} ${pc(e.mb)}: gap ${pc(e.gap)} t=${f2(e.t)} | by day ${pc(mean(g))} t=${f2(tDay)} (${g.length} d) | unseen ${pc(un.gap)} | halves ${pc(ha.gap)} / ${pc(hb.gap)} -> ${h3pass ? 'PASS' : 'fail'}`);
Object.entries(byQuad).forEach(([q, v]) => console.log(`   ${q.padEnd(10)} episodes ${v.n} avg ${pc(v.avg)}`));

// ---------- H4: after a group jump ----------
const ev = [];
for (const id of ids) {
  let last = -1e9; const l = S.g[id].lvl;
  for (let t = 70; t < T - 12; t++) {
    const r = groupReadAt(S, id, t); if (!r || r.active < 2 || r.r5 == null || r.r5 < 0.10 || t - last < 20) continue;
    const a = fwd(id, t, 10), b = fwdI(t, 10); if (a == null || b == null) continue;
    ev.push({ id, d: S.days[t], x: a - b }); last = t;
  }
}
const ex = ev.map(x => x.x), e1 = ev.filter(x => x.d < SPLIT).map(x => x.x), e2 = ev.filter(x => x.d >= SPLIT).map(x => x.x);
const h4pass = tst(ex) >= 2.5 && mean(e1) > 0 && mean(e2) > 0;
console.log(`\n===== H4: next 10 sessions after a group jumps >= 10% in 5 sessions =====\n  ${ev.length} events: vs IHSG ${pc(mean(ex))} t ${f2(tst(ex))}; halves ${pc(mean(e1))} / ${pc(mean(e2))}; positive ${pc(mean(ex.map(v => (v > 0 ? 1 : 0))))} -> ${h4pass ? 'PASS' : 'fail'}`);
const evBy = {}; ev.forEach(x => { (evBy[x.id] = evBy[x.id] || []).push(x.x); });
console.log('   by group:', Object.entries(evBy).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `${k} ${v.length}x ${pc(mean(v))}`).join(' | '));

fs.writeFileSync(path.join(ROOT, 'data', 'groups-study.json'), JSON.stringify({
  asOf: new Date().toISOString().slice(0, 10), from: p.from, groups: ids.length,
  h1: { verdict: h1, horizons: Object.fromEntries(Object.values(P).map(x => [x.h, { n: x.n, avg: x.avg, tAdj: x.tAdj, h1: x.h1, h2: x.h2 }])), runMedianWeeks: med(runs), runMeanWeeks: mean(runs), runs: runs.length, leaderChanges: leadChanges, weeks: wk.length, timesTop3: timesTop },
  h2: { sameGroup: mean(sameAll), sameGroupSameSector: mean(same), crossGroupSameSector: mean(cross), pairs: [sameAll.length, same.length, cross.length] },
  h3: { pass: h3pass, signals: A.length, episodes: ep.length, nA: e.na, nB: e.nb, avgA: e.ma, avgB: e.mb, gap: e.gap, t: e.t, gapDay: mean(g), tDay, unseen: un.gap, h1: ha.gap, h2: hb.gap, byQuad },
  h4: { pass: h4pass, events: ev.length, avg: mean(ex), t: tst(ex), h1: mean(e1), h2: mean(e2), win: mean(ex.map(v => (v > 0 ? 1 : 0))), byGroup: Object.fromEntries(Object.entries(evBy).map(([k, v]) => [k, { n: v.length, avg: mean(v) }])) },
}));
console.log('\nwrote data/groups-study.json');

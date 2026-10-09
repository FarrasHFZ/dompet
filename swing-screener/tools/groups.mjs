// Conglomerate groups ("saham PP", "saham Haji Isam", ...). Pure functions shared by the build (tools/build-snapshot.mjs)
// and the study (tools/experiment-groups.mjs), plus a CLI that turns the hand-curated tools/groups-map.json into the
// public data/groups.json with KSEI evidence for every link:  node tools/groups.mjs
//
// Group index = equal-weight average of the members' daily returns (a member counts from its 'since' date and only while
// its 60-session average traded value is >= Rp 1 B, so a dormant stock cannot move the group). Relative strength = the
// group's 20-session return minus the IHSG's; momentum = that relative strength now minus 5 sessions ago. Quadrants as in
// a relative-rotation chart: leading (strong, still gaining), weakening (strong, fading), lagging, improving.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CACHE } from './lib.mjs';

export const MIN_VALUE = 1e9;
const iso = d => d.toISOString().slice(0, 10);

export function loadGroups() {
  const f = path.join(ROOT, 'data', 'groups.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

// KSEI evidence for each curated link.
export function mapGroups(map, rows, asOf) {
  const by = {}; rows.forEach(r => { (by[r.share_code] = by[r.share_code] || []).push(r); });
  const groups = map.groups.map(g => ({
    id: g.id, name: g.name, alias: g.alias,
    members: g.members.map(([tk, re, note, since]) => {
      const hits = re ? (by[tk] || []).filter(r => new RegExp(re, 'i').test(r.investor_name)).sort((a, b) => b.percentage - a.percentage) : [];
      const ev = hits.slice(0, 2).map(r => `${r.investor_name.replace(/\s+/g, ' ').trim()} ${(+r.percentage).toFixed(2)}%`).join('; ');
      return { tk, evidence: ev || null, soft: !ev, note: note || null, since: since || null, linkPct: hits.length ? +hits.reduce((s, r) => s + +r.percentage, 0).toFixed(2) : null };
    }),
  }));
  const byTicker = {}; groups.forEach(g => g.members.forEach(m => { byTicker[m.tk] = g.id; }));
  return { asOf, source: 'KSEI shareholders >= 1% (via IDX), curated in tools/groups-map.json', groups, byTicker };
}

// Daily equal-weight index per group on the IHSG calendar. Returns { days, ihsg, g: { id: { lvl, n, ret } } }.
export function groupSeries(px, gm, idx) {
  const days = idx.d.map(iso), di = new Map(days.map((d, i) => [d, i]));
  const out = { days, ihsg: idx.c, g: {} };
  for (const g of gm.groups) {
    const ret = new Array(days.length).fill(null), n = new Array(days.length).fill(0);
    const sums = new Array(days.length).fill(0);
    for (const m of g.members) {
      const b = px[m.tk + '.JK']; if (!b) continue;
      const tv = b.c.map((c, i) => c * b.v[i]);
      let roll = 0;
      for (let i = 0; i < b.c.length; i++) {
        roll += tv[i]; if (i >= 60) roll -= tv[i - 60];
        if (i < 60 || roll / 60 < MIN_VALUE) continue;
        const d = iso(b.d[i]), k = di.get(d); if (k == null) continue;
        if (m.since && d < m.since) continue;
        const r = b.c[i] / b.c[i - 1] - 1; if (!Number.isFinite(r) || Math.abs(r) > 0.6) continue; // drop broken bars
        sums[k] += r; n[k]++;
      }
    }
    let lvl = 1; const L = [];
    for (let k = 0; k < days.length; k++) { if (n[k]) { ret[k] = sums[k] / n[k]; lvl *= 1 + ret[k]; } L.push(n[k] ? lvl : (L.length ? L[L.length - 1] : 1)); }
    out.g[g.id] = { lvl: L, n, ret };
  }
  return out;
}

const chg = (a, t, w) => (t - w < 0 || a[t - w] == null || !a[t - w] ? null : a[t] / a[t - w] - 1);
// Read at session t: returns, relative strength, momentum, quadrant, members active.
export function groupReadAt(S, id, t) {
  const s = S.g[id]; if (!s || t < 66) return null;
  let active = 0; for (let k = t - 4; k <= t; k++) active = Math.max(active, s.n[k]);
  if (!active) return null;
  const rel = k => { const a = chg(s.lvl, k, 20), b = chg(S.ihsg, k, 20); return a == null || b == null ? null : a - b; };
  const rs = rel(t), rs5 = rel(t - 5);
  const mom = rs == null || rs5 == null ? null : rs - rs5;
  const quad = rs == null || mom == null ? null : rs >= 0 ? (mom >= 0 ? 'LEADING' : 'WEAKENING') : (mom >= 0 ? 'IMPROVING' : 'LAGGING');
  return { r5: chg(s.lvl, t, 5), r20: chg(s.lvl, t, 20), r60: chg(s.lvl, t, 60), rs, mom, quad, active };
}

// Public summary for the site: today's read for every group, an 8-week trail for the rotation chart, a 26-week rank
// history (by 20-session relative strength) and how long the current leader has led.
export function groupSummary(S, gm) {
  const T = S.days.length - 1, ids = gm.groups.map(g => g.id);
  const rankAt = t => { const v = ids.map(id => [id, groupReadAt(S, id, t)]).filter(([, r]) => r && r.rs != null && r.active >= 2).sort((a, b) => b[1].rs - a[1].rs); return Object.fromEntries(v.map(([id], i) => [id, i + 1])); };
  const weeks = []; for (let k = 25; k >= 0; k--) { const t = T - 5 * k; if (t > 70) weeks.push({ d: S.days[t], rank: rankAt(t) }); }
  const groups = gm.groups.map(g => {
    const r = groupReadAt(S, g.id, T);
    const trail = []; for (let k = 7; k >= 0; k--) { const x = groupReadAt(S, g.id, T - 5 * k); if (x && x.rs != null && x.mom != null) trail.push([+x.rs.toFixed(4), +x.mom.toFixed(4)]); }
    // weeks in the top 3 without a break, counting back from now
    let top = 0; for (let k = weeks.length - 1; k >= 0; k--) { const rk = weeks[k].rank[g.id]; if (rk && rk <= 3) top++; else break; }
    const lvl = S.g[g.id].lvl, spark = []; for (let k = 59; k >= 0; k--) spark.push(+(lvl[T - k] / lvl[T - 59]).toFixed(4));
    return { id: g.id, name: g.name, alias: g.alias, members: g.members.map(m => ({ tk: m.tk, soft: m.soft, evidence: m.evidence, note: m.note })), read: r && Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(4) : v])), trail, weeksTop3: top, spark };
  });
  return { asOf: S.days[T], mapAsOf: gm.asOf, rankNow: rankAt(T), weeks, groups };
}

if (process.argv[1] && process.argv[1].endsWith('groups.mjs')) {
  const { parseCsv, fetchLatestCsv } = await import('./ownership.mjs');
  let name, text;
  try { ({ name, text } = await fetchLatestCsv()); fs.writeFileSync(path.join(CACHE, 'ownership_latest.csv'), text); } catch (e) { console.error('fetch failed, using cache:', e.message); name = 'cache'; text = fs.readFileSync(path.join(CACHE, 'ownership_latest.csv'), 'utf8'); }
  const rows = parseCsv(text), asOf = (name.match(/(\d{8})/) || [])[1];
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'groups-map.json'), 'utf8'));
  const gm = mapGroups(map, rows, asOf ? `${asOf.slice(0, 4)}-${asOf.slice(4, 6)}-${asOf.slice(6)}` : null);
  fs.writeFileSync(path.join(ROOT, 'data', 'groups.json'), JSON.stringify(gm, null, 1));
  gm.groups.forEach(g => console.log(g.id.padEnd(9), g.members.map(m => m.tk + (m.soft ? '*' : '')).join(' ')));
  console.log(`wrote data/groups.json (KSEI ${gm.asOf}); * = known link, holder not named in the KSEI list`);
}

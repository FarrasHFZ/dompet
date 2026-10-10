// Bandarmetrics labels for the site. Merges any incremental pulls (data/bm-snap/*.json, same shape as bm-history.json,
// from tools/bm-pull.js with a recent start date) into data/bm-history.json, then writes the public, direction-only
// data/bm-tags-DATE.json (DATE = newest Bandarmetrics day) using tools/bm-model.mjs. Older bm-tags files are removed.
// The read is CONTEXT ONLY: tools/experiment-bm.mjs found it does not improve ACT trades, so it never changes a tier.
// Usage: node tools/bm-labels.mjs
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
import { bmRead, bmPublic, foreignProfile } from './bm-model.mjs';

const DATA = path.join(ROOT, 'data'), HIST = path.join(DATA, 'bm-history.json'), SNAP = path.join(DATA, 'bm-snap');
if (!fs.existsSync(HIST)) { console.error('No data/bm-history.json. Run tools/bm-pull.js in a logged-in Bandarmetrics tab first.'); process.exit(1); }
const H = JSON.parse(fs.readFileSync(HIST, 'utf8'));

// 1. merge incremental pulls (later values win for the same date)
const snaps = fs.existsSync(SNAP) ? fs.readdirSync(SNAP).filter(f => f.endsWith('.json')).sort() : [];
let merged = 0;
for (const f of snaps) {
  const j = JSON.parse(fs.readFileSync(path.join(SNAP, f), 'utf8'));
  for (const [tk, s] of Object.entries(j)) {
    const cur = H[tk] || { d: [], l: [], i: [], v: [], m: [] }, by = new Map(cur.d.map((d, k) => [d, k]));
    const rows = cur.d.map((d, k) => [d, cur.l[k], cur.i[k], cur.v[k], cur.m[k]]);
    s.d.forEach((d, k) => { const row = [d, s.l[k], s.i[k], s.v[k], s.m[k]]; if (by.has(d)) rows[by.get(d)] = row; else rows.push(row); });
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    H[tk] = { d: rows.map(r => r[0]), l: rows.map(r => r[1]), i: rows.map(r => r[2]), v: rows.map(r => r[3]), m: rows.map(r => r[4]) };
    merged++;
  }
}
if (merged) fs.writeFileSync(HIST, JSON.stringify(H));

// 2. read the newest day per stock
const api = loadEngine(), uni = universe(api);
const px = await loadPrices(uni.map(u => u.ticker + '.JK'), '2y', process.env.REFRESH !== '1');
let FLOW = null;
try { FLOW = JSON.parse(fs.readFileSync(path.join(DATA, 'idx-foreign-flow.json'), 'utf8')); } catch { /* lens falls back to money flow */ }
const fdays = FLOW ? Object.keys(FLOW).sort() : [];
const by = {}, lpm60 = {};
let asOf = '';
for (const u of uni) {
  const s = H[u.ticker]; if (!s || !s.d.length) continue;
  const t = s.d.length - 1, day = s.d[t];
  const b = px[u.ticker + '.JK'];
  let chg20 = null;
  if (b) { let i = b.d.length - 1; while (i >= 0 && b.d[i].toISOString().slice(0, 10) > day) i--; if (i >= 20) chg20 = b.c[i] / b.c[i - 20] - 1; }
  // Foreign profile changes slowly; use the IDX history up to the day if it is at most 30 days stale.
  let fp = null;
  if (fdays.length) {
    const upto = fdays.filter(d => d <= day.replace(/-/g, '')), lastF = upto.at(-1);
    if (lastF && (new Date(day) - new Date(lastF.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3'))) / 864e5 <= 30) fp = foreignProfile(upto.slice(-181).map(d => FLOW[d][u.ticker] || null));
  }
  const r = bmRead(s, t, { chg20 }, fp);
  if (!r) continue;
  by[u.ticker] = { asOf: day, ...bmPublic(r) };
  // Forward-test flags (tools/bm-forward.mjs, from tools/experiment-bmpattern.mjs leads): Money Flow 20-session change
  // above its own year's norm (mf), and an Intensity spike: the max of the last 3 sessions in the top 20% of the
  // previous 120 (is). Booleans only.
  { const zc = (arr, k, w) => { if (k < w + 250) return null; const ch = []; for (let j = k - 250; j <= k; j += 5) if (arr[j] != null && arr[j - w] != null) ch.push(arr[j] - arr[j - w]); if (ch.length < 30 || arr[k] == null || arr[k - w] == null) return null; const m = ch.reduce((a, x) => a + x, 0) / ch.length, sdv = Math.sqrt(ch.reduce((a, x) => a + (x - m) ** 2, 0) / ch.length); return sdv ? (arr[k] - arr[k - w] - m) / sdv : null; };
    const zm = zc(s.m, t, 20), iw = s.i.slice(Math.max(0, t - 122), t - 2).filter(x => x != null).sort((a, b) => a - b), im = Math.max(...s.i.slice(t - 2, t + 1).filter(x => x != null));
    if (zm != null) by[u.ticker].mf = zm > 0;
    if (iw.length >= 90 && isFinite(im)) by[u.ticker].is = im >= iw[Math.floor(iw.length * 0.8)]; }
  if (r.lpm60z != null) lpm60[u.ticker] = r.lpm60z;
  if (day > asOf) asOf = day;
}
// Experimental BM accumulation score: today's percentile (0-100) of the 60-session LPM trend across the universe.
const z60 = Object.entries(lpm60).sort((a, b) => a[1] - b[1]);
z60.forEach(([tk], k) => { by[tk].score = Math.round(z60.length > 1 ? (k / (z60.length - 1)) * 100 : 50); });
fs.writeFileSync(path.join(DATA, `bm-tags-${asOf}.json`), JSON.stringify(by));
fs.readdirSync(DATA).filter(f => /^bm-tags-\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== `bm-tags-${asOf}.json`).forEach(f => fs.unlinkSync(path.join(DATA, f)));
const cnt = {}; Object.values(by).forEach(x => { cnt[x.read] = (cnt[x.read] || 0) + 1; });
console.log(`merged ${merged} incremental record(s); bm-tags-${asOf}.json: ${Object.keys(by).length} stocks`, JSON.stringify(cnt));

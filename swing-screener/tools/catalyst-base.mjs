// CATALYST IN A BASE (pre-registered 2026-10-12, committed before the first run).
//
// Idea (owner's question): a stock that is quiet (sideways, or near the bottom of its range) does not rally by itself on
// IDX (tools/experiment-bottoms.mjs, experiment-base.mjs: bottoms and bases did WORSE). What wakes a dead stock is news
// that changes who owns it or what it earns. So: quiet stock + a real catalyst filing = the rally setup to test.
//
// DEFINITIONS (fixed here):
//   quiet on day k  = SIDEWAYS (high / low of the 40 sessions before k within 25%) OR BOTTOM (close in the lowest 25% of
//                     its 250-session high-low range). Liquid: 20-session average traded value >= Rp 1 B.
//   catalyst        = a filing that can change ownership or earnings, one of: change of control / tender offer,
//                     acquisition or merger, a material contract, a share buyback plan, a change of business.
//     history  (IDX titles, tools/ann-pull.js, 100 stocks, 2023-07 .. ): title rules in catalystOfTitle() below.
//     forward  (Claude digest, data/filing-digest.json, all 300): kind in KINDS, impact >= 2, dir not '-'.
//   event           = first catalyst of a stock on a quiet day; then no new event for that stock for 20 sessions.
//   entry           = open of the first session AFTER the filing's calendar day; outcome = open 20 sessions later / entry,
//                     minus the same window's average of all liquid stocks in the set (excess return).
//
// H1 HISTORY (100 stocks with IDX filing titles, filings 2023-07-01 .. 2026-08-31):
//   control = quiet, liquid stock-days with no catalyst within 20 sessions, sampled every 20th IHSG session (same stocks).
//   PASS: >= 30 events; mean excess > 0 with t >= 2 (one value per calendar month, months with events); mean excess >
//   the control's; mean > 0 in both halves (split at the median event date). Reported, not part of the bar: catalysts on
//   non-quiet days, each catalyst class.
// H2 FORWARD (all 300, digest filings from 2026-10-13): same event, outcome and bar, with >= 40 events. Until then the
//   setup is a WATCH chip on the site ("Catalyst in a base"), never an ACT badge. If H1 fails, the forward test still
//   runs (history is short and only covers 100 stocks); a pass of H2 alone is what can promote it.
// Nothing here is retuned after the first run.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';

export const H = 20, GAP = 20, FORWARD_FROM = '2026-10-13';
export const KINDS = ['change-of-control', 'tender-offer', 'acquisition', 'contract', 'buyback', 'new-business'];
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN), sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const iso = d => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);

export function catalystOfTitle(title) {
  const t = title.toLowerCase();
  if (/pengambilalihan|perubahan dalam pengendalian|pengendali baru|penawaran tender/.test(t)) return 'control';
  if (/akuisisi|penggabungan usaha|merger|peleburan|pembelian atau penjualan saham perusahaan yang nilainya material|perjanjian (jual beli|penjualan dan pembelian) bersyarat/.test(t)) return 'acquisition';
  if (/kontrak penting|perolehan kontrak/.test(t)) return 'contract';
  if (/pembelian kembali saham|buyback/.test(t) && !/utang|sukuk|hasil|pengalihan|berakhir|penghentian|pengakhiran|bukti iklan/.test(t)) return 'buyback';
  if (/perubahan kegiatan usaha/.test(t)) return 'new-business';
  return null;
}
export const catalystOfDigest = i => (KINDS.includes(i.kind) && (i.impact ?? 0) >= 2 && i.dir !== '-' ? i.kind : null);

// quiet / liquid on bar k (bars oldest first)
export function quietAt(b, k) {
  if (k < 250) return null;
  let val = 0; for (let i = k - 19; i <= k; i++) val += b.c[i] * b.v[i];
  const liquid = val / 20 / 1e9 >= 1;
  const hi40 = Math.max(...b.h.slice(k - 40, k)), lo40 = Math.min(...b.l.slice(k - 40, k));
  const hi = Math.max(...b.h.slice(k - 249, k + 1)), lo = Math.min(...b.l.slice(k - 249, k + 1));
  const sideways = lo40 > 0 && hi40 / lo40 - 1 <= 0.25, bottom = hi > lo && (b.c[k] - lo) / (hi - lo) <= 0.25;
  return { liquid, quiet: sideways || bottom, sideways, bottom };
}

// k of the first session strictly after calendar day `day`
const after = (b, day) => { for (let k = 0; k < b.d.length; k++) if (iso(b.d[k]) > day) return k; return -1; };
const fwdRet = (b, j) => (j >= 1 && j + H < b.c.length ? b.o[j + H] / b.o[j] - 1 : null);

// Average liquid-stock return over the same window (entry session j of IHSG-aligned dates), cached per entry date.
function marketMean(px, tks) {
  const cache = new Map();
  return day => {
    if (cache.has(day)) return cache.get(day);
    const r = [];
    for (const t of tks) { const b = px[t + '.JK']; if (!b) continue; const j = b.d.findIndex(d => iso(d) === day); if (j < 1) continue; const q = quietAt(b, j - 1); if (!q || !q.liquid) continue; const f = fwdRet(b, j); if (f != null) r.push(f); }
    const m = r.length >= 10 ? mean(r) : null; cache.set(day, m); return m;
  };
}

// filings: [{ t, day, cls }] -> events with excess returns (quiet and non-quiet kept apart)
export function events(px, tks, filings) {
  const mm = marketMean(px, tks), last = {}, out = [];
  for (const f of filings.slice().sort((a, b) => (a.day < b.day ? -1 : 1))) {
    const b = px[f.t + '.JK']; if (!b) continue;
    const j = after(b, f.day); if (j < 1) continue;
    if (last[f.t] != null && j <= last[f.t]) continue;
    const q = quietAt(b, j - 1); if (!q || !q.liquid) continue;
    const r = fwdRet(b, j), m = r == null ? null : mm(iso(b.d[j]));
    last[f.t] = j + GAP;
    out.push({ t: f.t, day: f.day, entry: iso(b.d[j]), cls: f.cls, quiet: q.quiet, sideways: q.sideways, bottom: q.bottom, ex: r == null || m == null ? null : r - m });
  }
  return out;
}

export function verdict(ev, ctrlMean, minN) {
  const done = ev.filter(e => e.ex != null), byM = new Map();
  done.forEach(e => { const m = e.day.slice(0, 7); if (!byM.has(m)) byM.set(m, []); byM.get(m).push(e.ex); });
  const xs = [...byM.values()].map(mean), ds = done.map(e => e.day).sort(), mid = ds[ds.length >> 1];
  const r = { n: done.length, pending: ev.length - done.length, ex: mean(done.map(e => e.ex)), t: xs.length > 1 ? mean(xs) / (sd(xs) / Math.sqrt(xs.length) || 1) : 0, months: xs.length,
    first: mean(done.filter(e => e.day < mid).map(e => e.ex)), second: mean(done.filter(e => e.day >= mid).map(e => e.ex)), win: done.filter(e => e.ex > 0).length / (done.length || 1), control: ctrlMean };
  r.pass = r.n >= minN && r.ex > 0 && r.t >= 2 && (ctrlMean == null || r.ex > ctrlMean) && r.first > 0 && r.second > 0;
  return r;
}

// Control: quiet, liquid stock-days with no catalyst within GAP sessions, every 20th IHSG session from `from` to `to`.
export function control(px, tks, filings, from, to) {
  const idx = px['^JKSE'], mm = marketMean(px, tks), byT = {}, r = [];
  filings.forEach(f => (byT[f.t] = byT[f.t] || []).push(f.day));
  for (let i = 0; i < idx.d.length; i += 20) {
    const day = iso(idx.d[i]); if (day < from || day > to) continue;
    for (const t of tks) {
      const b = px[t + '.JK']; if (!b) continue;
      const j = after(b, day); if (j < 1) continue;
      const q = quietAt(b, j - 1); if (!q || !q.liquid || !q.quiet) continue;
      const near = (byT[t] || []).some(d => { const k = after(b, d); return k >= 0 && Math.abs(k - j) <= GAP; });
      if (near) continue;
      const f = fwdRet(b, j), m = f == null ? null : mm(iso(b.d[j])); if (f != null && m != null) r.push(f - m);
    }
  }
  return { n: r.length, ex: mean(r) };
}

// Forward test (used by tools/build-snapshot.mjs): digest filings of the 300 from FORWARD_FROM.
export function forwardTest(px, tks, digest) {
  const fil = (digest.items || []).filter(i => i.d.slice(0, 10) >= FORWARD_FROM && catalystOfDigest(i)).map(i => ({ t: i.t, day: i.d.slice(0, 10), cls: catalystOfDigest(i) }));
  const ev = events(px, tks, fil), q = ev.filter(e => e.quiet);
  return { from: FORWARD_FROM, needed: 40, events: q.length, nonQuiet: ev.length - q.length, verdict: verdict(q, null, 40), list: q.slice(-30) };
}

// Usage: node tools/catalyst-base.mjs     (H1 history run -> data/catalyst-base-study.json)
if (process.argv[1] && process.argv[1].endsWith('catalyst-base.mjs')) {
  const api = loadEngine(), ann = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'idx-announcements.json'), 'utf8'));
  const tks = Object.keys(ann), FROM = '2023-07-01', TO = '2026-08-31';
  const px = await loadPrices(universe(api).map(u => u.ticker).filter(t => tks.includes(t)).map(t => t + '.JK').concat(['^JKSE']), '10y', true);
  const fil = tks.flatMap(t => ann[t].map(r => ({ t, day: r[0].slice(0, 10), cls: catalystOfTitle(r[1]) }))).filter(f => f.cls && f.day >= FROM && f.day <= TO);
  const ev = events(px, tks, fil), q = ev.filter(e => e.quiet), nq = ev.filter(e => !e.quiet);
  const ctrl = control(px, tks, fil, FROM, TO), v = verdict(q, ctrl.ex, 30);
  const pct = x => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%');
  const byCls = Object.fromEntries([...new Set(q.map(e => e.cls))].map(c => [c, verdict(q.filter(e => e.cls === c), null, 0)]));
  console.log(`catalyst filings ${fil.length} on ${tks.length} stocks; events ${ev.length} (quiet ${q.length}, not quiet ${nq.length})`);
  console.log(`H1 quiet + catalyst: n ${v.n}  excess ${pct(v.ex)} per 20 sessions  t ${v.t.toFixed(2)} (${v.months} months)  halves ${pct(v.first)} / ${pct(v.second)}  beat market ${(v.win * 100).toFixed(0)}%`);
  console.log(`   control quiet, no catalyst: n ${ctrl.n}  excess ${pct(ctrl.ex)}`);
  const vn = verdict(nq, null, 0);
  console.log(`   catalyst, not quiet: n ${vn.n}  excess ${pct(vn.ex)}  t ${vn.t.toFixed(2)}`);
  Object.entries(byCls).forEach(([c, r]) => console.log(`   ${c.padEnd(13)} n ${r.n}  ${pct(r.ex)}  t ${r.t.toFixed(2)}`));
  console.log(v.pass ? 'H1 PASS' : 'H1 FAIL');
  fs.writeFileSync(path.join(ROOT, 'data', 'catalyst-base-study.json'), JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), from: FROM, to: TO, stocks: tks.length, filings: fil.length, h1: v, control: ctrl, notQuiet: vn, byClass: byCls, events: q }, null, 1));
}

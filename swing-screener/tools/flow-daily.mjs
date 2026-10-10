// Daily broker-flow step, run after tools/neobdm-pull.js has saved today's snapshot (see README "Broker-flow workflow").
//   1. checks the newest data/neobdm-snap/DATE.json is complete and recent
//   2. writes the public labels data/neobdm-tags-DATE.json (directions only) and removes older label files
//   3. re-scores every saved snapshot against prices -> data/flow-scorecard.json (forward test + promotion checklist)
// Commit the two data files afterwards; the GitHub build picks them up.
// Usage: node tools/flow-daily.mjs
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT } from './lib.mjs';
import { snapToTags } from './neobdm.mjs';
import { readSnaps, scoreSnaps } from './flow-forward.mjs';
import { chartTag, chartStrip } from './nb-pages.mjs';

const DATA = path.join(ROOT, 'data'), SNAP = path.join(DATA, 'neobdm-snap');
const files = fs.existsSync(SNAP) ? fs.readdirSync(SNAP).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
if (!files.length) { console.error('No snapshot in data/neobdm-snap/. Run tools/neobdm-pull.js in the NeoBDM tab first.'); process.exit(1); }
const newest = files.at(-1), date = newest.slice(0, 10);
const raw = JSON.parse(fs.readFileSync(path.join(SNAP, newest), 'utf8'))[date];
const n = Object.keys(raw.rows).length;
const ageDays = (Date.now() - new Date(date + 'T10:00:00Z')) / 864e5;
if (!raw.complete || n < 95) { console.error(`Snapshot ${date} is incomplete (${n} rows, complete=${raw.complete}). Re-run the pull; not publishing.`); process.exit(1); }
if (ageDays > 4) console.warn(`Warning: newest snapshot is ${date} (${ageDays.toFixed(0)} days old). The site will mark it stale after 5 days.`);

const { by } = snapToTags(path.join(SNAP, newest));
const api = loadEngine(), uni = universe(api);
const bars = await loadPrices(uni.map(u => u.ticker + '.JK'), '2y', process.env.REFRESH !== '1');
// Stocks outside the NeoBDM 'swing-100' list: labels from their stock pages (tools/nb-pages.mjs), same model, when the
// page data in data/nb-history.json reaches the snapshot date.
const NBH = path.join(DATA, 'nb-history.json'), NB = fs.existsSync(NBH) ? JSON.parse(fs.readFileSync(NBH, 'utf8')) : {};
let fromChart = 0, chartStale = [];
for (const u of uni) {
  if (by[u.ticker] || !NB[u.ticker]) continue;
  // the evening task refreshes half of these pages per day, so a reading up to 4 calendar days old is accepted
  const g = NB[u.ticker].g, d = g && g.d.filter(x => x <= date).at(-1);
  // A suspended stock has no sessions after its last trade: keep that last read, dated, instead of dropping it.
  const b = bars[u.ticker + '.JK'], after = b && d ? b.d.map((x, i) => [x.toISOString().slice(0, 10), b.v[i]]).filter(([x]) => x > d && x <= date) : [];
  const suspended = after.length > 0 && after.every(([, v]) => !v);
  const t = d && ((Date.parse(date) - Date.parse(d)) / 864e5 <= 4 || suspended) ? chartTag(NB[u.ticker], b, d) : null;
  if (t && suspended) t.note = `No trading since ${d} (suspended?). ` + t.note;
  if (t) { by[u.ticker] = d === date ? t : { ...t, asOf: d }; fromChart++; } else chartStale.push(u.ticker);
}
console.log(`page-derived labels: ${fromChart}${chartStale.length ? `; no page data for ${date}: ${chartStale.length} (${chartStale.slice(0, 8).join(', ')}${chartStale.length > 8 ? ', …' : ''})` : ''}`);
fs.writeFileSync(path.join(DATA, `neobdm-tags-${date}.json`), JSON.stringify(by));
fs.readdirSync(DATA).filter(f => /^neobdm-tags-\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== `neobdm-tags-${date}.json`).forEach(f => fs.unlinkSync(path.join(DATA, f)));
// Extend the per-stock 60-session tag strip (data/nb-history-tags.json, from tools/experiment-nb.mjs) with today's tag.
const HT = path.join(DATA, 'nb-history-tags.json');
if (fs.existsSync(HT)) {
  const ht = JSON.parse(fs.readFileSync(HT, 'utf8'));
  if (date > ht.asOf) {
    for (const [tk, t] of Object.entries(by)) {
      const h = ht.by[tk]; if (!h) continue;
      if (h.d1 >= date) continue;
      h.t = (h.t + ({ 'FLOW+': '+', 'FLOW-': '-', 'FLOW~': '~' }[t.tag] || '?')).slice(-60);
      h.phDays = t.phase === h.ph ? (h.phDays || 0) + 1 : 1; h.ph = t.phase; h.d1 = date;
    }
    ht.asOf = date;
  }
  // first time a page-derived stock appears: build its strip from the page history
  for (const tk of Object.keys(by)) if (!ht.by[tk] && NB[tk]) { const st = chartStrip(NB[tk], bars[tk + '.JK']); if (st) ht.by[tk] = st; }
  fs.writeFileSync(HT, JSON.stringify(ht));
}
const cnt = {}; Object.values(by).forEach(t => { cnt[t.tag] = (cnt[t.tag] || 0) + 1; });
console.log(`labels ${date}: ${n} stocks`, JSON.stringify(cnt));

const sc = scoreSnaps(readSnaps(), bars);
fs.writeFileSync(path.join(DATA, 'flow-scorecard.json'), JSON.stringify({ ...sc, asOf: new Date().toISOString() }));
const s5 = sc.horizons[5].spread;
console.log(`forward test: ${sc.snapshots} snapshots (${sc.firstSnap}..${sc.lastSnap}); resolved 5-session spread days ${s5.days}${s5.days ? `, FLOW+ minus FLOW- ${(s5.avg * 100).toFixed(2)}% adj t=${s5.tAdj == null ? 'n/a' : s5.tAdj.toFixed(2)}` : ''}`);
console.log('promotion:', sc.promotion.promoted ? 'PASSED - flow may now change tiers (edit tierOf in tools/neobdm.mjs deliberately)' : 'not yet');
sc.promotion.checks.forEach(c => console.log(c.ok ? ' [x]' : ' [ ]', c.rule, JSON.stringify(c.value)));
console.log(`\nnext: git add swing-screener/data/neobdm-tags-${date}.json swing-screener/data/flow-scorecard.json swing-screener/data/nb-history-tags.json && git commit && git push`);

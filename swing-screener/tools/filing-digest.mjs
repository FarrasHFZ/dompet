// Filing digest: what each IDX filing actually says, in plain English, with what is new, how big it is, what it could
// trigger and how much it matters. The texts are read in a browser tab on idx.co.id (tools/ann-read.js); Claude reads
// them and writes a batch file; this merges batches into data/filing-digest.json (committed: our own summaries plus
// links to the IDX originals). build-snapshot.mjs attaches each stock's digest to its Catalyst tab.
//
// Batch file: { items: [ { t, d, title, url, kind, head, what, size, why, impact, dir, watch } ],
//               stories: { TICKER: "the big thing going on, 1-2 sentences" } }
//   impact 3 = big (can re-rate the stock: deal >= ~10% of market cap, change of control, rights issue, new business,
//              tender offer, suspension risk), 2 = notable, 1 = minor, 0 = routine (kept so it is not re-read)
//   dir 'up' | 'down' | 'mixed' | '?'   the likely direction for shareholders, not a forecast
// Usage: node tools/filing-digest.mjs <batch.json> [...]     (no file: print a summary)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const OUT = path.join(ROOT, 'data', 'filing-digest.json');
export const loadDigest = () => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return { asOf: null, items: [], stories: {} }; } };
export const keyOf = x => `${x.t}|${x.d}`;

if (process.argv[1] && path.basename(process.argv[1]) === 'filing-digest.mjs') {
  const D = loadDigest(), by = new Map(D.items.map(x => [keyOf(x), x]));
  let added = 0, updated = 0;
  // --meta <file>: the reader's export { "T|timestamp": { title, url, scan, auto } } (via flow-receiver). It fills in
  // the IDX title and PDF link of every digested filing, and adds the formulaic ones it parsed itself (ownership
  // reports, "no material information" answers to IDX, public-expose slides) unless Claude already wrote them.
  const args = process.argv.slice(2), mi = args.indexOf('--meta');
  const META = mi >= 0 ? JSON.parse(fs.readFileSync(args.splice(mi, 2)[1], 'utf8')) : null;
  for (const f of args) {
    const B = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const x of B.items || []) {
      if (!x.t || !x.d || !x.head) { console.error('skipped (missing t / d / head):', JSON.stringify(x).slice(0, 120)); continue; }
      const k = keyOf(x); by.has(k) ? updated++ : added++;
      by.set(k, { ...by.get(k), ...x, impact: Math.max(0, Math.min(3, +x.impact || 0)) });
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const [t, s] of Object.entries(B.stories || {})) D.stories[t] = { text: typeof s === 'string' ? s : s.text, at: (typeof s === 'string' ? null : s.at) || today };
  }
  if (META) for (const [k, m] of Object.entries(META)) {
    const [t, d] = k.split('|'), cur = by.get(k);
    if (cur) by.set(k, { ...cur, title: cur.title || m.title, url: cur.url || m.url });
    else if (m.auto) { by.set(k, { t, d, title: m.title, url: m.url, ...m.auto, auto: 1 }); added++; }
    else if (m.scan) { by.set(k, { t, d, title: m.title, url: m.url, kind: 'other', impact: 0, dir: '?', head: m.title, what: 'Scanned PDF: open the original.', auto: 1 }); added++; }
  }
  D.items = [...by.values()].sort((a, b) => b.d.localeCompare(a.d));
  D.asOf = D.items.length ? D.items[0].d.slice(0, 10) : D.asOf;
  if (args.length || META) fs.writeFileSync(OUT, JSON.stringify(D, null, 1));
  const big = D.items.filter(x => x.impact === 3);
  console.log(`filing digest: ${D.items.length} filings (+${added}, ${updated} updated), ${big.length} big, ${Object.keys(D.stories).length} stock stories, newest ${D.asOf}`);
  big.slice(0, 15).forEach(x => console.log(`  ${x.d.slice(0, 10)} ${x.t.padEnd(5)} ${x.dir.padEnd(5)} ${x.head}`));
}

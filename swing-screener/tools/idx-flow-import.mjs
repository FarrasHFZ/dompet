// Merges exported IDX stock-summary days into data/idx-foreign-flow.json (the input of tools/experiment-flow.mjs).
// The pull itself runs in a normal browser tab on idx.co.id (Cloudflare refuses plain Node requests, and this tool does
// not try to get around that): it stores each day in the page's IndexedDB and is exported in chunks as JSON text
// {YYYYMMDD: {TICKER: [close, volume, value, freq, foreignBuy, foreignSell]}}. Accepts that JSON directly, or a saved
// tool-result file wrapping it ([{type, text}]). Keeps the 100 universe stocks only.
// Usage: node tools/idx-flow-import.mjs <file> [<file> ...]
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, ROOT } from './lib.mjs';

const keep = new Set(universe(loadEngine()).map(u => u.ticker));
const out = path.join(ROOT, 'data', 'idx-foreign-flow.json');
const cur = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
for (const f of process.argv.slice(2)) {
  let j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (Array.isArray(j)) { // tool-result wrapper: the value comes first, then notes about the page; keep only the value
    const t = j[0].text.trim(), m = t.match(/^"(?:[^"\\]|\\.)*"|^\{[\s\S]*?\}\}(?=\s*(\n|$))/);
    j = JSON.parse(m ? m[0] : t);
  }
  if (typeof j === 'string') j = JSON.parse(j);
  let n = 0;
  for (const [d, day] of Object.entries(j)) {
    if (!/^\d{8}$/.test(d) || !day || !Object.keys(day).length) continue; // holidays come back empty
    cur[d] = Object.fromEntries(Object.entries(day).filter(([tk]) => keep.has(tk)));
    n++;
  }
  console.log(path.basename(f), '+', n, 'days');
}
fs.writeFileSync(out, JSON.stringify(cur));
const days = Object.keys(cur).sort();
console.log('idx-foreign-flow.json:', days.length, 'trading days', days[0], '..', days.at(-1));

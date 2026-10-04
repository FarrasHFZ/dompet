// Checks universe candidates against Yahoo: data exists, enough history, liquidity. Prints survivors by value traded.
import fs from 'node:fs';
import path from 'node:path';
import { loadPrices, ROOT } from './lib.mjs';
const cands = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'universe-candidates.json'), 'utf8')).filter(c => c[1] && !c[1].includes('?'));
const px = await loadPrices(cands.map(c => c[0] + '.JK'), '5y');
const rows = [];
for (const c of cands) {
  const b = px[c[0] + '.JK'];
  if (!b || b.c.length < 300) { console.log('drop (no/short data):', c[0], b ? b.c.length : 0); continue; }
  const n = b.c.length; let v = 0; for (let i = n - 60; i < n; i++) v += b.c[i] * b.v[i];
  rows.push({ c, bars: n, valueB: v / 60 / 1e9, last: b.c[n - 1] });
}
rows.sort((a, b) => b.valueB - a.valueB);
rows.forEach(r => console.log(r.c[0].padEnd(5), String(r.bars).padStart(5), r.valueB.toFixed(1).padStart(8), 'B/day', r.last));
fs.writeFileSync(path.join(ROOT, 'data', 'cache', 'validated.json'), JSON.stringify(rows.map(r => ({ c: r.c, valueB: r.valueB, bars: r.bars }))));

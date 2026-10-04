// Dump a reproducible random sample of tagged headlines so tagging/category/sentiment can be hand-labelled.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, CACHE } from './lib.mjs';
import { fetchNewsRows } from './news.mjs';
const api = loadEngine(), uni = universe(api);
const rows = await fetchNewsRows(api, uni);
fs.writeFileSync(path.join(CACHE, 'news_rows.json'), JSON.stringify(rows));
const kept = rows.length, withT = rows.filter(r => r[5]).length, withS = rows.filter(r => r[6] && !r[5]).length;
console.log({ kept, withTicker: withT, sectorOnly: withS });
const cats = {}; rows.forEach(r => { cats[r[4]] = (cats[r[4]] || 0) + 1; }); console.log(cats);
let seed = +(process.env.SEED || 42); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (arr, n) => arr.map(x => [rnd(), x]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
const sample = [...pick(rows.filter(r => r[5]), 45), ...pick(rows.filter(r => !r[5]), 25)];
sample.forEach((r, i) => console.log(`${i}|${r[4]}|${r[5] || '-'}|${r[6] || '-'}|s=${r[7]}|${r[2]}`));

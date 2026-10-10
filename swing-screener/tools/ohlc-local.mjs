// Local preview helper: build the chart files (candles + call markers) from the cached daily prices and the last
// published snapshot, without running the whole snapshot build.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, expansionTickers, ROOT } from './lib.mjs';
import { writeOhlc } from './ohlc.mjs';
import { stockSignals } from './signals.mjs';

const api = loadEngine(), uni = universe(api), NEWSET = expansionTickers();
const cfg = { targetPct: 8, horizon: 15, stopMult: 2.5, minValueB: 5 };
const px = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '2y', true);
const signals = {};
for (const u of uni) {
  const b = px[u.ticker + '.JK'];
  if (b) signals[u.ticker] = stockSignals(api, b, b.c.length, px['^JKSE'], { cfg, untested: NEWSET.has(u.ticker) }); // cached bars may lag the snapshot, so no live override here
}
const liveFrom = fs.readdirSync(path.join(ROOT, 'data', 'history')).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort()[0];
const all = Object.values(signals).flat();
console.log(`calls ${all.filter(e => e.k === 'call').length}`, ['tp', 'sl', 'time', 'open', 'pending'].map(r => `${r} ${all.filter(e => e.res === r).length}`).join(', '), `radar ${all.filter(e => e.k === 'radar').length}`);
await writeOhlc(px, uni.map(u => u.ticker), { useCache: true, signals, liveFrom: liveFrom && liveFrom.slice(0, 10) });

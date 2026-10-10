// Per-stock candle files for the app's chart (web/data/ohlc/<TICKER>.json): ~2 years of daily bars (weekly is built in
// the browser) and ~3 months of hourly bars (4-hour is built in the browser). Chart only: nothing here feeds a score.
// Times are WIB wall-clock seconds (UTC + 7h), so the chart axis reads like an Indonesian broker app.
import fs from 'node:fs';
import path from 'node:path';
import { fetchYahoo, sleep, ROOT } from './lib.mjs';

const OUT = path.join(ROOT, 'web', 'data', 'ohlc');
const CACHE = path.join(ROOT, 'data', 'cache');
const WIB = 7 * 3600;
const r2 = x => Math.round(x * 100) / 100;
const rows = (b, time) => b.d.map((d, i) => [time(d), r2(b.o[i]), r2(b.h[i]), r2(b.l[i]), r2(b.c[i]), b.v[i]]);

async function hourly(sym, useCache) {
  const f = path.join(CACHE, `px60_${sym.replace(/[^A-Z0-9]/gi, '_')}.json`);
  if (useCache && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const b = await fetchYahoo(sym, '3mo', '60m');
  const out = rows(b, d => Math.floor(d.getTime() / 1000) + WIB).filter(r => r[5] > 0 || r[1] !== r[4]); // drop empty pre-open prints
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(out));
  return out;
}

// daily: { 'BBCA.JK': bars } as loaded by loadPrices, BEFORE today's partial bar is split off (the chart shows it).
// signals: { TICKER: [...] } from tools/signals.mjs (chart markers); liveFrom: first day of the live forward-test ledger.
export async function writeOhlc(daily, tickers, { useCache = false, concurrency = 4, signals = {}, liveFrom = null } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const queue = tickers.slice();
  let ok = 0, noHourly = 0;
  const worker = async () => {
    for (let t; (t = queue.shift());) {
      const b = daily[t + '.JK'];
      if (!b || !b.c.length) continue;
      let h = [];
      try { h = await hourly(t + '.JK', useCache); } catch { noHourly++; }
      fs.writeFileSync(path.join(OUT, t + '.json'), JSON.stringify({ t, at: new Date().toISOString(), d: rows(b, d => new Date(d.getTime() + WIB * 1000).toISOString().slice(0, 10)), h, ev: signals[t] || [], liveFrom }));
      ok++;
      await sleep(150);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`ohlc: ${ok} chart files (${noHourly} without hourly bars)`);
}

// Loads the Apps Script engine (.gs files) into Node so the exact same code is used for
// backtests and for the GitHub snapshot. The .gs files stay the single source of truth.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE = path.join(ROOT, 'data', 'cache');

export function loadEngine() {
  const ctx = vm.createContext({ console, Math, Date, JSON });
  for (const f of ['Indicators.gs', 'News.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), ctx, { filename: f });
  }
  vm.runInContext(`globalThis.__api = { analyse_, score_, scoreParts_, narrative_, tickSize_, roundToTick_, sma_, rsi_, atrSeries_,
    classify_, scoreNews_, CATEGORY_RULES, POSITIVE, NEGATIVE, DEFAULT_THEMES, UNIVERSE_SEED, NEWS_HEADERS, escapeRe_, normTitle_, buildNewsRow_, buildAliasRes_, tickerTokens_, buildPick_, marketRead_, ACT_SCORE };`, ctx);
  return ctx.__api;
}

export function universe(api) {
  return api.UNIVERSE_SEED.map(r => ({
    ticker: r[0], name: r[1], sector: r[2], aliases: String(r[3]).split(',').map(s => s.trim()).filter(Boolean),
  }));
}

// The 200 stocks added on 2026-10-10 (rows after the "expansion" marker in UNIVERSE_SEED). tools/experiment-expand.mjs
// found the bounce edge does NOT hold on them, so they are shown but never traded, and kept out of the live record.
export function expansionTickers() {
  const src = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8'), at = src.indexOf('// ---- expansion 2026-10-10');
  if (at < 0) return new Set();
  return new Set([...src.slice(at, src.indexOf('\n];', at)).matchAll(/\['([A-Z0-9]{4,})',/g)].map(m => m[1]));
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Yahoo bars (daily by default, '60m' for the hourly chart) -> column-oriented bars (same shape as the Sheet path).
export async function fetchYahoo(symbol, range = '5y', interval = '1d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`${symbol}: HTTP ${r.status}`);
    const j = await r.json();
    const res = j.chart && j.chart.result && j.chart.result[0];
    if (!res || !res.timestamp) throw new Error(`${symbol}: no data`);
    const q = res.indicators.quote[0];
    const bars = { d: [], o: [], h: [], l: [], c: [], v: [] };
    res.timestamp.forEach((t, i) => {
      if ([q.open[i], q.high[i], q.low[i], q.close[i]].some(x => x === null || x === undefined) || q.close[i] <= 0) return;
      bars.d.push(new Date(t * 1000)); bars.o.push(q.open[i]); bars.h.push(q.high[i]);
      bars.l.push(q.low[i]); bars.c.push(q.close[i]); bars.v.push(q.volume[i] || 0);
    });
    return bars;
  }
  throw new Error(`${symbol}: rate limited`);
}

export async function loadPrices(symbols, range = '5y', useCache = true) {
  fs.mkdirSync(CACHE, { recursive: true });
  const out = {};
  for (const s of symbols) {
    const f = path.join(CACHE, `px_${s.replace(/[^A-Z0-9]/gi, '_')}_${range}.json`);
    if (useCache && fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      j.d = j.d.map(x => new Date(x));
      out[s] = j;
      continue;
    }
    try {
      out[s] = await fetchYahoo(s, range);
      fs.writeFileSync(f, JSON.stringify(out[s]));
      await sleep(250);
    } catch (e) { console.error('skip', e.message); out[s] = null; }
  }
  return out;
}

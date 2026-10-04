// Smoke test of the Apps Script entry points (setup, runScreener, doGet) against an in-memory fake of
// SpreadsheetApp. Prices come from Yahoo cache instead of GOOGLEFINANCE (which only exists inside Sheets).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, CACHE, loadPrices } from './lib.mjs';

const sheets = {};
const mkSheet = name => {
  const cells = {}; let lastRow = 0;
  const sh = {
    name, cells,
    getRange(r, c, nr = 1, nc = 1) {
      const rng = new Proxy({}, {
        get(_, k) {
          if (k === 'setValues') return v => { v.forEach((row, i) => row.forEach((x, j) => { cells[(r + i) + ',' + (c + j)] = x; })); lastRow = Math.max(lastRow, r + v.length - 1); return rng; };
          if (k === 'getValues') return () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cells[(r + i) + ',' + (c + j)] ?? ''));
          if (k === 'setValue') return v => { cells[r + ',' + c] = v; lastRow = Math.max(lastRow, r); return rng; };
          if (k === 'getDisplayValue') return () => String(cells[r + ',' + c] ?? '');
          if (k === 'clearContent' || k === 'clear') return () => { Object.keys(cells).forEach(key => { const [rr, cc] = key.split(',').map(Number); if (rr >= r && rr < r + nr && cc >= c && cc < c + nc) delete cells[key]; }); return rng; };
          return () => rng;
        },
      });
      return rng;
    },
    getLastRow: () => lastRow, getMaxColumns: () => 100, insertColumnsAfter() {}, hideSheet() {}, clear() { Object.keys(cells).forEach(k => delete cells[k]); lastRow = 0; },
    setFrozenRows() {}, setFrozenColumns() {}, setConditionalFormatRules() {}, getDataRange() { return sh.getRange(1, 1, Math.max(lastRow, 1), 30); },
  };
  return sh;
};
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), toast: m => console.log('toast:', m) };
const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
const ctx = vm.createContext({
  console, Math, Date, JSON, Utilities: { formatDate: (d, tz, f) => d.toISOString(), sleep() {} },
  SpreadsheetApp: { getActive: () => ss, getUi: () => chain, newConditionalFormatRule: () => chain, InterpolationType: { NUMBER: 1 } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'API_TOKEN' ? 'secret' : null) }) },
  ContentService: { createTextOutput: t => ({ text: t, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
  ScriptApp: chain, UrlFetchApp: {}, XmlService: {},
});
for (const f of ['Indicators.gs', 'News.gs', 'Code.gs']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), ctx, { filename: f });

ctx.setup();
// Seed the News sheet from the live pull, and swap GOOGLEFINANCE for cached Yahoo bars.
const rows = JSON.parse(fs.readFileSync(path.join(CACHE, 'news_rows.json'), 'utf8'));
sheets.News.getRange(2, 1, rows.length, 9).setValues(rows);
const uni = vm.runInContext('UNIVERSE_SEED', ctx).map(r => 'IDX:' + r[0]);
const px = await loadPrices(uni.map(s => s.replace('IDX:', '') + '.JK').concat(['^JKSE']));
ctx.__px = Object.fromEntries(uni.map(s => [s, px[s.replace('IDX:', '') + '.JK']]).concat([['IDX:COMPOSITE', px['^JKSE']]]));
vm.runInContext('fetchBars_ = (symbols) => Object.fromEntries(symbols.map(s => [s, __px[s]]));', ctx);
ctx.runScreener();

const scr = sheets.Screener;
console.log('Screener row1:', String(scr.cells['1,1']).slice(0, 140));
for (let r = 3; r <= 7; r++) console.log([2, 5, 6, 7, 16, 17].map(c => scr.cells[r + ',' + c]).join(' | '));
console.log('headline cell:', String(scr.cells['3,21']).slice(0, 120));
const res = ctx.doGet({ parameter: { token: 'secret' } });
const j = JSON.parse(res.text);
console.log('doGet ok:', j.picks.length, 'picks,', j.news.length, 'news,', 'market', j.market.regime, '| bad token ->', ctx.doGet({ parameter: { token: 'x' } }).text);

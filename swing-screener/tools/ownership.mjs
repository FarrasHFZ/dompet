// Shareholders >= 1% (KSEI data that IDX publishes monthly since 2026) -> per-ticker summary for the universe.
// Source of the machine-readable CSV: community conversion of IDX's PDF (github.com/aryakdaniswara/idx-stock-ownership).
// IDX's own file is a PDF; going straight to it means parsing the PDF (pdfplumber) each month.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, ROOT, CACHE } from './lib.mjs';

const REPO = 'aryakdaniswara/idx-stock-ownership';
const STATE = /REPUBLIK INDONESIA|DANANTARA|INVESTMENT AUTHORITY|MIND ID|INALUM|PERTAMINA|PERUSAHAAN PENGELOLA ASET|BANK MANDIRI|BPJS|JAMINAN HARI TUA|TASPEN|ASABRI|PERSERO/i;

export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

export async function fetchLatestCsv() {
  const list = await (await fetch(`https://api.github.com/repos/${REPO}/contents/data`, { headers: { 'User-Agent': 'swing-screener' } })).json();
  const files = list.filter(f => /\.csv$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (!files.length) throw new Error('no csv found');
  const f = files[files.length - 1];
  const text = await (await fetch(f.download_url)).text();
  return { name: f.name, text };
}

export function summarize(rows, tickers) {
  const by = {};
  rows.forEach(r => { (by[r.share_code] = by[r.share_code] || []).push(r); });
  const out = {};
  tickers.forEach(t => {
    const h = (by[t] || []).map(r => ({ name: r.investor_name, type: r.investor_type, foreign: r.local_foreign === 'A', pct: +r.percentage, domicile: r.domicile }))
      .sort((a, b) => b.pct - a.pct);
    if (!h.length) { out[t] = null; return; }
    const sum = h.reduce((s, x) => s + x.pct, 0);
    out[t] = {
      holders: h.slice(0, 6), count: h.length, listedPct: +sum.toFixed(2),
      foreignPct: +h.filter(x => x.foreign).reduce((s, x) => s + x.pct, 0).toFixed(2),
      topPct: h[0].pct, statePct: +h.filter(x => STATE.test(x.name)).reduce((s, x) => s + x.pct, 0).toFixed(2),
      stateLinked: false,
    };
    out[t].stateLinked = out[t].statePct >= 10;
  });
  return out;
}

export async function buildOwnership(tickers) {
  let asOf = null, source = 'cache', rows;
  try {
    const { name, text } = await fetchLatestCsv();
    rows = parseCsv(text);
    asOf = (name.match(/(\d{8})/) || [])[1] || null; source = `${REPO}/${name}`;
  } catch (e) {
    const f = path.join(ROOT, 'data', 'ownership.json');
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    throw e;
  }
  return { asOf, source, note: 'Holders of 1% or more only, from KSEI via IDX (monthly). Custodian/omnibus accounts hide the real owner.', byTicker: summarize(rows, tickers) };
}

if (process.argv[1] && process.argv[1].endsWith('ownership.mjs')) {
  const api = loadEngine(), uni = universe(api);
  const o = await buildOwnership(uni.map(u => u.ticker));
  fs.writeFileSync(path.join(ROOT, 'data', 'ownership.json'), JSON.stringify(o, null, 1));
  console.log(o.asOf, o.source);
  Object.entries(o.byTicker).slice(0, 8).forEach(([t, v]) => v && console.log(t, 'top', v.topPct + '%', v.holders[0].name, '| listed', v.listedPct + '%', '| foreign', v.foreignPct + '%', '| state', v.stateLinked));
}

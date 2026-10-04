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

const TYPE_NAMES = { CP: 'Corporate', ID: 'Individual', MF: 'Mutual fund', PF: 'Pension fund', IS: 'Insurance', IB: 'Financial inst.', SC: 'Securities co.', FD: 'Foundation', OT: 'Other' };

export function summarize(rows, tickers) {
  const by = {};
  rows.forEach(r => { (by[r.share_code] = by[r.share_code] || []).push(r); });
  const out = {};
  tickers.forEach(t => {
    const h = (by[t] || []).map(r => ({ name: r.investor_name, type: r.investor_type, foreign: r.local_foreign === 'A', pct: +r.percentage, domicile: r.domicile }))
      .sort((a, b) => b.pct - a.pct);
    if (!h.length) { out[t] = null; return; }
    const sum = h.reduce((s, x) => s + x.pct, 0);
    const typeMix = {};
    h.forEach(x => { const k = TYPE_NAMES[x.type] || 'Other'; typeMix[k] = +((typeMix[k] || 0) + x.pct).toFixed(2); });
    const o = {
      holders: h.slice(0, 6), count: h.length, listedPct: +sum.toFixed(2),
      foreignPct: +h.filter(x => x.foreign).reduce((s, x) => s + x.pct, 0).toFixed(2),
      topPct: h[0].pct, top3Pct: +h.slice(0, 3).reduce((s, x) => s + x.pct, 0).toFixed(2),
      statePct: +h.filter(x => STATE.test(x.name)).reduce((s, x) => s + x.pct, 0).toFixed(2), typeMix,
    };
    o.stateLinked = o.statePct >= 10;
    // Control read. Low coverage means a big holder (often the state) is missing from the >=1% list, so do not call it "widely held".
    o.coverage = o.listedPct >= 40 ? 'ok' : 'low';
    o.control = o.topPct >= 50 ? 'Controlled' : o.topPct >= 25 ? 'Anchor holder' : o.coverage === 'low' ? 'Unclear (data gap)' : 'Widely held';
    const top = h[0];
    const bits = [`${o.control}: ${top.name.replace(/\s+/g, ' ').trim()} ${top.pct}%`];
    if (o.foreignPct >= 20) bits.push(`foreign ${o.foreignPct}%`);
    if (o.stateLinked) bits.push(`state-linked ${o.statePct}%`);
    if (o.coverage === 'ok') bits.push(`${o.count} holders ≥1% own ${o.listedPct}%, up to ${(100 - o.listedPct).toFixed(0)}% sits with smaller holders or unlisted blocks`);
    else bits.push(`≥1% list covers only ${o.listedPct}% of shares: the main holder is probably missing`);
    if (o.top3Pct >= 85) bits.push('very concentrated: thin real float, moves can be sharp both ways');
    o.note = bits.join('; ') + '.';
    out[t] = o;
  });
  return out;
}

const HISTDIR = path.join(ROOT, 'data', 'ownership-history');

// Month-over-month: new holders, exits, and stake changes of 0.5 percentage points or more.
export function diffOwnership(prev, cur, tickers) {
  const changes = {};
  tickers.forEach(t => {
    const p = new Map((prev[t] || []).map(([n, v]) => [n, v])), c = new Map((cur[t] || []).map(([n, v]) => [n, v]));
    const ch = [];
    c.forEach((v, n) => { if (!p.has(n)) ch.push({ name: n, kind: 'new', to: v }); else if (Math.abs(v - p.get(n)) >= 0.5) ch.push({ name: n, kind: v > p.get(n) ? 'up' : 'down', from: p.get(n), to: v }); });
    p.forEach((v, n) => { if (!c.has(n)) ch.push({ name: n, kind: 'exit', from: v }); });
    changes[t] = ch;
  });
  return changes;
}

function slim(rows, tickers) {
  const by = {};
  rows.filter(r => tickers.includes(r.share_code)).forEach(r => { (by[r.share_code] = by[r.share_code] || []).push([r.investor_name, +r.percentage]); });
  return by;
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
  const byTicker = summarize(rows, tickers);
  // Keep one slim file per month so changes can be tracked as new months appear.
  fs.mkdirSync(HISTDIR, { recursive: true });
  const cur = slim(rows, tickers);
  const mine = path.join(HISTDIR, `${asOf}.json`);
  if (!fs.existsSync(mine)) fs.writeFileSync(mine, JSON.stringify(cur));
  const prior = fs.readdirSync(HISTDIR).filter(f => /^\d{8}\.json$/.test(f) && f < `${asOf}.json`).sort().pop();
  let changes = null, prevAsOf = null;
  if (prior) {
    prevAsOf = prior.slice(0, 8);
    changes = diffOwnership(JSON.parse(fs.readFileSync(path.join(HISTDIR, prior), 'utf8')), cur, tickers);
    tickers.forEach(t => { if (byTicker[t]) byTicker[t].changes = changes[t]; });
  }
  return {
    asOf, prevAsOf, source, changesAvailable: !!prior,
    note: 'Holders of 1% or more only, from KSEI via IDX (monthly). Custodian/omnibus accounts hide the real owner, and some state stakes are missing.',
    byTicker,
  };
}

if (process.argv[1] && process.argv[1].endsWith('ownership.mjs')) {
  const api = loadEngine(), uni = universe(api);
  const o = await buildOwnership(uni.map(u => u.ticker));
  fs.writeFileSync(path.join(ROOT, 'data', 'ownership.json'), JSON.stringify(o, null, 1));
  console.log(o.asOf, o.source);
  Object.entries(o.byTicker).slice(0, 8).forEach(([t, v]) => v && console.log(t, 'top', v.topPct + '%', v.holders[0].name, '| listed', v.listedPct + '%', '| foreign', v.foreignPct + '%', '| state', v.stateLinked));
}

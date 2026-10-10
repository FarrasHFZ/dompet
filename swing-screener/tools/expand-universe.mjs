// Grows the universe from the original 100 to 300 stocks (2026-10-10) and writes the new rows into
// apps-script/Code.gs (UNIVERSE_SEED stays the single source of truth for the Sheet, the build and every study).
//
// Selection rules, fixed before looking at any trading result of the new stocks:
//   1. keep all 100 original stocks (their tests, ledgers and design/unseen split stay valid);
//   2. candidates = every IDX code in the latest KSEI holder file with >= 120 Yahoo sessions;
//   3. drop: more than 5 zero-volume sessions in the last 120 (suspension / special-board signs), last price < Rp 50
//      (one tick is 2%+ of the price), and codes already in the universe;
//   4. rank by MEDIAN daily traded value over the last 120 sessions (a median ignores one-off spikes) and take the top 200.
// Sector: from Yahoo's industry, mapped to the screener's 17 sector names (SECTOR below). Name: Yahoo's long name without
// "PT" / "Tbk". Aliases are left empty for the new stocks (the name and ticker already match headlines).
// Usage: node tools/expand-universe.mjs [--write]      (data/cache/rank-all.json from the ranking step must exist)
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, ROOT, CACHE, sleep } from './lib.mjs';

const ADD = 200, MAX_ZERO = 5, MIN_PRICE = 50;
const SECTOR = [
  [/^Banks|Credit Services|Insurance|Capital Markets|Asset Management|Financial|Mortgage|Shell Companies/i, 'Banking'],
  [/Oil|Gas|Coal|Utilities|Solar|Uranium|Renewable/i, 'Energy'],
  [/Gold|Silver|Precious|Copper|Aluminum|Steel|Industrial Metals|Metal Fabrication/i, 'Metals'],
  [/Telecom|Communication Equipment/i, 'Telco'],
  [/^Auto/i, 'Automotive'],
  [/Drug|Medical|Health|Diagnostics|Biotech|Pharma/i, 'Healthcare'],
  [/Software|Information Technology|Internet Content|Electronic|Computer|Semiconductor|Scientific/i, 'Tech'],
  [/Engineering|Construction|Building|Infrastructure|Cement/i, 'Construction'],
  [/Real Estate|REIT/i, 'Property'],
  [/Chemical|Agricultural Inputs|Paper|Packaging|Plastic|Textile/i, 'Chemicals'],
  [/Department|Specialty Retail|Grocery|Discount|Apparel Retail|Home Improvement|Internet Retail|Luxury|Auto & Truck Dealerships/i, 'Retail'],
  [/Broadcasting|Entertainment|Advertising|Publishing|Gaming/i, 'Media'],
  [/Packaged Foods|Beverages|Tobacco|Household|Personal|Confection|Food Distribution|Restaurants|Footwear|Apparel Manufacturing|Leisure|Furnishings/i, 'Consumer'],
  [/Farm Products/i, 'Plantation'],
];
const POULTRY = /feed|poultry|ayam|malindo|unggas/i;
const mapSector = (industry, name) => {
  if (/Farm Products/i.test(industry || '') && POULTRY.test(name || '')) return 'Poultry';
  const m = SECTOR.find(([re]) => re.test(industry || ''));
  return m ? m[1] : 'Industrial';
};
// Hand fixes where Yahoo's industry contradicts how the screener groups stocks (palm oil sits under Packaged Foods there;
// feed mills are Poultry here), and names that would mis-tag news (PTPP's short name "PP" also means Prajogo Pangestu).
const SECTOR_FIX = { BWPT: 'Plantation', SSMS: 'Plantation', SIMP: 'Plantation', TBLA: 'Plantation', GZCO: 'Plantation', MAIN: 'Poultry', AYAM: 'Poultry', TSPC: 'Healthcare', BNBR: 'Industrial', COIN: 'Banking' };
const NAME_FIX = { PTPP: 'Pembangunan Perumahan', FILM: 'MD Entertainment', WIRG: 'WIR Asia', GMFI: 'Garuda Maintenance Facility', BJBR: 'Bank BJB', BJTM: 'Bank Jatim', KDTN: 'Puri Sentul Permai', DATA: 'Remala Abadi' };
const clean = s => String(s || '').replace(/^PT\.?\s*/i, '').replace(/\s*,?\s*Tbk\.?$/i, '').replace(/\s*\(Persero\)\s*/i, ' ').replace(/\s+/g, ' ').trim();

const api = loadEngine(), cur = new Set(universe(api).map(u => u.ticker));
const ranked = JSON.parse(fs.readFileSync(path.join(CACHE, 'rank-all.json'), 'utf8'));
const pick = ranked.filter(r => !cur.has(r.c) && r.zero <= MAX_ZERO && r.last >= MIN_PRICE).sort((a, b) => b.med - a.med).slice(0, ADD);
console.log(`selected ${pick.length}; median value range ${pick[0].med.toFixed(1)} .. ${pick.at(-1).med.toFixed(2)} B/day`);

const rows = [];
for (const r of pick) {
  let q = null;
  for (let a = 0; a < 3 && !q; a++) {
    try {
      const j = await (await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${r.c}.JK&quotesCount=1&newsCount=0`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
      q = (j.quotes || []).find(x => x.symbol === r.c + '.JK') || null;
    } catch { await sleep(1500); }
  }
  const name = clean((q && (q.longname || q.shortname)) || r.name.replace(/\s+Tbk$/i, '').replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase()));
  rows.push([r.c, (NAME_FIX[r.c] || name).replace(/'/g, '’'), SECTOR_FIX[r.c] || mapSector(q && q.industry, name), '', 'Y', q ? q.industry || '' : '']);
  await sleep(300);
}
const cnt = {}; rows.forEach(r => { cnt[r[2]] = (cnt[r[2]] || 0) + 1; });
console.log('sectors of the new 200:', JSON.stringify(cnt));
fs.writeFileSync(path.join(CACHE, 'universe-new200.json'), JSON.stringify(rows, null, 1));

if (process.argv.includes('--write')) {
  const f = path.join(ROOT, 'apps-script', 'Code.gs'), src = fs.readFileSync(f, 'utf8');
  if (src.includes('// ---- expansion 2026-10-10')) throw new Error('already expanded');
  const lines = rows.map(r => `  ['${r[0]}', '${r[1]}', '${r[2]}', '', 'Y'], // ${r[5] || 'industry n/a'}`).join('\n');
  const at = src.indexOf('\n];', src.indexOf('const UNIVERSE_SEED = ['));
  const out = src.slice(0, at) + `\n  // ---- expansion 2026-10-10: the next 200 by median traded value (tools/expand-universe.mjs) ----\n${lines}` + src.slice(at);
  fs.writeFileSync(f, out);
  console.log('wrote', rows.length, 'rows into apps-script/Code.gs');
}

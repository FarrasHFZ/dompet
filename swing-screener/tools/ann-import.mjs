// IDX company announcements -> data/idx-announcements.json (full history, local) and data/idx-filings-recent.json
// (last 45 days, meaningful types only, committed; the site shows them on each stock).
// Pulled in a normal browser tab on idx.co.id (tools/ann-pull.js; plain scripts get a Cloudflare 403). Rows are
// [timestamp, title, subject, attachmentName, attachmentUrl?]. Accepts the exported JSON or a saved tool-result wrapper.
// Usage: node tools/ann-import.mjs [<file> ...]      (no file: just rebuild the recent file)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

// Plain-language filing types, in order of importance for a bounce trade. Routine filings (monthly shareholder
// registry, bond coupons, public-expose logistics, ad proofs) are left out.
export const FILING_TYPES = [
  ['dilution', 'Capital raise (new shares)', t => /penambahan modal|hmetd|pmthmetd|private placement|rights? issue|tanpa (memberikan )?hak memesan/i.test(t) && !/penggunaan dana|hasil pelaksanaan|realisasi|bukti iklan/i.test(t)],
  ['mgmt', 'Board / management change', t => /perubahan (pengurus|anggota direksi|anggota dewan komisaris|direksi|komisaris)|pengunduran diri/i.test(t)],
  ['media', 'Reply to a media report', t => /pemberitaan media/i.test(t)],
  ['idxQuery', 'IDX asked about unusual trading', t => /volatilitas transaksi|permintaan penjelasan bursa|unusual market activity/i.test(t)],
  ['buyback', 'Share buyback', t => /pembelian kembali saham|buy ?back/i.test(t) && !/pengalihan|hasil buy ?back|laporan/i.test(t)],
  ['dividend', 'Dividend', t => /dividen/i.test(t) && !/bukti iklan/i.test(t)],
  ['affiliate', 'Related-party transaction', t => /transaksi afiliasi|benturan kepentingan/i.test(t)],
  ['material', 'Material transaction', t => /fakta material|transaksi material|akuisisi|divestasi|penggabungan usaha|merger|pengambilalihan/i.test(t) && !/bukti iklan|bunga|obligasi|sukuk|kupon|imbalan efek|ijarah/i.test(t)],
  ['report', 'Financial report published', t => /laporan keuangan/i.test(t) && !/rencana penyampaian|bukti iklan|pemberitahuan/i.test(t)],
  ['egm', 'Extraordinary shareholder meeting', t => /luar biasa/i.test(t) && /rapat umum|rups/i.test(t) && !/bukti iklan/i.test(t)],
  ['ownership', 'Major holder / insider trade (see filing for buy or sell)', t => /perubahan kepemilikan|kepemilikan saham/i.test(t)],
];
export const filingType = txt => { for (const [k, label, f] of FILING_TYPES) if (f(txt)) return [k, label]; return null; };

const OUT = path.join(ROOT, 'data', 'idx-announcements.json');
const cur = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
for (const f of process.argv.slice(2)) {
  let j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (Array.isArray(j)) { const t = j[0].text.trim(), m = t.match(/^"(?:[^"\\]|\\.)*"/); j = JSON.parse(m ? m[0] : t); }
  if (typeof j === 'string') j = JSON.parse(j);
  let n = 0;
  for (const [tk, rows] of Object.entries(j)) {
    const seen = new Map((cur[tk] || []).map((r, i) => [r[0] + '|' + r[1], i]));
    const list = (cur[tk] || []).slice();
    rows.forEach(r => { const k = r[0] + '|' + r[1]; if (seen.has(k)) { if (r[4] && !list[seen.get(k)][4]) list[seen.get(k)] = r; } else { list.push(r); n++; } });
    list.sort((a, b) => b[0].localeCompare(a[0]));
    cur[tk] = list;
  }
  console.log(path.basename(f), '+', n, 'announcements');
}
if (process.argv.length > 2) fs.writeFileSync(OUT, JSON.stringify(cur));

// recent, meaningful, public
const all = Object.values(cur).flat().map(r => r[0]).sort();
const newest = all.at(-1) || new Date().toISOString(), cutoff = new Date(Date.parse(newest) - 45 * 864e5).toISOString();
const by = {};
for (const [tk, rows] of Object.entries(cur)) {
  const seenType = new Set(), keep = [];
  for (const r of rows) {
    if (r[0] < cutoff) break;
    const ty = filingType(r[1] + ' ' + r[2] + ' ' + (r[3] || ''));
    if (!ty) continue;
    const key = ty[0] + '|' + r[1].slice(0, 40); if (seenType.has(key)) continue; seenType.add(key); // one per repeated title
    keep.push([r[0].slice(0, 10), ty[0], ty[1], r[1], r[4] || null]);
    if (keep.length >= 8) break;
  }
  if (keep.length) by[tk] = keep;
}
fs.writeFileSync(path.join(ROOT, 'data', 'idx-filings-recent.json'), JSON.stringify({ asOf: newest.slice(0, 10), by }));
console.log('idx-announcements.json:', Object.keys(cur).length, 'stocks,', all.length, 'announcements,', all[0], '..', newest);
console.log('idx-filings-recent.json:', Object.keys(by).length, 'stocks with meaningful filings in the last 45 days');

// Turns raw news items (data/news-raw.json) + YouTube activity + Google's daily trending searches into event signals.
// Output: data/news-auto.json (array of signals, same schema as data/signals.json, with auto:true).
//   node tools/news-stories.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nameInfo, relevant } from './news-scan.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f, d) => { const p = path.join(root, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d; };
const kols = rd('kols.json', { kols: [] }).kols;
const raw = rd('data/news-raw.json', {});
const yt = rd('data/youtube-activity.json', {});
const NOW = new Date(process.env.AS_OF || new Date().toISOString());
const day = 864e5;

const KW = {
  legal: ['polisi', 'polda', 'polres', 'dilaporkan', 'melapor', 'laporan', 'tersangka', 'somasi', 'pengadilan', 'sidang', 'gugatan', 'menggugat', 'penipuan', 'penggelapan', 'ditangkap', 'saksi', 'narkoba', 'dipenjara', 'vonis', 'pidana', 'hukum', 'pencemaran nama', 'ditahan', 'diperiksa'],
  conflict: ['ribut', 'cekcok', 'sindir', 'menyindir', 'dihujat', 'hujat', 'kontroversi', 'drama', 'klarifikasi', 'minta maaf', 'boikot', 'polemik', 'menuding', 'tuding', 'bantah', 'selingkuh', 'kecam', 'dikritik', 'dicibir', 'nyinyir', 'geram', 'murka', 'adu mulut', 'balas dendam', 'perseteruan', 'bongkar', 'skandal', 'dibully', 'dirundung'],
  personal: ['menikah', 'nikah', 'cerai', 'hamil', 'melahirkan', 'lahiran', 'putus', 'pacar', 'tunangan', 'dilamar', 'melamar', 'meninggal', 'wafat', 'duka', 'sakit', 'operasi', 'ulang tahun', 'anak pertama', 'keluarga', 'suami', 'istri', 'rumah tangga', 'mudik'],
  commercial: ['endorse', 'brand ambassador', 'duta ', 'launching', 'meluncurkan', 'peluncuran', 'produk', 'bisnis', 'brand', 'kampanye', 'promo', 'diskon', 'toko', 'gerai', 'buka usaha', 'omzet', 'bekerja sama', 'kerja sama', 'investasi'],
  collab: ['kolaborasi', 'collab', 'duet', 'podcast', 'bareng', 'berkolaborasi', 'bertemu'],
  event: ['konser', 'tur ', 'manggung', 'fashion week', 'festival', 'meet and greet', 'fan meeting', 'hadir di', 'bintang tamu', 'jadwal', 'acara'],
  content: ['video', 'konten', 'viral', 'tiktok', 'unggah', 'trending', 'film', 'serial', 'lagu', 'rilis', 'tayang', 'youtube', 'channel', 'live streaming', 'unboxing', 'review']
};
const NEG = ['dihujat', 'kecam', 'dikritik', 'dicibir', 'nyinyir', 'kontroversi', 'skandal', 'tersangka', 'ditangkap', 'penipuan', 'penggelapan', 'selingkuh', 'cerai', 'murka', 'geram', 'drama', 'dilaporkan', 'somasi', 'meninggal', 'wafat', 'duka', 'putus', 'dibully', 'diperiksa'];
const POS = ['juara', 'penghargaan', 'award', 'sukses', 'prestasi', 'bangga', 'rekor', 'terlaris', 'laris', 'raih', 'meraih', 'menang', 'lamar', 'dilamar', 'tunangan', 'melahirkan', 'menikah', 'bahagia', 'cantik', 'pesona'];
const STOP = new Set(['yang', 'dan', 'dengan', 'untuk', 'dari', 'pada', 'dalam', 'akan', 'atau', 'juga', 'karena', 'sebagai', 'tidak', 'saat', 'usai', 'setelah', 'kini', 'soal', 'tentang', 'bikin', 'jadi', 'ini', 'itu', 'ada', 'baru', 'bisa', 'lagi', 'netizen', 'banyak', 'sempat', 'bukan', 'kata', 'ungkap', 'ungkapan']);
const has = (t, list) => list.some(w => t.includes(w));
const toks = (t, skip) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(' ').filter(w => w.length >= 4 && !STOP.has(w) && !skip.has(w)));
const jacc = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };
function classify(text) {
  const t = text.toLowerCase();
  const type = has(t, KW.legal) ? 'legal' : has(t, KW.conflict) ? 'conflict' : has(t, KW.personal) ? 'personal' : has(t, KW.commercial) ? 'commercial' : has(t, KW.collab) ? 'collab' : has(t, KW.event) ? 'event' : 'content';
  const neg = has(t, NEG), pos = has(t, POS);
  return { type, sentiment: neg && pos ? 'mixed' : neg ? 'negative' : pos ? 'positive' : 'unknown' };
}
const normSrc = s => (s || '').toLowerCase().replace(/\.(com|co\.id|id|net|org)\b/g, '').replace(/[^a-z0-9]/g, '');

const out = [];
for (const k of kols) {
  const r = raw[k.name];
  const { toks: ntoks } = nameInfo(k);
  const skip = new Set(ntoks.map(x => x.toLowerCase()));
  const items = (r ? r.items : []).filter(i => NOW - new Date(i.date) <= 90 * day && relevant(k, i.title, i.source)).sort((a, b) => b.date.localeCompare(a.date));
  const clusters = [];
  for (const it of items) {
    const tk = toks(it.title, skip);
    const c = clusters.find(c => jacc(tk, c.tk) >= 0.34 || [...tk].filter(x => c.tk.has(x)).length >= 4);
    if (c) { c.items.push(it); for (const x of tk) c.tk.add(x); } else clusters.push({ tk, items: [it] });
  }
  for (const c of clusters) {
    const srcs = [...new Set(c.items.map(i => normSrc(i.source)).filter(Boolean))];
    const names = [...new Map(c.items.filter(i => i.source).map(i => [normSrc(i.source), i.source])).values()];
    const dates = c.items.map(i => i.date).sort();
    const text = c.items.map(i => i.title).join(' . ');
    const { type, sentiment } = classify(text);
    const co = kols.filter(o => o.name !== k.name && nameInfo(o).strong && c.items.some(i => relevant(o, i.title, i.source))).map(o => o.name).slice(0, 4);
    out.push({ kol: k.name, auto: true, firstSeen: dates[0].slice(0, 10), date: dates.at(-1).slice(0, 10), type, sentiment,
      outlets: Math.max(1, srcs.length), coEntities: co, topic: c.items[0].title, sources: names.slice(0, 5), links: c.items.slice(0, 2).map(i => i.link) });
  }
  const y = yt[k.name];
  if (y && y.ok) for (const o of y.outliers.filter(o => o.ratio >= 4 && o.views >= 30000).slice(0, 2)) out.push({ kol: k.name, auto: true, firstSeen: o.date.slice(0, 10), date: o.date.slice(0, 10), type: 'content', sentiment: 'positive', outlets: 1, coEntities: [],
    topic: 'YouTube video ' + o.ratio + 'x the channel median (' + o.views.toLocaleString('en-US') + ' views): ' + o.title, sources: ['youtube.com'], links: ['https://www.youtube.com/watch?v=' + o.id] });
}

// Google's daily trending searches (Indonesia): does any creator appear?
try {
  const x = await (await fetch('https://trends.google.com/trending/rss?geo=ID', { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
  const items = [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({ q: (m[1].match(/<title>([^<]*)/) || [])[1] || '', traffic: (m[1].match(/<ht:approx_traffic>([^<]*)/) || [])[1] || '', blob: m[1].toLowerCase() }));
  for (const k of kols) {
    const { clean, strong } = nameInfo(k);
    if (!strong) continue;
    const hit = items.find(i => i.q.toLowerCase().includes(clean.toLowerCase()) || i.blob.includes(clean.toLowerCase()));
    if (hit) out.push({ kol: k.name, auto: true, firstSeen: NOW.toISOString().slice(0, 10), date: NOW.toISOString().slice(0, 10), type: 'content', sentiment: 'unknown', outlets: 3, coEntities: [], topic: 'In Google trending searches (Indonesia) today: "' + hit.q + '" (' + hit.traffic + ' searches)', sources: ['trends.google.com'], links: [] });
  }
} catch { /* trends feed optional */ }

fs.writeFileSync(path.join(root, 'data', 'news-auto.json'), JSON.stringify(out));
const by = {}; for (const s of out) by[s.kol] = (by[s.kol] || 0) + 1;
console.log('stories', out.length, '| creators with any story', Object.keys(by).length, 'of', kols.length);

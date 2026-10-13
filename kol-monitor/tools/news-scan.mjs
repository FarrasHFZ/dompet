// Broad news scan for every creator in kols.json using public news feeds (Google News + Bing News RSS, Indonesian locale).
// Resumable: raw results are cached in data/news-raw.json.   node tools/news-scan.mjs [--force] [--only "Name"]
// Then:  node tools/news-stories.mjs   (clusters headlines into stories -> data/news-auto.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const kols = JSON.parse(fs.readFileSync(path.join(root, 'kols.json'), 'utf8')).kols;
const rawPath = path.join(root, 'data', 'news-raw.json');
const raw = fs.existsSync(rawPath) ? JSON.parse(fs.readFileSync(rawPath, 'utf8')) : {};
const force = process.argv.includes('--force');
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const H = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'accept-language': 'id-ID,id;q=0.9,en;q=0.8' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const dec = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
const CONTEXT = '(selebgram OR influencer OR kreator OR youtuber OR tiktoker OR artis OR "content creator")';

export function nameInfo(k) {
  let n = k.name.normalize('NFKC').split('|')[0].replace(/\(.*?\)/g, ' ').replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const orig = n.split(' ').filter(Boolean);
  const toks = orig.filter(w => w.replace(/[^a-z]/gi, '').length >= 2);
  n = toks.join(' ');
  const latin = /^[a-z0-9 '-]+$/i.test(n);
  const strong = latin && ((toks.length >= 2 && n.length >= 7) || (toks.length === 1 && orig.length === 1 && n.length >= 7));
  const lead = toks.length >= 3 ? toks.slice(0, 2).join(' ') : n;
  return { clean: n, toks, strong, lead };
}
const INDO = /(yang|dan|di|ke|dengan|untuk|soal|usai|tak|tidak|dari|pada|jadi|ini|itu|akan|saat|sudah|belum|bikin|ungkap|klarifikasi|netizen|selebgram|artis|viral|curhat|tanggapi|buka suara|ramai|sorotan|potret)/i;
export const indo = (title, source) => INDO.test(title) || /.(id|co.id)$/i.test((source || '').trim()) || /(kompas|detik|tempo|liputan6|suara|okezone|tribun|kapanlagi|grid|fimela|idntimes|popmama|inews|sindonews|viva|merdeka|cnn indonesia|antara|kumparan|tirto|jawapos|republika|wolipop|bintang)/i.test(source || '');
export function relevant(k, title, source) {
  if (!indo(title, source)) return false;
  const t = title.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ');
  const { clean, toks, strong, lead } = nameInfo(k);
  const c = clean.toLowerCase(), l = lead.toLowerCase();
  if (strong && (t.includes(c) || t.includes(l) || (toks.length >= 3 && t.includes(toks[0].toLowerCase()) && t.includes(toks.at(-1).toLowerCase())))) return true;
  for (const h of [k.instagram, k.tiktok, k.youtube]) if (h && h.length >= 6 && !h.includes('/') && t.replace(/ /g, '').includes(h.toLowerCase().replace(/[^a-z0-9]/g, ''))) return true;
  if (!strong && toks[0] && toks[0].length >= 5 && t.includes(toks[0].toLowerCase()) && /selebgram|influencer|kreator|youtuber|tiktoker|artis|konten/.test(t)) return true;
  return false;
}
function queryFor(k) {
  const { lead, strong } = nameInfo(k);
  const parts = [];
  if (strong) parts.push('"' + lead + '"');
  for (const h of [k.instagram, k.tiktok]) if (h && h.length >= 6 && /^[a-z0-9._]+$/i.test(h) && !parts.includes('"' + h + '"')) parts.push('"' + h + '"');
  if (!parts.length) return null;
  const q = parts.length > 1 ? '(' + parts.join(' OR ') + ')' : parts[0];
  return strong ? q : q + ' ' + CONTEXT;
}
function parseItems(xml, kind) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const b = m[1];
    const title = dec((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const link = dec((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
    const pub = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
    let source = dec((b.match(/<source[^>]*>([\s\S]*?)<\/source>/) || b.match(/<News:Source>([\s\S]*?)<\/News:Source>/) || [])[1] || '');
    let t = title;
    if (kind === 'gn') { const i = title.lastIndexOf(' - '); if (i > 0) { source = source || title.slice(i + 3); t = title.slice(0, i); } }
    return { title: t, source, link, date: pub ? new Date(pub).toISOString() : null };
  }).filter(x => x.date);
}
// Returns the feed text, or null if the server rejected us (rate limit, captcha page). Retries with backoff so a rejection is never mistaken for 'no news'.
async function get(u, tries = [0, 4000, 12000, 30000]) {
  for (const backoff of tries) {
    if (backoff) await wait(backoff);
    try { const r = await fetch(u, { headers: H }); const x = await r.text(); if (r.status === 200 && x.includes('<rss')) return x; } catch { /* retry */ }
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let done = 0, withNews = 0;
  for (const k of kols) {
    if (only && k.name !== only) continue;
    if (raw[k.name] && !force) { done++; continue; }
    const q = queryFor(k);
    if (!q) { raw[k.name] = { q: null, items: [], note: 'name too generic and no usable handle' }; continue; }
    const items = [];
    const bing = (extra) => get('https://www.bing.com/news/search?q=' + encodeURIComponent(q) + '&format=rss&setmkt=id-ID' + extra, [0, 6000, 20000]);
    const newest = await bing('&qft=sortbydate%3d%221%22');           // 12 newest stories
    if (!newest) { console.log('FAILED (will retry next run):', k.name); await wait(8000); continue; }
    items.push(...parseItems(newest, 'bing'));
    let keep = items.filter(i => relevant(k, i.title, i.source));
    if (keep.length) {                                              // has coverage: also pull the 30-day relevance view to catch more outlets
      await wait(2200);
      const m30 = await bing('&qft=interval%3d%228%22');
      if (m30) { const more = parseItems(m30, 'bing'); items.push(...more); keep = items.filter(i => relevant(k, i.title, i.source)); }
    }
    const seen = new Set(); keep = keep.filter(i => { const key = i.link || i.title; if (seen.has(key)) return false; seen.add(key); return true; });
    raw[k.name] = { q, fetched: new Date().toISOString(), total: items.length, items: keep };
    if (keep.length) withNews++;
    done++;
    if (done % 20 === 0) { fs.writeFileSync(rawPath, JSON.stringify(raw)); console.log('progress', done, '/', kols.length, 'with news so far', withNews); }
    await wait(2500);
  }
  fs.writeFileSync(rawPath, JSON.stringify(raw));
  console.log('news scan done. creators with relevant news:', Object.values(raw).filter(v => v.items.length).length, 'of', kols.length);
}

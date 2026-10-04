// Node port of News.gs fetching (same queries, same classifier from the .gs file).
import { loadEngine, universe, sleep } from './lib.mjs';

const dec = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([^]*?)</${t}>`)); return m ? dec(m[1]).trim() : ''; };

export function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const raw = tag(m[1], 'title'), cut = raw.lastIndexOf(' - ');
    return { title: cut > 0 ? raw.slice(0, cut) : raw, source: cut > 0 ? raw.slice(cut + 3) : tag(m[1], 'source'), link: tag(m[1], 'link'), published: new Date(tag(m[1], 'pubDate')) };
  });
}

export async function fetchNewsRows(api, uni, { days = 7 } = {}) {
  const queries = [];
  uni.forEach(u => queries.push({ q: `"${u.name}" OR ${u.ticker} saham`, direct: u.ticker }));
  api.DEFAULT_THEMES.forEach(t => queries.push({ q: t[0], themeCat: t[1], sectors: String(t[2] || '').split(',').map(s => s.trim()).filter(Boolean) }));
  const aliasRes = api.buildAliasRes_(uni);
  const seen = new Set(), rows = [];
  for (const qd of queries) {
    const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(qd.q + ` when:${days}d`) + '&hl=id&gl=ID&ceid=ID:id';
    let xml = '';
    try { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (!r.ok) { console.error("HTTP", r.status, qd.q); await sleep(500); continue; } xml = await r.text(); } catch (e) { console.error("fetch fail", qd.q, e.message); continue; }
    parseRss(xml).forEach(item => {
      const key = api.normTitle_(item.title);
      if (seen.has(key) || isNaN(item.published)) return;
      const row = api.buildNewsRow_(item, qd, aliasRes);
      if (!row) return;
      seen.add(key);
      rows.push(row);
    });
    await sleep(200);
  }
  return rows.sort((a, b) => b[0] - a[0]);
}

if (process.argv[1] && process.argv[1].endsWith('news.mjs')) {
  const api = loadEngine(), uni = universe(api);
  const rows = await fetchNewsRows(api, uni);
  console.log(rows.length, 'headlines');
  console.log(rows.slice(0, 5).map(r => r[2] + ' | ' + r[4] + ' | ' + r[5] + ' | ' + r[3].slice(0, 60)).join('\n'));
}

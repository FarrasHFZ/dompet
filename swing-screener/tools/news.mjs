// Node port of News.gs fetching (same queries, same classifier from the .gs file).
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, sleep } from './lib.mjs';

const dec = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([^]*?)</${t}>`)); return m ? dec(m[1]).trim() : ''; };

export function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const raw = tag(m[1], 'title'), cut = raw.lastIndexOf(' - ');
    return { title: cut > 0 ? raw.slice(0, cut) : raw, source: cut > 0 ? raw.slice(cut + 3) : tag(m[1], 'source'), link: tag(m[1], 'link'), published: new Date(tag(m[1], 'pubDate')) };
  });
}

async function fetchRss(url) {
  if (process.env.NEWS_FORCE_FAIL) return null; // test hook: simulate Google blocking the build server
  // Google News answers datacenter IPs with 503/429 now and then: retry with backoff before giving up.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.ok) return await r.text();
      if (r.status !== 503 && r.status !== 429) return null;
    } catch { /* network blip: retry */ }
    await sleep(2000 * (attempt + 1));
  }
  return null;
}

// Returns rows (newest first) with rows.stats = {queries, failed}.
export async function fetchNewsRows(api, uni, { days = 7 } = {}) {
  const queries = [];
  uni.forEach(u => queries.push({ q: `"${u.name}" OR ${u.ticker} saham`, direct: u.ticker }));
  api.DEFAULT_THEMES.forEach(t => queries.push({ q: t[0], themeCat: t[1], sectors: String(t[2] || '').split(',').map(s => s.trim()).filter(Boolean) }));
  const aliasRes = api.buildAliasRes_(uni);
  const seen = new Set(), rows = [];
  let failed = 0;
  for (const qd of queries) {
    const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(qd.q + ` when:${days}d`) + '&hl=id&gl=ID&ceid=ID:id';
    const xml = await fetchRss(url);
    if (xml === null) { failed++; console.error('news query failed:', qd.q); continue; }
    parseRss(xml).forEach(item => {
      const key = api.normTitle_(item.title);
      if (seen.has(key) || isNaN(item.published)) return;
      const row = api.buildNewsRow_(item, qd, aliasRes);
      if (!row) return;
      seen.add(key);
      rows.push(row);
    });
    await sleep(600);
  }
  rows.sort((a, b) => b[0] - a[0]);
  rows.stats = { queries: queries.length, failed };
  return rows;
}

// Fresh pull merged into the last good pull (data/news-cache.json), so a blocked run never blanks the news.
export async function fetchNewsWithCache(api, uni, cacheFile) {
  const fresh = await fetchNewsRows(api, uni);
  let cached = [];
  try { cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')).rows.map(r => [new Date(r[0]), ...r.slice(1)]); } catch { /* no cache yet */ }
  const seen = new Set(fresh.map(r => api.normTitle_(r[2])));
  const cutoff = Date.now() - 14 * 86400000;
  const merged = fresh.concat(cached.filter(r => !seen.has(api.normTitle_(r[2])) && new Date(r[0]) >= cutoff))
    .sort((a, b) => new Date(b[0]) - new Date(a[0]));
  const { queries, failed } = fresh.stats;
  const newest = merged.length ? new Date(merged[0][0]).toISOString() : null;
  const status = failed === 0 ? { state: 'ok', note: `${fresh.length} headlines fetched` }
    : failed === queries ? { state: 'stale', note: `Google News refused every request from the build server; showing the last saved headlines (newest ${newest ? newest.slice(0, 16).replace('T', ' ') + ' UTC' : 'none'}).` }
    : { state: 'partial', note: `${failed} of ${queries} news queries failed this run; the rest were merged with saved headlines.` };
  if (failed < queries) { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify({ savedAt: new Date().toISOString(), rows: merged })); }
  merged.stats = { ...fresh.stats, fetched: fresh.length };
  return { rows: merged, status };
}

if (process.argv[1] && process.argv[1].endsWith('news.mjs')) {
  const api = loadEngine(), uni = universe(api);
  const rows = await fetchNewsRows(api, uni);
  console.log(rows.length, 'headlines');
  console.log(rows.slice(0, 5).map(r => r[2] + ' | ' + r[4] + ' | ' + r[5] + ' | ' + r[3].slice(0, 60)).join('\n'));
}

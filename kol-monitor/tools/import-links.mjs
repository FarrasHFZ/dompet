// Parses the owner's "kol social media link.txt" (one creator per line, links separated by " | ") into data/roster.json.
// node tools/import-links.mjs "<path to txt>"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const RESERVED = new Set(['share', 'people', 'profile.php', 'p', 'reel', 'reels', 'explore', 'accounts', 'me', 'sharer', 'watch', 'channel', 'c', 'user', 'shorts', 'videos']);
const clean = h => (h || '').replace(/^@/, '').replace(/[?.,\/]+$/, '').toLowerCase();

function classify(u) {
  let url;
  try { url = new URL(u); } catch { return null; }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const seg = url.pathname.split('/').filter(Boolean);
  if (host === 'instagram.com') { const h = clean(seg[0]); return h && !RESERVED.has(h) ? { p: 'instagram', h } : null; }
  if (host === 'tiktok.com') { const h = seg[0]?.startsWith('@') ? clean(seg[0]) : null; return h ? { p: 'tiktok', h } : { p: 'tiktok_short', h: u }; }
  if (host === 'vt.tiktok.com') return { p: 'tiktok_short', h: u };
  if (host === 'youtube.com') {
    if (seg[0]?.startsWith('@')) return { p: 'youtube', h: clean(seg[0]) };
    if ((seg[0] === 'c' || seg[0] === 'channel' || seg[0] === 'user') && seg[1]) return { p: 'youtube', h: seg[0] + '/' + seg[1] };
    if (seg[0] && !RESERVED.has(seg[0])) return { p: 'youtube', h: 'c/' + seg[0] };
    return null;
  }
  if (host === 'threads.com' || host === 'threads.net') return { p: 'threads', h: clean(seg[0]) };
  if (host === 'x.com' || host === 'twitter.com') return { p: 'twitter', h: clean(seg[0]) };
  if (host === 'facebook.com') return { p: 'facebook', h: u };
  if (host === 'shopee.co.id') return { p: 'shopee', h: u };
  return null;
}

const roster = lines.map((line, i) => {
  const links = line.split('|').map(s => s.trim().replace(/^@/, '')).filter(Boolean);
  const by = { instagram: [], tiktok: [], youtube: [], threads: [], twitter: [], tiktok_short: [], shopee: [] };
  for (const l of links) { const c = classify(l); if (c && by[c.p] && !by[c.p].includes(c.h)) by[c.p].push(c.h); }
  const name = by.instagram[0] || by.tiktok[0] || by.youtube[0] || by.threads[0] || by.twitter[0] || ('row-' + (i + 1));
  return { row: i + 1, name, instagram: by.instagram, tiktok: by.tiktok, youtube: by.youtube, threads: by.threads, twitter: by.twitter, unresolved: by.tiktok_short, shopee: by.shopee.length > 0, linkCount: links.length };
});
fs.writeFileSync(path.join(root, 'data', 'roster.json'), JSON.stringify(roster, null, 1));
const n = k => roster.filter(r => r[k].length).length;
console.log('rows', roster.length, '| with IG', n('instagram'), 'TikTok', n('tiktok'), 'YouTube', n('youtube'), '| no IG/TikTok/YT:', roster.filter(r => !r.instagram.length && !r.tiktok.length && !r.youtube.length).length, '| short tiktok links:', n('unresolved'));

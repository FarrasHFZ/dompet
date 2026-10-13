// YouTube activity scan: channel feed (last ~15 videos with view counts). Flags outlier videos and upload cadence.
// node tools/scan-youtube.mjs  -> data/youtube-activity.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const kols = JSON.parse(fs.readFileSync(path.join(root, 'kols.json'), 'utf8')).kols;
const outPath = path.join(root, 'data', 'youtube-activity.json');
const out = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};
const H = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'accept-language': 'en-US,en;q=0.9', cookie: 'CONSENT=YES+1; SOCS=CAI' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const get = async u => { try { const r = await fetch(u, { headers: H }); return r.status === 200 ? await r.text() : null; } catch { return null; } };
const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

for (const k of kols) {
  const h = k.youtube; if (!h || out[k.name]) continue;
  const url = h.startsWith('c/') || h.startsWith('channel/') || h.startsWith('user/') ? 'https://www.youtube.com/' + h : 'https://www.youtube.com/@' + h;
  const page = await get(url);
  const id = page && ((page.match(/"channelId":"(UC[\w-]{22})"/) || page.match(/channel_id=(UC[\w-]{22})/) || [])[1]);
  if (!id) { out[k.name] = { ok: false, why: 'channel not found' }; await wait(800); continue; }
  const feed = await get('https://www.youtube.com/feeds/videos.xml?channel_id=' + id);
  if (!feed) { out[k.name] = { ok: false, why: 'feed unavailable' }; await wait(800); continue; }
  const vids = [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => ({
    id: (m[1].match(/<yt:videoId>([^<]+)/) || [])[1], title: dec((m[1].match(/<title>([^<]*)/) || [])[1] || ''),
    date: (m[1].match(/<published>([^<]+)/) || [])[1], views: +((m[1].match(/<media:statistics views="(\d+)"/) || [])[1] || 0) }));
  const now = Date.now(), day = 864e5;
  const recent30 = vids.filter(v => now - new Date(v.date) <= 30 * day);
  const base = vids.slice(3).map(v => v.views), m = med(base.length >= 4 ? base : vids.map(v => v.views));
  const outliers = vids.filter(v => now - new Date(v.date) <= 45 * day && m > 0 && v.views >= 3 * m).map(v => ({ ...v, ratio: +(v.views / m).toFixed(1) }));
  out[k.name] = { ok: true, channelId: id, videos: vids.length, lastUpload: vids[0] && vids[0].date, uploads30d: recent30.length, medianViews: m,
    latest: vids.slice(0, 3), outliers };
  await wait(800);
  if (Object.keys(out).length % 15 === 0) fs.writeFileSync(outPath, JSON.stringify(out));
}
fs.writeFileSync(outPath, JSON.stringify(out));
const ok = Object.values(out).filter(v => v.ok);
console.log('youtube activity: channels', ok.length, '| posted in last 30d', ok.filter(v => v.uploads30d > 0).length, '| with outlier videos', ok.filter(v => v.outliers.length).length);

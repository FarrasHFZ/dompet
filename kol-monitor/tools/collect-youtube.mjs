// YouTube subscriber counts from public channel pages (normal browser request, throttled). Appends to data/inbox.jsonl.
// node tools/collect-youtube.mjs        (all roster rows that have a YouTube handle)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const roster = JSON.parse(fs.readFileSync(path.join(root, 'data', 'roster.json'), 'utf8'));
const inbox = path.join(root, 'data', 'inbox.jsonl');
const H = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'accept-language': 'en-US,en;q=0.9', cookie: 'CONSENT=YES+1; SOCS=CAI' };
const num = s => { if (!s) return null; const u = s.slice(-1).toUpperCase(); const k = { K: 1e3, M: 1e6, B: 1e9 }[u]; return Math.round(parseFloat(s.replace(/,/g, '')) * (k || 1)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const jobs = [...new Set(roster.flatMap(r => r.youtube.slice(0, 1)))];
let ok = 0, fail = [];
for (const h of jobs) {
  const url = h.startsWith('c/') || h.startsWith('channel/') || h.startsWith('user/') ? 'https://www.youtube.com/' + h : 'https://www.youtube.com/@' + h.replace(/^@/, '');
  try {
    const t = await (await fetch(url, { headers: H, redirect: 'follow' })).text();
    const m = t.match(/([\d.,]+[KMB]?) subscribers/i) || t.match(/"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([\d.,]+[KMB]?) subscribers/i);
    const title = (t.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    if (m) { fs.appendFileSync(inbox, JSON.stringify({ at: new Date().toISOString(), platform: 'youtube', handle: h, followers: num(m[1]), title: title.slice(0, 40) }) + '\n'); ok++; }
    else fail.push(h);
  } catch (e) { fail.push(h + '(' + e.message + ')'); }
  await wait(1200);
}
console.log('youtube ok', ok, 'of', jobs.length, '| failed:', fail.join(' '));

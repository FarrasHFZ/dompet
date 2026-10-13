// Merges data/roster.json (owner's links) + data/inbox.jsonl (collected readings) + data/overrides.json into
//   kols.json (creator list with verified flags) and data/history.json (daily snapshot rows).
// node tools/build-kols.mjs [YYYY-MM-DD]     default date = today
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f, d) => { const p = path.join(root, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d; };
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const roster = rd('data/roster.json', []);
const overrides = rd('data/overrides.json', {});          // { "<primary IG handle>": { name, notes, tier } }
const oldKols = rd('kols.json', { kols: [] }).kols;
const oldHist = rd('data/history.json', []);
const inbox = fs.existsSync(path.join(root, 'data', 'inbox.jsonl')) ? fs.readFileSync(path.join(root, 'data', 'inbox.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

const latest = new Map();   // "platform:handle" -> reading from `date`
for (const r of inbox) if (r.at.slice(0, 10) === date && r.handle) latest.set(r.platform + ':' + r.handle.toLowerCase(), r);

const displayName = (ig, tt) => {
  const t = ig && ig.title;
  const m = t && t.match(/^(.*?)\s*\(@/);
  const n = m && m[1].trim();
  return n || (tt && tt.nick) || null;
};

const MIN_FOLLOWERS = 1000;
function verdictFor(platform, r) {
  if (!r) return { ok: false, why: 'not collected' };
  if (r.followers == null) return { ok: false, why: 'profile not found or unavailable' };
  if (r.private || r.privateAcct) return { ok: false, why: 'private account' };
  if (platform !== 'youtube' && r.followers < MIN_FOLLOWERS) return { ok: false, why: 'under ' + MIN_FOLLOWERS + ' followers: check this is the right handle' };
  return { ok: true };
}

const used = new Map();
const kols = [];
const hist = [];
for (const row of roster) {
  const ig = row.instagram[0] || null, tt = row.tiktok[0] || null, yt = row.youtube[0] || null;
  const rIg = ig && latest.get('instagram:' + ig.toLowerCase());
  const rTt = tt && latest.get('tiktok:' + tt.toLowerCase());
  const rYt = yt && latest.get('youtube:' + yt.toLowerCase());
  const o = overrides[ig] || overrides[tt] || {};
  let name = o.name || displayName(rIg, rTt) || ig || tt || yt || 'row ' + row.row;
  if (used.has(name)) name = name + ' (@' + (ig || tt || yt) + ')';
  used.set(name, 1);
  const notes = [o.notes || ''];
  const verified = {}, flags = {};
  for (const [p, h, r] of [['instagram', ig, rIg], ['tiktok', tt, rTt], ['youtube', yt, rYt]]) {
    if (!h) continue;
    const v = verdictFor(p, r);
    verified[p] = v.ok;
    if (!v.ok) flags[p] = v.why;
    if (v.ok) hist.push({ date, kol: name, platform: p, handle: h, followers: r.followers, ...(p === 'tiktok' ? { likes: r.likes, videos: r.videos } : {}) });
  }
  if (rTt && rTt.verifiedBadge) notes.push('TikTok verified badge');
  kols.push({
    name, row: row.row, instagram: ig, tiktok: tt, youtube: yt, verified, flags,
    altHandles: { instagram: row.instagram.slice(1), tiktok: row.tiktok.slice(1), youtube: row.youtube.slice(1) },
    tier: o.tier || 'B', notes: notes.filter(Boolean).join(' · ')
  });
}

// Daily priority tier A: the owner's named creators + top 40 by biggest platform audience
const reach = k => Math.max(0, ...hist.filter(h => h.kol === k.name).map(h => h.followers));
const ranked = [...kols].sort((a, b) => reach(b) - reach(a));
for (const k of ranked.slice(0, 40)) k.tier = 'A';

// keep earlier days of history for creators that still exist under the same name
const names = new Set(kols.map(k => k.name));
const keep = oldHist.filter(r => r.date !== date && names.has(r.kol));
fs.writeFileSync(path.join(root, 'kols.json'), JSON.stringify({ kols }, null, 1));
fs.writeFileSync(path.join(root, 'data', 'history.json'), JSON.stringify(keep.concat(hist), null, 1));
const bad = kols.filter(k => Object.keys(k.flags).length);
console.log('kols', kols.length, '| history rows', hist.length, '(kept older', keep.length + ')', '| creators with a flagged handle:', bad.length, '| tier A:', kols.filter(k => k.tier === 'A').length);

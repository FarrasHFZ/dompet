// Scoring: reads kols.json, data/history.json, data/signals.json, data/scans.json, data/audience/* -> data/scores.json
//  - Every creator gets numeric tracking (follower history on each platform).
//  - Creators with an event scan get an Invest score = cube-root(momentum x quality x durability), capped at 59 when brand safety is flagged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f, d) => { const p = path.join(root, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d; };
const kols = rd('kols.json', { kols: [] }).kols;
const history = rd('data/history.json', []);
const signals = rd('data/signals.json', []);
const scans = rd('data/scans.json', {});
const newsAuto = rd('data/news-auto.json', []);
const newsRaw = rd('data/news-raw.json', {});
const ytAct = rd('data/youtube-activity.json', {});
const sigFor = k => (scans[k.name] ? signals.filter(s => s.kol === k.name) : newsAuto.filter(s => s.kol === k.name));
const inferred = rd('data/audience/inferred.json', {});
const NOW = new Date(process.env.AS_OF || new Date().toISOString().slice(0, 10));
const day = s => new Date(s);
const age = s => Math.max(0, (NOW - day(s)) / 864e5);
const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const QW = { content: 1, collab: 1, commercial: 0.9, event: 0.7, personal: 0.4, conflict: 0.2, legal: 0.1 };

function numerics(k) {
  const out = [];
  for (const p of ['instagram', 'tiktok', 'youtube']) {
    if (!k[p]) continue;
    const s = history.filter(r => r.kol === k.name && r.platform === p).sort((a, b) => a.date.localeCompare(b.date));
    const last = s.at(-1);
    const b7 = last && [...s].reverse().find(r => (day(last.date) - day(r.date)) / 864e5 >= 7);
    const b30 = last && [...s].reverse().find(r => (day(last.date) - day(r.date)) / 864e5 >= 30);
    const rate = b => b && b.followers > 0 ? Math.pow(last.followers / b.followers, 864e5 / (day(last.date) - day(b.date))) - 1 : null;
    out.push({ platform: p, handle: k[p], ok: !!k.verified?.[p], why: k.flags?.[p] || null, days: s.length,
      followers: last?.followers ?? null, likes: last?.likes ?? null, videos: last?.videos ?? null, r7: rate(b7), r30: rate(b30),
      series: s.map(r => [r.date, r.followers]) });
  }
  return out;
}

function numericStatus(nums) {
  const w = nums.filter(n => n.ok && n.r7 != null);
  if (!w.length) return { status: 'Collecting', note: 'needs 7+ days of snapshots' };
  const best = w.reduce((a, b) => (b.r7 > a.r7 ? b : a));
  const accel = best.r30 != null && best.r30 > 0 ? best.r7 / best.r30 : null;
  if (best.r7 >= 0.004 || (accel != null && accel >= 2 && best.r7 >= 0.002)) return { status: 'Rising', note: best.platform + ' growing ' + (best.r7 * 100).toFixed(2) + '%/day' };
  if (w.every(n => n.r7 < 0 && (n.r30 ?? 0) < 0)) return { status: 'Cooling', note: 'losing followers over 7d and 30d' };
  return { status: 'Steady', note: '' };
}

function eventScore(k, nums) {
  const sig = sigFor(k);
  const live = sig.filter(s => s.type !== 'event').map(s => ({ ...s, w: Math.min(1, s.outlets / 6) * Math.exp(-age(s.date) / 14) }));
  const mEvents = clamp(100 * (1 - Math.exp(-1.2 * live.reduce((a, s) => a + s.w, 0))));
  const withNum = nums.filter(n => n.ok && n.r7 != null);
  const mNum = withNum.length ? clamp(100 * Math.max(...withNum.map(n => n.r7)) / 0.006) : null;
  const momentum = mNum == null ? Math.round(mEvents) : Math.round(0.5 * mEvents + 0.5 * mNum);

  const qw = sig.map(s => ({ q: QW[s.type] ?? 0.5, w: Math.max(0.15, Math.min(1, s.outlets / 6)) * Math.exp(-age(s.date) / 30) }));
  const wsum = qw.reduce((a, x) => a + x.w, 0);
  const PRIOR = 0.8;   // shrink toward the middle (50) when evidence is thin
  const quality = Math.round((100 * qw.reduce((a, x) => a + x.q * x.w, 0) + 50 * PRIOR) / (wsum + PRIOR));

  const catalysts = sig.filter(s => s.catalystDate && day(s.catalystDate) >= NOW && (day(s.catalystDate) - NOW) / 864e5 <= 14);
  const contentRecent = sig.filter(s => ['content', 'collab', 'commercial'].includes(s.type) && age(s.date) <= 30).length;
  const durability = clamp(25 + 20 * catalysts.length + 15 * contentRecent + (withNum.some(n => n.r30 > 0) ? 10 : 0));

  const flags = sig.filter(s => ['legal', 'conflict'].includes(s.type) && s.sentiment !== 'positive' && s.outlets >= 3 && age(s.date) <= 90);
  const safety = flags.length ? 'flag' : 'pass';
  let invest = Math.round(Math.cbrt(momentum * quality * durability));
  if (safety === 'flag') invest = Math.min(invest, 59);
  const cooling = withNum.length && withNum.every(n => n.r7 < 0 && (n.r30 ?? 0) < 0);
  const verdict = cooling ? 'Reduce' : invest >= 70 && safety === 'pass' ? 'Invest now' : invest >= 50 ? 'Prepare' : invest >= 35 ? 'Watch' : 'Hold';
  const histDays = Math.max(0, ...nums.map(n => n.days));
  const confidence = histDays >= 14 && sig.length >= 3 ? 'high' : histDays >= 7 ? 'medium' : 'low';
  const trendingNow = live.some(s => s.outlets >= 3 && age(s.date) <= 2);
  return { momentum, quality, durability, safety, safetyReasons: flags.map(f => f.topic), invest, verdict, confidence, trendingNow,
    catalysts: catalysts.map(c => ({ date: c.catalystDate, topic: c.topic })) };
}

export function build() {
  const out = { asOf: NOW.toISOString().slice(0, 10), kols: [] };
  for (const k of kols) {
    const nums = numerics(k);
    const okNums = nums.filter(n => n.ok && n.followers != null);
    const reach = okNums.length ? Math.max(...okNums.map(n => n.followers)) : 0;
    const audPath = path.join(root, 'data', 'audience', k.name.replace(/[^\w .-]/g, '_') + '.json');
    const base = { name: k.name, row: k.row, tier: k.tier, handles: { instagram: k.instagram, tiktok: k.tiktok, youtube: k.youtube },
      verified: k.verified, flags: k.flags || {}, notes: k.notes || '', reach, numeric: nums,
      events: signals.filter(s => s.kol === k.name).sort((a, b) => b.date.localeCompare(a.date)),
      audience: { measured: fs.existsSync(audPath) ? JSON.parse(fs.readFileSync(audPath, 'utf8')) : null, inferred: inferred[k.name] || null } };
    const manual = !!scans[k.name];
    const rawRow = newsRaw[k.name];
    const autoScanned = !manual && !!rawRow && !!rawRow.q;
    const scanned = manual || autoScanned;
    const scanType = manual ? 'manual' : autoScanned ? 'auto' : 'none';
    const ya = ytAct[k.name];
    base.events = sigFor(k).sort((a, b) => b.date.localeCompare(a.date));
    base.scanType = scanType;
    base.scanNote = rawRow && !rawRow.q ? rawRow.note : '';
    base.youtubeActivity = ya && ya.ok ? { lastUpload: ya.lastUpload, uploads30d: ya.uploads30d, medianViews: ya.medianViews, outliers: ya.outliers.filter(o => o.ratio >= 4 && o.views >= 30000).length } : null;
    if (!okNums.length) { out.kols.push({ ...base, scanned: false, status: 'Needs handle', verdict: 'Needs handle' }); continue; }
    const ns = numericStatus(nums);
    if (scanned) {
      const sc = eventScore(k, nums);
      const quiet = scanType === 'auto' && sigFor(k).length === 0;
      out.kols.push({ ...base, scanned: true, scanDate: manual ? scans[k.name] : (rawRow.fetched || '').slice(0, 10), status: ns.status, statusNote: ns.note, ...sc, ...(quiet ? { invest: null, verdict: 'Quiet', confidence: 'low' } : {}), ...(scanType === 'auto' ? { confidence: 'low' } : {}) });
    }
    else out.kols.push({ ...base, scanned: false, status: ns.status, statusNote: ns.note, verdict: ns.status === 'Collecting' ? 'Tracking' : ns.status });
  }
  const names = new Set(out.kols.map(k => k.name));
  const today = out.asOf, in14 = new Date(Date.parse(today) + 14 * 864e5).toISOString().slice(0, 10);
  const pairs = new Map();
  for (const k of out.kols) for (const e of k.events || []) for (const o of e.coEntities || []) if (names.has(o) && o !== k.name) {
    const key = [k.name, o].sort().join(' + ');
    const p = pairs.get(key) || { a: k.name, b: o, topic: e.topic, date: e.date, outlets: 0 };
    p.outlets = Math.max(p.outlets, e.outlets); if (e.date > p.date) { p.date = e.date; p.topic = e.topic; } pairs.set(key, p);
  }
  out.briefing = {
    trending: out.kols.filter(k => k.trendingNow).map(k => ({ name: k.name, why: ((k.events || []).filter(e => e.outlets >= 3).sort((x, y) => y.date.localeCompare(x.date))[0] || {}).topic })),
    flags: out.kols.filter(k => k.safety === 'flag').map(k => ({ name: k.name, why: k.safetyReasons[0] })),
    catalysts: out.kols.flatMap(k => (k.events || []).filter(e => e.catalystDate && e.catalystDate >= today && e.catalystDate <= in14).map(e => ({ name: k.name, date: e.catalystDate, topic: e.topic }))).sort((x, y) => x.date.localeCompare(y.date)),
    viral: out.kols.filter(k => k.youtubeActivity && k.youtubeActivity.outliers > 0).map(k => ({ name: k.name, n: k.youtubeActivity.outliers, median: k.youtubeActivity.medianViews })),
    links: [...pairs.values()].sort((x, y) => y.outlets - x.outlets).slice(0, 8)
  };
  out.kols.sort((a, b) => (b.scanned - a.scanned) || ((b.invest ?? -1) - (a.invest ?? -1)) || (b.reach - a.reach));
  fs.writeFileSync(path.join(root, 'data', 'scores.json'), JSON.stringify(out));
  return out;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const o = build();
  const sc = o.kols.filter(k => k.scanned);
  for (const k of sc) console.log(k.name.padEnd(18), `invest ${k.invest} mom ${k.momentum} q ${k.quality} dur ${k.durability} ${k.safety} -> ${k.verdict} (reach ${k.reach})`);
  const c = {}; for (const k of o.kols) c[k.verdict] = (c[k.verdict] || 0) + 1;
  console.log('total', o.kols.length, 'scanned', sc.length, c);
}

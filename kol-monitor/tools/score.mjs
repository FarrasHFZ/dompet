// Scoring: reads kols.json, data/history.json, data/signals.json, data/audience/*.json -> data/scores.json
// Invest = cube-root(momentum x quality x durability), capped at 59 when brand safety is flagged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f, d) => { const p = path.join(root, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d; };
const kols = rd('kols.json').kols;
const history = rd('data/history.json', []);
const signals = rd('data/signals.json', []);
const inferred = rd('data/audience/inferred.json', {});
const NOW = new Date(process.env.AS_OF || new Date().toISOString().slice(0, 10));
const day = s => new Date(s);
const age = s => Math.max(0, (NOW - day(s)) / 864e5);
const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const QW = { content: 1, collab: 1, commercial: 0.9, event: 0.7, personal: 0.4, conflict: 0.2, legal: 0.1 };

export function scoreKol(k) {
  const sig = signals.filter(s => s.kol === k.name);
  // intensity: how loud (outlets, capped at 6) x how fresh (14-day half-life-ish decay on the last-seen date)
  const live = sig.filter(s => s.type !== 'event').map(s => ({ ...s, w: Math.min(1, s.outlets / 6) * Math.exp(-age(s.date) / 14) }));
  const mEvents = clamp(100 * (1 - Math.exp(-1.2 * live.reduce((a, s) => a + s.w, 0))));

  // numeric layer per verified platform: needs 7+ days of snapshots
  const nums = [];
  for (const p of ['instagram', 'tiktok']) {
    if (!k.verified?.[p]) continue;
    const s = history.filter(r => r.kol === k.name && r.platform === p).sort((a, b) => a.date.localeCompare(b.date));
    const last = s.at(-1);
    const b7 = last && [...s].reverse().find(r => (day(last.date) - day(r.date)) / 864e5 >= 7);
    const b30 = last && [...s].reverse().find(r => (day(last.date) - day(r.date)) / 864e5 >= 30);
    const rate = b => b ? Math.pow(last.followers / b.followers, 864e5 / (day(last.date) - day(b.date))) - 1 : null;
    nums.push({ platform: p, handle: k[p], days: s.length, last, r7: rate(b7), r30: rate(b30), series: s.map(r => [r.date, r.followers]) });
  }
  const withNum = nums.filter(n => n.r7 != null);
  const mNum = withNum.length ? clamp(100 * Math.max(...withNum.map(n => n.r7)) / 0.006) : null;
  const momentum = mNum == null ? Math.round(mEvents) : Math.round(0.5 * mEvents + 0.5 * mNum);

  const qw = sig.map(s => ({ q: QW[s.type] ?? 0.5, w: Math.max(0.15, Math.min(1, s.outlets / 6)) * Math.exp(-age(s.date) / 30) }));
  const wsum = qw.reduce((a, x) => a + x.w, 0);
  const quality = wsum ? Math.round(100 * qw.reduce((a, x) => a + x.q * x.w, 0) / wsum) : 50;

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
  return { name: k.name, momentum, quality, durability, safety, safetyReasons: flags.map(f => f.topic), invest, verdict, confidence, trendingNow, histDays,
    numeric: nums.map(n => ({ platform: n.platform, handle: n.handle, followers: n.last?.followers ?? null, likes: n.last?.likes ?? null, videos: n.last?.videos ?? null, r7: n.r7, r30: n.r30, series: n.series })),
    catalysts: catalysts.map(c => ({ date: c.catalystDate, topic: c.topic })) };
}

export function build() {
  const out = { asOf: NOW.toISOString().slice(0, 10), kols: [] };
  for (const k of kols) {
    const verifiedAny = Object.values(k.verified || {}).some(Boolean);
    const audPath = path.join(root, 'data', 'audience', k.name + '.json');
    const base = { name: k.name, handles: { instagram: k.instagram, tiktok: k.tiktok }, verified: k.verified, notes: k.notes || '',
      events: signals.filter(s => s.kol === k.name).sort((a, b) => b.date.localeCompare(a.date)),
      audience: { measured: fs.existsSync(audPath) ? JSON.parse(fs.readFileSync(audPath, 'utf8')) : null, inferred: inferred[k.name] || null } };
    out.kols.push(verifiedAny ? { ...base, ...scoreKol(k), scored: true } : { ...base, scored: false, verdict: 'Needs handle' });
  }
  out.kols.sort((a, b) => (b.scored - a.scored) || ((b.invest ?? 0) - (a.invest ?? 0)));
  fs.writeFileSync(path.join(root, 'data', 'scores.json'), JSON.stringify(out, null, 1));
  return out;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const o = build();
  for (const k of o.kols) console.log(k.name.padEnd(18), k.scored ? `invest ${k.invest} mom ${k.momentum} q ${k.quality} dur ${k.durability} safety ${k.safety} -> ${k.verdict} (conf ${k.confidence}, trendingNow ${k.trendingNow})` : k.verdict);
}

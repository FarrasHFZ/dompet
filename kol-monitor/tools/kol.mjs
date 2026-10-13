// KOL trend monitor. Usage:
//   node tools/kol.mjs add <KOL name> <json>     record one snapshot row for today (json from collect-snippets)
//   node tools/kol.mjs report                    score all verified KOLs, write reports/<date>.md and print it
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const kols = JSON.parse(fs.readFileSync(path.join(root, 'kols.json'), 'utf8')).kols;
const histFile = path.join(root, 'data', 'history.json');
const load = () => (fs.existsSync(histFile) ? JSON.parse(fs.readFileSync(histFile, 'utf8')) : []);
const today = new Date().toISOString().slice(0, 10);
const fmt = n => (n == null ? '-' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n));
const pct = x => (x == null ? '-' : (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%');

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'add') {
  const [name, json] = args;
  const row = JSON.parse(json);
  if (!kols.find(k => k.name === name)) throw new Error('unknown KOL ' + name);
  const h = load().filter(r => !(r.date === today && r.kol === name && r.platform === row.platform));
  h.push({ date: today, kol: name, ...row });
  fs.writeFileSync(histFile, JSON.stringify(h, null, 1));
  console.log('saved', name, row.platform, row.followers);
} else if (cmd === 'report') {
  const h = load();
  const lines = [`# KOL trend report ${today}`, ''];
  const summary = [];
  for (const k of kols) {
    for (const platform of ['tiktok', 'instagram']) {
      const handle = k[platform];
      if (!k.verified?.[platform]) { summary.push({ k, platform, status: 'UNVERIFIED HANDLE', note: `@${handle} not confirmed` }); continue; }
      const s = h.filter(r => r.kol === k.name && r.platform === platform).sort((a, b) => a.date.localeCompare(b.date));
      const last = s.at(-1);
      if (!last) { summary.push({ k, platform, status: 'NO DATA' }); continue; }
      const daysAgo = d => (new Date(last.date) - new Date(d)) / 864e5;
      const base = n => [...s].reverse().find(r => daysAgo(r.date) >= n);
      const g = n => { const b = base(n); return b ? { growth: last.followers / b.followers - 1, days: daysAgo(b.date), abs: last.followers - b.followers } : null; };
      const g7 = g(7), g30 = g(30), g14 = g(14);
      // daily compounding rate: recent week vs the rest of the window
      const rate = x => (x ? Math.pow(1 + x.growth, 1 / x.days) - 1 : null);
      const r7 = rate(g7), r30 = rate(g30);
      const accel = r7 != null && r30 != null && r30 > 0 ? r7 / r30 : null;
      const vids = g7 && platform === 'tiktok' ? last.videos - base(7).videos : null;
      const likesPerNewVideo = vids > 0 ? (last.likes - base(7).likes) / vids : null;
      let status, note = '';
      if (!g7) { status = 'COLLECTING'; note = `${s.length} snapshot(s); needs 7+ days of history`; }
      else if (r7 >= 0.004 || (accel != null && accel >= 2 && r7 >= 0.002)) { status = 'TRENDING'; note = 'follower growth well above own baseline / absolute surge'; }
      else if ((accel != null && accel >= 1.3 && r7 > 0) || (vids >= 3 && likesPerNewVideo != null && likesPerNewVideo > 0 && r7 > 0)) { status = 'POTENTIAL'; note = 'growth accelerating or active posting with rising likes'; }
      else if (r7 < 0 && (g30?.growth ?? 0) < 0) { status = 'COOLING'; note = 'losing followers over 7d and 30d'; }
      else { status = 'STEADY'; }
      summary.push({ k, platform, status, note, last, g7, g30, accel, vids, likesPerNewVideo });
    }
  }
  const rank = { TRENDING: 0, POTENTIAL: 1, STEADY: 2, COOLING: 3, COLLECTING: 4, 'NO DATA': 5, 'UNVERIFIED HANDLE': 6 };
  summary.sort((a, b) => rank[a.status] - rank[b.status]);
  lines.push('| KOL | Platform | Status | Followers | 7d | 30d | Accel (7d vs 30d rate) | New videos 7d | Note |', '|---|---|---|---|---|---|---|---|---|');
  for (const x of summary)
    lines.push(`| ${x.k.name} | ${x.platform} | **${x.status}** | ${fmt(x.last?.followers)} | ${pct(x.g7?.growth)} | ${pct(x.g30?.growth)} | ${x.accel ? x.accel.toFixed(1) + 'x' : '-'} | ${x.vids ?? '-'} | ${x.note || ''} |`);
  lines.push('', 'Status rules: TRENDING = 7d daily growth >= 0.4%, or >= 2x the 30d rate; POTENTIAL = accelerating >= 1.3x, or 3+ new TikToks with likes still rising; COOLING = negative 7d and 30d. Large accounts grow slowly in % terms, so rules compare each KOL to its own history. Fewer than 7 days of history = COLLECTING; no verdicts yet.');
  const out = lines.join('\n');
  fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(root, 'reports', today + '.md'), out);
  console.log(out);
} else console.log('commands: add <name> <json> | report');

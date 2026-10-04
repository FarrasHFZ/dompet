// Dry-run check of the alert rules against the latest snapshot + cached headlines.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, ROOT } from './lib.mjs';
import { buildMessages } from './alerts.mjs';
const api = loadEngine();
const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'data', 'latest.json'), 'utf8'));
const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'news-cache.json'), 'utf8')).rows.map(r => [new Date(r[0]), ...r.slice(1)]);
// Pretend the newest headlines (last 14h) are unseen and one ACT pick is new on a new signal day.
const cutoff = Date.now() - 14 * 3600e3;
const seen = rows.filter(r => new Date(r[0]) < cutoff).map(r => api.normTitle_(r[2]));
const acts = j.picks.filter(p => p.action === 'ACT').map(p => p.ticker);
const base = { picks: j.picks, newsRows: rows, meta: j.meta, market: j.market, api, watchlist: ['BBCA'] };
const first = buildMessages({ ...base, state: {} });
console.log('FIRST RUN lines:', first.lines.length, '| seen recorded:', first.newState.seenNews.length);
const m = buildMessages({ ...base, state: { initialised: true, seenNews: seen, lastActs: acts.slice(1), lastSignalDay: '2026-10-01', lastRegime: 'Isolated' } });
console.log(`\nNEW RUN: ${m.lines.length} block(s)\n`);
console.log(m.lines.join('\n\n'));
const again = buildMessages({ ...base, state: m.newState });
console.log('\nSECOND RUN right after (should be empty):', again.lines.length);

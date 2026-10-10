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

export async function fetchRss(url) {
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

// ---------------------------------------------------------------------------------------------------------------
// News store: a rolling 35-day archive that is topped up every run and back-filled in resumable chunks.
// Why windows: one Google News RSS query returns at most ~100 items, which for an active stock is only 2-3 weeks of
// headlines. So a query is split into date windows (after:/before:), and any window that hits the cap is halved
// again, down to single days, until the whole 30 days is covered.
// ---------------------------------------------------------------------------------------------------------------
const DAY = 864e5, CAP = 95, KEEP_DAYS = 35, COVER_DAYS = 30;
const fmtDate = d => d.toISOString().slice(0, 10);
const rssUrl = q => 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=id&gl=ID&ceid=ID:id';
const PAGES_SEED = 'https://farrashfz.github.io/dompet/screener/data/news-30d.json';

async function fetchWindow(q, from, to, ctx) {
  if (ctx.budget.left <= 0 || ctx.abort) { ctx.cut = true; return; }
  ctx.budget.left--;
  const xml = process.env.NEWS_FORCE_FAIL ? null : await fetchRss(rssUrl(`${q} after:${fmtDate(from)} before:${fmtDate(to)}`));
  ctx.requests++;
  if (xml === null) { ctx.fails++; if (++ctx.streak >= 3) ctx.abort = true; ctx.cut = true; return; }
  ctx.streak = 0;
  const items = parseRss(xml);
  items.forEach(i => ctx.items.push(i));
  const days = Math.round((to - from) / DAY);
  await sleep(600);
  if (items.length >= CAP && days > 1) {
    const mid = new Date(from.getTime() + Math.floor(days / 2) * DAY);
    await fetchWindow(q, from, mid, ctx);
    await fetchWindow(q, mid, to, ctx);
  } else if (items.length >= CAP) ctx.cappedDays++;
}

export function loadStore(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (j.rows) return { rows: j.rows.map(r => [new Date(r[0]), ...r.slice(1)]), backfill: j.backfill || {}, inc: j.inc || {} };
  } catch { /* none yet */ }
  return null;
}

// Rebuild the archive from the last published copy when the CI cache is gone (cache entries expire after 7 idle days).
async function seedFromPages() {
  try {
    const r = await fetch(PAGES_SEED + '?t=' + Date.now(), { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const j = await r.json();
    return { rows: j.rows.map(c => [new Date(c[0] * 1000), c[1], c[2], c[3], c[4], c[5], c[6], c[7], '']), backfill: j.backfill || {} };
  } catch { return null; }
}

export async function refreshNewsStore(api, uni, { storeFile, legacyFile, hot = [], budget = { incremental: 160, backfill: 140 }, fullSweep = false }) {
  const aliasRes = api.buildAliasRes_(uni);
  let store = loadStore(storeFile);
  let seeded = store ? 'cache' : null;
  if (!store && legacyFile) { const old = loadStore(legacyFile); if (old) { store = { rows: old.rows, backfill: {} }; seeded = 'legacy cache'; } }
  if (!store) { store = await seedFromPages(); if (store) seeded = 'published copy'; }
  if (!store) store = { rows: [], backfill: {} };

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + DAY);
  const keys = [];
  uni.forEach(u => keys.push({ key: u.ticker, q: `"${u.name}" OR ${u.ticker} saham`, qd: { direct: u.ticker } }));
  api.DEFAULT_THEMES.forEach(t => keys.push({ key: 'T:' + t[0], q: t[0], qd: { themeCat: t[1], sectors: String(t[2] || '').split(',').map(s => s.trim()).filter(Boolean) } }));
  keys.forEach(k => { k.qd.q = k.q; });

  const fresh = [], seen = new Set(store.rows.map(r => api.normTitle_(r[2])));
  const totals = { requests: 0, fails: 0, cappedDays: 0 };
  const take = (items, k) => {
    items.forEach(item => {
      const nk = api.normTitle_(item.title);
      if (seen.has(nk) || isNaN(item.published)) return;
      const row = api.buildNewsRow_(item, k.qd, aliasRes);
      if (!row) return;
      seen.add(nk); fresh.push(row);
    });
  };
  const run = async (k, from, budgetObj) => {
    const ctx = { budget: budgetObj, items: [], requests: 0, fails: 0, streak: 0, cappedDays: 0, abort: false, cut: false };
    await fetchWindow(k.q, from, tomorrow, ctx);
    take(ctx.items, k);
    totals.requests += ctx.requests; totals.fails += ctx.fails; totals.cappedDays += ctx.cappedDays;
    return ctx;
  };

  // 1) Back-fill chunk: keys never completed get the full 30 days. Resumes on the next run.
  const bf = { left: budget.backfill };
  const pending = keys.filter(k => !store.backfill[k.key]);
  let abort = false;
  for (const k of pending) {
    if (bf.left <= 0 || abort) break;
    const ctx = await run(k, new Date(today.getTime() - COVER_DAYS * DAY), bf);
    if (ctx.abort) abort = true;
    else if (!ctx.cut) store.backfill[k.key] = fmtDate(today); // finished every window for this key
  }
  // 2) Incremental top-up (last 2 days) for hot keys + themes, or everything on a full sweep.
  const inc = { left: budget.incremental };
  const hotSet = new Set(hot);
  // With ~300 stocks one run's budget cannot top up every key, so themes and hot keys go first and the rest in order of
  // their last top-up (oldest first): a full sweep then rotates through the universe instead of starving the tail.
  store.inc = store.inc || {};
  const order = keys.slice().sort((a, b) => {
    const pa = a.key.startsWith('T:') ? 0 : hotSet.has(a.key) ? 1 : 2, pb = b.key.startsWith('T:') ? 0 : hotSet.has(b.key) ? 1 : 2;
    return pa - pb || String(store.inc[a.key] || '').localeCompare(String(store.inc[b.key] || ''));
  });
  for (const k of order) {
    if (abort || inc.left <= 0) break;
    const isTheme = k.key.startsWith('T:');
    if (!(fullSweep || isTheme || hotSet.has(k.key))) continue;
    if (!pending.includes(k) || store.backfill[k.key] !== fmtDate(today)) {
      const ctx = await run(k, new Date(today.getTime() - 2 * DAY), inc);
      if (ctx.abort) abort = true;
      else if (!ctx.cut) store.inc[k.key] = new Date().toISOString();
    }
  }

  const cutoff = Date.now() - KEEP_DAYS * DAY;
  const reclass = r => { const cl = api.classify_(r[2]); return [r[0], r[1], r[2], r[3], cl.category, r[5], r[6], cl.sentiment, r[8]]; };
  const rows = store.rows.map(reclass).concat(fresh).filter(r => new Date(r[0]).getTime() >= cutoff).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  const ok = totals.requests - totals.fails;
  const state = totals.requests === 0 ? 'ok' : ok === 0 ? 'stale' : totals.fails > 0 ? 'partial' : 'ok';
  const done = keys.filter(k => store.backfill[k.key]).length;
  const newest = rows.length ? new Date(rows[0][0]).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'none';
  const status = {
    state,
    note: state === 'ok' ? `${fresh.length} new headlines (${totals.requests} requests); month back-fill ${done}/${keys.length}`
      : state === 'stale' ? `Google News refused every request from the build server; showing saved headlines (newest ${newest}).`
      : `${totals.fails} of ${totals.requests} news requests failed this run; the rest were merged with saved headlines.`,
  };
  if (ok > 0 || totals.requests === 0) { fs.mkdirSync(path.dirname(storeFile), { recursive: true }); fs.writeFileSync(storeFile, JSON.stringify({ savedAt: new Date().toISOString(), backfill: store.backfill, inc: store.inc, rows })); }
  rows.stats = { ...totals, fresh: fresh.length, seeded, backfilled: done, keys: keys.length };
  return { rows, status, backfill: store.backfill, keys: keys.length };
}

// What the dashboard can claim about its news coverage, measured from the archive itself.
export function newsCoverage(api, uni, rows, backfill, keys) {
  const now = Date.now(), start = now - COVER_DAYS * DAY;
  const month = rows.filter(r => new Date(r[0]).getTime() >= start && !api.classify_(r[2]).roundup);
  const perDay = new Array(COVER_DAYS).fill(0);
  month.forEach(r => { const i = COVER_DAYS - 1 - Math.floor((now - new Date(r[0]).getTime()) / DAY); if (i >= 0 && i < COVER_DAYS) perDay[i]++; });
  const perTicker = {};
  month.forEach(r => String(r[5]).split(',').filter(Boolean).forEach(t => { perTicker[t] = (perTicker[t] || 0) + 1; }));
  const covered = uni.filter(u => (perTicker[u.ticker] || 0) > 0).length;
  const thin = uni.filter(u => (perTicker[u.ticker] || 0) < 3).map(u => u.ticker);
  const oldest = month.length ? new Date(Math.min(...month.map(r => new Date(r[0]).getTime()))).toISOString().slice(0, 10) : null;
  return {
    days: COVER_DAYS, headlines: month.length, withTicker: month.filter(r => r[5]).length, tickers: uni.length, tickersCovered: covered, thin,
    daysWithNews: perDay.filter(x => x > 0).length, perDay, oldest, backfilled: Object.keys(backfill).length, keys,
    perTicker: Object.fromEntries(Object.entries(perTicker).sort((a, b) => b[1] - a[1]).slice(0, 15)),
    note: 'Measured from Google News, which indexes the major Indonesian outlets but not everything; a stock with few headlines may simply be quiet.',
  };
}

// Compact 30-day archive for the web app: [epochSec, source, title, link, category, tickers, sectors, sentiment, roundup].
export function archiveForWeb(api, rows, backfill) {
  const start = Date.now() - COVER_DAYS * DAY;
  const keep = rows.filter(r => new Date(r[0]).getTime() >= start && (r[5] || r[4] !== 'OTHER'));
  return {
    generatedAt: new Date().toISOString(), backfill,
    rows: keep.map(r => [Math.floor(new Date(r[0]).getTime() / 1000), r[1], r[2], r[3], r[4], r[5], r[6], r[7], api.classify_(r[2]).roundup ? 1 : 0]),
  };
}

if (process.argv[1] && process.argv[1].endsWith('news.mjs')) {
  const api = loadEngine(), uni = universe(api);
  const rows = await fetchNewsRows(api, uni);
  console.log(rows.length, 'headlines');
  console.log(rows.slice(0, 5).map(r => r[2] + ' | ' + r[4] + ' | ' + r[5] + ' | ' + r[3].slice(0, 60)).join('\n'));
}

// Telegram alerts, run at the end of every build. Two kinds of message, one digest per run:
//   1. New headlines that matter (risk, commissioner/director change, insider buying, government investment, corporate
//      action, contract, earnings) about a stock you care about = today's ACT picks + data/watchlist.json,
//      or sector-wide government/risk news for the sectors of those picks.
//   2. Once per signal day (first run after the close): ACT picks that entered or left, and the market regime.
// "Seen" headlines live in data/alert-state.json (kept between runs by actions/cache) so nothing is sent twice.
// The very first run only records what already exists and sends a "connected" message: no flood.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const IMPORTANT = new Set(['RISK', 'COMMISSIONER', 'INSIDER', 'GOV_INVEST', 'CORP_ACTION', 'CONTRACT', 'EARNINGS']);
const ICON = { RISK: '🔴', COMMISSIONER: '🟡', INSIDER: '🟡', GOV_INVEST: '🏛', CORP_ACTION: '📢', CONTRACT: '📝', EARNINGS: '📊' };
const MAX_ITEMS = 8;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ageText = d => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export function buildMessages({ api, picks, newsRows, meta, market, state, watchlist, now = Date.now() }) {
  const out = { lines: [], seenAdd: [], first: !state.initialised };
  const interest = new Map(); // ticker -> pick
  picks.forEach(p => { if (p.action === 'ACT' || watchlist.includes(p.ticker)) interest.set(p.ticker, p); });
  const sectors = new Set([...interest.values()].map(p => p.sector));
  const seen = new Set(state.seenNews || []);

  const items = [];
  newsRows.forEach(r => {
    const key = api.normTitle_(r[2]);
    if (seen.has(key)) return;
    out.seenAdd.push(key);
    if (out.first) return;
    if (now - new Date(r[0]).getTime() > 36 * 3600e3) return; // old news that only just surfaced
    const cat = r[4], sent = Number(r[7]) || 0;
    if (!IMPORTANT.has(cat) || api.classify_(r[2]).roundup) return;
    const direct = String(r[5]).split(',').filter(t => interest.has(t));
    const sector = String(r[6]).split(',').filter(s => sectors.has(s));
    const hardCats = cat === 'RISK' || cat === 'COMMISSIONER' || cat === 'INSIDER';
    if (direct.length) {
      if (sent === 0 && !hardCats && cat !== 'GOV_INVEST') return; // neutral corporate chatter
      items.push({ r, cat, sent, who: direct, score: 3 + (hardCats ? 2 : 0) + Math.abs(sent) });
    } else if (sector.length && (cat === 'GOV_INVEST' || cat === 'RISK') && sent !== 0) {
      items.push({ r, cat, sent, who: [], sector, score: 1 + Math.abs(sent) });
    }
  });
  items.sort((a, b) => b.score - a.score || new Date(b.r[0]) - new Date(a.r[0]));
  // Drop near-duplicate wire copies (same story, different outlet) and cap each stock at 2 items per run.
  const words = t => new Set(api.normTitle_(t).split(' ').filter(w => w.length > 3));
  const jac = (x, y) => { let i = 0; x.forEach(w => { if (y.has(w)) i++; }); return i / (x.size + y.size - i || 1); };
  const kept = [], perTicker = {};
  items.forEach(it => {
    const w = words(it.r[2]);
    if (kept.some(k => jac(w, k.w) >= 0.5)) return;
    if (it.who.some(t => (perTicker[t] || 0) >= 2)) return;
    it.who.forEach(t => { perTicker[t] = (perTicker[t] || 0) + 1; });
    kept.push({ ...it, w });
  });
  const shown = kept.slice(0, MAX_ITEMS);
  shown.forEach(it => {
    const who = it.who.length ? it.who.map(t => `<b>${t}</b> <i>(${interest.get(t).action} ${interest.get(t).score})</i>`).join(', ') : `<i>sector: ${esc(it.sector.join(', '))}</i>`;
    const dir = it.sent > 0 ? '▲' : it.sent < 0 ? '▼' : '•';
    out.lines.push(`${ICON[it.cat] || '•'} ${dir} ${esc(it.cat.replace('_', ' '))} · ${who}\n<a href="${esc(it.r[3])}">${esc(it.r[2].slice(0, 160))}</a>\n<i>${esc(it.r[1])} · ${ageText(it.r[0])}</i>`);
  });
  if (kept.length > shown.length) out.lines.push(`<i>+${kept.length - shown.length} more in the News tab</i>`);

  // Signal-day change
  const acts = picks.filter(p => p.action === 'ACT').map(p => p.ticker);
  const dayChanged = state.lastSignalDay && state.lastSignalDay !== meta.asOf;
  const head = [];
  if (!out.first && dayChanged) {
    const added = acts.filter(t => !(state.lastActs || []).includes(t)), dropped = (state.lastActs || []).filter(t => !acts.includes(t));
    if (added.length || dropped.length || state.lastRegime !== market.regime) {
      head.push(`<b>Signals for ${esc(meta.asOf)} close</b> · ${esc(market.regime)} (${market.oversoldCount}/${market.of} oversold)` +
        (added.length ? `\n➕ New ACT: ${added.map(t => `<b>${t}</b> ${picks.find(p => p.ticker === t).score}`).join(', ')}` : '') +
        (dropped.length ? `\n➖ Left ACT: ${dropped.join(', ')}` : ''));
    }
  }
  if (out.first) {
    head.push(`✅ <b>IDX Swing Screener alerts connected.</b>\nACT now: ${acts.length ? acts.join(', ') : 'none'}. Regime: ${esc(market.regime)}.\nYou'll get new risk / commissioner / insider / government-investment / corporate-action headlines for ACT picks${watchlist.length ? ' and your watchlist (' + watchlist.join(', ') + ')' : ''}. Edit swing-screener/data/watchlist.json to add stocks.`);
  }
  out.lines = head.concat(out.lines);
  // Telegram caps a message at 4096 chars; cut whole blocks (never mid-tag, which makes Telegram reject the message).
  let used = 0;
  const fit = [];
  for (const l of out.lines) { if (used + l.length + 2 > 3800) { fit.push('<i>…more in the News tab</i>'); break; } used += l.length + 2; fit.push(l); }
  out.lines = fit;
  out.newState = {
    initialised: true, lastActs: acts, lastSignalDay: meta.asOf, lastRegime: market.regime,
    seenNews: [...(state.seenNews || []), ...out.seenAdd].slice(-4000), updatedAt: new Date(now).toISOString(),
  };
  return out;
}

export async function runAlerts({ api, picks, newsRows, meta, market }) {
  const token = process.env.TG_TOKEN, chat = process.env.TG_CHAT_ID, dry = process.env.DRY_ALERTS === '1';
  if (!dry && !(token && chat)) { console.log('alerts: skipped (TG_TOKEN / TG_CHAT_ID not set)'); return; }
  const stateFile = path.join(ROOT, 'data', 'alert-state.json');
  let state = {};
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* first run */ }
  let watchlist = [];
  try { watchlist = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'watchlist.json'), 'utf8')).map(t => String(t).toUpperCase()); } catch { /* none */ }

  const m = buildMessages({ api, picks, newsRows, meta, market, state, watchlist });
  const text = m.lines.join('\n\n');
  if (m.lines.length) {
    if (dry) console.log('--- alert (dry run) ---\n' + text + '\n-----------------------');
    else {
      const hourWib = (new Date().getUTCHours() + 7) % 24;
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, disable_notification: hourWib >= 23 || hourWib < 6 }),
      });
      if (!r.ok) { console.error('alerts: Telegram error', r.status, (await r.text()).slice(0, 200)); return; } // keep state so we retry next run
    }
  }
  if (!dry) { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(m.newState)); }
  console.log(`alerts: ${m.first ? 'connected message' : m.lines.length + ' block(s)'} ${dry ? '(dry run)' : 'sent'}`);
}

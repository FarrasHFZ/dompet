// "Momentum 10", the paper-only second strategy (tools/experiment-momentum.mjs passed its pre-registered test).
// On the last trading day of each month: among liquid stocks (Rp 5 B a day over 20 sessions, traded in each of the
// last 3), rank by 12-1 month return (close 21 sessions ago / close 252 sessions ago - 1) and hold the top 10, equal
// weight, from the next open to the next month's rebalance open; only while the IHSG closed above its 200-day average
// on the rebalance day, else cash.
// Forward record: one ledger file per rebalance in data/history-mom/ (committed by the end-of-day run), starting with
// the first month-end after the rule was fixed (October 2026), so no list is ever picked with hindsight.
import fs from 'node:fs';
import path from 'node:path';

export const MOM_FROM = '2026-10'; // first counted rebalance month
const FEE = 0.002, TOP = 10, iso = d => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);

function rankAt(px, tickers, day) {
  const rows = [];
  for (const t of tickers) {
    const b = px[t + '.JK']; if (!b) continue;
    const k = b.d.findIndex(d => iso(d) === day);
    if (k < 252 || b.v.slice(k - 2, k + 1).some(v => !v)) continue;
    const val = mean(b.c.slice(k - 19, k + 1).map((c, j) => c * b.v[k - 19 + j]));
    if (val < 5e9) continue;
    rows.push({ t, mom: b.c[k - 21] / b.c[k - 252] - 1, close: b.c[k] });
  }
  return rows.sort((a, b) => b.mom - a.mom);
}
// price on/after a day: open of the first session strictly after `day`, or null if none yet
function openAfter(b, day) { const k = b.d.findIndex(d => iso(d) > day); return k < 0 ? null : { k, o: b.o[k] }; }

// px: completed daily bars ({ 'BBCA.JK': bars, '^JKSE': bars }); live: { 'BBCA.JK': { price } } for intraday quotes.
export function momentumBook({ px, tickers, names, histDir, todayWib, live = {}, write = true }) {
  const idx = px['^JKSE']; if (!idx) return null;
  const days = idx.d.map(iso), n = days.length;
  const reb = days.map((d, i) => i).filter(i => (i + 1 < n ? days[i + 1].slice(0, 7) !== days[i].slice(0, 7) : todayWib.slice(0, 7) !== days[i].slice(0, 7)) && i >= 252);
  if (!reb.length) return null;
  const filterAt = i => idx.c[i] > idx.c.slice(i - 199, i + 1).reduce((s, x) => s + x, 0) / 200;
  const lastI = reb[reb.length - 1], lastDay = days[lastI];
  fs.mkdirSync(histDir, { recursive: true });
  // ledger: write each counted rebalance once
  for (const i of reb) {
    const ym = days[i].slice(0, 7); if (ym < MOM_FROM) continue;
    const f = path.join(histDir, `${ym}.json`);
    if (fs.existsSync(f) || !write) continue;
    const rows = rankAt(px, tickers, days[i]);
    fs.writeFileSync(f, JSON.stringify({ v: 1, rebalance: days[i], filterOn: filterAt(i), picks: rows.slice(0, TOP), universe: rows.map(r => r.t) }));
  }
  const now = t => (live[t + '.JK'] ? live[t + '.JK'].price : px[t + '.JK'] ? px[t + '.JK'].c.at(-1) : null);
  // current list (from the latest month-end, counted or not)
  const cur = rankAt(px, tickers, lastDay).slice(0, TOP).map((r, i) => {
    const b = px[r.t + '.JK'], e = openAfter(b, lastDay), p = now(r.t);
    return { rank: i + 1, t: r.t, name: names[r.t] || r.t, mom: r.mom, close: r.close, entry: e ? e.o : null, now: p, ret: e && p ? p / e.o - 1 : null };
  });
  // forward record
  const files = fs.readdirSync(histDir).filter(f => /^\d{4}-\d\d\.json$/.test(f)).sort();
  const led = files.map(f => JSON.parse(fs.readFileSync(path.join(histDir, f), 'utf8')));
  const record = led.map((L, j) => {
    const end = led[j + 1] ? led[j + 1].rebalance : null; // exit at the open after the next rebalance
    const leg = t => { const b = px[t + '.JK']; if (!b) return null; const a = openAfter(b, L.rebalance); if (!a) return null; const z = end ? openAfter(b, end) : null; const exit = z ? z.o : now(t); return exit ? exit / a.o - 1 : null; };
    const mr = L.picks.map(p => leg(p.t)).filter(x => x != null), er = L.universe.map(leg).filter(x => x != null);
    const ia = idx.d.findIndex(d => iso(d) > L.rebalance), iz = end ? idx.d.findIndex(d => iso(d) > end) : -1;
    const ihsg = ia < 0 ? null : (iz > 0 ? idx.o[iz] : idx.c.at(-1)) / idx.o[ia] - 1;
    const momRet = mr.length ? mean(mr) - 2 * FEE : null;
    return { month: L.rebalance.slice(0, 7), rebalance: L.rebalance, filterOn: L.filterOn, open: !end, picks: L.picks.map(p => p.t), momRet, traded: L.filterOn ? momRet : 0, ewRet: er.length ? mean(er) - 2 * FEE : null, ihsg };
  });
  return { rebalance: lastDay, counted: lastDay.slice(0, 7) >= MOM_FROM, filterOn: filterAt(lastI), holdings: cur, record, from: MOM_FROM };
}

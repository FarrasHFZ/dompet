// Flow labels from NeoBDM's stock pages, for stocks outside the 'swing-100' Market Summary list (the 200 added on
// 2026-10-10). Each /stock_detail/<TK>/ page embeds its Transaction Chart: each group's cumulative net value per session
// (tools/nb-hist-pull.js stores it in data/nb-history.json). Group flow over w sessions / Yahoo turnover reproduces the
// screener's <g>_cn_<w> columns (checked to 4 digits on the 2026-10-09 snapshot), so tools/flow-model.mjs reads these
// rows exactly as it reads the screener. Not available from the page: method-fit (comp_*), crossing / Clean and Pinky,
// so every group is trusted fully and nothing is tagged AVOID; labels carry source 'chart' to say so.
import { readFlow, publicFlow } from './flow-model.mjs';

const G = ['m', 'nr', 'i', 's', 'f', 'z'], W = [5, 10, 20, 50];
const iso = d => d.toISOString().slice(0, 10);

// rec = data/nb-history.json[tk], b = Yahoo bars -> { date: screener-like row }
export function chartRows(rec, b) {
  const g = rec && rec.g, out = {}; if (!g || !b) return out;
  const bi = new Map(b.d.map((d, i) => [iso(d), i])), tv = b.c.map((c, i) => c * b.v[i] / 1e9);
  g.d.forEach((day, k) => {
    const t = bi.get(day); if (t == null || k < 20) return;
    const row = {};
    for (const w of W) {
      if (k < w || t < w) continue;
      let turn = 0; for (let j = t - w + 1; j <= t; j++) turn += tv[j];
      if (!turn) continue;
      for (const x of G) { const a = g[x]; if (a && a[k] != null && a[k - w] != null) row[x + '_cn_' + w] = (a[k] - a[k - w]) / turn; }
    }
    if (Object.keys(row).length) out[day] = row;
  });
  return out;
}

export function chartFlow(rows, b, day) {
  const r = rows[day]; if (!r) return null;
  const t = b.d.findIndex(d => iso(d) === day); if (t < 20) return null;
  return readFlow(r, { chg5: b.c[t] / b.c[t - 5] - 1, chg20: b.c[t] / b.c[t - 20] - 1 });
}

// Public label for one day (directions only), marked as page-derived.
export function chartTag(rec, b, day) {
  const fr = chartFlow(chartRows(rec, b), b, day);
  return fr ? { ...publicFlow(fr), source: 'chart', note: fr.note + ' (from the Transaction Chart; method-fit and dirty-tape flags not available)' } : null;
}

// 60-session FLOW+/~/- strip, as in data/nb-history-tags.json.
export function chartStrip(rec, b) {
  const rows = chartRows(rec, b), days = Object.keys(rows).sort(); if (!days.length) return null;
  const last = days.slice(-60), code = fr => (fr ? ({ 'FLOW+': '+', 'FLOW-': '-', 'FLOW~': '~' })[fr.tag] || '?' : '.');
  const ph = (chartFlow(rows, b, days.at(-1)) || {}).phase || null;
  let run = 0; for (let k = days.length - 1; k >= 0; k--) { const fr = chartFlow(rows, b, days[k]); if (!fr || fr.phase !== ph) break; run++; }
  return { d0: last[0], d1: last.at(-1), t: last.map(d => code(chartFlow(rows, b, d))).join(''), ph, phDays: run };
}

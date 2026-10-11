// Shared: replay the live ACT engine over 10-year daily bars, one stock at a time, and keep per-day what the badge rules
// need (oversold score with neutral news, liquidity, bounce candle, plan levels). Used by tools/diagnose-act.mjs and
// tools/experiment-act-window.mjs. The score is only computed in full (analyse_, support levels) when a cheap pre-check
// says it can reach the ACT bar, like tools/experiment-payoff-confirm.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { CACHE } from './lib.mjs';

export const WINDOW = 270, FEE = 0.004;
export const iso = d => d.toISOString().slice(0, 10);
const lin = x => Math.max(0, Math.min(1, x));
const osOf = (rsi, r5, d20) => 0.35 * (rsi == null ? 0 : lin((45 - rsi) / 17)) + 0.30 * (r5 == null ? 0 : lin((-0.01 - r5) / 0.07)) + 0.35 * lin((-0.5 - d20) / 2.5);
export const bounce = (b, k) => b.c[k] > b.h[k - 1] || (b.c[k] > b.o[k] && b.c[k] > b.c[k - 1]);

// Per stock: { tk, rows: Map(k -> { score, a }) } for every day whose score could reach `floor` (default ACT bar - 15,
// so the "score just before" of a bounce day is also known), plus liq[k] (Rp 5 B/day over 20 sessions).
export function scoreStock(api, tk, b, idx, cfg, floor) {
  const idxBy = new Map(idx.d.map((d, i) => [iso(d), i])), rows = new Map(), liq = new Uint8Array(b.c.length);
  let val = 0;
  for (let k = 0; k < b.c.length; k++) {
    val += b.c[k] * b.v[k]; if (k >= 20) val -= b.c[k - 20] * b.v[k - 20];
    liq[k] = k >= 19 && val / 20 / 1e9 >= (cfg.minValueB || 5) ? 1 : 0;
  }
  for (let k = 250; k < b.c.length; k++) {
    const lo = Math.max(0, k + 1 - WINDOW), s = x => x.slice(lo, k + 1);
    const c = s(b.c), n = c.length, bars = { d: s(b.d), o: s(b.o), h: s(b.h), l: s(b.l), c, v: s(b.v) };
    const rsi = api.rsi_(c, 14), atr = api.atrSeries_(bars, 14)[n - 1], m20 = api.sma_(c, 20);
    if (80 * osOf(rsi, c[n - 1] / c[n - 6] - 1, m20 != null && atr ? (c[n - 1] - m20) / atr : 0) + 15 < floor - 0.5) continue;
    const ii = idxBy.get(iso(b.d[k]));
    const a = api.analyse_(bars, ii == null ? null : idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
    if (!a) continue;
    const score = api.score_(a, 0);
    if (score >= floor) rows.set(k, { score, entry: a.entry, stop: a.stop, target: a.target, targetMR: a.targetMR, atr: a.atr });
  }
  return { tk, rows, liq };
}

// Cached per (stock, floor): the scan is the slow part (~1-2 s per stock-decade).
export function scoreCached(api, tk, b, idx, cfg, floor) {
  const f = path.join(CACHE, 'actscore', `${tk}_${floor}_${b.c.length}_${iso(b.d.at(-1))}.json`);
  if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return { tk, rows: new Map(j.rows), liq: Uint8Array.from(j.liq) }; }
  const r = scoreStock(api, tk, b, idx, cfg, floor);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ rows: [...r.rows], liq: [...r.liq] }));
  return r;
}

// The live trade: buy next open, stop, target, exit after `h` sessions; gaps fill at the open; a bar touching both is a loss.
export function sim(b, k, stop, tp, h = 15) {
  const j0 = k + 1, last = j0 + h - 1; if (last >= b.c.length) return null;
  const entry = b.o[j0], out = (j, px, res) => ({ ret: px / entry - 1 - FEE, j1: j, n: j - k, res });
  let mfe = 0;
  for (let j = j0; j <= last; j++) {
    if (b.o[j] <= stop) return { ...out(j, b.o[j], 'sl'), mfe };
    if (b.o[j] >= tp) return { ...out(j, b.o[j], 'tp'), mfe: Math.max(mfe, b.h[j] / entry - 1) };
    if (b.l[j] <= stop) return { ...out(j, stop, 'sl'), mfe: Math.max(mfe, b.h[j] / entry - 1) };
    if (b.h[j] >= tp) return { ...out(j, tp, 'tp'), mfe: Math.max(mfe, b.h[j] / entry - 1) };
    mfe = Math.max(mfe, b.h[j] / entry - 1);
  }
  return { ...out(last, b.c[last], 'time'), mfe };
}

// The live plan on day k (analyse_ on the trailing window): entry = close, wide stop, +8% target.
export function planAt(api, b, k, idx, cfg) {
  const lo = Math.max(0, k + 1 - WINDOW), s = x => x.slice(lo, k + 1);
  const ii = idx.d.findIndex(d => iso(d) === iso(b.d[k]));
  const a = api.analyse_({ d: s(b.d), o: s(b.o), h: s(b.h), l: s(b.l), c: s(b.c), v: s(b.v) }, ii < 0 ? null : idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
  return a ? { stop: api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down'), target: a.target, score: api.score_(a, 0) } : null;
}

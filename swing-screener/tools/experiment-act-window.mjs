// ACT WINDOW (pre-registered 2026-10-12, committed before the first run).
//
// Why: tools/diagnose-act.mjs (300 stocks, 2024-10..2026-10) found the badge rule fights itself. ACT needs the oversold
// score >= 65 AND a bounce candle on the SAME day, but a bounce candle lifts RSI and the 5-day return, so the score drops
// ~30 points that very day. Of 2,879 bounce candles right after an oversold day, only 1,116 still scored >= 65; 67% of
// oversold runs on the tested stocks never got an ACT, and 841 of them bounced 1-5 sessions later at a score of ~29.
// The +8% target is NOT what limits the count (it decides the outcome: 53% of trades hit it). The 200 SKIP stocks are
// the other cap: 2 of every 3 stocks can never be ACT.
//
// RULES (fixed here, never retuned after the run). Liquid = Rp 5 B/day over 20 sessions, as live.
//   L  (live)   score >= 65 today AND bounce candle today.
//   W5 (window) score >= 65 on ANY of the last 5 sessions (today included) AND bounce candle today.
//   W5H (shape) W5 AND "the low held": today's low is above the lowest low of the 5 sessions before it (no new low on
//               the bounce day). Pattern read for "selling is done", tested as a sub-rule.
// Trade (all rules): the live plan computed on the bounce day: buy next open, stop min(plan stop, C - 3.5 ATR), target
// C x 1.08, 15 sessions, 0.4% fees, gaps fill at the open. One open trade per stock per rule (non-overlapping).
// Signals 2017-10-01 .. end. Sets: T100 = the 100 tested stocks; N200 = the 200 expansion stocks; O613 = the IDX stocks
// never in the site (used once before for the bounce exits); and T100+N200 from 2022-10-01 (RECENT).
//
// PASS for replacing L with W5 on the site (all must hold):
//   A1 count: W5 makes >= 1.5x the trades of L in O613 and in RECENT.
//   A2 not worse: the EXTRA trades (W5 trades whose signal day is not an L signal) have mean net return >= L's mean
//      in O613 AND in RECENT (the L edge is unproven; this only checks the fix does not dilute it).
//   A3 not worse in time: A2's difference is >= 0 in both halves of O613 (split 2022-01-01) - or within 0.5 pt.
// PASS for unlocking the 200 SKIP stocks (needs A): W5 mean per trade on N200 >= W5 mean on O613 (a fresh, unselected
//   sample), i.e. the 200 are no worse than the market at large.
// PASS for the "low held" pattern as a stronger badge (ACT, low held): W5H minus (W5 without H), mean per trade, > 0
//   with t >= 2 on O613 (Welch), and > 0 on RECENT.
// Not tested here: whether any of it has an EDGE (the bounce rule failed its 10-year and permutation checks). Whatever
// passes stays paper-only on the site, and the site keeps saying so.
//
// Usage: node tools/experiment-act-window.mjs
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, expansionTickers, loadPrices, ROOT, CACHE } from './lib.mjs';
import { scoreCached, sim, bounce, planAt, iso } from './act-funnel.mjs';

const api = loadEngine(), NEW = expansionTickers(), U = universe(api).map(u => u.ticker), S300 = new Set(U);
const OTHER = JSON.parse(fs.readFileSync(path.join(CACHE, 'rank-all.json'), 'utf8')).map(r => r.c).filter(c => !S300.has(c));
const ACT = api.ACT_SCORE, cfg = { targetPct: 8, stopMult: 2.5, horizon: 15, minValueB: 5 }, START = '2017-10-01', RECENT = '2022-10-01', HALF = '2022-01-01';
const pct = (x, d = 2) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN), sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const welch = (a, b) => (mean(a) - mean(b)) / Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);

const px = await loadPrices(U.concat(OTHER).map(t => t + '.JK').concat(['^JKSE']), '10y', true), idx = px['^JKSE'];
const T = [], t0 = Date.now();
let done = 0;
for (const tk of U.concat(OTHER)) {
  const b = px[tk + '.JK']; if (!b || b.c.length < 300) continue;
  const set = !S300.has(tk) ? 'O613' : NEW.has(tk) ? 'N200' : 'T100';
  const S = scoreCached(api, tk, b, idx, cfg, S300.has(tk) ? 45 : 65), sc = k => (S.rows.get(k) || { score: 0 }).score;
  const busy = { L: -1, W5: -1, W5H: -1 };
  for (let k = 256; k < b.c.length - 16; k++) {
    const day = iso(b.d[k]); if (day < START || !S.liq[k] || !bounce(b, k)) continue;
    const L = sc(k) >= ACT, W5 = [0, 1, 2, 3, 4].some(i => sc(k - i) >= ACT);
    if (!W5) continue;
    const held = b.l[k] > Math.min(...b.l.slice(k - 5, k));
    const plan = planAt(api, b, k, idx, cfg); if (!plan) continue;
    const x = sim(b, k, plan.stop, plan.target); if (!x) continue;
    for (const [rule, on] of [['L', L], ['W5', W5], ['W5H', W5 && held]]) {
      if (!on || k <= busy[rule]) continue;
      busy[rule] = x.j1;
      T.push({ tk, set, day, rule, isL: L, held, ret: x.ret, res: x.res });
    }
  }
  if (++done % 100 === 0) console.log(`${done} stocks, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

const pick = (set, rule, f = () => true) => T.filter(t => (set === 'RECENT' ? t.set !== 'O613' && t.day >= RECENT : t.set === set) && t.rule === rule && f(t));
const line = (l, a) => `${l.padEnd(28)} n ${String(a.length).padStart(5)}  mean ${pct(mean(a.map(t => t.ret)))}  win ${pct(a.filter(t => t.ret > 0).length / a.length, 0)}  TP ${pct(a.filter(t => t.res === 'tp').length / a.length, 0)}`;
const out = [], P = s => { out.push(s); console.log(s); };
const summary = {};
for (const set of ['T100', 'N200', 'O613', 'RECENT']) {
  P(`== ${set}`);
  const L = pick(set, 'L'), W = pick(set, 'W5'), X = pick(set, 'W5', t => !t.isL), H = pick(set, 'W5H'), NH = pick(set, 'W5', t => !t.held);
  [['L live', L], ['W5 window', W], ['  W5 extra (not L day)', X], ['W5H low held', H], ['  W5 low not held', NH]].forEach(([l, a]) => P(line(l, a)));
  summary[set] = { L: L.length, W5: W.length, mL: mean(L.map(t => t.ret)), mW: mean(W.map(t => t.ret)), mX: mean(X.map(t => t.ret)), mH: mean(H.map(t => t.ret)), mNH: mean(NH.map(t => t.ret)),
    tH: welch(H.map(t => t.ret), NH.map(t => t.ret)), H: H.length, X: X.length };
}
const o = summary.O613, r = summary.RECENT;
const hx = (f) => mean(pick('O613', 'W5', t => !t.isL && f(t.day)).map(t => t.ret)) - mean(pick('O613', 'L', t => f(t.day)).map(t => t.ret));
const h1 = hx(d => d < HALF), h2 = hx(d => d >= HALF);
const checks = [
  { id: 'A1', rule: 'W5 trades >= 1.5x L in O613 and RECENT', ok: o.W5 >= 1.5 * o.L && r.W5 >= 1.5 * r.L, value: [o.W5 / o.L, r.W5 / r.L] },
  { id: 'A2', rule: 'extra W5 trades mean >= L mean, O613 and RECENT', ok: o.mX >= o.mL && r.mX >= r.mL, value: [o.mX - o.mL, r.mX - r.mL] },
  { id: 'A3', rule: 'A2 difference >= -0.5 pt in both O613 halves', ok: h1 >= -0.005 && h2 >= -0.005, value: [h1, h2] },
];
const A = checks.every(c => c.ok);
const B = A && summary.N200.mW >= o.mW, C = o.mH - o.mNH > 0 && o.tH >= 2 && r.mH - r.mNH > 0;
checks.forEach(c => P(`${c.ok ? 'PASS' : 'fail'} ${c.id} ${c.rule}: ${JSON.stringify(c.value.map ? c.value.map(v => +v.toFixed(4)) : c.value)}`));
P(`${A ? 'PASS' : 'FAIL'}: window rule ${A ? 'replaces' : 'does not replace'} the same-day rule`);
P(`${B ? 'PASS' : 'fail'} unlock 200: N200 W5 ${pct(summary.N200.mW)} vs O613 W5 ${pct(o.mW)}`);
P(`${C ? 'PASS' : 'fail'} low held: O613 ${pct(o.mH - o.mNH)} (t ${o.tH.toFixed(2)}), RECENT ${pct(r.mH - r.mNH)}`);
fs.writeFileSync(path.join(ROOT, 'data', 'act-window-study.json'), JSON.stringify({ asOf: iso(new Date()), lines: out, summary, checks, adopt: A, unlock200: B, lowHeld: C, halves: [h1, h2] }, null, 1));

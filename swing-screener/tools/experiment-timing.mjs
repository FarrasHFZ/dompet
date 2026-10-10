// Is it the TIMING or the KIND of stock? Exploratory, 2026-10-10, nothing adopted.
// experiment-own.mjs found the live rule "beats" same-day random stocks even on SHUFFLED prices (p 0.016 on the 200),
// so that null rewards picking volatile stocks, not timing. Here each live-rule trade is compared with the SAME stock
// entered on random other days of the same half (same % stop and target): only the timing differs.
// Real and shuffled prices, the tested 100 (TICKERS=new for the 200), 10y.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, universe, loadPrices, ROOT, expansionTickers } from './lib.mjs';

const api = loadEngine(), NEW = expansionTickers(), uni = universe(api).filter(u => process.env.TICKERS === 'new' ? NEW.has(u.ticker) : !NEW.has(u.ticker));
const cfg = { targetPct: 8, stopMult: 2.5, horizon: 15 };
const FEE = 0.004, WINDOW = 270, SLOTS = 10, SPLIT = '2022-10-01', iso = d => d.toISOString().slice(0, 10);
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const pct = (x, d = 1) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
let seed = 20261010; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const real = await loadPrices(uni.map(u => u.ticker + '.JK').concat(['^JKSE']), '10y', true);

function sim(b, i0, stop, target) {
  const j0 = i0 + 1, last = j0 + cfg.horizon - 1; if (last >= b.c.length) return null;
  const entry = b.o[j0];
  for (let j = j0; j <= last; j++) {
    if (b.l[j] <= stop) return { ret: Math.min(stop, b.o[j]) / entry - 1 - FEE, j0, j1: j };
    if (b.h[j] >= target) return { ret: Math.max(target, b.o[j]) / entry - 1 - FEE, j0, j1: j };
  }
  return { ret: b.c[last] / entry - 1 - FEE, j0, j1: last };
}

function scan(px) {
  const idx = px['^JKSE'], idxBy = new Map(idx.d.map((d, i) => [iso(d), i]));
  const days = new Map(), sig = [];
  for (const u of uni) {
    const b = px[u.ticker + '.JK']; if (!b || b.c.length < 300) continue;
    for (let k = 250; k < b.c.length - cfg.horizon - 1; k++) {
      const day = iso(b.d[k]), ii = idxBy.get(day); if (ii == null || ii < 200) continue;
      const lo = Math.max(0, k + 1 - WINDOW), s = x => x.slice(lo, k + 1);
      const a = api.analyse_({ d: s(b.d), o: s(b.o), h: s(b.h), l: s(b.l), c: s(b.c), v: s(b.v) }, idx.c.slice(Math.max(0, ii + 1 - WINDOW), ii + 1), cfg);
      if (!a || a.avgValue / 1e9 < 5) continue;
      if (!days.has(day)) days.set(day, []);
      days.get(day).push({ tk: u.ticker, k });
      const score = api.score_(a, 0);
      if (score < api.ACT_SCORE) continue;
      const candle = b.c[k] > b.h[k - 1] || (b.c[k] > b.o[k] && b.c[k] > b.c[k - 1]);
      if (!candle) continue;
      const mOk = idx.c[ii] > idx.c.slice(ii - 199, ii + 1).reduce((x, y) => x + y, 0) / 200;
      const up = a.sma200 != null && a.sma50 != null && b.c[k] > a.sma200 && a.sma50 > a.sma200;
      const stop = api.roundToTick_(Math.min(a.stop, a.entry - 3.5 * a.atr), 'down');
      const tr = sim(b, k, stop, a.target); if (!tr) continue;
      const atrT = sim(b, k, stop, a.entry + 3 * a.atr);
      const entry = b.o[k + 1];
      sig.push({ tk: u.ticker, day, k, score, mOk, up, ...tr, retAtr: atrT ? atrT.ret : null, stopPct: stop / entry - 1, tpPct: a.target / entry - 1 });
    }
  }
  return { sig, days };
}

function nullTest(trades, days, px, runs = 2000) {
  const m = mean(trades.map(t => t.ret)), out = [];
  for (let r = 0; r < runs; r++) {
    let s = 0, n = 0;
    for (const t of trades) {
      const pool = days.get(t.day); if (!pool || pool.length < 2) continue;
      let o; do { o = pool[Math.floor(rnd() * pool.length)]; } while (o.tk === t.tk);
      const b = px[o.tk + '.JK'], e = b.o[o.k + 1];
      const tr = sim(b, o.k, e * (1 + t.stopPct), e * (1 + t.tpPct));
      if (tr) { s += tr.ret; n++; }
    }
    out.push(s / (n || 1));
  }
  out.sort((a, b) => a - b);
  return { mean: m, nullMean: mean(out), p: out.filter(x => x >= m).length / runs };
}

function maxDD(eqs) { let pk = -Infinity, dd = 0; for (const v of eqs) { pk = Math.max(pk, v); dd = Math.min(dd, v / pk - 1); } return dd; }
function account(trades, px, from, to, cy) {
  const dayIdx = new Map(), byDay = new Map();
  trades.forEach(t => { if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push(t); });
  const at = (tk, day) => { if (!dayIdx.has(tk)) dayIdx.set(tk, new Map(px[tk + '.JK'].d.map((d, i) => [iso(d), i]))); return dayIdx.get(tk).get(day); };
  const val = (p, day) => { const i = at(p.tk, day); if (i != null) p.last = p.amt * px[p.tk + '.JK'].c[i] / px[p.tk + '.JK'].o[p.j0]; return p.last; };
  let cash = 1, open = [];
  const daily = [], month = new Map();
  for (const d of px['^JKSE'].d) {
    const day = iso(d); if (day < from || day > to) continue;
    cash *= 1 + cy / 245;
    open = open.filter(p => { if (p.exitDay <= day) { cash += p.amt * (1 + p.ret); return false; } return true; });
    const eq = cash + open.reduce((s, p) => s + val(p, day), 0);
    for (const t of (byDay.get(day) || []).sort((a, b) => b.score - a.score)) {
      if (open.length >= SLOTS || open.some(p => p.tk === t.tk)) continue;
      const amt = Math.min(eq / SLOTS, cash); if (amt <= 0) break;
      cash -= amt;
      open.push({ tk: t.tk, amt, last: amt, j0: t.j0, ret: t.ret, exitDay: iso(px[t.tk + '.JK'].d[t.j1]) });
    }
    const e = cash + open.reduce((s, p) => s + p.last, 0);
    daily.push(e); month.set(day.slice(0, 7), e);
  }
  const m = [...month.values()], r = m.slice(1).map((v, i) => v / m[i] - 1), sd = x => Math.sqrt(mean(x.map(y => (y - mean(x)) ** 2)));
  const down = Math.sqrt(mean(r.map(y => Math.min(0, y) ** 2)));
  return { cagr: Math.pow(daily.at(-1), 245 / daily.length) - 1, dd: maxDD(daily), sharpe: mean(r) / (sd(r) || 1) * Math.sqrt(12), sortino: mean(r) / (down || 1) * Math.sqrt(12) };
}
const pf = tr => { const g = tr.filter(t => t.ret > 0).reduce((s, t) => s + t.ret, 0), l = -tr.filter(t => t.ret < 0).reduce((s, t) => s + t.ret, 0); return l ? g / l : null; };

function shuffled(b) {
  const n = b.c.length, idxs = [...Array(n - 1).keys()].map(i => i + 1);
  for (let i = idxs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idxs[i], idxs[j]] = [idxs[j], idxs[i]]; }
  const o = [b.o[0]], h = [b.h[0]], l = [b.l[0]], c = [b.c[0]], v = [b.v[0]];
  idxs.forEach(i => { const p = c.at(-1), base = b.c[i - 1]; o.push(p * b.o[i] / base); h.push(p * b.h[i] / base); l.push(p * b.l[i] / base); c.push(p * b.c[i] / base); v.push(b.v[i]); });
  return { d: b.d, o, h, l, c, v };
}
// same stock, random day in the same half (any liquid day, filter state ignored)
function timingNull(trades, px, from, to, runs = 2000) {
  const m = mean(trades.map(t => t.ret)), out = [];
  const range = {};
  for (const t of trades) if (!range[t.tk]) { const b = px[t.tk + '.JK']; const ks = b.d.map((d, i) => [iso(d), i]).filter(([d, i]) => d >= from && d <= to && i >= 250 && i < b.c.length - cfg.horizon - 1).map(x => x[1]); range[t.tk] = ks; }
  for (let r = 0; r < runs; r++) {
    let s = 0, n = 0;
    for (const t of trades) {
      const ks = range[t.tk]; if (!ks.length) continue;
      const k = ks[Math.floor(rnd() * ks.length)], b = px[t.tk + '.JK'], e = b.o[k + 1];
      const tr = sim(b, k, e * (1 + t.stopPct), e * (1 + t.tpPct)); if (tr) { s += tr.ret; n++; }
    }
    out.push(s / (n || 1));
  }
  return { mean: m, nullMean: mean(out), p: out.filter(x => x >= m).length / runs };
}
const out = {};
for (const [label, px] of [['real', real], ['shuffled', Object.fromEntries(Object.entries(real).filter(([, b]) => b).map(([k, b]) => [k, shuffled(b)]))]]) {
  const R = scan(px), all = [...R.days.keys()].sort();
  for (const [h, from, to] of [['2017-10', all[0], '2022-09-30'], ['2022-10', SPLIT, all.at(-1)], ['all', all[0], all.at(-1)]]) {
    const tr = R.sig.filter(x => x.mOk && x.day >= from && x.day <= to);
    const sn = nullTest(tr, R.days, px, 1000), tn = timingNull(tr, px, from, to, 1000);
    out[label + ' ' + h] = { n: tr.length, mean: sn.mean, sameDayRandomStock: sn.nullMean, pStock: sn.p, sameStockRandomDay: tn.nullMean, pTiming: tn.p };
    console.log(`${label.padEnd(8)} ${h.padEnd(7)} live trades ${String(tr.length).padStart(4)}  mean ${pct(sn.mean, 2).padStart(7)} | random stock same day ${pct(sn.nullMean, 2).padStart(7)} p ${sn.p.toFixed(3)} | same stock random day ${pct(tn.nullMean, 2).padStart(7)} p ${tn.p.toFixed(3)}`);
  }
}
fs.writeFileSync(path.join(ROOT, 'data', 'timing-study' + (process.env.TICKERS === 'new' ? '-new' : '') + '.json'), JSON.stringify(out, null, 1));

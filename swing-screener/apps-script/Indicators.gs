// Pure indicator maths. No Sheets calls in here, so it can be unit-tested in Node.
// A "bars" object is column-oriented: {d, o, h, l, c, v}, oldest first.

function sma_(arr, n, end) {
  end = end === undefined ? arr.length - 1 : end;
  if (end + 1 < n) return null;
  let s = 0;
  for (let i = end - n + 1; i <= end; i++) s += arr[i];
  return s / n;
}

function rsi_(c, n) {
  n = n || 14;
  if (c.length <= n) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const ch = c[i] - c[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  gain /= n; loss /= n;
  for (let i = n + 1; i < c.length; i++) {
    const ch = c[i] - c[i - 1];
    gain = (gain * (n - 1) + Math.max(ch, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-ch, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

// Wilder ATR, returns the whole series (null until warmed up).
function atrSeries_(b, n) {
  n = n || 14;
  const out = new Array(b.c.length).fill(null);
  if (b.c.length <= n) return out;
  const tr = [b.h[0] - b.l[0]];
  for (let i = 1; i < b.c.length; i++) {
    tr.push(Math.max(b.h[i] - b.l[i], Math.abs(b.h[i] - b.c[i - 1]), Math.abs(b.l[i] - b.c[i - 1])));
  }
  let a = 0;
  for (let i = 1; i <= n; i++) a += tr[i];
  a /= n;
  out[n] = a;
  for (let i = n + 1; i < tr.length; i++) {
    a = (a * (n - 1) + tr[i]) / n;
    out[i] = a;
  }
  return out;
}

// IDX tick size (fraksi harga) for the regular board.
function tickSize_(p) {
  if (p < 200) return 1;
  if (p < 500) return 2;
  if (p < 2000) return 5;
  if (p < 5000) return 10;
  return 25;
}

function roundToTick_(p, mode) {
  const t = tickSize_(p);
  const q = p / t;
  const r = mode === 'down' ? Math.floor(q) : mode === 'up' ? Math.ceil(q) : Math.round(q);
  return r * t;
}

// Swing highs/lows (fractal pivots) clustered into S/R zones.
// Returns [{price, touches, lastIdx}] sorted by price.
function findLevels_(b, atr, opts) {
  opts = opts || {};
  const win = opts.window || 5;
  const lookback = opts.lookback || 160;
  const n = b.c.length;
  const start = Math.max(win, n - lookback);
  const tol = Math.max((atr || 0) * 0.6, b.c[n - 1] * 0.008);
  const pts = [];
  for (let i = start; i < n - win; i++) {
    let isHigh = true, isLow = true;
    for (let k = 1; k <= win; k++) {
      if (b.h[i] < b.h[i - k] || b.h[i] < b.h[i + k]) isHigh = false;
      if (b.l[i] > b.l[i - k] || b.l[i] > b.l[i + k]) isLow = false;
    }
    if (isHigh) pts.push({ price: b.h[i], idx: i });
    if (isLow) pts.push({ price: b.l[i], idx: i });
  }
  pts.sort((x, y) => x.price - y.price);
  const clusters = [];
  pts.forEach(p => {
    const last = clusters[clusters.length - 1];
    if (last && p.price - last.sum / last.touches <= tol) {
      last.sum += p.price; last.touches++; last.lastIdx = Math.max(last.lastIdx, p.idx);
    } else {
      clusters.push({ sum: p.price, touches: 1, lastIdx: p.idx });
    }
  });
  return clusters.map(c => ({ price: c.sum / c.touches, touches: c.touches, lastIdx: c.lastIdx }));
}

// Nearest support below and resistance above the last close.
function pickSupportResistance_(b, levels) {
  const n = b.c.length;
  const close = b.c[n - 1];
  const gap = close * 0.003;
  const below = levels.filter(l => l.price < close - gap);
  const above = levels.filter(l => l.price > close + gap);
  const hi52 = Math.max.apply(null, b.h.slice(-250));
  const lo52 = Math.min.apply(null, b.l.slice(-250));
  const sup = below.length ? below[below.length - 1] : { price: lo52, touches: 0 };
  const res = above.length ? above[0] : { price: hi52, touches: 0 };
  return {
    support: roundToTick_(sup.price, 'down'), supportTouches: sup.touches,
    resistance: roundToTick_(res.price, 'up'), resistanceTouches: res.touches,
    hi52: hi52, lo52: lo52,
  };
}

// Triple-barrier history: from each past day, did +target% hit before the ATR stop within `horizon` bars?
// A bar that touches the stop counts as a loss even if it also touched the target (conservative).
function tripleBarrier_(b, atr, targetPct, stopMult, horizon, condFn) {
  let win = 0, loss = 0, timeout = 0;
  const lastStart = b.c.length - horizon - 1;
  for (let i = 50; i <= lastStart; i++) {
    if (atr[i] === null) continue;
    if (condFn && !condFn(i)) continue;
    const entry = b.c[i];
    const tgt = entry * (1 + targetPct / 100);
    const stp = entry - stopMult * atr[i];
    let res = 'timeout';
    for (let j = i + 1; j <= i + horizon; j++) {
      if (b.l[j] <= stp) { res = 'loss'; break; }
      if (b.h[j] >= tgt) { res = 'win'; break; }
    }
    if (res === 'win') win++; else if (res === 'loss') loss++; else timeout++;
  }
  const n = win + loss + timeout;
  return { win: win, loss: loss, timeout: timeout, n: n, rate: n ? win / n : null };
}

// Every metric the screener needs from one ticker's bars.
// cfg: {targetPct, stopMult, horizon}. idxCloses: IHSG closes (oldest first) or null.
function analyse_(b, idxCloses, cfg) {
  const n = b.c.length;
  if (n < 80) return null;
  const c = b.c, close = c[n - 1];
  const atrS = atrSeries_(b, 14);
  const atr = atrS[n - 1];
  const sma20 = sma_(c, 20), sma50 = sma_(c, 50), sma200 = sma_(c, 200);
  const rsi = rsi_(c, 14);
  const ret = k => (n > k ? close / c[n - 1 - k] - 1 : null);

  let valueSum = 0;
  const w = Math.min(20, n);
  for (let i = n - w; i < n; i++) valueSum += c[i] * b.v[i];
  const avgValue = valueSum / w;
  const avgVol20 = sma_(b.v, 20);
  const volRatio = avgVol20 ? b.v[n - 1] / avgVol20 : null;

  let rs3m = null;
  if (idxCloses && idxCloses.length > 63) {
    const m = idxCloses.length;
    rs3m = ret(63) - (idxCloses[m - 1] / idxCloses[m - 64] - 1);
  }

  const sr = pickSupportResistance_(b, findLevels_(b, atr));
  const hiBreak = Math.max.apply(null, b.h.slice(-21, -1));
  const breakout = close > hiBreak && volRatio !== null && volRatio >= 1.3;

  const trendUp = sma50 !== null && close > sma20 && sma20 > sma50 && (sma200 === null || sma50 > sma200);
  const trend = trendUp ? 'UP' : (sma50 !== null && close < sma50 && sma20 < sma50 ? 'DOWN' : 'SIDEWAYS');

  const hrAll = tripleBarrier_(b, atrS, cfg.targetPct, cfg.stopMult, cfg.horizon, null);
  const hrTrend = tripleBarrier_(b, atrS, cfg.targetPct, cfg.stopMult, cfg.horizon, i => {
    const s = sma_(c, 50, i);
    return s !== null && c[i] > s;
  });
  const hr = hrTrend.n >= 20 ? hrTrend : hrAll;

  // Trade plan: stop just under support when support is close, else a pure ATR stop.
  const atrStop = close - cfg.stopMult * atr;
  const useSupport = sr.support > atrStop && sr.support > close - 3 * atr;
  const stop = roundToTick_(useSupport ? sr.support - 0.5 * atr : atrStop, 'down');
  const target = roundToTick_(close * (1 + cfg.targetPct / 100), 'up');
  const risk = close - stop;
  const rr = risk > 0 ? (target - close) / risk : null;
  const roomToRes = sr.resistance / close - 1;

  // Backtests (tools/backtest.mjs): the oversold bounce is the only setup with a consistent edge. Breakout and
  // Extended underperformed on the 27 design stocks but did BETTER on 73 unseen ones, so they are labels, not verdicts.
  const dist20Atr = sma20 !== null && atr ? (close - sma20) / atr : 0;
  const os = oversold_(rsi, ret(5), dist20Atr);
  let setup = 'Neutral';
  if (os >= 0.5) setup = 'Oversold bounce';
  else if (breakout) setup = 'Breakout';
  else if ((rsi !== null && rsi > 65) || dist20Atr > 2) setup = 'Extended';

  return {
    close: close, chg1d: ret(1), chg5d: ret(5), chg20d: ret(20), atr: atr, atrPct: atr / close,
    sma20: sma20, sma50: sma50, sma200: sma200, rsi: rsi, volRatio: volRatio,
    avgValue: avgValue, rs3m: rs3m, trend: trend, breakout: breakout, setup: setup,
    support: sr.support, supportTouches: sr.supportTouches,
    resistance: sr.resistance, resistanceTouches: sr.resistanceTouches,
    hi52: sr.hi52, lo52: sr.lo52, roomToRes: roomToRes, dist20Atr: dist20Atr, oversold: os,
    targetMR: sma20 === null ? null : roundToTick_(sma20, 'up'),
    entry: close, stop: stop, target: target, rr: rr,
    hitRate: hr.rate, hitN: hr.n, hitWin: hr.win, hitLoss: hr.loss,
  };
}

// 0..1 oversold-ness from RSI, 5-day drop and distance below the 20-day average (in ATRs).
// Cut-offs come from the decile tables in tools/deciles.mjs: the bounce edge sits in RSI<35, 5d<-5%, >2 ATR below SMA20.
function oversold_(rsi, ret5, dist20Atr) {
  const lin = x => Math.max(0, Math.min(1, x));
  const r = rsi === null ? 0 : lin((45 - rsi) / 17);
  const d = ret5 === null ? 0 : lin((-0.01 - ret5) / 0.07);
  const k = lin((-0.5 - dist20Atr) / 2.5);
  return 0.35 * r + 0.30 * d + 0.35 * k;
}

// 0-100 composite, returned per component so the UI can show why a stock scored what it did.
// newsScore is roughly -3..+3 (see News.gs). news is the only component NOT backtested (no news archive).
function scoreParts_(a, newsScore) {
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const p = {};
  p.oversold = 80 * a.oversold;
  p.support = a.atr ? 10 * clamp((4 - (a.entry - a.support) / a.atr) / 3, 0, 1) : 0; // close to support = tight, logical stop
  p.news = clamp(5 + (newsScore || 0) * 1.7, 0, 10);
  return p;
}

function score_(a, newsScore) {
  const p = scoreParts_(a, newsScore);
  return Math.round(p.oversold + p.support + p.news);
}

// Template narrative built only from computed facts (an LLM version is Phase 2).
function narrative_(t, a, newsScore, topHeadline, cfg) {
  const pct = x => (x === null ? 'n/a' : (x * 100).toFixed(1) + '%');
  const fmt = x => Math.round(x).toLocaleString('en-US');
  const parts = [];
  parts.push(t + ' ' + fmt(a.close) + ' (' + pct(a.chg1d) + ' 1D, ' + pct(a.chg5d) + ' 5D). Trend ' + a.trend.toLowerCase() +
    (a.rsi !== null ? ', RSI ' + a.rsi.toFixed(0) : '') + ', ' + a.dist20Atr.toFixed(1) + ' ATR from the 20d average. Setup: ' + a.setup + '.');
  parts.push('Support ' + fmt(a.support) + (a.supportTouches ? ' (' + a.supportTouches + ' touches)' : '') +
    ', resistance ' + fmt(a.resistance) + ' (+' + pct(a.roomToRes) + ')' +
    (a.roomToRes * 100 < cfg.targetPct ? ' sits below the +' + cfg.targetPct + '% target, so upside is capped until it breaks.' : ' leaves room to the target.'));
  if (a.setup === 'Oversold bounce' && a.targetMR) parts.push('Bounce target (20d average) ' + fmt(a.targetMR) + ' (' + pct(a.targetMR / a.close - 1) + ').');
  parts.push('Plan: stop ' + fmt(a.stop) + ', target ' + fmt(a.target) + ', R/R ' + (a.rr === null ? 'n/a' : a.rr.toFixed(1)) + '.');
  if (a.hitRate !== null) {
    parts.push('History: +' + cfg.targetPct + '% before the stop within ' + cfg.horizon + 'd happened ' + pct(a.hitRate) + ' of the time (n=' + a.hitN + ').');
  }
  if (topHeadline) parts.push('News: ' + (newsScore > 0 ? '[+] ' : newsScore < 0 ? '[-] ' : '[=] ') + topHeadline);
  return parts.join(' ');
}

const ACT_SCORE = 65;

// One ticker's full record: the same object feeds the Sheet's JSON API and the GitHub snapshot, so both UIs match.
// nw: {score, top, items[]} from scoreNews_. own: ownership summary or null.
function buildPick_(u, b, a, nw, own, cfg) {
  const parts = scoreParts_(a, nw.score);
  const score = score_(a, nw.score);
  const items = nw.items.slice().sort((x, y) => Math.abs(y.sentiment * y.share) - Math.abs(x.sentiment * x.share)).slice(0, 4)
    .map(i => ({ title: i.title, link: i.link, category: i.category, sentiment: i.sentiment, direct: i.share === 1, published: new Date(i.published).toISOString() }));
  // No SKIP bucket: 'do not chase' held on the 27 design stocks but reversed on 73 unseen ones (tools/backtest.mjs HOLDOUT=1).
  const action = score >= ACT_SCORE ? 'ACT' : 'WATCH';
  const round1 = v => Math.round(v * 10) / 10;
  const partsOut = {};
  Object.keys(parts).forEach(k => { partsOut[k] = round1(parts[k]); });
  const n = b.c.length;
  return {
    ticker: u.ticker, name: u.name, sector: u.sector, action: action, score: score, parts: partsOut,
    setup: a.setup, trend: a.trend, close: a.close, chg1d: a.chg1d, chg5d: a.chg5d, chg20d: a.chg20d, rsi: a.rsi, rs3m: a.rs3m,
    dist20Atr: a.dist20Atr, volRatio: a.volRatio, valueB: a.avgValue / 1e9, atrPct: a.atrPct,
    support: a.support, supportTouches: a.supportTouches, resistance: a.resistance, resistanceTouches: a.resistanceTouches,
    sma20: a.sma20, sma50: a.sma50, sma200: a.sma200, hi52: a.hi52, lo52: a.lo52,
    entry: a.entry, stop: a.stop, target: a.target, targetMR: a.targetMR, rr: a.rr, roomToRes: a.roomToRes,
    hitRate: a.hitRate, hitN: a.hitN, newsScore: round1(nw.score), headlines: items,
    narrative: narrative_(u.ticker, a, nw.score, nw.top, cfg),
    spark: b.c.slice(-90).map(x => Math.round(x * 100) / 100),
    sparkFrom: new Date(b.d[Math.max(0, n - 90)]).toISOString().slice(0, 10), sparkTo: new Date(b.d[n - 1]).toISOString().slice(0, 10),
    ownership: own || null,
  };
}

// Market-wide read: the backtest edge lives in broad capitulation, not in a lone oversold stock.
function marketRead_(picks, idxCloses) {
  const hot = picks.filter(p => p.score >= ACT_SCORE).length;
  const m = {
    breadth: picks.length ? hot / picks.length : 0, oversoldCount: hot, of: picks.length,
    idxClose: idxCloses ? idxCloses[idxCloses.length - 1] : null,
    idxRsi: idxCloses ? rsi_(idxCloses.slice(-120), 14) : null,
    idxChg20d: idxCloses && idxCloses.length > 21 ? idxCloses[idxCloses.length - 1] / idxCloses[idxCloses.length - 22] - 1 : null,
  };
  m.regime = m.breadth >= 0.3 ? 'Broad capitulation' : m.breadth >= 0.15 ? 'Pockets of weakness' : 'Isolated';
  return m;
}

// Bandarmetrics read of one stock on one day. Pure functions, used by the backtest (tools/experiment-bm.mjs) and the live
// build, so both read the data the same way. Inputs come from tools/bm-pull.js (data/bm-history.json, local only):
//   l = LPM (Liquidity Pressure Model, cumulative pressure from large transactions; BM reads its SLOPE, never its level)
//   i = Intensity (how aggressively large orders are being split today; a spike is TIMING, never direction)
//   v = Volume Rotation (efficiency of the transfer: <=3 efficient/green, <=7 fading/yellow, >7 churn/red; BM's own bands)
//   m = Money Flow (cumulative top buyer/seller flow; the short-term lens for locally-driven stocks)
// plus IDX daily foreign buy/sell (data/idx-foreign-flow.json) for the foreign lens and price change.
//
// BM's framework, as published in its "Panduan Kombinasi Indikator": LPM decides direction and wins every conflict;
// the flow lens (Foreign Flow if the stock is foreign-driven, else Money Flow) confirms; Intensity says when; Volume
// Rotation says how healthy. Thresholds below are ours, fixed on 2026-10-09 before the backtest ran (BM_MODEL_V = 1).
export const BM_MODEL_V = 1;
const Z_DIR = 0.25;          // LPM 20-session change, in std devs of its own past year, needed to call a direction
const SPIKE_PCT = 0.9;       // Intensity spike = any of the last 3 sessions above the 90th percentile of the prior 120
const PAR_F = 0.25, CORR_F = 0.5; // foreign-driven: foreign participation >= 25% and return~net-foreign correlation >= 0.5

const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const pct = (a, p) => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const pear = (x, y) => { const mx = mean(x), my = mean(y); let a = 0, b = 0, c = 0; for (let k = 0; k < x.length; k++) { a += (x[k] - mx) * (y[k] - my); b += (x[k] - mx) ** 2; c += (y[k] - my) ** 2; } return b && c ? a / Math.sqrt(b * c) : null; };
export const vrBand = v => (v == null ? null : v <= 3 ? 'green' : v <= 7 ? 'yellow' : 'red');

// Foreign profile from IDX rows [close, volume, value, freq, foreignBuy, foreignSell] for the sessions up to the day.
export function foreignProfile(rows) {
  const last = rows.slice(-180).filter(Boolean);
  if (last.length < 60) return null;
  let fb = 0, fs = 0, vol = 0; last.forEach(r => { fb += r[4]; fs += r[5]; vol += r[1]; });
  const parF = vol ? (fb + fs) / (2 * vol) : null;
  const w = rows.slice(-121).filter(Boolean), ret = [], net = [];
  for (let k = 1; k < w.length; k++) { ret.push(w[k][0] / w[k - 1][0] - 1); net.push((w[k][4] - w[k][5]) * w[k][0]); }
  const corrF = ret.length > 40 ? pear(ret, net) : null;
  const net10 = rows.slice(-10).filter(Boolean).reduce((s, r) => s + (r[4] - r[5]) * r[0], 0);
  return { parF, corrF, driven: parF != null && corrF != null && parF >= PAR_F && corrF >= CORR_F, net10 };
}

// s: {d, l, i, v, m} arrays; t: index of the signal day in s.d; px: { chg20 } price change over 20 sessions;
// fp: foreignProfile() for the same day (optional). Uses data up to and including t only.
export function bmRead(s, t, px = {}, fp = null) {
  if (t < 140 || s.l[t] == null) return null;
  const d20 = s.l[t] - s.l[t - 20], d10 = s.l[t] - s.l[t - 10];
  const hist = []; for (let k = Math.max(20, t - 250); k < t; k++) if (s.l[k] != null && s.l[k - 20] != null) hist.push(s.l[k] - s.l[k - 20]);
  const z = hist.length > 60 && sd(hist) ? d20 / sd(hist) : null;
  const lpm = z == null ? 'unknown' : z >= Z_DIR ? 'rising' : z <= -Z_DIR ? 'falling' : 'flat';
  const prior = s.i.slice(Math.max(0, t - 122), t - 2).filter(x => x != null);
  const p90 = prior.length >= 60 ? pct(prior, SPIKE_PCT) : null;
  const spike = p90 != null && s.i.slice(t - 2, t + 1).some(x => x != null && x > p90);
  const vr = s.v[t], band = vrBand(vr);
  const mf10 = s.m[t] != null && s.m[t - 10] != null ? s.m[t] - s.m[t - 10] : null;
  const lens = fp && fp.driven ? 'foreign' : 'money flow';
  const lensD = lens === 'foreign' ? fp.net10 : mf10;
  const lensDir = lensD == null ? 'n/a' : lensD > 0 ? 'up' : lensD < 0 ? 'down' : 'flat';
  const chg20 = px.chg20 ?? null;

  let read;
  if (lpm === 'rising') read = lensDir === 'up' ? 'ACCUM_CONFIRMED' : 'ACCUM_BUILDING';
  else if (lpm === 'falling') read = chg20 != null && chg20 > 0.05 ? 'HIDDEN_DISTRIBUTION' : lensDir === 'down' ? 'DISTRIB_CONFIRMED' : 'DISTRIB_STARTING';
  else if (lpm === 'flat') read = band === 'red' ? 'CHURN' : 'FLAT';
  else read = 'UNKNOWN';
  const quiet = lpm === 'rising' && chg20 != null && chg20 <= 0; // BM's bullish divergence: pressure ahead of price

  return {
    v: BM_MODEL_V, read, lpm, lpmUp20: d20 > 0, lpmUp10: d10 > 0, lpmZ: z, quiet, spike, vr, band,
    lens, lensDir, foreignDriven: !!(fp && fp.driven), parF: fp ? fp.parF : null, corrF: fp ? fp.corrF : null,
  };
}

// Public, direction-only summary (no Bandarmetrics numbers leave the machine).
export function bmPublic(r) {
  if (!r) return null;
  return { v: r.v, read: r.read, lpm: r.lpm, quiet: r.quiet, spike: r.spike, band: r.band, lens: r.lens, lensDir: r.lensDir, foreignDriven: r.foreignDriven };
}

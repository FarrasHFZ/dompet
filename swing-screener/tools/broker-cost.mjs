// Broker cost lines: who accumulated a stock since its last volume peak, at what average price, and are they still
// holding? Pure functions over one stock's NeoBDM broker inventory (tools/nb-inv-pull.js -> data/nb-inventory.json:
// per broker daily [lots bought, value bought (Rp million), lots sold, value sold]).
//
// Read at session t (uses data up to t only):
//   peak    = the highest-volume session in the last 60 (the climax where a campaign usually shows itself)
//   window  = peak .. t
//   per broker over the window: net lots = bought - sold; average BUY price = value bought / shares bought
//   accumulators = net buyers, largest first; the cost line = average buy price of the top 3 accumulators
//   concentration: 'one broker' (top 1 has >= 50% of all net buying), 'a few' (top 3 >= 70%), else 'broad'
//   status of the top 3 over the last 5 sessions: 'adding' (net >= +5% of their window net), 'unloading'
//   (<= -25%), else 'holding'
// CLI: node tools/broker-cost.mjs   -> data/broker-cost-tags.json (public: price levels, shares, broker codes, names,
//      classes; the user asked for broker names on 2026-10-10) and data/broker-cost-local.json (git-ignored: full detail)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';
import { classOf } from './broker-directory.mjs';

// Broker class from the directory (tools/broker-directory.mjs): retail / foreign / mixed / local.
export const brokerType = classOf;
const NAMES = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'idx-brokers.json'), 'utf8')); } catch { return {}; } })();
// Who drives the buying: the accumulators' shares by class. A single non-retail broker with half of all net buying is
// the classic bandar footprint.
export function driver(top, classShare) {
  const sh = c => classShare[c] || 0, lead = top[0];
  if (lead && lead.type !== 'retail' && lead.type !== 'mixed' && lead.share >= 0.5) return lead.type === 'foreign' ? 'one foreign institution' : 'one local player (bandar-style)';
  if (sh('retail') >= 0.6) return 'retail crowd';
  if (sh('foreign') >= 0.6) return 'foreign institutions';
  if (sh('local') >= 0.6) return 'local brokers';
  return 'mixed';
}
const LOOK = 60;

export function costRead(rec, t) {
  if (!rec || !rec.d || t < 20 || t >= rec.d.length) return null;
  const lo = Math.max(0, t - LOOK + 1);
  let peak = lo; for (let k = lo; k <= t; k++) if ((rec.v[k] || 0) > (rec.v[peak] || 0)) peak = k;
  const avgVol = rec.v.slice(lo, t + 1).reduce((s, x) => s + (x || 0), 0) / (t - lo + 1);
  let volLots = 0; for (let k = peak; k <= t; k++) volLots += (rec.v[k] || 0) / 100;
  const rows = Object.entries(rec.b).map(([code, [bl, bv, sl, sv]]) => {
    let b = 0, v = 0, s = 0, last5 = 0;
    for (let k = peak; k <= t; k++) { b += bl[k] || 0; v += bv[k] || 0; s += sl[k] || 0; }
    for (let k = Math.max(peak, t - 4); k <= t; k++) last5 += (bl[k] || 0) - (sl[k] || 0);
    // Still held since the peak, and its cost: walk the days from the peak, netted per day; a net-buying day adds lots
    // at that day's average buy price, a net-selling day removes lots and keeps the average (as posRead does).
    let L = 0, A = 0;
    for (let k = peak; k <= t; k++) {
      const n = (bl[k] || 0) - (sl[k] || 0);
      if (n > 0 && bl[k]) { const pb = (bv[k] * 1e6) / (bl[k] * 100); A = (L * A + n * pb) / (L + n); L += n; } else if (n < 0) L = Math.max(0, L + n);
    }
    return { code, type: brokerType(code), net: b - s, bought: b, value: v, avg: b ? (v * 1e6) / (b * 100) : null, last5, held: L, heldAvg: L > 0 ? A : null };
  });
  const acc = rows.filter(r => r.net > 0).sort((a, b) => b.net - a.net);
  if (!acc.length || !volLots) return { peakDay: rec.d[peak], days: t - peak + 1, none: true };
  const posNet = acc.reduce((s, r) => s + r.net, 0), top = acc.slice(0, 3);
  const topNet = top.reduce((s, r) => s + r.net, 0), topBought = top.reduce((s, r) => s + r.bought, 0), topValue = top.reduce((s, r) => s + r.value, 0);
  const cost = topBought ? (topValue * 1e6) / (topBought * 100) : null, last5 = top.reduce((s, r) => s + r.last5, 0);
  const share1 = acc[0].net / posNet, share3 = topNet / posNet;
  const close = rec.c[t];
  const out = {
    day: rec.d[t], peakDay: rec.d[peak], peakX: avgVol ? (rec.v[peak] || 0) / avgVol : null, days: t - peak + 1,
    cost, close, gap: cost && close ? close / cost - 1 : null,
    netShare: topNet / volLots, // top-3 accumulators' net lots as a share of all lots traded since the peak
    conc: share1 >= 0.5 ? 'one broker' : share3 >= 0.7 ? 'a few brokers' : 'broad',
    status: last5 >= 0.05 * topNet ? 'adding' : last5 <= -0.25 * topNet ? 'unloading' : 'holding',
    top: top.map(r => ({ code: r.code, name: NAMES[r.code] || null, type: r.type, net: r.net, avg: r.avg, share: r.net / posNet })),
  };
  // Every broker that is a net buyer since the peak: lots still held = its net since the peak (capped by the running
  // holding), at the running average cost of what it holds. Net sellers since the peak hold nothing bought after it.
  const hold = rows.filter(r => r.net > 0 && r.heldAvg).map(r => ({ ...r, held: Math.min(r.held, r.net) })).sort((a, b) => b.held - a.held); // net buyers since the peak only
  const hTot = hold.reduce((s, r) => s + r.held, 0);
  out.since = { lots: hTot, avg: hTot ? hold.reduce((s, r) => s + r.held * r.heldAvg, 0) / hTot : null,
    brokers: hold.slice(0, 8).map(r => ({ code: r.code, name: NAMES[r.code] || null, type: r.type, lots: r.held, avg: r.heldAvg, net: r.net })) };
  out.classShare = Object.fromEntries(['retail', 'foreign', 'mixed', 'local'].map(c => [c, +(acc.filter(r => r.type === c).reduce((s, r) => s + r.net, 0) / posNet).toFixed(3)]));
  out.driver = driver(out.top, out.classShare);
  return out;
}

// Broker positions now: how much each broker holds that it built inside the data window, at what average cost, and
// whether that position is in profit. Per broker, the running net (lots bought - lots sold) is walked from the session
// where it was LOWEST (its inventory low) to today: the lots built since then are still held. Their cost is a running
// average: a day with net buying adds those lots at that day's average buy price; a day with net selling removes lots
// at the current average (the cost of what is left does not change). Days are netted, so intraday round trips are not
// a position. Only brokers among the stock's most active ~20 are seen, and only since the first day of data: a
// position built before that is invisible ('fromStart' marks a low on the first day: the real position may be bigger).
// A broker code is a trading desk for many clients, not one owner. Context only, not a tested signal.
export function posRead(rec, t = rec.d.length - 1, min = 0.002) {
  if (!rec || !rec.d || t < 20) return null;
  const close = rec.c[t], lo60 = Math.max(0, t - 59);
  const adv = rec.v.slice(lo60, t + 1).reduce((s, x) => s + (x || 0), 0) / (t - lo60 + 1) / 100; // avg lots a day
  const rows = [];
  for (const [code, [bl, bv, sl]] of Object.entries(rec.b)) {
    let cum = 0, low = 0, kLow = -1, high = 0, kHigh = -1;
    const net = [];
    for (let k = 0; k <= t; k++) { cum += (bl[k] || 0) - (sl[k] || 0); net.push(cum); if (cum < low) { low = cum; kLow = k; } if (cum > high) { high = cum; kHigh = k; } }
    const held = cum - low, sold = high - cum; // built since the low; unloaded since the high
    let L = 0, A = 0;
    for (let k = kLow + 1; k <= t; k++) {
      const n = (bl[k] || 0) - (sl[k] || 0);
      if (n > 0 && bl[k]) { const pb = (bv[k] * 1e6) / (bl[k] * 100); A = (L * A + n * pb) / (L + n); L += n; } else if (n < 0) L = Math.max(0, L + n);
    }
    rows.push({ code, name: NAMES[code] || null, type: brokerType(code), lots: held, avg: held > 0 && A ? A : null, since: rec.d[kLow + 1] || rec.d[0], fromStart: kLow < 0,
      sold, soldSince: rec.d[Math.max(0, kHigh)], last5: net[t] - net[Math.max(0, t - 5)], last20: net[t] - net[Math.max(0, t - 20)] });
  }
  const tot = rows.reduce((s, r) => s + r.lots, 0) || 1;
  const fmt = r => ({ code: r.code, name: r.name, type: r.type, lots: Math.round(r.lots), rpB: +((r.lots * 100 * close) / 1e9).toFixed(1), avg: r.avg && Math.round(r.avg),
    pl: r.avg ? +(close / r.avg - 1).toFixed(4) : null, plB: r.avg ? +((r.lots * 100 * (close - r.avg)) / 1e9).toFixed(1) : null, since: r.since, fromStart: r.fromStart,
    days: adv ? +(r.lots / adv).toFixed(1) : null, last5: Math.round(r.last5), last20: Math.round(r.last20) });
  const holders = rows.filter(r => r.lots >= min * tot && r.avg).sort((a, b) => b.lots * 1 - a.lots * 1).slice(0, 8).map(fmt);
  const sellers = rows.filter(r => r.sold > 0).sort((a, b) => b.sold - a.sold).slice(0, 3)
    .map(r => ({ code: r.code, name: r.name, type: r.type, lots: Math.round(r.sold), rpB: +((r.sold * 100 * close) / 1e9).toFixed(1), since: r.soldSince }));
  return { day: rec.d[t], from: rec.d[0], close, advLots: Math.round(adv), holders, sellers };
}

// The rule the study tests (and the site marks): meaningful accumulation, not being unloaded, price near their cost.
export const supported = r => !!(r && !r.none && r.netShare >= 0.05 && r.status !== 'unloading' && r.gap != null && Math.abs(r.gap) <= 0.05);

if (process.argv[1] && path.basename(process.argv[1]) === 'broker-cost.mjs') {
  const INV = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-inventory.json'), 'utf8'));
  const pub = {}, loc = {}; let asOf = '';
  for (const [tk, rec] of Object.entries(INV)) {
    const r = costRead(rec, rec.d.length - 1); if (!r) continue;
    asOf = r.day > asOf ? r.day : asOf;
    loc[tk] = r;
    pub[tk] = r.none ? { day: r.day || rec.d.at(-1), peakDay: r.peakDay, none: true } : {
      day: r.day, peakDay: r.peakDay, peakX: r.peakX && +r.peakX.toFixed(1), days: r.days, cost: Math.round(r.cost), gap: +r.gap.toFixed(4),
      netShare: +r.netShare.toFixed(3), conc: r.conc, status: r.status, supported: supported(r), driver: r.driver, classShare: r.classShare,
      top: r.top.map(x => ({ code: x.code, name: x.name, type: x.type, share: +x.share.toFixed(2), avg: x.avg && Math.round(x.avg) })),
    };
    if (r.since) pub[tk].since = { lots: Math.round(r.since.lots), avg: r.since.avg && Math.round(r.since.avg),
      brokers: r.since.brokers.map(x => ({ code: x.code, name: x.name, type: x.type, lots: Math.round(x.lots), avg: Math.round(x.avg), net: Math.round(x.net) })) };
    const ps = posRead(rec);
    if (ps) pub[tk].pos = ps;
  }
  fs.writeFileSync(path.join(ROOT, 'data', 'broker-cost-tags.json'), JSON.stringify({ asOf, by: pub }));
  fs.writeFileSync(path.join(ROOT, 'data', 'broker-cost-local.json'), JSON.stringify({ asOf, by: loc }, null, 1));
  const n = Object.values(pub), cnt = k => n.filter(x => x[k]).length;
  console.log(`broker cost lines ${asOf}: ${n.length} stocks, ${cnt('supported')} near a holding accumulator's cost; concentration ${JSON.stringify(n.reduce((m, x) => (x.conc && (m[x.conc] = (m[x.conc] || 0) + 1), m), {}))}`);
}

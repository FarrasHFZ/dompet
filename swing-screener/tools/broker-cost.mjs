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
// CLI: node tools/broker-cost.mjs   -> data/broker-cost-tags.json (public: price levels, shares, broker TYPES) and
//      data/broker-cost-local.json (git-ignored: with broker codes, paid data)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';
import { BROKER_TYPE } from './flow-model.mjs';

export const brokerType = c => (BROKER_TYPE.foreign.includes(c) ? 'foreign' : BROKER_TYPE.retail.includes(c) ? 'retail' : 'local');
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
    return { code, type: brokerType(code), net: b - s, bought: b, value: v, avg: b ? (v * 1e6) / (b * 100) : null, last5 };
  });
  const acc = rows.filter(r => r.net > 0).sort((a, b) => b.net - a.net);
  if (!acc.length || !volLots) return { peakDay: rec.d[peak], days: t - peak + 1, none: true };
  const posNet = acc.reduce((s, r) => s + r.net, 0), top = acc.slice(0, 3);
  const topNet = top.reduce((s, r) => s + r.net, 0), topBought = top.reduce((s, r) => s + r.bought, 0), topValue = top.reduce((s, r) => s + r.value, 0);
  const cost = topBought ? (topValue * 1e6) / (topBought * 100) : null, last5 = top.reduce((s, r) => s + r.last5, 0);
  const share1 = acc[0].net / posNet, share3 = topNet / posNet;
  const close = rec.c[t];
  return {
    day: rec.d[t], peakDay: rec.d[peak], peakX: avgVol ? (rec.v[peak] || 0) / avgVol : null, days: t - peak + 1,
    cost, close, gap: cost && close ? close / cost - 1 : null,
    netShare: topNet / volLots, // top-3 accumulators' net lots as a share of all lots traded since the peak
    conc: share1 >= 0.5 ? 'one broker' : share3 >= 0.7 ? 'a few brokers' : 'broad',
    status: last5 >= 0.05 * topNet ? 'adding' : last5 <= -0.25 * topNet ? 'unloading' : 'holding',
    top: top.map(r => ({ code: r.code, type: r.type, net: r.net, avg: r.avg, share: r.net / posNet })),
  };
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
      netShare: +r.netShare.toFixed(3), conc: r.conc, status: r.status, supported: supported(r),
      top: r.top.map(x => ({ type: x.type, share: +x.share.toFixed(2), avg: x.avg && Math.round(x.avg) })), // no broker codes in public data
    };
  }
  fs.writeFileSync(path.join(ROOT, 'data', 'broker-cost-tags.json'), JSON.stringify({ asOf, by: pub }));
  fs.writeFileSync(path.join(ROOT, 'data', 'broker-cost-local.json'), JSON.stringify({ asOf, by: loc }, null, 1));
  const n = Object.values(pub), cnt = k => n.filter(x => x[k]).length;
  console.log(`broker cost lines ${asOf}: ${n.length} stocks, ${cnt('supported')} near a holding accumulator's cost; concentration ${JSON.stringify(n.reduce((m, x) => (x.conc && (m[x.conc] = (m[x.conc] || 0) + 1), m), {}))}`);
}

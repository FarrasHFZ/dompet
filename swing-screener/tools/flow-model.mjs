// Broker-flow read of one stock from a NeoBDM snapshot (tools/neobdm-pull.js). Pure functions, no I/O.
//
// NeoBDM splits every day's broker summary into actor groups. The flows used here are NeoBDM's "%" versions: net buy of
// that group over the window divided by the stock's turnover, so a 0.05 means the group took 5% of all value traded.
//   m  Bandar       NeoBDM's estimate of the dominant player ("bandarmologi")
//   nr Non-retail   every broker that is not a retail broker
//   i  Institution  local institutional brokers
//   s  Sultan       the very largest accounts
//   f  Foreign      foreign brokers
//   z  Zombie       retail brokers; used here as the CONTRARIAN side (retail buying what big money sells = distribution)
// A group's flow is only trusted when NeoBDM rates its method compatible with that stock: comp_<g>_short / _mid are
// 0..1 scores, and the better of the two must be >= 0.5, else the group gets half weight. Dirty tape (NeoBDM's crossing
// flag, or Clean score <= -3) halves everything. NeoBDM lists tektok brokers for almost every stock, so their mere
// presence is not treated as dirty.
//
// Every threshold below was fixed before any forward result existed (2026-10-09). Do not tune them on the forward
// test: change them only with a new version number, and restart that version's forward record.
export const FLOW_MODEL_V = 1;
export const GROUPS = { m: 'Bandar', nr: 'Non-retail', i: 'Institution', s: 'Sultan', f: 'Foreign', z: 'Retail' };
const SMART = ['m', 'nr', 'i', 's'];
const W = { m: 1.5, nr: 1, i: 1, s: 1 }; // bandar estimate weighs most; the others overlap heavily with it
const STRONG = 0.04, MILD = 0.015; // share of turnover over the window

const num = v => (v === null || v === undefined || v === '' || Number.isNaN(+v) ? null : +v);
const truthy = v => v === true || v === 1 || v === '1' || /^(y|yes|ya|true|compatible)$/i.test(String(v ?? ''));
const COMPAT = 0.5;
const compat = (r, g) => {
  const vals = [r['comp_' + g + '_short'], r['comp_' + g + '_mid']].map(num).filter(v => v != null);
  if (vals.length) return Math.max(...vals) >= COMPAT;
  return r['comp_' + g] === undefined ? true : truthy(r['comp_' + g]) || +r['comp_' + g] > 0; // legacy 0/1 export; unknown = trust
};

// Broker codes with a well-known client base. Deliberately short: a code missing here counts as 'other', never guessed.
export const BROKER_TYPE = {
  retail: ['YP', 'XC', 'XL', 'PD', 'CC', 'NI', 'KK', 'SQ', 'EP'], // Mirae, Ajaib, Stockbit, IPOT, Mandiri, BNI, Phillip, BCA, MNC
  foreign: ['AK', 'BK', 'ZP', 'KZ', 'RX', 'YU', 'GW', 'CG', 'DP', 'MS', 'ML'], // UBS, JPM, Maybank, CLSA, Macquarie, CGS, HSBC, Citi, DBS, MS, ML
};
const brokerType = c => (BROKER_TYPE.foreign.includes(c) ? 'foreign' : BROKER_TYPE.retail.includes(c) ? 'retail' : 'other');
const mix = list => { const m = { foreign: 0, retail: 0, other: 0 }; (Array.isArray(list) ? list : []).forEach(c => { m[brokerType(c)]++; }); return m; };
const dir = x => (x == null ? 'n/a' : x >= STRONG ? 'strong buy' : x >= MILD ? 'buy' : x <= -STRONG ? 'strong sell' : x <= -MILD ? 'sell' : 'flat');

// Weighted smart-money flow over one window ('5' | '20'), trusting compatible groups fully and the rest at half.
function smart(r, w) {
  let s = 0, t = 0;
  for (const g of SMART) {
    const v = num(r[g + '_cn_' + w]); if (v == null) continue;
    const k = W[g] * (compat(r, g) ? 1 : 0.5); s += k * v; t += W[g];
  }
  return t ? s / t : null;
}

// r: one NeoBDM row. px (optional): { chg5, chg20 } price changes from our own bars; falls back to NeoBDM's pct_5/pct_20.
export function readFlow(r, px = {}) {
  if (!r) return null;
  const pinky = truthy(r.is_pinky), liquid = r.is_liquid === undefined ? true : truthy(r.is_liquid);
  const dirty = truthy(r.is_crossing) || (num(r.clean_score) != null && num(r.clean_score) <= -3);
  const buyers = mix(r.top_5_buyer), sellers = mix(r.top_5_seller);
  const sm5 = smart(r, '5'), sm20 = smart(r, '20');
  const f5 = num(r.f_cn_5), f20 = num(r.f_cn_20), z5 = num(r.z_cn_5), z20 = num(r.z_cn_20);
  const chg20 = px.chg20 ?? num(r.pct_20);

  // Phase (Wyckoff-style, from 20-day smart money vs 20-day price):
  let phase = 'NEUTRAL';
  if (sm20 != null && chg20 != null) {
    if (sm20 >= MILD) phase = chg20 <= 0.02 ? 'ACCUMULATION' : 'MARKUP';
    else if (sm20 <= -MILD) phase = chg20 >= -0.02 ? 'DISTRIBUTION' : 'MARKDOWN';
  }
  // Short-term turn: the 5-day flow disagrees with the 20-day flow.
  const turn = sm5 == null || sm20 == null ? null : sm5 >= MILD && sm20 < 0 ? 'turning up' : sm5 <= -MILD && sm20 > 0 ? 'turning down' : null;
  // Retail as counterparty: confirms when retail moves AGAINST smart money.
  const retail = z20 == null || sm20 == null ? 'n/a' : z20 <= -MILD && sm20 >= MILD ? 'retail selling to big money' : z20 >= MILD && sm20 <= -MILD ? 'retail buying from big money' : 'no clear transfer';

  let pts = 0;
  pts += sm20 == null ? 0 : sm20 >= STRONG ? 2 : sm20 >= MILD ? 1 : sm20 <= -STRONG ? -2 : sm20 <= -MILD ? -1 : 0;
  pts += sm5 == null ? 0 : sm5 >= MILD ? 1 : sm5 <= -MILD ? -1 : 0;
  pts += f5 == null ? 0 : f5 >= MILD ? 0.5 : f5 <= -MILD ? -0.5 : 0;
  pts += retail === 'retail selling to big money' ? 1 : retail === 'retail buying from big money' ? -1 : 0;
  if (dirty) pts *= 0.5;

  let tag;
  if (pinky) tag = 'AVOID';
  else if (!liquid) tag = 'AVOID';
  else tag = pts >= 2.5 ? 'FLOW+' : pts <= -2.5 ? 'FLOW-' : 'FLOW~';
  const why = pinky ? 'Pinky flag: possible special-interest or repo activity.' : !liquid ? 'NeoBDM rates it not liquid.'
    : `${phase.toLowerCase()}; big money 20d ${dir(sm20)}, 5d ${dir(sm5)}${turn ? ' (' + turn + ')' : ''}; foreign 5d ${dir(f5)}; ${retail}${dirty ? '; dirty tape, weight halved' : ''}.`;
  return {
    v: FLOW_MODEL_V, tag, pts: +pts.toFixed(1), phase, turn, retail, dirty, note: why,
    // Directions only (public-safe): no NeoBDM numbers leave the machine.
    bigMoney: { d5: dir(sm5), d20: dir(sm20) }, foreign: { d5: dir(f5), d20: dir(f20) },
    brokers: { buyers, sellers }, // counts by broker type among today's top 5 net buyers / sellers
    groups: Object.fromEntries(Object.keys(GROUPS).map(g => [g, { d5: dir(num(r[g + '_cn_5'])), d20: dir(num(r[g + '_cn_20'])), compat: compat(r, g) }])),
    raw: { sm5, sm20, f5, f20, z5, z20, chg20, top5Buy: r.top_5_buyer || null, top5Sell: r.top_5_seller || null }, // local only: stripped before publishing
  };
}

export function publicFlow(fr) {
  if (!fr) return null;
  const { raw, ...pub } = fr; // eslint-disable-line no-unused-vars
  return pub;
}

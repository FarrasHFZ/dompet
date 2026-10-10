// Broker directory: every IDX broker code with its official name (IDX "Profil Anggota Bursa" member list, saved in
// tools/idx-brokers.json) and two labels:
//   class    who the broker serves, from what the broker is (written definitions below, fixed, not fitted)
//   behaves  what its money did, measured: the correlation of its daily net buying with NeoBDM's group flows
//            (foreign, Bandar estimate, retail) in each stock, averaged over the stocks where it is among the 20 most
//            active brokers (data/nb-inventory.json x data/nb-history.json). 'with big money' when the average of its
//            foreign and Bandar correlations is >= +0.15, 'against big money (retail-like)' when <= -0.20, else neutral.
// Usage: node tools/broker-directory.mjs  -> data/broker-directory.json (public: names, classes, aggregate statistics)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

export const CLASS_DEF = {
  retail: 'Mass-market broker: the online apps and bank brokers most individual investors use. Their clients are many small accounts, so their net buying is the crowd.',
  foreign: 'Foreign institutional desk (global or regional house): funds and foreign investors.',
  mixed: 'Large full-service house with both a big retail base and institutional clients: its net flow is a blend.',
  local: 'Local securities house: local institutions, high-net-worth clients and proprietary desks. A single local broker doing most of the buying in a stock is the classic "bandar" footprint.',
};
// Fixed lists (from what each firm is; reviewed against the measured behaviour, see README).
export const CLASS = {
  retail: ['XL', 'XC', 'PD', 'YP', 'SQ', 'NI', 'KK', 'EP', 'CP', 'RO', 'GI'], // Stockbit, Ajaib, Indo Premier (IPOT), Mirae, BCA, BNI, Phillip, MNC, KB Valbury, Pluang, Webull
  foreign: ['AK', 'BK', 'ZP', 'KZ', 'RX', 'DP', 'AI', 'TP', 'DR', 'HD', 'XA', 'AG', 'BQ', 'AH', 'FS'], // UBS, JP Morgan, Maybank, CLSA, Macquarie, DBS, Kay Hian, OCBC, RHB, KGI, NH, Kiwoom, Korea Inv., Shinhan, Yuanta
  mixed: ['CC', 'YU'], // Mandiri Sekuritas (MOST app + institutional), CGS International
};
export const classOf = c => (CLASS.retail.includes(c) ? 'retail' : CLASS.foreign.includes(c) ? 'foreign' : CLASS.mixed.includes(c) ? 'mixed' : 'local');

export function loadDirectory() {
  const f = path.join(ROOT, 'data', 'broker-directory.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

if (process.argv[1] && path.basename(process.argv[1]) === 'broker-directory.mjs') {
  const names = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'idx-brokers.json'), 'utf8'));
  const INV = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-inventory.json'), 'utf8'));
  const NB = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nb-history.json'), 'utf8'));
  const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const corr = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, a = 0, b = 0; for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); a += (x[i] - mx) ** 2; b += (y[i] - my) ** 2; } return a && b ? n / Math.sqrt(a * b) : null; };
  const acc = {};
  for (const [tk, rec] of Object.entries(INV)) {
    const g = NB[tk] && NB[tk].g; if (!g) continue;
    const gi = new Map(g.d.map((d, i) => [d, i]));
    const days = rec.d.map((d, k) => [k, gi.get(d)]).filter(([, j]) => j != null && j > 0); if (days.length < 120) continue;
    const gd = x => days.map(([, j]) => (g[x][j] ?? 0) - (g[x][j - 1] ?? 0)), F = gd('f'), Mb = gd('m'), Z = gd('z');
    for (const [code, [, bv, , sv]] of Object.entries(rec.b)) {
      const net = days.map(([k]) => (bv[k] || 0) - (sv[k] || 0)); if (net.filter(x => x).length < 60) continue;
      const a = acc[code] = acc[code] || { stocks: 0, gross: 0, f: [], m: [], z: [] };
      a.stocks++; a.gross += days.reduce((s, [k]) => s + (bv[k] || 0) + (sv[k] || 0), 0);
      [['f', F], ['m', Mb], ['z', Z]].forEach(([k, s]) => { const c = corr(net, s); if (c != null) a[k].push(c); });
    }
  }
  const by = {};
  for (const [code, name] of Object.entries(names)) {
    const a = acc[code], cls = classOf(code);
    const m = a && a.stocks >= 5 ? { stocks: a.stocks, grossT: +(a.gross / 1e6).toFixed(1), foreign: +mean(a.f).toFixed(2), bandar: +mean(a.m).toFixed(2), retail: +mean(a.z).toFixed(2) } : null;
    const lean = m ? (m.foreign + m.bandar) / 2 : null;
    by[code] = { name, cls, measured: m, behaves: lean == null ? null : lean >= 0.15 ? 'with big money' : lean <= -0.2 ? 'against big money (retail-like)' : 'neutral' };
  }
  const out = { asOf: new Date().toISOString().slice(0, 10), source: 'IDX member list (Profil Anggota Bursa) + NeoBDM broker inventory, 1 year', defs: CLASS_DEF, by };
  fs.writeFileSync(path.join(ROOT, 'data', 'broker-directory.json'), JSON.stringify(out, null, 1));
  const chk = Object.entries(by).filter(([, v]) => v.measured);
  console.log(`broker directory: ${Object.keys(by).length} brokers, ${chk.length} with measured behaviour`);
  chk.sort((a, b) => b[1].measured.grossT - a[1].measured.grossT).forEach(([c, v]) => console.log(`  ${c} ${v.cls.padEnd(7)} ${v.behaves.padEnd(32)} f ${v.measured.foreign} bandar ${v.measured.bandar} | ${v.name}`));
}

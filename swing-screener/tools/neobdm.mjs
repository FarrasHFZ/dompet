// NeoBDM overlay. NeoBDM has no public API and shows only today's values, so the Market Summary table is exported by hand
// (through a logged-in Chrome) to data/neobdm-YYYY-MM-DD.csv; the build reads the newest file. The overlay is NOT backtested:
// it can veto (Pinky / illiquid) or annotate a technical ACT pick, never promote one. Its record starts in data/neobdm-ledger/.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';
import { readFlow, publicFlow } from './flow-model.mjs';

// Public-safe: data/neobdm-tags-YYYY-MM-DD.json holds only derived labels (tag, points, note), never NeoBDM's raw numbers.
export function loadNeobdm() {
  const files = fs.readdirSync(path.join(ROOT, 'data')).filter(f => /^neobdm-tags-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) return null;
  const f = files[files.length - 1];
  return { asOf: f.slice(12, 22), by: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')) };
}

// Raw export (local only, git-ignored): data/neobdm-YYYY-MM-DD.csv -> derived tags file.
export function csvToTags(csvFile) {
  const by = {};
  fs.readFileSync(csvFile, 'utf8').trim().split('\n').slice(1).forEach(l => {
    const [s, close, liquid, m, compM, tval, cross, fi, clean, nr, fl, i, pinky, compNr] = l.split(',');
    const ov = overlay({ liquid: +liquid, mPct: +m, cross: +cross, clean: +clean, nr: +nr, f: +fl, i: +i, pinky: +pinky, compNr: +compNr });
    by[s] = { tag: ov.tag, pts: ov.pts, note: ov.note };
  });
  return by;
}

// Flow only counts when transactions are clean (NeoBDM's own rule: dirty/crossing flow is unreliable).
export function overlay(n) {
  if (!n) return { tag: 'NONE', pts: 0, note: 'Not covered by NeoBDM.' };
  if (n.pinky) return { tag: 'AVOID', pts: -9, note: 'Pinky flag: possible special-interest or repo activity.' };
  if (!n.liquid) return { tag: 'AVOID', pts: -9, note: 'NeoBDM rates it not liquid.' };
  const dirty = n.cross || n.clean <= -3;
  let pts = 0;
  pts += n.nr > 0 ? 1 : n.nr < 0 ? -1 : 0;
  pts += n.i > 0 ? 1 : n.i < 0 ? -1 : 0;
  pts += n.f > 0 ? 0.5 : n.f < 0 ? -0.5 : 0;
  pts += n.mPct > 0.05 ? 1 : n.mPct < -0.05 ? -1 : 0;
  if (!n.compNr) pts *= 0.5;
  if (dirty) pts *= 0.5;
  const tag = pts >= 2 ? 'FLOW+' : pts <= -2 ? 'FLOW-' : 'FLOW~';
  return { tag, pts: +pts.toFixed(1), note: (dirty ? 'Dirty flow (crossing or Clean ≤ -3), weight halved. ' : 'Clean flow. ') + (n.compNr ? '' : 'Non-retail method not compatible with this stock, weight halved.') };
}

// Technical rules from tools/experiment-v3.mjs (backtested) + NeoBDM veto/annotation (not backtested).
// marketOk: IHSG above its 200-day average (tools/experiment-v4.mjs: chosen on 2022-10..2024-09, confirmed on 2024-10..:
// second-half CAGR +6.3% vs 0.0%, max drawdown -12.7% vs -36.8%). Below it, oversold setups are paused, not traded.
// flowVeto: set only when tools/experiment-nb.mjs (2-year NeoBDM replay, pre-registered) adopted it; FLOW- then skips.
export function tierOf(score, actScore, confirm, ov, marketOk = true, flowVeto = false) {
  if (score < actScore) return 'WATCH';
  if (ov.tag === 'AVOID') return 'SKIP';
  if (flowVeto && ov.tag === 'FLOW-') return 'SKIP';
  if (!marketOk) return 'PAUSE';
  if (!confirm) return 'WAIT';
  // ACT+ / ACT? (flow up / down) were retired on 2026-10-10: the 2-year replay (tools/experiment-nb.mjs) found the flow tag
  // did not separate good from bad bounces, and FLOW- bounces did slightly better, so a flow sub-badge would mislead.
  return 'ACT';
}

// Daily snapshot (tools/neobdm-pull.js -> data/neobdm-snap/DATE.json, local) -> public tags carrying the full broker-flow
// read of tools/flow-model.mjs: phase, per-group directions, retail transfer, broker mix, hygiene. No raw NeoBDM numbers.
export function snapToTags(snapFile) {
  const d = path.basename(snapFile).slice(0, 10), j = JSON.parse(fs.readFileSync(snapFile, 'utf8')), s = j[d] || j;
  const by = {};
  Object.entries(s.rows).forEach(([tk, r]) => { by[tk] = publicFlow(readFlow(r)); });
  return { date: d, by };
}

// Usage: node tools/neobdm.mjs             newest data/neobdm-snap/*.json -> data/neobdm-tags-DATE.json
//        node tools/neobdm.mjs <file.csv>  legacy hand export
if (process.argv[1] && process.argv[1].endsWith('neobdm.mjs')) {
  const arg = process.argv[2];
  if (arg && arg.endsWith('.csv')) {
    const d = arg.match(/(\d{4}-\d{2}-\d{2})/)[1];
    fs.writeFileSync(path.join(ROOT, 'data', 'neobdm-tags-' + d + '.json'), JSON.stringify(csvToTags(arg)));
    console.log('wrote neobdm-tags-' + d + '.json');
  } else {
    const dir = path.join(ROOT, 'data', 'neobdm-snap');
    const f = arg || path.join(dir, fs.readdirSync(dir).filter(x => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().at(-1));
    const { date, by } = snapToTags(f);
    fs.writeFileSync(path.join(ROOT, 'data', 'neobdm-tags-' + date + '.json'), JSON.stringify(by));
    const cnt = {}; Object.values(by).forEach(t => { cnt[t.tag] = (cnt[t.tag] || 0) + 1; cnt[t.phase] = (cnt[t.phase] || 0) + 1; });
    console.log('wrote neobdm-tags-' + date + '.json:', Object.keys(by).length, 'stocks', JSON.stringify(cnt));
  }
}

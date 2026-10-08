// NeoBDM overlay. NeoBDM has no public API and shows only today's values, so the Market Summary table is exported by hand
// (through a logged-in Chrome) to data/neobdm-YYYY-MM-DD.csv; the build reads the newest file. The overlay is NOT backtested:
// it can veto (Pinky / illiquid) or annotate a technical ACT pick, never promote one. Its record starts in data/neobdm-ledger/.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

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
export function tierOf(score, actScore, confirm, ov) {
  if (score < actScore) return 'WATCH';
  if (ov.tag === 'AVOID') return 'SKIP';
  if (!confirm) return 'WAIT';
  return ov.tag === 'FLOW+' ? 'ACT+' : ov.tag === 'FLOW-' ? 'ACT?' : 'ACT';
}

if (process.argv[1] && process.argv[1].endsWith('neobdm.mjs') && process.argv[2]) {
  const csv = process.argv[2], d = csv.match(/(\d{4}-\d{2}-\d{2})/)[1];
  fs.writeFileSync(path.join(ROOT, 'data', 'neobdm-tags-' + d + '.json'), JSON.stringify(csvToTags(csv)));
  console.log('wrote neobdm-tags-' + d + '.json');
}

// Pushes web/index.html to the public site repo (FarrasHFZ/kol-radar -> https://farrashfz.github.io/kol-radar/).
// Run after `node tools/build.mjs`.  node tools/publish-site.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kol-radar-'));
const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' }).toString();
execFileSync('gh', ['repo', 'clone', 'FarrasHFZ/kol-radar', dir], { stdio: 'pipe' });
fs.copyFileSync(path.join(root, 'web', 'index.html'), path.join(dir, 'index.html'));
git('add', '-A');
if (!git('diff', '--cached', '--name-only').trim()) { console.log('site already up to date'); process.exit(0); }
git('-c', 'user.name=FarrasHFZ', '-c', 'user.email=farras.farisi@shopee.com', 'commit', '-m', 'Update dashboard ' + new Date().toISOString().slice(0, 10));
git('push');
console.log('published https://farrashfz.github.io/kol-radar/');

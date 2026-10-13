// Builds web/index.html (single self-contained file) from the scored data.  node tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './score.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = build();
const html = fs.readFileSync(path.join(root, 'tools', 'dashboard.template.html'), 'utf8')
  .replace('/*DATA*/null', () => JSON.stringify(data).replace(/</g, '\\u003c'));
fs.mkdirSync(path.join(root, 'web'), { recursive: true });
fs.writeFileSync(path.join(root, 'web', 'index.html'), html);
// Artifact variant: the Artifact tool adds the doctype/head/body skeleton itself, so ship title + style + body content only.
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
fs.writeFileSync(path.join(root, 'web', 'artifact.html'), title + '\n' + style + '\n' + body);
console.log('wrote web/index.html', data.kols.length, 'kols, as of', data.asOf);

// Local-only receiver for browser-side pulls (IDX stock summary, NeoBDM screener). A page running in a normal
// browser tab POSTs JSON batches to http://127.0.0.1:5175/<file>; each batch is MERGED into data/<file> and saved
// immediately, so a closed tab loses at most the batch in flight. GET /<file>/keys returns the keys already saved
// (lets the page resume where it stopped). Only files matching the allow-list below can be written.
// Usage: node tools/flow-receiver.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const ALLOW = /^(idx-foreign-flow\.json|neobdm-snap\/\d{4}-\d{2}-\d{2}\.json|bm-history\.json|bm-snap\/\d{4}-\d{2}-\d{2}\.json)$/;
const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Private-Network': 'true' };
const load = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, H); return res.end(); }
  // Hand-off page for browsers that block a public page from fetching localhost: the pull navigates the tab to
  // /upload#<file>|<json> and this page POSTs it same-origin (the fragment never leaves the browser).
  if (req.url === '/upload') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta charset="utf-8"><title>flow upload</title><pre id="o">uploading…</pre><script>
const h = decodeURIComponent(location.hash.slice(1)), i = h.indexOf('|');
fetch('/' + h.slice(0, i), { method: 'POST', body: h.slice(i + 1) }).then(r => r.text()).then(t => { o.textContent = 'saved ' + h.slice(0, i) + ' (' + t + ' keys)'; history.replaceState(null, '', '/upload'); }).catch(e => { o.textContent = 'failed: ' + e.message; });
</script>`);
  }
  const url = decodeURIComponent(req.url.slice(1)), keys = url.endsWith('/keys'), name = keys ? url.slice(0, -5) : url;
  if (!ALLOW.test(name)) { res.writeHead(403, H); return res.end('not allowed'); }
  const file = path.join(ROOT, 'data', name);
  if (req.method === 'GET') { res.writeHead(200, { ...H, 'Content-Type': 'application/json' }); return res.end(JSON.stringify(keys ? Object.keys(load(file)) : load(file))); }
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    try {
      const batch = JSON.parse(Buffer.concat(chunks)), cur = load(file);
      Object.assign(cur, batch);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(cur));
      fs.renameSync(file + '.tmp', file);
      res.writeHead(200, H); res.end(String(Object.keys(cur).length));
      console.log(new Date().toISOString().slice(11, 19), name, '+' + Object.keys(batch).length, '=', Object.keys(cur).length);
    } catch (e) { res.writeHead(400, H); res.end(e.message); }
  });
}).listen(5175, '127.0.0.1', () => console.log('flow-receiver on 127.0.0.1:5175'));

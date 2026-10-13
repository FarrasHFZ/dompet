// Local receiver: the browser-pane snippets POST each profile reading here, so results land in data/inbox.jsonl
// without being retyped.  node tools/collector.mjs   (listens on 127.0.0.1:8799, local only)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const inbox = path.join(root, 'data', 'inbox.jsonl');
http.createServer({ maxHeaderSize: 8_000_000 }, (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && req.url.startsWith('/ingest')) {
    try {
      const rows = JSON.parse(new URL(req.url, 'http://x').searchParams.get('d'));
      fs.appendFileSync(inbox, rows.map(r => JSON.stringify({ at: new Date().toISOString(), ...r })).join('\n') + '\n');
      res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ingested ' + rows.length);
    } catch (e) { res.writeHead(400); return res.end('bad ' + e.message); }
  }
  if (req.method === 'GET') { res.writeHead(200); return res.end(String(fs.existsSync(inbox) ? fs.readFileSync(inbox, 'utf8').split('\n').filter(Boolean).length : 0)); }
  let b = '';
  req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); });
  req.on('end', () => {
    try { fs.appendFileSync(inbox, JSON.stringify({ at: new Date().toISOString(), ...JSON.parse(b) }) + '\n'); res.writeHead(204); } catch { res.writeHead(400); }
    res.end();
  });
}).listen(8799, '127.0.0.1', () => console.log('collector on 127.0.0.1:8799'));

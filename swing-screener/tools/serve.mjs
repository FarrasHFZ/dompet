// Tiny static server for previewing swing-screener/web locally.
// LIVE_DATA=1 serves data/* from the published site instead (today's full snapshot; the committed web/data is older).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';
const dir = path.join(ROOT, 'web'), port = +(process.env.PORT || 5174);
const LIVE = process.env.LIVE_DATA === '1' ? 'https://farrashfz.github.io/dompet/screener/' : null, cache = new Map();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  if (LIVE && rel.startsWith('data/')) {
    try {
      const c = cache.get(rel);
      if (!c || Date.now() - c.t > 600e3) {
        const r = await fetch(LIVE + rel);
        if (!r.ok) { res.writeHead(r.status); return res.end(); }
        cache.set(rel, { t: Date.now(), body: Buffer.from(await r.arrayBuffer()) });
      }
      res.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' });
      return res.end(cache.get(rel).body);
    } catch (e) { res.writeHead(502); return res.end(String(e)); }
  }
  const p = path.join(dir, rel || 'index.html');
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log('serving', dir, 'on', port, LIVE ? '(data from the live site)' : ''));

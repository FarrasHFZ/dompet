// NeoBDM broker-inventory pull for the broker cost lines (tools/broker-cost.mjs). Runs INSIDE a logged-in
// https://neobdm.tech tab. Paste once; it defines helpers and starts nothing.
//
// Per stock: up to 20 brokers (window.__invList[tk], or the top 20 by gross 1-year value from /api/broker-summary when
// the list is missing), daily lots and value bought and sold for the last year, via /api/inventory (max 10 brokers per
// call). 2-3 reads per stock at 5-8 s spacing; stops at the first 4xx/5xx.
//   window.__invTickers = [...]; window.__invList = { TK: ['AK', ...] }   (optional)
//   (async()=>{for(;;){const r=await __invBurst(600000);window.__invLast=r;if(r.stopped||r.stored>=r.of)break;}})()
//   export: `await __invChunk(k, 10)` -> navigate a SECOND neobdm tab (robots.txt) to
//   http://127.0.0.1:5175/upload#nb-inventory.json|<json>   (local, git-ignored: paid data)
(() => {
  if (!window.__wwait) {
    const wk = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })));
    const pend = {}; let seq = 0; wk.onmessage = e => { pend[e.data](); delete pend[e.data]; };
    window.__wwait = ms => new Promise(r => { const id = ++seq; pend[id] = r; wk.postMessage({ id, ms }); });
  }
  const wait = ms => window.__wwait(ms);
  const open = () => new Promise((ok, no) => { const r = indexedDB.open('nbinv', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tx = (db, mode, fn) => new Promise((ok, no) => { const t = db.transaction('s', mode); const q = fn(t.objectStore('s')); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); });
  const iso = d => d.toISOString().slice(0, 10);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dmy = d => `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}`;
  const M = x => (x == null ? null : Math.round(+x / 1e4) / 100); // IDR -> million, 2 decimals
  async function topBrokers(tk, start, end) {
    const html = await fetch(`/stock_detail/${tk}/`).then(r => r.text());
    const tok = (html.match(/csrfmiddlewaretoken: '([^']+)'/) || [])[1]; if (!tok) throw new Error(tk + ' no csrf token (logged out?)');
    await wait(3000);
    const fd = new URLSearchParams({ tick: tk, start_date: dmy(start), end_date: dmy(end), event: 'load', foreign_only: 'false', domestic_only: 'false', net: 'false', csrfmiddlewaretoken: tok });
    const r = await fetch('/api/broker-summary', { method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } });
    if (!r.ok) throw new Error(`${tk} broker-summary HTTP ${r.status}`);
    const j = await r.json(); const div = document.createElement('div'); div.innerHTML = j.broksum_html || '';
    const val = s => { const m = String(s).replace(/,/g, '').match(/^(-?[\d.]+)\s*([KMBT]?)/); return m ? +m[1] * ({ '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2]]) : 0; };
    const gross = {};
    [...div.querySelectorAll('tr')].slice(1).forEach(tr => { const c = [...tr.children].map(x => x.textContent.trim()); if (c[0]) gross[c[0]] = (gross[c[0]] || 0) + val(c[2]); if (c[4]) gross[c[4]] = (gross[c[4]] || 0) + val(c[6]); });
    return Object.entries(gross).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([b]) => b);
  }
  window.__invBurst = async ms => {
    const end = new Date(), start = new Date(end.getTime() - 364 * 864e5), stop = Date.now() + ms, db = await open();
    const have = new Set(await tx(db, 'readonly', s => s.getAllKeys())); let n = 0;
    for (const tk of window.__invTickers) {
      if (have.has(tk)) continue; if (Date.now() + 25000 > stop) break;
      try {
        let brokers = (window.__invList || {})[tk];
        if (!brokers || !brokers.length) { brokers = await topBrokers(tk, start, end); await wait(5000 + Math.random() * 3000); }
        const rec = { d: null, c: null, v: null, b: {} };
        for (let k = 0; k < brokers.length; k += 10) {
          const p = new URLSearchParams({ symbol: tk, start_date: iso(start), end_date: iso(end), investor_type: 'A' });
          brokers.slice(k, k + 10).forEach(b => p.append('brokers', b));
          const r = await fetch('/api/inventory?' + p);
          if (!r.ok) return { stopped: `${tk} inventory HTTP ${r.status}`, added: n };
          const j = await r.json(); if (String(j.success) !== 'true' || !j.data) return { stopped: `${tk} inventory: ${j.message}`, added: n };
          const D = j.data; rec.d = rec.d || D.date; rec.c = rec.c || D.ohlc.map(o => +o.close || null); rec.v = rec.v || D.ohlc.map(o => +o.volume || 0);
          Object.keys(D.blot).forEach(b => { rec.b[b] = [D.blot[b], D.bval[b].map(M), D.slot[b], D.sval[b].map(M)]; });
          await wait(5000 + Math.random() * 3000);
        }
        await tx(db, 'readwrite', s => s.put(rec, tk)); n++;
      } catch (e) { return { stopped: e.message, added: n }; }
    }
    return { added: n, stored: (await tx(db, 'readonly', s => s.getAllKeys())).length, of: window.__invTickers.length };
  };
  window.__invReset = async () => { const db = await open(); await tx(db, 'readwrite', s => s.clear()); return 'cleared'; };
  window.__invChunk = async (k, size) => {
    const db = await open(), keys = (await tx(db, 'readonly', s => s.getAllKeys())).sort().slice(k * size, (k + 1) * size), out = {};
    for (const tk of keys) out[tk] = await tx(db, 'readonly', s => s.get(tk));
    return JSON.stringify(out);
  };
  return 'nb-inv-pull ready';
})();

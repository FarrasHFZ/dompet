// NeoBDM HISTORY pull (the "Analisa Transaksi" chart and the Inventory Analysis page). Runs INSIDE a logged-in
// https://neobdm.tech tab (Claude in Chrome or DevTools). Paste once; it defines helpers on window and starts nothing.
//
// Two sources, both read the way NeoBDM's own pages read them:
//   1. GROUP FLOW (~2 years): /stock_detail/<TK>/ embeds the Transaction Chart data in its HTML: cumulative net value
//      per actor group (m bandar, nr non-retail, i institution, s sultan, f foreign, z retail; billions IDR), the
//      Participation bars (z, i, r, f) and the foreign-institution crossing line. 1 page read per stock.
//   2. BROKER INVENTORY (1 year; NeoBDM serves no older window): /api/inventory gives daily net lots per broker, max
//      10 brokers per call. Brokers are chosen by GROSS 1-year activity (top 14 buyers + top 14 sellers by value from
//      /api/broker-summary, union, capped at 20), not by net, so the choice does not peek at who accumulated.
//      2 inventory calls + 1 summary call per stock.
// So 4 reads per stock, ~400 for 100 stocks, at 3-5 s spacing, stopping at the first 4xx/5xx/rate-limit.
//
// 1. window.__nbhTickers = [...]   (or `await __nbhUniverse()` = the swing-100 stock list)
// 2. `await __nbhBurst(38000)` repeatedly (background tabs get throttled; drive it in short bursts).
// 3. `await __nbhChunk(k, 10)` -> JSON; hand off to tools/flow-receiver.mjs by navigating the tab to
//    http://127.0.0.1:5175/upload#nb-history.json|<json>   (local, git-ignored: NeoBDM is paid data).
// Stocks are kept in IndexedDB ('nbhpull'), so navigating away loses nothing.
(() => {
  const UNIVERSE = '01a12133-4e90-739f-8583-fd7e5d2d03c9'; // "swing-100"
  const open = () => new Promise((ok, no) => { const r = indexedDB.open('nbhpull', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tx = (db, mode, fn) => new Promise((ok, no) => { const t = db.transaction('s', mode); const q = fn(t.objectStore('s')); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); });
  // Pauses run on a Web Worker timer: Chrome throttles a hidden tab's own timers to about one per minute, which would
  // stall the pull (the request pace stays the same; only the throttling is avoided).
  if (!window.__wwait) {
    const wk = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })));
    const pend = {}; let seq = 0; wk.onmessage = e => { pend[e.data](); delete pend[e.data]; };
    window.__wwait = ms => new Promise(r => { const id = ++seq; pend[id] = r; wk.postMessage({ id, ms }); });
  }
  const wait = ms => window.__wwait(ms);
  const sig = x => (x == null ? null : +Number(x).toPrecision(7));
  const iso = d => d.toISOString().slice(0, 10);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dmy = d => `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}`;
  const series = (html, at) => { const s = html.indexOf('[', at), e = html.indexOf('}]', s); return s < 0 || e < 0 ? [] : JSON.parse(html.slice(s, e + 2)); };

  function parseGroups(html) {
    const out = {};
    for (const g of ['m', 's', 'nr', 'f', 'i', 'z']) { const k = html.indexOf(g + 'nvalSeries.setData('); if (k >= 0) out[g] = series(html, k); }
    for (const m of html.matchAll(/bar\(['"](\w+)['"]\)\)\.setData\(/g)) out['p' + m[1]] = series(html, m.index);
    const x = html.indexOf('crossSeries.setData('); if (x >= 0) out.x = series(html, x);
    if (!out.m || !out.m.length) return null;
    const d = out.m.map(p => p.time), col = a => { const mp = new Map((a || []).map(p => [p.time, sig(p.value)])); return d.map(t => (mp.has(t) ? mp.get(t) : null)); };
    const rec = { d }; Object.keys(out).forEach(k => { rec[k] = col(out[k]); });
    return rec;
  }
  async function topBrokers(tk, tok, start, end) {
    const fd = new URLSearchParams({ tick: tk, start_date: dmy(start), end_date: dmy(end), event: 'load', foreign_only: 'false', domestic_only: 'false', net: 'false', csrfmiddlewaretoken: tok });
    const r = await fetch('/api/broker-summary', { method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } });
    if (!r.ok) throw new Error(`${tk} broker-summary HTTP ${r.status}`);
    const j = await r.json(); if (!j.success) throw new Error(`${tk} broker-summary refused`);
    const div = document.createElement('div'); div.innerHTML = j.broksum_html || '';
    const val = s => { const m = String(s).replace(/,/g, '').match(/^(-?[\d.]+)\s*([KMBT]?)/); return m ? +m[1] * ({ '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2]]) : 0; };
    const gross = {};
    [...div.querySelectorAll('tr')].slice(1).forEach(tr => { const c = [...tr.children].map(x => x.textContent.trim()); if (c[0]) gross[c[0]] = (gross[c[0]] || 0) + val(c[2]); if (c[4]) gross[c[4]] = (gross[c[4]] || 0) + val(c[6]); });
    return Object.entries(gross).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([b]) => b);
  }
  async function inventory(tk, brokers, start, end) {
    const out = { d: null, vol: null, n: {} };
    for (let k = 0; k < brokers.length; k += 10) {
      const p = new URLSearchParams({ symbol: tk, start_date: iso(start), end_date: iso(end), investor_type: 'A' });
      brokers.slice(k, k + 10).forEach(b => p.append('brokers', b));
      const r = await fetch('/api/inventory?' + p);
      if (!r.ok) throw new Error(`${tk} inventory HTTP ${r.status}`);
      const j = await r.json(); if (String(j.success) !== 'true' || !j.data) throw new Error(`${tk} inventory: ${j.message}`);
      out.d = out.d || j.data.date; out.vol = out.vol || j.data.ohlc.map(o => +o.volume || 0);
      Object.entries(j.data.nlot).forEach(([b, a]) => { out.n[b] = a; });
      await wait(2500 + Math.random() * 1500);
    }
    return out;
  }

  window.__nbhUniverse = async () => {
    const j = await fetch('/api/stock-universe').then(r => r.json());
    const u = (j.data || []).find(x => x.id === UNIVERSE);
    window.__nbhTickers = u ? u.stocks.slice().sort() : null;
    return window.__nbhTickers ? window.__nbhTickers.length + ' tickers' : 'swing-100 not found';
  };
  window.__nbhReset = async () => { const db = await open(); await tx(db, 'readwrite', s => s.clear()); return 'cleared'; };
  window.__nbhBurst = async ms => {
    if (!window.__nbhTickers) return { stopped: 'set window.__nbhTickers or run __nbhUniverse() first' };
    const end = new Date(), start = new Date(end.getTime() - 364 * 864e5), stop = Date.now() + ms, db = await open();
    const have = new Set(await tx(db, 'readonly', s => s.getAllKeys()));
    let n = 0;
    for (const tk of window.__nbhTickers) {
      if (have.has(tk)) continue;
      if (Date.now() + 14000 > stop) break;
      try {
        const r = await fetch(`/stock_detail/${tk}/`);
        if (!r.ok) return { stopped: `${tk} page HTTP ${r.status}`, added: n };
        const html = await r.text();
        const tok = (html.match(/csrfmiddlewaretoken: '([^']+)'/) || [])[1];
        const rec = { g: parseGroups(html), inv: null };
        await wait(2500 + Math.random() * 1500);
        if (tok) { const br = await topBrokers(tk, tok, start, end); await wait(2500 + Math.random() * 1500); rec.inv = await inventory(tk, br, start, end); }
        await tx(db, 'readwrite', s => s.put(rec, tk)); n++;
      } catch (e) { return { stopped: e.message, added: n }; }
    }
    return { added: n, stored: (await tx(db, 'readonly', s => s.getAllKeys())).length, of: window.__nbhTickers.length };
  };
  window.__nbhChunk = async (k, size) => {
    const db = await open(), keys = (await tx(db, 'readonly', s => s.getAllKeys())).sort().slice(k * size, (k + 1) * size), out = {};
    for (const tk of keys) out[tk] = await tx(db, 'readonly', s => s.get(tk));
    return JSON.stringify(out);
  };
  return 'nb-hist-pull ready: ' + (window.__nbhTickers ? window.__nbhTickers.length + ' tickers' : 'run __nbhUniverse()');
})();

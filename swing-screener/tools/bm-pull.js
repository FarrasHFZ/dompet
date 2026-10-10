// Bandarmetrics pull. Runs INSIDE a logged-in https://bandarmetrics.com/app/bandar-metrics tab (Claude in Chrome or
// DevTools). Paste this file once; it defines helpers on window and starts nothing by itself.
//
// 1. Switch the chart to any stock once, so the app sends a request: the hook below keeps its Authorization header in
//    window.__authKeep (never printed). The token is short-lived; after a 401, switch stock again and continue.
// 2. Call `await __bmBurst(38000)` repeatedly (one call = ~10 stocks; Chrome throttles background timers, so drive it
//    in short bursts instead of one long loop). Per stock, 4 series from /analysis/broker/summary, fetched together,
//    then a 2.5 s pause; it stops at the first 401/403/429.
//      q3_200 = LPM (cumulative)   momentum = Intensity   volume_ratio = Volume Rotation   bai = Money Flow (cumulative)
//    (Money Flow In/Out = daily change of bai; Net Buy/Sell Foreign = daily change of ff; neither needs pulling.)
//    window.__bmStart: '2022-01-01' for the full history, or ~60 days back for a weekly refresh.
// 3. Export with `await __bmChunk(k, 20)` and hand it to tools/flow-receiver.mjs: navigate the tab to
//    http://127.0.0.1:5175/upload#<file>|<json>  with file = bm-history.json (full) or bm-snap/YYYY-MM-DD.json (refresh).
//    Stocks are kept in the page's IndexedDB ('bmpull'), so navigating away loses nothing.
// Then `node tools/bm-labels.mjs` merges and writes the public labels.
(() => {
  window.__bmTickers = window.__bmTickers || JSON.parse(localStorage.getItem('__bmT') || 'null');
  if (!window.__hdrHooked) {
    window.__hdrHooked = true;
    const O = XMLHttpRequest.prototype.open, SH = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return O.apply(this, arguments); };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (/authorization/i.test(k) && String(this.__u || '').includes('api.bandarmetrics.com')) window.__authKeep = v; return SH.apply(this, arguments); };
  }
  // Pauses on a Web Worker timer: Chrome throttles a hidden tab's own timers to about one per minute.
  if (!window.__wwait) {
    const wk = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })));
    const pend = {}; let seq = 0; wk.onmessage = e => { pend[e.data](); delete pend[e.data]; };
    window.__wwait = ms => new Promise(r => { const id = ++seq; pend[id] = r; wk.postMessage({ id, ms }); });
  }
  const IND = ['q3_200', 'momentum', 'volume_ratio', 'bai'];
  const open = () => new Promise((ok, no) => { const r = indexedDB.open('bmpull', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tx = (db, mode, fn) => new Promise((ok, no) => { const t = db.transaction('s', mode); const q = fn(t.objectStore('s')); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); });
  const sig = x => (x == null ? null : +Number(x).toPrecision(6));
  window.__bmReset = async () => { const db = await open(); await tx(db, 'readwrite', s => s.clear()); return 'cleared'; };
  window.__bmBurst = async ms => {
    if (!window.__authKeep) return { stopped: 'no auth yet: switch the chart to another stock once' };
    const start = window.__bmStart || '2022-01-01', end = Date.now() + ms, db = await open();
    const have = new Set(await tx(db, 'readonly', s => s.getAllKeys()));
    let n = 0;
    for (const tk of window.__bmTickers) {
      if (have.has(tk)) continue;
      if (Date.now() + 6000 > end) break;
      const res = await Promise.all(IND.map(ind => fetch(`https://api.bandarmetrics.com/analysis/broker/summary?stockCode=${tk}&startDate=${start}&indicator=${ind}`, { headers: { Authorization: window.__authKeep } })
        .then(async r => ({ ind, s: r.status, j: r.ok ? await r.json() : null }))));
      const bad = res.find(x => [401, 403, 429].includes(x.s));
      if (bad) return { stopped: `${tk} ${bad.ind}: HTTP ${bad.s}`, added: n };
      const rec = {}; res.forEach(x => { rec[x.ind] = Array.isArray(x.j && x.j.data) ? x.j.data.map(p => [p.time, sig(p.value)]) : []; });
      await tx(db, 'readwrite', s => s.put(rec, tk)); n++;
      await (window.__wwait ? window.__wwait(2500) : new Promise(r => setTimeout(r, 2500)));
    }
    return { added: n, stored: (await tx(db, 'readonly', s => s.getAllKeys())).length, of: window.__bmTickers.length };
  };
  window.__bmChunk = async (k, size) => {
    const db = await open(), keys = (await tx(db, 'readonly', s => s.getAllKeys())).sort().slice(k * size, (k + 1) * size), out = {};
    for (const tk of keys) {
      const rec = await tx(db, 'readonly', s => s.get(tk)), dates = [...new Set(IND.flatMap(i => (rec[i] || []).map(p => p[0])))].sort();
      const col = i => { const m = new Map(rec[i] || []); return dates.map(d => (m.has(d) ? m.get(d) : null)); };
      out[tk] = { d: dates, l: col('q3_200'), i: col('momentum'), v: col('volume_ratio'), m: col('bai') };
    }
    return JSON.stringify(out);
  };
  return 'bm-pull ready: ' + (window.__bmTickers ? window.__bmTickers.length + ' tickers' : 'set window.__bmTickers first');
})();

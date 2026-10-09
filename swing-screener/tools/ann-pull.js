// IDX company announcements pull. Runs INSIDE a normal browser tab on https://www.idx.co.id/ (plain scripts get a
// Cloudflare 403; a real browser tab does not, and this does not try to get around that). One request per stock,
// 1.2 s apart, for the last `window.__annDays` days (default 10), then hands the result to tools/flow-receiver.mjs by
// navigating to its /upload page as data/idx-announcements-new.json. Then run: node tools/ann-import.mjs data/idx-announcements-new.json
// Set window.__annT to the 100 universe tickers first. Rows: [timestamp, title, subject, attachmentName, attachmentUrl].
(async () => {
  const T = window.__annT, days = window.__annDays || 10;
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');
  const to = new Date(Date.now() + 864e5), from = new Date(Date.now() - days * 864e5);
  const st = window.__annPull = { done: 0, total: T.length, error: null };
  const out = {};
  for (const tk of T) {
    try {
      const r = await fetch(`/primary/ListedCompany/GetAnnouncement?kodeEmiten=${tk}&emitenType=*&indexFrom=0&pageSize=200&dateFrom=${fmt(from)}&dateTo=${fmt(to)}&lang=id&keyword=`);
      if (r.status !== 200) { st.error = tk + ' HTTP ' + r.status; break; }
      const j = await r.json();
      out[tk] = (j.Replies || []).map(x => { const p = x.pengumuman, a = (x.attachments || []).find(f => !f.IsAttachment) || (x.attachments || [])[0]; return [p.TglPengumuman, p.JudulPengumuman, p.PerihalPengumuman, a ? a.OriginalFilename : '', a ? a.FullSavePath : '']; });
    } catch (e) { st.error = tk + ' ' + e.message; break; }
    st.done++;
    await new Promise(res => setTimeout(res, 1200));
  }
  window.__annOut = out;
  st.phase = 'done';
  if (!st.error) location.href = 'http://127.0.0.1:5175/upload#' + encodeURIComponent('idx-announcements-new.json|' + JSON.stringify(out));
})();

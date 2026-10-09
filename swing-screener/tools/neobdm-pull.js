// Daily NeoBDM pull. Runs INSIDE a logged-in NeoBDM tab (https://neobdm.tech/new-market-summary/), e.g. pasted into
// DevTools or run by Claude in Chrome. Uses NeoBDM's own Market Summary API the way its page does, at human pace:
//   4 column sets (the screener holds max 15 columns) x 5 pages (20 rows per page, 100-stock universe) = 20 reads + 4 saves.
// Rows are merged by symbol and POSTed to tools/flow-receiver.mjs (127.0.0.1:5175) as data/neobdm-snap/<date>.json
// (local, git-ignored: NeoBDM is paid data) by navigating the tab to the receiver's /upload page. Result also in window.__nbSnap.
// It stops at the first rate-limit answer and never retries in a loop.
(async () => {
  const SCREENER = '01a1174d-dc6e-7646-8588-02ad385b4f00'; // "swing-screener" in the account
  const UNIVERSE = '01a12133-4e90-739f-8583-fd7e5d2d03c9'; // "swing-100": the screener's 100 stocks
  const SETS = [
    ['last_date', 'close', 'tval', 'pct_1', 'pct_5', 'pct_20', 'm_dn_0', 'm_cn_5', 'nr_dn_0', 'nr_cn_5', 'f_dn_0', 'f_cn_5', 's_cn_5', 'i_cn_5', 'z_cn_5'],
    ['m_cn_20', 'nr_cn_20', 'f_cn_20', 's_cn_20', 'i_cn_20', 'z_cn_20', 'm_cn_50', 'nr_cn_50', 'f_cn_50', 's_cn_50', 'i_cn_50', 'z_cn_50', 's_dn_0', 'i_dn_0', 'z_dn_0'],
    ['is_liquid', 'is_crossing', 'is_pinky', 'clean_score', 'is_f_i_crossing', 'is_i_z_crossing', 'tektoker', 'top_5_buyer', 'top_5_seller', 'liquidity_type', 'is_consol', 'm_cn_10', 'nr_cn_10', 'f_cn_10', 'z_cn_10'],
    ['comp_m_short', 'comp_nr_short', 'comp_f_short', 'comp_s_short', 'comp_i_short', 'comp_z_short', 'comp_m_mid', 'comp_nr_mid', 'comp_f_mid', 'comp_s_mid', 'comp_i_mid', 'comp_z_mid', 's_cn_10', 'i_cn_10', 'f_c_20'],
  ];
  const H = { 'Content-Type': 'application/json', 'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const st = window.__nbPull = { phase: 'start', reads: 0, rows: 0, error: null };
  const date = (await fetch('/api/market-summary/last-update').then(r => r.json())).data;
  const rows = {};
  try {
    for (const cols of SETS) {
      const p = await fetch('/api/screeners/' + SCREENER, { method: 'PATCH', headers: H, body: JSON.stringify({ columns: cols, stock_universe_id: UNIVERSE }) }).then(r => r.json());
      if (!p.success) throw new Error('screener save: ' + p.message);
      await wait(3000);
      for (let page = 1, last = 1; page <= last; page++) {
        const r = await fetch('/api/market-summary/summary/' + SCREENER, { method: 'POST', headers: H, body: JSON.stringify({ page, size: 20, sort_field: 'symbol', sort_direction: 'asc' }) });
        const j = await r.json().catch(() => ({}));
        st.reads++;
        if (r.status === 429 || j.rate_limited || !j.success) throw new Error('stopped on page ' + page + ': ' + r.status + ' ' + (j.message || ''));
        last = (j.meta && j.meta.last_page) || 1;
        j.data.forEach(x => { rows[x.symbol] = Object.assign(rows[x.symbol] || {}, x); });
        st.phase = cols[0] + ' p' + page + '/' + last;
        await wait(4000 + Math.random() * 2000);
      }
    }
  } catch (e) { st.error = e.message; }
  const snap = { [date]: { pulledAt: new Date().toISOString(), complete: !st.error, rows } };
  st.rows = Object.keys(rows).length;
  window.__nbSnap = snap;
  st.phase = 'done';
  // Hand off to the local receiver. A public page may not fetch localhost, so open the receiver's own upload page with
  // the data in the URL fragment (never sent over the network); a localStorage copy stays here as a backup.
  try { localStorage.setItem('__nbSnapBackup', JSON.stringify(snap)); } catch (e) { /* quota */ }
  if (!st.error) location.href = 'http://127.0.0.1:5175/upload#' + encodeURIComponent('neobdm-snap/' + date + '.json|' + JSON.stringify(snap));
})();

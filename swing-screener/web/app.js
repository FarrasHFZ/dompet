(() => {
  const CFG = window.SCREENER_CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const LS = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } }, del: k => { try { localStorage.removeItem(k); } catch { /* ignore */ } } };

  // Everything from RSS/Sheets is untrusted text: always escape, and only allow http(s) links.
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => (/^https?:\/\//i.test(u) ? esc(u) : '#');
  const f0 = x => (x === null || x === undefined ? '–' : Math.round(x).toLocaleString('en-US'));
  const f1 = x => (x === null || x === undefined ? '–' : x.toFixed(1));
  const pc = (x, d = 1) => (x === null || x === undefined ? '<span class="mute">–</span>' : `<span class="${x > 0 ? 'up' : x < 0 ? 'down' : ''}">${x > 0 ? '+' : ''}${(x * 100).toFixed(d)}%</span>`);
  const ago = iso => { const h = (Date.now() - new Date(iso)) / 36e5; return h < 1 ? 'now' : h < 24 ? Math.round(h) + 'h ago' : Math.round(h / 24) + 'd ago'; };
  const arrow = s => (s > 0 ? '<span class="up">▲ supports</span>' : s < 0 ? '<span class="down">▼ risk</span>' : '<span class="mute">• neutral</span>');

  const TIER = { 'ACT+': 'Bounce candle + flow up', ACT: 'Bounce candle confirmed', 'ACT?': 'Bounce candle, but flow down', WAIT: 'Oversold, wait for a bounce candle', SKIP: 'NeoBDM veto' };
  const tierHtml = p => (p.tier && p.tier !== 'WATCH' ? '<span class="tier t' + (p.tier === 'ACT+' ? 'P' : p.tier === 'ACT?' ? 'Q' : p.tier) + '" title="' + esc(TIER[p.tier]) + '">' + esc(p.tier) + '</span>' : '');
  const flowF = x => (x == null ? '–' : (x > 0 ? '+' : '') + x.toFixed(1) + 'B');
  // Broker flow (NeoBDM, derived labels only). Groups in the order a trader reads them: big money first, retail last.
  const GROUPS = [['m', 'Bandar'], ['nr', 'Non-retail'], ['i', 'Institution'], ['s', 'Sultan'], ['f', 'Foreign'], ['z', 'Retail']];
  const dirCls = d => (/buy/.test(d) ? 'up' : /sell/.test(d) ? 'down' : 'mute');
  const dirHtml = d => `<span class="${dirCls(d || '')}">${esc(d || '–')}</span>`;
  const PHASE = { ACCUMULATION: 'Big money buying while price is weak', MARKUP: 'Big money buying, price rising', DISTRIBUTION: 'Big money selling while price holds', MARKDOWN: 'Big money selling, price falling', NEUTRAL: 'No clear big-money direction' };
  const phaseHtml = ph => `<span class="tag ph${esc(ph || 'NEUTRAL')}" title="${esc(PHASE[ph] || '')}">${esc((ph || 'n/a').toLowerCase())}</span>`;
  const mixHtml = m => (m ? `${m.foreign} foreign · ${m.retail} retail · ${m.other} other` : '–');
  // Bandarmetrics read (context only: tools/experiment-bm.mjs found no edge for ACT trades, so it never changes a badge).
  const BMREAD = { ACCUM_CONFIRMED: ['Accumulation, confirmed', 'up'], ACCUM_BUILDING: ['Accumulation building', 'up'], DISTRIB_CONFIRMED: ['Distribution, confirmed', 'down'], DISTRIB_STARTING: ['Distribution starting', 'down'], HIDDEN_DISTRIBUTION: ['Hidden distribution', 'down'], CHURN: ['Churn, no direction', 'mute'], FLAT: ['Flat, no pressure', 'mute'], UNKNOWN: ['Not enough data', 'mute'] };
  const BAND = { green: ['efficient', 'up'], yellow: ['fading', 'warn'], red: ['churn', 'down'] };
  const bmReadHtml = b => { const r = BMREAD[b.read] || [b.read, 'mute']; return `<span class="${r[1]}">${esc(r[0])}</span>`; };
  const bandHtml = b => { const x = BAND[b && b.band]; return x ? `<span class="${x[1]}">${x[0]}</span>` : '<span class="mute">–</span>'; };
  const bmHtml = p => {
    const b = p.bm;
    if (!b) return '<p class="muted">No Bandarmetrics data for this ticker.</p>';
    return `<div class="kv">
        <div><small>Read</small><b>${bmReadHtml(b)}</b></div>
        <div><small>LPM (direction)</small><b class="${b.lpm === 'rising' ? 'up' : b.lpm === 'falling' ? 'down' : ''}">${esc(b.lpm)}</b>${b.quiet ? '<div class="muted">rising while price fell</div>' : ''}</div>
        <div><small>Flow lens: ${esc(b.lens)}</small><b class="${b.lensDir === 'up' ? 'up' : b.lensDir === 'down' ? 'down' : ''}">${esc(b.lensDir)}</b><div class="muted">${b.foreignDriven ? 'foreign-driven stock' : 'locally-driven stock'}</div></div>
        <div><small>Intensity (timing)</small><b>${b.spike ? 'spike, last 3 days' : 'quiet'}</b></div>
        <div><small>Volume Rotation</small><b>${bandHtml(b)}</b></div></div>
      <p class="muted">Bandarmetrics data of ${esc(b.asOf)}${b.stale ? ' <b>(stale)</b>' : ''}. Directions only. Context, not a signal: over 4 years and 100 stocks this read did not separate winning from losing ACT trades (see the Broker flow tab), so it does not change the badge. Most useful as a warning: LPM falling means large-order pressure is still on the sell side.</p>`;
  };
  const nbHtml = p => {
    const n = p.neobdm;
    if (!n) return '<p class="muted">NeoBDM has no row for this ticker.</p>';
    const tagCls = n.tag === 'FLOW+' ? 'up' : n.tag === 'FLOW-' || n.tag === 'AVOID' ? 'down' : '';
    const grid = n.groups ? `<div class="scroll"><table><thead><tr><th>Group</th><th>5 days</th><th>20 days</th><th>Method fits?</th></tr></thead><tbody>
      ${GROUPS.map(([k, l]) => n.groups[k] ? `<tr><td>${l}</td><td>${dirHtml(n.groups[k].d5)}</td><td>${dirHtml(n.groups[k].d20)}</td><td class="${n.groups[k].compat ? '' : 'mute'}">${n.groups[k].compat ? 'yes' : 'weak (half weight)'}</td></tr>` : '').join('')}</tbody></table></div>
      <p class="muted">Today's top 5 net buyers: ${mixHtml(n.brokers && n.brokers.buyers)}. Top 5 net sellers: ${mixHtml(n.brokers && n.brokers.sellers)}.</p>` : '';
    return `<p><span class="tag ${n.tag === 'AVOID' ? 'RISK' : ''}">${esc(n.tag)}</span> ${n.phase ? phaseHtml(n.phase) : ''} <span class="${tagCls}">${esc(n.note)}</span></p>${grid}
      <p class="muted">From NeoBDM data of ${esc(n.asOf)}${n.stale ? ' <b>(stale: no longer used for the badge)</b>' : ''}. Directions only; raw numbers are not published. Flow is the group's net buy as a share of turnover. It can veto (Pinky, illiquid) or annotate a pick; it cannot promote one until its forward test passes (see the Broker flow tab).</p>`;
  };

  const MQ = window.matchMedia('(max-width: 760px)');
  MQ.addEventListener('change', () => { if (DATA) renderPicks(); });
  let DATA = null, PQ = '', FILTER = 'ACT', OPEN = null, NEWSCAT = 'ALL', NEWSQ = '', HIDEWRAP = true;

  async function load() {
    const url = LS.get('sheetUrl'), token = LS.get('sheetToken');
    let src = 'GitHub snapshot';
    let j;
    try {
      if (url && token) {
        const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token));
        j = await r.json();
        if (j.error) throw new Error(j.error);
        src = 'My Google Sheet';
      } else throw new Error('snapshot');
    } catch (e) {
      const r = await fetch(CFG.SNAPSHOT_URL + '?t=' + Date.now());
      if (!r.ok) throw new Error('Could not load ' + CFG.SNAPSHOT_URL);
      j = await r.json();
      if (url && token) src = 'GitHub snapshot (Sheet unreachable)';
    }
    DATA = j;
    $('#srcPill').textContent = src;
    render();
  }

  function render() {
    const m = DATA.meta, k = DATA.market || {};
    const sess = m.session && m.session.state === 'open' ? 'IDX open · live quotes' : 'IDX closed';
    const newest = (DATA.news || []).reduce((t, n) => Math.max(t, +new Date(n.published)), 0);
    $('#sub').textContent = `${sess} · refreshed ${ago(m.generatedAt)}${newest ? ' · newest headline ' + ago(new Date(newest).toISOString()) : ''} · scores from ${m.asOf || 'latest'} close · target +${m.params.targetPct}% in ${m.params.horizon}d`;
    $('#market').innerHTML = `
      <div class="stat"><small>Regime</small><b>${esc(k.regime || '–')}</b><div class="meter"><i style="width:${Math.round((k.breadth || 0) * 100)}%"></i></div></div>
      <div class="stat"><small>Oversold now (score ≥ ${m.actScore})</small><b>${k.oversoldCount ?? '–'} / ${k.of ?? '–'}</b></div>
      <div class="stat"><small>IHSG${k.idxLive ? ' (live)' : ''}</small><b>${f0(k.idxLive ? k.idxLive.price : k.idxClose)}</b>${k.idxLive ? ` <span class="muted">${pc(k.idxLive.chg, 2)}</span>` : ''}</div>
      <div class="stat"><small>IHSG RSI(14) · 20d</small><b>${k.idxRsi == null ? '–' : k.idxRsi.toFixed(0)} · ${k.idxChg20d == null ? '–' : (k.idxChg20d * 100).toFixed(1) + '%'}</b></div>`;
    const ns = m.newsStatus;
    $('#banner').innerHTML = ns && ns.state !== 'ok' ? `<div class="note"><b>News ${esc(ns.state)}.</b> ${esc(ns.note)}</div>` : '';
    renderPicks(); renderFlow(); renderNews(); renderScore(); renderHow();
  }

  // ---------- broker flow ----------
  let FLOWPH = 'ALL', FLOWQ = '', FLOWACT = false;
  function scorecardHtml(sc) {
    if (!sc || !sc.snapshots) return '<div class="card empty">No forward-test snapshots scored yet.</div>';
    const h = sc.horizons['5'] || {}, rows = Object.entries({ ...(h.tags || {}), ...(h.phases || {}) });
    const t = x => (x == null ? '–' : x.toFixed(1));
    return `<p class="muted">${sc.snapshots} daily snapshot${sc.snapshots === 1 ? '' : 's'}, ${esc(sc.firstSnap)} to ${esc(sc.lastSnap)}. Outcome: buy at the next open, sell 5 sessions later, after 0.4% fees. "Excess" removes the market's move (all 100 stocks' average that day).</p>
      <div class="card scroll"><table><thead><tr><th>Label</th><th class="n">Stock-days</th><th class="n">Days</th><th class="n">Avg net</th><th class="n">Excess</th><th class="n">t</th></tr></thead><tbody>
      ${rows.map(([k, g]) => `<tr><td>${esc(k)}</td><td class="n">${g.n}</td><td class="n">${g.days}</td><td class="n">${g.n ? pc(g.avgNet, 2) : '–'}</td><td class="n">${g.n ? pc(g.avgExcess, 2) : '–'}</td><td class="n">${t(g.t)}</td></tr>`).join('')}</tbody></table></div>
      <h3>Promotion checklist ${sc.promotion.promoted ? '<span class="tag">passed</span>' : '<span class="tag RISK">not yet</span>'}</h3>
      <ul class="checks">${sc.promotion.checks.map(c => `<li class="${c.ok ? 'up' : 'mute'}">${c.ok ? '✓' : '○'} ${esc(c.rule)} <span class="muted">(${esc(JSON.stringify(c.value))})</span></li>`).join('')}</ul>`;
  }
  function bmBtHtml(bm) {
    const x = bm && bm.experiment;
    if (!x) return '<p class="muted">Not run yet (tools/experiment-bm.mjs).</p>';
    const t = v => (v == null ? '–' : v.toFixed(1));
    return `<p class="muted">LPM, Intensity, Volume Rotation and Money Flow from Bandarmetrics, ${esc(x.from)} to ${esc(x.to)}, ${x.act.toLocaleString()} ACT signals. The tests and pass bars were written down before the first run. Each needs a high enough t both with one trade per episode and by day, plus a positive gap on the 73 unseen stocks and in both halves. ${x.results.some(r => r.pass) ? '' : '<b>None passed</b>, so the read is shown as context and never changes a badge. Exploratory checks at 20, 40 and 60 sessions and across all stocks found no significant edge either.'}${bm.stale ? ' Labels are stale (' + esc(bm.asOf) + ').' : ''}</p>
      <div class="card scroll"><table><thead><tr><th>Test (A vs B)</th><th class="n">Gap per trade</th><th class="n">t, episodes</th><th class="n">t, by day</th><th class="n">Unseen</th><th class="n">1st / 2nd half</th><th>Result</th></tr></thead><tbody>
      ${x.results.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${pc(r.gapEpisodes, 2)}</td><td class="n">${t(r.tEpisodes)}</td><td class="n">${t(r.tByDay)}</td><td class="n">${pc(r.unseen, 2)}</td><td class="n">${pc(r.firstHalf, 1)} / ${pc(r.secondHalf, 1)}</td><td>${r.pass ? '<span class="up">pass</span>' : '<span class="mute">fail (bar ' + r.bar + ')</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function foreignBtHtml(fb) {
    if (!fb) return '<p class="muted">Not run yet: needs the IDX daily history (tools/idx-flow-import.mjs).</p>';
    return `<p class="muted">${esc(fb.summary)}</p>${fb.rows ? `<p class="muted">Trades overlap (a stock oversold for a week gives several), so these averages are descriptive; the corrected test is in the line above.</p><div class="card scroll"><table><thead><tr><th>ACT signals</th><th class="n">Trades</th><th class="n">Avg net (wide stop)</th><th class="n">Hit target</th></tr></thead><tbody>
      ${fb.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="n">${r.n}</td><td class="n">${pc(r.avg, 2)}</td><td class="n">${pct1(r.win)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  }
  function renderFlow() {
    const el = $('#tab-flow'), F = DATA.flow || {};
    const P = DATA.picks.filter(p => p.neobdm);
    if (!P.length) { el.innerHTML = '<div class="card empty">No NeoBDM snapshot in this build.</div>'; return; }
    const q = FLOWQ.trim().toLowerCase();
    const cnt = ph => P.filter(p => p.neobdm.phase === ph).length;
    const order = { 'FLOW+': 0, 'FLOW~': 1, 'FLOW-': 2, AVOID: 3 };
    const list = P.filter(p => (FLOWPH === 'ALL' || p.neobdm.phase === FLOWPH) && (!FLOWACT || p.action === 'ACT') && (!q || p.ticker.toLowerCase().includes(q) || p.sector.toLowerCase().includes(q)))
      .sort((a, b) => order[a.neobdm.tag] - order[b.neobdm.tag] || (b.neobdm.pts || 0) - (a.neobdm.pts || 0));
    const g = (p, k, w) => dirHtml(p.neobdm.groups && p.neobdm.groups[k] && p.neobdm.groups[k][w]);
    el.innerHTML = `
      ${F.stale ? `<div class="note"><b>Flow data is stale (${esc(F.asOf)}).</b> Labels are shown for reference but no longer change any badge. Run the daily NeoBDM pull.</div>` : ''}
      <p class="muted">NeoBDM broker flow of ${esc(F.asOf || '–')}, read the same way every day (rules fixed in <code>tools/flow-model.mjs</code>). <b>Big money</b> = Bandar, Non-retail, Institution and Sultan combined; <b>retail</b> is read as the other side of the trade. A phase compares big money's 20-day flow with the 20-day price move.</p>
      <div class="chips" role="group" aria-label="Phase">
        ${['ALL', 'ACCUMULATION', 'MARKUP', 'DISTRIBUTION', 'MARKDOWN', 'NEUTRAL'].map(ph => `<button class="chip" data-ph="${ph}" aria-pressed="${FLOWPH === ph}">${ph === 'ALL' ? 'All (' + P.length + ')' : ph.toLowerCase() + ' (' + cnt(ph) + ')'}</button>`).join('')}
        <label class="muted"><input type="checkbox" id="fact" ${FLOWACT ? 'checked' : ''}> ACT only</label>
        <input type="search" id="fq" placeholder="Ticker or sector" value="${esc(FLOWQ)}" style="max-width:200px;margin-left:auto">
      </div>
      <div class="card scroll"><table><thead><tr><th>Ticker</th><th>Flow</th><th>Phase</th><th>Big money 20d / 5d</th><th>Bandar 20d</th><th>Foreign 5d / 20d</th><th>Retail 20d</th><th>Transfer</th><th>BM read</th><th>Rotation</th><th>Pick</th></tr></thead><tbody>
      ${list.length ? list.map(p => { const n = p.neobdm; return `<tr><td><b class="tk">${esc(p.ticker)}</b><div class="nm">${esc(p.sector)}</div></td>
        <td><span class="tag ${n.tag === 'AVOID' ? 'RISK' : ''}">${esc(n.tag)}</span></td><td>${phaseHtml(n.phase)}${n.turn ? `<div class="muted">${esc(n.turn)}</div>` : ''}</td>
        <td>${dirHtml(n.bigMoney && n.bigMoney.d20)} / ${dirHtml(n.bigMoney && n.bigMoney.d5)}</td>
        <td>${g(p, 'm', 'd20')}</td><td>${g(p, 'f', 'd5')} / ${g(p, 'f', 'd20')}</td><td>${g(p, 'z', 'd20')}</td>
        <td class="muted">${esc(n.retail)}${n.dirty ? '<div class="down">dirty tape</div>' : ''}</td>
        <td>${p.bm ? bmReadHtml(p.bm) + (p.bm.spike ? '<div class="muted">Intensity spike</div>' : '') : '<span class="mute">–</span>'}</td><td>${bandHtml(p.bm)}</td>
        <td><span class="act ${p.action}">${p.action}</span> ${tierHtml(p)}</td></tr>`; }).join('') : '<tr><td colspan="11" class="empty">Nothing matches.</td></tr>'}</tbody></table></div>
      <h2>Does broker flow help? Forward test</h2>
      <div class="note"><b>Why a forward test.</b> NeoBDM shows only today's numbers, so the flow read cannot be backtested. Every trading day a snapshot is saved and scored later. Flow may start changing badges only after the checklist below passes (earliest around mid-January 2027). The rules were fixed on 2026-10-09, before any forward result, and correct t for overlapping holding periods.</div>
      ${scorecardHtml(F.scorecard)}
      <h2>Foreign flow: 4-year backtest (IDX data)</h2>
      ${foreignBtHtml(F.foreignBacktest)}
      <h2>Bandarmetrics read: 4-year backtest</h2>
      ${bmBtHtml(F.bm)}`;
    el.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => { FLOWPH = b.dataset.ph; renderFlow(); });
    $('#fact', el).onchange = e => { FLOWACT = e.target.checked; renderFlow(); };
    $('#fq', el).oninput = e => { FLOWQ = e.target.value; const pos = e.target.selectionStart; renderFlow(); const i = $('#fq'); i.focus(); i.setSelectionRange(pos, pos); };
  }

  // ---------- picks ----------
  function renderPicks() {
    const el = $('#tab-picks');
    const P = DATA.picks;
    const cnt = a => P.filter(p => p.action === a).length;
    const q = PQ.trim().toLowerCase();
    const list = (FILTER === 'ALL' ? P : P.filter(p => p.action === FILTER)).filter(p => !q || p.ticker.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.sector.toLowerCase().includes(q));
    const sel = P.find(x => x.ticker === OPEN);
    const detail = s => `<div class="card pad detailcard" id="dcard"><div class="dhead"><b class="tk">${esc(s.ticker)}</b> <span class="muted">${esc(s.name)} · ${esc(s.sector)}</span><button class="ghost" id="dclose">Close</button></div>${detailHtml(s)}</div>`;
    const empty = '<div class="card empty">Nothing in this filter today.</div>';
    const body = MQ.matches
      ? `<div class="cards">${list.length ? list.map(p => cardHtml(p) + (p.ticker === OPEN ? detail(p) : '')).join('') : empty}</div>`
      : `${sel ? detail(sel) : ''}<div class="card scroll"><table>
        <thead><tr><th>Ticker</th><th>Action</th><th>Score</th><th>Setup</th><th class="n">Close</th><th class="n">Live</th><th class="n">1D</th><th class="n">5D</th><th class="n">RSI</th><th class="n">vs SMA20</th><th class="n">Stop</th><th class="n">Target</th><th class="n">R/R</th><th>News</th><th>Top headline</th></tr></thead>
        <tbody>${list.length ? list.map(rowHtml).join('') : '<tr><td colspan="15" class="empty">Nothing in this filter today.</td></tr>'}</tbody>
      </table></div>`;
    el.innerHTML = `
      <div class="chips" role="group" aria-label="Filter">
        ${[['ACT', `ACT (${cnt('ACT')})`], ['WATCH', `Watch (${cnt('WATCH')})`], ['ALL', `All (${P.length})`]]
          .map(([v, l]) => `<button class="chip" data-f="${v}" aria-pressed="${FILTER === v}">${l}</button>`).join('')}
        <input type="search" id="pq" placeholder="Search ticker, name or sector" value="${esc(PQ)}" style="max-width:240px;margin-left:auto">
      </div>
      <p class="muted hint">ACT = oversold-bounce score ≥ ${DATA.meta.actScore}. Badges: <b>ACT</b> bounce candle seen, <b>ACT+</b> and flow up, <b>ACT?</b> flow down, <b>WAIT</b> no bounce candle yet, <b>SKIP</b> NeoBDM veto (Pinky or illiquid). Few days have any; "none today" is a valid answer.</p>
      ${body}`;
    const toggle = t => { OPEN = OPEN === t ? null : t; renderPicks(); const d = $('#dcard'); if (OPEN && d) d.scrollIntoView({ block: MQ.matches ? 'nearest' : 'start', behavior: 'smooth' }); };
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { FILTER = b.dataset.f; OPEN = null; renderPicks(); });
    el.querySelectorAll('tr.row, .pcard').forEach(n => n.onclick = e => { if (e.target.closest('a')) return; toggle(n.dataset.t); });
    const dc = $('#dclose', el); if (dc) dc.onclick = () => { OPEN = null; renderPicks(); };
    const pq = $('#pq', el); if (pq) pq.oninput = e => { PQ = e.target.value; const pos = e.target.selectionStart; renderPicks(); const i = $('#pq'); i.focus(); i.setSelectionRange(pos, pos); };
    el.querySelectorAll('[data-news]').forEach(b => b.onclick = () => { NEWSPERIOD = '30d'; NEWSQ = b.dataset.news; NEWSCAT = 'ALL'; NEWSLIMIT = 120; renderNews(); document.querySelector('[data-tab=news]').click(); });
  }

  // Phone layout: one card per stock instead of a 15-column table.
  function cardHtml(p) {
    const h = p.headlines[0];
    return `<article class="pcard ${OPEN === p.ticker ? 'open' : ''}" data-t="${esc(p.ticker)}">
      <div class="ptop"><div><b class="tk">${esc(p.ticker)}</b> <span class="act ${p.action}">${p.action}</span> ${tierHtml(p)}
        <div class="nm">${esc(p.name)}${p.ownership ? ' · ' + esc(p.ownership.control) : ''}</div></div>
        <div class="pscore"><b>${p.score}</b><small>score</small></div></div>
      <div class="pmid">
        <div><small>${p.live ? 'Live' : 'Close'}</small><b>${f0(p.live ? p.live.price : p.close)}</b> ${p.live ? pc(p.live.chg) : pc(p.chg1d)}</div>
        <div><small>RSI · vs SMA20</small><b>${p.rsi == null ? '–' : p.rsi.toFixed(0)}</b> <span class="muted">${p.dist20Atr.toFixed(1)} ATR</span></div>
        <div><small>Stop → Target</small><b>${f0(p.action === 'ACT' && p.wideStop ? p.wideStop : p.stop)} → ${f0(p.target)}</b></div>
      </div>
      <div class="phl">${arrow(p.newsScore)} ${h ? `<a href="${safeUrl(h.link)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}</a>` : '<span class="mute">no recent news</span>'}</div>
    </article>`;
  }

  function rowHtml(p) {
    const h = p.headlines[0];
    const open = OPEN === p.ticker;
    return `<tr class="row ${open ? 'open' : ''}" data-t="${esc(p.ticker)}">
      <td><span class="tk">${esc(p.ticker)}</span><div class="nm">${esc(p.name)}${p.ownership ? " · " + esc(p.ownership.control) : ""}</div></td>
      <td><span class="act ${p.action}">${p.action}</span> ${tierHtml(p)}</td>
      <td><span class="score"><i style="width:${Math.round(p.score * 0.6)}px"></i><b>${p.score}</b></span></td>
      <td>${esc(p.setup)}</td><td class="n">${f0(p.close)}</td><td class="n">${p.live ? `${f0(p.live.price)} ${pc(p.live.chg)}` : '<span class="mute">–</span>'}</td><td class="n">${pc(p.chg1d)}</td><td class="n">${pc(p.chg5d)}</td>
      <td class="n">${p.rsi == null ? '–' : p.rsi.toFixed(0)}</td><td class="n">${p.dist20Atr.toFixed(1)} ATR</td>
      <td class="n">${f0(p.stop)}</td><td class="n">${f0(p.target)}</td><td class="n">${p.rr == null ? '–' : p.rr.toFixed(1)}</td>
      <td>${arrow(p.newsScore)}</td>
      <td class="hl">${h ? `<a href="${safeUrl(h.link)}" target="_blank" rel="noopener noreferrer"><span class="tag ${esc(h.category)}">${esc(h.category)}</span> ${esc(h.title)}</a>` : '<span class="mute">no recent news</span>'}</td>
    </tr>`;
  }

  function chartSvg(p) {
    const W = 560, H = 230, L = 8, R = 62, T = 10, B = 18;
    const lv = [['Target', p.target, 'var(--accent)'], ['Resistance', p.resistance, 'var(--down)'], ['SMA20', p.sma20, 'var(--mute)'], ['Support', p.support, 'var(--up)'], ['Stop', p.stop, 'var(--warn)']];
    const vals = p.spark.concat(lv.map(x => x[1]).filter(x => x != null));
    const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.05;
    const y = v => T + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - T - B);
    const x = i => L + (i / (p.spark.length - 1)) * (W - L - R);
    const line = p.spark.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const lines = lv.filter(l => l[1] != null).map(l => `<line x1="${L}" x2="${W - R}" y1="${y(l[1])}" y2="${y(l[1])}" stroke="${l[2]}" stroke-dasharray="4 3" opacity=".85"/><text x="${W - R + 4}" y="${y(l[1]) + 3}" fill="${l[2]}">${l[0]} ${f0(l[1])}</text>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.ticker)} last 90 closes with support, resistance, stop and target">
      ${lines}<path d="${line}" fill="none" stroke="var(--ink)" stroke-width="1.8"/>
      <circle cx="${x(p.spark.length - 1)}" cy="${y(p.close)}" r="3.5" fill="var(--accent)"/>
      <text x="${L}" y="${H - 4}">${esc(p.sparkFrom)}</text><text x="${W - R - 54}" y="${H - 4}">${esc(p.sparkTo)}</text></svg>`;
  }

  function ownHtml(o) {
    if (!o) return '<p class="muted">No ≥1% holder record for this ticker in the latest monthly file.</p>';
    const mix = Object.entries(o.typeMix || {}).sort((a, b) => b[1] - a[1]);
    const chg = o.changes;
    return `<p><span class="tag ${o.coverage === 'low' ? 'RISK' : ''}">${esc(o.control)}</span> ${esc(o.note)}</p>
      <div class="mix" role="img" aria-label="Holder type mix">${mix.map(([k, v]) => `<i style="flex:${v}" title="${esc(k)} ${v}%"></i>`).join('')}</div>
      <p class="muted">${mix.map(([k, v]) => `${esc(k)} ${v}%`).join(' · ')}</p>
      <div class="scroll"><table><thead><tr><th>Holder (≥1%)</th><th>Type</th><th class="n">%</th></tr></thead><tbody>
      ${o.holders.map(h => `<tr><td>${esc(h.name)}${h.foreign ? ' <span class="tag">foreign</span>' : ''}</td><td>${esc(h.type)}</td><td class="n">${h.pct.toFixed(2)}</td></tr>`).join('')}</tbody></table></div>
      ${chg ? (chg.length ? `<p><b>Since last month:</b> ${chg.map(c => c.kind === 'new' ? `<span class="up">+ ${esc(c.name)} (${c.to}%)</span>` : c.kind === 'exit' ? `<span class="down">− ${esc(c.name)} exited (was ${c.from}%)</span>` : `${esc(c.name)} ${c.from}% → ${c.to}%`).join('; ')}</p>` : '<p class="muted">No holder moved by 0.5 points or more since last month.</p>') : '<p class="muted">Month-over-month changes appear once a second monthly file is available.</p>'}
      <p class="muted">Monthly data shows who holds, not who is buying today. Custodian accounts can hide the real owner.</p>`;
  }

  const idr = x => (x == null ? '–' : Math.abs(x) >= 1e12 ? (x / 1e12).toFixed(1) + 'T' : (x / 1e9).toFixed(0) + 'B');
  function fundHtml(f) {
    if (!f) return '<p class="muted">No quarterly financials from the free source for this ticker.</p>';
    const flags = f.flags.map(x => `<span class="tag ${x.startsWith('Profit up') ? '' : 'RISK'}">${esc(x)}</span>`).join(' ');
    const rows = f.quarters.map(q => `<tr><td>${esc(q.date)}</td><td class="n">${idr(q.rev)}</td><td class="n ${q.ni < 0 ? 'down' : ''}">${idr(q.ni)}</td><td class="n">${q.rev && q.ni != null ? (q.ni / q.rev * 100).toFixed(1) + '%' : '–'}</td></tr>`).join('');
    const yoy = f.yoy == null ? 'YoY n/a' : (f.yoy >= 0 ? '+' : '') + (f.yoy * 100).toFixed(0) + '% YoY';
    return `${flags ? `<p>${flags}</p>` : ''}
      <div class="scroll"><table><thead><tr><th>Quarter</th><th class="n">Revenue</th><th class="n">Net income</th><th class="n">Margin</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted">Rp, per quarter (not cumulative). Latest net income ${yoy}. Free vendor data, last ~5 quarters, unaudited; a bank's "revenue" is not comparable with other sectors. Context only, not part of the score.</p>`;
  }

  function detailHtml(p) {
    const parts = p.parts, max = { oversold: 80, support: 10, news: 10 };
    return `<div class="dgrid"><div>${chartSvg(p)}
      <div class="parts">${Object.keys(parts).map(k => `<div class="part"><span>${esc(k)}</span><div class="bar"><i style="width:${Math.min(100, (parts[k] / (max[k] || 10)) * 100)}%"></i></div><em>${parts[k]}</em></div>`).join('')}</div>
      <p class="muted">Score parts: oversold-ness (RSI, 5-day drop, distance under the 20d average) is the backtested driver; support proximity and news are secondary.</p></div>
      <div><div class="kv">
        <div><small>Entry</small><b>${f0(p.entry)}</b></div><div><small>Stop</small><b class="down">${f0(p.stop)}</b></div><div><small>Target +${DATA.meta.params.targetPct}%</small><b class="up">${f0(p.target)}</b></div>
        <div><small>Bounce target (SMA20)</small><b>${f0(p.targetMR)}</b></div><div><small>${p.supportTouches ? 'Support (' + p.supportTouches + '×)' : 'Support (52w low)'}</small><b>${f0(p.support)}</b></div><div><small>${p.resistanceTouches ? 'Resistance (' + p.resistanceTouches + '×)' : 'Resistance (52w high)'}</small><b>${f0(p.resistance)}</b></div>
        <div><small>Own hit rate*</small><b>${p.hitRate == null ? '–' : Math.round(p.hitRate * 100) + '%'}</b></div><div><small>Value / day</small><b>Rp ${p.valueB.toFixed(0)}B</b></div><div><small>ATR %</small><b>${(p.atrPct * 100).toFixed(1)}%</b></div></div>
        <div class="narr">${esc(p.narrative)}</div>
        <small class="muted">*How often this stock hit +${DATA.meta.params.targetPct}% before the stop within ${DATA.meta.params.horizon}d in its own last year (n=${p.hitN}). Informational only: it did not predict anything in the backtest.</small>
        <h2>Why it matters: news</h2>
        ${p.headlines.length ? `<ul class="hl-list">${p.headlines.map(h => `<li><span class="tag ${esc(h.category)}">${esc(h.category)}</span><span><a href="${safeUrl(h.link)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}</a><div class="muted">${ago(h.published)} · ${h.direct ? 'names this stock' : 'sector-wide'} · ${h.sentiment > 0 ? 'supports' : h.sentiment < 0 ? 'risk' : 'neutral'}</div></span></li>`).join('')}</ul>` : '<p class="muted">No scored headlines in the last 7 days.</p>'}
        <button class="chip" data-news="${esc(p.ticker)}">All 30-day headlines for ${esc(p.ticker)} →</button>
        <h2>NeoBDM flow</h2>${nbHtml(p)}
        <h2>Bandarmetrics read</h2>${bmHtml(p)}
        ${p.action === 'ACT' ? `<p class="muted"><b>Backtested plan for ACT:</b> wait for a bounce candle (${p.confirm ? 'seen today' : 'not yet'}) and use the wider stop ${f0(p.wideStop)} (3.5 ATR) instead of ${f0(p.stop)}. In 5 years × 100 stocks this took ACT from -0.2% to about +1.0% per trade, versus -0.7% for the rest.</p>` : ''}
        <h2>Who owns it</h2>${ownHtml(p.ownership)}
        <h2>Earnings (P&L)</h2>${fundHtml(p.fundamentals)}</div></div>`;
  }

  // ---------- news ----------
  let ARCH = null, ARCH_LOADING = false, NEWSPERIOD = '7d', NEWSLIMIT = 120;
  async function loadArchive() {
    if (ARCH || ARCH_LOADING) return;
    ARCH_LOADING = true;
    try {
      const r = await fetch('data/news-30d.json?t=' + Math.floor(Date.now() / 600000));
      const j = await r.json();
      ARCH = j.rows.map(c => ({ published: new Date(c[0] * 1000).toISOString(), source: c[1], title: c[2], link: c[3], category: c[4], tickers: c[5] ? c[5].split(',') : [], sectors: c[6] ? c[6].split(',') : [], sentiment: c[7], roundup: !!c[8] }))
        .sort((a, b) => new Date(b.published) - new Date(a.published));
    } catch { ARCH = []; }
    ARCH_LOADING = false;
    renderNews();
  }

  function coverageHtml(c) {
    if (!c) return '';
    const max = Math.max(1, ...c.perDay);
    const bars = c.perDay.map((v, i) => `<i style="height:${Math.max(2, Math.round(v / max * 34))}px" title="${v} headlines, ${30 - i - 1} days ago"></i>`).join('');
    const pending = c.backfilled < c.keys;
    return `<div class="card pad cov"><div class="covhead"><b>${c.headlines.toLocaleString()}</b> headlines in the last ${c.days} days · <b>${c.tickersCovered}/${c.tickers}</b> stocks have news · <b>${c.daysWithNews}/${c.days}</b> days covered${c.oldest ? ' · since ' + esc(c.oldest) : ''}</div>
      <div class="bars" role="img" aria-label="Headlines per day, last 30 days">${bars}</div>
      <div class="muted">${pending ? `Month history is still filling in (${c.backfilled}/${c.keys} sources done; finishes within a few hourly runs). ` : ''}${c.thin.length ? `Quiet or thin (under 3 headlines): ${c.thin.slice(0, 14).map(esc).join(', ')}${c.thin.length > 14 ? ' +' + (c.thin.length - 14) : ''}. ` : ''}${esc(c.note)}</div></div>`;
  }

  function renderNews() {
    const el = $('#tab-news');
    const cats = ['ALL', 'GOV_INVEST', 'COMMISSIONER', 'INSIDER', 'CORP_ACTION', 'CONTRACT', 'EARNINGS', 'MACRO', 'RISK', 'OTHER'];
    const periods = [['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days']];
    if (NEWSPERIOD === '30d') loadArchive();
    const base = NEWSPERIOD === '30d' ? (ARCH || []) : (DATA.news || []);
    const horizon = Date.now() - (NEWSPERIOD === '24h' ? 1 : NEWSPERIOD === '7d' ? 7 : 30) * 864e5;
    let N = base.filter(n => +new Date(n.published) >= horizon);
    if (NEWSCAT !== 'ALL') N = N.filter(n => n.category === NEWSCAT);
    if (HIDEWRAP) N = N.filter(n => !n.roundup);
    if (NEWSQ) { const q = NEWSQ.toLowerCase(); N = N.filter(n => n.title.toLowerCase().includes(q) || n.tickers.join(' ').toLowerCase().includes(q)); }
    const shown = N.slice(0, NEWSLIMIT);
    const loading = NEWSPERIOD === '30d' && !ARCH;
    el.innerHTML = `
      ${coverageHtml(DATA.meta.newsCoverage)}
      <div class="chips" style="margin-top:12px">${periods.map(([v, l]) => `<button class="chip" data-p="${v}" aria-pressed="${NEWSPERIOD === v}">${l}</button>`).join('')}</div>
      <div class="chips">${cats.map(c => `<button class="chip" data-c="${c}" aria-pressed="${NEWSCAT === c}">${c === 'ALL' ? 'All' : c.replace('_', ' ')}</button>`).join('')}</div>
      <div class="chips"><input type="search" id="nq" placeholder="Filter by ticker or word" value="${esc(NEWSQ)}" style="max-width:280px">
        <label class="muted"><input type="checkbox" id="hw" ${HIDEWRAP ? 'checked' : ''}> hide market wraps</label></div>
      <div class="card">${loading ? '<div class="empty">Loading the 30-day archive…</div>' : shown.length ? shown.map(n => `<div class="nrow">
        <div class="muted">${NEWSPERIOD === '30d' ? esc(n.published.slice(5, 10)) + ' · ' : ''}${ago(n.published)}</div>
        <div><span class="tag ${esc(n.category)}">${esc(n.category.replace('_', ' '))}</span></div>
        <div><a class="t" href="${safeUrl(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
          <div class="muted">${esc(n.source)}${n.tickers.length ? ' · ' + n.tickers.map(esc).join(', ') : ''}${!n.tickers.length && n.sectors.length ? ' · sector: ' + n.sectors.map(esc).join(', ') : ''}</div></div>
        <div>${arrow(n.sentiment)}</div></div>`).join('') : '<div class="empty">No headlines match.</div>'}</div>
      <div class="chips" style="margin-top:10px">${N.length > shown.length ? '<button class="chip" id="more">Show 200 more</button>' : ''}<span class="muted">${N.length} match, showing ${shown.length}. Categories and direction come from keyword rules (see Track record for measured accuracy). Links open the original publisher through Google News.</span></div>`;
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { NEWSCAT = b.dataset.c; NEWSLIMIT = 120; renderNews(); });
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { NEWSPERIOD = b.dataset.p; NEWSLIMIT = 120; renderNews(); });
    const more = $('#more', el); if (more) more.onclick = () => { NEWSLIMIT += 200; renderNews(); };
    $('#nq', el).oninput = e => { NEWSQ = e.target.value; const pos = e.target.selectionStart; renderNews(); const i = $('#nq'); i.focus(); i.setSelectionRange(pos, pos); };
    $('#hw', el).onchange = e => { HIDEWRAP = e.target.checked; renderNews(); };
  }

  // ---------- scorecard ----------
  function bucketTable(s) {
    return `<div class="scroll"><table><thead><tr><th>Score</th><th class="n">Samples</th><th class="n">Hit +8% before stop</th><th class="n">Avg 15d return</th></tr></thead><tbody>
      ${s.buckets.map(b => `<tr><td>${esc(b.label)}</td><td class="n">${b.n.toLocaleString()}</td><td class="n">${b.hit == null ? '–' : (b.hit * 100).toFixed(1) + '%'}</td><td class="n">${pc(b.fwd, 2)}</td></tr>`).join('')}
      <tr><td class="mute">All (baseline)</td><td class="n mute">${s.n.toLocaleString()}</td><td class="n mute">${(s.baselineHit * 100).toFixed(1)}%</td><td class="n">${pc(s.baselineFwd, 2)}</td></tr></tbody></table></div>
      <p class="muted pad">Rank correlation of score vs next-15d return (monthly): ${s.ic.toFixed(3)} (t=${s.icT.toFixed(1)}); positive in ${Math.round(s.icMonthsPositive * 100)}% of months.</p>`;
  }
  // ---------- track record (live ledger + replay) ----------
  let TRACK = null, REPLAY = null, TRACK_FOR = null;
  async function loadTrack() {
    if (TRACK && TRACK_FOR === DATA.meta.generatedAt) return;
    TRACK_FOR = DATA.meta.generatedAt;
    const get = async u => { try { const r = await fetch(u + '?t=' + Math.floor(Date.now() / 300000)); return r.ok ? await r.json() : { error: true }; } catch { return { error: true }; } };
    TRACK = await get('data/tracker.json');
    if (!REPLAY) REPLAY = await get('data/replay-tracker.json');
    const box = $('#trackbox'); if (box) box.innerHTML = trackHtml(TRACK, true) + replayHtml();
  }
  const pct1 = x => (x == null ? '–' : (x * 100).toFixed(1) + '%');
  const sgn = x => (x == null ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%');

  function groupTable(title, groups, minN) {
    const rows = (groups || []).filter(g => g.n >= minN);
    if (!rows.length) return '';
    return `<h3>${esc(title)}</h3><div class="card scroll"><table><thead><tr><th>Group</th><th class="n">Trades</th><th class="n">Hit target</th><th class="n">95% range</th><th class="n">Avg net</th><th class="n">Profit factor</th></tr></thead><tbody>
      ${rows.map(g => `<tr><td>${esc(g.key)}</td><td class="n">${g.n}</td><td class="n">${pct1(g.winRate)}</td><td class="n mute">${pct1(g.ci[0])}–${pct1(g.ci[1])}</td><td class="n ${g.avgNet >= 0 ? 'up' : 'down'}">${sgn(g.avgNet)}</td><td class="n">${g.profitFactor == null ? '–' : g.profitFactor.toFixed(2)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function verdict(a, c) {
    if (a.n < 30) return `Only ${a.n} closed ACT trade${a.n === 1 ? '' : 's'} so far: far too few to conclude anything. A hit rate on this few trades is noise.`;
    const lo = a.ci[0], hi = a.ci[1], base = c.winRate;
    const better = lo > base, worse = hi < base;
    const money = a.avgNet > 0 ? 'and the average trade made money after fees' : 'but the average trade lost money after fees';
    return `ACT hit its target ${pct1(a.winRate)} of the time vs ${pct1(base)} for the rest of the universe: ${better ? 'better than chance' : worse ? 'worse than chance' : 'not distinguishable from chance'} (95% range ${pct1(lo)}–${pct1(hi)}), ${money}.`;
  }

  function trackHtml(tr, live) {
    if (!tr || tr.error) return '<div class="card empty">Track record not available from this data source.</div>';
    const a = tr.act, c = tr.control;
    const kpi = [['ACT hit target', pct1(a.winRate), `${a.wins} of ${a.n} closed`], ['Rest of universe', pct1(c.winRate), `${c.n} closed (control)`], ['ACT avg net / trade', sgn(a.avgNet), `rest: ${sgn(c.avgNet)}`], ['Profit factor', a.profitFactor == null ? '–' : a.profitFactor.toFixed(2), `rest: ${c.profitFactor == null ? '–' : c.profitFactor.toFixed(2)}`]];
    let h = `<div class="market">${kpi.map(k => `<div class="stat"><small>${k[0]}</small><b>${k[1]}</b><div class="muted">${k[2]}</div></div>`).join('')}</div>
      <div class="note"><b>Verdict so far.</b> ${esc(verdict(a, c))}</div>`;
    if (live) {
      h += `<h3>Open trades (${tr.open.length})</h3>`;
      h += tr.open.length ? `<div class="card scroll"><table><thead><tr><th>Stock</th><th>Signal</th><th class="n">Entry</th><th class="n">Last</th><th class="n">P/L</th><th class="n">To target</th><th class="n">To stop</th><th class="n">Days left</th></tr></thead><tbody>
        ${tr.open.slice(0, 40).map(t => `<tr><td><b>${esc(t.ticker)}</b> <span class="muted">${t.score}</span></td><td>${esc(t.signal)}</td><td class="n">${f0(t.entry)}</td><td class="n">${f0(t.last)}</td><td class="n">${pc(t.unrealized)}</td><td class="n">${pc(t.target / t.last - 1)}</td><td class="n">${pc(t.stop / t.last - 1)}</td><td class="n">${t.daysLeft}</td></tr>`).join('')}</tbody></table></div>`
        : `<p class="muted">None open yet. ${tr.pendingAct ? tr.pendingAct + ' ACT signal' + (tr.pendingAct === 1 ? ' is' : 's are') + ' waiting for the next session open, where the trade starts.' : 'No ACT signal has been logged yet.'}</p>`;
      h += `<h3>Closed trades (latest)</h3>`;
      h += tr.closed.length ? `<div class="card scroll"><table><thead><tr><th>Stock</th><th>Result</th><th class="n">Net return</th><th class="n">Days</th><th>Signal</th><th>Setup</th></tr></thead><tbody>
        ${tr.closed.slice(0, 25).map(t => `<tr><td><b>${esc(t.ticker)}</b> <span class="muted">${t.score}</span></td><td><span class="act ${t.status === 'win' ? 'ACT' : t.status === 'loss' ? 'SKIP' : 'WATCH'}">${t.status === 'win' ? 'hit target' : t.status === 'loss' ? 'stopped' : 'expired'}</span></td><td class="n ${t.ret >= 0 ? 'up' : 'down'}">${sgn(t.ret)}</td><td class="n">${t.days}</td><td>${esc(t.signal)}</td><td>${esc(t.setup)}</td></tr>`).join('')}</tbody></table></div>`
        : `<p class="muted">Nothing has resolved yet. ${tr.signalDays} signal day${tr.signalDays === 1 ? '' : 's'} logged; each trade needs up to ${tr.horizon} trading days after its entry.</p>`;
    }
    h += groupTable('By setup', tr.bySetup, 5) + groupTable('By score', tr.byScore, 5) + groupTable('By market regime (ACT trades)', tr.byRegime, 5) +
      groupTable('By RSI at signal (ACT)', tr.byRsi, 5) + groupTable('By news at signal (ACT)', tr.byNews, 5) + groupTable('By sector (ACT)', tr.bySector, 8) + groupTable('Best stocks so far (ACT)', tr.byTicker, 4);
    h += `<p class="muted">${esc(tr.rules)} One position per stock at a time, so a stock that stays oversold for ten days counts once. The 95% range shows how little a small sample proves. Many cuts are shown, so some will look good by luck alone: trust a pattern only if it keeps showing up in the live results.</p>`;
    return h;
  }

  function replayHtml() {
    if (!REPLAY || REPLAY.error) return '';
    const r = REPLAY.replay;
    return `<h2>Replay: the last 13 months, same rules (not live)</h2>
      <p class="muted">${esc(r.from)} to ${esc(r.to)}: every day's signals for all 100 stocks, pushed through the same tracker with realistic entries (next-session open), stops, targets and fees. ${esc(r.note)}</p>
      ${trackHtml(REPLAY, false)}`;
  }

  function renderScore() {
    const el = $('#tab-score'), bt = DATA.backtest, na = DATA.newsAccuracy;
    if (!bt) { el.innerHTML = '<div class="empty">No backtest summary in this data source.</div>'; return; }
    loadTrack();
    el.innerHTML = `
      <h2>Does the score predict anything? Walk-forward backtest</h2>
      <p class="muted">${esc(bt.params.source)}, ${esc(bt.params.from)} to ${esc(bt.params.to)}. Each day the score uses only data up to that day; outcome = next 15 trading days with the plan's stop and +${bt.params.targetPct}% target.</p>
      <div class="two"><div class="card"><div class="pad"><b>Out-of-sample (2024-10 →)</b></div>${bucketTable(bt.outOfSample)}</div>
      <div class="card"><div class="pad"><b>In-sample (before 2024-10)</b></div>${bucketTable(bt.inSample)}</div></div>
      ${DATA.backtestHoldout ? `<h2>Stocks it was NOT designed on</h2><div class="card"><div class="pad"><b>${DATA.backtestHoldout.params.tickers} other IDX stocks</b>, same rules, no re-tuning</div>${bucketTable(DATA.backtestHoldout.all)}</div><p class="muted">The edge replicates but is smaller, and after stops and fees the average trade is about zero. Treat ACT as a shortlist, not a signal to buy blindly.</p>` : ''}
      <div class="note"><b>Read it honestly.</b> The v1 score (trend, momentum, breakout chasing) scored <i>negative</i> in this test, so it was replaced by an oversold-bounce score. The new score ranks better, but a +1% average 15-day move is small, and in the 13-month replay with realistic entries, stops and fees the average ACT trade still lost money. The earlier idea that the edge lives in broad selloffs did not hold up there (see the regime table). ${bt.caveats.map(esc).join(' ')}</div>
      <h2>Live track record: does it actually hit its targets?</h2>
      <div id="trackbox"><div class="card empty">Loading…</div></div>
      <h2>News: how accurate is the classifier?</h2>
      ${na ? `<div class="card scroll"><table><thead><tr><th>Rules</th><th>Sample</th><th class="n">Category right</th><th class="n">Direction precision</th><th class="n">Direction recall</th></tr></thead><tbody>
        ${na.rows.map(r => `<tr><td>${esc(r.rules)}</td><td>${esc(r.sample)}</td><td class="n">${r.cat}%</td><td class="n">${r.prec}%</td><td class="n">${r.rec}%</td></tr>`).join('')}</tbody></table></div><p class="muted">${esc(na.note)}</p>` : ''}
      `;
  }

  // ---------- how it works ----------
  function renderHow() {
    const m = DATA.meta;
    $('#tab-how').innerHTML = `
      <h2>What runs where</h2>
      <div class="steps">
        <div class="card"><h3>Google Sheet = control panel + journal</h3><p class="muted">Holds Universe (tickers, sectors, news aliases), Themes (news queries like Danantara / komisaris) and Config (target %, stop, liquidity). Also the Screener and News tabs you can sort, annotate and keep trade notes in.</p></div>
        <div class="card"><h3>Apps Script = engine inside the Sheet</h3><p class="muted">Pulls prices with GOOGLEFINANCE, reads Google News RSS, runs the same maths as this site, writes the Screener tab, and serves the result as JSON (doGet). Runs on its own triggers.</p></div>
        <div class="card"><h3>GitHub Action = scheduled builder</h3><p class="muted">Every weekday after the close it runs that same engine in Node on Yahoo prices, rebuilds <code>data/latest.json</code>, logs the picks for the forward test and publishes this site on GitHub Pages.</p></div>
        <div class="card"><h3>This web app = reader</h3><p class="muted">Static page. By default it reads the GitHub snapshot. "Source" lets it read your own Sheet via the Apps Script URL instead. Same data shape either way.</p></div>
      </div>
      <p class="muted pad">Engine <code>${esc(m.engine)}</code>${m.commit ? ' · build ' + esc(m.commit) : ''} · prices: ${esc(m.sources.prices)} · news: ${esc(m.sources.news)}${m.sources.ownership ? ' · ownership: ' + esc(m.sources.ownership) : ''}</p>
      <h2>Data you can add next</h2>
      <div class="two">
        <div class="card pad"><b>Shareholders ≥1% (live here)</b><p class="muted">KSEI data that IDX publishes monthly (since Feb 2026). Good for context: who controls the stock, foreign share, state stakes, new/exiting holders month to month. Too slow for swing timing and has gaps, so it is displayed, not scored.</p></div>
        <div class="card pad"><b>Broker flow (live, on trial)</b><p class="muted">NeoBDM splits each day's broker summary into bandar, non-retail, institution, sultan, foreign and retail flow. A snapshot is saved every trading day and read with fixed rules (Broker flow tab). It can veto or annotate a pick but not promote one until its forward test passes. Foreign flow alone has 4 years of free IDX history and is backtested separately.</p></div>
      </div>`;
  }

  // ---------- tabs & settings ----------
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    document.querySelectorAll('.panel').forEach(p => { p.hidden = p.id !== 'tab-' + b.dataset.tab; });
  });
  $('#refreshBtn').onclick = () => load().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* optional */ });
  const dlg = $('#settings');
  $('#settingsBtn').onclick = () => { $('#sheetUrl').value = LS.get('sheetUrl') || ''; $('#sheetToken').value = LS.get('sheetToken') || ''; dlg.showModal(); };
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'save') { LS.set('sheetUrl', $('#sheetUrl').value.trim()); LS.set('sheetToken', $('#sheetToken').value.trim()); load(); }
    if (dlg.returnValue === 'reset') { LS.del('sheetUrl'); LS.del('sheetToken'); load(); }
  });

  // Keep the page fresh without a reload: re-read the data every 5 minutes while the tab is visible.
  const REFRESH_MS = 5 * 60 * 1000;
  setInterval(() => { if (!document.hidden && !(document.activeElement && document.activeElement.id === 'nq')) load().catch(() => { /* keep showing the last good data */ }); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && DATA && Date.now() - new Date(DATA.meta.generatedAt) > REFRESH_MS) load().catch(() => {}); });

  load().catch(e => { $('#sub').textContent = 'Failed to load data: ' + e.message; });
})();

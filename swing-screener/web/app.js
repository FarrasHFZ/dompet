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
  // News direction: +-0.5 deadband, so a stock with no real news reads neutral.
  const arrow = s => (s >= 0.5 ? '<span class="up">▲ supports</span>' : s <= -0.5 ? '<span class="down">▼ risk</span>' : '<span class="mute">• neutral</span>');

  const TIER = { 'ACT+': 'Bounce candle + flow up', ACT: 'Bounce candle confirmed', 'ACT?': 'Bounce candle, but flow down', WAIT: 'Oversold, wait for a bounce candle', SKIP: 'Not traded: NeoBDM veto, or one of the 400 stocks added in October 2026 (the bounce edge was not confirmed', PAUSE: 'Market filter: IHSG below its 200-day average, no new bounce trades', THIN: 'Oversold, but trades under Rp 5 B a day: too thin to trade', SUSP: 'No trading in the last 3 sessions: suspended or halted' };
  const tierHtml = p => (p.tier && p.tier !== 'WATCH' ? '<span class="tier t' + (p.tier === 'ACT+' ? 'P' : p.tier === 'ACT?' ? 'Q' : p.tier) + '" title="' + esc(TIER[p.tier]) + '">' + esc(p.tier) + '</span>' : '');
  // Conglomerate group label (tools/groups.mjs): short name, rank on hover; a click opens the Groups tab.
  const groupTag = p => {
    const nm = p.untested ? '<span class="newmark" title="One of the 400 stocks added in Oct 2026 (200 on the 10th, 200 on the 12th): shown, not traded (Track record)">new</span>' : '';
    const g = p.group; if (!g) return nm;
    const short = g.id === 'bumn' ? 'BUMN' : String(g.alias || g.name).replace(/^saham /, '');
    return `${nm}<button class="gtag${g.hot ? ' hot' : ''}" data-group="${esc(g.id)}" title="${esc(g.name)} group: #${g.rank || '–'} of ${g.of} by 20-day strength${g.hot ? ', jumped 10%+ in a week recently' : ''}. Click for the Groups tab.">${esc(short)}</button>`;
  };
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
  // Experimental BM accumulation score: today's rank (0-100) of the 60-session LPM trend. Held its direction out of
  // sample but did not clear the bar, so it is shown and forward-tested, never part of the badge.
  const bmScoreHtml = s => (s == null ? '<span class="mute" title="Listed too recently: the score compares the 60-day LPM trend with the stock&#39;s own past year">too new</span>' : `<b class="${s >= 67 ? 'up' : s <= 33 ? 'down' : ''}">${s}</b><span class="muted">/100</span>`);
  const bmHtml = p => {
    const b = p.bm;
    if (!b) return '<p class="muted">No Bandarmetrics data for this ticker.</p>';
    return `<div class="kv">
        <div><small>Accumulation score (experimental)</small>${bmScoreHtml(b.score)}<div class="muted">60-day LPM trend vs other stocks</div></div>
        <div><small>Read</small><b>${bmReadHtml(b)}</b></div>
        <div><small>LPM (direction)</small><b class="${b.lpm === 'rising' ? 'up' : b.lpm === 'falling' ? 'down' : ''}">${esc(b.lpm)}</b>${b.quiet ? '<div class="muted">rising while price fell</div>' : ''}</div>
        <div><small>Flow lens: ${esc(b.lens)}</small><b class="${b.lensDir === 'up' ? 'up' : b.lensDir === 'down' ? 'down' : ''}">${esc(b.lensDir)}</b><div class="muted">${b.foreignDriven ? 'foreign-driven stock' : 'locally-driven stock'}</div></div>
        <div><small>Intensity (timing)</small><b>${b.spike ? 'spike, last 3 days' : 'quiet'}</b></div>
        <div><small>Volume Rotation</small><b>${bandHtml(b)}</b></div></div>
      <p class="muted">Bandarmetrics data of ${esc(b.asOf)}${b.stale ? ' <b>(stale)</b>' : ''}. Directions only. Context, not a signal: over 4 years and 100 stocks this read did not separate winning from losing ACT trades (see the Broker flow tab), so it does not change the badge. Most useful as a warning: LPM falling means large-order pressure is still on the sell side.</p>`;
  };
  // Replayed flow tag for the last 60 sessions (tools/experiment-nb.mjs, extended daily): one cell per session.
  const stripHtml = (h, big) => {
    if (!h || !h.t) return '<span class="mute">–</span>';
    const C = { '+': ['var(--up)', 'FLOW+'], '-': ['var(--down)', 'FLOW-'], '~': ['var(--mute)', 'FLOW~'] };
    const n = h.t.length, w = big ? 6 : 2.5, g = big ? 1 : 0.5, H = big ? 18 : 12;
    return `<svg class="fstrip" width="${n * (w + g)}" height="${H}" viewBox="0 0 ${n * (w + g)} ${H}" role="img" aria-label="Flow tag, last ${n} sessions to ${esc(h.d1)}: ${(h.t.match(/\+/g) || []).length} FLOW+, ${(h.t.match(/-/g) || []).length} FLOW-">${[...h.t].map((c, i) => `<rect x="${i * (w + g)}" y="0" width="${w}" height="${H}" rx="1" fill="${(C[c] || ['var(--mute)'])[0]}"${C[c] && c !== '~' ? '' : ' opacity=".3"'}><title>${esc((C[c] || [0, 'n/a'])[1])}</title></rect>`).join('')}</svg>`;
  };
  const nbHtml = p => {
    const n = p.neobdm;
    if (!n) return '<p class="muted">NeoBDM has no row for this ticker.</p>';
    const h = p.flowHist;
    const hist = h ? `<div class="fhist"><small>Flow tag, last ${h.t.length} sessions (${esc(h.d0)} to ${esc(h.d1)})</small>${stripHtml(h, true)}<div class="muted"><span class="up">■</span> FLOW+ <span class="down">■</span> FLOW- <span class="mute">■</span> neutral${h.ph ? ` · ${esc(h.ph.toLowerCase())} for ${h.phDays} session${h.phDays === 1 ? '' : 's'}` : ''}. Replayed from NeoBDM's Transaction Chart history, then extended daily. Replayed cells trust every group fully (the history has no method-fit scores), so they can differ from today's live tag.</div></div>` : '';
    const tagCls = n.tag === 'FLOW+' ? 'up' : n.tag === 'FLOW-' || n.tag === 'AVOID' ? 'down' : '';
    const grid = n.groups ? `<div class="scroll"><table><thead><tr><th>Group</th><th>5 days</th><th>20 days</th><th>Method fits?</th></tr></thead><tbody>
      ${GROUPS.map(([k, l]) => n.groups[k] ? `<tr><td>${l}</td><td>${dirHtml(n.groups[k].d5)}</td><td>${dirHtml(n.groups[k].d20)}</td><td class="${n.groups[k].compat ? '' : 'mute'}">${n.groups[k].compat ? 'yes' : 'weak (half weight)'}</td></tr>` : '').join('')}</tbody></table></div>
      <p class="muted">Today's top 5 net buyers: ${mixHtml(n.brokers && n.brokers.buyers)}. Top 5 net sellers: ${mixHtml(n.brokers && n.brokers.sellers)}.</p>` : '';
    return `<p><span class="tag ${n.tag === 'AVOID' ? 'RISK' : ''}">${esc(n.tag)}</span> ${n.phase ? phaseHtml(n.phase) : ''} <span class="${tagCls}">${esc(n.note)}</span></p>${hist}${grid}
      <p class="muted">From NeoBDM data of ${esc(n.asOf)}${n.stale ? ' <b>(stale: no longer used for the badge)</b>' : ''}. Directions only; raw numbers are not published. Flow is the group's net buy as a share of turnover. It can veto (Pinky, illiquid), nothing more: replayed over two years of NeoBDM history, the flow tag did not predict returns or which bounces worked (see the Broker flow tab).</p>`;
  };

  // ---------- shell: icons, navigation, theme, watchlist ----------
  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    home: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    picks: svg('<path d="M4 6h10M4 12h16M4 18h12"/><circle cx="19" cy="6" r="2"/>'),
    mom: svg('<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    flow: svg('<path d="M7 4v16M7 4 3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4"/>'),
    groups: svg('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
    news: svg('<path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v10a2 2 0 0 1-2 2M8 9h5M8 13h5M8 17h3"/>'),
    score: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
    how: svg('<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/>'),
    more: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>'),
    refresh: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: svg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>'),
    db: svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  };
  const TABS = [['home', 'Market', 'Today at a glance'], ['picks', 'Screener', 'All 500 stocks, ACT calls first'], ['mom', 'Momentum', 'Momentum 10 monthly list'], ['flow', 'Broker flow', 'NeoBDM, brokers, flow studies'], ['groups', 'Groups', 'Conglomerate rotation'], ['news', 'News', '30-day headline radar'], ['score', 'Track record', 'Every call and what it made'], ['how', 'How it works', 'Signal lab, data coverage']];
  const BNAV = ['home', 'picks', 'mom', 'news', 'more'];
  let TAB = TABS.some(t => t[0] === LS.get('tab')) ? LS.get('tab') : 'home';
  function navHtml() {
    const n = DATA ? DATA.picks.filter(p => p.tier === 'ACT').length : 0;
    $('#nav').innerHTML = TABS.map(([k, l], i) => `${i === 6 ? '<div class="sep"></div>' : ''}<button role="tab" data-tab="${k}" aria-selected="${TAB === k}" title="${esc(l)}">${IC[k]}<span>${esc(l)}</span>${k === 'picks' && n ? `<em class="cnt" title="Convinced ACT today">${n}</em>` : ''}</button>`).join('');
    $('#bnav').innerHTML = BNAV.map(k => { const t = TABS.find(x => x[0] === k); const sel = k === 'more' ? !BNAV.includes(TAB) : TAB === k;
      return `<button data-tab="${k}" aria-selected="${sel}">${IC[k]}${k === 'more' ? 'More' : esc(t[1])}${k === 'picks' && n ? `<em class="cnt">${n}</em>` : ''}</button>`; }).join('');
    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => (b.dataset.tab === 'more' ? openMore() : go(b.dataset.tab)));
  }
  function go(tab, keepStock) {
    TAB = tab; LS.set('tab', tab);
    document.querySelectorAll('.panel').forEach(p => { p.hidden = p.id !== 'tab-' + tab; });
    const t = TABS.find(x => x[0] === tab); $('#tbTitle').textContent = t ? t[1] : 'Swing IDX';
    navHtml();
    if (tab === 'score' && DATA) { const pbx = document.getElementById('paperbox'); if (pbx) { pbx.innerHTML = paperHtml(); bindPaper(pbx); } }
    if (!keepStock && OPEN && !(tab === 'picks' && WIDE.matches)) closeStock(true);
    syncDock();
    if (tab === 'picks' && DATA) renderPicks();
    window.scrollTo(0, 0);
  }
  function openMore() {
    const dl = $('#moreSheet');
    $('#moreList').innerHTML = TABS.filter(t => !BNAV.includes(t[0])).map(([k, l, d]) => `<button class="mi" value="${k}">${IC[k]}<span>${esc(l)}<small>${esc(d)}</small></span></button>`).join('')
      + `<button class="mi" value="theme">${document.documentElement.dataset.theme === 'dark' ? IC.sun : IC.moon}<span>${document.documentElement.dataset.theme === 'dark' ? 'Light' : 'Dark'} mode<small>Switch the colour theme</small></span></button>`
      + `<button class="mi" value="source">${IC.db}<span>Data source<small>${esc($('#srcPill').textContent || 'GitHub snapshot')}</small></span></button>`;
    dl.showModal();
    dl.onclose = () => { const v = dl.returnValue; dl.returnValue = ''; if (v === 'theme') toggleTheme(); else if (v === 'source') $('#settingsBtn').click(); else if (TABS.some(t => t[0] === v)) go(v); };
    dl.onclick = e => { if (e.target === dl) dl.close(); };
  }
  function themeIcons() { const dark = document.documentElement.dataset.theme !== 'light'; ['#themeBtn', '#themeBtnM'].forEach(s => { const b = $(s); if (b) b.innerHTML = dark ? IC.sun : IC.moon; }); }
  function toggleTheme() {
    const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t; LS.set('theme', t); themeIcons();
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'light' ? '#ffffff' : '#0b0d10';
    if (OPEN && DATA) { const p = DATA.picks.find(x => x.ticker === OPEN); if (p) mountChart($('#stock'), p); }
  }
  // Watchlist: starred tickers, this browser only.
  const WL = new Set((() => { try { return JSON.parse(LS.get('watch') || '[]'); } catch { return []; } })());
  const toggleWatch = t => { WL.has(t) ? WL.delete(t) : WL.add(t); LS.set('watch', JSON.stringify([...WL])); };
  const starHtml = t => `<button class="star${WL.has(t) ? ' on' : ''}" data-star="${esc(t)}" aria-label="${WL.has(t) ? 'Remove from' : 'Add to'} watchlist" title="Watchlist">${WL.has(t) ? '★' : '☆'}</button>`;
  const bindStars = el => el.querySelectorAll('[data-star]').forEach(b => b.onclick = e => { e.stopPropagation(); toggleWatch(b.dataset.star); const on = WL.has(b.dataset.star); document.querySelectorAll(`[data-star="${b.dataset.star}"]`).forEach(x => { x.classList.toggle('on', on); x.textContent = on ? '★' : '☆'; }); });
  // Ticker avatar: the company logo Stockbit shows (assets.stockbit.com, checked for all 500 on 2026-10-12), over
  // initials on a stable colour that stay visible if the logo fails to load.
  const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const LOGO = t => `https://assets.stockbit.com/logos/companies/${encodeURIComponent(t)}.png`;
  const avatar = (t, cls = '') => `<span class="av ${cls}" style="--h:${hue(t)}" aria-hidden="true">${esc(t.slice(0, 4))}<img src="${LOGO(t)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
  const pxOf = p => (p.live ? p.live.price : p.close);
  const chOf = p => (p.live ? p.live.chg : p.chg1d);
  const chgPill = x => (x == null ? '<span class="cp flat">–</span>' : `<span class="cp ${x > 0 ? 'up' : x < 0 ? 'down' : 'flat'}">${x > 0 ? '+' : ''}${(x * 100).toFixed(2)}%</span>`);
  const openDays = n => (n == null ? '' : n === 1 ? 'day 1' : 'day ' + n);

  const MQ = window.matchMedia('(max-width: 760px)'), WIDE = window.matchMedia('(min-width: 1001px)');
  MQ.addEventListener('change', () => { if (DATA) { renderPicks(); if (OPEN) renderStock(); } });
  WIDE.addEventListener('change', () => { syncDock(); if (DATA && TAB === 'picks') renderPicks(); });
  let DATA = null, PQ = '', FILTER = LS.get('pfilter') || 'CONV', SORT = LS.get('psort') || 'score', PGRP = LS.get('pgrp') || '', PSEC = LS.get('psec') || '', OPEN = null, SUB = 'thesis', NEWSCAT = 'ALL', NEWSQ = '', HIDEWRAP = true, PLIMIT = 80;

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
    $('#sub').innerHTML = `<b class="${m.session && m.session.state === 'open' ? 'up' : ''}">● ${esc(sess)}</b><br>Refreshed ${ago(m.generatedAt)}${newest ? ' · news ' + ago(new Date(newest).toISOString()) : ''}<br>Scores from the ${esc(m.asOf || 'latest')} close`;
    const ihsg = k.idxLive ? k.idxLive.price : k.idxClose, ich = k.idxLive ? k.idxLive.chg : null, f = k.filter || {};
    const conv = DATA.picks.filter(p => p.tier === 'ACT').length;
    $('#market').innerHTML = `
      <div class="tk-i"><small>IHSG${k.idxLive ? ' · live' : ''}</small><span><b>${f0(ihsg)}</b>${ich != null ? `<span class="chgp ${ich >= 0 ? 'up' : 'down'}">${ich >= 0 ? '+' : ''}${(ich * 100).toFixed(2)}%</span>` : ''}</span></div>
      <div class="tk-i"><small>Trend</small><b class="${f.ok === false ? 'down' : f.ok ? 'up' : ''}">${f.sma200 ? (f.ok ? 'Above' : 'Below') + ' 200-day' : esc(k.regime || '–')}</b></div>
      <div class="tk-i"><small>Convinced ACT</small><b class="${conv ? 'up' : ''}">${conv}</b></div>
      <div class="tk-i"><small>Oversold</small><b>${k.oversoldCount ?? '–'} <span class="muted">/ ${k.of ?? '–'}</span></b></div>
      <div class="tk-i"><small>Session</small><b><span class="dot" style="background:${m.session && m.session.state === 'open' ? 'var(--up)' : 'var(--mute)'}"></span>${m.session && m.session.state === 'open' ? 'Open' : 'Closed'}</b></div>`;
    const ns = m.newsStatus;
    $('#banner').innerHTML = ns && ns.state !== 'ok' ? `<div class="note"><b>News ${esc(ns.state)}.</b> ${esc(ns.note)}</div>` : '';
    navHtml(); themeIcons();
    renderHome(); renderPicks(); renderMomentum(); renderFlow(); renderGroups(); renderNews(); renderScore(); renderHow();
    if (OPEN) renderStock();
  }

  // ---------- Momentum 10 (paper-only second strategy, tools/momentum.mjs) ----------
  function renderMomentum() {
    const el = $('#tab-mom'), M = DATA.momentum;
    if (!M) { el.innerHTML = '<div class="empty">Momentum list not built in this data source yet.</div>'; return; }
    const S = M.study, P = M.pit, pv = P && P.verdict, rec = M.record || [];
    const month = d => new Date(d + 'T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const pitLine = !P ? '<b>Hindsight check: still running.</b> Until it reports, treat the backtest numbers below as too good.'
      : pv.pass ? `<b>Hindsight check passed:</b> with each month's universe rebuilt from what was known then (top 100 by trading value among ${P.withHistory} IDX stocks), momentum still beat holding everything in both halves and beat random picks (p ${P.top100.null.p.toFixed(3)}). <b>But the edge is much smaller than the headline:</b> ${pc(P.top100.MOM10.cagr)} a year against ${pc(P.top100.EW.cagr)} for holding everything, ${pc(P.top100.MOM10.second)} a year in 2022-26, and a worst month-end drawdown of ${pc(P.top100.MOM10.mddMonthly, 0)}. It is a relative edge in a weak market, not a money machine.`
      : `<b>Hindsight check FAILED:</b> with each month's universe rebuilt from what was known then (top 100 by trading value among ${P.withHistory} IDX stocks), momentum did not beat ${!pv.A ? 'holding everything in both halves' : 'random picks reliably'} (p ${P.top100.null.p.toFixed(3)}). The strong backtest below most likely came from using today's stock list. Watch only.`;
    const hold = M.holdings || [];
    const status = `<b>Holding</b> the 10 below since the open after ${esc(M.rebalance)}.${M.filterOn ? '' : ' The IHSG is below its 200-day average: momentum has done much worse in downtrends (+0.15% a month vs +1.49% in uptrends over 10 years), so size small.'}`;
    const rows = hold.map(h => `<tr data-open="${esc(h.t)}" class="row"><td class="n">${h.rank}</td><td><div style="display:flex;gap:10px;align-items:center">${avatar(h.t)}<div><b class="tk">${esc(h.t)}</b><div class="nm">${esc(h.name)}</div></div></div></td><td class="n">${pc(h.mom, 0)}</td><td class="n">${f0(h.entry)}</td><td class="n">${f0(h.now)}</td><td class="n">${pc(h.ret)}</td></tr>`).join('');
    const recRows = rec.slice().reverse().map(r => `<tr><td>${esc(month(r.rebalance))}${r.open ? ' <span class="tag">open</span>' : ''}</td><td>${r.filterOn ? 'above 200-day' : '<span class="warn">below 200-day</span>'}</td><td class="n">${pc(r.traded, 2)}</td><td class="n">${pc(r.momRet, 2)}</td><td class="n">${pc(r.ewRet, 2)}</td><td class="n">${pc(r.ihsg, 2)}</td><td class="muted">${r.picks.map(esc).join(', ')}</td></tr>`).join('');
    const bt = (lbl, x) => x ? `<tr><td>${lbl}</td><td class="n">${pc(x.MOM10.cagr)}</td><td class="n">${pc(x.MOM10.first)} / ${pc(x.MOM10.second)}</td><td class="n">${pc(x.EW.cagr)}</td><td class="n">${x.null ? pc(x.null.med) + ', p ' + x.null.p.toFixed(3) : '–'}</td><td class="n">${x.MOM10.dd != null ? pc(x.MOM10.dd, 0) : pc(x.MOM10.mddMonthly, 0) + ' (month-end)'}</td></tr>` : '';
    el.innerHTML = `<div class="ph-head"><div><h1>Momentum 10</h1><p>The 10 strongest stocks of the past year, rebalanced monthly. Paper only.</p></div></div>
      <div class="note"><b>Second strategy, paper only.</b> On the last trading day of each month, take the liquid stocks (Rp 5 B a day), rank them by their return over the past 12 months skipping the latest month, and hold the top 10 in equal amounts from the next open until the next month's rebalance, in every month (the 200-day filter was removed on 2026-10-10; the IHSG trend is shown as context). It passed a pre-registered 10-year test, but read the caveats below before trusting it.</div>
      <div class="note ${pv && !pv.pass ? 'warnnote' : ''}">${pitLine}</div>
      <h2>This month's list (${esc(month(M.rebalance))} rebalance)</h2>
      <div class="callbox">${status} Next rebalance: the last trading day of ${esc(month(new Date().toISOString().slice(0, 10)))}${M.filterOn ? '' : ''}; the new list appears here the evening it closes.${M.counted ? '' : ` This list was formed before the forward record starts (${esc(month(M.from + '-01'))} rebalance), so it is not counted.`}</div>
      <div class="card scroll"><table><thead><tr><th class="n">#</th><th>Stock</th><th class="n">12-1 month return</th><th class="n">Entry (open after rebalance)</th><th class="n">Now</th><th class="n">Since entry</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty">No liquid stock with a full year of history.</td></tr>'}</tbody></table></div>
      <p class="muted">Tap a row to open the stock page. Momentum lists are full of stocks that already ran hard (they are why they are on it); expect sharp pullbacks. Returns are before fees; the record below charges 0.2% to buy and 0.2% to sell.</p>
      <h2>Forward record (from the ${esc(month(M.from + '-01'))} rebalance)</h2>
      ${rec.length ? `<div class="card scroll"><table><thead><tr><th>Month</th><th>IHSG trend</th><th class="n">Rule result</th><th class="n">Top 10 (if held)</th><th class="n">All liquid stocks</th><th class="n">IHSG</th><th>Picks</th></tr></thead><tbody>${recRows}</tbody></table></div>` : '<p class="muted">Starts with the first month-end after the rule was fixed. Every list is saved on the evening it forms and scored at the next rebalance, so none is picked with hindsight.</p>'}
      ${S ? `<h2>Backtest, 2017-10 to 2026-08 (Yahoo, monthly)</h2>
      <div class="card scroll"><table><thead><tr><th>Stocks</th><th class="n">Top 10 / yr</th><th class="n">2017-22 / 2022-26</th><th class="n">All liquid, equal / yr</th><th class="n">10 random (median)</th><th class="n">Worst drawdown</th></tr></thead><tbody>
        ${bt('Tested 100 (today\'s list)', S.tested)}${bt('Unseen 200 (today\'s list)', S.holdout)}${P ? bt('Point in time, top 100 each month', P.top100) : ''}</tbody></table></div>
      <p class="muted"><b>Caveats.</b> (1) The first two rows use today's most-traded stocks, so stocks that later became big winners are in the list from the start: that flatters momentum (the last row removes that by rebuilding the universe every month from what was known then). (2) Stocks delisted before 2026 have no Yahoo data and are missing everywhere. (3) Drawdowns near −50% even with the market filter. (4) On the unseen 200 it lost to simply holding everything in 2022-26. Rules and pass bars were written down before each run (tools/experiment-momentum.mjs, experiment-momentum-pit.mjs).</p>` : ''}`;
    el.querySelectorAll('tr[data-open]').forEach(r => r.onclick = () => openStock(r.dataset.open));
  }

  // ---------- who moves this stock (tools/flow-read.mjs) + signal lab ----------
  const third = n => (n === 3 ? 'top third' : n === 2 ? 'middle third' : n === 1 ? 'bottom third' : '–');
  const whoChip = p => { const w = p.who; return w && !w.stale && w.fcT === 3 && w.fbT === 3 ? '<span class="tag wchip" title="Foreign-driven stock with top-third foreign buying over 20 sessions. Watch only: pointed the right way in tests but never passed (Signal lab).">foreign buying · watch</span>' : ''; };
  function whoHtml(p) {
    const w = p.who;
    if (!w) return '<p class="muted">No NeoBDM history for this stock yet.</p>';
    const drv = w.fcT === 3 ? `<b>Foreign-driven.</b> On days foreigners were net buyers the price tended to rise with them (correlation ${w.fc.toFixed(2)} over 120 sessions, ${third(w.fcT)} of liquid stocks).`
      : `<b>Not foreign-driven</b> (correlation ${w.fc.toFixed(2)}, ${third(w.fcT)}): foreign flow and the price have not moved together, so foreign buying or selling says little here.`;
    const buy = w.fcT === 3 ? `Foreigners were net <b>${w.fb === 'buy' ? 'buyers' : w.fb === 'sell' ? 'sellers' : 'flat'}</b> over the last 20 sessions (${third(w.fbT)} among foreign-driven stocks).` : `Foreign flow over 20 sessions: net ${w.fb === 'buy' ? 'buying' : w.fb === 'sell' ? 'selling' : 'flat'} (context only for a stock like this).`;
    const ret = w.rs == null ? '' : `Retail share of trading: <b>about ${w.rs}%</b> (${third(w.rsT)}).`;
    const F = DATA.lab && DATA.lab.forward;
    return `<div class="whobox"><p>${drv}</p><p>${buy}</p>${ret ? `<p>${ret}</p>` : ''}</div>
      <p class="muted">Read from NeoBDM's foreign and retail groups (${esc(w.d)}${w.stale ? ', <b>stale</b>' : ''}). What the tests say: foreign buying inside foreign-driven stocks pointed the right way three times (+1.3% and +2.6% per 20 sessions over the bottom third) but never passed (p 0.10, 0.11), and retail-heavy stocks did <b>not</b> do worse. So this is context, not a reason to trade. A forward test${F ? ` (${F.dates} of ${F.needed} dates so far)` : ''} decides whether it becomes a "convinced" confirmation.</p>`;
  }
  function labHtml() {
    const L = DATA.lab; if (!L) return '';
    const st = s => `<span class="flag ${s === 'passed' ? 'up' : s === 'failed' ? 'down' : ''}">${s}</span>`;
    const rows = [
      ['Oversold bounce, 10 years (live rule)', 'failed', 'Lost money 2017-22; inside the noise of 20 shuffled histories'],
      ['Dips in stocks in their own uptrend when the market filter is off', 'failed', 'p 0.35 against random stocks'],
      ['Own-uptrend rule on 200 unseen stocks', 'failed', 'p 0.39'],
      ['Momentum 10 (monthly winners)', 'passed', 'Holds without hindsight but small: +4.8%/yr vs −1.0%, drawdown −57%. Paper list (Momentum tab)'],
      ['Retail-dominated stocks do worse', 'failed', L.flow2 ? `The opposite: the most retail-heavy third did ${pc(L.flow2.H1.spread, 1)} per 20 sessions vs the least` : ''],
      ['Foreign flow predicts, on foreign-driven stocks', 'near miss', `${L.flow2 ? `${pc(L.flow2.H2.spread, 1)} per 20 sessions, p ${L.flow2.H2.p.toFixed(2)}` : ''}${L.rep ? `; replication on 200 new stocks ${pc(L.rep.replication.spread, 1)}, p ${L.rep.replication.p.toFixed(2)}` : ''}. Forward test ${L.forward ? `${L.forward.dates}/${L.forward.needed} dates` : 'running'}`],
      ['Same foreign flow on stocks foreigners do not move (control)', 'as expected', L.flow2 ? `${pc(L.flow2.H2c.spread, 1)}, as predicted: no effect` : ''],
      ['Bandarmetrics accumulation pattern on oversold stocks (LPM up while price falls + Money Flow or Intensity), all 300, bear markets included', 'failed', L.bmPattern ? `The opposite: with the pattern ${pc(L.bmPattern.primary.mA)} a trade, without ${pc(L.bmPattern.primary.mB)}` : ''],
      ['Money Flow rising on an oversold stock (support) / Intensity spike (warning: selling not done)', 'forward test', `Looked helpful (t 1.8) / harmful (t −2.3) as side results; logged daily from 13 Oct, decided at 150 trades${L.bmForward ? ` (${L.bmForward.episodes} so far)` : ''}`],
      ['What comes before a rally (+10% in 10 sessions)? 20 drivers: price, volume, Bandarmetrics, NeoBDM groups', 'failed', L.rally ? `Discovery picked retail share, Volume Rotation and foreign buying (t 2.8 to 3.5); on the unseen year none confirmed (Volume Rotation flipped sign; retail share and foreign buying kept their direction, p 0.03, below the bar). Most recent rallies were not oversold: ${L.rally.recent.rallies} of ${L.rally.recent.of} stocks rose 10%+ in the last 10 sessions` : ''],
      ['Sideways base → accumulation (bandar / LPM / foreign) → breakout on volume', 'forward test', L.base ? `History: ${L.base.events} breakouts, excess ${pc(L.base.all.ex)}; with LPM rising ${pc(L.base.versions.lpm.with.ex)} vs ${pc(L.base.versions.lpm.without.ex)} (t ${L.base.versions.lpm.with.t.toFixed(1)}), bandar ${pc(L.base.versions.bandar.with.ex)}, foreign ${pc(L.base.versions.foreign.with.ex)}: none passed. Shown as a watch chip; forward test needs 60 breakouts per version${L.baseForward ? ` (${L.baseForward.events} so far)` : ''}` : ''],
      ['Volume peaks (4× usual volume): candle type, bandar side, foreign side, filings', 'forward test', L.volume ? `${L.volume.spikes} spikes. Candle type: no signal (UP ${pc(L.volume.types.UP.x10)}, DOWN ${pc(L.volume.types.DOWN.x10)}, CHURN ${pc(L.volume.types.CHURN.x10)}). Bandar side: none. Foreign net buyer on the spike day ${pc(L.volume.foreign.buy)} vs seller ${pc(L.volume.foreign.sell)} (t ${L.volume.foreign.t.toFixed(1)}, 2024-26)${L.volumeStress ? `; IDX data 2022-24: ${pc(L.volumeStress.replication.gap)} gap, did not replicate; without the best 5%: ${pc(L.volumeStress.stress.s5)}` : ''}. Filings: within a day of ${L.volume.triggers ? pc(L.volume.triggers.spikesWithFiling, 0) : '–'} of spikes vs ${L.volume.triggers ? pc(L.volume.triggers.ordinaryDays, 0) : '–'} of ordinary days. Forward test needs 100 foreign-buy spikes${L.volumeForward ? ` (${L.volumeForward.buy} so far)` : ''}` : ''],
      ['Buy the bottom? Stocks low in their 2-year range, sideways "bottom bases", bottom bases with volume buying (OBV), 913 stocks', 'failed', L.bottoms ? `The opposite of an edge. Low in range: ${pc(L.bottoms.tests.H1.d, 1)} / ${pc(L.bottoms.tests.H1.c1, 1)} / ${pc(L.bottoms.tests.H1.c2, 1)} per 20 sessions vs the top third (discovery / 613 never-used stocks / since 2022). Bottom bases on the 613: ${pc(L.bottoms.tests.H3.c1, 1)} a month vs the market (t ${L.bottoms.tests.H3.c1t.toFixed(1)}); with OBV buying ${pc(L.bottoms.tests.H5.c1, 1)} (t ${L.bottoms.tests.H5.c1t.toFixed(1)}). Volume buying on flat prices looked good on the 300 (t ${L.bottoms.tests.H4.dt.toFixed(1)}) and vanished on the 613. Pre-registered 2026-10-12` : ''],
      ['16-trait scan (momentum, reversal, volatility, lottery, OBV, volume trend, size, trend quality, near-high...)', 'failed', L.scan ? `None passes (bar p < 0.003, then t ≥ 2 on the 613). Closest: small liquid stocks ${pc(L.scan['T12 small size'].d, 1)} / ${pc(L.scan['T12 small size'].c1, 1)} / ${pc(L.scan['T12 small size'].c2, 1)} (positive everywhere, not significant out of sample). Near-the-high and above-the-200-day work since 2022 (t ${L.scan['T1 pos1y high'].c2t.toFixed(1)}, ${L.scan['T9 above 200'].c2t.toFixed(1)}) but not in 2017-21: a regime, not a rule` : ''],
      ['Target and hold: is +8% ideal, should it be per stock, should we hold longer? 25 exits (fixed +8%, 2 / 4 ATR, each stock’s own past best gain, no target) × holds of 15-60 sessions', 'failed', L.exit2 ? `Every one of the 25 loses on the 613 never-used stocks. Live +8% / 15 days ${pc(L.exit2.live.A, 2)} a trade there; per-stock target from its own past bounces ${pc(L.exit2.own.A, 2)}; 2 ATR ${pc(L.exit2.r2.A, 2)}; holding 60 days with no target ${pc(L.exit2.hold60.A, 2)} (best on the 300 before 2022, ${pc(L.exit2.hold60.D, 2)}, so a classic overfit). Smaller targets win more often (+3%: 76% wins) but still lose (${pc(L.exit2.c3.A, 2)}). The problem is the entry, not the exit. Pre-registered 2026-10-12` : ''],
      ['Better ACT calls: 12 bounce-day filters on the 5-session window calls (capitulation, isolated drop, strong stock, above 200-day, small liquid, deep drop, volume, strong close, reversal open, high cleared, market up, hammer)', 'failed', DATA.lab && DATA.lab.refine ? `None passes. Closest: <b>capitulation</b> (≥ 30% of stocks oversold the day before): ${pc(DATA.lab.refine.cap.A, 2)} a trade on the 613 never-used stocks and ${pc(DATA.lab.refine.cap.B, 2)} since 2022, but ${pc(DATA.lab.refine.cap.D, 2)} before 2022, and counted once per signal day only t ≈ 1 (a few dozen market rebound days). Volume, strong close and "high cleared" made calls <i>worse</i>. Forward test of capitulation days: ${DATA.lab.capitulation ? `${DATA.lab.capitulation.closedDays}/${DATA.lab.capitulation.needed} days` : 'from 13 Oct'}. Pre-registered 2026-10-12` : ''],
      ['Catalyst in a base: a quiet stock (sideways, or near the bottom of its range) gets an ownership or earnings filing (change of control, tender offer, acquisition, contract, buyback, new business)', 'failed', L.catalyst ? `The opposite. On ${L.catalyst.stocks} stocks with IDX filing history (2023-07 to 2026-08), ${L.catalyst.h1.n} events made ${pc(L.catalyst.h1.ex, 2)} per 20 sessions vs the market (t ${L.catalyst.h1.t.toFixed(1)}), worse than quiet stocks with no filing (${pc(L.catalyst.control.ex, 2)}). Buybacks in quiet stocks ${pc(L.catalyst.byClass.buyback && L.catalyst.byClass.buyback.ex, 1)} (they come after crashes); only change of control was positive, ${pc(L.catalyst.byClass.control && L.catalyst.byClass.control.ex, 1)} on ${L.catalyst.byClass.control ? L.catalyst.byClass.control.n : 0} events, t ${L.catalyst.byClass.control ? L.catalyst.byClass.control.t.toFixed(1) : '–'}. Forward test on all 300 from ${L.catalyst.forward ? L.catalyst.forward.from : '13 Oct'}: ${L.catalyst.forward ? L.catalyst.forward.events : 0}/40 events. Pre-registered 2026-10-12` : ''],
      ['Fix for few ACT calls: count a bounce candle up to 5 sessions after the oversold day (the score falls ~30 points on the bounce day itself)', 'failed', L.actWindow ? `More calls (${L.actWindow.summary.O613.W5} vs ${L.actWindow.summary.O613.L} on the 613 never-used stocks), but the late bounces are worse: since 2022 the extra calls made ${pc(L.actWindow.summary.RECENT.mX, 2)} a trade vs ${pc(L.actWindow.summary.RECENT.mL, 2)} for same-day calls. Unlocking the 200 SKIP stocks: failed (${pc(L.actWindow.summary.N200.mW, 2)} a trade). "Low held" on the bounce day: ${pc(L.actWindow.summary.O613.mH - L.actWindow.summary.O613.mNH, 2)}, t ${L.actWindow.summary.O613.tH.toFixed(1)}, failed. Pre-registered 2026-10-12` : ''],
      ['Bandarmetrics LPM (60-session change)', 'failed', L.flow2 ? `${pc(L.flow2.H3.spread, 1)}, p ${L.flow2.H3.p.toFixed(2)}` : ''],
      ['NeoBDM flow tags, 2-year replay', 'failed', 'FLOW+ minus FLOW− −0.13% per 5 sessions'],
      ['Payoff: 80 exits (stop, target, hold, early exit) on the bounce entries, picked on 2017-22', 'failed', DATA.payoff && DATA.payoff.study ? `Pick ${DATA.payoff.study.pick} fell apart out of sample; capped stops were the worst; the +8% target was the weak part` : ''],
      ['Confirmation on 613 never-used stocks: wide stop + 20-day-average target', 'failed', DATA.payoff && DATA.payoff.confirm ? `${pc(DATA.payoff.confirm.A.mean, 2)} a trade (live exit ${pc(DATA.payoff.confirm.B.mean, 2)}): the bounce entry loses outside the stocks it was built on` : ''],
      ['Survivorship audit: delisted (2020-26) and frozen stocks, hindsight universe', 'measured', DATA.payoff && DATA.payoff.surv ? `Delisting bias small since 2020; hindsight universe large: all liquid stocks ${pc(DATA.payoff.surv.universe.pitMean, 2)} a trade` : ''],
      ['Stock picking in bear months (IHSG under its 200-day average): 12-month winners, 3-month winners, calmest stocks, calm winners', 'failed', L.bear ? `None beat 10 random stocks (best: 3-month winners ${pc(L.bear.results.B2_MOM3.mean)} a month, p ${L.bear.results.B2_MOM3.p.toFixed(2)}). Surprise: in those ${L.bear.bearMonths} months the average liquid stock still made ${pc(L.bear.ewBear)} a month and the IHSG ${pc(L.bear.ihsgBear)}; the 200-day line did not predict a falling next month` : ''],
    ];
    return `<h2>Signal lab: every idea tested, and where it stands</h2>
      <div class="card scroll"><table><thead><tr><th>Idea</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${st(r[1])}</td><td class="muted">${r[2]}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted">How a test works here (tools/study-lib.mjs): the rule and its pass bar are committed before the first run; samples are taken on dates 20 sessions apart so one move is never counted twice; the null shuffles the signal across stocks within each date; a pass needs p &lt; 0.05, t ≥ 2 and the same sign in both halves. A "convinced" badge only comes from a passed test.</p>`;
  }

  // ---------- sideways base -> accumulation -> breakout (watch; tools/experiment-base.mjs failed, forward-tested) ----------
  const accList = a => (a ? [a.bandar && 'bandar', a.lpm && 'LPM', a.foreign && 'foreign'].filter(Boolean) : []);
  const baseOn = p => p.base && !p.thin && !p.suspended && (p.base.brk || accList(p.base.acc).length); // liquid only, as tested
  const baseChip = p => { const B = p.base; if (!baseOn(p)) return ''; const a = accList(B.acc);
    return `<span class="tag bchip" title="Watch only: base breakouts did not beat the market in a 9-year test (Signal lab).">${B.brk ? 'breakout from base' : 'coiling'}${a.length ? ' · ' + a.join('+') + ' accumulating' : ''} · watch</span>`; };
  function baseHtml(p) {
    const B = p.base, S = DATA.lab && DATA.lab.base, F = DATA.lab && DATA.lab.baseForward;
    const ev = S ? `In a 9-year test (${S.events} breakouts from a 40-session base), breakouts did no better than the market (excess ${pc(S.all.ex)}); with LPM rising during the base they did ${pc(S.versions.lpm.with.ex)} vs ${pc(S.versions.lpm.without.ex)} without, pointing the right way but not significant (t ${S.versions.lpm.with.t.toFixed(1)}); bandar and foreign accumulation did not help. A forward test${F ? ` (${F.events} breakouts so far, needs 60 per version)` : ''} decides whether it becomes an ACT setup.` : '';
    if (!B) return `<p class="muted">Not in a sideways base now (the last 40 sessions moved more than 25%, or no base). ${ev}</p>`;
    const a = B.acc || {}, yn = v => (v == null ? '<span class="mute">no data</span>' : v ? '<span class="up">yes</span>' : '<span class="mute">no</span>');
    return `<div class="whobox"><p>${B.brk ? `<b>Breakout today.</b> The close cleared the 40-session base high of ${f0(B.hi)} on ${B.volx ? B.volx.toFixed(1) + '×' : 'high'} the base's average volume.` : `<b>Coiling in a sideways base</b> between ${f0(B.lo)} and ${f0(B.hi)} (${(B.range * 100).toFixed(0)}% range over 40 sessions). A close above ${f0(B.hi)} on 1.5× volume would be the breakout.`}</p>
      <p>Accumulation during the base: bandar ${yn(a.bandar)} · LPM rising ${yn(a.lpm)} · foreign ${yn(a.foreign)}</p></div>
      <p class="muted">Watch only. ${ev}</p>`;
  }

  // ---------- speculation season + speculative breakouts (tools/spec.mjs; watch, forward-tested) ----------
  const vChip = p => (p.vspike && p.vspike.f > 0 && !p.thin ? `<span class="tag wchip" title="Volume spike on ${esc(p.vspike.d)} (×${p.vspike.x}, ${esc(p.vspike.type)} candle) with foreigners net buying that day. Watch only: worked in 2024-26, not in 2022-24 (Signal lab).">foreign-backed volume spike · watch</span>` : '');
  const specChip = p => (p.spec ? `<span class="tag schip" title="Cheap, volatile stock breaking out. Lottery-like: a few big winners, most trades lose. Watch only (Breakout lab).">speculative breakout · ${DATA.spec && DATA.spec.on ? 'season ON' : 'season off'} · watch</span>` : '');
  function specBanner() {
    const S = DATA.spec; if (!S) return '';
    return `<div class="note ${S.on ? '' : 'warnnote'}"><b>Speculation season: ${S.on ? 'ON' : 'OFF'}.</b> Cheap, volatile breakouts that resolved over the last 60 sessions did ${pc(S.meter)} against the market (${S.events} trades). ${S.on ? 'In past seasons like this they kept paying on average, but through a few huge winners: most single trades still lost.' : 'Outside seasons they have lost money.'} ${S.today.length ? `Today: ${S.today.map(esc).join(', ')}.` : 'No speculative breakout today.'} Watch only; see Breakout lab.</div>`;
  }
  function breakoutLabHtml() {
    const S = DATA.spec; if (!S) return '';
    const C = S.crack || {}, X = S.study, F = S.forward;
    return `<h2>Breakout lab: what we searched, and what we found</h2>
      <div class="card scroll"><table><thead><tr><th>Step</th><th>Result</th></tr></thead><tbody>
        <tr><td>Search ~30 breakout features (technical, Bandarmetrics, NeoBDM bandar / foreign / retail) and their best pairs, in 3 data tracks</td><td>${Object.entries(C).map(([k, v]) => `${k}: best t ${v.bestT.toFixed(2)} vs ${v.null95.toFixed(2)} for the best of 100 searches on shuffled outcomes`).join('; ')}. <b>No pattern beat chance.</b></td></tr>
        <tr><td>The one theme that recurred: breakouts in cheap (&lt; Rp ${SPEC_PRICE}), volatile stocks. Frozen and tested once on unseen data</td><td>${X ? `2026: ${pc(X.A.ex)} excess (n ${X.A.n}); 612 never-used stocks: ${pc(X.B.ex)} (t ${X.B.t.toFixed(1)}), ${pc(X.stress.trim)} without the best 5%. <b>Failed.</b>` : ''}</td></tr>
        <tr><td>Why: it is a season, not a pattern</td><td>${X ? Object.entries(X.byYear).filter(([, v]) => v.n >= 10).map(([y, v]) => `${y} ${pc(v.ex, 1)}`).join(' · ') : ''}. It pays in speculative manias (2021, late 2025) and loses otherwise; even then most single trades lose.</td></tr>
        <tr><td>Forward test (speculative breakouts while the season is ON)</td><td>${F ? `${F.events} of ${F.needed} events${F.events ? `, excess ${pc(F.ex)}, t ${F.t.toFixed(2)}` : ''}` : 'starts 13 Oct'}. Becomes an ACT setup only with t ≥ 2 and a basket positive after fees.</td></tr>
      </tbody></table></div>
      <p class="muted">Why the search was tested against itself: try enough patterns and the best one always looks great. Rerunning the identical search on outcomes reshuffled within each date shows how good "great" looks by pure chance; here the real best never cleared it.</p>`;
  }
  const SPEC_PRICE = 854;

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
      <ul class="checks">${sc.promotion.checks.map(c => `<li class="${c.ok ? 'up' : 'mute'}">${c.ok ? '✓' : '○'} ${esc(c.rule)} <span class="muted">(${esc(JSON.stringify(c.value))})</span></li>`).join('')}</ul>
      ${sc.contrarian ? `<h3>Contrarian hypothesis C1 ${sc.contrarian.confirmed ? '<span class="tag">confirmed</span>' : '<span class="tag RISK">open</span>'}</h3><p class="muted">Found in the 2-year replay, so only live snapshots can confirm it: stocks the bandar <b>sold</b> most over 5 sessions (bottom third) minus those it <b>bought</b> most (top third), next 5 sessions, excess. Needs 60 resolved days, overlap-adjusted t ≥ 2 and both halves positive. So far: ${sc.contrarian.days} day${sc.contrarian.days === 1 ? '' : 's'}${sc.contrarian.days ? `, ${pc(sc.contrarian.avg, 2)}, t ${sc.contrarian.tAdj == null ? '–' : sc.contrarian.tAdj.toFixed(1)}` : ''}.</p>` : ''}`;
  }
  function bmBtHtml(bm) {
    const x = bm && bm.experiment;
    if (!x) return '<p class="muted">Not run yet (tools/experiment-bm.mjs).</p>';
    const t = v => (v == null ? '–' : v.toFixed(1));
    return `<p class="muted">LPM, Intensity, Volume Rotation and Money Flow from Bandarmetrics, ${esc(x.from)} to ${esc(x.to)}, ${x.act.toLocaleString()} ACT signals. The tests and pass bars were written down before the first run. Each needs a high enough t both with one trade per episode and by day, plus a positive gap on the 73 unseen stocks and in both halves. ${x.results.some(r => r.pass) ? '' : '<b>None passed</b>, so the read is shown as context and never changes a badge. Exploratory checks at 20, 40 and 60 sessions and across all stocks found no significant edge either.'}${bm.stale ? ' Labels are stale (' + esc(bm.asOf) + ').' : ''}</p>
      <div class="card scroll"><table><thead><tr><th>Test (A vs B)</th><th class="n">Gap per trade</th><th class="n">t, episodes</th><th class="n">t, by day</th><th class="n">Unseen</th><th class="n">1st / 2nd half</th><th>Result</th></tr></thead><tbody>
      ${x.results.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${pc(r.gapEpisodes, 2)}</td><td class="n">${t(r.tEpisodes)}</td><td class="n">${t(r.tByDay)}</td><td class="n">${pc(r.unseen, 2)}</td><td class="n">${pc(r.firstHalf, 1)} / ${pc(r.secondHalf, 1)}</td><td>${r.pass ? '<span class="up">pass</span>' : '<span class="mute">fail (bar ' + r.bar + ')</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function bmScoreBtHtml(x) {
    if (!x) return '';
    const r = x.results.find(y => y.label === 'S_act');
    if (!r || r.empty) return '';
    const t = v => (v == null ? '–' : v.toFixed(1));
    return `<h3>Data-weighted Bandarmetrics score</h3><p class="muted">Instead of BM's own rules, each input's weight was learned on Apr 2023 to Sep 2024 (the inputs need a year of history first) and judged only on Oct 2024 to Sep 2026. Trained on oversold trades, it kept one input: the <b>60-day LPM trend</b>. Out of sample, ACT trades in its top half beat the bottom half by ${pc(r.gapEpisodes, 2)} per trade (t=${t(r.tEpisodes)}), ${pc(r.gapByDay, 2)} by day (t=${t(r.tByDay)}), ${pc(r.unseen, 2)} on unseen stocks. The direction held everywhere, but it ${r.pass ? 'passed' : 'did not clear the bar (t >= 2)'}. So it is shown as the experimental <b>accumulation score</b> and logged daily; its live record is in Track record. A score trained on all stocks failed out of sample.</p>`;
  }
  // NeoBDM 2-year replay (tools/experiment-nb.mjs): the flow model run over NeoBDM's own Transaction Chart history.
  function curveSvg(a, b) {
    if (!a || !a.length) return '';
    const W = 560, H = 150, L = 6, R = 6, T = 8, B = 18, all = a.concat(b || []).map(p => p[1]);
    const lo = Math.min(...all), hi = Math.max(...all), x = i => L + (i / (a.length - 1)) * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
    const path = s => s.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Account value, live rule with and without the FLOW- veto">
      <line x1="${L}" x2="${W - R}" y1="${y(1)}" y2="${y(1)}" stroke="var(--mute)" stroke-dasharray="3 3"/>
      <path d="${path(a)}" fill="none" stroke="var(--mute)" stroke-width="1.6"/>${b ? `<path d="${path(b)}" fill="none" stroke="var(--accent)" stroke-width="2"/>` : ''}
      <text x="${L}" y="${H - 4}">${esc(a[0][0])}</text><text x="${W - R - 64}" y="${H - 4}">${esc(a.at(-1)[0])}</text></svg>`;
  }
  function nbHistHtml(x) {
    if (!x) return '<p class="muted">Not run yet (tools/nb-hist-pull.js, then tools/experiment-nb.mjs).</p>';
    const t = v => (v == null ? '–' : v.toFixed(1)), t2 = v => (v == null ? '–' : v.toFixed(2));
    const t1 = x.t1, tags = Object.entries(t1.tags).filter(([, g]) => g.n), phases = Object.entries(t1.phases).filter(([, g]) => g.n);
    const R = id => x.results.find(r => r.id === id) || {};
    const T2 = R('T2'), P = x.portfolio, live = x.act.liveByTag || {};
    const G = { m: 'Bandar', nr: 'Non-retail', i: 'Institution', s: 'Sultan', f: 'Foreign', z: 'Retail' };
    return `<div class="note"><b>Now backtested, not only forward-tested.</b> Each NeoBDM stock page carries about two years of its Transaction Chart (each group's running net buying). Replaying the flow model over it gives ${x.sessions} sessions × ${x.stocks} stocks (${esc(x.from)} to ${esc(x.to)}) of the exact read the site shows, scored with the forward test's own code and checklist. The tests and pass bars were committed before the data was pulled. Not replayable: NeoBDM's method-fit, crossing and Pinky flags, so every group is trusted fully and nothing is tagged AVOID.</div>
      ${(() => { const s = t1.spread5 || {}, acc = t1.phases.ACCUMULATION || {}, e = x.explore && x.explore.m;
        return `<div class="card pad"><p><b>Verdict: the flow read describes who is trading, but it does not predict.</b> Over the next 5 sessions, FLOW+ stocks did ${pc(s.avg, 2)} versus FLOW- (t ${t(s.tAdj)} after the overlap correction; the bar was +2). "Accumulation", big money buying into weakness, came out <i>below</i> average (${pc(acc.avgExcess, 2)}, t ${t(acc.t)}). For the trade itself, bounces with big money selling did ${live['FLOW-'] ? pc(live['FLOW-'].avg, 2) : '–'} per trade versus ${live['FLOW~'] ? pc(live['FLOW~'].avg, 2) : '–'} for neutral flow, and skipping them would have cut the account from ${pc(P && P.base.cagr, 1)} to ${pc(P && P.veto.cagr, 1)} a year.</p>
          <p><b>What changed on the site:</b> the ACT+ / ACT? sub-badges are retired (they implied flow-up bounces were better, which the replay contradicts); flow stays as context, and Pinky / illiquid still veto. ${e ? `The one hint left: short-term bandar <i>buying</i> came before slight <i>underperformance</i> (rank correlation ${t2(e.ic)}, t ${t(e.t)}; ${t2(e.partial)} after removing the price move), but only in the second year (${t2(e.h1)} then ${t2(e.h2)}). It is now a forward-test hypothesis (C1, below), not a rule.` : ''}</p></div>`; })()}
      <h3>1. Does the flow tag predict the next 5 sessions? ${t1.pass ? '<span class="tag">passed</span>' : '<span class="tag RISK">failed</span>'}</h3>
      <div class="card scroll"><table><thead><tr><th>Label (replayed)</th><th class="n">Stock-days</th><th class="n">Excess, 5 sessions</th><th class="n">t</th></tr></thead><tbody>
      ${tags.concat(phases).map(([k, g]) => `<tr><td>${esc(k)}</td><td class="n">${g.n.toLocaleString()}</td><td class="n">${pc(g.avgExcess, 2)}</td><td class="n">${t(g.t)}</td></tr>`).join('')}</tbody></table></div>
      <ul class="checks">${t1.checks.map(c => `<li class="${c.ok ? 'up' : 'mute'}">${c.ok ? '✓' : '○'} ${esc(c.rule)} <span class="muted">(${esc(JSON.stringify(c.value))})</span></li>`).join('')}</ul>
      <h3>2. Does it improve the trade? ${x.vetoAdopted ? '<span class="tag">veto adopted</span>' : '<span class="tag RISK">not adopted</span>'}</h3>
      <p class="muted">${x.act.signals.toLocaleString()} ACT signals in the window, traded with the live rule (wide stop, +8%, 15 sessions, fees). One trade per stock episode, by-day clustering, the 73 unseen stocks and both halves (split Oct 2025) must all agree.</p>
      <div class="card scroll"><table><thead><tr><th>Test (A vs B)</th><th class="n">A / B per trade</th><th class="n">Gap</th><th class="n">t, episodes</th><th class="n">t, by day</th><th class="n">Unseen</th><th class="n">1st / 2nd half</th><th>Result</th></tr></thead><tbody>
      ${x.results.filter(r => r.id !== 'T5').map(r => `<tr><td>${esc(r.id)} ${esc(r.name)}</td><td class="n">${pc(r.avgA, 2)} / ${pc(r.avgB, 2)}</td><td class="n">${pc(r.gap, 2)}</td><td class="n">${t(r.t)}</td><td class="n">${t(r.tDay)}</td><td class="n">${pc(r.unseen, 2)}</td><td class="n">${pc(r.h1, 1)} / ${pc(r.h2, 1)}</td><td>${r.pass ? '<span class="up">pass</span>' : '<span class="mute">fail (bar ' + r.bar + ')</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted">The live trade (ACT + bounce candle), one per episode: ${['FLOW+', 'FLOW~', 'FLOW-'].map(k => live[k] ? `${k} ${live[k].n} trades, avg ${pc(live[k].avg, 2)}` : '').filter(Boolean).join(' · ')}.</p>
      ${P ? `<p class="muted">As an account (5 positions, market filter on, idle cash 4.5%), ${esc(P.from)} to ${esc(P.to)} (flat stretches = market filter off, in cash): <b>live rule</b> (grey) ${pc(P.base.cagr, 1)} a year, worst drawdown ${pc(P.base.mdd, 1)}, ${P.base.trades} trades; <b style="color:var(--accent)">with the FLOW- veto</b> ${pc(P.veto.cagr, 1)}, ${pc(P.veto.mdd, 1)}, ${P.veto.trades} trades.</p>${curveSvg(P.base.curve, P.veto.curve)}` : ''}
      <h3>3. Broker inventory: do a few brokers loading up matter?</h3>
      <p class="muted">NeoBDM's Inventory Analysis, one year (${esc(x.invFrom)} to ${esc(x.invTo)}), each stock's 20 most active brokers by gross value (not by net, so the choice does not know who accumulated). Concentration = the 3 biggest net buyers plus the 3 biggest net sellers over 20 sessions, as a share of volume. Rank correlation with the next 5 sessions: ${t2(R('T5').ic)} (t=${t(R('T5').t)}; halves ${t2(R('T5').h1)} / ${t2(R('T5').h2)}; unseen ${t2(R('T5').unseen)}) → ${R('T5').pass ? '<span class="up">pass</span>' : '<span class="mute">fail (bar 2.5)</span>'}.</p>
      <h3>4. Which group's flow leads price? (descriptive)</h3>
      <div class="card scroll"><table><thead><tr><th>Group</th><th class="n">5-session flow: IC</th><th class="n">t</th><th class="n">20-session flow: IC</th><th class="n">t</th><th class="n">20s halves</th></tr></thead><tbody>
      ${Object.entries(G).map(([g, l]) => { const a = x.groupIC[g + '5'] || {}, b = x.groupIC[g + '20'] || {}; return `<tr><td>${l}</td><td class="n">${t2(a.ic)}</td><td class="n">${t(a.t)}</td><td class="n">${t2(b.ic)}</td><td class="n">${t(b.t)}</td><td class="n">${t2(b.h1)} / ${t2(b.h2)}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="muted">IC = rank correlation between a group's net buying (share of turnover) and the next 5 sessions' return versus other stocks, on every 5th session so windows don't overlap. Positive = buying by that group came before outperformance. Read-only: nothing here was used to pick a rule.</p>`;
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
    el.innerHTML = `<div class="ph-head"><div><h1>Broker flow</h1><p>Who is buying and selling: NeoBDM groups, the broker directory, and what the flow studies found.</p></div></div>
      ${F.stale ? `<div class="note"><b>Flow data is stale (${esc(F.asOf)}).</b> Labels are shown for reference but no longer change any badge. Run the daily NeoBDM pull.</div>` : ''}
      <p class="muted">NeoBDM broker flow of ${esc(F.asOf || '–')}, read the same way every day (rules fixed in <code>tools/flow-model.mjs</code>). <b>Big money</b> = Bandar, Non-retail, Institution and Sultan combined; <b>retail</b> is read as the other side of the trade. A phase compares big money's 20-day flow with the 20-day price move.</p>
      <div class="chips" role="group" aria-label="Phase">
        ${['ALL', 'ACCUMULATION', 'MARKUP', 'DISTRIBUTION', 'MARKDOWN', 'NEUTRAL'].map(ph => `<button class="chip" data-ph="${ph}" aria-pressed="${FLOWPH === ph}">${ph === 'ALL' ? 'All (' + P.length + ')' : ph.toLowerCase() + ' (' + cnt(ph) + ')'}</button>`).join('')}
        <label class="muted"><input type="checkbox" id="fact" ${FLOWACT ? 'checked' : ''}> ACT only</label>
        <input type="search" id="fq" placeholder="Ticker or sector" value="${esc(FLOWQ)}" style="max-width:200px;margin-left:auto">
      </div>
      <div class="card scroll"><table><thead><tr><th>Ticker</th><th>Flow</th><th>Last 60 sessions</th><th>Phase</th><th>Big money 20d / 5d</th><th>Bandar 20d</th><th>Foreign 5d / 20d</th><th>Retail 20d</th><th>Transfer</th><th>BM read</th><th>BM score</th><th>Rotation</th><th>Pick</th></tr></thead><tbody>
      ${list.length ? list.map(p => { const n = p.neobdm; return `<tr class="row" data-open="${esc(p.ticker)}" title="Open ${esc(p.ticker)}"><td><b class="tk">${esc(p.ticker)}</b><div class="nm">${esc(p.sector)}</div></td>
        <td><span class="tag ${n.tag === 'AVOID' ? 'RISK' : ''}">${esc(n.tag)}</span>${n.source === 'chart' ? '<div class="muted" title="Outside the NeoBDM screener list: read from the stock page Transaction Chart; method-fit and dirty-tape flags not available">stock page</div>' : ''}</td><td>${stripHtml(p.flowHist, false)}</td><td>${phaseHtml(n.phase)}${p.flowHist && p.flowHist.ph === n.phase ? `<div class="muted">${p.flowHist.phDays} sessions</div>` : ''}${n.turn ? `<div class="muted">${esc(n.turn)}</div>` : ''}</td>
        <td>${dirHtml(n.bigMoney && n.bigMoney.d20)} / ${dirHtml(n.bigMoney && n.bigMoney.d5)}</td>
        <td>${g(p, 'm', 'd20')}</td><td>${g(p, 'f', 'd5')} / ${g(p, 'f', 'd20')}</td><td>${g(p, 'z', 'd20')}</td>
        <td class="muted">${esc(n.retail)}${n.dirty ? '<div class="down">dirty tape</div>' : ''}</td>
        <td>${p.bm ? bmReadHtml(p.bm) + (p.bm.spike ? '<div class="muted">Intensity spike</div>' : '') : '<span class="mute">–</span>'}</td><td>${bmScoreHtml(p.bm && p.bm.score)}</td><td>${bandHtml(p.bm)}</td>
        <td><span class="act ${p.action}">${p.action}</span> ${tierHtml(p)}</td></tr>`; }).join('') : '<tr><td colspan="13" class="empty">Nothing matches.</td></tr>'}</tbody></table></div>
      <h2>Does broker flow help? 2-year replay</h2>
      ${nbHistHtml(F.history)}
      ${brokerDirHtml(DATA.brokerDirectory)}
      ${brokerCostStudyHtml(DATA.brokerCostStudy)}
      <h2>Forward test (live snapshots)</h2>
      <div class="note"><b>Why a forward test as well.</b> The replay cannot see NeoBDM's method-fit and dirty-tape flags, and NeoBDM could revise old data. So every trading day the full live snapshot is still saved and scored later, with the checklist below (fixed on 2026-10-09, before any result; t is corrected for overlapping holding periods).</div>
      ${scorecardHtml(F.scorecard)}
      <h2>Foreign flow: 4-year backtest (IDX data)</h2>
      ${foreignBtHtml(F.foreignBacktest)}
      <h2>Bandarmetrics read: 4-year backtest</h2>
      ${bmBtHtml(F.bm)}
      ${bmScoreBtHtml(F.bm && F.bm.scoreExperiment)}`;
    el.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => { FLOWPH = b.dataset.ph; renderFlow(); });
    { const q = $('#bdq', el); if (q) q.oninput = e => { const v = e.target.value.trim().toLowerCase(); el.querySelectorAll('#bdtab tbody tr').forEach(r => { r.hidden = v && !r.dataset.q.includes(v); }); }; }
    // A row opens that stock's full read in Picks.
    el.querySelectorAll('tr[data-open]').forEach(r => r.onclick = () => openStock(r.dataset.open));
    $('#fact', el).onchange = e => { FLOWACT = e.target.checked; renderFlow(); };
    $('#fq', el).oninput = e => { FLOWQ = e.target.value; const pos = e.target.selectionStart; renderFlow(); const i = $('#fq'); i.focus(); i.setSelectionRange(pos, pos); };
  }

  // ---------- conglomerate groups ----------
  const QUAD = { LEADING: ['leading', 'up', 'Stronger than the IHSG and still gaining'], IMPROVING: ['improving', 'up', 'Weaker than the IHSG but catching up'], WEAKENING: ['weakening', 'warn', 'Stronger than the IHSG but fading'], LAGGING: ['lagging', 'down', 'Weaker than the IHSG and still slipping'] };
  const f1x = x => (x == null ? '–' : x.toFixed(2));
  const quadHtml = q => { const x = QUAD[q]; return x ? `<span class="${x[1]}" title="${x[2]}">${x[0]}</span>` : '<span class="mute">–</span>'; };
  const sparkSvg = (a, w = 90, h = 22) => { if (!a || a.length < 2) return ''; const lo = Math.min(...a), hi = Math.max(...a), x = i => (i / (a.length - 1)) * w, y = v => h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4); return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${a.at(-1) >= a[0] ? 'var(--up)' : 'var(--down)'}" stroke-width="1.5"/></svg>`; };
  function rotationSvg(G) {
    const pts = G.groups.filter(g => g.trail && g.trail.length > 1);
    if (!pts.length) return '';
    const W = MQ.matches ? 340 : 620, H = MQ.matches ? 300 : 380, P = 28;
    // Scale to where groups are NOW (one runaway trail must not squash everyone else); older trail points are clipped.
    const xs = pts.map(g => g.trail.at(-1)[0]), ys = pts.map(g => g.trail.at(-1)[1]);
    const mx = Math.max(0.02, ...xs.map(Math.abs)) * 1.25, my = Math.max(0.01, ...ys.map(Math.abs)) * 1.25;
    const cl = (v, m) => Math.max(-m, Math.min(m, v));
    const x = v => P + ((cl(v, mx) + mx) / (2 * mx)) * (W - 2 * P), y = v => H - P - ((cl(v, my) + my) / (2 * my)) * (H - 2 * P);
    const quad = (x0, y0, x1, y1, label, cls, tx, ty, anchor) => `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" class="q${cls}"/><text x="${tx}" y="${ty}" text-anchor="${anchor}" class="ql">${label}</text>`;
    return `<svg class="rrg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rotation map: each group's strength versus the IHSG (across) and whether it is gaining or fading (up/down), with its path over 8 weeks">
      ${quad(x(0), P, W - P, y(0), 'Leading', 'L', W - P - 4, P + 14, 'end')}${quad(P, P, x(0), y(0), 'Improving', 'I', P + 4, P + 14, 'start')}
      ${quad(P, y(0), x(0), H - P, 'Lagging', 'G', P + 4, H - P - 6, 'start')}${quad(x(0), y(0), W - P, H - P, 'Weakening', 'W', W - P - 4, H - P - 6, 'end')}
      <line x1="${x(0)}" x2="${x(0)}" y1="${P}" y2="${H - P}" class="ax"/><line x1="${P}" x2="${W - P}" y1="${y(0)}" y2="${y(0)}" class="ax"/>
      <text x="${W / 2}" y="${H - 6}" text-anchor="middle" class="ql">← weaker than IHSG (20 sessions) · stronger →</text>
      ${(() => { // labels: nudge apart when two would overlap
        const L = pts.map(g => ({ g, lx: x(g.trail.at(-1)[0]) + 6, ly: y(g.trail.at(-1)[1]) + 4 })).sort((a, b) => a.ly - b.ly);
        L.forEach((a, i) => { for (let j = 0; j < i; j++) { const b = L[j]; if (Math.abs(a.lx - b.lx) < 70 && a.ly - b.ly < 12) a.ly = b.ly + 12; } });
        return L.map(({ g, lx, ly }) => { const inBox = p => Math.abs(p[0]) <= mx && Math.abs(p[1]) <= my, t = []; for (let k = g.trail.length - 1; k >= Math.max(0, g.trail.length - 4) && inBox(g.trail[k]); k--) t.unshift(g.trail[k]); if (!t.length) t.push(g.trail.at(-1)); const last = t.at(-1); return `<g><path d="${t.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')}" class="trail"/><circle cx="${x(last[0])}" cy="${y(last[1])}" r="4" class="dot ${g.read && g.read.quad}"/><text x="${lx}" y="${ly}" class="gl">${esc(g.id === 'bumn' ? 'BUMN' : g.alias.replace(/^saham /, ''))}</text><title>${esc(g.name)}: ${g.read ? (g.read.rs * 100).toFixed(1) + '% vs IHSG over 20 sessions' : ''}</title></g>`; }).join('');
      })()}
    </svg>`;
  }
  // Members' broker flow, summed: NeoBDM tags (FLOW+ / FLOW-) and Bandarmetrics LPM (rising / falling). Context only.
  function flowMixHtml(f) {
    if (!f || !f.nb) return '<span class="mute">–</span>';
    const bar = (a, b, n) => `<span class="mix2" title="${a} up, ${b} down of ${n}"><i class="u" style="flex:${a}"></i><i class="z" style="flex:${Math.max(0, n - a - b)}"></i><i class="d" style="flex:${b}"></i></span>`;
    const lean = f.accum - f.distrib + f.lpmUp - f.lpmDown;
    return `<div class="fm"><small>NeoBDM</small>${bar(f.plus, f.minus, f.nb)}<span class="muted">${f.plus}+ / ${f.minus}−</span></div>${f.bm ? `<div class="fm"><small>LPM</small>${bar(f.lpmUp, f.lpmDown, f.bm)}<span class="muted">${f.lpmUp}↑ / ${f.lpmDown}↓</span></div>` : ''}<div class="${lean > 0 ? 'up' : lean < 0 ? 'down' : 'mute'}" style="font-size:11.5px">${lean > 0 ? 'leaning accumulation' : lean < 0 ? 'leaning distribution' : 'no lean'}</div>`;
  }
  function renderGroups() {
    const el = $('#tab-groups'), G = DATA.groups;
    if (!G) { el.innerHTML = '<div class="card empty">No group data in this build (tools/groups.mjs).</div>'; return; }
    const st = G.study || {}, inPicks = new Set(DATA.picks.map(p => p.ticker));
    const list = G.groups.slice().sort((a, b) => (G.rankNow[a.id] || 99) - (G.rankNow[b.id] || 99));
    const nm = id => { const g = G.groups.find(x => x.id === id); return g ? g.name : id; };
    const hot = (G.hot || []).slice().sort((a, b) => a.age - b.age);
    const h4 = st.h4, h1 = st.h1, h2 = st.h2, h3 = st.h3;
    const ids = list.map(g => g.id), nW = G.weeks.length;
    const heat = `<div class="card scroll"><table class="heat"><thead><tr><th>Group</th>${G.weeks.map((w, i) => `<th title="${esc(w.d)}">${i % 4 === 0 || i === nW - 1 ? esc(w.d.slice(5)) : ''}</th>`).join('')}</tr></thead><tbody>
      ${ids.map(id => `<tr><td>${esc(nm(id))}</td>${G.weeks.map(w => { const r = w.rank[id], n = Object.keys(w.rank).length; return `<td class="hc" style="--k:${r ? (1 - (r - 1) / Math.max(1, n - 1)).toFixed(2) : 0}" title="${esc(w.d)}: ${r ? '#' + r + ' of ' + n : 'n/a'}">${r && r <= 3 ? r : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
    el.innerHTML = `<div class="ph-head"><div><h1>Conglomerate groups</h1><p>Saham PP, Haji Isam, Bakrie, MNC and others: who leads, who lags, and the rotation between them.</p></div></div>
      <p class="muted">Indonesian traders often play a conglomerate's stocks together, "saham PP" (Prajogo Pangestu), "saham Haji Isam", Bakrie, MNC, and move on to another group after a while. Each group below is an equal-weight index of its listed companies (a stock counts only while it trades at least Rp 1 B a day). Every link is backed by the KSEI ≥1% shareholder list of ${esc(G.mapAsOf || '–')}; an asterisk marks a well-known link whose holding company is not named there. The map lives in <code>tools/groups-map.json</code>.</p>
      ${hot.length ? `<div class="note"><b>Hot right now:</b> ${hot.map(h => `${esc(nm(h.id))} jumped 10%+ in a week (${h.age === 0 ? 'today' : h.age + ' session' + (h.age === 1 ? '' : 's') + ' ago'})`).join('; ')}. ${h4 ? `In the 5-year test, groups after a jump like this beat the IHSG by ${pc(h4.avg, 1)} on average over the next 2 weeks (${pct1(h4.win)} of the time; ${h4.events} cases). A tendency, not a promise, and it is a momentum trade, not the oversold-bounce setup this screener trades.` : ''}</div>` : ''}
      <div class="card scroll"><table><thead><tr><th class="n">#</th><th>Group</th><th>Now</th><th class="n">5 days</th><th class="n">20 days</th><th class="n">vs IHSG 20d</th><th class="n">60 days</th><th>Last 60 sessions</th><th class="n">Weeks top 3</th><th>Big money in the group</th><th>Members</th></tr></thead><tbody>
      ${list.map(g => { const r = g.read || {}; return `<tr><td class="n">${G.rankNow[g.id] || '–'}</td><td><b>${esc(g.name)}</b><div class="nm">${esc(g.alias)}${r.active != null ? ` · ${r.active} trading` : ''}</div></td><td>${quadHtml(r.quad)}${hot.some(h => h.id === g.id) ? ' <span class="tag">hot</span>' : ''}</td>
        <td class="n">${pc(r.r5)}</td><td class="n">${pc(r.r20)}</td><td class="n">${pc(r.rs)}</td><td class="n">${pc(r.r60)}</td><td>${sparkSvg(g.spark)}</td><td class="n">${g.weeksTop3 || '–'}</td><td>${flowMixHtml(g.flow)}</td>
        <td class="mem">${g.members.map(m => inPicks.has(m.tk) ? `<button class="chip sm" data-open="${esc(m.tk)}" title="${esc(m.evidence || m.note || 'known link')}">${esc(m.tk)}${m.soft ? '*' : ''}</button>` : `<span class="chip sm off" title="${esc(m.evidence || m.note || 'known link')} (outside the screener's 100)">${esc(m.tk)}${m.soft ? '*' : ''}</span>`).join('')}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="muted">Ranked by 20-session return versus the IHSG, groups with at least 2 trading members. "Big money in the group" adds up the members' NeoBDM tags and Bandarmetrics LPM; context only (neither predicted bounces in the tests). Members in blue are in the screener's universe and open the stock; hover a member for the KSEI holder that links it.</p>
      <h2>Rotation map</h2>
      <p class="muted">Across: how much stronger than the IHSG the group was over 20 sessions. Up/down: whether that lead is growing or shrinking over the last week. Groups usually travel counter-clockwise: improving → leading → weakening → lagging. The tail is each group's path over the last 3 weeks.</p>
      <div class="card pad">${rotationSvg(G)}</div>
      <h2>Who led, week by week (last 26 weeks)</h2>
      <p class="muted">Darker = higher rank that week; numbers mark the top 3. This is the rotation: money sits in a group for a while, then moves.</p>
      ${heat}
      <h2>Does the rotation story hold up? 5-year test</h2>
      ${h1 ? `<div class="card pad"><ul class="checks">
        <li class="${h2 && h2.sameGroup > h2.crossGroupSameSector ? 'up' : 'mute'}"><b>Group stocks do move together.</b> Daily returns of two stocks in the same group correlate ${f1x(h2 && h2.sameGroup)} on average, versus ${f1x(h2 && h2.crossGroupSameSector)} for two stocks in the same sector but different groups. So it is not only a sector effect.</li>
        <li class="mute"><b>Rotation is fast.</b> A group stays in the top 3 for a median of ${h1.runMedianWeeks} week${h1.runMedianWeeks === 1 ? '' : 's'} (mean ${h1.runMeanWeeks.toFixed(1)}), and the #1 group changed in ${h1.leaderChanges} of ${h1.weeks - 1} weeks.</li>
        <li class="mute"><b>Leaders keep leading a little, but not reliably</b> (the primary test): the top 3 groups beat the bottom 3 by ${pc(h1.horizons['20'].avg, 1)} over the next 20 sessions, positive in both halves, but t ${h1.horizons['20'].tAdj.toFixed(1)} after the overlap correction (the bar was 2). Verdict: ${esc(h1.verdict === 'NEITHER' ? 'no reliable momentum or reversal' : h1.verdict.toLowerCase())}.</li>
        ${h4 ? `<li class="${h4.pass ? 'up' : 'mute'}"><b>After a group jumps 10%+ in a week, it tends to keep going</b> ${h4.pass ? '(passed, bar t ≥ 2.5)' : '(failed)'}: over the next 10 sessions it beat the IHSG by ${pc(h4.avg, 2)} (t ${h4.t.toFixed(1)}, ${h4.events} cases, ${pct1(h4.win)} positive; ${pc(h4.h1, 1)} and ${pc(h4.h2, 1)} in the two halves). Strongest for ${Object.entries(h4.byGroup).filter(([, v]) => v.n >= 8).sort((a, b) => b[1].avg - a[1].avg).slice(0, 3).map(([k, v]) => `${esc(nm(k))} (${v.n}×, ${pc(v.avg, 1)})`).join(', ')}; it failed for ${Object.entries(h4.byGroup).filter(([, v]) => v.n >= 4 && v.avg < 0).map(([k, v]) => `${esc(nm(k))} (${v.n}×, ${pc(v.avg, 1)})`).join(', ') || 'none'}. Cases on the same days overlap, so the real certainty is lower than t suggests.</li>` : ''}
        ${h3 ? `<li class="${h3.pass ? 'up' : 'mute'}"><b>For this screener's bounce trades, the group's trend does not matter</b> ${h3.pass ? '(passed)' : '(failed)'}: oversold bounces in groups that were leading or improving averaged ${pc(h3.avgA, 2)} per trade versus ${pc(h3.avgB, 2)} in lagging or weakening groups (t ${h3.t.toFixed(1)}; by day ${h3.tDay.toFixed(1)}). The badge stays as it is.</li>` : ''}
      </ul><p class="muted">Rules written and committed before the first run (<code>tools/experiment-groups.mjs</code>), from ${esc(st.from || '–')}. Membership uses today's ownership for the whole period (except dated changes such as PTRO joining Prajogo in 2023), so older history is slightly flattering to today's groups.</p></div>` : '<p class="muted">Study not run yet.</p>'}
      <h3>Live record of the "hot group" rule (since ${esc(G.liveFrom)})</h3>
      ${(G.live || []).length ? `<div class="card scroll"><table><thead><tr><th>Group</th><th>Jump seen</th><th class="n">Next 10 sessions vs IHSG</th></tr></thead><tbody>${G.live.map(e => `<tr><td>${esc(nm(e.id))}</td><td>${esc(e.d)}</td><td class="n">${e.x == null ? `<span class="mute">open, ${Math.max(0, 11 - e.age)} sessions left</span>` : pc(e.x, 2)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No group has jumped 10%+ in a week since the rule was fixed. Cases will appear here and be scored automatically.</p>'}`;
    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openStock(b.dataset.open));
  }

  // ---------- signals shown as chips / filters ----------
  const whoOn = p => { const w = p.who; return !!(w && !w.stale && w.fcT === 3 && w.fbT === 3); };
  const vOn = p => !!(p.vspike && p.vspike.f > 0 && !p.thin);
  const momOf = t => (DATA.momentum && (DATA.momentum.holdings || []).find(h => h.t === t)) || null;
  const sparkPts = (p, n = 40) => (p.spark || []).slice(-n).concat(p.live ? [p.live.price] : []);

  // ---------- Market (home): today at a glance ----------
  // Squarified treemap (Bruls et al.): sectors sized by traded value, stocks inside coloured by today's change.
  function squarify(items, x, y, w, h) {
    const out = [], total = items.reduce((s, i) => s + i.v, 0);
    if (!total || w <= 0 || h <= 0) return out;
    const scale = (w * h) / total, rest = items.map(i => ({ ...i, a: i.v * scale }));
    const worst = (row, side) => { const s = row.reduce((t, r) => t + r.a, 0), mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
    let row = [];
    while (rest.length) {
      const side = Math.min(w, h), c = rest[0];
      if (!row.length || worst(row.concat(c), side) <= worst(row, side)) { row.push(rest.shift()); continue; }
      ({ x, y, w, h } = layRow(row, x, y, w, h, out)); row = [];
    }
    if (row.length) layRow(row, x, y, w, h, out);
    return out;
  }
  function layRow(row, x, y, w, h, out) {
    const s = row.reduce((t, r) => t + r.a, 0);
    if (w >= h) { const cw = s / h; let cy = y; row.forEach(r => { const rh = r.a / cw; out.push({ ...r, x, y: cy, w: cw, h: rh }); cy += rh; }); return { x: x + cw, y, w: w - cw, h }; }
    const ch = s / w; let cx = x; row.forEach(r => { const rw = r.a / ch; out.push({ ...r, x: cx, y, w: rw, h: ch }); cx += rw; }); return { x, y: y + ch, w, h: h - ch };
  }
  let MAPBY = LS.get('mapBy') || '1d';
  const mapChg = p => (MAPBY === '5d' ? p.chg5d : MAPBY === '20d' ? p.chg20d : chOf(p));
  const heatCol = x => { if (x == null) return 'var(--card2)'; const k = Math.min(1, Math.abs(x) / (MAPBY === '1d' ? 0.05 : MAPBY === '5d' ? 0.12 : 0.25)); return x >= 0 ? `hsl(152 ${35 + 35 * k}% ${24 + 10 * k}%)` : `hsl(352 ${40 + 35 * k}% ${28 + 12 * k}%)`; };
  function treemapHtml(box) {
    const W = box.clientWidth || 900, H = box.clientHeight || 440;
    const P = DATA.picks.filter(p => !p.suspended && p.valueB > 0.5);
    const bySec = {}; P.forEach(p => (bySec[p.sector] = bySec[p.sector] || []).push(p));
    const secs = Object.entries(bySec).map(([s, m]) => ({ s, m, v: m.reduce((t, p) => t + Math.sqrt(p.valueB), 0) })).sort((a, b) => b.v - a.v);
    const rects = squarify(secs, 0, 0, W, H);
    return rects.map(r => {
      const kids = squarify(r.m.map(p => ({ p, v: Math.sqrt(p.valueB) })).sort((a, b) => b.v - a.v), 0, 0, r.w, r.h);
      return `<div class="tm-sec" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px">${r.w > 70 && r.h > 40 ? `<span>${esc(r.s)}</span>` : ''}${kids.map(k => { const ch = mapChg(k.p), sz = k.w * k.h, cls = sz > 9000 ? 'l' : sz > 1800 ? '' : sz > 700 ? 's' : 'xs';
        return `<div class="tm-c ${cls}" data-open="${esc(k.p.ticker)}" style="left:${k.x}px;top:${k.y}px;width:${k.w}px;height:${k.h}px;background:${heatCol(ch)}" title="${esc(k.p.ticker)} · ${esc(k.p.name)} · ${ch == null ? '–' : (ch * 100).toFixed(2) + '%'} · Rp ${k.p.valueB.toFixed(0)} B/day"><b>${esc(k.p.ticker)}</b><small>${ch == null ? '' : (ch > 0 ? '+' : '') + (ch * 100).toFixed(1) + '%'}</small></div>`; }).join('')}</div>`;
    }).join('');
  }
  function convCardHtml(p) {
    const px = pxOf(p), stop = p.wideStop || p.stop, lo = Math.min(stop, px), hi = Math.max(p.target, px), sc = v => ((v - lo) / (hi - lo || 1) * 100).toFixed(1) + '%';
    const m = thesisModel(p, OHLCR.get(p.ticker));
    return `<div class="ccard" data-open="${esc(p.ticker)}">
      <div class="top">${avatar(p.ticker)}<div><b class="tk">${esc(p.ticker)}</b> ${tierHtml(p)}<div class="nm">${esc(p.name)}</div></div><div class="px"><b>${f0(px)}</b>${chgPill(chOf(p))}</div></div>
      <div class="why">${m.short}</div>
      <div class="mini-map" style="--sl:${sc(stop)};--sl2:${sc(px)};--now:${sc(px)}"><i></i></div>
      <div class="lv"><span>SL <b class="down">${f0(stop)}</b> ${pc(stop / px - 1, 0)}</span><span>Score <b>${p.score}</b></span><span>TP <b class="up">${f0(p.target)}</b> ${pc(p.target / px - 1, 0)}</span></div>
    </div>`;
  }
  function moverList(title, arr, val) {
    return `<div class="mlist"><h4>${title}</h4>${arr.map(p => `<div class="mrow" data-open="${esc(p.ticker)}">${avatar(p.ticker)}<div class="mid"><b>${esc(p.ticker)}</b> ${tierHtml(p)}<div>${esc(p.name)}</div></div><div class="r"><b>${f0(pxOf(p))}</b><div>${val(p)}</div></div></div>`).join('') || '<div class="empty">None today.</div>'}</div>`;
  }
  function renderHome() {
    const el = $('#tab-home'), m = DATA.meta, k = DATA.market || {}, f = k.filter || {}, P = DATA.picks;
    const conv = P.filter(p => p.tier === 'ACT').sort((a, b) => b.score - a.score);
    const wait = P.filter(p => p.tier === 'WAIT').sort((a, b) => b.score - a.score);
    const liq = P.filter(p => !p.thin && !p.suspended && chOf(p) != null);
    const up = liq.slice().sort((a, b) => chOf(b) - chOf(a)).slice(0, 6), dn = liq.slice().sort((a, b) => chOf(a) - chOf(b)).slice(0, 6);
    const act = liq.slice().sort((a, b) => b.valueB - a.valueB).slice(0, 6);
    const adv = liq.filter(p => chOf(p) > 0).length, dec = liq.filter(p => chOf(p) < 0).length;
    const ihsg = k.idxLive ? k.idxLive.price : k.idxClose, ich = k.idxLive ? k.idxLive.chg : null;
    const cs = DATA.callStats && DATA.callStats.all;
    const gap = f.sma200 ? Math.max(0, Math.min(1, f.ihsg / f.sma200)) : null;
    el.innerHTML = `
      <div class="ph-head"><div><h1>Market today</h1><p>${esc(m.session && m.session.state === 'open' ? 'IDX is open: prices are live, scores use the last close.' : 'IDX is closed: everything below is from the ' + (m.asOf || 'latest') + ' close.')}</p></div></div>
      <div class="hero">
        <div class="hcard"><h3>IHSG</h3>
          <div class="ihsg-row"><span class="ihsg-big">${f0(ihsg)}</span>${ich != null ? chgPill(ich) : `<span class="muted">20 days ${pc(k.idxChg20d, 1)}</span>`}</div>
          <div class="regime">
            <div><small>vs 200-day average</small><b class="${f.ok ? 'up' : 'down'}">${f.sma200 ? pc(f.ihsg / f.sma200 - 1, 1) : '–'}</b></div>
            <div><small>RSI (14)</small><b>${k.idxRsi == null ? '–' : k.idxRsi.toFixed(0)}</b></div>
            <div><small>Breadth (liquid)</small><b><span class="up">${adv}▲</span> <span class="down">${dec}▼</span></b></div>
            <div><small>Regime</small><b>${esc(k.regime || '–')}</b></div>
          </div>
          ${gap != null ? `<div class="gauge" role="img" aria-label="IHSG at ${Math.round(gap * 100)}% of its 200-day average"><i style="width:${(gap * 100).toFixed(1)}%"></i><span>IHSG ${f0(f.ihsg)}</span><em>200-day ${f0(f.sma200)}</em></div>
          <div class="muted">${f.ok ? 'Uptrend: bounce trades have historically done best here.' : `Downtrend: the IHSG needs ${pc(f.sma200 / f.ihsg - 1, 1).replace(/<[^>]+>/g, '')} to get back above its 200-day average. Shown as context, it no longer blocks ACT; bounce trades lost more in downtrends, so size small.`}</div>` : ''}
        </div>
        <div class="hcard"><h3>The screener today</h3>
          <div class="regime" style="margin-top:4px">
            <div><small>Convinced ACT</small><b class="${conv.length ? 'up' : ''}" style="font-size:26px">${conv.length}</b></div>
            <div><small>Waiting for a bounce</small><b style="font-size:26px">${wait.length}</b></div>
            <div><small>Oversold (score ≥ ${m.actScore})</small><b style="font-size:26px">${P.filter(p => p.action === 'ACT').length}</b></div>
          </div>
          ${cs ? `<div class="regime"><div><small>Replayed calls, win rate</small><b>${Math.round(cs.winRate * 100)}%</b></div><div><small>Payoff</small><b class="${cs.payoff < 1 ? 'down' : 'up'}">${cs.payoff.toFixed(2)}</b></div><div><small>Avg per trade</small><b>${pc(cs.expectancy, 2)}</b></div>${cs.daysTp != null ? `<div><small>TP / SL after</small><b>${cs.daysTp.toFixed(1)} / ${cs.daysSl.toFixed(1)} days</b></div>` : ''}</div>` : ''}
          <p class="muted" style="margin:12px 0 0">Paper only: over 10 years the bounce rule did no better than random noise. ${DATA.spec ? `Speculation season <b class="${DATA.spec.on ? 'up' : ''}">${DATA.spec.on ? 'ON' : 'off'}</b>${DATA.spec.today.length ? ` (${DATA.spec.today.map(esc).join(', ')})` : ''}.` : ''}</p>
        </div>
      </div>
      ${DATA.lab && DATA.lab.capitulation && DATA.lab.capitulation.today ? `<div class="card pad" style="margin-bottom:8px"><b>Capitulation day.</b> On ${esc(DATA.lab.capitulation.today.prev)} ${Math.round(DATA.lab.capitulation.today.breadth * 100)}% of liquid stocks were oversold at once. In past tests, bounces after such days did better (+1.0% to +1.6% a trade out of sample) but it rests on a few dozen market days and failed before 2022: being forward-tested, not a confirmation.</div>` : ''}<div class="sec-head"><h2>Convinced ACT today</h2><button class="linkbtn" data-goto="CONV">Open in screener →</button></div>
      ${conv.length ? `<div class="conv">${conv.map(convCardHtml).join('')}</div>` : `<div class="card empty">No convinced ACT setup today. ${wait.length ? `${wait.length} oversold stock${wait.length === 1 ? ' is' : 's are'} waiting for a bounce candle: ${wait.slice(0, 6).map(p => `<a href="#" data-open="${esc(p.ticker)}">${esc(p.ticker)}</a>`).join(', ')}.` : ''}</div>`}
      ${wait.length && conv.length ? `<div class="sec-head"><h2>Next in line: oversold, waiting for a bounce candle</h2><button class="linkbtn" data-goto="OVS">All oversold →</button></div><div class="conv">${wait.slice(0, 4).map(convCardHtml).join('')}</div>` : ''}
      ${(() => { const M = DATA.momentum, H = M && M.holdings || [], P = M && M.pit && M.pit.top100; if (!H.length) return '';
        const by = Object.fromEntries(DATA.picks.map(p => [p.ticker, p]));
        return `<div class="sec-head"><h2>Momentum 10: the one rule that passed a no-hindsight test</h2><button class="linkbtn" data-tabgo="mom">Momentum tab →</button></div>
        <div class="note" style="border-left-color:var(--up)">The 10 strongest stocks of the past year, held to the month-end rebalance${P ? `: ${pc(P.MOM10.cagr, 1)} a year against ${pc(P.EW.cagr, 1)} for holding every liquid stock, with each month's universe rebuilt from what was known then` : ''}. Small edge, big swings (worst drawdown about −57%), so size it as one part of the account. The bounce ACT above failed the same kind of test (Track record, Reality check).</div>
        <div class="movers">${[H.slice(0, 4), H.slice(4, 7), H.slice(7, 10)].map((g, i) => `<div class="mlist"><h4>${['#1-4', '#5-7', '#8-10'][i]}</h4>${g.map(h => `<div class="mrow" data-open="${esc(h.t)}">${avatar(h.t)}<div class="mid"><b>${esc(h.t)}</b> <span class="muted">#${h.rank}</span><div>${esc(h.name)}</div></div><div class="r"><b>${f0(by[h.t] ? pxOf(by[h.t]) : h.now)}</b><div>${pc(h.ret, 1)} <span class="muted">since entry</span></div></div></div>`).join('')}</div>`).join('')}</div>`; })()}
      <div class="sec-head"><h2>Market map</h2><div class="seg" role="group" aria-label="Change over">${[['1d', 'Today'], ['5d', '5 days'], ['20d', '20 days']].map(([v, l]) => `<button data-map="${v}" aria-pressed="${MAPBY === v}">${l}</button>`).join('')}</div></div>
      <div class="tmapbox" id="tmap"></div>
      <div class="tm-legend"><span>Box size = traded value (√Rp/day), grouped by sector · colour = change</span><i style="background:${heatCol(-0.05)}"></i><i style="background:${heatCol(-0.01)}"></i><i style="background:var(--card2)"></i><i style="background:${heatCol(0.01)}"></i><i style="background:${heatCol(0.05)}"></i><span>tap a box to open the stock</span></div>
      ${(() => { const B = DATA.picks.flatMap(p => bigOf(p).map(x => ({ ...x, p }))).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 8);
        return B.length ? `<div class="sec-head"><h2>Big filings</h2><span class="muted">last 45 days, read from IDX · tap for the Catalyst tab</span></div>
        <div class="card"><ul class="hl-list" style="padding:6px 12px">${B.map(x => `<li class="mrow" data-cat="${esc(x.t)}" style="cursor:pointer">${avatar(x.t)}<div class="mid"><b>${esc(x.t)}</b> <span class="${(DIRS[x.dir] || DIRS['?'])[1]}" style="font-size:12px">${(DIRS[x.dir] || DIRS['?'])[0]}</span> <span class="muted">${esc(x.d.slice(0, 10))}</span><div>${esc(x.head)}</div></div></li>`).join('')}</ul></div>` : ''; })()}
      <div class="sec-head"><h2>Movers</h2><span class="muted">liquid stocks (≥ Rp 5 B a day), ${k.idxLive ? 'live' : 'last close'}</span></div>
      <div class="movers">${moverList('Top gainers', up, p => pc(chOf(p), 2))}${moverList('Top losers', dn, p => pc(chOf(p), 2))}${moverList('Most traded', act, p => `<span class="muted">Rp ${f0(p.valueB)} B</span>`)}</div>
      ${marketBanner()}${specBanner()}`;
    const draw = () => { const b = $('#tmap', el); if (b && b.offsetParent) { b.innerHTML = treemapHtml(b); bindOpen(b); } };
    draw();
    if (!renderHome.ro && window.ResizeObserver) { let w = 0; renderHome.ro = new ResizeObserver(es => { const nw = Math.round(es[0].contentRect.width); if (nw && (nw !== w || !$('#tmap .tm-sec'))) { w = nw; const b = $('#tmap'); if (b) { b.innerHTML = treemapHtml(b); bindOpen(b); } } }); }
    if (renderHome.ro) { renderHome.ro.disconnect(); const b = $('#tmap', el); if (b) renderHome.ro.observe(b); }
    el.querySelectorAll('[data-map]').forEach(b => b.onclick = () => { MAPBY = b.dataset.map; LS.set('mapBy', MAPBY); el.querySelectorAll('[data-map]').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
    el.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { FILTER = b.dataset.goto; LS.set('pfilter', FILTER); go('picks'); });
    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { SUB = 'cat'; openStock(b.dataset.cat); });
    el.querySelectorAll('[data-tabgo]').forEach(b => b.onclick = () => go(b.dataset.tabgo));
    bindOpen(el);
  }
  const bindOpen = el => el && el.querySelectorAll('[data-open]').forEach(n => n.onclick = e => { e.preventDefault(); openStock(n.dataset.open); });

  // ---------- Screener list (watchlist rows, like a broker app) ----------
  const FILTERS = [
    ['CONV', 'Convinced ACT', p => p.tier === 'ACT'],
    ['OVS', 'Oversold', p => p.action === 'ACT'],
    ['STAR', '★ Watchlist', p => WL.has(p.ticker)],
    ['SIG', 'Watch signals', p => baseOn(p) || !!p.spec || whoOn(p) || vOn(p)],
    ['MOM', 'Momentum 10', p => !!momOf(p.ticker)],
    ['BIG', 'Big filing', p => bigOf(p).length > 0],
    ['ALL', 'All', () => true],
  ];
  // Per-stock replayed ACT record (build-snapshot p.calls). Win rate and average only rank stocks with 3+ closed calls:
  // below that one lucky trade would top the list.
  // Win-rate ranking uses the lower end of the 90% Wilson interval, so 9 wins in 10 ranks above 3 in 3.
  const CMIN = 3, cOk = p => p.calls && p.calls.closed >= CMIN;
  const wLo = c => { const n = c.closed, ph = c.win, z = 1.645; return (ph + z * z / (2 * n) - z * Math.sqrt((ph * (1 - ph) + z * z / (4 * n)) / n)) / (1 + z * z / n); };
  const SORTS = { score: ['Score', (a, b) => b.score - a.score],
    calls: ['Most ACT calls', (a, b) => ((b.calls && b.calls.n) || 0) - ((a.calls && a.calls.n) || 0) || b.valueB - a.valueB],
    win: [`Best ACT win rate (sample-adjusted)`, (a, b) => (cOk(b) ? wLo(b.calls) : -1) - (cOk(a) ? wLo(a.calls) : -1) || ((b.calls && b.calls.closed) || 0) - ((a.calls && a.calls.closed) || 0)],
    avg: [`Best avg per ACT call (${CMIN}+ closed)`, (a, b) => (cOk(b) ? b.calls.avg : -9) - (cOk(a) ? a.calls.avg : -9)], chg: ['Change today', (a, b) => (chOf(b) ?? -9) - (chOf(a) ?? -9)], chg20: ['20-day change', (a, b) => (a.chg20d ?? 9) - (b.chg20d ?? 9)], value: ['Traded value', (a, b) => b.valueB - a.valueB], tk: ['Ticker A–Z', (a, b) => a.ticker.localeCompare(b.ticker)] };
  function pickList() {
    const F = (FILTERS.find(f => f[0] === FILTER) || FILTERS[0])[2], words = PQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
    // Every word must match the ticker, name, sector or group ("barito energy" finds the Barito group's energy names).
    const hay = p => [p.ticker, p.name, p.sector, p.group ? p.group.name : ''].join(' ').toLowerCase();
    return DATA.picks.filter(F).filter(p => !PGRP || (p.group && p.group.name === PGRP)).filter(p => !PSEC || p.sector === PSEC)
      .filter(p => !words.length || words.every(w => hay(p).includes(w))).sort((SORTS[SORT] || SORTS.score)[1]);
  }
  function sigDots(p) {
    const d = [];
    if (momOf(p.ticker)) d.push(['var(--up)', 'Momentum 10']);
    if (whoOn(p)) d.push(['var(--accent)', 'Foreign buying (foreign-driven stock)']);
    if (vOn(p)) d.push(['#a78bfa', 'Foreign-backed volume spike']);
    if (baseOn(p)) d.push(['var(--warn)', p.base.brk ? 'Breakout from base' : 'Coiling in a base']);
    if (p.spec) d.push(['var(--down)', 'Speculative breakout']);
    return d.length ? `<span class="dots" title="${esc(d.map(x => x[1]).join(' · '))}">${d.map(x => `<i style="background:${x[0]}"></i>`).join('')}</span>` : '';
  }
  const callTag = p => { const c = p.calls; if (!c) return ''; if (!c.n) return '<span class="tag">no ACT call in ~2 years</span> ';
    return `<span class="tag" title="Replayed ACT calls in the chart window (about 2 years), with today's rules">${c.n} call${c.n === 1 ? '' : 's'}${c.closed ? ` · ${Math.round(c.win * 100)}% won · avg ${c.avg > 0 ? '+' : ''}${(c.avg * 100).toFixed(1)}%` : ''}${c.closed < CMIN ? ' · too few to rank' : ''}</span> `; };
  function rowHtml(p) {
    const a = sparkPts(p);
    return `<div class="prow ${OPEN === p.ticker ? 'open' : ''}" data-t="${esc(p.ticker)}" role="button" tabindex="0">
      <div class="id">${avatar(p.ticker)}<div>
        <div class="t1"><b class="tk">${esc(p.ticker)}</b>${tierHtml(p)}${p.score >= 40 ? `<span class="scr" title="Oversold score ${p.score} (ACT at ${DATA.meta.actScore})"><i style="--v:${p.score}%"></i>${p.score}</span>` : ''}${sigDots(p)}</div>
        <div class="t2">${esc(p.name)}</div></div></div>
      <div class="sp">${sparkSvg(a, 64, 26)}</div>
      <div class="px"><b>${f0(pxOf(p))}</b>${chgPill(chOf(p))}</div>
      <div class="t3">${['calls', 'win', 'avg'].includes(SORT) ? callTag(p) : ''}${thesisShort(p)}</div>
    </div>`;
  }
  function renderPicks() {
    const el = $('#tab-picks'), P = DATA.picks, list = pickList(), shown = list.slice(0, PLIMIT);
    const cnt = f => P.filter(f[2]).length;
    el.innerHTML = `<div class="picks-split"><div class="plist">
      <div class="pl-tools">
        <div class="chips" role="group" aria-label="Filter">${FILTERS.map(f => `<button class="chip" data-f="${f[0]}" aria-pressed="${FILTER === f[0]}">${esc(f[1])} <span class="muted">${cnt(f)}</span></button>`).join('')}</div>
        <input type="search" id="pq" placeholder="Ticker, name, sector or group" value="${esc(PQ)}">
        <select id="pgrp" aria-label="Conglomerate group"><option value="">All groups</option>${[...new Set(P.filter(p => p.group).map(p => p.group.name))].sort().map(g => `<option ${PGRP === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
        <select id="psec" aria-label="Sector"><option value="">All sectors</option>${[...new Set(P.map(p => p.sector))].sort().map(g => `<option ${PSEC === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
        <select id="psort" aria-label="Sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${SORT === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
      </div>
      ${PGRP || PSEC || PQ ? `<div class="pl-sum">${list.length} stock${list.length === 1 ? '' : 's'} in <b>${esc((FILTERS.find(f => f[0] === FILTER) || FILTERS[0])[1])}</b>${PGRP ? ` · group ${esc(PGRP)}` : ''}${PSEC ? ` · ${esc(PSEC)}` : ''}${PQ ? ` · "${esc(PQ)}"` : ''} <button class="chip" id="pclear">Clear</button>${FILTER !== 'ALL' && !list.length ? ' Try the <b>All</b> chip.' : ''}</div>` : ''}
      ${FILTER === 'CONV' ? `<div class="pl-sum">Oversold + bounce candle confirmed. Buy next open, +${DATA.meta.params.targetPct}% target, wide stop, ${DATA.meta.params.horizon} sessions. Paper only.</div>` : FILTER === 'SIG' ? `<div class="pl-sum">Watch-only signals, none passed its test: <span><i class="dot" style="background:var(--accent)"></i> foreign buying</span> · base / breakout · volume spike · speculative</div>` : ''}
      <div class="pl-head"><span>Stock</span><span>Trend</span><span>Price</span></div>
      <div class="pl-rows">${shown.length ? shown.map(rowHtml).join('') : `<div class="empty">${FILTER === 'STAR' ? 'Your watchlist is empty. Tap ☆ on any stock page to add it.' : FILTER === 'CONV' ? 'No convinced ACT setup today. "none today" is a valid answer: try Oversold.' : 'Nothing matches.'}</div>`}</div>
      ${list.length > shown.length ? `<div class="pl-more"><button class="chip" id="plmore">Show ${Math.min(100, list.length - shown.length)} more of ${list.length - shown.length}</button></div>` : ''}
    </div></div>`;
    el.querySelectorAll('.prow').forEach(n => { n.onclick = e => { if (e.target.closest('a, .gtag')) return; openStock(n.dataset.t, { fromList: true }); }; n.onkeydown = e => { if (e.key === 'Enter') openStock(n.dataset.t, { fromList: true }); }; });
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { FILTER = b.dataset.f; LS.set('pfilter', FILTER); PLIMIT = 80; renderPicks(); });
    const pm = $('#plmore', el); if (pm) pm.onclick = () => { PLIMIT += 100; renderPicks(); };
    $('#psort', el).onchange = e => { SORT = e.target.value; LS.set('psort', SORT); renderPicks(); };
    $('#pgrp', el).onchange = e => { PGRP = e.target.value; LS.set('pgrp', PGRP); PLIMIT = 80; renderPicks(); };
    $('#psec', el).onchange = e => { PSEC = e.target.value; LS.set('psec', PSEC); PLIMIT = 80; renderPicks(); };
    const pc0 = $('#pclear', el); if (pc0) pc0.onclick = () => { PGRP = PSEC = PQ = ''; LS.set('pgrp', ''); LS.set('psec', ''); renderPicks(); };
    const pq = $('#pq', el); pq.oninput = e => { PQ = e.target.value; const pos = e.target.selectionStart; renderPicks(); const i = $('#pq'); i.focus(); i.setSelectionRange(pos, pos); };
    // Wide screen: the stock page docks beside the list, so there is always one open.
    if (TAB === 'picks' && WIDE.matches && (!OPEN || !DATA.picks.some(p => p.ticker === OPEN)) && list.length) openStock(list[0].ticker, { fromList: true, quiet: true });
    syncDock();
  }

  // ---------- the stock page (its own screen; docked beside the list on wide screens) ----------
  const docked = () => TAB === 'picks' && WIDE.matches;
  function syncDock() {
    document.body.classList.toggle('dock', !!OPEN && docked());
    const s = $('#scrim'); if (s) s.hidden = !OPEN || docked() || MQ.matches;
    document.documentElement.classList.toggle('noscroll', !!OPEN && MQ.matches);
  }
  function openStock(t, o = {}) {
    if (!DATA || !DATA.picks.some(p => p.ticker === t)) return;
    const was = OPEN; OPEN = t;
    const st = $('#stock'); st.hidden = false;
    if (!docked() && !(history.state && history.state.stock)) history.pushState({ stock: t }, '');
    else if (!docked() && history.state && history.state.stock !== t) history.replaceState({ stock: t }, '');
    renderStock();
    if (was !== t) st.scrollTop = 0;
    document.querySelectorAll('.prow').forEach(r => r.classList.toggle('open', r.dataset.t === t));
    syncDock();
    if (!o.quiet && docked()) { const r = document.querySelector(`.prow[data-t="${t}"]`); if (r) r.scrollIntoView({ block: 'nearest' }); }
  }
  function hideStock() {
    OPEN = null; dropChart();
    const st = $('#stock'); st.hidden = true; st.innerHTML = '';
    document.querySelectorAll('.prow.open').forEach(r => r.classList.remove('open'));
    syncDock();
  }
  function closeStock(silent) { if (!silent && history.state && history.state.stock) history.back(); else hideStock(); }
  window.addEventListener('popstate', () => { if (OPEN && !docked() && !(history.state && history.state.stock)) hideStock(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && OPEN && !docked() && !$('#palette').open) closeStock();
    if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); openPalette(); }
    if (TAB === 'picks' && docked() && OPEN && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) {
      const L = pickList(), i = L.findIndex(p => p.ticker === OPEN), n = L[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (n) { e.preventDefault(); openStock(n.ticker); }
    }
  });
  $('#scrim').onclick = () => closeStock();

  const SUBS = [['thesis', 'Thesis'], ['calls', 'Calls'], ['flow', 'Bandarmology'], ['cat', 'Catalyst'], ['fund', 'Key stats'], ['news', 'News']];
  function renderStock() {
    const p = DATA.picks.find(x => x.ticker === OPEN), st = $('#stock');
    if (!p) { hideStock(); return; }
    const px = pxOf(p), ch = chOf(p), d = ch == null ? null : px - px / (1 + ch), M = thesisModel(p, OHLCR.get(p.ticker));
    const pos = p.hi52 > p.lo52 ? (px - p.lo52) / (p.hi52 - p.lo52) : null, keep = st.scrollTop;
    const nNews = (p.headlines || []).length + (p.filings || []).length;
    st.innerHTML = `<div class="sp-head">
        <button class="back" id="spBack" aria-label="${docked() ? 'Close' : 'Back'}">${docked() ? '×' : '‹'}</button>${avatar(p.ticker)}
        <div class="ttl"><b>${esc(p.ticker)}</b> ${tierHtml(p)}<div>${esc(p.name)} · ${esc(p.sector)}</div></div>
        <div class="mini"><b>${f0(px)}</b>${pc(ch, 2)}</div>${starHtml(p.ticker)}
      </div>
      <div class="sp-in">
        <div class="sp-quote">
          <div><div><span class="big">${f0(px)}</span></div>
            <div class="chg ${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}">${d == null ? '' : (d > 0 ? '+' : '') + f0(d)} (${ch == null ? '–' : (ch > 0 ? '+' : '') + (ch * 100).toFixed(2) + '%'})</div>
            <div class="sub">${p.live ? 'Live' + (p.live.high ? ` · H ${f0(p.live.high)} L ${f0(p.live.low)}` : '') : 'Close ' + esc(DATA.meta.asOf)} · Rp ${f0(p.valueB)} B a day</div>
            <div class="sp-badges">${groupTag(p)} ${whoChip(p)} ${baseChip(p)} ${specChip(p)} ${vChip(p)}${momOf(p.ticker) ? `<span class="tag" style="background:var(--upbg);color:var(--up)">Momentum 10 · #${momOf(p.ticker).rank}</span>` : ''}</div></div>
          <div class="verdict-pill"><span class="vp ${M.tone}"><span class="ring" style="--p:${p.score}"><span>${p.score}</span></span>${esc(M.stance)}</span><span class="muted">Oversold score ${p.score} · ACT at ${DATA.meta.actScore}</span></div>
        </div>
        <div class="kstats">
          <div><small>RSI 14</small><b>${p.rsi == null ? '–' : p.rsi.toFixed(0)}</b></div>
          <div><small>5 days</small><b>${pc(p.chg5d, 1)}</b></div>
          <div><small>20 days</small><b>${pc(p.chg20d, 1)}</b></div>
          <div><small>vs MA20</small><b>${p.dist20Atr.toFixed(1)} ATR</b></div>
          <div><small>Daily range</small><b>${(p.atrPct * 100).toFixed(1)}%</b></div>
          <div><small>52-week</small><b>${f0(p.lo52)}–${f0(p.hi52)}</b>${pos != null ? `<div class="range52" title="Price at ${Math.round(pos * 100)}% of its 52-week range"><i style="--x:${(pos * 100).toFixed(1)}%"></i></div>` : ''}</div>
        </div>
        <div id="s-chart">${chartBoxHtml(p)}</div>
        <nav class="sp-tabs" role="tablist">${SUBS.map(([k, l]) => `<button role="tab" data-sub="${k}" aria-selected="${SUB === k}">${l}${k === 'news' && nNews ? `<span class="n">${nNews}</span>` : ''}</button>`).join('')}</nav>
        <div class="sp-body" id="spBody"></div>
      </div>`;
    $('#spBack').onclick = () => closeStock();
    bindStars(st);
    st.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { SUB = b.dataset.sub; st.querySelectorAll('[data-sub]').forEach(x => x.setAttribute('aria-selected', x === b)); renderSub(p); const tb = $('.sp-tabs', st); if (tb.getBoundingClientRect().top < 60) tb.scrollIntoView({ block: 'start' }); });
    st.querySelectorAll('.gtag').forEach(b => b.onclick = e => { e.stopPropagation(); go('groups'); });
    st.onscroll = () => st.classList.toggle('scrolled', st.scrollTop > 90);
    renderSub(p);
    mountChart(st, p);
    st.scrollTop = keep; // a data refresh keeps your place; openStock() resets it for a new stock
  }
  function renderSub(p) {
    const b = $('#spBody'); if (!b) return;
    const j = OHLCR.get(p.ticker) || null;
    b.dataset.j = j ? '1' : '0';
    b.innerHTML = SUB === 'thesis' ? thesisHtml(p, j) : SUB === 'calls' ? callsHtml(p, j) : SUB === 'flow' ? flowSubHtml(p, j) : SUB === 'cat' ? catalystHtml(p) : SUB === 'fund' ? fundSubHtml(p) : newsSubHtml(p);
    bindSizer(b); bindOpen(b);
    b.querySelectorAll('[data-vopt]').forEach(x => x.onchange = () => { const v = x.value.trim(); VOPT[x.dataset.vopt] = v === '' ? (x.dataset.vopt === 'g1' ? null : VDEF[x.dataset.vopt]) : +v / 100; LS.set('valopt', JSON.stringify(VOPT)); const y = b.scrollTop; renderSub(p); b.scrollTop = y; });
    const vr = b.querySelector('[data-vreset]'); if (vr) vr.onclick = () => { VOPT = { ...VDEF }; LS.set('valopt', '{}'); renderSub(p); };
    const cp = b.querySelector('[data-copy-prompt]');
    if (cp) cp.onclick = async () => { const t = catalystPrompt(p); try { await navigator.clipboard.writeText(t); cp.textContent = 'Copied: paste it into Claude'; } catch { const ta = b.querySelector('#catPrompt'); ta.hidden = false; ta.select(); cp.textContent = 'Select all and copy the text below'; } };
    b.querySelectorAll('[data-news]').forEach(x => x.onclick = () => { NEWSPERIOD = '30d'; NEWSQ = x.dataset.news; NEWSCAT = 'ALL'; NEWSLIMIT = 120; renderNews(); go('news'); });
    b.querySelectorAll('[data-sub-go]').forEach(x => x.onclick = () => { SUB = x.dataset.subGo; renderStock(); });
  }
  // Re-render the open sub-tab once the candle file arrives (it carries the stock's own call history).
  function refreshSub(p) {
    const b = $('#spBody'); if (b && b.dataset.j === '0' && OPEN === p.ticker) renderSub(p);
    document.querySelectorAll(`.prow[data-t="${p.ticker}"] .t3`).forEach(n => { n.innerHTML = thesisShort(p); });
  }

  // ---------- command palette: jump to any stock ----------
  let PALSEL = 0;
  function openPalette() {
    if (!DATA) return;
    const dl = $('#palette'), q = $('#palQ');
    q.value = ''; PALSEL = 0; palRender(); dl.showModal(); q.focus();
  }
  function palRender() {
    const q = $('#palQ').value.trim().toLowerCase(), P = DATA.picks;
    let res;
    const byCalls = P.filter(p => p.calls && p.calls.n).sort(SORTS.calls[1]).slice(0, 6), byWin = P.filter(cOk).sort(SORTS.win[1]).slice(0, 6);
    if (!q) res = [['Watchlist', P.filter(p => WL.has(p.ticker))], ['Convinced ACT today', P.filter(p => p.tier === 'ACT')], ['Most ACT calls (about 2 years, replayed)', byCalls], [`Best ACT win rate (${CMIN}+ closed calls)`, byWin], ['Most traded', P.slice().sort((a, b) => b.valueB - a.valueB).slice(0, 8)]].filter(x => x[1].length);
    else {
      const sc = p => (p.ticker.toLowerCase() === q ? 0 : p.ticker.toLowerCase().startsWith(q) ? 1 : p.name.toLowerCase().startsWith(q) ? 2 : p.ticker.toLowerCase().includes(q) ? 3 : p.name.toLowerCase().includes(q) ? 4 : 9);
      res = [['Stocks', P.map(p => [sc(p), p]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0] || b[1].valueB - a[1].valueB).slice(0, 30).map(x => x[1])]];
      // A group or sector name lists all its members, most ACT calls first; "act" / "calls" / "win" list the records.
      const grp = [...new Set(P.filter(p => p.group && p.group.name.toLowerCase().includes(q)).map(p => p.group.name))];
      grp.forEach(g => res.push([`Group: ${g}`, P.filter(p => p.group && p.group.name === g).sort(SORTS.calls[1])]));
      const sec = [...new Set(P.filter(p => p.sector.toLowerCase().includes(q)).map(p => p.sector))];
      sec.forEach(g => res.push([`Sector: ${g}`, P.filter(p => p.sector === g).sort(SORTS.calls[1]).slice(0, 20)]));
      if (/^(act|call|most)/.test(q)) res.push(['Most ACT calls (about 2 years, replayed)', P.filter(p => p.calls && p.calls.n).sort(SORTS.calls[1]).slice(0, 20)]);
      if (/^(win|best)/.test(q)) res.push([`Best ACT win rate (${CMIN}+ closed calls)`, P.filter(cOk).sort(SORTS.win[1]).slice(0, 20)]);
      res = res.filter(x => x[1].length);
    }
    const flat = res.flatMap(r => r[1]); PALSEL = Math.max(0, Math.min(PALSEL, flat.length - 1));
    let i = 0;
    $('#palList').innerHTML = flat.length ? res.map(([h, a]) => `<div class="pal-sec">${esc(h)}</div>${a.map(p => `<div class="pal-it ${i++ === PALSEL ? 'sel' : ''}" data-t="${esc(p.ticker)}" role="option">${avatar(p.ticker)}<div class="mid"><b>${esc(p.ticker)}</b> ${tierHtml(p)}<div>${esc(p.name)} · ${esc(p.sector)}${p.group ? ' · ' + esc(p.group.name) : ''}${p.calls && p.calls.n ? ` · ${p.calls.n} ACT call${p.calls.n === 1 ? '' : 's'}${p.calls.closed >= CMIN ? `, ${Math.round(p.calls.win * 100)}% won` : ''}` : ''}</div></div><div class="r"><b>${f0(pxOf(p))}</b><div>${pc(chOf(p), 2)}</div></div></div>`).join('')}`).join('') : '<div class="empty">No stock matches.</div>';
    $('#palList').querySelectorAll('.pal-it').forEach(n => n.onclick = () => { $('#palette').close(); openStock(n.dataset.t); });
    return flat;
  }
  $('#palQ').oninput = () => { PALSEL = 0; palRender(); };
  $('#palQ').onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); PALSEL += e.key === 'ArrowDown' ? 1 : -1; palRender(); const s = $('#palList .sel'); if (s) s.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') { const s = $('#palList .sel'); if (s) { $('#palette').close(); openStock(s.dataset.t); } }
  };
  $('#palette').onclick = e => { if (e.target === $('#palette')) $('#palette').close(); };
  $('#searchBtn').onclick = openPalette;


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

  // ---------- stock chart: candles + volume, 1H / 4H / 1D / 1W like a broker app ----------
  // TradingView Lightweight Charts, loaded on first open. Candle files come from tools/ohlc.mjs (daily ~2y, hourly ~3mo;
  // 4H and weekly are merged here). Offline or before the first build, the SVG close-line stays in place.
  const LWC_URL = 'https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js';
  const TFS = [['1H', 'Hourly'], ['4H', '4-hour'], ['1D', 'Daily'], ['1W', 'Weekly']];
  const SHOW = { '1H': 56, '4H': 60, '1D': 120, '1W': 104 }; // bars in view when the chart opens
  let TF = TFS.some(t => t[0] === LS.get('chartTf')) ? LS.get('chartTf') : '1D';
  let SHOWLV = LS.get('chartLv') !== '0', SHOWEV = LS.get('chartEv') !== '0', SHOWVS = LS.get('chartVs') !== '0';
  let lwcP = null, CHART = null;
  const OHLC = new Map(), OHLCR = new Map(); // promises, and the resolved files (for the thesis and calls tabs)
  const loadLwc = () => lwcP || (lwcP = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = LWC_URL; s.crossOrigin = 'anonymous';
    s.onload = () => ok(window.LightweightCharts);
    s.onerror = () => { lwcP = null; s.remove(); no(new Error('chart library')); };
    document.head.appendChild(s);
  }));
  const loadOhlc = t => {
    if (!OHLC.has(t)) OHLC.set(t, fetch(`data/ohlc/${encodeURIComponent(t)}.json?t=${Math.floor(Date.now() / 600000)}`)
      .then(r => { if (!r.ok) throw new Error('no chart file'); return r.json(); }).then(j => { OHLCR.set(t, j); return j; })
      .catch(e => { OHLC.delete(t); throw e; }));
    return OHLC.get(t);
  };
  // Rows are [time, o, h, l, c, v], oldest first; merges consecutive rows that share a bucket key.
  const bucket = (rows, keyOf) => {
    const out = [];
    for (const r of rows) {
      const k = keyOf(r[0]), b = out[out.length - 1];
      if (b && b[0] === k) { b[2] = Math.max(b[2], r[2]); b[3] = Math.min(b[3], r[3]); b[4] = r[4]; b[5] += r[5]; } else out.push([k, r[1], r[2], r[3], r[4], r[5]]);
    }
    return out;
  };
  const weekKey = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
  const fourHKey = s => { const day = s - (s % 86400), h = Math.floor((s % 86400) / 3600); return day + (h < 13 ? 9 : 13) * 3600; }; // IDX session 1 / session 2
  const barsFor = (j, tf) => (tf === '1H' ? j.h : tf === '4H' ? bucket(j.h, fourHKey) : tf === '1W' ? bucket(j.d, weekKey) : j.d) || [];
  const sma = (bars, n) => { const out = []; let s = 0; bars.forEach((b, i) => { s += b[4]; if (i >= n) s -= bars[i - n][4]; if (i >= n - 1) out.push({ time: b[0], value: s / n }); }); return out; };
  const lots = v => { const l = v / 100; return l >= 1e9 ? (l / 1e9).toFixed(2) + 'B' : l >= 1e6 ? (l / 1e6).toFixed(2) + 'M' : l >= 1e3 ? (l / 1e3).toFixed(1) + 'K' : Math.round(l) + ''; };
  const rpShort = v => (v >= 1e12 ? (v / 1e12).toFixed(2) + ' T' : v >= 1e9 ? (v / 1e9).toFixed(1) + ' B' : v >= 1e6 ? (v / 1e6).toFixed(0) + ' M' : Math.round(v) + '');
  const levelsOf = p => [['Target', p.target, 'var(--accent)'], ['Resist', p.resistance, 'var(--down)'], ['Support', p.support, 'var(--up)'],
    ['Stop', p.action === 'ACT' && p.wideStop ? p.wideStop : p.stop, 'var(--warn)']];

  function chartBoxHtml(p) {
    return `<div class="sc">
      <div class="sc-bar"><div class="seg" role="group" aria-label="Candle interval">${TFS.map(([k, l]) => `<button data-tf="${k}" aria-pressed="${TF === k}" title="${l} candles">${k}</button>`).join('')}</div>
        <span class="sc-tg"><button class="seg-t" data-vs aria-pressed="${SHOWVS}" title="Volume spikes (4x the usual volume): type, and whether foreigners / the bandar bought or sold that day">Spikes</button><button class="seg-t" data-ev aria-pressed="${SHOWEV}" title="Past ACT calls and their take-profit / stop-loss exits">Calls</button><button class="seg-t" data-lv aria-pressed="${SHOWLV}" title="Stop, target, support and resistance lines">Levels</button></span></div>
      <div class="sc-status"></div>
      <div class="sc-leg"></div><div class="sc-note"></div>
      <div class="sc-box">${chartSvg(p)}</div>
      <details class="sc-key muted"><summary>Chart key</summary><span class="kact">▲ ACT</span> convinced call, buy next open · <span class="krad">●</span> WAIT <span class="mute">●</span> PAUSE <span class="down">●</span> SKIP / THIN oversold, not a buy yet (tap or hover a bar for why) · <span class="up">▼ TP</span> <span class="down">▲ SL</span> <span class="mute">■ Exit</span> take profit, stop loss, 15-day exit · <span class="k20">━</span> MA20 <span class="k50">━</span> MA50 · volume bars in lots (left axis); value = close × volume · times WIB · Yahoo prices, can lag · chart by <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a></details>
    </div>`;
  }

  function dropChart() { if (CHART) { CHART.remove(); CHART = null; } }

  async function mountChart(root, p) {
    dropChart();
    const sc = root && $('.sc', root);
    if (!sc) return;
    sc.querySelectorAll('[data-tf]').forEach(b => b.onclick = e => { e.stopPropagation(); TF = b.dataset.tf; LS.set('chartTf', TF); sc.querySelectorAll('[data-tf]').forEach(x => x.setAttribute('aria-pressed', x === b)); mountChart(root, p); });
    const lb = $('[data-lv]', sc);
    lb.onclick = e => { e.stopPropagation(); SHOWLV = !SHOWLV; LS.set('chartLv', SHOWLV ? '1' : '0'); lb.setAttribute('aria-pressed', SHOWLV); mountChart(root, p); };
    const eb = $('[data-ev]', sc);
    eb.onclick = e => { e.stopPropagation(); SHOWEV = !SHOWEV; LS.set('chartEv', SHOWEV ? '1' : '0'); eb.setAttribute('aria-pressed', SHOWEV); mountChart(root, p); };
    const vb = $('[data-vs]', sc);
    vb.onclick = e => { e.stopPropagation(); SHOWVS = !SHOWVS; LS.set('chartVs', SHOWVS ? '1' : '0'); vb.setAttribute('aria-pressed', SHOWVS); mountChart(root, p); };
    const leg = $('.sc-leg', sc), box = $('.sc-box', sc), noteEl = $('.sc-note', sc);
    let L, j;
    try { [L, j] = await Promise.all([loadLwc(), loadOhlc(p.ticker)]); } catch {
      leg.innerHTML = '<span class="muted">Candles unavailable (offline, or the chart file is not built yet). Showing the last 90 closes.</span>';
      if (OHLCR.has(p.ticker)) refreshSub(p);
      return;
    }
    if (!sc.isConnected || OPEN !== p.ticker) return;
    const bars = barsFor(j, TF);
    if (bars.length < 2) { leg.innerHTML = `<span class="muted">Yahoo has no ${TF === '1H' || TF === '4H' ? 'hourly' : ''} bars for ${esc(p.ticker)}. Try 1D.</span>`; return; }
    dropChart();
    box.innerHTML = ''; box.classList.add('live');
    const css = getComputedStyle(document.documentElement), v = n => css.getPropertyValue(n).trim();
    const up = v('--up'), dn = v('--down'), intraday = TF === '1H' || TF === '4H';
    const chart = CHART = L.createChart(box, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: v('--mute'), fontSize: 11, fontFamily: getComputedStyle(document.body).fontFamily },
      grid: { vertLines: { visible: false }, horzLines: { color: v('--line') } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.26 } },
      leftPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.78, bottom: 0 } },
      timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false, rightOffset: 3 },
      crosshair: { mode: 1 },
      handleScroll: { vertTouchDrag: false },
    });
    // An open (or about to open) ACT trade draws its own entry / TP / SL instead of today's plan target and stop.
    const lastCall = (j.ev || []).filter(e => e.k === 'call').pop();
    const openT = lastCall && (lastCall.res === 'open' || lastCall.res === 'pending') ? lastCall : null;
    const lvList = SHOWLV ? (openT ? levelsOf(p).filter(l => l[0] === 'Resist' || l[0] === 'Support')
      .concat([['TP', openT.tp, 'var(--up)'], ['SL', openT.stop, 'var(--down)']], openT.entry ? [['Entry', openT.entry, 'var(--ink)']] : []) : levelsOf(p)) : [];
    const lvVals = lvList.map(l => l[1]).filter(x => x != null);
    // With Levels on, the price axis stretches to keep every level line above the volume bars.
    const cs = chart.addCandlestickSeries({ upColor: up, downColor: dn, borderVisible: false, wickUpColor: up, wickDownColor: dn, priceFormat: { type: 'custom', formatter: x => Math.round(x).toLocaleString('en-US'), minMove: 1 },
      autoscaleInfoProvider: base => { const r = base(); if (!r || !lvVals.length) return r; return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, ...lvVals), maxValue: Math.max(r.priceRange.maxValue, ...lvVals) } }; } });
    cs.setData(bars.map(b => ({ time: b[0], open: b[1], high: b[2], low: b[3], close: b[4] })));
    // Volume on its own left axis, in lots (100 shares), so the bars have readable numbers.
    const vol = chart.addHistogramSeries({ priceScaleId: 'left', priceFormat: { type: 'custom', formatter: v => lots(v), minMove: 1 }, lastValueVisible: true, priceLineVisible: false });
    vol.setData(bars.map(b => ({ time: b[0], value: b[5], color: (b[4] >= b[1] ? up : dn) + '55' })));
    [[20, v('--accent')], [50, v('--warn')]].forEach(([n, c]) => {
      const m = sma(bars, n);
      if (m.length) chart.addLineSeries({ color: c, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(m);
    });
    lvList.forEach(([t, val, c]) => { if (val != null) cs.createPriceLine({ price: val, color: v(c.slice(4, -1)), lineWidth: 1, lineStyle: t === 'Entry' ? 0 : 2, axisLabelVisible: true, title: t }); });
    const notes = callMarkers(cs, bars, j, { up, dn, acc: v('--accent'), warn: v('--warn'), mute: v('--mute') });
    callStatus($('.sc-status', sc), p, j);
    refreshSub(p);
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - SHOW[TF]), to: bars.length + 2 });
    const legend = i => {
      const b = bars[i], prev = bars[i - 1];
      if (!b) return;
      const c = b[4] >= b[1] ? 'up' : 'down';
      leg.innerHTML = `<span class="muted">${esc(when(b[0]))}${TF === '1W' ? ' wk' : ''}</span> O <b class="${c}">${f0(b[1])}</b> H <b class="${c}">${f0(b[2])}</b> L <b class="${c}">${f0(b[3])}</b> C <b class="${c}">${f0(b[4])}</b> ${prev ? pc(b[4] / prev[4] - 1, 2) : ''} <span class="muted">Vol ${lots(b[5])} lots · Rp ${rpShort(b[4] * b[5])}</span>`;
      noteEl.textContent = notes.get(i) || '';
    };
    legend(bars.length - 1);
    chart.subscribeCrosshairMove(e => legend(e.logical == null ? bars.length - 1 : Math.max(0, Math.min(bars.length - 1, Math.round(e.logical)))));
  }

  const when = t => (typeof t === 'string' ? t : new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' '));
  const retTxt = r => (r > 0 ? '+' : '') + (r * 100).toFixed(1) + '%';
  const RES = { tp: 'TP hit', sl: 'SL hit', time: '15-day exit' };

  // Puts every past call on the candles (tools/signals.mjs). Calls fire after the close, so on 1H/4H they sit on the
  // day's last bar; TP/SL sit on the first bar that touched the level. Returns bar index -> explanation for the legend.
  function callMarkers(cs, bars, j, col) {
    const notes = new Map();
    if (!SHOWEV && !SHOWVS) { cs.setMarkers([]); return notes; }
    const intraday = TF === '1H' || TF === '4H', keyOf = TF === '1W' ? weekKey : d => d;
    const first = new Map(), last = new Map();
    bars.forEach((b, i) => { const k = intraday ? when(b[0]).slice(0, 10) : b[0]; if (!first.has(k)) first.set(k, i); last.set(k, i); });
    const at = (day, end, hit) => {
      const k = keyOf(day), i = (end ? last : first).get(k);
      if (i == null || !intraday || !hit) return i;
      for (let n = first.get(k); n <= last.get(k); n++) if (hit(bars[n])) return n;
      return i;
    };
    const add = (i, t) => notes.set(i, (notes.has(i) ? notes.get(i) + ' · ' : '') + t);
    const M = [];
    const SIDE = v => (v > 0 ? 'net BUY' : v < 0 ? 'net SELL' : 'flat');
    if (SHOWVS) for (const s of j.sp || []) {
      const i = at(s[0], true); if (i == null) continue;
      M.push({ i, position: 'aboveBar', color: s[3] > 0 ? col.up : s[3] < 0 ? col.dn : col.mute, shape: 'circle', size: 0.6, text: 'V' });
      add(i, `${s[0]}: volume spike ×${s[2]} (${s[1]} candle) · foreign ${SIDE(s[3])} · bandar ${SIDE(s[4])}`);
    }
    for (const e of (SHOWEV ? j.ev || [] : [])) {
      const rp = j.liveFrom && e.d >= j.liveFrom ? '' : ' (replayed)';
      const i = at(e.d, true);
      if (e.k === 'radar') {
        if (i != null) { if (!M.some(m => m.i === i && m.radar)) M.push({ i, radar: 1, position: 'belowBar', color: e.tier === 'WAIT' ? col.warn : e.tier === 'PAUSE' ? col.mute : col.dn, shape: 'circle', size: 0.7 }); add(i, `${e.d}: oversold (score ${e.s}) but ${e.tier}, not a buy yet${rp}`); }
        continue;
      }
      if (i != null) { M.push({ i, position: 'belowBar', color: col.acc, shape: 'arrowUp', text: 'ACT' }); add(i, `${e.d}: ACT call, score ${e.s}${rp}. Buy next open${e.entry ? ' (' + f0(e.entry) + ')' : ''}, stop ${f0(e.stop)}, target ${f0(e.tp)}`); }
      if (!e.x) continue;
      const xi = at(e.x, false, e.res === 'tp' ? b => b[2] >= e.tp : e.res === 'sl' ? b => b[3] <= e.stop : null);
      if (xi == null) continue;
      const tp = e.res === 'tp', sl = e.res === 'sl';
      M.push({ i: xi, position: sl ? 'belowBar' : 'aboveBar', color: tp ? col.up : sl ? col.dn : col.mute, shape: tp ? 'arrowDown' : sl ? 'arrowUp' : 'square', text: (tp ? 'TP ' : sl ? 'SL ' : 'Exit ') + retTxt(e.ret) });
      add(xi, `${e.x}: ${RES[e.res]} at ${f0(e.xp)}, ${retTxt(e.ret)} after fees${e.today ? ' (touched today, live)' : ''}${rp}`);
    }
    cs.setMarkers(M.sort((a, b) => a.i - b.i).map(({ i, radar, ...m }) => ({ time: bars[i][0], ...m })));
    return notes;
  }

  // Volume peaks for this stock: type, who was buying (NeoBDM foreign / bandar side), and what followed (10 sessions).
  function spikesHtml(j) {
    if (!j) return '<p class="muted">Loading the volume history…</p>';
    const sp = (j.sp || []).slice(-10).reverse(); if (!sp.length) return '<p class="muted">No volume spike (4× the usual volume) in the chart window.</p>';
    const di = new Map(j.d.map((r, i) => [r[0], i]));
    const after = d => { const k = di.get(d); return k == null || k + 11 >= j.d.length ? null : j.d[k + 11][1] / j.d[k + 1][1] - 1; };
    const side = v => (v > 0 ? '<span class="up">buy</span>' : v < 0 ? '<span class="down">sell</span>' : '<span class="mute">–</span>');
    return `<div class="card scroll"><table><thead><tr><th>Date</th><th>Candle</th><th class="n">Volume ×</th><th>Foreign</th><th>Bandar</th><th class="n">Next 10 sessions</th></tr></thead><tbody>${sp.map(s => `<tr><td>${esc(s[0])}</td><td>${esc(s[1])}</td><td class="n">${s[2]}</td><td>${side(s[3])}</td><td>${side(s[4])}</td><td class="n">${pc(after(s[0]))}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted">What the tests say (Signal lab): the candle shape of a spike told nothing about the next weeks, and neither did the bandar's side. Spikes where foreigners were net buyers beat those where they sold by about 2.7% over 10 sessions in 2024-26 (t 3.0), but not in 2022-24, and the gap rests on a few big winners. So it is a watch signal with a forward test, not ACT.</p>`;
  }

  // Where the stock stands against its latest call (shown under the chart).
  function callStatus(el, p, j) {
    const ev = j.ev || [], calls = ev.filter(e => e.k === 'call'), c = calls[calls.length - 1], last = ev[ev.length - 1];
    const px = pxOf(p), days = j.d.map(r => r[0]), recent = d => !!d && days.indexOf(d) >= days.length - 11;
    let h = '';
    if (c && c.res === 'pending') h = `<b>ACT call on ${esc(c.d)}:</b> buy at the next open. Stop ${f0(c.stop)}, target ${f0(c.tp)}.`;
    else if (c && c.res === 'open') {
      const toTp = c.tp / px - 1, toSl = c.stop / px - 1;
      const near = toTp <= 0.02 ? ' <span class="flag up">near TP</span>' : toSl >= -0.02 ? ' <span class="flag down">near SL</span>' : '';
      h = `<b>Open ACT trade</b> from ${esc(c.d)}: entry ${f0(c.entry)}, now ${pc(px / c.entry - 1)}${near}. TP ${f0(c.tp)} (${retTxt(toTp)} away) · SL ${f0(c.stop)} (${retTxt(toSl)} away) · day ${c.age} of ${DATA.meta.params.horizon}.`;
    } else if (c && recent(c.x)) {
      const n = c.n ?? heldDays(j, c);
      h = `<span class="flag ${c.res === 'tp' ? 'up' : c.res === 'sl' ? 'down' : ''}">${RES[c.res]}</span> on ${esc(c.x)}${n ? `, ${n === 1 ? 'the same day it was bought' : n - 1 + ' session' + (n === 2 ? '' : 's') + ' after buying'}` : ''}, at ${f0(c.xp)}: ${retTxt(c.ret)} after fees${c.today ? ' (touched today, live: not final)' : ''}. Called ${esc(c.d)}, entry ${f0(c.entry)}.`;
    } else if (last && last.k === 'radar' && recent(last.d) && p.score >= DATA.meta.actScore) {
      h = `<b>Oversold since ${esc(last.d)}</b> (badge ${esc(p.tier || last.tier)}): not a buy yet.`;
    }
    el.innerHTML = h ? `<div class="callbox">${h}</div>` : '';
  }
  // Trading session the trade closed on, counting the buy session as day 1 (tools/signals.mjs "n"; older builds lack it).
  function heldDays(j, e) {
    if (e.n != null) return e.n;
    if (!e.x || !j) return null;
    const days = j.d.map(r => r[0]), a = days.indexOf(e.d), b = days.indexOf(e.x);
    return a < 0 || b < 0 ? null : b - a;
  }
  const daysCell = (n, res, H = DATA.meta.params.horizon) => (n == null ? '<span class="mute">–</span>'
    : `<span class="days"><b>${n}</b><span class="muted">${n === 1 ? 'day' : 'days'}</span><span class="dbar" title="Day ${n} of ${H}"><i style="width:${Math.min(100, n / H * 100).toFixed(0)}%;background:${res === 'tp' ? 'var(--up)' : res === 'sl' ? 'var(--down)' : res === 'open' ? 'var(--accent)' : 'var(--mute)'}"></i></span></span>`);
  const openCell = (age, H) => `<span class="days"><b>${age}</b><span class="muted">of ${H}</span><span class="dbar"><i style="width:${Math.min(100, age / H * 100).toFixed(0)}%;background:var(--accent)"></i></span></span>`;
  const resPill = (res, n) => (res === 'tp' ? `<span class="res tp">▲ TP hit</span>` : res === 'sl' ? `<span class="res sl">▼ SL hit</span>` : res === 'time' ? `<span class="res time">■ ${DATA.meta.params.horizon}-day exit</span>` : res === 'open' ? `<span class="res open">● Open</span>` : `<span class="res pending">◷ Buy next open</span>`);
  // Calls tab: every ACT call on this stock in the chart window, with how long each took to resolve.
  function callsHtml(p, j) {
    if (!j) return '<div class="empty">Loading this stock&#39;s call history…</div>';
    const ev = j.ev || [], calls = ev.filter(e => e.k === 'call').map(e => ({ ...e, n: heldDays(j, e) })), closed = calls.filter(e => e.x);
    const spells = ev.filter(e => e.k === 'radar').length, H = DATA.meta.params.horizon;
    const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
    const tp = closed.filter(e => e.res === 'tp'), sl = closed.filter(e => e.res === 'sl'), tm = closed.filter(e => e.res === 'time');
    const dTp = avg(tp.map(e => e.n).filter(x => x != null)), dSl = avg(sl.map(e => e.n).filter(x => x != null)), r = avg(closed.map(e => e.ret));
    const site = DATA.callStats && DATA.callStats.all;
    if (!calls.length) return `<div class="empty">No ACT call on ${esc(p.ticker)} in the chart window (about 2 years).${spells ? ` It was oversold ${spells} time${spells === 1 ? '' : 's'} without ever getting the bounce candle (or while it was SKIP / THIN).` : ''}</div>`;
    return `<div class="csum">
        <div><small>Calls</small><b>${calls.length}</b><div class="muted">${closed.length} closed</div></div>
        <div><small>TP / SL / timed out</small><b><span class="up">${tp.length}</span> / <span class="down">${sl.length}</span> / ${tm.length}</b><div class="muted">${closed.length ? Math.round(closed.filter(e => e.ret > 0).length / closed.length * 100) + '% made money' : '–'}</div></div>
        <div><small>Days to TP · to SL</small><b><span class="up">${dTp == null ? '–' : dTp.toFixed(1)}</span> · <span class="down">${dSl == null ? '–' : dSl.toFixed(1)}</span></b><div class="muted">${site && site.daysTp != null ? `all stocks: ${site.daysTp.toFixed(1)} · ${site.daysSl.toFixed(1)}` : 'trading days, buy day = day 1'}</div></div>
        <div><small>Average per trade</small><b>${pc(r, 1)}</b><div class="muted">after 0.4% fees</div></div>
      </div>
      <div class="card scroll"><table><thead><tr><th>Called</th><th>Result</th><th>Days held</th><th class="n">Return</th><th class="n">Entry</th><th class="n">TP / SL</th><th class="n">Score</th></tr></thead><tbody>
      ${calls.slice().reverse().map(e => `<tr><td>${esc(e.d)}${j.liveFrom && e.d >= j.liveFrom ? ' <span class="tag">live</span>' : ''}${e.dn ? ' <span class="muted" title="IHSG was below its 200-day average">↓mkt</span>' : ''}</td>
        <td>${resPill(e.res)}${e.x ? `<div class="muted">${esc(e.x)}${e.today ? ' · live' : ''}</div>` : ''}</td>
        <td>${e.x ? daysCell(e.n, e.res, H) : e.res === 'open' ? openCell(e.age, H) : '<span class="mute">–</span>'}</td>
        <td class="n">${e.x ? `<b class="${e.ret > 0 ? 'up' : 'down'}">${retTxt(e.ret)}</b>` : e.res === 'open' && e.now != null ? `<span class="muted">${retTxt(e.now)} now</span>` : '–'}</td>
        <td class="n">${f0(e.entry)}</td><td class="n"><span class="up">${f0(e.tp)}</span> / <span class="down">${f0(e.stop)}</span></td><td class="n">${e.s}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted"><b>Days held</b> counts trading sessions with the buy session (the open after the call) as day 1, so "TP · 3 days" means the target was hit on the third session, two sessions after buying. A trade still open after ${H} sessions is sold at that close. Before ${esc(j.liveFrom || 'the live ledger')} the calls are replayed with today's rules and neutral news, so they are not calls the site actually made at the time. Plus ${spells} oversold spell${spells === 1 ? '' : 's'} that never got an ACT badge.</p>`;
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

  // The stock, explained like a person would: what happened, what we are betting on, what to do, who is on the other side,
  // what would prove us wrong, and the honest odds. A picture of the trade sits in the middle; every number behind the
  // story is kept in "Technical detail" below it. Only oversold score, bounce candle and the NeoBDM veto drive the badge;
  // everything else is context that was tested and did not add an edge, and is labelled that way.
  // One line for list cards: what to do and where it should go.
  // Market filter (tools/experiment-v4.mjs, walk-forward): bounce trades only while IHSG is above its 200-day average.
  function marketBanner() {
    const f = DATA.market && DATA.market.filter;
    if (!f || f.ok || f.sma200 == null) return '';
    // How far is "ON"? The IHSG must close above its 200-day average, and that average itself drifts: if it keeps
    // falling at its last-4-weeks pace, the bar keeps getting lower. Both shown, no forecast of the index.
    const need = f.sma200 / f.ihsg - 1, perWeek = f.sma200ago ? (f.sma200 - f.sma200ago) / 4 : null;
    const gap = Math.max(0, Math.min(1, f.ihsg / f.sma200));
    const weeks = perWeek && perWeek < 0 ? (f.sma200 - f.ihsg) / -perWeek : null;
    return `<div class="note mkt">${f.gates === false ? `<b>Downtrend context: the IHSG is below its 200-day average.</b> IHSG ${f0(f.ihsg)} is ${(Math.abs(f.ihsg / f.sma200 - 1) * 100).toFixed(1)}% below it (${f0(f.sma200)}). Since 2026-10-10 this no longer blocks ACT (owner's decision), so ACT setups show in a falling market too. Keep positions small: in tests, bounce trades taken in downtrends had much deeper losses (worst drawdown −27% vs −13% over 5 years).` : `<b>Market filter is OFF: stand aside from new bounce trades.</b> IHSG ${f0(f.ihsg)} is ${(Math.abs(f.ihsg / f.sma200 - 1) * 100).toFixed(1)}% below its 200-day average (${f0(f.sma200)}). In a 4-year test, skipping new trades in this condition cut the worst drawdown from −37% to −13% (chosen on 2022-24, confirmed on 2024-26). Oversold stocks still show, marked <b>PAUSE</b>, so you can watch them.`}
      <div class="gauge" role="img" aria-label="IHSG is at ${Math.round(gap * 100)}% of its 200-day average"><i style="width:${(gap * 100).toFixed(1)}%"></i><span>IHSG ${f0(f.ihsg)}</span><em>ON at ${f0(f.sma200)}</em></div>
      <div class="muted">Distance to ON: the IHSG needs <b>+${(need * 100).toFixed(1)}%</b> at today's average.${perWeek != null ? ` The average itself is ${perWeek < 0 ? 'falling' : 'rising'} about ${f0(Math.abs(perWeek))} points a week${weeks ? `; at that pace it would meet a flat IHSG in roughly ${Math.round(weeks)} weeks` : ''}.` : ''} You get a Telegram alert the day it flips.</div></div>`;
  }


  const POS = () => (DATA.sizing && DATA.sizing.rule && DATA.sizing.rule.max) || (DATA.market && DATA.market.filter && DATA.market.filter.positions) || 5;
  const acctM = () => { const v = +LS.get('acctM'); return v > 0 ? v : 100; }; // Rp million
  function sizeCalc(price, stop, target) {
    const budget = acctM() * 1e6 / POS(), lots = Math.max(0, Math.floor(budget / (price * 100)));
    const cost = lots * 100 * price, fee = cost * 0.004;
    const per = price - stop, capLots = per > 0 ? Math.max(0, Math.floor(acctM() * 1e6 * RISKCAP / (per * 100))) : 0;
    return { budget, lots, cost, loss: lots * 100 * (price - stop) + fee, gain: lots * 100 * (target - price) - fee, capLots: Math.min(lots, capLots), stopFar: per / price };
  }
  const RISKCAP = 0.02; // a single stop-out should cost at most ~2% of the account
  const riskNote = (c, stop) => (stop <= 0 ? `<div class="risknote down"><b>No usable stop.</b> The wide-stop formula (3.5 daily ranges below the close) lands at ${f0(stop)} on a stock this volatile: in practice there is no stop. Skip it, or set your own and size for it.</div>`
    : c.loss / (acctM() * 1e6) > RISKCAP ? `<div class="risknote warn"><b>Stop is ${(c.stopFar * 100).toFixed(0)}% away:</b> one full slot would lose ${(c.loss / (acctM() * 1e6) * 100).toFixed(1)}% of the account if it is hit. To keep a stop-out to ${RISKCAP * 100}% of the account, buy <b>${c.capLots.toLocaleString()} lots</b> instead.</div>` : '');
  function sizerHtml(p, stop, px) {
    const c = sizeCalc(px, stop, p.target), rp = v => 'Rp ' + f0(v), N = POS();
    return `<div class="sizer" data-sizer="${esc(p.ticker)}" data-px="${px}" data-stop="${stop}" data-tg="${p.target}">
      <small class="sz-h">How much to buy</small>
      <div class="sz-in"><label>Account <input type="number" min="1" step="1" inputmode="numeric" value="${acctM()}" data-acct> Rp million</label><span class="muted" data-o="budget">1 of ${N} positions = ${rp(c.budget)}</span></div>
      <div class="sz-out"><div><small>Buy</small><b data-o="lots">${c.lots.toLocaleString()} lots</b><span class="muted" data-o="cost">${rp(c.cost)}</span></div>
        <div><small>If the stop is hit</small><b class="down" data-o="loss">−${rp(c.loss)}</b><span class="muted" data-o="lossp">${(c.loss / (acctM() * 1e6) * 100).toFixed(1)}% of the account</span></div>
        <div><small>At the target</small><b class="up" data-o="gain">+${rp(c.gain)}</b><span class="muted" data-o="gainp">${(c.gain / (acctM() * 1e6) * 100).toFixed(1)}% of the account</span></div>
        <div><button class="chip" data-paper="${esc(p.ticker)}">${paperBook().some(t => t.tk === p.ticker && !t.closed) ? 'In paper journal ✓' : 'Paper-trade this'}</button></div></div>
      <div data-o="risk">${riskNote(c, stop)}</div>
      <p class="muted">Why ${N} positions: in a walk-forward test (picked on 2022-24, confirmed on 2024-26) spreading over ${N} positions beat 5 on both return and drawdown. Whole lots of 100 shares, 0.4% fees. Your account size is saved only in this browser.</p></div>`;
  }
  // Paper-trade journal (this browser only): entries from the stock page, marked against the latest close each load.
  const paperBook = () => { try { return JSON.parse(LS.get('paperBook') || '[]'); } catch { return []; } };
  const savePaper = b => LS.set('paperBook', JSON.stringify(b));
  function bindSizer(el) {
    el.querySelectorAll('[data-acct]').forEach(i => {
      i.onclick = e => e.stopPropagation();
      i.oninput = () => {
        const v = +i.value; if (!(v > 0)) return; LS.set('acctM', String(v));
        const box = i.closest('[data-sizer]'), c = sizeCalc(+box.dataset.px, +box.dataset.stop, +box.dataset.tg), rp = x => 'Rp ' + f0(x);
        const set = (k, t) => { const n = box.querySelector('[data-o=' + k + ']'); if (n) n.textContent = t; };
        set('lots', c.lots.toLocaleString() + ' lots'); set('cost', rp(c.cost)); set('loss', '−' + rp(c.loss)); set('gain', '+' + rp(c.gain)); set('budget', '1 of ' + POS() + ' positions = ' + rp(c.budget));
        set('lossp', (c.loss / (v * 1e6) * 100).toFixed(1) + '% of the account'); set('gainp', (c.gain / (v * 1e6) * 100).toFixed(1) + '% of the account');
        const rk = box.querySelector('[data-o=risk]'); if (rk) rk.innerHTML = riskNote(c, +box.dataset.stop);
      };
    });
    el.querySelectorAll('[data-paper]').forEach(b => b.onclick = e => {
      e.stopPropagation(); const box = b.closest('[data-sizer]'), tk = b.dataset.paper, book = paperBook();
      if (book.some(t => t.tk === tk && !t.closed)) { go('score'); return; }
      const c = sizeCalc(+box.dataset.px, +box.dataset.stop, +box.dataset.tg);
      book.push({ tk, day: DATA.meta.asOf, entry: +box.dataset.px, stop: +box.dataset.stop, target: +box.dataset.tg, lots: c.lots, added: new Date().toISOString() });
      savePaper(book); b.textContent = 'In paper journal ✓';
    });
  }
  function paperHtml() {
    const book = paperBook();
    if (!book.length) return '<p class="muted">Nothing yet. On any oversold stock&#39;s page, press <b>Paper-trade this</b>: it records the entry, stop, target and lot size, and checks them against the latest close each time you open the site. Stored only in this browser.</p>';
    const by = Object.fromEntries(DATA.picks.map(p => [p.ticker, p]));
    let tot = 0;
    const rows = book.map((t, k) => {
      const p = by[t.tk], now = p ? (p.live ? p.live.price : p.close) : null;
      const st = t.closed ? t.closed.why : now == null ? 'no price' : now <= t.stop ? 'below stop' : now >= t.target ? 'at target' : 'open';
      const exit = t.closed ? t.closed.px : now, pl = exit == null ? null : (exit / t.entry - 1) - 0.004;
      if (pl != null) tot += pl * t.lots * 100 * t.entry;
      const cls = /target/.test(st) ? 'up' : /stop/.test(st) ? 'down' : 'muted';
      const held = Math.max(0, Math.round((new Date((t.closed ? t.closed.day : DATA.meta.asOf) + 'T00:00:00Z') - new Date(t.day + 'T00:00:00Z')) / 864e5));
      return `<tr><td><b>${esc(t.tk)}</b></td><td>${esc(t.day)}</td><td class="n">${f0(t.entry)}</td><td class="n">${f0(t.stop)} / ${f0(t.target)}</td><td class="n">${t.lots}</td><td class="n">${f0(exit)}</td><td class="n">${pc(pl, 1)}</td><td><span class="${cls}">${esc(st)}</span></td><td class="n">${held}d</td><td>${t.closed ? '' : '<button class="chip sm" data-close="' + k + '">close</button>'} <button class="chip sm" data-del="${k}" title="Remove">✕</button></td></tr>`;
    }).join('');
    return `<div class="card scroll"><table><thead><tr><th>Stock</th><th>Signal</th><th class="n">Entry</th><th class="n">Stop / target</th><th class="n">Lots</th><th class="n">Now / exit</th><th class="n">P/L</th><th>Status</th><th class="n" title="Calendar days since the signal day">Held</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted">Paper P/L so far: <b class="${tot >= 0 ? 'up' : 'down'}">${tot >= 0 ? '+' : '−'}Rp ${f0(Math.abs(tot))}</b>. Status uses the latest close (a stop touched intraday and recovered is not caught), so close a trade yourself when your broker would have. Entry is the price when you pressed the button; the real rule buys at the next open.</p>`;
  }
  function bindPaper(el) {
    el.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { const book = paperBook(), t = book[+b.dataset.close], p = DATA.picks.find(x => x.ticker === t.tk), now = p ? (p.live ? p.live.price : p.close) : t.entry; t.closed = { px: now, day: DATA.meta.asOf, why: now <= t.stop ? 'stop' : now >= t.target ? 'target' : 'closed' }; savePaper(book); renderScore(); });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const book = paperBook(); book.splice(+b.dataset.del, 1); savePaper(book); renderScore(); });
  }
  // Broker cost lines (tools/broker-cost.mjs): who accumulated since the last volume peak, at what average buy price,
  // and are they still holding. Broker TYPES only (codes stay local: paid data). Context; see the study in Broker flow.
  const BTYPE = { foreign: 'foreign institution', local: 'local broker', retail: 'retail', mixed: 'mixed retail + institutional' };
  const BCLS = { retail: ['retail', 'warn'], foreign: ['foreign', 'up'], local: ['local', ''], mixed: ['mixed', 'mute'] };
  const DRIVER = { 'retail crowd': ['Retail crowd', 'warn', 'Most of the net buying comes from retail brokers (the apps and bank brokers individuals use).'], 'one local player (bandar-style)': ['One local player (bandar-style)', 'up', 'A single local, non-retail broker did half or more of all net buying: the classic bandar footprint.'], 'one foreign institution': ['One foreign institution', 'up', 'A single foreign institutional desk did half or more of all net buying.'], 'foreign institutions': ['Foreign institutions', 'up', 'Most of the net buying comes from foreign institutional desks.'], 'local brokers': ['Local brokers', '', 'Most of the net buying comes from several local, non-retail brokers.'], mixed: ['Mixed', 'mute', 'No group dominates the net buying.'] };
  const bchip = c => { const x = BCLS[c] || [c, '']; return `<span class="bchip ${x[1]}">${esc(x[0])}</span>`; };
  const splitBar = cs => !cs ? '' : `<div class="csplit" role="img" aria-label="Net buying by broker class">${['retail', 'mixed', 'local', 'foreign'].filter(k => cs[k] > 0.005).map(k => `<i class="c-${k}" style="flex:${cs[k]}" title="${k} ${Math.round(cs[k] * 100)}%"></i>`).join('')}</div><div class="muted csplit-l">${['retail', 'mixed', 'local', 'foreign'].filter(k => cs[k] > 0.005).map(k => `<span class="c-${k}">■</span> ${k} ${Math.round(cs[k] * 100)}%`).join(' · ')}</div>`;
  const BSTAT = { adding: ['still adding', 'up'], holding: ['holding', 'up'], unloading: ['unloading', 'down'] };
  // Broker positions now (tools/broker-cost.mjs posRead): lots each broker built since its own inventory low and still
  // holds, their running average cost, and the paper profit or loss at today's price.
  const lotsTxt = n => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));
  const rpB = b => (Math.abs(b) >= 1000 ? 'Rp ' + (b / 1000).toFixed(1) + ' T' : 'Rp ' + b.toFixed(1) + ' B');
  function brokerPosHtml(p, c) {
    const P = c && c.pos;
    if (!P || !P.holders.length) return '';
    const px = p.live ? p.live.price : p.close, H = P.holders.map(h => ({ ...h, pl: h.avg ? px / h.avg - 1 : null, plB: h.avg ? (h.lots * 100 * (px - h.avg)) / 1e9 : null }));
    const big = H.filter(h => h.type !== 'retail'), inP = big.filter(h => h.pl > 0).length, lead = big[0];
    const sum = lead ? `The biggest non-retail position built in the data is <b>${esc(lead.code)}</b>${lead.name ? ` (${esc(lead.name)})` : ''}: about ${lotsTxt(lead.lots)} lots (${rpB(lead.lots * 100 * px / 1e9)}) at an average ${f0(lead.avg)}, so <b class="${lead.pl >= 0 ? 'up' : 'down'}">${lead.pl >= 0 ? 'in profit' : 'at a loss'} ${pc(lead.pl, 1).replace(/<[^>]+>/g, '')}</b> today. ${inP} of ${big.length} non-retail holders shown are in profit.` : 'Only retail brokers hold a built-up position here.';
    const sold = P.sellers.length ? `Biggest unloaders since their own peak: ${P.sellers.map(s => `<b>${esc(s.code)}</b> ${bchip(s.type)} ${lotsTxt(s.lots)} lots since ${esc(s.since)}`).join(' · ')}.` : '';
    return `<h4>Over the whole year of data: each broker's position since its own low point</h4>
      <div class="scroll"><table><thead><tr><th>Broker</th><th>Class</th><th class="n">Lots held</th><th class="n">Worth now</th><th class="n">Avg cost</th><th class="n">P/L</th><th class="n">Days of volume</th><th>Built since</th><th class="n">Last 20 sessions</th></tr></thead><tbody>
      ${H.map(h => `<tr><td><b>${esc(h.code)}</b> <span class="muted">${esc(h.name || '')}</span></td><td>${bchip(h.type)}</td><td class="n">${lotsTxt(h.lots)}</td><td class="n">${rpB(h.lots * 100 * px / 1e9)}</td><td class="n">${f0(h.avg)}</td>
        <td class="n"><b class="${h.pl >= 0 ? 'up' : 'down'}">${pc(h.pl, 1)}</b><div class="muted">${h.plB >= 0 ? '+' : '−'}${rpB(Math.abs(h.plB))}</div></td><td class="n">${h.days ?? '–'}</td><td>${h.fromStart ? `≤ ${esc(P.from)} <span class="muted" title="Its inventory low is the first day of data: the real position may be bigger">(maybe more)</span>` : esc(h.since)}</td>
        <td class="n ${h.last20 > 0 ? 'up' : h.last20 < 0 ? 'down' : ''}">${h.last20 > 0 ? '+' : ''}${lotsTxt(h.last20)}</td></tr>`).join('')}</tbody></table></div>
      <p>${sum} ${sold}</p>
      <p class="muted"><b>How this is measured.</b> For each broker, its running net (lots bought − lots sold, day by day) from ${esc(P.from)} to ${esc(P.day)}. The position it holds now is what it built since that running net was at its <b>lowest</b>; its cost is a running average (a net-buying day adds lots at that day's average buy price; a net-selling day removes lots and leaves the average unchanged). "Days of volume" = position ÷ the average daily volume of the last 60 sessions (${lotsTxt(P.advLots)} lots), a sense of how long it would take to sell. Limits: only the stock's ~20 most active brokers, only since ${esc(P.from)}, and a broker code is a desk for many clients, not one owner. Context, not a tested signal.</p>`;
  }
  function brokerCostHtml(p) {
    const c = p.brokerCost;
    const head = sincePeakHtml(p, c);
    if (c && c.pos) return head + brokerCostCore(p, c) + brokerPosHtml(p, c);
    return head + brokerCostCore(p, c);
  }
  // The direct answer: when was the volume peak, and since that day how many lots do the net buyers still hold, at what
  // average price, in profit or at a loss (tools/broker-cost.mjs costRead "since").
  const fmtDay = d => { const x = new Date(d + 'T00:00:00Z'); return x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  function sincePeakHtml(p, c) {
    if (!c || c.none || !c.since || !c.since.brokers.length) return '';
    const S = c.since, px = p.live ? p.live.price : p.close, pl = S.avg ? px / S.avg - 1 : null;
    const row = h => { const g = px / h.avg - 1; return `<tr><td><b>${esc(h.code)}</b> ${bchip(h.type)}<div class="muted" style="font-size:11.5px;white-space:normal">${esc(h.name || '')}</div></td><td class="n"><b>${lotsTxt(h.lots)} lots</b><div class="muted">${rpB(h.lots * 100 * px / 1e9)}</div></td><td class="n"><b>${f0(h.avg)}</b></td><td class="n"><b class="${g >= 0 ? 'up' : 'down'}">${pc(g, 1)}</b><div class="muted">${g >= 0 ? '+' : '−'}${rpB(Math.abs(h.lots * 100 * (px - h.avg) / 1e9))}</div></td></tr>`; };
    return `<div class="peak-box" style="margin-bottom:14px">
      <div class="kv">
        <div><small>Volume peak happened on</small><b>${esc(fmtDay(c.peakDay))}</b><div class="muted">${c.days} sessions ago${c.peakX ? ` · ${c.peakX}× the 60-session average volume` : ''}</div></div>
        <div><small>Since that day, net buyers still hold</small><b>${lotsTxt(S.lots)} lots</b><div class="muted">${(S.lots * 100).toLocaleString('en-US')} shares · ${rpB(S.lots * 100 * px / 1e9)} at today's price</div></div>
        <div><small>At an average price of</small><b>${f0(S.avg)}</b><div class="muted">weighted over all net buyers</div></div>
        <div><small>So today they are</small><b class="${pl >= 0 ? 'up' : 'down'}">${pl >= 0 ? 'in profit' : 'at a loss'} ${pc(pl, 1)}</b><div class="muted">price now ${f0(px)}</div></div>
      </div>
      <div class="scroll" style="margin-top:10px"><table><thead><tr><th>Broker</th><th class="n">Still holding</th><th class="n">Avg price</th><th class="n">P/L</th></tr></thead><tbody>${S.brokers.map(row).join('')}</tbody></table></div>
      <p class="muted"><b>Volume peak</b> = the session with the highest total volume in the last 60 sessions (buying and selling volume are the same number: every lot has a buyer and a seller; no minimum multiple is required). <b>Still holding</b> = the broker's lots bought minus lots sold from that day to ${esc(c.day)}, for brokers that bought more than they sold. <b>Average price</b> = the running cost of those lots (a net-buying day adds lots at that day's average buy price; a net-selling day removes lots without changing the average). Only the stock's ~20 most active brokers; a broker code is a desk for many clients. Context, not a tested signal.</p></div>`;
  }
  function brokerCostCore(p, c) {
    if (!c) return '<p class="muted">No broker inventory for this stock yet (refreshed weekly on a rotation; new stocks fill in within a week).</p>';
    if (c.none) return `<p class="muted">No broker has been a net buyer since the volume peak of ${esc(c.peakDay)} among the 20 most active brokers. Nobody is accumulating.</p>`;
    const px = p.live ? p.live.price : p.close, gap = px / c.cost - 1, st = BSTAT[c.status] || [c.status, ''];
    const lead = c.top[0], leadName = lead ? `${esc(lead.code)}${lead.name ? ' (' + esc(lead.name) + ')' : ''}` : '';
    const who = c.conc === 'one broker' ? `<b>one broker</b>, ${leadName}, a ${esc(BTYPE[lead.type] || lead.type)} broker, did ${Math.round(lead.share * 100)}% of all net buying` : c.conc === 'a few brokers' ? `<b>a few brokers</b> did most of the net buying (top 3: ${Math.round(c.top.reduce((s, x) => s + x.share, 0) * 100)}%), led by ${leadName}` : `the buying is <b>broad</b>: no single broker dominates (largest: ${leadName}, ${Math.round(lead.share * 100)}%)`;
    const dv = DRIVER[c.driver];
    const where = Math.abs(gap) <= 0.05 ? `Today's price is <b>near their cost</b> (${pc(gap, 1)}): the zone where accumulators usually defend.` : gap < 0 ? `Today's price is <b>${pc(-gap, 1).replace(/<[^>]+>/g, '')} below their cost</b>: they are under water, which either means they defend soon or are cutting.` : `Today's price is <b>${pc(gap, 1).replace(/<[^>]+>/g, '')} above their cost</b>: they are in profit, so their cost is a deeper support, not today's price.`;
    return `<div class="bcost">
      <div class="kv">
        <div><small>Volume peak</small><b>${esc(c.peakDay)}</b><div class="muted" title="The single session with the highest total volume (every lot has a buyer and a seller, so there is no separate buy or sell volume for the market) in the last 60 sessions. No minimum multiple: the number is how many times the 60-session average it was.">busiest of the last 60 sessions${c.peakX ? `, ${c.peakX}× avg` : ''}, ${c.days} sessions ago</div></div>
        <div><small>Big buyers' average cost</small><b>${f0(c.cost)}</b><div class="muted">top 3 net buyers since the peak</div></div>
        <div><small>Price vs their cost</small><b class="${Math.abs(gap) <= 0.05 ? 'up' : gap < 0 ? 'down' : ''}">${pc(gap, 1)}</b><div class="muted">now ${f0(px)}</div></div>
        <div><small>Are they still in?</small><b class="${st[1]}">${esc(st[0])}</b><div class="muted">their net over the last 5 sessions</div></div>
        <div><small>Size of the buying</small><b>${(c.netShare * 100).toFixed(1)}%</b><div class="muted">of all lots traded since the peak</div></div>
      </div>
      ${dv ? `<div class="drv"><small>Who is driving the buying</small><b class="${dv[1]}">${esc(dv[0])}</b><span class="muted">${esc(dv[2])}</span>${splitBar(c.classShare)}</div>` : ''}
      <div class="scroll"><table><thead><tr><th>Accumulator</th><th>Class</th><th class="n">Share of net buying</th><th class="n">Average buy price</th><th class="n">Now vs that price</th></tr></thead><tbody>
        ${c.top.map((x, i) => `<tr><td><b>${esc(x.code || '#' + (i + 1))}</b> <span class="muted">${esc(x.name || '')}</span></td><td>${bchip(x.type)}</td><td class="n">${Math.round(x.share * 100)}%</td><td class="n">${f0(x.avg)}</td><td class="n">${x.avg ? pc(px / x.avg - 1, 1) : '–'}</td></tr>`).join('')}</tbody></table></div>
      <p>Since the volume peak, ${who}. ${where}${c.status === 'unloading' ? ' But they are <b>unloading</b> now, so their cost is no longer a floor.' : ''}${c.supported ? ' <span class="tag">near a holding accumulator\'s cost</span>' : ''}</p>
      <p class="muted">From NeoBDM's daily per-broker inventory (each stock's 20 most active brokers), as of ${esc(c.day)}${c.stale ? ' <b>(stale)</b>' : ''}. Broker names from the IDX member list; classes and their evidence are in the Broker flow tab (broker directory). A cost line is a zone, not a promise: if they unload, it stops being support. ${DATA.brokerCostStudy ? 'Tested on one year of data: see the Broker flow tab.' : ''}</p></div>`;
  }
  // Broker directory: ALL IDX brokers with the written class and the measured behaviour side by side, so the label can be
  // audited. Check: retail should trade against big money, foreign with it, mixed neutral, local unconstrained.
  function dirCheck(v) {
    if (!v.measured) return ['not measurable', 'mute', 'Not among a stock\'s 20 most active brokers in at least 5 stocks.'];
    const b = v.behaves || '', w = /with big money/.test(b), a = /against big money/.test(b);
    if (v.cls === 'retail') return a ? ['agrees', 'up', 'Trades against big money, as a retail broker should.'] : w ? ['contradicts', 'down', 'Trades WITH big money: not retail-like.'] : ['weaker', 'warn', 'Leans retail but not clearly against big money.'];
    if (v.cls === 'foreign') return w ? ['agrees', 'up', 'Trades with big money.'] : a ? ['contradicts', 'down', 'Trades AGAINST big money: not institution-like.'] : ['weaker', 'warn', 'Not clearly with big money.'];
    if (v.cls === 'mixed') return !a && !w ? ['agrees', 'up', 'Neutral: a blend of crowd and institutions.'] : ['check', 'warn', 'Leans one way: may deserve another class.'];
    return a ? ['check', 'warn', 'Trades against big money like retail: may be a retail-heavy house.'] : ['n/a', 'mute', 'Local houses are not constrained either way.'];
  }
  function brokerDirHtml(d) {
    if (!d) return '';
    const all = Object.entries(d.by).sort((a, b) => ((b[1].measured && b[1].measured.grossT) || -1) - ((a[1].measured && a[1].measured.grossT) || -1));
    const chk = all.map(([c, v]) => [c, v, dirCheck(v)]), meas = chk.filter(([, v]) => v.measured), ag = meas.filter(([, , k]) => k[0] === 'agrees').length, bad = meas.filter(([, , k]) => k[0] === 'contradicts').length;
    return `<h2>Broker directory: who is retail, who is big money</h2>
      <div class="card pad"><ul class="checks">${Object.entries(d.defs).map(([k, v]) => `<li>${bchip(k)} ${esc(v)}</li>`).join('')}</ul>
      <p class="muted">Classes come from what each firm is, written down once (<code>tools/broker-directory.mjs</code>). They were then checked against what each broker's money actually did: the correlation of its daily net buying with NeoBDM's foreign flow and its "Bandar" estimate, averaged over the stocks where it is among the 20 most active (one year, 300 stocks). <b>Audit: ${meas.length} brokers measurable, ${ag} agree with their class, ${bad} contradict it, the rest are weaker or neutral.</b> "Bandar" here is a behaviour, not a broker: in a given stock it is the non-retail broker doing most of the buying. The full table is also in <code>data/broker-directory.json</code>.</p>
      <p><input type="search" id="bdq" placeholder="Filter by code, name or class" style="max-width:260px"></p></div>
      <div class="card scroll"><table id="bdtab"><thead><tr><th>Code</th><th>Broker (IDX)</th><th>Class</th><th>Behaves</th><th class="n">With foreign</th><th class="n">With "Bandar"</th><th class="n">Stocks</th><th>Class vs behaviour</th></tr></thead><tbody>
      ${chk.map(([c, v, k]) => `<tr data-q="${esc((c + ' ' + v.name + ' ' + v.cls).toLowerCase())}"><td><b>${esc(c)}</b></td><td>${esc(v.name)}</td><td>${bchip(v.cls)}</td><td class="${/with/.test(v.behaves || '') ? 'up' : /against/.test(v.behaves || '') ? 'warn' : 'muted'}">${esc(v.behaves || '–')}</td><td class="n">${v.measured ? v.measured.foreign.toFixed(2) : '–'}</td><td class="n">${v.measured ? v.measured.bandar.toFixed(2) : '–'}</td><td class="n">${v.measured ? v.measured.stocks : '–'}</td><td><span class="${k[1]}" title="${esc(k[2])}">${esc(k[0])}</span></td></tr>`).join('')}</tbody></table></div>
      <p class="muted">Correlations run from −1 to +1: negative = the broker buys when the group sells. "Behaves" is <i>with big money</i> at an average of +0.15 or more, <i>against big money (retail-like)</i> at −0.20 or less, else neutral. To change a class, edit the lists in <code>tools/broker-directory.mjs</code> and run it again.</p>`;
  }
  function brokerCostStudyHtml(x) {
    if (!x) return '';
    const t = v => (v == null ? '–' : v.toFixed(1)), R = id => x.results.find(r => r.id === id) || {};
    return `<h2>Big buyers' cost: does it help the bounce? (1 year)</h2>
      <p class="muted">For every oversold signal from ${esc(x.from)} to ${esc(x.to)} (${x.signals.toLocaleString()} signal-days on the tested 100), the cost line was rebuilt with only the data known that day. Rules written and committed before the data was pulled.</p>
      <div class="card scroll"><table><thead><tr><th>Test (A vs B)</th><th class="n">A / B per trade</th><th class="n">Gap</th><th class="n">t, episodes</th><th class="n">t, by day</th><th class="n">Unseen</th><th class="n">1st / 2nd half</th><th>Result</th></tr></thead><tbody>
      ${x.results.map(r => `<tr><td>${esc(r.id)} ${esc(r.name.replace('  [PRIMARY]', ''))}</td><td class="n">${pc(r.avgA, 2)} / ${pc(r.avgB, 2)}</td><td class="n">${pc(r.gap, 2)}</td><td class="n">${t(r.t)}</td><td class="n">${t(r.tDay)}</td><td class="n">${pc(r.unseen, 2)}</td><td class="n">${pc(r.h1, 1)} / ${pc(r.h2, 1)}</td><td>${r.pass ? '<span class="up">pass</span>' : '<span class="mute">fail (bar ' + r.bar + ')</span>'}</td></tr>`).join('')}</tbody></table></div>
      ${x.byDriver ? `<p class="muted"><b>By who drives the buying</b> (added after the tests, descriptive): ${Object.entries(x.byDriver).filter(([, v]) => v.n).map(([k, v]) => `${esc(k)} ${v.n} trades, ${pc(v.avg, 2)}`).join(' · ')}. Samples are small; nothing here is significant.</p>` : ''}<p class="muted">By who is buying (episodes): ${Object.entries(x.byConc).map(([k, v]) => `${esc(k)} ${v.n} trades, ${pc(v.avg, 2)}`).join(' · ')}. Across all stocks, the price-vs-cost gap's rank correlation with the next 5 sessions: ${x.ic.mean == null ? '–' : x.ic.mean.toFixed(2)} (t ${t(x.ic.t)}). One year is a short test: a fail can mean too little data, not proof of nothing. The cost line is shown as context either way and never changes a badge.</p>`;
  }
  // ---------- the thesis: how we read this stock, built from its own data ----------
  // Every point carries its evidence level so it can be weighed: backed by a test (either way), a near miss, a plain
  // fact, untested context, or an argument whose test failed (still shown when it bears on the stock, at low weight).
  // The balance bar adds those weights; it is a reading aid, not a tested signal. Only the oversold score, the bounce
  // candle and the veto rules decide the badge.
  const EVL = { tested: ['backed by test', 3], near: ['near miss', 2], fact: ['fact', 1.5], context: ['untested', 1], failed: ['test failed', 0.5] };
  const pctA = x => Math.abs(x * 100).toFixed(Math.abs(x) < 0.095 ? 1 : 0) + '%';
  const sgnP = x => (x >= 0 ? '+' : '−') + pctA(x);
  const daysAgoTxt = iso => { const d = Math.round((Date.now() - new Date(iso)) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; };
  const ANG = {
    live: ['Oversold bounce · live', 'Paper buy', 'up'], wait: ['Oversold bounce · waiting', 'Wait for trigger', 'warn'],
    skip: ['Oversold · not traded', 'Avoid', 'down'], thin: ['Oversold · too thin', 'Avoid', 'down'], pause: ['Oversold · market filter', 'Stand aside', 'warn'],
    susp: ['Not trading', 'Suspended', 'down'], mom: ['Momentum leader', 'Hold · Momentum 10', 'up'], brk: ['Base breakout', 'Watch', 'mute'],
    spec: ['Speculative breakout', 'Watch · lottery', 'mute'], spike: ['Foreign-backed volume spike', 'Watch', 'mute'], foreign: ['Foreign accumulation', 'Watch', 'mute'],
    coil: ['Coiling in a base', 'Watch', 'mute'], up: ['Uptrend · no setup', 'No setup', 'mute'], down: ['Downtrend · no setup', 'No setup', 'mute'], range: ['Sideways · no setup', 'No setup', 'mute'],
  };
  function thesisModel(p, j, lite) {
    const m = DATA.meta, H = m.params.horizon, T = p.ticker, px = pxOf(p);
    const act = p.score >= m.actScore, tier = p.tier || (act ? 'ACT' : 'WATCH');
    const stop = act && p.wideStop ? p.wideStop : p.stop, stopD = stop / px - 1, tgtD = p.target / px - 1;
    const mom = momOf(T), B = p.base && baseOn(p) ? p.base : null;
    const up200 = p.sma200 != null && px > p.sma200, up50 = p.sma50 != null && px > p.sma50;
    const nearLow = p.lo52 && px / p.lo52 - 1 < 0.03, pos52 = p.hi52 > p.lo52 ? (px - p.lo52) / (p.hi52 - p.lo52) : null, offHi = p.hi52 ? px / p.hi52 - 1 : null;
    const bar = j && (j.d.find(r => r[0] === m.asOf) || j.d[j.d.length - 1]), trigHi = bar ? bar[2] : null;
    const angle = p.suspended ? 'susp' : act && tier === 'ACT' ? 'live' : act && tier === 'WAIT' ? 'wait' : act && tier === 'THIN' ? 'thin' : act && tier === 'PAUSE' ? 'pause' : act && tier === 'SKIP' ? 'skip'
      : mom ? 'mom' : B && B.brk ? 'brk' : p.spec ? 'spec' : vOn(p) ? 'spike' : whoOn(p) ? 'foreign' : B && B.coil ? 'coil' : up200 && up50 ? 'up' : !up200 && !up50 ? 'down' : 'range';
    let [kicker, stance, tone] = ANG[angle];
    const lastCall = j ? (j.ev || []).filter(e => e.k === 'call').slice(-1)[0] : null;
    const inTrade = lastCall && lastCall.res === 'open' && (angle === 'live' || angle === 'wait') ? lastCall : null;
    if (inTrade) stance = 'In an open trade';
    const depth = p.rsi != null && p.rsi < 20 ? 'extremely oversold' : p.rsi != null && p.rsi < 30 ? 'deeply oversold' : 'oversold';
    const slide = p.chg20d != null && p.chg20d < -0.05 ? `fallen ${pctA(p.chg20d)} in a month${p.chg5d < -0.03 ? ` (${pctA(p.chg5d)} of it in the last week)` : ''}` : p.chg5d < -0.03 ? `dropped ${pctA(p.chg5d)} in a week` : 'slipped lower';
    // where it sits now: 'to X' after a fall, 'at X' / 'X' in a sentence about today
    const whereTo = nearLow ? ' to a 52-week low' : pos52 != null && pos52 < 0.25 ? ` to the bottom of its 52-week range (${f0(p.lo52)} to ${f0(p.hi52)})` : offHi != null ? `, leaving it ${pctA(offHi)} below its 52-week high` : '';
    const whereNow = nearLow ? 'at a 52-week low' : pos52 != null && pos52 < 0.25 ? `near the bottom of its 52-week range (${f0(p.lo52)} to ${f0(p.hi52)})` : offHi != null ? `${pctA(offHi)} below its 52-week high` : 'near its recent lows';
    const short = {
      live: inTrade ? `<span class="up">● In trade since ${esc(inTrade.d)}</span> · day ${inTrade.age} · ${sgnP(inTrade.now || 0)}` : `<span class="up">▲ Bounce live</span> · TP ${f0(p.target)} <span class="muted">${sgnP(tgtD)}</span> · SL <span class="muted">${sgnP(stopD)}</span>`,
      wait: `<span class="warn">Wait</span> · ${trigHi ? `buy on a close above ${f0(trigHi)}` : 'needs a bounce candle'}`,
      skip: p.untested ? '<span class="down">Oversold, edge unproven on this stock</span>' : '<span class="down">Oversold, vetoed (NeoBDM)</span>',
      thin: '<span class="warn">Oversold, but too thinly traded</span>', pause: '<span class="warn">Oversold, market filter: stand aside</span>',
      susp: '<span class="down">No trading for 3 sessions</span>', mom: `<span class="up">Momentum 10 #${mom && mom.rank}</span> · ${mom ? sgnP(mom.mom) + ' in 12 months' : ''}`,
      brk: `<span class="warn">Broke out of a base</span> · watch`, spec: '<span class="down">Speculative breakout</span> · lottery', spike: `<span class="up">Volume spike, foreigners buying</span> · watch`,
      foreign: `<span class="up">Foreigners accumulating</span> · watch`, coil: B ? `Coiling ${f0(B.lo)}–${f0(B.hi)} · watch` : 'Coiling · watch',
      up: '<span class="mute">Uptrend, not oversold</span>', down: '<span class="mute">Downtrend, not oversold yet</span>', range: '<span class="mute">Sideways, no setup</span>',
    }[angle];
    if (lite) return { angle, stance, tone, kicker, short };
    const tradeNote = inTrade ? `<b>Already in a trade:</b> the rule bought ${esc(T)} on the open after ${esc(inTrade.d)} at ${f0(inTrade.entry)} and it is ${sgnP(inTrade.now || 0)} on day ${inTrade.age} of ${H}. It holds one trade per stock at a time, so today's signal is not a second buy: manage that trade (TP ${f0(inTrade.tp)}, SL ${f0(inTrade.stop)}). ` : '';

    // 1. headline + subline, one per angle
    const g = p.group, w = p.who && !p.who.stale ? p.who : null, bm = p.bm && !p.bm.stale ? p.bm : null, nb = p.neobdm && !p.neobdm.stale ? p.neobdm : null;
    const bc = p.brokerCost && !p.brokerCost.none && !p.brokerCost.stale ? p.brokerCost : null, fu = p.fundamentals, o = p.ownership;
    let title, sub;
    switch (angle) {
      case 'live': title = `${T} has ${slide}${whereTo}, and buyers stepped in today.`; sub = tradeNote ? tradeNote + `The bet is unchanged: a short snap-back, not a turnaround.` : `We read it as a short snap-back trade, not a turnaround: paper-buy at the next open (around <b>${f0(px)}</b>), aim for <b>${f0(p.target)}</b> (${sgnP(tgtD)}) within ${H} sessions, and accept being wrong below <b>${f0(stop)}</b> (${sgnP(stopD)}).`; break;
      case 'wait': title = `${T} is ${depth} after it has ${slide}, but the bounce has not started.`; sub = tradeNote ? tradeNote : `It turns into a paper buy only after an up day${trigHi ? `: a close above <b>${f0(trigHi)}</b> (the last session's high), or a green candle closing above <b>${f0(p.close)}</b>` : ''}. Buying before that lost money in our backtest; then the plan is <b>${f0(p.target)}</b> target, <b>${f0(stop)}</b> stop.`; break;
      case 'skip': title = `${T} looks ${depth}, but we do not trade it.`; sub = p.untested ? `It is one of the 400 stocks added in October 2026. On them the bounce rule failed its pre-registered holdout test, and adding them cut the account's return, so it stays on the watch list only.` : `NeoBDM flags unusual activity (Pinky) or thin trading, which vetoes the trade.`; break;
      case 'thin': title = `${T} looks ${depth}, but it trades only about Rp ${p.valueB.toFixed(1)} B a day.`; sub = `Below Rp 5 B a day the entry, stop and exit prices in our tests are not reliable fills, and a few lots move the price. Shown, never traded.`; break;
      case 'pause': title = `${T} has ${slide}${whereTo}, but the market filter says stand aside.`; sub = `With the IHSG below its 200-day average, oversold bounces failed often enough to cost money overall.`; break;
      case 'susp': title = `${T} has not traded for at least 3 sessions.`; sub = `It is probably suspended or halted. The numbers below are from its last trading day.`; break;
      case 'mom': title = `${T} is one of the 10 strongest stocks of the past year (${sgnP(mom.mom)} over 12 months, skipping the latest month).`; sub = `That makes it a trend-following holding until the month-end rebalance, under the one rule here that passed a no-hindsight test.${mom.ret != null ? ` Since the entry at ${f0(mom.entry)} it is <b class="${mom.ret >= 0 ? 'up' : 'down'}">${sgnP(mom.ret)}</b>.` : ''} Expect sharp pullbacks: the strategy's worst drawdown was −57%.`; break;
      case 'brk': title = `${T} just broke out of a ${pctA(B.range)} sideways base on ${B.volx ? B.volx.toFixed(1) + '×' : 'heavy'} volume.`; sub = `The close cleared the 40-session high of <b>${f0(B.hi)}</b>. Breakouts like this did no better than the market in a 9-year test, so we watch it rather than trade it.`; break;
      case 'spec': title = `${T} is a cheap, volatile stock breaking out while the speculation season is ${DATA.spec && DATA.spec.on ? 'ON' : 'off'}.`; sub = `In past seasons these paid on average through a few huge winners; most single trades still lost. Treat it as a lottery ticket, not a setup.`; break;
      case 'spike': title = `${T} traded ${p.vspike.x}× its usual volume on ${esc(p.vspike.d)}, with foreigners net buying.`; sub = `Spikes backed by foreign buying beat foreign-sold spikes by about 2.7% over 10 sessions in 2024-26, but the result did not repeat on 2022-24 data. A watch signal while its forward test runs.`; break;
      case 'foreign': title = `${T} moves with foreign money, and foreigners have been buying it.`; sub = `It is in the top third of foreign-driven stocks by foreign buying over 20 sessions. That pointed the right way in six separate looks but never passed significance, so it is context, not a trade.`; break;
      case 'coil': title = `${T} is coiling in a ${pctA(B.range)} range (${f0(B.lo)} to ${f0(B.hi)}) for 40 sessions.`; sub = `A close above <b>${f0(B.hi)}</b> on 1.5× volume would be a breakout. Base breakouts failed their 9-year test, so this stays a watch signal.`; break;
      case 'up': title = `${T} is in an uptrend, above its 50- and 200-day averages${p.rs3m != null ? ` and ${sgnP(p.rs3m)} against the IHSG over 3 months` : ''}.`; sub = `Our screener buys sharp, oversold dips, so there is no setup here. It would become a bounce candidate only after a hard drop (oversold score ${p.score} now, ${m.actScore} needed).`; break;
      case 'down': title = `${T} is in a downtrend, below its 50- and 200-day averages${offHi != null ? ` and ${pctA(offHi)} off its 52-week high` : ''}.`; sub = `It is not stretched enough for a bounce trade (oversold score ${p.score}, ${m.actScore} needed), and falling stocks can keep falling. Nothing to do yet.`; break;
      default: title = `${T} is going sideways, between its 50- and 200-day averages.`; sub = `No setup in our rules: it is neither oversold (score ${p.score} of ${m.actScore}) nor in a base breakout. Nothing to do.`;
    }

    // 2. arguments for and against, each with its evidence level
    const BU = [], BE = [], add = (side, ev, s, txt, k = 1) => (side > 0 ? BU : BE).push({ ev, s, txt, w: EVL[ev][1] * k });
    const rank = DATA.picks.filter(x => x.score > p.score).length + 1;
    if (act) add(1, 'fact', `${depth} (RSI ${p.rsi == null ? '–' : p.rsi.toFixed(0)})`, `Stretched: RSI ${p.rsi == null ? '–' : p.rsi.toFixed(0)}, ${Math.abs(p.dist20Atr).toFixed(1)} daily ranges below its 20-day average, the #${rank} most oversold of ${DATA.picks.length} today.`);
    if (act) add(-1, 'tested', 'no proven edge in the bounce rule', `The bounce rule itself has no proven edge: over 2017-26 it averaged about −0.3% a trade, inside the range of random noise${DATA.payoff && DATA.payoff.confirm ? `, and on ${DATA.payoff.confirm.stocks} stocks it was never built on it lost ${pctA(DATA.payoff.confirm.B.mean)} a trade` : ''}.`, 0.7);
    if (angle === 'live') add(1, 'fact', 'the bounce candle is in', `The bounce candle is in: the last session closed ${p.confirm ? 'up, above the previous high or the previous close' : 'up'}. Buying only after it is what separated the bounce from catching a falling knife in the backtest.`);
    if (angle === 'wait') add(-1, 'tested', 'no bounce candle yet', `No bounce candle yet. In the backtest, buying oversold stocks before the first up day did not make money.`);
    if (act && stopD < -0.1) add(-1, 'fact', `a ${pctA(stopD)} stop for a ${pctA(tgtD)} target`, `The stop is ${pctA(stopD)} away for a ${pctA(tgtD)} target: one stop-out wipes out about ${(Math.abs(stopD) / tgtD).toFixed(1)} winning trades. This payoff gap is why the replayed record sits near zero despite a 64% win rate. Tighter stops were tested and did worse (oversold stocks shake them out); the fixed +8% target is the weak part.`);
    if (act && p.atrPct) { const k = tgtD / p.atrPct; if (k <= 2.5) add(1, 'fact', 'the target is within normal swings', `The target is only ${k.toFixed(1)} normal days' moves away (it swings about ${pctA(p.atrPct)} a day).`); else if (k > 4) add(-1, 'fact', 'a slow mover for this target', `The target needs ${k.toFixed(1)}× its normal daily move (${pctA(p.atrPct)}); slow stocks often time out after ${H} sessions instead.`); }
    if (act && p.resistance && p.resistance > px && p.resistance < p.target) add(-1, 'fact', `resistance at ${f0(p.resistance)} before the target`, `Resistance at ${f0(p.resistance)} (${sgnP(p.resistance / px - 1)}) sits before the target${p.resistanceTouches ? `, tested ${p.resistanceTouches} times` : ''}.`);
    if (act && p.targetMR && p.targetMR > p.target) add(1, 'fact', 'room back to its 20-day average', `Its 20-day average (${f0(p.targetMR)}, ${sgnP(p.targetMR / px - 1)}) is above the target, so an ordinary reversion would carry past it.`);
    if (p.supportTouches >= 2 && p.support && Math.abs(px / p.support - 1) < 0.04) add(1, 'fact', `support at ${f0(p.support)}`, `Sitting on support at ${f0(p.support)}, which held ${p.supportTouches} times before.`);
    else if (act && nearLow) add(-1, 'fact', 'at a 52-week low', `At a 52-week low: there are no older buyers below to lean on.`);
    if (p.sma200 != null) { if (!up200 && (act || angle === 'down')) add(-1, 'fact', 'below its 200-day average', `Below its 200-day average (${f0(p.sma200)}, ${sgnP(px / p.sma200 - 1)}): the long-term trend is down.`); else if (up200 && act) add(1, 'fact', 'a dip inside an uptrend', `Still above its 200-day average (${f0(p.sma200)}): a dip inside a long-term uptrend.`); else if (up200 && !act) add(1, 'fact', 'above its 200-day average', `Above its 200-day average (${f0(p.sma200)}, ${sgnP(px / p.sma200 - 1)}).`, 0.7); }
    if (p.rs3m != null && Math.abs(p.rs3m) > 0.12) add(p.rs3m > 0 ? 1 : -1, 'fact', `${p.rs3m > 0 ? 'beating' : 'lagging'} the IHSG`, `${p.rs3m > 0 ? 'Beating' : 'Lagging'} the IHSG by ${pctA(p.rs3m)} over 3 months.`, 0.7);
    if (act && p.hitN >= 30 && p.hitRate != null) { if (p.hitRate >= 0.45) add(1, 'failed', 'often hit +8% in the past year', `In the past year, +${m.params.targetPct}% before the stop within ${H} days happened ${Math.round(p.hitRate * 100)}% of the time on this stock (did not predict in the backtest).`); else if (p.hitRate <= 0.15) add(-1, 'failed', 'rarely hit +8% in the past year', `In the past year, +${m.params.targetPct}% before the stop within ${H} days happened only ${Math.round(p.hitRate * 100)}% of the time on this stock (did not predict in the backtest).`); }
    if (j) {
      const cl = (j.ev || []).filter(e => e.k === 'call' && e.x).map(e => ({ ...e, n: heldDays(j, e) })), tp = cl.filter(e => e.res === 'tp'), sl = cl.filter(e => e.res === 'sl');
      const dTp = tp.length ? tp.reduce((s, e) => s + (e.n || 0), 0) / tp.length : null, avgR = cl.length ? cl.reduce((s, e) => s + e.ret, 0) / cl.length : 0;
      const line = `${cl.length} closed calls on ${T} in about two years: ${tp.length} hit the target${dTp ? ` (after ${dTp.toFixed(1)} days on average)` : ''}, ${sl.length} were stopped out, average ${sgnP(avgR)} a trade.`;
      if (cl.length >= 2 && avgR > 0.01 && tp.length > sl.length) add(1, 'context', `the rule has worked on ${T} before`, `The rule has worked here before: ${line}`);
      else if (cl.length >= 2 && avgR < 0) add(-1, 'context', `the rule has lost money on ${T}`, `The rule has struggled here: ${line}`);
    }
    if (p.valueB < 5) add(-1, 'fact', 'thin trading', `Thin: about Rp ${p.valueB.toFixed(1)} B a day, so fills can be poor.`);
    else if (p.valueB >= 100 && (act || mom)) add(1, 'fact', 'deep liquidity', `Deep liquidity (Rp ${f0(p.valueB)} B a day): easy to get in and out.`, 0.6);
    if (mom) add(1, 'tested', `Momentum 10 #${mom.rank}`, `In this month's Momentum 10 (#${mom.rank}): 12-month winners, the one rule that held up without hindsight (+4.8% a year vs −1.0% for all stocks).`);
    const h4 = DATA.groups && DATA.groups.study && DATA.groups.study.h4;
    if (g && g.hot && h4) add(1, h4.pass ? 'tested' : 'failed', `its group (${g.alias || g.name}) is hot`, `Its group, ${esc(g.name)}, jumped 10%+ in a week recently; after jumps like that groups beat the IHSG by ${pctA(h4.avg)} over the next 2 weeks on average (${h4.events} cases).`);
    if (g && (g.quad === 'LAGGING' || g.quad === 'LEADING')) add(g.quad === 'LEADING' ? 1 : -1, act ? 'failed' : 'context', `its group is ${g.quad.toLowerCase()}`, `Its group, ${esc(g.name)}, is ${g.quad === 'LEADING' ? 'leading' : 'lagging'} the IHSG (#${g.rank || '–'} of ${g.of}).${act ? ' The group trend did not change how bounce trades went in the 5-year test.' : ''}`, 0.8);
    if (w && w.fcT === 3) { if (w.fb === 'buy') add(1, 'near', 'foreigners buying a foreign-driven stock', `A foreign-driven stock (price and foreign flow correlate ${w.fc.toFixed(2)}) with foreigners net buying over 20 sessions${w.fbT === 3 ? ' (top third)' : ''}.`); else if (w.fb === 'sell') add(-1, 'near', 'foreigners selling a foreign-driven stock', `A foreign-driven stock (correlation ${w.fc.toFixed(2)}) and foreigners have been net sellers over 20 sessions.`); }
    if (p.vspike) add(p.vspike.f > 0 ? 1 : -1, 'near', `volume spike with foreigners ${p.vspike.f > 0 ? 'buying' : 'selling'}`, `Volume spike on ${esc(p.vspike.d)} (${p.vspike.x}× normal, ${esc(String(p.vspike.type).toLowerCase())} candle) with foreigners net ${p.vspike.f > 0 ? 'buying' : p.vspike.f < 0 ? 'selling' : 'flat'}.`);
    if (bm) {
      if (bm.spike && act) add(-1, 'near', 'an Intensity spike (selling not done?)', `Bandarmetrics Intensity spiked in the last 3 days; on oversold stocks that came before more selling in tests (a side result, now forward-tested).`);
      if (bm.mf && act) add(1, 'near', 'Money Flow rising', `Bandarmetrics Money Flow is rising; on oversold stocks that looked helpful in tests (t 1.8, a side result, now forward-tested).`, 0.7);
      if (bm.lpm === 'rising') add(1, 'failed', 'large orders building (LPM)', `Large-order pressure (LPM) is rising${bm.quiet ? ' even as the price fell' : ''}. LPM failed its own backtest, so it is weak evidence.`);
      else if (bm.lpm === 'falling') add(-1, 'failed', 'large orders still selling (LPM)', `Large-order pressure (LPM) is still falling: big orders are on the sell side. LPM failed its own backtest, so it is weak evidence.`);
    }
    if (nb) {
      if (nb.tag === 'AVOID') add(-1, 'fact', 'NeoBDM veto', `NeoBDM: ${esc(nb.note)}`);
      else if (nb.phase === 'ACCUMULATION' || nb.phase === 'MARKUP') add(1, 'failed', `big money ${nb.phase === 'MARKUP' ? 'buying into strength' : 'accumulating'} (NeoBDM)`, `NeoBDM reads big money as ${nb.phase === 'MARKUP' ? 'buying while the price rises' : 'buying while the price is weak'}. In two years of replay this read did not predict returns.`);
      else if (nb.phase === 'DISTRIBUTION' || nb.phase === 'MARKDOWN') add(-1, 'failed', 'big money selling (NeoBDM)', `NeoBDM reads big money as ${nb.phase === 'MARKDOWN' ? 'selling while the price falls' : 'selling while the price holds'}. In two years of replay this read did not predict returns.`);
    }
    if (bc) { const gap = px / bc.cost - 1;
      if (bc.status === 'unloading') add(-1, 'failed', 'accumulators unloading', `The brokers who bought since the ${esc(bc.peakDay)} volume peak (average cost ${f0(bc.cost)}) are unloading now.`);
      else if (Math.abs(gap) <= 0.05) add(1, 'failed', `at big buyers' cost (${f0(bc.cost)})`, `Big buyers since the ${esc(bc.peakDay)} volume peak paid ${f0(bc.cost)} on average, ${Math.abs(gap) <= 0.02 ? 'right here' : 'close to here'} (${sgnP(gap)} away), and are still ${esc(bc.status)}: a zone accumulators often defend. The cost-line test failed on one year of data.`);
      else if (gap < -0.1 && bc.status !== 'unloading') add(-1, 'context', 'big buyers under water', `Big buyers since ${esc(bc.peakDay)} paid ${f0(bc.cost)} on average and are ${pctA(gap)} under water: they either defend soon or cut.`, 0.6);
    }
    if (fu) {
      const q = fu.quarters && fu.quarters[fu.quarters.length - 1];
      if (q && q.ni != null && q.ni < 0) add(-1, 'fact', 'losing money', `Lost money in the latest quarter (${esc(q.date)}).`);
      else if (fu.yoy != null && fu.yoy >= 0.15) add(1, 'fact', `profit up ${pctA(fu.yoy)} a year`, `Latest quarterly profit is up ${pctA(fu.yoy)} on a year ago${fu.margin != null ? `, at a ${pctA(fu.margin)} net margin` : ''}${act ? ': the drop is not about earnings' : ''}.`);
      else if (fu.yoy != null && fu.yoy <= -0.25) add(-1, 'fact', `profit down ${pctA(fu.yoy)} a year`, `Latest quarterly profit is down ${pctA(fu.yoy)} on a year ago${act ? ': the selling may have a reason' : ''}.`);
    }
    if (o) {
      if (o.top3Pct >= 85) add(-1, 'context', 'thin real float', `Thin real float: the top 3 holders own ${o.top3Pct.toFixed(0)}%, so moves can be sharp both ways.`, 0.7);
      if (o.stateLinked && o.statePct >= 50) add(1, 'context', 'state-linked owner', `State-linked holders own ${o.statePct.toFixed(0)}%.`, 0.5);
      (o.changes || []).slice(0, 2).forEach(c => { if (c.kind === 'new') add(1, 'context', `${c.name} joined the ≥1% holders`, `New ≥1% holder last month: ${esc(c.name)} (${c.to}%).`, 0.7); else if (c.kind === 'exit') add(-1, 'context', `${c.name} exited`, `${esc(c.name)} left the ≥1% holder list (was ${c.from}%).`, 0.7); });
    }
    const top = (p.headlines || []).find(h => h.direct && !h.recap);
    if (top && top.sentiment) add(top.sentiment > 0 ? 1 : -1, 'context', top.sentiment > 0 ? 'positive news' : 'negative news', `News ${daysAgoTxt(top.published)}: <a href="${safeUrl(top.link)}" target="_blank" rel="noopener noreferrer">“${esc(top.title)}”</a> reads as ${top.sentiment > 0 ? 'positive' : 'negative'}.`);
    const fl = (p.filings || [])[0];
    if (fl) { const k = fl[1], s = k === 'dilution' ? -1 : k === 'idxQuery' ? -1 : k === 'buyback' || k === 'dividend' ? 1 : 0;
      if (s) add(s, 'context', k === 'dilution' ? 'new shares (dilution)' : k === 'idxQuery' ? 'IDX query on unusual trading' : k, `IDX filing ${esc(fl[0])}: ${esc(fl[2])}${fl[4] ? ` (<a href="${safeUrl(fl[4])}" target="_blank" rel="noopener noreferrer">filing</a>)` : ''}. ${k === 'dilution' ? 'New shares usually weigh on the price until the deal is done.' : k === 'idxQuery' ? 'The exchange asked the company to explain unusual trading.' : k === 'buyback' ? 'The company plans to buy back its own shares.' : 'A dividend announcement.'}`); }
    const mk = DATA.market && DATA.market.filter;
    if (act && mk && mk.ok === false) add(-1, 'tested', 'the market is in a downtrend', `The IHSG is below its 200-day average: bounce trades taken in downtrends had much deeper losses (worst drawdown −27% vs −13% over 5 years).`);
    if (p.spec) add(-1, 'tested', 'lottery-style payoff', `Cheap, volatile breakouts pay only in speculative seasons, and even then mostly through a few huge winners.`);
    if (B && !act) add(1, 'failed', B.brk ? 'base breakout' : 'tight base', B.brk ? `Broke out of a 40-session base on ${B.volx ? B.volx.toFixed(1) + '×' : 'high'} volume; base breakouts failed their 9-year test.` : `Coiling in a ${pctA(B.range)} base (${f0(B.lo)} to ${f0(B.hi)}); base breakouts failed their 9-year test.`, 0.8);
    BU.sort((a, b) => b.w - a.w); BE.sort((a, b) => b.w - a.w);
    const sw = a => a.reduce((s, x) => s + x.w, 0), wB = sw(BU), wR = sw(BE);

    // 3. the story, in prose
    const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
    const liq = p.valueB >= 100 ? 'one of the most traded names on the exchange' : p.valueB >= 20 ? 'liquid' : p.valueB >= 5 ? 'tradeable but not deep' : 'thinly traded';
    const story = [];
    story.push(`<b>${esc(p.name)}</b> is ${/^[aeiou]/i.test(p.sector) ? 'an' : 'a'} ${esc(p.sector.toLowerCase())} stock, ${liq} at about Rp ${f0(p.valueB)} B a day${o && o.control ? `, ${esc(lc(o.control))}${o.holders && o.holders[0] ? ` (largest holder ${esc(o.holders[0].name)}, ${o.holders[0].pct.toFixed(1)}%)` : ''}` : ''}${g ? `, and part of the ${esc(g.name)} group` : ''}.${fu && fu.yoy != null ? ` Its latest quarterly profit was ${fu.yoy >= 0 ? 'up' : 'down'} ${pctA(fu.yoy)} on a year ago.` : ''}`);
    story.push(`Over the last month it ${p.chg20d >= 0 ? 'gained' : 'lost'} ${pctA(p.chg20d || 0)}${p.chg5d != null ? ` (${sgnP(p.chg5d)} in the last week)` : ''} and now trades ${whereNow}, ${up200 ? 'above' : 'below'} its 200-day average${p.rs3m != null ? `, ${p.rs3m >= 0 ? 'ahead of' : 'behind'} the IHSG by ${pctA(p.rs3m)} over 3 months` : ''}. It typically moves ${pctA(p.atrPct)} a day.`);
    const bet = {
      live: `Our bet is narrow: when a stock drops this far this fast, sellers tend to run out and the price often snaps part of the way back. We want ${sgnP(tgtD)} within ${H} sessions, not a recovery story. ${BU[0] ? `The strongest point for it: ${lc(BU[0].s)}` : ''}${BE[0] ? `. The main point against: ${lc(BE[0].s)}` : ''}.`,
      wait: `The setup is half-built: it is stretched enough, but nobody has stepped in yet. We wait for the first up day rather than guess the bottom. ${BU[0] ? `In its favour: ${lc(BU[0].s)}` : ''}${BE[0] ? `; against: ${lc(BE[0].s)}` : ''}.`,
      mom: `Momentum works the other way round from the bounce: we own what has been strong and let the monthly rebalance replace it when it fades. It is a relative edge in a weak market, not a promise for this one stock.`,
    }[angle] || `${BU[0] ? `The strongest point for it: ${lc(BU[0].s)}` : 'Nothing in its favour stands out'}${BE[0] ? `. The main point against: ${lc(BE[0].s)}` : ''}.`;
    story.push(bet);
    const who = [];
    if (nb && nb.bigMoney && nb.bigMoney.d20) who.push(`big brokers have been ${/strong sell/.test(nb.bigMoney.d20) ? 'heavy net sellers' : /sell/.test(nb.bigMoney.d20) ? 'net sellers' : /buy/.test(nb.bigMoney.d20) ? 'net buyers' : 'flat'} over 20 sessions (NeoBDM)`);
    if (w) who.push(`foreigners have been net ${w.fb === 'buy' ? 'buying' : w.fb === 'sell' ? 'selling' : 'flat'}${w.fcT === 3 ? ', and this stock tends to follow them' : ', though the price has not followed foreign flow here'}`);
    if (bc) who.push(`the brokers who accumulated since the ${esc(bc.peakDay)} volume peak paid ${f0(bc.cost)} on average and are ${esc(bc.status)}`);
    if (w && w.rs != null) who.push(`retail makes up about ${w.rs}% of trading`);
    if (who.length) story.push(`Who is trading it: ${who.join('; ')}. None of these flow reads predicted returns in our tests, so they describe the battle rather than call it.`);

    // 4. what we watch next, and what would change our mind
    const watch = [], mind = [];
    const openCall = j ? (j.ev || []).filter(e => e.k === 'call').slice(-1)[0] : null;
    if (openCall && openCall.res === 'open' && !(angle === 'live')) watch.push([`Open ACT trade from ${esc(openCall.d)}: day ${openCall.age} of ${H}, ${sgnP(openCall.now || 0)} so far`, `TP ${f0(openCall.tp)} / SL ${f0(openCall.stop)}`]);
    if (angle === 'live' && inTrade) { watch.push([`Open trade from ${esc(inTrade.d)}: day ${inTrade.age} of ${H}`, `<span class="${(inTrade.now || 0) >= 0 ? 'up' : 'down'}">${sgnP(inTrade.now || 0)}</span>`], ['Take profit on a touch of', `<span class="up">${f0(inTrade.tp)}</span>`], ['Stop out on a touch of', `<span class="down">${f0(inTrade.stop)}</span>`], [`Sell at the close of session ${H} if neither is hit`, `${H - inTrade.age} left`]); mind.push(`A touch of ${f0(inTrade.stop)}: the bounce failed. Exit, no second guessing.`); }
    else if (angle === 'live') { watch.push(['Paper-buy at the next open', `≈ ${f0(px)}`], ['Take profit on a touch of', `<span class="up">${f0(p.target)}</span>`], ['Stop out on a touch of', `<span class="down">${f0(stop)}</span>`], [`Sell at the close of session ${H} if neither is hit`, `${H} sessions`]); mind.push(`A touch of ${f0(stop)}: the bounce failed. Exit, no second guessing.`); }
    if (angle === 'wait') { if (trigHi) watch.push(['Buy trigger: a close above', `<span class="up">${f0(trigHi)}</span>`], ['or a green candle closing above', f0(p.close)]); else watch.push(['Buy trigger: the first up day (a bounce candle)', '']); watch.push(['Then the plan: target / stop', `${f0(p.target)} / ${f0(stop)}`]); mind.push(`The oversold score dropping below ${m.actScore} before a bounce candle (the selling stopped without a setup).`); }
    if (angle === 'mom') { watch.push(['Next rebalance', 'last trading day of the month'], ['Stays only if it is still a top-10 12-month winner', '']); mind.push('Falling out of the top 10 at the next rebalance: it gets sold then, not before.'); }
    if (B) watch.push([B.brk ? 'Breakout level to hold' : 'Breakout trigger: a close above (on 1.5× volume)', f0(B.hi)], ['Base floor', f0(B.lo)]);
    if (['up', 'down', 'range', 'foreign', 'spike'].includes(angle)) watch.push(['Becomes a bounce candidate at an oversold score of', `${m.actScore} <span class="muted">(now ${p.score})</span>`]);
    if (p.resistance && p.resistance > px) watch.push(['Resistance overhead', f0(p.resistance)]);
    if (p.support && p.support < px) watch.push(['Support below', f0(p.support)]);
    if (bc && bc.status !== 'unloading') { watch.push(['Big buyers\' average cost', f0(bc.cost)]); mind.push('The accumulating brokers turning into sellers (their cost stops being a floor).'); }
    if (act) mind.push('A dilution filing, an IDX query or a profit warning: they explain a drop instead of exaggerating it.');
    if (mk && mk.ok === false && act) mind.push(`The IHSG falling further below its 200-day average (${f0(mk.sma200)}).`);
    if (!mind.length) mind.push(`A sharp drop that pushes the oversold score to ${m.actScore}+ would put it on the bounce radar.`);
    // No-setup and watch angles: name what stands out for this stock, so two downtrends never read the same.
    if (!['live', 'wait', 'mom', 'susp'].includes(angle) && (BU[0] || BE[0])) sub += ` What stands out: ${BU[0] ? `<b class="up">${BU[0].s}</b> in its favour` : ''}${BU[0] && BE[0] ? ', ' : ''}${BE[0] ? `<b class="down">${BE[0].s}</b> against it` : ''}.`;
    return { inTrade, angle, stance, tone, kicker, short, title, sub, bull: BU, bear: BE, wB, wR, story, watch, mind, stop, tgtD, stopD, px };
  }

  // One line for list rows and cards.
  function thesisShort(p) { return thesisModel(p, OHLCR.get(p.ticker), true).short; }


  function tradeMapSvg(p, stop, px, stretch) {
    const bc = p.brokerCost && !p.brokerCost.none && !p.brokerCost.stale && p.brokerCost.cost > stop * 0.97 && p.brokerCost.cost < (stretch || p.target) * 1.03 ? p.brokerCost.cost : null;
    const pts = [['Wrong below', stop, 'var(--down)'], ['Now', px, 'var(--ink)'], ['Target', p.target, 'var(--up)']].concat(stretch ? [['Stretch', stretch, 'var(--up)']] : []).concat(bc ? [['Big buyers\' cost', bc, 'var(--accent)']] : []);
    const lo = Math.min(...pts.map(x => x[1])), hi = Math.max(...pts.map(x => x[1])), W = MQ.matches ? 340 : 600, L = MQ.matches ? 44 : 56, R = MQ.matches ? 44 : 56;
    const x = v => L + ((v - lo) / (hi - lo || 1)) * (W - L - R);
    const rel = v => (v / px - 1 >= 0 ? '+' : '') + ((v / px - 1) * 100).toFixed(1) + '%';
    // Two label rows (above / below the bar): each label takes the row where it does not run into the previous one.
    const wOf = l => (l[0].length + String(f0(l[1])).length + 1) * (MQ.matches ? 6.2 : 6.8), last = [-1e9, -1e9];
    const placed = pts.slice().sort((a, b) => a[1] - b[1]).map(l => { const cx = x(l[1]), half = wOf(l) / 2; const row = cx - half > last[0] + 6 ? 0 : cx - half > last[1] + 6 ? 1 : last[0] <= last[1] ? 0 : 1; last[row] = cx + half; return [...l, row]; });
    return `<svg class="tmap" viewBox="0 0 ${W} 80" role="img" aria-label="Trade map: stop ${f0(stop)}, now ${f0(px)}, target ${f0(p.target)}${stretch ? ', stretch ' + f0(stretch) : ''}">
      <rect x="${x(stop)}" y="34" width="${Math.max(0, x(px) - x(stop))}" height="8" rx="4" fill="var(--down)" opacity=".3"/>
      <rect x="${x(px)}" y="34" width="${Math.max(0, x(stretch || p.target) - x(px))}" height="8" rx="4" fill="var(--up)" opacity=".3"/>
      ${placed.map(([l, v, c, row]) => `<line x1="${x(v)}" x2="${x(v)}" y1="${row ? 34 : 26}" y2="${row ? 50 : 42}" stroke="${c}" stroke-width="${l === 'Now' ? 3 : 2}"/>
        <text x="${x(v)}" y="${row ? 63 : 20}" text-anchor="middle" fill="${c}" font-size="12" font-weight="650">${l} ${f0(v)}</text>
        ${l === 'Now' ? '' : `<text x="${x(v)}" y="${row ? 77 : 7}" text-anchor="middle" fill="var(--mute)" font-size="11">${rel(v)}</text>`}`).join('')}
    </svg>`;
  }


  function thesisHtml(p, j) {
    const m = DATA.meta, M = thesisModel(p, j), act = p.score >= m.actScore, H = m.params.horizon;
    const { px } = M, live = M.angle === 'live', planOn = live || M.angle === 'wait', T0 = M.inTrade;
    const stop = T0 ? T0.stop : M.stop;
    const stretch = p.targetMR && p.targetMR > p.target ? p.targetMR : null;
    const tot = M.wB + M.wR || 1, bPct = Math.round(M.wB / tot * 100);
    const pt = x => `<li><span class="ic">${x.ev === 'tested' ? '◆' : x.ev === 'near' ? '◇' : x.ev === 'fact' ? '•' : x.ev === 'failed' ? '·' : '○'}</span><div>${x.txt} <span class="ev ${x.ev}">${EVL[x.ev][0]}</span></div></li>`;
    const list = (a, n = 6) => (a.length ? `<ul>${a.slice(0, n).map(pt).join('')}</ul>${a.length > n ? `<details><summary class="muted">${a.length - n} more</summary><ul>${a.slice(n).map(pt).join('')}</ul></details>` : ''}` : '<div class="none">Nothing notable.</div>');
    const plan = T0 && live ? `<div class="th-block"><h4>The open trade</h4>
        <div class="plan">
          <div><small>Bought</small><b>${f0(T0.entry)}</b><span>open after ${esc(T0.d)}</span></div>
          <div><small>Target</small><b class="up">${f0(T0.tp)}</b><span>${sgnP(T0.tp / px - 1)} from here</span></div>
          <div><small>Stop</small><b class="down">${f0(T0.stop)}</b><span>${sgnP(T0.stop / px - 1)} from here</span></div>
          <div><small>Day</small><b>${T0.age} of ${H}</b><span class="${(T0.now || 0) >= 0 ? 'up' : 'down'}">${sgnP(T0.now || 0)} so far</span></div>
        </div>
        ${tradeMapSvg({ ...p, target: T0.tp, brokerCost: p.brokerCost }, T0.stop, px, null)}
        <p class="t-odds">One trade per stock at a time: today's ACT does not add a second position. Replayed with the live rule (${esc(j && j.liveFrom ? 'live ledger from ' + j.liveFrom : 'replay')}).</p>
      </div>` : planOn ? `<div class="th-block"><h4>The plan${live ? '' : ' (once triggered)'}</h4>
        <div class="plan">
          <div><small>Entry</small><b>${live ? f0(px) : 'next open'}</b><span>${live ? 'next open, approx.' : 'after a bounce candle'}</span></div>
          <div><small>Target</small><b class="up">${f0(p.target)}</b><span>${sgnP(M.tgtD)}${stretch ? `, maybe ${f0(stretch)}` : ''}</span></div>
          <div><small>Stop</small><b class="down">${f0(stop)}</b><span>${sgnP(M.stopD)}, 3.5 ATR or support</span></div>
          <div><small>Time</small><b>${H} sessions</b><span>about 3 weeks, then exit</span></div>
        </div>
        ${tradeMapSvg(p, stop, px, stretch)}
        ${act && p.tier !== 'SUSP' ? sizerHtml(p, stop, px) : ''}
        <p class="t-odds"><b>Honest odds:</b> over 10 years (2017-26) trades like this averaged about −0.3% after costs, and a permutation test put that inside random noise. Replayed over the past year: ${DATA.callStats && DATA.callStats.all ? `${Math.round(DATA.callStats.all.winRate * 100)}% winners, but an average loss ${(Math.abs(DATA.callStats.all.avgLoss) / DATA.callStats.all.avgWin).toFixed(1)}× the average win` : 'no edge either'}. ${DATA.payoff && DATA.payoff.confirm ? ` On ${DATA.payoff.confirm.stocks} stocks it was never built on, the same trade lost ${pctA(DATA.payoff.confirm.B.mean)} a trade (Track record, Reality check).` : ''} Paper-trade it; a stop-out here costs about ${pctA(M.stopD)}.</p>
      </div>` : '';
    const row = (ok, label, detail) => `<li class="${ok === true ? 'ok' : ok === false ? 'no' : ok === 'warn' ? 'wn' : 'na'}"><span>${ok === true ? '✓' : ok === false ? '✗' : ok === 'warn' ? '!' : '○'}</span><div><b>${label}</b> <span class="muted">${detail}</span></div></li>`;
    const tier = p.tier || (act ? 'ACT' : 'WATCH');
    const tech = `<details class="t-tech"><summary>Technical detail: what drives the badge</summary>
      <p class="muted">Oversold score ${p.score} (ACT at ${m.actScore}) = oversold ${p.parts.oversold} + support ${p.parts.support} + news ${p.parts.news}. RSI(14) ${p.rsi == null ? '–' : p.rsi.toFixed(0)}; ${p.dist20Atr.toFixed(1)} ATR from the 20-day average (${f0(p.sma20)}); ATR ${(p.atrPct * 100).toFixed(1)}% a day. Entry ${f0(p.entry)}, plan stop ${f0(p.stop)}, wide stop ${f0(p.wideStop)} (3.5 ATR), target ${f0(p.target)} (+${m.params.targetPct}%), support ${f0(p.support)}, resistance ${f0(p.resistance)}. Bounce candle = close above the previous high, or a green candle closing above the previous close.</p>
      <ul class="th-list">
        ${row(act, 'Oversold', `score ${p.score} vs ${m.actScore}`)}
        ${act ? row(p.confirm ? true : null, 'Bounce candle', p.confirm ? 'seen' : 'not yet') : ''}
        ${act ? row(!p.thin, 'Liquid', `Rp ${p.valueB.toFixed(1)} B a day (needs 5)`) : ''}
        ${act ? (p.untested ? row(false, 'Tested universe', 'no: one of the 400 added stocks, edge not confirmed') : row(tier !== 'SKIP', 'No NeoBDM veto', tier === 'SKIP' ? 'Pinky or illiquid' : 'clear')) : ''}
      </ul>
      <p class="muted">Everything else on this page is context: it was tested and did not add an edge, or has not been tested, and is labelled that way.</p></details>`;
    return `<div class="th-hero ${M.tone}">
        <div class="th-kicker"><span class="dot"></span>${esc(M.kicker)}<span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· ${esc(M.stance)}</span></div>
        <div class="th-title">${esc(M.title)}</div>
        <p class="th-sub">${M.sub}</p>
        <div class="balance"><div class="bar" role="img" aria-label="Weight of evidence: ${bPct}% for, ${100 - bPct}% against"><i class="b" style="flex:${M.wB || 0.001}"></i><i class="r" style="flex:${M.wR || 0.001}"></i></div>
          <div class="lbl"><span class="up">For · ${M.bull.length} point${M.bull.length === 1 ? '' : 's'}</span><span>weight of evidence, not a forecast</span><span class="down">${M.bear.length} against</span></div></div>
      </div>
      ${plan}
      <div class="th-cols">
        <div class="pts bull"><h4>▲ Why it could work</h4>${list(M.bull)}</div>
        <div class="pts bear"><h4>▼ What could go wrong</h4>${list(M.bear)}</div>
      </div>
      <div class="ev-key"><span>Evidence:</span><span class="ev tested">backed by test</span><span class="ev near">near miss</span><span class="ev fact">fact</span><span class="ev context">untested</span><span class="ev failed">test failed</span>${j ? '' : '<span>· loading this stock&#39;s call history…</span>'}</div>
      <div class="th-block"><h4>How we read ${esc(p.ticker)}</h4>${M.story.map(s => `<p>${s}</p>`).join('')}</div>
      <div class="th-cols">
        <div class="th-block" style="margin-top:12px"><h4>What we watch next</h4><ol class="watchlist">${M.watch.map(([a, b]) => `<li><span>${a}</span><span class="lvl">${b}</span></li>`).join('')}</ol></div>
        <div class="th-block" style="margin-top:12px"><h4>What would change our mind</h4><ol class="watchlist">${M.mind.map(a => `<li><span>${esc(a)}</span><span></span></li>`).join('')}</ol></div>
      </div>
      ${tech}`;
  }

  // Catalyst tab: a filings-first thesis in the style of @dojjunn (tools/dojjun-prompt.md). The site fills what its data
  // can answer (corporate-action filings, KSEI owners and control, quarterly results) and names what only reading the
  // filing can answer. A months-long fundamental thesis, NOT the 15-session bounce trade, and untested here.
  const CAT_Q = {
    material: ['Corporate action', 'Acquisition, asset sale or new business? Open the filing: what is bought or sold, for how much, and how is it paid (cash, debt, new shares)? For an acquisition, the Kombinasi Bisnis note later shows price vs net assets and the goodwill = the premium paid.'],
    dilution: ['Capital raise', 'Rights issue / warrants / private placement: price vs market, who is the standby buyer, does anyone convert claims (notes, loans) instead of paying cash, and what is the money for? If retail supplies the only real cash, that is a red flag.'],
    affiliate: ['Related-party deal', 'Who on the other side is related to the controller, and which way does the cash flow?'],
    ownership: ['Holder / insider trade', 'Is the controller or an insider buying or selling, and at what price? A change of control can mean a tender offer.'],
    egm: ['Shareholder meeting', 'Read the agenda: rights issue, asset deal, change of business or board?'],
    mgmt: ['Board change', 'New owner bringing in their people, or someone leaving before bad news?'],
    media: ['Reply to a media report', 'What rumour was the company forced to answer, and did it deny or confirm?'],
    idxQuery: ['IDX query on unusual trading', 'The exchange saw a move it could not explain: was there a catalyst nobody filed?'],
    dividend: ['Dividend', 'Paid from earnings or from a one-off sale?'],
    report: ['Financial report', 'Read the notes (catatan atas LK), not just profit: debt terms, business combinations, related parties.'],
  };
  // ---------- Valuation (Catalyst tab) ----------
  // Inputs: Yahoo annual results and the latest balance sheet (build-snapshot fundamentals.val), converted to rupiah
  // per share. Models: a 10-year free-cash-flow DCF (non-financials), justified P/B and P/E from ROE (all), and
  // sector-median P/E, P/B and EV/EBITDA across the 300 stocks. A model is skipped, with the reason, when its input
  // is missing or negative. The assumptions are editable on the page and stored in this browser only.
  const FIN = new Set(['Banking']);
  const VDEF = { r: 0.115, coe: 0.125, gT: 0.04, g1: null };
  let VOPT = (() => { try { return { ...VDEF, ...JSON.parse(LS.get('valopt') || '{}') }; } catch { return { ...VDEF }; } })();
  const med = a => { const b = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null; };
  function valBase(p) {
    const f = p.fundamentals, v = f && f.val;
    if (!v || !v.shares || !v.years || !v.years.length) return null;
    const Q = f.quarters || [], Y = v.years, last = Y[Y.length - 1];
    const usd = Math.abs((Q.length ? Q[Q.length - 1].equity : last.StockholdersEquity) || 0) < 2e10, fx = usd ? DATA.meta.usdIdr || null : 1;
    if (!fx) return null;
    const sh = v.shares, eqNow = (Q.length && Q[Q.length - 1].equity) || last.StockholdersEquity;
    const ni = f.niTtm != null ? f.niTtm : last.NetIncome;
    const fcfs = Y.map(y => (y.FreeCashFlow != null ? y.FreeCashFlow : y.OperatingCashFlow != null && y.CapitalExpenditure != null ? y.OperatingCashFlow + y.CapitalExpenditure : null)).filter(x => x != null);
    const roes = Y.slice(-3).filter(y => y.NetIncome != null && y.StockholdersEquity > 0).map(y => y.NetIncome / y.StockholdersEquity);
    const revs = Y.filter(y => y.TotalRevenue > 0), cagr = revs.length >= 3 ? Math.pow(revs[revs.length - 1].TotalRevenue / revs[0].TotalRevenue, 1 / (revs.length - 1)) - 1 : null;
    const ebitda = last.EBITDA != null ? last.EBITDA : null;
    return { usd, fx, sh, fin: FIN.has(p.sector), px: p.live ? p.live.price : p.close,
      eps: ni != null ? (ni * fx) / sh : null, bvps: eqNow ? (eqNow * fx) / sh : null,
      fcf: fcfs.length ? med(fcfs.slice(-3)) * fx : null, fcfAll: fcfs.map(x => x * fx), fcfNeg: fcfs.filter(x => x < 0).length,
      roe: roes.length ? roes.reduce((s, x) => s + x, 0) / roes.length : null, cagr,
      netDebt: v.debt != null || v.cash != null ? ((v.debt || 0) - (v.cash || 0)) * fx : null, ebitda: ebitda != null ? ebitda * fx : null, years: Y.length, lastY: last.y };
  }
  // Sector medians of the multiples, once per data load.
  let PEER = null, PEER_AT = null;
  function peers() {
    if (PEER && PEER_AT === DATA.meta.generatedAt) return PEER;
    const by = {};
    for (const q of DATA.picks) {
      const b = valBase(q); if (!b) continue;
      const mc = b.px * b.sh, x = (by[q.sector] = by[q.sector] || { pe: [], pb: [], ev: [] });
      if (b.eps > 0) { const pe = b.px / b.eps; if (pe < 80) x.pe.push(pe); }
      if (b.bvps > 0) { const pb = b.px / b.bvps; if (pb < 30) x.pb.push(pb); }
      if (!b.fin && b.ebitda > 0 && b.netDebt != null) { const ev = (mc + b.netDebt) / b.ebitda; if (ev > 0 && ev < 60) x.ev.push(ev); }
    }
    const all = { pe: Object.values(by).flatMap(x => x.pe), pb: Object.values(by).flatMap(x => x.pb), ev: Object.values(by).flatMap(x => x.ev) };
    PEER = {}; for (const [s, x] of Object.entries(by)) PEER[s] = { pe: x.pe.length >= 4 ? med(x.pe) : med(all.pe), pb: x.pb.length >= 4 ? med(x.pb) : med(all.pb), ev: x.ev.length >= 4 ? med(x.ev) : med(all.ev), n: x.pe.length, wide: x.pe.length < 4 };
    PEER_AT = DATA.meta.generatedAt;
    return PEER;
  }
  // 10-year DCF: growth g1 for years 1-5, fading in a straight line to gT by year 10, terminal value at gT.
  function dcfPrice(b, r, gT, g1) {
    if (!(b.fcf > 0) || r <= gT) return null;
    let cf = b.fcf, pv = 0;
    for (let t = 1; t <= 10; t++) { const g = t <= 5 ? g1 : g1 + (gT - g1) * (t - 5) / 5; cf *= 1 + g; pv += cf / Math.pow(1 + r, t); }
    const tv = (cf * (1 + gT)) / (r - gT) / Math.pow(1 + r, 10);
    return (pv + tv - (b.netDebt || 0)) / b.sh;
  }
  const g1Of = b => (VOPT.g1 != null ? VOPT.g1 : b.cagr == null ? 0.05 : Math.max(0, Math.min(0.15, b.cagr)));
  function valModels(p) {
    const b = valBase(p); if (!b) return null;
    const P = peers()[p.sector] || {}, { r, coe, gT } = VOPT, g1 = g1Of(b), out = [];
    const add = (k, name, v, how, why) => out.push({ k, name, v: v != null && isFinite(v) && v > 0 ? v : null, how, why });
    if (b.fin) add('dcf', 'DCF (free cash flow)', null, '', 'not used for banks: their cash flow is deposits and loans, not free cash');
    else add('dcf', 'DCF (free cash flow)', dcfPrice(b, r, gT, g1), `FCF ${rpS(b.fcf)} (median of the last 3 years), ${pctS(g1)} growth for 5 years fading to ${pctS(gT)}, discounted at ${pctS(r)}, minus net debt ${rpS(b.netDebt || 0)}`, b.fcf == null ? 'no cash-flow data' : b.fcf <= 0 ? 'free cash flow is negative: a DCF cannot value it' : '');
    const pbJ = b.roe != null && b.roe > gT ? (b.roe - gT) / (coe - gT) : null;
    add('pbj', 'Justified P/B (ROE)', pbJ && b.bvps > 0 ? pbJ * b.bvps : null, pbJ ? `ROE ${pctS(b.roe)} (3-year average) vs cost of equity ${pctS(coe)}: fair P/B ${pbJ.toFixed(2)}× book ${f0(b.bvps)}` : '', b.roe == null ? 'no ROE' : b.roe <= gT ? `ROE ${pctS(b.roe)} is below growth: it destroys value at book` : '');
    const peJ = b.roe != null && b.roe > gT ? ((1 - gT / b.roe) * (1 + gT)) / (coe - gT) : null;
    add('pej', 'Justified P/E (ROE)', peJ && b.eps > 0 ? peJ * b.eps : null, peJ ? `fair P/E ${peJ.toFixed(1)}× (pays out ${pctS(1 - gT / b.roe)} to grow ${pctS(gT)}) × EPS ${f0(b.eps)}` : '', b.eps <= 0 ? 'loss-making: no P/E' : '');
    add('pe', 'Sector P/E', P.pe && b.eps > 0 ? P.pe * b.eps : null, P.pe ? `${p.sector}${P.wide ? ' (few peers: all stocks used)' : ''} median ${P.pe.toFixed(1)}× × EPS ${f0(b.eps)}` : '', b.eps <= 0 ? 'loss-making: no P/E' : '');
    add('pb', 'Sector P/B', P.pb && b.bvps > 0 ? P.pb * b.bvps : null, P.pb ? `median ${P.pb.toFixed(2)}× × book ${f0(b.bvps)}` : '', '');
    if (!b.fin) add('ev', 'Sector EV/EBITDA', P.ev && b.ebitda > 0 && b.netDebt != null ? (P.ev * b.ebitda - b.netDebt) / b.sh : null, P.ev && b.ebitda ? `median ${P.ev.toFixed(1)}× × EBITDA ${rpS(b.ebitda)}, minus net debt` : '', !(b.ebitda > 0) ? 'no positive EBITDA' : '');
    const vals = out.filter(m => m.v).map(m => m.v), mid = med(vals);
    // Reverse DCF: the 5-year growth the price already assumes (bisection).
    let implied = null;
    if (!b.fin && b.fcf > 0) { let lo = -0.3, hi = 0.6; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, v = dcfPrice(b, r, gT, m); if (v == null) break; if (v > b.px) hi = m; else lo = m; } implied = (lo + hi) / 2; if (implied > 0.59 || implied < -0.29) implied = implied > 0 ? Infinity : -Infinity; }
    return { b, models: out, mid, lo: vals.length ? Math.min(...vals) : null, hi: vals.length ? Math.max(...vals) : null, implied, g1 };
  }
  const pctS = x => (x == null ? '–' : (x * 100).toFixed(1) + '%');
  const rpS = x => { if (x == null) return '–'; const a = Math.abs(x), s = x < 0 ? '−' : ''; return s + (a >= 1e12 ? 'Rp ' + (a / 1e12).toFixed(2) + ' T' : 'Rp ' + (a / 1e9).toFixed(1) + ' B'); };
  function valuationHtml(p) {
    const V = valModels(p);
    if (!V) return `<div class="sp-sec"><h3>Valuation: what is it worth?</h3><p class="muted">No share count or annual results for this stock in the data yet (Yahoo), so no model can run. It fills in on a later rebuild if Yahoo adds it.</p></div>`;
    const { b, models, mid } = V, px = b.px, up = mid ? mid / px - 1 : null;
    const lo = Math.min(px, ...models.filter(m => m.v).map(m => m.v)) * 0.9, hi = Math.max(px, ...models.filter(m => m.v).map(m => m.v)) * 1.05;
    const W = 100, X = v => ((v - lo) / (hi - lo)) * W;
    const bar = m => m.v ? `<div class="vrow"><span>${esc(m.name)}</span><div class="vtrack"><i class="vnow" style="left:${X(px)}%"></i><b class="vdot ${m.v >= px ? 'up' : 'down'}" style="left:${X(m.v)}%"></b></div><span class="n"><b>${f0(m.v)}</b> <span class="${m.v >= px ? 'up' : 'down'}">${m.v >= px ? '+' : ''}${((m.v / px - 1) * 100).toFixed(0)}%</span></span></div>`
      : `<div class="vrow off"><span>${esc(m.name)}</span><div class="muted" style="font-size:12px">${esc(m.why || 'not available')}</div><span></span></div>`;
    const sens = !b.fin && b.fcf > 0 ? (() => { const rs = [-0.02, -0.01, 0, 0.01, 0.02].map(d => VOPT.r + d), gs = [0.03, 0.04, 0.05];
      return `<details><summary class="muted">DCF sensitivity: discount rate × terminal growth</summary><div class="scroll"><table><thead><tr><th>Terminal growth \\ discount</th>${rs.map(r => `<th class="n">${pctS(r)}</th>`).join('')}</tr></thead><tbody>${gs.map(g => `<tr><td>${pctS(g)}</td>${rs.map(r => { const v = dcfPrice(b, r, g, V.g1); return `<td class="n ${v && v >= px ? 'up' : 'down'}">${v ? f0(v) : '–'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></details>`; })() : '';
    const imp = V.implied == null ? '' : !isFinite(V.implied) ? (V.implied > 0 ? 'The price assumes more than 60% a year of cash-flow growth: far beyond what the DCF can justify.' : 'Even shrinking cash flow would justify today\'s price: the DCF sees it as cheap.') : `<b>What the price already assumes:</b> free cash flow growing <b>${pctS(V.implied)} a year</b> for 5 years (then fading to ${pctS(VOPT.gT)}), at a ${pctS(VOPT.r)} discount rate. ${b.cagr != null ? `Revenue grew ${pctS(b.cagr)} a year over the last ${b.years - 1} years. ` : ''}${b.cagr != null ? (V.implied > b.cagr + 0.05 ? 'The market expects a lot more than the past: it needs the catalyst to deliver.' : V.implied < b.cagr - 0.05 ? 'The market expects less than the past: if the business just keeps going, there is room.' : 'Roughly in line with the past.') : ''}`;
    const inp = (k, l, v) => `<label class="vin"><span>${l}</span><input type="number" step="0.5" data-vopt="${k}" value="${v == null ? '' : (v * 100).toFixed(1)}" placeholder="auto"><i>%</i></label>`;
    const warn = [b.usd ? `Reported in US$, converted at Rp ${f0(DATA.meta.usdIdr)} per US$.` : '', b.fcfNeg ? `Free cash flow was negative in ${b.fcfNeg} of the last ${b.fcfAll.length} years: the DCF is fragile.` : '', b.eps <= 0 ? 'Loss-making over the last 12 months: earnings models do not apply.' : '', b.years < 3 ? 'Fewer than 3 years of results.' : ''].filter(Boolean);
    return `<div class="sp-sec"><h3>Valuation: what is it worth? <span class="ev context">model, untested</span></h3>
      <div class="kv">
        <div><small>Central estimate</small><b class="${up >= 0 ? 'up' : 'down'}">${mid ? f0(mid) : '–'}</b><div class="muted">median of ${models.filter(m => m.v).length} models</div></div>
        <div><small>Upside / downside</small><b class="${up >= 0 ? 'up' : 'down'}">${up == null ? '–' : (up >= 0 ? '+' : '') + (up * 100).toFixed(0) + '%'}</b><div class="muted">vs ${f0(px)} now</div></div>
        <div><small>Model range</small><b>${V.lo ? f0(V.lo) + ' – ' + f0(V.hi) : '–'}</b><div class="muted">${V.lo && V.hi / V.lo > 2.5 ? 'very wide: the models disagree' : 'lowest to highest'}</div></div>
        <div><small>Today's multiples</small><b>${b.eps > 0 ? (px / b.eps).toFixed(1) + '× P/E' : 'no P/E'}</b><div class="muted">${b.bvps > 0 ? (px / b.bvps).toFixed(2) + '× book' : ''}${b.roe != null ? ` · ROE ${pctS(b.roe)}` : ''}</div></div>
      </div>
      <div class="vfield">${models.map(bar).join('')}<div class="vrow"><span></span><div class="muted" style="font-size:11px;position:relative;height:14px"><span style="position:absolute;left:${X(px)}%;transform:translateX(-50%)">▲ now ${f0(px)}</span></div><span></span></div></div>
      <p>${imp}</p>
      <details><summary class="muted">How each number is built</summary><ul class="hl-list">${models.filter(m => m.v).map(m => `<li><span class="tag">${esc(m.name)}</span><span>${esc(m.how)}</span></li>`).join('')}</ul></details>
      ${sens}
      <div class="vins">${inp('r', 'Discount rate (DCF)', VOPT.r)}${inp('coe', 'Cost of equity', VOPT.coe)}${inp('gT', 'Long-run growth', VOPT.gT)}${inp('g1', 'Growth, years 1–5', VOPT.g1 ?? null)}<button class="chip" data-vreset>Reset</button></div>
      <p class="muted">${warn.map(esc).join(' ')} Defaults: discount rate 11.5% (Indonesian 10-year bond ≈ 6.5% plus an equity premium), cost of equity 12.5%, long-run growth 4% (below nominal GDP), growth for years 1–5 = the last ${b.years - 1} years' revenue growth, kept between 0% and 15% (now ${pctS(V.g1)}). Data: Yahoo annual results to ${esc(b.lastY)}; the catalyst is <b>not</b> in these numbers: if the filings above change earnings, change the growth input. Sector medians ignore quality: a premium franchise (a top bank, a market leader) looks expensive against them, a weak one cheap. A model is a way to ask what the price assumes, not a target. Untested here.</p></div>`;
  }

  function catFacts(p) {
    const o = p.ownership, f = p.fundamentals, Q = (f && f.quarters) || [], cats = (p.filings || []).filter(x => CAT_Q[x[1]]);
    const ctrl = o && o.holders && o.holders[0], free = o && o.listedPct != null ? Math.max(0, 100 - o.listedPct) : null;
    const eq0 = Q.length > 1 ? Q[0].equity : null, eq1 = Q.length ? Q[Q.length - 1].equity : null, eqChg = eq0 && eq1 ? eq1 / eq0 - 1 : null;
    const rev0 = Q.length > 4 ? Q[Q.length - 5].rev : null, rev1 = Q.length ? Q[Q.length - 1].rev : null, revYoY = rev0 && rev1 ? rev1 / rev0 - 1 : null;
    const qs = [];
    const has = k => cats.some(x => x[1] === k);
    if (f && f.niTtm < 0 && (has('material') || has('dilution'))) qs.push('It is losing money and doing a corporate action at the same time: what does management see that the trailing numbers do not show, and how is the deal funded?');
    if (has('material') && eqChg != null && eqChg < -0.15) qs.push(`Equity fell ${Math.round(-eqChg * 100)}% over the quarters shown: is the deal funded by debt, and how is that debt serviced?`);
    if (has('dilution')) qs.push('After the raise, how do the ownership percentages shift, and who ends up funding the asset?');
    if (ctrl && ctrl.pct >= 50 && free != null && free < 25) qs.push(`One holder owns ${ctrl.pct.toFixed(0)}% and at most ${free.toFixed(0)}% trades freely: how much of any price move is real demand versus a thin float that is easy to push?`);
    if (has('affiliate')) qs.push('Does the related-party deal move value toward the controller or toward the listed company?');
    if (has('ownership') || has('mgmt')) qs.push('Is control changing hands? A new controller usually has a plan for the company: what is it?');
    if (f && f.niTtm > 0 && revYoY != null && revYoY > 0.3) qs.push(`Revenue is up ${Math.round(revYoY * 100)}% on a year ago: is that one contract or a lasting step up?`);
    if (!qs.length) qs.push('Why would the price re-rate in the next 6-12 months? Without a named catalyst, there is no thesis in this method.');
    return { o, f, Q, cats, ctrl, free, eqChg, revYoY, qs };
  }
  // What the filings say (data/filing-digest.json, read by Claude from the IDX PDFs): the big story first, then every
  // read filing ranked by how much it matters.
  const IMP = { 3: ['BIG', 'down'], 2: ['Notable', 'warn'], 1: ['Minor', 'mute'], 0: ['Routine', 'mute'] };
  const DIRS = { up: ['▲ good for holders', 'up'], down: ['▼ bad for holders', 'down'], mixed: ['◆ mixed', 'warn'], '?': ['? unclear', 'mute'] };
  const bigOf = p => (p.digest && p.digest.items ? p.digest.items.filter(x => x.impact >= 3 && x.d >= new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10)) : []);
  function digestItemHtml(x) {
    const im = IMP[x.impact] || IMP[0], dr = DIRS[x.dir] || DIRS['?'];
    return `<li class="dg dg${x.impact}"><div class="dg-top"><span class="tag ${im[1] === 'down' ? 'RISK' : ''}">${im[0]}</span> <span class="${dr[1]}" style="font-size:12px;font-weight:650">${dr[0]}</span> <span class="muted">${esc(x.d.slice(0, 10))}</span></div>
      <b class="dg-h">${esc(x.head)}</b>
      ${x.what ? `<div><b>What's new:</b> ${esc(x.what)}</div>` : ''}${x.size ? `<div><b>How big:</b> ${esc(x.size)}</div>` : ''}${x.why ? `<div><b>Why it could matter:</b> ${esc(x.why)}</div>` : ''}${x.watch ? `<div><b>Watch:</b> ${esc(x.watch)}</div>` : ''}
      <div class="muted">${x.url ? `<a href="${safeUrl(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>` : esc(x.title)}</div></li>`;
  }
  function digestHtml(p) {
    const D = p.digest, its = D && D.items ? D.items.slice().sort((a, b) => b.impact - a.impact || b.d.localeCompare(a.d)) : [];
    const shown = its.filter(x => x.impact >= 1), routine = its.filter(x => x.impact < 1);
    if (!D) return `<div class="sp-sec"><h3>What's going on</h3><p class="muted">No filing of ${esc(p.ticker)} has been read yet${DATA.meta.digestAsOf ? ` (filings read up to ${esc(DATA.meta.digestAsOf)})` : ''}. Either it filed nothing beyond routine reports in the last 60 days, or it is in the next reading batch.</p></div>`;
    return `<div class="sp-sec dg-box"><h3>What's going on</h3>
      ${D.story ? `<p class="dg-story">${esc(D.story.text)}</p><p class="muted" style="margin-top:-4px">From the filings read up to ${esc(D.story.at)}.</p>` : ''}
      ${shown.length ? `<ul class="dg-list">${shown.map(digestItemHtml).join('')}</ul>` : '<p>Nothing beyond routine filings in the last 120 days.</p>'}
      ${routine.length ? `<details><summary class="muted">${routine.length} routine filing${routine.length === 1 ? '' : 's'} read, nothing new</summary><ul class="hl-list">${routine.map(x => `<li><span class="muted">${esc(x.d.slice(0, 10))}</span><span>${esc(x.head)}</span></li>`).join('')}</ul></details>` : ''}
      <p class="muted">Each filing's PDF is read from IDX and summarised by Claude: what is new, how big it is against the company, and what it could trigger. "Good / bad for holders" is a first read, not a forecast. Check the original (link) before acting.</p></div>`;
  }
  function catalystHtml(p) {
    const C = catFacts(p), { o, f, Q, cats, ctrl, free } = C, px = p.live ? p.live.price : p.close;
    // Results come in full units of the report currency: rupiah, or US$ for some miners and energy names (TOBA, ADRO,
    // CUAN...). No liquid rupiah issuer has equity under Rp 20 B, and no dollar one has more than $20 B, so equity tells.
    const usd = Q.length && Math.abs(Q[Q.length - 1].equity || 0) < 2e10;
    const rp = x => { if (x == null) return '–'; const a = Math.abs(x), s = x < 0 ? '−' : '';
      return s + (usd ? (a >= 1e9 ? '$' + (a / 1e9).toFixed(2) + ' B' : '$' + (a / 1e6).toFixed(1) + ' M') : a >= 1e12 ? 'Rp ' + (a / 1e12).toFixed(2) + ' T' : 'Rp ' + (a / 1e9).toFixed(1) + ' B'); };
    const ck = (ok, txt, how) => `<li><span class="ic ${ok ? 'up' : 'mute'}">${ok ? '✓' : '☐'}</span><div>${txt}${how ? ` <span class="muted">${how}</span>` : ''}</div></li>`;
    const riskBits = [];
    if (ctrl && ctrl.pct >= 50) riskBits.push(`controlled (${ctrl.pct.toFixed(0)}% by one holder)`);
    if (free != null && free < 25) riskBits.push(`thin float (at most ${free.toFixed(0)}% outside the ≥1% holders)`);
    if (p.thin) riskBits.push('trades under Rp 5 B a day: hard to exit');
    if ((p.filings || []).some(x => x[1] === 'idxQuery')) riskBits.push('IDX has queried unusual trading');
    return `${digestHtml(p)}
      ${valuationHtml(p)}
      <div class="sp-sec"><h3>Filing types in the last 45 days, and what to ask</h3>
        ${cats.length ? `<ul class="hl-list">${cats.map(x => `<li><span class="tag ${x[1] === 'dilution' || x[1] === 'idxQuery' ? 'RISK' : ''}">${esc(CAT_Q[x[1]][0])}</span><span>${x[4] ? `<a href="${safeUrl(x[4])}" target="_blank" rel="noopener noreferrer">${esc(x[3])}</a>` : esc(x[3])}<div class="muted">${esc(x[0])} · <b>Ask:</b> ${esc(CAT_Q[x[1]][1])}</div></span></li>`).join('')}</ul>` : '<p>No corporate-action filing in the last 45 days. This method starts from one, so there is <b>no catalyst thesis</b> for this stock right now. That is a valid answer.</p>'}
        <p class="muted">Full filings: <a href="https://www.idx.co.id/id/perusahaan-tercatat/keterbukaan-informasi/" target="_blank" rel="noopener noreferrer">IDX Keterbukaan Informasi</a> (search ${esc(p.ticker)}).</p></div>
      <div class="sp-sec"><h3>Who controls it, who pays</h3>
        ${o && o.holders ? `<div class="kv">
          <div><small>Controller</small><b>${esc(ctrl ? ctrl.name : '–')}</b><div class="muted">${ctrl ? `${ctrl.pct.toFixed(2)}%${ctrl.foreign ? ' · foreign' : ''}${ctrl.domicile ? ' · ' + esc(ctrl.domicile) : ''}` : ''}</div></div>
          <div><small>Top 3 holders</small><b>${o.top3Pct != null ? o.top3Pct.toFixed(1) + '%' : '–'}</b><div class="muted">${o.count} holders own ≥1%</div></div>
          <div><small>Free float (upper bound)</small><b>${free != null ? free.toFixed(1) + '%' : '–'}</b><div class="muted">outside the ≥1% holders (KSEI)</div></div>
          <div><small>Foreign holders</small><b>${o.foreignPct != null ? o.foreignPct.toFixed(1) + '%' : '–'}</b><div class="muted">${p.group ? 'group: ' + esc(p.group.name) : 'no conglomerate group'}</div></div>
        </div>
        <div class="scroll"><table><thead><tr><th>Holder (≥1%)</th><th>Type</th><th class="n">%</th></tr></thead><tbody>${o.holders.slice(0, 8).map(h => `<tr><td>${esc(h.name)}</td><td>${h.type === 'CP' ? 'company' : h.type === 'ID' ? 'individual' : esc(h.type || '')}${h.foreign ? ' · foreign' : ''}</td><td class="n">${h.pct.toFixed(2)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No KSEI ownership data for this stock.</p>'}</div>
      <div class="sp-sec"><h3>Earnings: what the catalyst has to change</h3>
        ${Q.length ? `<div class="scroll"><table><thead><tr><th>Quarter</th><th class="n">Revenue</th><th class="n">Net profit</th><th class="n">Equity</th></tr></thead><tbody>${Q.slice(-5).reverse().map(q => `<tr><td>${esc(q.date)}</td><td class="n">${rp(q.rev)}</td><td class="n ${q.ni < 0 ? 'down' : ''}">${rp(q.ni)}</td><td class="n">${rp(q.equity)}</td></tr>`).join('')}</tbody></table></div>
        <p>Last 12 months' profit: <b class="${f.niTtm < 0 ? 'down' : 'up'}">${rp(f.niTtm)}</b>${f.margin != null ? `, net margin ${(f.margin * 100).toFixed(1)}%` : ''}.${(f.flags || []).length ? ' ' + f.flags.map(esc).join('; ') + '.' : ''}</p>
        <p class="muted">${usd ? 'Reported in US$. ' : ''} Simple valuation: PE = market cap ÷ the profit you expect after the catalyst, or EV/EBITDA for asset-heavy and mining names. The share count is not in the site's data, so take market cap from Stockbit (price now ${f0(px)}).</p>` : '<p class="muted">No quarterly results in the data.</p>'}</div>
      <div class="sp-sec"><h3>Second-level questions</h3><ol class="watchlist">${C.qs.map(q => `<li><span>${esc(q)}</span><span></span></li>`).join('')}</ol></div>
      <div class="sp-sec"><h3>Risks</h3><p>${riskBits.length ? 'Structure: ' + riskBits.map(esc).join('; ') + '. Concentrated ownership makes a stock easy to push up and hard to sell: size it small and expect "sell on news".' : 'No structural red flag in the data (control, float, liquidity, IDX queries). Still check debt terms and sell-on-news risk.'}</p></div>
      <div class="sp-sec"><h3>Checklist</h3><ul class="ck">
        ${ck(cats.length, 'Start from a filing, not a screener', cats.length ? `${cats.length} found above` : 'none in 45 days')}
        ${ck(false, 'Name the 1-2 measurable catalysts', 'needs the filing: how big, by when')}
        ${ck(!!ctrl, 'Snapshot: controller %, free float', ctrl ? 'filled from KSEI' : '')}
        ${ck(false, 'Trace who puts in real cash vs who converts claims', 'prospectus / rights-issue terms')}
        ${ck(false, 'For an acquisition: price vs net assets, goodwill', 'Kombinasi Bisnis note in the LK')}
        ${ck(C.qs.length > 0, 'Ask why management is doing this, and how the debt is serviced', 'questions above')}
        ${ck(false, 'One simple multiple, target price, upside %', 'needs market cap and your earnings estimate')}
        ${ck(riskBits.length > 0 || !!o, 'Overlay risks: concentration, liquidity, pump risk, sell-on-news', '')}
        ${ck(false, 'Make a clear call, then DYOR', '')}</ul></div>
      <div class="sp-sec"><h3>Let Claude read the filings</h3>
        <p class="muted">Copies a short research brief with this stock's facts already filled in. Paste it into Claude (with web search on) and it returns the thesis in the format above. Check every number it gives you against the filing.</p>
        <button class="chip" data-copy-prompt>Copy research brief for ${esc(p.ticker)}</button>
        <textarea id="catPrompt" hidden readonly rows="10" style="width:100%;margin-top:8px">${esc(catalystPrompt(p))}</textarea></div>`;
  }
  // The condensed instruction (tools/dojjun-prompt.md) with this stock's facts appended.
  function catalystPrompt(p) {
    const C = catFacts(p), { o, f, cats, ctrl, free } = C, px = p.live ? p.live.price : p.close;
    return [
      `Build a catalyst thesis for IDX:${p.ticker} (${p.name}, ${p.sector}), price ${px}, data as of ${DATA.meta.asOf}.`,
      '',
      'METHOD (filings first, no screening):',
      '1. Read primary sources: IDX Keterbukaan Informasi (last 6 months), the latest Laporan Keuangan incl. notes, any prospectus / HMETD / warrant terms, RKAB if mining. Prefer them over news and broker research.',
      '2. Find the 1-2 catalysts that can move earnings or cash flow in 6-12 months (corporate action, acquisition, asset sale, capacity / RKAB change, contract, change of control). Quantify each.',
      '3. Map control and capital: controller and %, free float, who supplies real cash vs who converts notes, loans or related-party assets, and how ownership shifts after any raise.',
      '4. For an acquisition: price paid vs net assets acquired, goodwill (Kombinasi Bisnis note), how it is funded and how the debt is serviced.',
      '5. Second-level questions: why is management doing this now, what does it say about their conviction, what would make it fail?',
      '6. Value it with ONE simple multiple (PE or EV/EBITDA on next year\'s estimate). Give target price and upside %, and the multiple peers trade at.',
      '7. Risks: concentration / pump risk, liquidity, dilution, debt, sell-on-news, related parties.',
      '',
      'OUTPUT (max 300 words): Title (one punchy line) / Catalysts (1-2, measurable) / Snapshot (sector, market cap, controller %, free float) / Valuation (multiple, TP, upside %) / Call (BUY, HOLD or NO THESIS) / Supporting facts / Risks / Open questions. Cite the filing (title + date) for every number. If no catalyst is found, answer NO THESIS and say why. Do not invent numbers: write "not found" instead. End with DYOR.',
      '',
      'FACTS ALREADY KNOWN (from the screener; verify):',
      ctrl ? `- Controller: ${ctrl.name} ${ctrl.pct}%${ctrl.foreign ? ' (foreign)' : ''}; top 3 hold ${o.top3Pct}%; free float at most ${free != null ? free.toFixed(1) : '?'}% (KSEI, holders >=1%).` : '- Ownership: not in the data.',
      p.group ? `- Conglomerate group: ${p.group.name}.` : '',
      f ? `- Last 12 months net profit ${f.niTtm} (full units, report currency); margin ${f.margin != null ? (f.margin * 100).toFixed(1) + '%' : '?'}; ${(f.flags || []).join('; ')}` : '',
      cats.length ? '- Recent filings: ' + cats.map(x => `${x[0]} ${CAT_Q[x[1]][0]}: ${x[3]}`).join(' | ') : '- No corporate-action filing in the last 45 days in the screener data: check older ones.',
      '- Questions to answer: ' + C.qs.join(' '),
    ].filter(Boolean).join('\n');
  }

  // Bandarmology tab: who trades it, at what cost, and what the flow tools say.
  function flowSubHtml(p, j) {
    const sec = (t, h) => `<div class="sp-sec"><h3>${t}</h3>${h}</div>`;
    return sec('Who moves it: foreign or retail?', whoHtml(p)) + sec('Who is buying, and at what cost', brokerCostHtml(p)) + sec('NeoBDM broker flow', nbHtml(p))
      + sec('Bandarmetrics', bmHtml(p)) + sec('Sideways base → accumulation → breakout?', baseHtml(p)) + sec('Volume peaks: the last spikes (4× usual volume)', spikesHtml(j));
  }
  // Key stats tab: levels, score parts, earnings and owners.
  function fundSubHtml(p) {
    const m = DATA.meta, parts = p.parts, max = { oversold: 80, support: 10, news: 10 }, act = p.score >= m.actScore;
    return `<div class="sp-sec"><h3>Levels and trade numbers</h3><div class="kv">
        <div><small>Entry (last close)</small><b>${f0(p.entry)}</b></div><div><small>Stop${act && p.wideStop ? ' (wide, 3.5 ATR)' : ''}</small><b class="down">${f0(act && p.wideStop ? p.wideStop : p.stop)}</b>${act && p.wideStop && p.wideStop !== p.stop ? `<div class="muted">plan stop ${f0(p.stop)}</div>` : ''}</div><div><small>Target +${m.params.targetPct}%</small><b class="up">${f0(p.target)}</b></div>
        <div><small>Bounce target (MA20)</small><b>${f0(p.targetMR)}</b></div><div><small>${p.supportTouches ? 'Support (' + p.supportTouches + '×)' : 'Support (52w low)'}</small><b>${f0(p.support)}</b></div><div><small>${p.resistanceTouches ? 'Resistance (' + p.resistanceTouches + '×)' : 'Resistance (52w high)'}</small><b>${f0(p.resistance)}</b></div>
        <div><small>MA20 · MA50</small><b>${f0(p.sma20)} · ${f0(p.sma50)}</b></div><div><small>MA200</small><b>${f0(p.sma200)}</b></div><div><small>Reward / risk (plan stop)</small><b>${p.rr == null ? '–' : p.rr.toFixed(1)}</b></div>
        <div><small>Own hit rate*</small><b>${p.hitRate == null ? '–' : Math.round(p.hitRate * 100) + '%'}</b></div><div><small>Value / day</small><b>Rp ${p.valueB.toFixed(0)} B</b></div><div><small>Volume vs 20d</small><b>${p.volRatio == null ? '–' : p.volRatio.toFixed(1) + '×'}</b></div></div>
        <div class="parts">${Object.keys(parts).map(k => `<div class="part"><span>${esc(k)}</span><div class="bar"><i style="width:${Math.min(100, (parts[k] / (max[k] || 10)) * 100)}%"></i></div><em>${parts[k]}</em></div>`).join('')}</div>
        <p class="muted">Oversold score parts: oversold-ness (RSI, 5-day drop, distance under the 20-day average) is the main driver; support proximity and news are secondary. *How often this stock hit +${m.params.targetPct}% before the stop within ${m.params.horizon}d in its own last year (n=${p.hitN}); informational only.</p>
        <div class="narr">${esc(p.narrative)}</div></div>
      <div class="sp-sec"><h3>Earnings (P&amp;L)</h3>${fundHtml(p.fundamentals)}</div>
      <div class="sp-sec"><h3>Who owns it</h3>${ownHtml(p.ownership)}</div>`;
  }
  function newsSubHtml(p) {
    return `<div class="sp-sec"><h3>Company filings (IDX, last 45 days)</h3>
        ${(p.filings || []).length ? `<ul class="hl-list">${p.filings.map(x => `<li><span class="tag ${x[1] === 'dilution' || x[1] === 'idxQuery' ? 'RISK' : ''}">${esc(x[2])}</span><span>${x[4] ? `<a href="${safeUrl(x[4])}" target="_blank" rel="noopener noreferrer">${esc(x[3])}</a>` : esc(x[3])}<div class="muted">${esc(x[0])}</div></span></li>`).join('')}</ul>` : '<p class="muted">No meaningful filings in the last 45 days.</p>'}
        <p class="muted">Straight from the exchange, usually before the news sites. Routine filings are left out. Tested over 2023-26: no filing type changed how oversold bounces went, so filings are context.</p></div>
      <div class="sp-sec"><h3>News, last 7 days</h3>
        ${p.headlines.length ? `<ul class="hl-list">${p.headlines.map(h => `<li><span class="tag ${esc(h.category)}">${esc(h.category)}</span><span><a href="${safeUrl(h.link)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}</a><div class="muted">${ago(h.published)} · ${!h.direct ? 'sector backdrop, not scored' : h.recap ? 'price recap, not scored' : 'about this stock · ' + (h.sentiment > 0 ? 'supports' : h.sentiment < 0 ? 'risk' : 'neutral')}</div></span></li>`).join('')}</ul>` : '<p class="muted">No scored headlines in the last 7 days.</p>'}
        <button class="chip" data-news="${esc(p.ticker)}">All 30-day headlines for ${esc(p.ticker)} →</button></div>`;
  }


  // ---------- news ----------
  let KNOWN = new Set(), ARCH = null, ARCH_LOADING = false, NEWSPERIOD = '7d', NEWSLIMIT = 120;
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
    KNOWN = new Set(DATA.picks.map(p => p.ticker));
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
    el.innerHTML = `<div class="ph-head"><div><h1>News radar</h1><p>Every headline about the 500 stocks, classified by type and direction.</p></div></div>
      ${coverageHtml(DATA.meta.newsCoverage)}
      <div class="chips" style="margin-top:12px">${periods.map(([v, l]) => `<button class="chip" data-p="${v}" aria-pressed="${NEWSPERIOD === v}">${l}</button>`).join('')}</div>
      <div class="chips">${cats.map(c => `<button class="chip" data-c="${c}" aria-pressed="${NEWSCAT === c}">${c === 'ALL' ? 'All' : c.replace('_', ' ')}</button>`).join('')}</div>
      <div class="chips"><input type="search" id="nq" placeholder="Filter by ticker or word" value="${esc(NEWSQ)}" style="max-width:280px">
        <label class="muted"><input type="checkbox" id="hw" ${HIDEWRAP ? 'checked' : ''}> hide market wraps</label></div>
      <div class="card">${loading ? '<div class="empty">Loading the 30-day archive…</div>' : shown.length ? shown.map(n => `<div class="nrow">
        <div class="muted">${NEWSPERIOD === '30d' ? esc(n.published.slice(5, 10)) + ' · ' : ''}${ago(n.published)}</div>
        <div><span class="tag ${esc(n.category)}">${esc(n.category.replace('_', ' '))}</span></div>
        <div><a class="t" href="${safeUrl(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
          <div class="muted">${esc(n.source)}${n.tickers.length ? ' · ' + n.tickers.map(t => (KNOWN.has(t) ? `<a href="#" data-open="${esc(t)}">${esc(t)}</a>` : esc(t))).join(', ') : ''}${!n.tickers.length && n.sectors.length ? ' · sector: ' + n.sectors.map(esc).join(', ') : ''}</div></div>
        <div>${arrow(n.sentiment)}</div></div>`).join('') : '<div class="empty">No headlines match.</div>'}</div>
      <div class="chips" style="margin-top:10px">${N.length > shown.length ? '<button class="chip" id="more">Show 200 more</button>' : ''}<span class="muted">${N.length} match, showing ${shown.length}. Categories and direction come from keyword rules (see Track record for measured accuracy). Links open the original publisher through Google News.</span></div>`;
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { NEWSCAT = b.dataset.c; NEWSLIMIT = 120; renderNews(); });
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { NEWSPERIOD = b.dataset.p; NEWSLIMIT = 120; renderNews(); });
    const more = $('#more', el); if (more) more.onclick = () => { NEWSLIMIT += 200; renderNews(); };
    $('#nq', el).oninput = e => { NEWSQ = e.target.value; const pos = e.target.selectionStart; renderNews(); const i = $('#nq'); i.focus(); i.setSelectionRange(pos, pos); };
    $('#hw', el).onchange = e => { HIDEWRAP = e.target.checked; renderNews(); };
    bindOpen(el);
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
      h += tr.closed.length ? `<div class="card scroll"><table><thead><tr><th>Stock</th><th>Result</th><th class="n">Net return</th><th>Days held</th><th>Signal</th><th>Setup</th></tr></thead><tbody>
        ${tr.closed.slice(0, 25).map(t => `<tr><td><b>${esc(t.ticker)}</b> <span class="muted">${t.score}</span></td><td><span class="act ${t.status === 'win' ? 'ACT' : t.status === 'loss' ? 'SKIP' : 'WATCH'}">${t.status === 'win' ? 'hit target' : t.status === 'loss' ? 'stopped' : 'expired'}</span></td><td class="n ${t.ret >= 0 ? 'up' : 'down'}">${sgn(t.ret)}</td><td>${daysCell(t.days, t.status === 'win' ? 'tp' : t.status === 'loss' ? 'sl' : 'time', tr.horizon || DATA.meta.params.horizon)}</td><td>${esc(t.signal)}</td><td>${esc(t.setup)}</td></tr>`).join('')}</tbody></table></div>`
        : `<p class="muted">Nothing has resolved yet. ${tr.signalDays} signal day${tr.signalDays === 1 ? '' : 's'} logged; each trade needs up to ${tr.horizon} trading days after its entry.</p>`;
    }
    h += groupTable('By setup', tr.bySetup, 5) + groupTable('By score', tr.byScore, 5) + groupTable('By market regime (ACT trades)', tr.byRegime, 5) +
      groupTable('By RSI at signal (ACT)', tr.byRsi, 5) + groupTable('By news at signal (ACT)', tr.byNews, 5) + groupTable('By Bandarmetrics accumulation score (ACT, experimental, logged from 12 Oct 2026)', tr.byBm, 1) + groupTable('By sector (ACT)', tr.bySector, 8) + groupTable('Best stocks so far (ACT)', tr.byTicker, 4);
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

  // Every idea tested, with its verdict (tools/experiment-v4.mjs). Rules were written down before each run.
  function researchHtml(r) {
    if (!r) return '';
    const P = r.portfolio, R = r.regime, Z = DATA.sizing, t = v => (v == null ? '–' : v.toFixed(1));
    const row = x => `<tr><td>${esc(x.name)}</td><td class="n">${pc(x.gap != null ? x.gap : x.diff, 2)}</td><td class="n">${t(x.t)}</td><td class="n">${t(x.tDay)}</td><td>${x.pass ? '<span class="up">adopted</span>' : '<span class="mute">rejected</span>'}</td></tr>`;
    return `<h2>What would this have made? Portfolio test</h2>
      <p class="muted">The live rule (oversold + bounce candle, wide stop, +8% target, 15 days) run as a real account: max 5 positions, 20% each (the original test; the adopted rule is now ${Z && Z.adopt ? Z.rule.max + ' positions of ' + Math.round(100 / Z.rule.max) + '% each' : '5 positions'}), best score first, fees included, ${esc(P.from)} to ${esc(P.to)}.</p>
      <div class="market"><div class="stat"><small>Live rule, no filter</small><b class="down">${pc(P.cagr)} / yr</b><div class="muted">worst drawdown ${pc(P.mdd)}</div></div>
        <div class="stat"><small>IHSG buy and hold</small><b>${pc(P.ihsg.cagr)} / yr</b><div class="muted">worst drawdown ${pc(P.ihsg.mdd)}</div></div>
        ${R ? `<div class="stat"><small>With market filter (${esc(R.pick)}), cash at 4.5%</small><b class="up">${pc(R.full[R.pick].cagr)} / yr</b><div class="muted">worst drawdown ${pc(R.full[R.pick].mdd)}</div></div>` : ''}${Z && Z.adopt ? `<div class="stat"><small>+ ${Z.rule.max} smaller positions (adopted)</small><b class="up">${pc(Z.results[Z.pick].full.cagr)} / yr</b><div class="muted">worst drawdown ${pc(Z.results[Z.pick].full.mdd)}</div></div>` : ''}</div>
      <div class="note"><b>Read it honestly.</b> These numbers cover 2022-26, the period the rule was designed on. The 10-year check at the top of this tab found <b>no edge</b>: the rule lost money in 2017-22 and its 2022-26 result sits inside the range of shuffled random prices. What still holds is that the market filter mostly keeps the account in cash during downtrends. Earlier note, kept for the record: only while the IHSG is above its 200-day average (chosen on 2022-24, then ${R && R.adopt ? 'confirmed' : 'tested'} on 2024-26). Spreading over more, smaller positions also helped in every variant (not yet adopted).</div>
      ${Z ? `<h3>How many positions? (walk-forward, ${esc(Z.asOf)})</h3><div class="card scroll"><table><thead><tr><th>Rule</th><th class="n">2022-24 (pick)</th><th class="n">2024-26 (check)</th><th class="n">Full period</th><th class="n">Worst drawdown</th><th class="n">Trades</th></tr></thead><tbody>${Object.entries(Z.results).map(([k, v]) => `<tr><td>${k === Z.pick ? '<b>' : ''}${k.startsWith('N') ? 'max ' + k.slice(1) + ' positions, equal size' : 'risk 1.5% per trade, max 8'}${k === 'N5' ? ' (before)' : ''}${k === Z.pick ? ' ← picked' + (Z.adopt ? ', adopted' : '') + '</b>' : ''}</td><td class="n">${pc(v.first.cagr, 1)}</td><td class="n">${pc(v.second.cagr, 1)}</td><td class="n">${pc(v.full.cagr, 1)}</td><td class="n">${pc(v.full.mdd, 1)}</td><td class="n">${v.full.trades}</td></tr>`).join('')}</tbody></table></div><p class="muted">Picked on the first half only, then checked on the second, with the market filter on and idle cash at 4.5%. More, smaller positions mainly cut drawdowns; with no proven edge (10-year check), that is all they do. Each position is now ${Z.adopt ? Math.round(100 / Z.rule.max) : 20}% of the account; the stock pages size it for you.</p>` : ''}
      <h3>Ideas tested (rules fixed before each run)</h3>
      <div class="card scroll"><table><thead><tr><th>Idea</th><th class="n">Effect per trade</th><th class="n">t, episodes</th><th class="n">t, by day</th><th>Verdict</th></tr></thead><tbody>${r.results.map(row).join('')}${R ? `<tr><td>Market filter: trade only when IHSG > 200-day average (walk-forward)</td><td class="n">${pc(R.secondHalf[R.pick].cagr - R.secondHalf.none.cagr, 1)} / yr</td><td class="n">–</td><td class="n">–</td><td>${R.adopt ? '<span class="up">adopted</span>' : '<span class="mute">rejected</span>'}</td></tr>` : ''}</tbody></table></div>
      <p class="muted">E = company filings on IDX, F = fundamentals from Stockbit (only numbers already published on the signal day), X = exit rules. An idea is adopted only if it holds counting each stock episode once, grouped by day, on the 73 stocks the score was not built on, and in both halves of the period.</p>`;
  }

  // Universe 100 -> 300 (tools/experiment-expand.mjs): the pre-registered holdout test on the 200 added stocks.
  function expansionHtml(x) {
    if (!x) return '';
    const n = x.newStocks, o = x.original, P = x.portfolio, t = v => (v == null ? '–' : v.toFixed(1));
    const ns = DATA.trackerSummary && DATA.trackerSummary.newSet;
    return `<h2>The stocks added in October 2026: shown, not traded</h2><p class="muted">200 were added on 10 Oct (tested below) and 200 more on 12 Oct (stocks 301-500 by median traded value: mostly under Rp 1 B a day, so nearly all are THIN). Both groups are shown, never ACT.</p>
      <div class="card scroll"><table><thead><tr><th>Stocks</th><th class="n">Live-rule trades</th><th class="n">Avg per trade</th><th class="n">Other stocks, same days</th><th class="n">Gap</th><th class="n">t</th><th class="n">By day</th><th class="n">1st / 2nd half</th><th>Result</th></tr></thead><tbody>
      ${[['Original 100', o], ['New 200', n]].map(([l, r]) => `<tr><td>${l}</td><td class="n">${r.episodes}</td><td class="n">${pc(r.avgLive, 2)}</td><td class="n">${pc(r.avgCtrl, 2)}</td><td class="n">${pc(r.gap, 2)}</td><td class="n">${t(r.t)}</td><td class="n">${pc(r.gapDay, 2)}</td><td class="n">${pc(r.h1, 1)} / ${pc(r.h2, 1)}</td><td>${r.pass ? '<span class="up">pass</span>' : '<span class="down">fail</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted">The universe grew from 100 to 300 stocks (the next 200 by median traded value, excluding suspended and sub-Rp 50 stocks). The rules were never tuned on the new 200, so they were a clean test, written down before it ran (${esc(x.from)} to ${esc(x.to)}). The bounce edge did <b>not</b> hold there: the gap over other stocks was smaller, not significant, and negative day by day. As an account (5 positions, market filter), adding them turned ${pc(P.original.cagr, 1)} a year into ${pc(P.all.cagr, 1)}, worst drawdown ${pc(P.original.mdd, 0)} to ${pc(P.all.mdd, 0)}. So their oversold setups show as <b>SKIP</b>, they are kept out of the live record below, and they still count for groups, news and broker flow.${ns && ns.act && ns.act.n ? ` Their own live record so far: ${ns.act.n} ACT setups closed, ${pc(ns.act.avgNet, 2)} average.` : ''}</p>`;
  }
  // The 10-year check (2026-10-10): tools/experiment-trend.mjs, experiment-own.mjs, experiment-permutation.mjs.
  function tenYearHtml(t) {
    if (!t || !t.trend) return '';
    const L = t.trend.halves, P = t.perm, O = t.own;
    return `<h2>10-year check: is there an edge at all?</h2>
      <div class="note"><b>No.</b> Over 2017-26 the live rule did no better than random noise. Treat every ACT call as a paper trade.</div>
      <div class="card scroll"><table><thead><tr><th>Test</th><th>Result</th><th>Verdict</th></tr></thead><tbody>
        <tr><td>Live rule, tested 100, 10 years</td><td>2017-22: ${pc(L['2017-10'].LIVE.mean, 2)} a trade, profit factor ${L['2017-10'].LIVE.pf.toFixed(2)}, ${pc(L['2017-10'].LIVE.cagr, 1)} a year · 2022-26: ${pc(L['2022-10'].LIVE.mean, 2)}, ${pc(L['2022-10'].LIVE.cagr, 1)} a year</td><td class="down">lost money before 2022</td></tr>
        ${P ? `<tr><td>Permutation: real prices vs ${P.shuffles.length} shuffled histories (one trade per stock at a time)</td><td>real ${pc(P.real.all, 2)} a trade; shuffles ${pc(Math.min(...P.shuffles.map(x => x.all)), 2)} to ${pc(Math.max(...P.shuffles.map(x => x.all)), 2)}; ${Math.round(P.pAll * 100)}% of shuffles did at least as well</td><td class="down">inside the noise</td></tr>` : ''}
        <tr><td>Trade dips in stocks in their own uptrend while the market filter is off (pre-registered)</td><td>${t.trend.added.n} extra trades, ${pc(t.trend.added.mean, 2)} vs ${pc(t.trend.added.nullMean, 2)} for random stocks, p ${t.trend.added.p.toFixed(2)}</td><td class="down">failed</td></tr>
        ${O ? `<tr><td>Own-uptrend rule on the 200 unseen stocks (pre-registered holdout)</td><td>${O.own.n} trades, ${pc(O.own.mean, 2)} vs ${pc(O.own.nullMean, 2)} random, p ${O.own.p.toFixed(2)}</td><td class="down">failed</td></tr>` : ''}
      </tbody></table></div>
      <p class="muted">Why the earlier "real but relative edge" was wrong: it came from 2022-26, the period the rule was designed on, and from a test (beat other stocks on the same day) that also "passes" on shuffled prices, because it rewards picking volatile stocks and counts overlapping trades on one stock as separate evidence. Kelly sizing on 10 years of trades comes out at zero or below. The market filter still keeps the account mostly in cash during downtrends, and the live ledger below keeps running as a forward test.</p>`;
  }

  // Reality check (2026-10-11): can a better exit save the bounce trade, does it hold on stocks never used, and how much
  // do survivorship and hindsight flatter the numbers? tools/experiment-payoff.mjs, experiment-payoff-confirm.mjs, survivorship.mjs.
  function realityHtml(X) {
    if (!X || !X.study) return '';
    const S = X.study, C = X.confirm, V = X.surv, R = id => S.rows.find(r => r.id === id) || {};
    const SN = { W: 'Wide (live)', A2: '2 ATR', A3: '3 ATR', C10: 'Wide, max 10%', C15: 'Wide, max 15%' }, TN = { P8: '+8% (live)', R15: '+1.5 ATR', R25: '+2.5 ATR', MA: '20-day avg' };
    const col = v => (v == null ? 'transparent' : `color-mix(in srgb, ${v >= 0 ? 'var(--up)' : 'var(--down)'} ${Math.min(70, Math.abs(v) * 4500).toFixed(0)}%, transparent)`);
    const cell = r => `<td class="hm" style="background:${col(r.hold)}" title="${esc(r.id)}: in-sample ${pc(r.is, 2).replace(/<[^>]+>/g, '')}, out-of-sample ${pc(r.oos, 2).replace(/<[^>]+>/g, '')}, holdout ${pc(r.hold, 2).replace(/<[^>]+>/g, '')}"><b>${pc(r.hold, 2)}</b><div class="muted">${pc(r.is, 1)} · ${pc(r.oos, 1)}</div></td>`;
    const grid = `<div class="card scroll"><table class="hmap"><thead><tr><th>Stop ↓ · target →</th>${Object.values(TN).map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>
      ${Object.keys(SN).map(sk => `<tr><td><b>${SN[sk]}</b></td>${Object.keys(TN).map(tk => cell(R(`${sk}-${tk}-15`))).join('')}</tr>`).join('')}</tbody></table></div>`;
    const ck = (S.checks || []).map(c => `<li class="${c.ok ? 'up' : 'mute'}">${c.ok ? '✓' : '✗'} ${esc(c.id)} ${esc(c.rule)}</li>`).join('');
    const sr = (l, x, a) => `<tr><td>${l}</td><td class="n">${x.n}</td><td class="n"><b>${pc(x.mean, 2)}</b></td><td class="n">${Math.round(x.win * 100)}%</td><td class="n">${x.payoff.toFixed(2)}</td><td class="n">${x.pf.toFixed(2)}</td><td class="n">${x.kelly.toFixed(2)}</td><td class="n">${a ? pc(a.cagr, 1) + ' / yr' : '–'}</td><td class="n">${a ? pc(a.mdd, 0) : '–'}</td></tr>`;
    const U = V && V.universe, F = V && V.freezes, yrs = F ? Object.entries(F.byYear).sort() : [], mx = Math.max(1, ...yrs.map(y => y[1]));
    return `<h2>Reality check: will the bounce trade make money?</h2>
      <div class="note warnnote"><b>Not on the evidence, whatever the exit.</b> 80 exits were tested on 10 years of prices with the rules fixed in advance: the pick from 2017-22 failed out of sample (${esc(S.pick)}: ${pc(R(S.pick).oos, 2)} vs ${pc(R(S.live).oos, 2)} for the live exit). The one family that looked good everywhere, keeping the wide stop and aiming for the 20-day average, was then tried on ${C ? C.stocks : 613} stocks never used for the rule: there the bounce trade <b>lost ${C ? pc(C.B.mean, 2) : '–'} a trade with the live exit and ${C ? pc(C.A.mean, 2) : '–'} with the 20-day target</b>${C ? `, an account falling ${pc(C.account.B.cagr, 1)} a year with a ${pc(C.account.B.mdd, 0)} drawdown` : ''}. Its good numbers on the tested 100 come largely from picking today's most traded stocks with hindsight. Keep ACT on paper. The one rule that passed a no-hindsight test is Momentum 10 (Momentum tab).</div>
      <h3>1. Payoff: 80 exits on the same entries (holding 15 sessions shown)</h3>
      ${grid}
      <p class="muted">Each cell: <b>holdout</b> (the 200 added stocks) mean net return per trade, then in-sample (2017-22) · out-of-sample (2022-26) on the tested 100; colour = holdout. One trade per stock at a time, 0.4% fees, gaps fill at the open. What it shows: <b>capping the stop makes it worse</b> (the 10% cap is the worst row: oversold stocks shake out tight stops), and the fixed +8% target is the weak part (letting winners run to the 20-day average or +2.5 ATR helps). Pass bar, written before the run:</p>
      <ul class="checks">${ck}</ul>
      ${C ? `<h3>2. Confirmation on ${C.stocks} stocks never used for this rule</h3>
      <div class="card scroll"><table><thead><tr><th>Exit (wide stop kept)</th><th class="n">Trades</th><th class="n">Avg / trade</th><th class="n">Win</th><th class="n">Payoff</th><th class="n">PF</th><th class="n">Kelly</th><th class="n">Account</th><th class="n">Worst DD</th></tr></thead><tbody>
        ${sr('20-day average target', C.A, C.account.A)}${sr('+8% target (live)', C.B, C.account.B)}${sr('+2.5 ATR target', C.R25)}</tbody></table></div>
      <ul class="checks">${C.checks.map(c => `<li class="${c.ok ? 'up' : 'mute'}">${c.ok ? '✓' : '✗'} ${esc(c.id)} ${esc(c.rule)}</li>`).join('')}</ul>
      <p class="muted">Kelly below zero means the best bet size is nothing. Same entry rule as the site (oversold score ≥ 65, bounce candle, Rp 5 B a day at the time), 2017-26.</p>` : ''}
      ${V ? `<h3>3. Survivorship and hindsight</h3>
      <div class="two">
        <div class="card pad"><b>Same trade, different stock lists</b>${U.sets.map(x => `<div class="srow"><span>${esc(x.set)}</span><b class="${x.mean >= 0 ? 'up' : 'down'}">${pc(x.mean, 2)}</b><span class="muted">${x.n} trades</span></div>`).join('')}
          <div class="srow" style="border-top:1px solid var(--line);padding-top:6px"><span><b>All ${U.sets.length ? '913' : ''} stocks, liquid at the time</b></span><b class="${U.pitMean >= 0 ? 'up' : 'down'}">${pc(U.pitMean, 2)}</b><span class="muted">${U.trades} trades</span></div>
          <p class="muted">Picking today's most traded stocks favours companies that did well: the rule's home turf. Counting every stock that was liquid on the day gives the honest number.</p></div>
        <div class="card pad"><b>Delisted and frozen stocks</b>
          <p class="muted" style="margin-top:6px"><b>Delisted:</b> since 2020, ${V.delisting.codesGone} IDX codes that traded are gone; all but one traded under Rp 5 B a day, and that one (${esc(V.delisting.liquidGone[0])}). So the missing dead stocks hardly matter for a Rp 5 B rule since 2020; before 2020 there is no data.</p>
          <p class="muted"><b>Frozen while liquid</b> (10+ sessions without trading: suspension or the call-auction board): ${F.count} times in ${F.stocks} stocks; median first move after reopening ${pc(F.medianGap, 0)}. A stop cannot be hit while a stock is frozen.</p>
          <div class="bars" style="height:40px" title="Freezes per year">${yrs.map(([y, n]) => `<i style="height:${Math.max(3, n / mx * 40)}px;background:var(--warn)" title="${y}: ${n}"></i>`).join('')}</div>
          <div class="muted" style="display:flex;justify-content:space-between"><span>${yrs.length ? yrs[0][0] : ''}</span><span>freezes per year</span><span>${yrs.length ? yrs[yrs.length - 1][0] : ''}</span></div></div>
      </div>` : ''}`;
  }


  // Why so few convinced ACT calls (tools/diagnose-act.mjs + tools/experiment-act-window.mjs, 2026-10-12).
  function fewActHtml() {
    const W = DATA.lab && DATA.lab.actWindow; if (!W) return '';
    const S = W.summary;
    return `<h3>Why so few ACT calls? Each suspect, checked</h3>
      <div class="card pad">
        <p><b>1. The rule fights itself (the biggest cap).</b> ACT needs the oversold score ≥ 65 <i>and</i> a bounce candle on the same day, but a bounce lifts RSI and the 5-day return, so the score drops about 30 points that very day. Over the last two years only 1,116 of 2,879 bounce candles right after an oversold day still scored 65, and two thirds of oversold spells on the tested stocks never became ACT; most bounced 1-5 sessions later at a score near 29.</p>
        <p><b>2. Most of the list can never be ACT.</b> The 400 stocks added in October 2026 are SKIP (the bounce failed its test on the first 200; the next 200 are mostly too thin to trade anyway).</p>
        <p><b>3. The target is not it.</b> +8% decides the outcome, not the count: about half of ACT trades hit it. Smaller and ATR-based targets were tested in the 80-exit payoff study and did not help.</p>
        <p><b>Was fixing 1 and 2 the answer? Tested, pre-registered: no.</b> Allowing the bounce up to 5 sessions late gives about 2.4× the calls, but the late ones are worse: ${pc(S.RECENT.mX, 2)} a trade since 2022 against ${pc(S.RECENT.mL, 2)} for same-day calls, and ${pc(S.O613.mX, 2)} on the 613 never-used stocks. The 200 SKIP stocks made ${pc(S.N200.mW, 2)} a trade. So the strict same-day rule is not an accident: it filters out the bounces that fade. The real limit is the stocks themselves: on stocks the rule was not built on, every version loses (${pc(S.O613.mL, 2)} a trade), and the trait scans found that weakness on IDX tends to continue. More ACT badges would mean more losing calls, so the rule stays as it is and stays paper-only.</p>
      </div>`;
  }

  // "Is this cherry-picked?": the checks a reader can do, computed from the call list itself. Calls bunch on market-wide
  // bounce days, so the honest count of independent bets is the number of signal DAYS, not calls.
  function honestyHtml(cs) {
    const R = (cs.recent || []).filter(c => c.x && c.ret != null);
    if (R.length < 10) return '';
    const by = {}; R.forEach(c => (by[c.d] = by[c.d] || []).push(c.ret));
    const days = Object.entries(by).map(([d, a]) => [d, a.length, a.reduce((s, x) => s + x, 0) / a.length]).sort((a, b) => b[1] - a[1]);
    const m = days.reduce((s, x) => s + x[2], 0) / days.length, sd = Math.sqrt(days.reduce((s, x) => s + (x[2] - m) ** 2, 0) / Math.max(1, days.length - 1)), t = sd ? m / (sd / Math.sqrt(days.length)) : 0;
    const top2 = days.slice(0, 2), top2n = top2.reduce((s, x) => s + x[1], 0);
    const rest = R.filter(c => !top2.some(x => x[0] === c.d)), restAvg = rest.length ? rest.reduce((s, c) => s + c.ret, 0) / rest.length : null;
    const live = cs.liveFrom || null;
    return `<h3>Is this cherry-picked? What you can check yourself</h3>
      <div class="card pad">
        <p><b>1. Calls bunch on a few days.</b> ${R.length} closed calls came from only <b>${days.length} signal days</b>. The two busiest, ${top2.map(x => `${esc(x[0])} (${x[1]} calls, avg ${retTxt(x[2])})`).join(' and ')}, hold ${top2n} calls (${Math.round(top2n / R.length * 100)}%). Those were market-wide panic-then-rebound days: most of the 300 stocks were oversold at once and nearly all bounced the same morning, so ${top2[0][1]} calls on one day are really one bet on the market. Counting each day once, the average day made <b>${retTxt(m)}</b> (t ${t.toFixed(1)}; 2 or more would be evidence). Without the two busiest days, the other ${rest.length} calls averaged ${retTxt(restAvg)}.</p>
        ${(() => { const q = Object.entries(cs.byMonth || {}).filter(([, s]) => s.n <= 5 && s.n > 0).map(([mo, s]) => `${mo} (${s.n})`); return q.length ? `<p><b>Why some months have so few calls:</b> ${q.join(', ')}. The rule only buys after a sharp drop, so in a rising market almost nothing is oversold. In July–August 2026 the median stock rose about 11% and 5%, and only about 25 oversold spells a month appeared across all 300 stocks (against about 290 in June). It is also one trade per stock at a time, so a stock bought on a crash day cannot be called again until that trade closes.</p>` : ''; })()}
        <p><b>2. No peeking at the future.</b> Each call uses only bars up to its signal day, buys at the <i>next</i> open, and is scored by fixed rules (target, wide stop, ${DATA.meta.params.horizon} sessions, 0.4% fees, a bar touching both counts as a loss). The code is public: <a href="https://github.com/FarrasHFZ/dompet/blob/main/swing-screener/tools/signals.mjs" target="_blank" rel="noopener noreferrer">signals.mjs</a>.</p>
        <p><b>3. But the replay is not live.</b> It uses today's 300 most traded stocks, chosen <i>after</i> they did well enough to be popular (survivorship), and today's rules, tuned on the same past. That flatters it. That is why the stricter tests below exist, and they failed: about −0.3% a trade over 10 years on all liquid stocks, −1.34% a trade on 613 stocks the rule never saw, and no exit that beat shuffled prices.</p>
        <p><b>4. The only clean record is the live one.</b> From ${esc(live || 'the first ledger day')} the site saves every call before its outcome is known, and git timestamps each save: <a href="https://github.com/FarrasHFZ/dompet/commits/main/swing-screener/data/history" target="_blank" rel="noopener noreferrer">the ledger's commit history</a>. Calls made after a commit cannot be edited without it showing. Judge the method on that record once it has a few hundred calls across different markets.</p>
      </div>`;
  }

  // Every recent call, one row each, with how many sessions it took to hit TP or SL (tools/signals.mjs callStats.recent).
  let CALLF = 'all';
  function recentCallsHtml(cs) {
    const R = cs.recent;
    if (!R || !R.length) return '<p class="muted">The per-call list (with days to TP / SL) appears after the next site rebuild.</p>';
    const H = DATA.meta.params.horizon, f = CALLF, rows = R.filter(c => f === 'all' || (f === 'closed' ? c.x : f === 'open' ? !c.x : c.res === f));
    const by = Object.fromEntries(DATA.picks.map(p => [p.ticker, p]));
    const dist = r => { const a = R.filter(c => c.res === r && c.n != null).map(c => c.n); return a.length ? a : null; };
    const hist = (a, col) => { if (!a) return ''; const n = Array(H).fill(0); a.forEach(x => n[Math.min(H, x) - 1]++); const mx = Math.max(...n, 1);
      return `<div class="bars" style="height:30px" title="Days held, 1 to ${H}">${n.map((v, i) => `<i style="height:${Math.max(2, v / mx * 30)}px;background:${col}" title="day ${i + 1}: ${v}"></i>`).join('')}</div>`; };
    return `<h3>Every call, newest first: when did it hit TP or SL?</h3>
      <div class="csum">
        <div><small>Days to TP (average)</small><b class="up">${cs.all.daysTp == null ? '–' : cs.all.daysTp.toFixed(1)}</b>${hist(dist('tp'), 'var(--up)')}</div>
        <div><small>Days to SL (average)</small><b class="down">${cs.all.daysSl == null ? '–' : cs.all.daysSl.toFixed(1)}</b>${hist(dist('sl'), 'var(--down)')}</div>
        <div><small>Timed out at day ${H}</small><b>${cs.all.time}</b><div class="muted">of ${cs.all.closed} closed</div></div>
        <div><small>Open now</small><b>${cs.all.open}</b><div class="muted">trades in progress</div></div>
      </div>
      <div class="chips">${[['all', 'All'], ['tp', 'TP hit'], ['sl', 'SL hit'], ['time', 'Timed out'], ['open', 'Open']].map(([k, l]) => `<button class="chip" data-callf="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
      <div class="card scroll"><table><thead><tr><th>Called</th><th>Stock</th><th>Result</th><th>Days held</th><th class="n">Return</th><th class="n">Entry</th><th class="n">TP / SL</th><th class="n">Score</th></tr></thead><tbody>
      ${rows.map(c => { const p = by[c.t]; return `<tr data-open="${esc(c.t)}"><td>${esc(c.d)}${c.dn ? ' <span class="muted" title="IHSG below its 200-day average">↓mkt</span>' : ''}</td><td><div style="display:flex;gap:8px;align-items:center">${avatar(c.t)}<div><b class="tk">${esc(c.t)}</b><div class="nm">${p ? esc(p.name) : ''}</div></div></div></td><td>${resPill(c.res)}${c.x ? `<div class="muted">${esc(c.x)}</div>` : ''}</td>
        <td>${c.x ? daysCell(c.n, c.res, H) : c.res === 'open' && c.age != null ? openCell(c.age, H) : '<span class="mute">–</span>'}</td>
        <td class="n">${c.x ? `<b class="${c.ret > 0 ? 'up' : 'down'}">${retTxt(c.ret)}</b>` : c.now != null ? `<span class="muted">${retTxt(c.now)} now</span>` : '–'}</td>
        <td class="n">${f0(c.entry)}</td><td class="n"><span class="up">${f0(c.tp)}</span> / <span class="down">${f0(c.stop)}</span></td><td class="n">${c.s}</td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">None in this filter.</td></tr>'}</tbody></table></div>
      <p class="muted">The latest ${R.length} calls. <b>Days held</b> = trading sessions from the buy (the open after the call, day 1) to the session the target or stop was touched; a trade still open after ${H} sessions is sold at that close. Tap a row to open the stock.</p>`;
  }

  // Scorecard of the replayed ACT calls (tools/signals.mjs callStats): read win rate WITH the size of wins and losses.
  function callStatsHtml(cs) {
    if (!cs || !cs.all) return '';
    const r2 = x => (x == null ? '–' : x.toFixed(2)), wr = x => (x == null ? '–' : Math.round(x * 100) + '%');
    const col = (lbl, s) => `<tr><td>${lbl}</td><td class="n">${s.closed}${s.open ? ` <span class="muted">+${s.open} open</span>` : ''}</td><td class="n">${wr(s.winRate)}</td><td class="n">${pc(s.avgWin)}</td><td class="n">${pc(s.avgLoss)}</td><td class="n">${r2(s.payoff)}</td><td class="n">${r2(s.profitFactor)}</td><td class="n"><b>${pc(s.expectancy, 2)}</b></td><td class="n">${pc(s.worst, 0)}</td><td class="n">${s.worstStreak}</td></tr>`;
    const A = cs.account, months = Object.entries(cs.byMonth || {});
    return `<h2>Convinced ACT calls: the scorecard (replayed since ${esc(cs.from || '–')})</h2>
      <div class="market">
        <div class="stat"><small>Win rate</small><b>${wr(cs.all.winRate)}</b><div class="muted">how often a trade made money</div></div>
        <div class="stat"><small>Payoff (avg win ÷ avg loss)</small><b>${r2(cs.all.payoff)}</b><div class="muted">below 1: losses are bigger than wins</div></div>
        <div class="stat"><small>Expectancy (avg per trade)</small><b>${pc(cs.all.expectancy, 2)}</b><div class="muted">after 0.4% fees</div></div>
        <div class="stat"><small>Account, 10 positions of 10%</small><b>${pc(A.total, 1)}</b><div class="muted">worst drawdown ${pc(A.maxDD, 1)} · ${A.monthsUp} of ${A.months} months up</div></div>
      </div>
      <div class="card scroll"><table><thead><tr><th>Calls</th><th class="n">Closed</th><th class="n">Win rate</th><th class="n">Avg win</th><th class="n">Avg loss</th><th class="n">Payoff</th><th class="n">Profit factor</th><th class="n">Expectancy</th><th class="n">Worst</th><th class="n">Losing streak</th></tr></thead><tbody>
        ${col('All', cs.all)}${col('IHSG above its 200-day average', cs.up)}${col('IHSG below it (downtrend)', cs.down)}</tbody></table></div>
      ${fewActHtml()}
      ${honestyHtml(cs)}
      ${recentCallsHtml(cs)}
      ${months.length ? `<h3>By month</h3><div class="card scroll"><table><thead><tr><th>Month called</th><th class="n">Calls</th><th class="n">Win rate</th><th class="n">Expectancy</th><th class="n">Stops hit</th><th class="n">Worst</th></tr></thead><tbody>${months.reverse().map(([m, s]) => `<tr><td>${esc(m)}</td><td class="n">${s.n}${s.open ? ` <span class="muted">(${s.open} open)</span>` : ''}</td><td class="n">${wr(s.winRate)}</td><td class="n">${pc(s.expectancy, 2)}</td><td class="n">${s.sl}</td><td class="n">${pc(s.worst, 0)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="muted"><b>How to read it.</b> Win rate alone misleads: a rule can win 6 trades in 10 and still lose money if each loss is three times a win. What decides money is <b>expectancy</b> (average result per trade = win rate × average win + loss rate × average loss), read with the <b>payoff</b> and <b>profit factor</b> (gross gains ÷ gross losses; above 1 makes money), and how deep the account falls on the way (<b>drawdown</b>), which sizing controls. Replayed with today's rules and neutral news, so before the live ledger these are not calls the site made at the time; the 200-day filter no longer gates calls (since 2026-10-10).</p>`;
  }

  function renderScore() {
    const el = $('#tab-score'), bt = DATA.backtest, na = DATA.newsAccuracy;
    if (!bt) { el.innerHTML = '<div class="empty">No backtest summary in this data source.</div>'; return; }
    loadTrack();
    el.innerHTML = `<div class="ph-head"><div><h1>Track record</h1><p>Every call the rules made, what it returned, and how long it took to hit TP or SL.</p></div></div>${realityHtml(DATA.payoff)}${callStatsHtml(DATA.callStats)}${tenYearHtml(DATA.tenYear)}
      <h2>Does the score predict anything? Walk-forward backtest</h2>
      <p class="muted">${esc(bt.params.source)}, ${esc(bt.params.from)} to ${esc(bt.params.to)}. Each day the score uses only data up to that day; outcome = next 15 trading days with the plan's stop and +${bt.params.targetPct}% target.</p>
      <div class="two"><div class="card"><div class="pad"><b>Out-of-sample (2024-10 →)</b></div>${bucketTable(bt.outOfSample)}</div>
      <div class="card"><div class="pad"><b>In-sample (before 2024-10)</b></div>${bucketTable(bt.inSample)}</div></div>
      ${DATA.backtestHoldout ? `<h2>Stocks it was NOT designed on</h2><div class="card"><div class="pad"><b>${DATA.backtestHoldout.params.tickers} other IDX stocks</b>, same rules, no re-tuning</div>${bucketTable(DATA.backtestHoldout.all)}</div><p class="muted">The edge replicates but is smaller, and after stops and fees the average trade is about zero. Treat ACT as a shortlist, not a signal to buy blindly.</p>` : ''}
      <div class="note"><b>Read it honestly.</b> The v1 score (trend, momentum, breakout chasing) scored <i>negative</i> in this test, so it was replaced by an oversold-bounce score. The new score ranks better, but a +1% average 15-day move is small, and in the 13-month replay with realistic entries, stops and fees the average ACT trade still lost money. The earlier idea that the edge lives in broad selloffs did not hold up there (see the regime table). ${bt.caveats.map(esc).join(' ')}</div>
      ${expansionHtml(DATA.expansion)}
      ${researchHtml(DATA.research)}
      <h2>My paper trades</h2>
      <div id="paperbox">${paperHtml()}</div>
      <h2>Live track record: does it actually hit its targets?</h2>
      <div id="trackbox"><div class="card empty">Loading…</div></div>
      <h2>News: how accurate is the classifier?</h2>
      ${na ? `<div class="card scroll"><table><thead><tr><th>Rules</th><th>Sample</th><th class="n">Category right</th><th class="n">Direction precision</th><th class="n">Direction recall</th></tr></thead><tbody>
        ${na.rows.map(r => `<tr><td>${esc(r.rules)}</td><td>${esc(r.sample)}</td><td class="n">${r.cat}%</td><td class="n">${r.prec}%</td><td class="n">${r.rec}%</td></tr>`).join('')}</tbody></table></div><p class="muted">${esc(na.note)}</p>` : ''}
      `;
    bindPaper(el);
    bindOpen(el);
    el.querySelectorAll('[data-callf]').forEach(b => b.onclick = () => { CALLF = b.dataset.callf; renderScore(); const t = el.querySelector('[data-callf]'); if (t) t.scrollIntoView({ block: 'center' }); });
  }

  // ---------- how it works ----------
  // Coverage per source over the whole universe (counted in the build).
  function coverageCardHtml(c) {
    if (!c) return '';
    const N = c.universe, row = (label, n, note, neutral) => `<tr><td>${label}</td><td class="n"><b class="${neutral ? '' : n >= N ? 'up' : n >= N * 0.85 ? 'warn' : 'down'}">${n}</b> / ${N}</td><td><div class="meter"><i style="width:${Math.round(100 * n / N)}%"></i></div></td><td class="muted">${note}</td></tr>`;
    const miss = (k, l) => (c.missing && c.missing[k] && c.missing[k].length ? `<p class="muted">${l} missing: ${c.missing[k].slice(0, 30).map(esc).join(', ')}${c.missing[k].length > 30 ? ' +' + (c.missing[k].length - 30) : ''}</p>` : '');
    return `<h2>Data coverage: every stock, every source</h2><div class="card scroll"><table><thead><tr><th>Source</th><th class="n">Stocks</th><th style="min-width:120px"></th><th>Note</th></tr></thead><tbody>
      ${row('Prices (Yahoo)', c.prices, 'daily bars, refreshed hourly')}
      ${row('Scored and shown', c.scored, `${c.liquid} liquid enough to trade (≥ Rp 5 B a day); the rest show as THIN${c.suspended && c.suspended.length ? `; not trading now: ${c.suspended.map(esc).join(', ')}` : ''}`)}
      ${row('Broker flow (NeoBDM)', c.neobdm, `${c.neobdm - c.neobdmPage} from the screener list, ${c.neobdmPage} from stock pages; ${c.neobdmFresh} fresh (≤ 5 days)`)}
      ${row('Flow history strip', c.flowStrip, 'last 60 sessions, replayed then extended daily')}
      ${c.brokerCost != null ? row('Big buyers&#39; cost', c.brokerCost, 'per-broker inventory, refreshed on a weekly rotation (a fifth of the stocks each evening)') : ''}
      ${row('Bandarmetrics', c.bm, `${c.bmScore} with an accumulation score${c.bmTooNew && c.bmTooNew.length ? ` (${c.bmTooNew.map(esc).join(', ')} listed too recently for one)` : ''}`)}
      ${row('News (30 days)', c.news30d, 'stocks named in at least one headline; quiet small caps can have none, and new stocks fill in over a few hourly runs')}
      ${row('Owners (KSEI ≥ 1%)', c.owners, 'monthly file')}
      ${row('Conglomerate group', c.groups, 'complete: only stocks that belong to a mapped group', true)}
      </tbody></table></div>${miss('prices', 'Prices')}${miss('neobdm', 'Broker flow')}${miss('bm', 'Bandarmetrics')}`;
  }
  function renderHow() {
    const m = DATA.meta;
    $('#tab-how').innerHTML = `<div class="ph-head"><div><h1>How it works</h1><p>Every idea tested, where the data comes from, and what runs where.</p></div></div>${labHtml()}${breakoutLabHtml()}${coverageCardHtml(m.dataCoverage)}
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
  $('#refreshBtn').innerHTML = IC.refresh; $('#settingsBtn').innerHTML = IC.db;
  $('#refreshBtn').onclick = () => { const b = $('#refreshBtn'); b.classList.add('spin'); load().catch(() => {}).finally(() => b.classList.remove('spin')); };
  ['#themeBtn', '#themeBtnM'].forEach(s => { const b = $(s); if (b) b.onclick = toggleTheme; });
  themeIcons(); navHtml(); go(TAB, true);
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

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

  const TIER = { 'ACT+': 'Bounce candle + flow up', ACT: 'Bounce candle confirmed', 'ACT?': 'Bounce candle, but flow down', WAIT: 'Oversold, wait for a bounce candle', SKIP: 'Not traded: NeoBDM veto, or one of the 200 stocks where the bounce edge was not confirmed', PAUSE: 'Market filter: IHSG below its 200-day average, no new bounce trades', THIN: 'Oversold, but trades under Rp 5 B a day: too thin to trade', SUSP: 'No trading in the last 3 sessions: suspended or halted' };
  const tierHtml = p => (p.tier && p.tier !== 'WATCH' ? '<span class="tier t' + (p.tier === 'ACT+' ? 'P' : p.tier === 'ACT?' ? 'Q' : p.tier) + '" title="' + esc(TIER[p.tier]) + '">' + esc(p.tier) + '</span>' : '');
  // Conglomerate group label (tools/groups.mjs): short name, rank on hover; a click opens the Groups tab.
  const groupTag = p => {
    const nm = p.untested ? '<span class="newmark" title="One of the 200 stocks added in Oct 2026: shown, not traded (Track record)">new</span>' : '';
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
    renderPicks(); renderMomentum(); renderFlow(); renderGroups(); renderNews(); renderScore(); renderHow();
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
    const status = M.filterOn
      ? `<b>Holding</b> the 10 below since the open after ${esc(M.rebalance)}.`
      : `<b>Cash this month.</b> The IHSG was below its 200-day average on ${esc(M.rebalance)}, so the rule holds nothing. The list is shown for watching only.`;
    const rows = hold.map(h => `<tr data-open="${esc(h.t)}" class="row"><td class="n">${h.rank}</td><td><span class="tk">${esc(h.t)}</span><div class="nm">${esc(h.name)}</div></td><td class="n">${pc(h.mom, 0)}</td><td class="n">${f0(h.entry)}</td><td class="n">${f0(h.now)}</td><td class="n">${pc(h.ret)}</td></tr>`).join('');
    const recRows = rec.slice().reverse().map(r => `<tr><td>${esc(month(r.rebalance))}${r.open ? ' <span class="tag">open</span>' : ''}</td><td>${r.filterOn ? 'invested' : '<span class="mute">cash</span>'}</td><td class="n">${pc(r.traded, 2)}</td><td class="n">${pc(r.momRet, 2)}</td><td class="n">${pc(r.ewRet, 2)}</td><td class="n">${pc(r.ihsg, 2)}</td><td class="muted">${r.picks.map(esc).join(', ')}</td></tr>`).join('');
    const bt = (lbl, x) => x ? `<tr><td>${lbl}</td><td class="n">${pc(x.MOM10.cagr)}</td><td class="n">${pc(x.MOM10.first)} / ${pc(x.MOM10.second)}</td><td class="n">${pc(x.EW.cagr)}</td><td class="n">${x.null ? pc(x.null.med) + ', p ' + x.null.p.toFixed(3) : '–'}</td><td class="n">${x.MOM10.dd != null ? pc(x.MOM10.dd, 0) : pc(x.MOM10.mddMonthly, 0) + ' (month-end)'}</td></tr>` : '';
    el.innerHTML = `
      <div class="note"><b>Second strategy, paper only.</b> On the last trading day of each month, take the liquid stocks (Rp 5 B a day), rank them by their return over the past 12 months skipping the latest month, and hold the top 10 in equal amounts from the next open until the next month's rebalance. Only while the IHSG is above its 200-day average; otherwise cash. It passed a pre-registered 10-year test, but read the caveats below before trusting it.</div>
      <div class="note ${pv && !pv.pass ? 'warnnote' : ''}">${pitLine}</div>
      <h2>This month's list (${esc(month(M.rebalance))} rebalance)</h2>
      <div class="callbox">${status} Next rebalance: the last trading day of ${esc(month(new Date().toISOString().slice(0, 10)))}${M.filterOn ? '' : ''}; the new list appears here the evening it closes.${M.counted ? '' : ` This list was formed before the forward record starts (${esc(month(M.from + '-01'))} rebalance), so it is not counted.`}</div>
      <div class="card scroll"><table><thead><tr><th class="n">#</th><th>Stock</th><th class="n">12-1 month return</th><th class="n">Entry (open after rebalance)</th><th class="n">Now</th><th class="n">Since entry</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty">No liquid stock with a full year of history.</td></tr>'}</tbody></table></div>
      <p class="muted">Tap a row to open the stock page. Momentum lists are full of stocks that already ran hard (they are why they are on it); expect sharp pullbacks. Returns are before fees; the record below charges 0.2% to buy and 0.2% to sell.</p>
      <h2>Forward record (from the ${esc(month(M.from + '-01'))} rebalance)</h2>
      ${rec.length ? `<div class="card scroll"><table><thead><tr><th>Month</th><th>Filter</th><th class="n">Rule result</th><th class="n">Top 10 (if held)</th><th class="n">All liquid stocks</th><th class="n">IHSG</th><th>Picks</th></tr></thead><tbody>${recRows}</tbody></table></div>` : '<p class="muted">Starts with the first month-end after the rule was fixed. Every list is saved on the evening it forms and scored at the next rebalance, so none is picked with hindsight.</p>'}
      ${S ? `<h2>Backtest, 2017-10 to 2026-08 (Yahoo, monthly)</h2>
      <div class="card scroll"><table><thead><tr><th>Stocks</th><th class="n">Top 10 / yr</th><th class="n">2017-22 / 2022-26</th><th class="n">All liquid, equal / yr</th><th class="n">10 random (median)</th><th class="n">Worst drawdown</th></tr></thead><tbody>
        ${bt('Tested 100 (today\'s list)', S.tested)}${bt('Unseen 200 (today\'s list)', S.holdout)}${P ? bt('Point in time, top 100 each month', P.top100) : ''}</tbody></table></div>
      <p class="muted"><b>Caveats.</b> (1) The first two rows use today's most-traded stocks, so stocks that later became big winners are in the list from the start: that flatters momentum (the last row removes that by rebuilding the universe every month from what was known then). (2) Stocks delisted before 2026 have no Yahoo data and are missing everywhere. (3) Drawdowns near −50% even with the market filter. (4) On the unseen 200 it lost to simply holding everything in 2022-26. Rules and pass bars were written down before each run (tools/experiment-momentum.mjs, experiment-momentum-pit.mjs).</p>` : ''}`;
    el.querySelectorAll('tr[data-open]').forEach(r => r.onclick = () => { OPEN = r.dataset.open; FILTER = 'ALL'; document.querySelector('[data-tab=picks]').click(); if (MQ.matches) history.pushState({ sheet: OPEN }, ''); renderPicks(); const d = $('#dcard'); if (d && !MQ.matches) d.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
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
      ['Bandarmetrics LPM (60-session change)', 'failed', L.flow2 ? `${pc(L.flow2.H3.spread, 1)}, p ${L.flow2.H3.p.toFixed(2)}` : ''],
      ['NeoBDM flow tags, 2-year replay', 'failed', 'FLOW+ minus FLOW− −0.13% per 5 sessions'],
      ['Stock picking in bear months (IHSG under its 200-day average): 12-month winners, 3-month winners, calmest stocks, calm winners', 'failed', L.bear ? `None beat 10 random stocks (best: 3-month winners ${pc(L.bear.results.B2_MOM3.mean)} a month, p ${L.bear.results.B2_MOM3.p.toFixed(2)}). Surprise: in those ${L.bear.bearMonths} months the average liquid stock still made ${pc(L.bear.ewBear)} a month and the IHSG ${pc(L.bear.ihsgBear)}; the 200-day line did not predict a falling next month` : ''],
    ];
    return `<h2>Signal lab: every idea tested, and where it stands</h2>
      <div class="card scroll"><table><thead><tr><th>Idea</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${st(r[1])}</td><td class="muted">${r[2]}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted">How a test works here (tools/study-lib.mjs): the rule and its pass bar are committed before the first run; samples are taken on dates 20 sessions apart so one move is never counted twice; the null shuffles the signal across stocks within each date; a pass needs p &lt; 0.05, t ≥ 2 and the same sign in both halves. A "convinced" badge only comes from a passed test.</p>`;
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
    el.innerHTML = `
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
    el.querySelectorAll('tr[data-open]').forEach(r => r.onclick = () => { OPEN = r.dataset.open; FILTER = 'ALL'; document.querySelector('[data-tab=picks]').click(); renderPicks(); const d = $('#dcard'); if (d) d.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
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
    el.innerHTML = `
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
    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { OPEN = b.dataset.open; FILTER = 'ALL'; document.querySelector('[data-tab=picks]').click(); renderPicks(); const d = $('#dcard'); if (d) d.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  }

  // ---------- picks ----------
  function renderPicks() {
    const el = $('#tab-picks');
    const P = DATA.picks;
    const cnt = a => P.filter(p => p.action === a).length;
    const q = PQ.trim().toLowerCase();
    const list = (FILTER === 'ALL' ? P : P.filter(p => p.action === FILTER)).filter(p => !q || p.ticker.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.sector.toLowerCase().includes(q));
    const sel = P.find(x => x.ticker === OPEN);
    const detail = s => MQ.matches
      ? `<div class="card pad detailcard sheet" id="dcard" role="dialog" aria-label="${esc(s.ticker)}"><div class="dhead"><button class="ghost back" id="dclose" aria-label="Back to the list">‹</button><div><b class="tk">${esc(s.ticker)}</b> <span class="act ${s.action}">${s.action}</span><div class="nm">${esc(s.name)} · ${esc(s.sector)}</div></div></div>${detailHtml(s)}</div>`
      : `<div class="card pad detailcard" id="dcard"><div class="dhead"><b class="tk">${esc(s.ticker)}</b> <span class="muted">${esc(s.name)} · ${esc(s.sector)}</span><button class="ghost" id="dclose">Close</button></div>${detailHtml(s)}</div>`;
    const empty = '<div class="card empty">Nothing in this filter today.</div>';
    const body = MQ.matches
      ? `<div class="cards">${list.length ? list.map(cardHtml).join('') : empty}</div>${sel ? detail(sel) : ''}`
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
      ${marketBanner()}
      <p class="muted hint">ACT = oversold-bounce score ≥ ${DATA.meta.actScore}. Badges: <b>ACT</b> bounce candle seen, <b>WAIT</b> no bounce candle yet, <b>SKIP</b> not traded (NeoBDM veto, or one of the 200 stocks added in Oct 2026 where the edge failed its test), <b>PAUSE</b> market filter off, <b>THIN</b> trades under Rp 5 B a day (shown, never traded). Broker flow no longer adds ACT+ / ACT?: two years of NeoBDM history showed it did not tell good bounces from bad ones (Broker flow tab). Few days have any; "none today" is a valid answer. <b>Paper only:</b> a 10-year check found no edge over random noise (Track record).</p>
      ${body}`;
    // Phone: the stock opens as its own full-screen page; the back gesture closes it.
    const toggle = t => { OPEN = OPEN === t ? null : t; if (OPEN && MQ.matches) history.pushState({ sheet: OPEN }, ''); renderPicks(); const d = $('#dcard'); if (OPEN && d && !MQ.matches) d.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { FILTER = b.dataset.f; OPEN = null; renderPicks(); });
    el.querySelectorAll('tr.row, .pcard').forEach(n => n.onclick = e => { if (e.target.closest('a, .gtag')) return; toggle(n.dataset.t); });
    el.querySelectorAll('.gtag').forEach(b => b.onclick = e => { e.stopPropagation(); document.querySelector('[data-tab=groups]').click(); window.scrollTo(0, 0); });
    bindSizer(el);
    const dc = $('#dclose', el); if (dc) dc.onclick = () => { if (history.state && history.state.sheet) history.back(); else { OPEN = null; renderPicks(); } };
    document.documentElement.classList.toggle('noscroll', !!(sel && MQ.matches));
    if (sel) mountChart($('#dcard', el), sel); else dropChart();
    el.querySelectorAll('[data-jump]').forEach(b => b.onclick = e => { e.stopPropagation(); const t = document.getElementById(b.dataset.jump); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    const pq = $('#pq', el); if (pq) pq.oninput = e => { PQ = e.target.value; const pos = e.target.selectionStart; renderPicks(); const i = $('#pq'); i.focus(); i.setSelectionRange(pos, pos); };
    el.querySelectorAll('[data-news]').forEach(b => b.onclick = () => { NEWSPERIOD = '30d'; NEWSQ = b.dataset.news; NEWSCAT = 'ALL'; NEWSLIMIT = 120; renderNews(); document.querySelector('[data-tab=news]').click(); });
  }

  window.addEventListener('popstate', () => { if (OPEN && MQ.matches) { OPEN = null; renderPicks(); } });

  // Phone layout: one card per stock instead of a 15-column table.
  function cardHtml(p) {
    const h = p.headlines[0];
    return `<article class="pcard ${OPEN === p.ticker ? 'open' : ''}" data-t="${esc(p.ticker)}">
      <div class="ptop"><div><b class="tk">${esc(p.ticker)}</b> <span class="act ${p.action}">${p.action}</span> ${tierHtml(p)} ${groupTag(p)} ${whoChip(p)}
        <div class="nm">${esc(p.name)}${p.ownership ? ' · ' + esc(p.ownership.control) : ''}</div>
        <div class="pthesis">${thesisShort(p)}</div></div>
        <div class="pscore"><b>${p.score}</b><small>score</small></div></div>
      <div class="pmid">
        <div><small>${p.live ? 'Live' : 'Close'}</small><b>${f0(p.live ? p.live.price : p.close)}</b> ${p.live ? pc(p.live.chg) : pc(p.chg1d)}</div>
        <div><small>RSI · vs SMA20</small><b>${p.rsi == null ? '–' : p.rsi.toFixed(0)}</b> <span class="muted">${p.dist20Atr.toFixed(1)} ATR</span></div>
        <div><small>Stop → Target</small><b>${f0(p.action === 'ACT' && p.wideStop ? p.wideStop : p.stop)} → ${f0(p.target)}</b></div>
      </div>
      <div class="phl">${h ? arrow(h.direct && !h.recap ? h.sentiment : 0) : ''} ${h ? `<a href="${safeUrl(h.link)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}</a>` : '<span class="mute">no recent news</span>'}</div>
    </article>`;
  }

  function rowHtml(p) {
    const h = p.headlines[0];
    const open = OPEN === p.ticker;
    return `<tr class="row ${open ? 'open' : ''}" data-t="${esc(p.ticker)}">
      <td><span class="tk">${esc(p.ticker)}</span> ${groupTag(p)} ${whoChip(p)}<div class="nm">${esc(p.name)}${p.ownership ? " · " + esc(p.ownership.control) : ""}</div><div class="pthesis">${thesisShort(p)}</div></td>
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

  // ---------- stock chart: candles + volume, 1H / 4H / 1D / 1W like a broker app ----------
  // TradingView Lightweight Charts, loaded on first open. Candle files come from tools/ohlc.mjs (daily ~2y, hourly ~3mo;
  // 4H and weekly are merged here). Offline or before the first build, the SVG close-line stays in place.
  const LWC_URL = 'https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js';
  const TFS = [['1H', 'Hourly'], ['4H', '4-hour'], ['1D', 'Daily'], ['1W', 'Weekly']];
  const SHOW = { '1H': 56, '4H': 60, '1D': 120, '1W': 104 }; // bars in view when the chart opens
  let TF = TFS.some(t => t[0] === LS.get('chartTf')) ? LS.get('chartTf') : '1D';
  let SHOWLV = LS.get('chartLv') !== '0', SHOWEV = LS.get('chartEv') !== '0';
  let lwcP = null, CHART = null;
  const OHLC = new Map();
  const loadLwc = () => lwcP || (lwcP = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = LWC_URL; s.crossOrigin = 'anonymous';
    s.onload = () => ok(window.LightweightCharts);
    s.onerror = () => { lwcP = null; s.remove(); no(new Error('chart library')); };
    document.head.appendChild(s);
  }));
  const loadOhlc = t => {
    if (!OHLC.has(t)) OHLC.set(t, fetch(`data/ohlc/${encodeURIComponent(t)}.json?t=${Math.floor(Date.now() / 600000)}`)
      .then(r => { if (!r.ok) throw new Error('no chart file'); return r.json(); })
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
  const levelsOf = p => [['Target', p.target, 'var(--accent)'], ['Resist', p.resistance, 'var(--down)'], ['Support', p.support, 'var(--up)'],
    ['Stop', p.action === 'ACT' && p.wideStop ? p.wideStop : p.stop, 'var(--warn)']];

  function quoteHtml(p) {
    const px = p.live ? p.live.price : p.close, ch = p.live ? p.live.chg : p.chg1d;
    const cls = ch > 0 ? 'up' : ch < 0 ? 'down' : '', d = ch == null ? null : px - px / (1 + ch);
    return `<div class="quote"><b class="qpx">${f0(px)}</b><span class="qchg ${cls}">${d == null ? '' : (d > 0 ? '+' : '') + f0(d)} (${ch == null ? '–' : (ch > 0 ? '+' : '') + (ch * 100).toFixed(2) + '%'})</span>
      <div class="muted">${p.live ? 'Live, today' + (p.live.high ? ` · H ${f0(p.live.high)} L ${f0(p.live.low)}` : '') : 'Close ' + esc(DATA.meta.asOf)} · RSI ${p.rsi == null ? '–' : p.rsi.toFixed(0)} · Rp ${p.valueB.toFixed(0)} B a day</div></div>`;
  }

  function chartBoxHtml(p) {
    return `<div class="sc">
      <div class="sc-bar"><div class="seg" role="group" aria-label="Candle interval">${TFS.map(([k, l]) => `<button data-tf="${k}" aria-pressed="${TF === k}" title="${l} candles">${k}</button>`).join('')}</div>
        <span class="sc-tg"><button class="seg-t" data-ev aria-pressed="${SHOWEV}" title="Past ACT calls and their take-profit / stop-loss exits">Calls</button><button class="seg-t" data-lv aria-pressed="${SHOWLV}" title="Stop, target, support and resistance lines">Levels</button></span></div>
      <div class="sc-status"></div>
      <div class="sc-leg"></div><div class="sc-note"></div>
      <div class="sc-box">${chartSvg(p)}</div>
      <div class="sc-key muted"><span class="kact">▲ ACT</span> convinced call, buy next open · <span class="krad">●</span> WAIT <span class="mute">●</span> PAUSE <span class="down">●</span> SKIP / THIN oversold, not a buy yet (tap or hover a bar for why) · <span class="up">▼ TP</span> <span class="down">▲ SL</span> <span class="mute">■ Exit</span> take profit, stop loss, 15-day exit · <span class="k20">━</span> MA20 <span class="k50">━</span> MA50 · volume in lots · times WIB · Yahoo prices, can lag · chart by <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a></div>
      <div class="sc-calls"></div>
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
    const leg = $('.sc-leg', sc), box = $('.sc-box', sc), noteEl = $('.sc-note', sc);
    let L, j;
    try { [L, j] = await Promise.all([loadLwc(), loadOhlc(p.ticker)]); } catch {
      leg.innerHTML = '<span class="muted">Candles unavailable (offline, or the chart file is not built yet). Showing the last 90 closes.</span>';
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
      timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false, rightOffset: 3 },
      crosshair: { mode: 1 },
      handleScroll: { vertTouchDrag: false },
      localization: { priceFormatter: x => Math.round(x).toLocaleString('en-US') },
    });
    // An open (or about to open) ACT trade draws its own entry / TP / SL instead of today's plan target and stop.
    const lastCall = (j.ev || []).filter(e => e.k === 'call').pop();
    const openT = lastCall && (lastCall.res === 'open' || lastCall.res === 'pending') ? lastCall : null;
    const lvList = SHOWLV ? (openT ? levelsOf(p).filter(l => l[0] === 'Resist' || l[0] === 'Support')
      .concat([['TP', openT.tp, 'var(--up)'], ['SL', openT.stop, 'var(--down)']], openT.entry ? [['Entry', openT.entry, 'var(--ink)']] : []) : levelsOf(p)) : [];
    const lvVals = lvList.map(l => l[1]).filter(x => x != null);
    // With Levels on, the price axis stretches to keep every level line above the volume bars.
    const cs = chart.addCandlestickSeries({ upColor: up, downColor: dn, borderVisible: false, wickUpColor: up, wickDownColor: dn,
      autoscaleInfoProvider: base => { const r = base(); if (!r || !lvVals.length) return r; return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, ...lvVals), maxValue: Math.max(r.priceRange.maxValue, ...lvVals) } }; } });
    cs.setData(bars.map(b => ({ time: b[0], open: b[1], high: b[2], low: b[3], close: b[4] })));
    const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    vol.setData(bars.map(b => ({ time: b[0], value: b[5], color: (b[4] >= b[1] ? up : dn) + '55' })));
    [[20, v('--accent')], [50, v('--warn')]].forEach(([n, c]) => {
      const m = sma(bars, n);
      if (m.length) chart.addLineSeries({ color: c, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(m);
    });
    lvList.forEach(([t, val, c]) => { if (val != null) cs.createPriceLine({ price: val, color: v(c.slice(4, -1)), lineWidth: 1, lineStyle: t === 'Entry' ? 0 : 2, axisLabelVisible: true, title: t }); });
    const notes = callMarkers(cs, bars, j, { up, dn, acc: v('--accent'), warn: v('--warn'), mute: v('--mute') });
    callStatus($('.sc-status', sc), $('.sc-calls', sc), p, j);
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - SHOW[TF]), to: bars.length + 2 });
    const legend = i => {
      const b = bars[i], prev = bars[i - 1];
      if (!b) return;
      const c = b[4] >= b[1] ? 'up' : 'down';
      leg.innerHTML = `<span class="muted">${esc(when(b[0]))}${TF === '1W' ? ' wk' : ''}</span> O <b class="${c}">${f0(b[1])}</b> H <b class="${c}">${f0(b[2])}</b> L <b class="${c}">${f0(b[3])}</b> C <b class="${c}">${f0(b[4])}</b> ${prev ? pc(b[4] / prev[4] - 1, 2) : ''} <span class="muted">Vol ${lots(b[5])}</span>`;
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
    if (!SHOWEV) { cs.setMarkers([]); return notes; }
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
    for (const e of j.ev || []) {
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

  // Where the stock stands against its latest call, plus the list of past calls.
  function callStatus(el, listEl, p, j) {
    const ev = j.ev || [], calls = ev.filter(e => e.k === 'call'), c = calls[calls.length - 1], last = ev[ev.length - 1];
    const px = p.live ? p.live.price : p.close, days = j.d.map(r => r[0]), recent = d => !!d && days.indexOf(d) >= days.length - 11;
    let h = '';
    if (c && c.res === 'pending') h = `<b>ACT call on ${esc(c.d)}:</b> buy at the next open. Stop ${f0(c.stop)}, target ${f0(c.tp)}.`;
    else if (c && c.res === 'open') {
      const toTp = c.tp / px - 1, toSl = c.stop / px - 1;
      const near = toTp <= 0.02 ? ' <span class="flag up">near TP</span>' : toSl >= -0.02 ? ' <span class="flag down">near SL</span>' : '';
      h = `<b>Open ACT trade</b> from ${esc(c.d)}: entry ${f0(c.entry)}, now ${pc(px / c.entry - 1)}${near}. TP ${f0(c.tp)} (${retTxt(toTp)} away) · SL ${f0(c.stop)} (${retTxt(toSl)} away) · day ${c.age} of 15.`;
    } else if (c && recent(c.x)) {
      h = `<span class="flag ${c.res === 'tp' ? 'up' : c.res === 'sl' ? 'down' : ''}">${RES[c.res]}</span> on ${esc(c.x)} at ${f0(c.xp)}: ${retTxt(c.ret)} after fees${c.today ? ' (touched today, live: not final)' : ''}. Called ${esc(c.d)}, entry ${f0(c.entry)}.`;
    } else if (last && last.k === 'radar' && recent(last.d) && p.score >= DATA.meta.actScore) {
      h = `<b>Oversold since ${esc(last.d)}</b> (badge ${esc(p.tier || last.tier)}): not a buy yet.`;
    }
    el.innerHTML = h ? `<div class="callbox">${h}</div>` : '';
    const n = r => calls.filter(e => e.res === r).length, closed = calls.filter(e => e.x);
    const spells = ev.filter(e => e.k === 'radar').length;
    listEl.innerHTML = calls.length
      ? `<details><summary>${calls.length} ACT call${calls.length === 1 ? '' : 's'} on ${esc(p.ticker)} in the chart window: ${n('tp')} TP, ${n('sl')} SL, ${n('time')} timed out${closed.length ? ', average ' + retTxt(closed.reduce((s, e) => s + e.ret, 0) / closed.length) + ' after fees' : ''}</summary>
      <div class="scroll"><table><thead><tr><th>Called</th><th class="n">Score</th><th class="n">Entry</th><th class="n">Stop</th><th class="n">Target</th><th>Result</th></tr></thead><tbody>
      ${calls.slice().reverse().map(e => `<tr><td>${esc(e.d)}${j.liveFrom && e.d >= j.liveFrom ? ' <span class="tag">live</span>' : ''}</td><td class="n">${e.s}</td><td class="n">${f0(e.entry)}</td><td class="n">${f0(e.stop)}</td><td class="n">${f0(e.tp)}</td><td>${e.x ? `<span class="${e.ret > 0 ? 'up' : 'down'}">${RES[e.res]} ${esc(e.x)}, ${retTxt(e.ret)}</span>` : e.res === 'open' ? 'open' : 'buy next open'}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted">Before ${esc(j.liveFrom || 'the live ledger')} these calls are replayed with today's rules and neutral news (there is no news or NeoBDM history to replay), so they are not calls the site actually made at the time. Entry is the next open; one trade per stock at a time. Plus ${spells} oversold spell${spells === 1 ? '' : 's'} that never got an ACT badge.</p></details>`
      : `<p class="muted">No ACT call on ${esc(p.ticker)} in the chart window${spells ? ` (${spells} oversold spell${spells === 1 ? '' : 's'} that never got an ACT badge, mostly market filter off)` : ''}.</p>`;
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
    return `<div class="note mkt"><b>Market filter is OFF: stand aside from new bounce trades.</b> IHSG ${f0(f.ihsg)} is ${(Math.abs(f.ihsg / f.sma200 - 1) * 100).toFixed(1)}% below its 200-day average (${f0(f.sma200)}). In a 4-year test, skipping new trades in this condition cut the worst drawdown from −37% to −13% (chosen on 2022-24, confirmed on 2024-26). Oversold stocks still show, marked <b>PAUSE</b>, so you can watch them.
      <div class="gauge" role="img" aria-label="IHSG is at ${Math.round(gap * 100)}% of its 200-day average"><i style="width:${(gap * 100).toFixed(1)}%"></i><span>IHSG ${f0(f.ihsg)}</span><em>ON at ${f0(f.sma200)}</em></div>
      <div class="muted">Distance to ON: the IHSG needs <b>+${(need * 100).toFixed(1)}%</b> at today's average.${perWeek != null ? ` The average itself is ${perWeek < 0 ? 'falling' : 'rising'} about ${f0(Math.abs(perWeek))} points a week${weeks ? `; at that pace it would meet a flat IHSG in roughly ${Math.round(weeks)} weeks` : ''}.` : ''} You get a Telegram alert the day it flips.</div></div>`;
  }


  const POS = () => (DATA.sizing && DATA.sizing.rule && DATA.sizing.rule.max) || (DATA.market && DATA.market.filter && DATA.market.filter.positions) || 5;
  const acctM = () => { const v = +LS.get('acctM'); return v > 0 ? v : 100; }; // Rp million
  function sizeCalc(price, stop, target) {
    const budget = acctM() * 1e6 / POS(), lots = Math.max(0, Math.floor(budget / (price * 100)));
    const cost = lots * 100 * price, fee = cost * 0.004;
    return { budget, lots, cost, loss: lots * 100 * (price - stop) + fee, gain: lots * 100 * (target - price) - fee };
  }
  function sizerHtml(p, stop, px) {
    const c = sizeCalc(px, stop, p.target), rp = v => 'Rp ' + f0(v), N = POS();
    return `<div class="sizer" data-sizer="${esc(p.ticker)}" data-px="${px}" data-stop="${stop}" data-tg="${p.target}">
      <small class="sz-h">How much to buy</small>
      <div class="sz-in"><label>Account <input type="number" min="1" step="1" inputmode="numeric" value="${acctM()}" data-acct> Rp million</label><span class="muted" data-o="budget">1 of ${N} positions = ${rp(c.budget)}</span></div>
      <div class="sz-out"><div><small>Buy</small><b data-o="lots">${c.lots.toLocaleString()} lots</b><span class="muted" data-o="cost">${rp(c.cost)}</span></div>
        <div><small>If the stop is hit</small><b class="down" data-o="loss">−${rp(c.loss)}</b><span class="muted" data-o="lossp">${(c.loss / (acctM() * 1e6) * 100).toFixed(1)}% of the account</span></div>
        <div><small>At the target</small><b class="up" data-o="gain">+${rp(c.gain)}</b><span class="muted" data-o="gainp">${(c.gain / (acctM() * 1e6) * 100).toFixed(1)}% of the account</span></div>
        <div><button class="chip" data-paper="${esc(p.ticker)}">${paperBook().some(t => t.tk === p.ticker && !t.closed) ? 'In paper journal ✓' : 'Paper-trade this'}</button></div></div>
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
      };
    });
    el.querySelectorAll('[data-paper]').forEach(b => b.onclick = e => {
      e.stopPropagation(); const box = b.closest('[data-sizer]'), tk = b.dataset.paper, book = paperBook();
      if (book.some(t => t.tk === tk && !t.closed)) { document.querySelector('[data-tab=score]').click(); return; }
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
      return `<tr><td><b>${esc(t.tk)}</b></td><td>${esc(t.day)}</td><td class="n">${f0(t.entry)}</td><td class="n">${f0(t.stop)} / ${f0(t.target)}</td><td class="n">${t.lots}</td><td class="n">${f0(exit)}</td><td class="n">${pc(pl, 1)}</td><td><span class="${cls}">${esc(st)}</span></td><td>${t.closed ? '' : '<button class="chip sm" data-close="' + k + '">close</button>'} <button class="chip sm" data-del="${k}" title="Remove">✕</button></td></tr>`;
    }).join('');
    return `<div class="card scroll"><table><thead><tr><th>Stock</th><th>Signal</th><th class="n">Entry</th><th class="n">Stop / target</th><th class="n">Lots</th><th class="n">Now / exit</th><th class="n">P/L</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
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
  function brokerCostHtml(p) {
    const c = p.brokerCost;
    if (!c) return '<p class="muted">No broker inventory for this stock yet (refreshed weekly on a rotation; new stocks fill in within a week).</p>';
    if (c.none) return `<p class="muted">No broker has been a net buyer since the volume peak of ${esc(c.peakDay)} among the 20 most active brokers. Nobody is accumulating.</p>`;
    const px = p.live ? p.live.price : p.close, gap = px / c.cost - 1, st = BSTAT[c.status] || [c.status, ''];
    const lead = c.top[0], leadName = lead ? `${esc(lead.code)}${lead.name ? ' (' + esc(lead.name) + ')' : ''}` : '';
    const who = c.conc === 'one broker' ? `<b>one broker</b>, ${leadName}, a ${esc(BTYPE[lead.type] || lead.type)} broker, did ${Math.round(lead.share * 100)}% of all net buying` : c.conc === 'a few brokers' ? `<b>a few brokers</b> did most of the net buying (top 3: ${Math.round(c.top.reduce((s, x) => s + x.share, 0) * 100)}%), led by ${leadName}` : `the buying is <b>broad</b>: no single broker dominates (largest: ${leadName}, ${Math.round(lead.share * 100)}%)`;
    const dv = DRIVER[c.driver];
    const where = Math.abs(gap) <= 0.05 ? `Today's price is <b>near their cost</b> (${pc(gap, 1)}): the zone where accumulators usually defend.` : gap < 0 ? `Today's price is <b>${pc(-gap, 1).replace(/<[^>]+>/g, '')} below their cost</b>: they are under water, which either means they defend soon or are cutting.` : `Today's price is <b>${pc(gap, 1).replace(/<[^>]+>/g, '')} above their cost</b>: they are in profit, so their cost is a deeper support, not today's price.`;
    return `<div class="bcost">
      <div class="kv">
        <div><small>Volume peak</small><b>${esc(c.peakDay)}</b><div class="muted">${c.peakX ? c.peakX + '× normal volume, ' : ''}${c.days} sessions ago</div></div>
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
  function thesisShort(p) {
    const m = DATA.meta;
    if (p.score < m.actScore) return '<span class="mute">No setup today</span>';
    if (p.tier === 'SKIP') return p.untested ? '<span class="down">Oversold, but the edge is unproven on this stock</span>' : '<span class="down">Oversold, but vetoed (NeoBDM)</span>';
    if (p.tier === 'SUSP') return '<span class="down">No trading for 3 sessions (suspended?)</span>';
    if (p.tier === 'THIN') return '<span class="warn">Oversold, but too thinly traded</span>';
    if (p.tier === 'PAUSE') return '<span class="warn">Oversold, but the market filter says stand aside</span>';
    const go = `expecting <span class="up">▲ ${f0(p.target)}</span> in ${m.params.horizon}d`;
    return p.tier === 'WAIT' ? `<span class="warn">Wait for a bounce candle</span> · ${go}` : `<span class="up">Bounce setup live</span> · ${go}`;
  }

  function tradeMapSvg(p, stop, px, stretch) {
    const bc = p.brokerCost && !p.brokerCost.none && !p.brokerCost.stale && p.brokerCost.cost > stop * 0.97 && p.brokerCost.cost < (stretch || p.target) * 1.03 ? p.brokerCost.cost : null;
    const pts = [['Wrong below', stop, 'var(--down)'], ['Now', px, 'var(--ink)'], ['Target', p.target, 'var(--up)']].concat(stretch ? [['Stretch', stretch, 'var(--up)']] : []).concat(bc ? [['Big buyers\' cost', bc, 'var(--accent)']] : []);
    const lo = Math.min(...pts.map(x => x[1])), hi = Math.max(...pts.map(x => x[1])), W = MQ.matches ? 340 : 600, L = MQ.matches ? 34 : 40, R = MQ.matches ? 34 : 40;
    const x = v => L + ((v - lo) / (hi - lo || 1)) * (W - L - R);
    const pc = v => (v / px - 1 >= 0 ? '+' : '') + ((v / px - 1) * 100).toFixed(1) + '%';
    return `<svg class="tmap" viewBox="0 0 ${W} 74" role="img" aria-label="Trade map: stop ${f0(stop)}, now ${f0(px)}, target ${f0(p.target)}${stretch ? ', stretch ' + f0(stretch) : ''}">
      <rect x="${x(stop)}" y="30" width="${x(px) - x(stop)}" height="8" rx="4" fill="var(--down)" opacity=".25"/>
      <rect x="${x(px)}" y="30" width="${x(stretch || p.target) - x(px)}" height="8" rx="4" fill="var(--up)" opacity=".25"/>
      ${pts.map(([l, v, c], k) => `<line x1="${x(v)}" x2="${x(v)}" y1="24" y2="44" stroke="${c}" stroke-width="${l === 'Now' ? 3 : 2}"/>
        <text x="${x(v)}" y="${k % 2 ? 62 : 16}" text-anchor="middle" fill="${c}" font-size="12" font-weight="600">${l} ${f0(v)}</text>
        ${l === 'Now' ? '' : `<text x="${x(v)}" y="${k % 2 ? 74 : 4}" dy="${k % 2 ? 0 : 0}" text-anchor="middle" fill="var(--mute)" font-size="11">${pc(v)}</text>`}`).join('')}
    </svg>`;
  }

  function thesisHtml(p) {
    const m = DATA.meta, act = p.score >= m.actScore, tier = p.tier || (act ? 'ACT' : 'WATCH');
    const stop = act && p.wideStop ? p.wideStop : p.stop, px = p.live ? p.live.price : p.close;
    const pct = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%';
    const rp = v => 'Rp ' + f0(v);
    const stretch = p.targetMR && p.targetMR > p.target ? p.targetMR : null;
    const rank = DATA.picks.slice().sort((a, b) => b.score - a.score).findIndex(x => x.ticker === p.ticker) + 1;
    const nb = p.neobdm, bm = p.bm, big = nb && nb.bigMoney ? nb.bigMoney.d20 : null;
    const own = p.headlines.filter(h => h.direct && !h.recap);
    const lastNews = own[0];
    const daysAgo = iso => { const d = Math.round((Date.now() - new Date(iso)) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; };

    // 1. verdict (one line, plain)
    const verdict = !act ? `${p.ticker} is not a trade today.`
      : tier === 'SKIP' || tier === 'THIN' ? `${p.ticker} looks oversold, but we skip it.`
      : tier === 'PAUSE' ? `${p.ticker} has been sold hard, but the whole market is in a downtrend, so we stand aside.`
      : tier === 'WAIT' ? `${p.ticker} has been sold hard and may be near a bounce, but it is not a buy yet.`
      : `${p.ticker} has been sold hard and has just started to bounce: the setup we track (paper only).`;
    const doNow = !act ? 'Nothing to do. Keep it on the radar only.'
      : tier === 'SUSP' ? `Nothing to do: ${p.ticker} has not traded for at least 3 sessions (suspended or halted). The numbers below are from its last trading day.`
      : tier === 'THIN' ? `Do not trade it. ${p.ticker} trades only about Rp ${p.valueB.toFixed(1)} B a day; below Rp 5 B a day the entry, stop and exit prices in the tests are not reliable fills, and a few lots move the price.`
      : tier === 'SKIP' && p.untested ? `Do not trade it. ${p.ticker} is one of the 200 stocks added in October 2026; on them the oversold bounce did not beat other stocks reliably, and adding them to the account turned +2.6% a year into −10%. Watch it only.`
      : tier === 'SKIP' ? 'Do not trade it: NeoBDM flags unusual activity (Pinky) or thin trading.'
      : tier === 'PAUSE' ? `Stand aside. The IHSG is below its 200-day average; in that condition oversold bounces failed often enough to cost money overall. It becomes a paper-trade setup only when the market filter turns back on and a bounce candle appears.`
      : tier === 'WAIT' ? `Wait. It becomes a setup only after the first up day: a close above the previous day's high, or a green day closing above the previous close. Then a paper buy at the next morning's open.`
      : `Paper-trade it: note a buy at the next morning's open (around ${rp(px)}) with the stop and target below. Do not put real money behind it yet: over 10 years this setup did no better than shuffled random prices (Track record).`;
    const cls = !act ? 'mute' : tier === 'SKIP' || tier === 'THIN' ? 'down' : tier === 'WAIT' || tier === 'PAUSE' ? 'warn' : 'up';
    const live = act && tier !== 'SKIP' && tier !== 'PAUSE' && tier !== 'THIN' && tier !== 'SUSP';

    // 2. the story, in sentences
    const ab = v => Math.abs(v * 100).toFixed(1) + '%';
    const fell = p.chg20d != null && p.chg20d < -0.05 ? `It has fallen ${ab(p.chg20d)} in about a month${p.chg5d < -0.02 ? `, ${ab(p.chg5d)} of that in the last week` : ''}.` : p.chg5d < -0.02 ? `It has fallen ${ab(p.chg5d)} in a week.` : 'Its price has not moved much lately.';
    const stretched = act ? `That makes it one of the most stretched stocks we follow (#${rank} of ${DATA.picks.length} today).` : `It is #${rank} of ${DATA.picks.length} on our oversold ranking, not stretched enough to trade.`;
    const bet = !act ? '' : tier === 'PAUSE'
      ? `Normally a drop like this sets up a short rebound trade. But with the whole market in a downtrend, those rebounds have failed too often to be worth taking.`
      : `When a stock drops this far this fast, sellers tend to run out and the price often snaps part of the way back. We are betting on that short rebound over the next 3 weeks, not on a long-term recovery.`;
    const flowParts = [];
    if (big) flowParts.push(/strong sell/.test(big) ? 'big brokers have been heavy net sellers this month (NeoBDM)' : /sell/.test(big) ? 'big brokers have been net sellers this month (NeoBDM)' : /buy/.test(big) ? 'big brokers have been net buyers this month (NeoBDM)' : 'big brokers show no clear direction (NeoBDM)');
    if (bm) flowParts.push(bm.quiet ? 'large orders have quietly been building even as the price fell (Bandarmetrics)' : bm.lpm === 'rising' ? 'large-order pressure is building (Bandarmetrics)' : bm.lpm === 'falling' ? 'large orders are still on the sell side (Bandarmetrics)' : 'large-order pressure is flat (Bandarmetrics)');
    const pro = flowParts.filter(s => /buy|building/.test(s)).length, con = flowParts.filter(s => /sell side|sellers/.test(s)).length;
    // No verdict from flow: the 2-year NeoBDM replay found big-money direction did not predict which bounces worked
    // (bounces with big money selling did slightly better), and Bandarmetrics' read failed its own backtest.
    const flowLine = flowParts.length ? `Who is trading it: ${flowParts.join(', while ')}. ${pro || con ? 'Worth knowing, but not a reason to trade or skip: in two years of NeoBDM history, bounces went about as well whichever way big money was trading.' : ''}` : '';
    const fl = (p.filings || [])[0];
    const filingLine = fl ? `Filed with IDX (${esc(fl[0])}): <b>${esc(fl[2])}</b>${fl[4] ? ` (<a href="${safeUrl(fl[4])}" target="_blank" rel="noopener noreferrer">filing</a>)` : ''}. ${fl[1] === 'dilution' ? 'New shares dilute existing holders and often weigh on the price until the deal is done.' : fl[1] === 'idxQuery' ? 'The exchange asked the company to explain unusual trading: something is moving the stock.' : fl[1] === 'mgmt' ? 'A board or management change.' : fl[1] === 'buyback' ? 'The company plans to buy back its own shares.' : fl[1] === 'dividend' ? 'A dividend announcement.' : ''}` : '';
    const gp = p.group, gq = gp && QUAD[gp.quad];
    const groupLine = gp ? `Part of the <b>${esc(gp.name)}</b> group (${esc(gp.alias)}), now #${gp.rank || '–'} of ${gp.of} groups${gq ? ', ' + gq[0] + ' (' + gq[2].charAt(0).toLowerCase() + gq[2].slice(1) + ')' : ''}${gp.hot ? '; the group jumped 10%+ in a week recently' : ''}. Group stocks tend to move together, so watch the rest of the group, but in the 5-year test the group's trend did not change how bounce trades went (Groups tab).` : '';
    const marketLine = act && DATA.market && DATA.market.filter && !DATA.market.filter.ok ? `The market itself is weak: the IHSG is below its 200-day average, which historically made bounce trades lose money overall.` : '';
    const newsLine = lastNews ? `Latest news about ${p.ticker} (${daysAgo(lastNews.published)}): <a href="${safeUrl(lastNews.link)}" target="_blank" rel="noopener noreferrer">“${esc(lastNews.title)}”</a>${lastNews.sentiment < 0 ? ', which reads as negative and may explain part of the drop.' : lastNews.sentiment > 0 ? ', which reads as positive.' : '.'}` : `No news about ${p.ticker} itself this week; the move looks market- or flow-driven.`;

    // 3. what we expect
    const expect = !live ? '' : `<div class="t-exp">
        <div><small>Direction</small><b class="up">▲ Up (a bounce)</b></div>
        <div><small>How far</small><b>${rp(p.target)}</b> <span class="muted">${pct(p.target / px - 1)}${stretch ? `, maybe ${rp(stretch)} (${pct(stretch / px - 1)})` : ''}</span></div>
        <div><small>How long</small><b>up to 3 weeks</b> <span class="muted">${m.params.horizon} trading days, then exit</span></div>
        <div><small>Wrong if</small><b class="down">below ${rp(stop)}</b> <span class="muted">${pct(stop / px - 1)}: exit, no second guessing</span></div>
      </div>`;
    // How much to buy: account / positions (tools/experiment-sizing.mjs), in whole lots of 100 shares, with the loss if the
    // stop is hit and the gain at the target, both after the 0.4% round-trip fee. Account size stays in this browser only.
    const sizer = act && tier !== 'SUSP' ? sizerHtml(p, stop, px) : '';
    const odds = live ? `<p class="t-odds"><b>Honest odds:</b> over 10 years (2017-26) trades like this averaged about −0.3% after costs, and a permutation test put that inside the range of random noise. It looked better in 2022-26 only. No proven edge, so paper-trade it; if the stop is hit you would lose about ${Math.abs((stop / px - 1) * 100).toFixed(0)}%.</p>` : '';

    // 4. technical detail (all the numbers, folded)
    const row = (ok, label, detail) => `<li class="${ok === true ? 'ok' : ok === false ? 'no' : ok === 'warn' ? 'wn' : 'na'}"><span>${ok === true ? '✓' : ok === false ? '✗' : ok === 'warn' ? '!' : '○'}</span><div><b>${label}</b> <span class="muted">${detail}</span></div></li>`;
    const ctx = [];
    if (big) ctx.push(row(null, 'Big money (NeoBDM)', `${big} over 20 days${nb.phase ? ', phase ' + nb.phase.toLowerCase() : ''}; no edge in a 2-year replay`));
    if (bm) ctx.push(row(bm.lpm === 'rising' ? true : bm.lpm === 'falling' ? 'warn' : null, 'LPM (Bandarmetrics)', bm.quiet ? 'rising while price fell (quiet accumulation)' : bm.lpm));
    if (bm && bm.score != null) ctx.push(row(bm.score >= 67 ? true : bm.score <= 33 ? 'warn' : null, 'Accumulation score (experimental)', `${bm.score}/100, 60-day LPM trend vs other stocks`));
    if (p.brokerCost && !p.brokerCost.none) { const g = (p.live ? p.live.price : p.close) / p.brokerCost.cost - 1; ctx.push(row(p.brokerCost.status === 'unloading' ? 'warn' : Math.abs(g) <= 0.05 ? true : null, 'Big buyers\' cost', `${f0(p.brokerCost.cost)} (${(g * 100).toFixed(1)}% from here), ${p.brokerCost.conc}, ${p.brokerCost.status}`)); }
    ctx.push(row(p.newsScore >= 0.5 ? true : p.newsScore <= -0.5 ? 'warn' : null, 'Stock news', `score ${p.newsScore > 0 ? '+' : ''}${p.newsScore} (own headlines only)${p.newsBackdrop ? `; sector backdrop ${p.newsBackdrop > 0 ? '+' : ''}${p.newsBackdrop}, not scored` : ''}`));
    if (act && p.resistance && p.resistance < p.target) ctx.push(row('warn', 'Resistance', `${f0(p.resistance)} sits below the target`));
    if (act && p.rr != null && p.rr < 1) ctx.push(row('warn', 'Reward vs risk', `${p.rr.toFixed(1)} : 1 with the plan stop`));
    const tech = `<details class="t-tech"><summary>Technical detail: the numbers behind this</summary>
      <p class="muted">Oversold score ${p.score} (ACT at ${m.actScore}) = oversold ${p.parts.oversold} + support ${p.parts.support} + news ${p.parts.news}. RSI(14) ${p.rsi == null ? '–' : p.rsi.toFixed(0)}; ${p.dist20Atr.toFixed(1)} ATR from the 20-day average (${f0(p.sma20)}); ATR ${(p.atrPct * 100).toFixed(1)}% a day. Entry ${f0(p.entry)}, plan stop ${f0(p.stop)}, wide stop ${f0(p.wideStop)} (3.5 ATR), target ${f0(p.target)} (+${m.params.targetPct}%), support ${f0(p.support)}, resistance ${f0(p.resistance)}. Bounce candle = close above the previous high, or a green candle closing above the previous close.</p>
      <div class="th-checks"><div><small>Drives the badge (backtested)</small><ul class="th-list">
        ${row(act, 'Oversold', `score ${p.score} vs ${m.actScore}`)}
        ${act ? row(p.confirm ? true : null, 'Bounce candle', p.confirm ? 'seen' : 'not yet') : ''}
        ${act ? (p.untested ? row(false, 'Tested universe', 'no: one of the 200 added stocks, edge not confirmed') : row(tier !== 'SKIP', 'No NeoBDM veto', tier === 'SKIP' ? 'Pinky or illiquid' : 'clear')) : ''}
      </ul></div>
      <div><small>Context (tested, no proven edge)</small><ul class="th-list">${ctx.join('')}</ul></div></div>
      <p class="muted">Backtest, 5 years × 100 stocks: oversold + bounce candle + wide stop ≈ +1% per trade, target hit ≈ 50%, vs −0.7% for non-oversold stocks on the same days. Buying oversold stocks before the bounce candle did not make money.</p>
    </details>`;

    return `<div class="thesis">
      <div class="th-head"><span class="th-stage ${cls}">${esc(verdict)}</span>${tierHtml(p)}</div>
      <div class="t-do ${cls}"><small>What to do</small><p>${doNow}</p></div>
      ${live ? tradeMapSvg(p, stop, px, stretch) : ''}
      ${expect}
      ${sizer}
      <div class="t-story"><small>The story</small>
        <p>${esc(fell)} ${esc(stretched)} ${esc(bet)}</p>
        ${flowLine ? `<p>${esc(flowLine)}</p>` : ''}
        <p>${newsLine}</p>
        ${filingLine ? `<p>${filingLine}</p>` : ''}
        ${groupLine ? `<p>${groupLine}</p>` : ''}
        ${marketLine ? `<p>${esc(marketLine)}</p>` : ''}
      </div>
      ${odds}
      ${tech}
    </div>`;
  }

  function detailHtml(p) {
    const parts = p.parts, max = { oversold: 80, support: 10, news: 10 };
    const jump = [['s-lv', 'Levels'], ['s-news', 'News'], ['s-who', 'Who moves it'], ['s-nb', 'NeoBDM'], ['s-bc', 'Big buyers\' cost'], ['s-bm', 'Bandarmetrics'], ['s-own', 'Owners'], ['s-earn', 'Earnings']];
    return `<div id="s-chart">${quoteHtml(p)}${chartBoxHtml(p)}</div>${thesisHtml(p)}<nav class="jump">${jump.map(([id, l]) => `<button class="chip" data-jump="${id}">${l}</button>`).join('')}</nav><div class="dgrid" id="s-lv"><div>
      <div class="parts">${Object.keys(parts).map(k => `<div class="part"><span>${esc(k)}</span><div class="bar"><i style="width:${Math.min(100, (parts[k] / (max[k] || 10)) * 100)}%"></i></div><em>${parts[k]}</em></div>`).join('')}</div>
      <p class="muted">Score parts: oversold-ness (RSI, 5-day drop, distance under the 20d average) is the main driver of the score; support proximity and news are secondary. It ranked stocks in 2022-26 but did not beat noise over 10 years (Track record).</p></div>
      <div><div class="kv">
        <div><small>Entry</small><b>${f0(p.entry)}</b></div><div><small>Stop${p.score >= DATA.meta.actScore && p.wideStop ? ' (wide, 3.5 ATR)' : ''}</small><b class="down">${f0(p.score >= DATA.meta.actScore && p.wideStop ? p.wideStop : p.stop)}</b>${p.score >= DATA.meta.actScore && p.wideStop && p.wideStop !== p.stop ? `<div class="muted">plan stop ${f0(p.stop)}</div>` : ''}</div><div><small>Target +${DATA.meta.params.targetPct}%</small><b class="up">${f0(p.target)}</b></div>
        <div><small>Bounce target (SMA20)</small><b>${f0(p.targetMR)}</b></div><div><small>${p.supportTouches ? 'Support (' + p.supportTouches + '×)' : 'Support (52w low)'}</small><b>${f0(p.support)}</b></div><div><small>${p.resistanceTouches ? 'Resistance (' + p.resistanceTouches + '×)' : 'Resistance (52w high)'}</small><b>${f0(p.resistance)}</b></div>
        <div><small>Own hit rate*</small><b>${p.hitRate == null ? '–' : Math.round(p.hitRate * 100) + '%'}</b></div><div><small>Value / day</small><b>Rp ${p.valueB.toFixed(0)}B</b></div><div><small>ATR %</small><b>${(p.atrPct * 100).toFixed(1)}%</b></div></div>
        <div class="narr">${esc(p.narrative)}</div>
        <small class="muted">*How often this stock hit +${DATA.meta.params.targetPct}% before the stop within ${DATA.meta.params.horizon}d in its own last year (n=${p.hitN}). Informational only: it did not predict anything in the backtest.</small>
        <h2 id="s-news">Company filings (IDX, last 45 days)</h2>
        ${(p.filings || []).length ? `<ul class="hl-list">${p.filings.map(x => `<li><span class="tag ${x[1] === 'dilution' || x[1] === 'idxQuery' ? 'RISK' : ''}">${esc(x[2])}</span><span>${x[4] ? `<a href="${safeUrl(x[4])}" target="_blank" rel="noopener noreferrer">${esc(x[3])}</a>` : esc(x[3])}<div class="muted">${esc(x[0])}</div></span></li>`).join('')}</ul>` : '<p class="muted">No meaningful filings in the last 45 days.</p>'}
        <p class="muted">Straight from the exchange, usually before the news sites. Routine filings are left out. Tested over 2023-26: no filing type changed how oversold bounces went, so filings are context, not part of the score.</p>
        <h2>News</h2>
        ${p.headlines.length ? `<ul class="hl-list">${p.headlines.map(h => `<li><span class="tag ${esc(h.category)}">${esc(h.category)}</span><span><a href="${safeUrl(h.link)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}</a><div class="muted">${ago(h.published)} · ${!h.direct ? 'sector backdrop, not scored' : h.recap ? 'price recap, not scored' : 'about this stock · ' + (h.sentiment > 0 ? 'supports' : h.sentiment < 0 ? 'risk' : 'neutral')}</div></span></li>`).join('')}</ul>` : '<p class="muted">No scored headlines in the last 7 days.</p>'}
        <button class="chip" data-news="${esc(p.ticker)}">All 30-day headlines for ${esc(p.ticker)} →</button>
        <h2 id="s-who">Who moves it: foreign or retail?</h2>${whoHtml(p)}
        <h2 id="s-nb">NeoBDM flow</h2>${nbHtml(p)}
        <h2 id="s-bc">Who's buying, and at what cost</h2>${brokerCostHtml(p)}
        <h2 id="s-bm">Bandarmetrics read</h2>${bmHtml(p)}
        <h2 id="s-own">Who owns it</h2>${ownHtml(p.ownership)}
        <h2 id="s-earn">Earnings (P&L)</h2>${fundHtml(p.fundamentals)}</div></div>`;
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
    return `<h2>The 200 stocks added in October 2026: shown, not traded</h2>
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

  function renderScore() {
    const el = $('#tab-score'), bt = DATA.backtest, na = DATA.newsAccuracy;
    if (!bt) { el.innerHTML = '<div class="empty">No backtest summary in this data source.</div>'; return; }
    loadTrack();
    el.innerHTML = `${tenYearHtml(DATA.tenYear)}
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
    $('#tab-how').innerHTML = `${labHtml()}${coverageCardHtml(m.dataCoverage)}
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
    if (b.dataset.tab === 'score' && DATA) { const pbx = document.getElementById('paperbox'); if (pbx) { pbx.innerHTML = paperHtml(); bindPaper(pbx); } }
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

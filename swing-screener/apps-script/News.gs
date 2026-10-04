// News radar: Google News RSS (free) -> classify -> tag tickers/sectors -> per-ticker news score.
// Two query types: one per active ticker (direct), and the editable `Themes` sheet
// (government investment, commissioner appointments, ... -> mapped to sectors).

const NEWS_HEADERS = ['Published', 'Source', 'Title', 'Link', 'Category', 'Tickers', 'Sectors', 'Sentiment', 'Query'];

// Rules were tuned against hand labels (tools/news-labels.json, scored by tools/news-score.mjs).
const CATEGORY_RULES = [
  // Order matters: first match wins as the primary category.
  ['RISK', /suspen|\buma\b|\bfca\b|pkpu|pailit|sanksi|denda|tersangka|korupsi|gagal bayar|delisting|going private|ojk (blokir|cabut)/i],
  ['CORP_ACTION', /dividen|buyback|stock split|rights? issue|pmhmetd|divestasi|lepas saham|private placement|akuisisi|tender offer|\bmtn\b|obligasi|\bipo\b/i],
  ['INSIDER', /(presdir|direktur|komisaris|dirut|pengendali)[^]*(belanjakan|beli saham|borong|tambah kepemilikan)|insider/i],
  ['COMMISSIONER', /komisaris|direksi|direktur utama|\bdirut\b|\bceo\b|masa jabatan|reshuffle|pengurus/i],
  ['MACRO', /\bbi rate\b|suku bunga|bunga penjaminan|\bthe fed\b|inflasi|\bbps\b/i],
  ['GOV_INVEST', /\bplts\b|\bpph\b|bebas pajak|danantara|investasi pemerintah|proyek strategis|\bpsn\b|hilirisasi|kementerian|menko|insentif|subsidi|stimulus|apbn|kemenkeu|bumn|swasembada|makan bergizi|\bmbg\b|ibu kota nusantara|\bikn\b|penyertaan modal/i],
  ['CONTRACT', /kontrak|tender|proyek baru|proyek berjalan|progres|kerja sama|kemitraan|pesanan|order book/i],
  ['EARNINGS', /\blaba\b|\brugi\b|pendapatan|\bkinerja\b|\bebitda\b/i],
];

const POSITIVE = /\bnaik\b|melonjak|menguat|meroket|melesat|melompat|terbang|\btumbuh\b|dividen|buyback|akuisisi|kontrak baru|kantongi kontrak|suntik|insentif|stimulus|ekspansi|rekor|upgrade|net buy|diburu|akumulasi|borong|surplus|positif|jagokan|rebound|\bcuan\b|\buntung\b|belanjakan|bebas pajak|tanggung pph/i;
const NEGATIVE = /\bturun\w*|anjlok|melemah|\brugi\b|gagal bayar|suspen|denda|korupsi|tersangka|pailit|pkpu|downgrade|sanksi|\buma\b|\bfca\b|aksi jual|net sell|jual bersih|asing lepas|dilepas asing|terkoreksi|\bkoreksi\b|defisit|negatif|batal|tunda|cabut|\bjatuh\b|rontok|ambruk|ambles|merosot|tertekan|terjun|mentok arb|kena arb|tergerus|longsor|risiko baru|\bboncos\b|pangkas|berkurang|kenaikan (bi rate|suku bunga)|kerek suku bunga|suku bunga (\w+ ){0,3}naik/i;
// Market wraps ("IHSG ...", "Rekomendasi Saham Hari Ini: A, B, C"): a stock named there is a side mention.
const ROUNDUP = /rekomendasi saham|saham pilihan|stockpick|halaman \d/i;
// Gold-price and "buyback emas" pages are Antam's product price spam, not the stock.
const IGNORE = /harga (buyback )?emas|buyback emas|logam mulia|rincian harga emas/i;
const NOT_TICKERS = ['IHSG', 'BUMN', 'APBN', 'IDX', 'OJK', 'PLTS', 'DPRD', 'QRIS'];

function tickerTokens_(title) {
  return (title.match(/\b[A-Z]{4}\b/g) || []).filter(t => NOT_TICKERS.indexOf(t) < 0).length;
}

const DEFAULT_THEMES = [
  ['Danantara investasi saham BUMN', 'GOV_INVEST', 'Banking,Energy,Mining,Telco'],
  ['investasi pemerintah hilirisasi nikel tembaga', 'GOV_INVEST', 'Mining,Metals'],
  ['proyek strategis nasional kontrak infrastruktur', 'GOV_INVEST', 'Construction,Energy'],
  ['makan bergizi gratis emiten', 'GOV_INVEST', 'Consumer,Poultry'],
  ['stimulus ekonomi insentif pajak sektor', 'GOV_INVEST', 'Consumer,Property,Banking'],
  ['penunjukan komisaris baru emiten', 'COMMISSIONER', ''],
  ['RUPS pergantian komisaris direksi', 'COMMISSIONER', ''],
  ['BI rate suku bunga perbankan', 'MACRO', 'Banking,Property'],
  ['harga batu bara DMO royalti', 'MACRO', 'Energy,Mining'],
  ['investasi energi terbarukan PLN', 'GOV_INVEST', 'Energy'],
];

function ensureThemes_() {
  const sh = sheet_('Themes', ['Query', 'Category', 'Sectors (comma-separated, match Universe sector)']);
  if (sh.getLastRow() < 2) sh.getRange(2, 1, DEFAULT_THEMES.length, 3).setValues(DEFAULT_THEMES);
  return sh;
}

function classify_(title) {
  let category = 'OTHER';
  for (let i = 0; i < CATEGORY_RULES.length; i++) {
    if (CATEGORY_RULES[i][1].test(title)) { category = CATEGORY_RULES[i][0]; break; }
  }
  const nTick = tickerTokens_(title);
  const roundup = ROUNDUP.test(title) || nTick >= 3 || (/\bihsg\b/i.test(title) && nTick >= 2);
  const pos = title.search(POSITIVE), neg = title.search(NEGATIVE);
  let sent = 0;
  if (pos >= 0 && neg < 0) sent = 1;
  else if (neg >= 0 && pos < 0) sent = -1;
  else if (pos >= 0 && neg >= 0) sent = pos < neg ? 1 : -1; // mixed: the headline's lead word wins
  // Clickbait questions ("Saatnya Beli?") and market wraps say nothing reliable about one stock.
  if (/\?\s*$/.test(title) || roundup) sent = 0;
  // Two names with opposite moves in one headline cannot be attributed to either.
  if (pos >= 0 && neg >= 0 && nTick >= 2) sent = 0;
  return { category: category, sentiment: sent, roundup: roundup };
}

function rssUrl_(q) {
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:7d') + '&hl=id&gl=ID&ceid=ID:id';
}

function parseRss_(xml) {
  const out = [];
  try {
    const root = XmlService.parse(xml).getRootElement();
    root.getChild('channel').getChildren('item').forEach(it => {
      const raw = it.getChildText('title') || '';
      const cut = raw.lastIndexOf(' - ');
      out.push({
        title: cut > 0 ? raw.slice(0, cut) : raw,
        source: cut > 0 ? raw.slice(cut + 3) : (it.getChildText('source') || ''),
        link: it.getChildText('link'),
        published: new Date(it.getChildText('pubDate')),
      });
    });
  } catch (e) { /* malformed feed: skip */ }
  return out;
}

function escapeRe_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// uni: [{ticker, name, sector, aliases[]}]
function fetchNews() {
  const uni = readUniverse_();
  const themes = ensureThemes_().getDataRange().getValues().slice(1).filter(r => r[0]);
  const queries = [];
  uni.forEach(u => queries.push({ q: '"' + u.name + '" OR ' + u.ticker + ' saham', direct: u.ticker }));
  themes.forEach(t => queries.push({ q: t[0], themeCat: t[1], sectors: String(t[2] || '').split(',').map(s => s.trim()).filter(Boolean) }));

  const resp = UrlFetchApp.fetchAll(queries.map(x => ({ url: rssUrl_(x.q), muteHttpExceptions: true })));

  const aliasRes = buildAliasRes_(uni);

  const sh = sheet_('News', NEWS_HEADERS);
  const existing = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, NEWS_HEADERS.length).getValues() : [];
  const seen = {};
  existing.forEach(r => { seen[normTitle_(r[2])] = true; });

  const fresh = [];
  resp.forEach((r, i) => {
    if (r.getResponseCode() !== 200) return;
    parseRss_(r.getContentText()).forEach(item => {
      const key = normTitle_(item.title);
      if (seen[key]) return;
      const row = buildNewsRow_(item, queries[i], aliasRes);
      if (!row) return;
      seen[key] = true;
      fresh.push(row);
    });
  });

  // Keep 14 days, newest first.
  const cutoff = Date.now() - 14 * 86400000;
  const all = fresh.concat(existing).filter(r => new Date(r[0]).getTime() >= cutoff)
    .sort((a, b) => new Date(b[0]) - new Date(a[0]));
  sh.getRange(2, 1, Math.max(sh.getLastRow(), 2), NEWS_HEADERS.length).clearContent();
  if (all.length) sh.getRange(2, 1, all.length, NEWS_HEADERS.length).setValues(all);
  sh.getRange('A:A').setNumberFormat('dd mmm HH:mm');
  return fresh.length;
}

// A headline counts as "about" a stock when it names the ticker, the company, or one of its aliases.
function buildAliasRes_(uni) {
  return uni.map(u => ({
    ticker: u.ticker,
    re: new RegExp('\\b(' + [u.ticker, u.name].concat(u.aliases).filter(Boolean).map(escapeRe_).join('|') + ')\\b', 'i'),
  }));
}

// One RSS item -> sheet row, or null if it is not about anything we track.
// Tickers are tagged ONLY when the headline itself names the company/ticker: Google News returns loosely related
// stories for a company query, and trusting the query alone mis-tagged a lot of headlines.
function buildNewsRow_(item, qd, aliasRes) {
  if (IGNORE.test(item.title)) return null;
  const cl = classify_(item.title);
  const tickers = [];
  aliasRes.forEach(a => { if (a.re.test(item.title)) tickers.push(a.ticker); });
  const sectors = qd.sectors || [];
  if (!tickers.length && !sectors.length) return null;
  let category = cl.category;
  // Theme queries only supply sectors; a headline the classifier calls OTHER stays OTHER (no theme fallback: it mislabelled PLN/Batam local stories as GOV_INVEST).
  return [item.published, item.source, item.title, item.link, category, tickers.join(','), sectors.join(','), cl.sentiment, qd.q];
}

function normTitle_(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

// Sheet reader. Scoring itself is pure (scoreNews_) so it can be tested in Node.
function newsScores_(uni) {
  const sh = SpreadsheetApp.getActive().getSheetByName('News');
  const rows = sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, NEWS_HEADERS.length).getValues() : [];
  return scoreNews_(rows, uni, Date.now());
}

// rows use NEWS_HEADERS order. Returns {TICKER: {score, top, topLink, items:[{title,link,category,sentiment,share,published}]}}
function scoreNews_(rows, uni, nowMs) {
  const out = {};
  uni.forEach(u => { out[u.ticker] = { score: 0, top: '', topLink: '', topAbs: 0, items: [] }; });
  const bySector = {};
  uni.forEach(u => { (bySector[u.sector] = bySector[u.sector] || []).push(u.ticker); });
  const catWeight = { RISK: 1.5, COMMISSIONER: 1.0, GOV_INVEST: 1.2, CORP_ACTION: 1.2, CONTRACT: 1.0, EARNINGS: 1.0, MACRO: 0.8, OTHER: 0.5 };

  rows.forEach(r => {
    const ageDays = (nowMs - new Date(r[0]).getTime()) / 86400000;
    if (ageDays > 7) return;
    const category = r[4], sent = Number(r[7]) || 0;
    // Government-investment news is thesis-supporting even when the headline has no polarity word.
    const eff = sent === 0 && category === 'GOV_INVEST' ? 0.3 : sent;
    if (eff === 0) return;
    const w = (catWeight[category] || 0.5) * Math.pow(0.85, ageDays);
    const apply = (ticker, share) => {
      const o = out[ticker];
      if (!o) return;
      const c = eff * w * share;
      o.score += c;
      o.items.push({ title: r[2], link: r[3], category: category, sentiment: eff, share: share, published: r[0] });
      if (Math.abs(c) > o.topAbs) { o.topAbs = Math.abs(c); o.top = '[' + category + '] ' + r[2]; o.topLink = r[3]; }
    };
    const direct = String(r[5]).split(',').filter(Boolean);
    direct.forEach(t => apply(t, 1));
    String(r[6]).split(',').filter(Boolean).forEach(sec => (bySector[sec] || []).forEach(t => {
      if (direct.indexOf(t) < 0) apply(t, 0.25);
    }));
  });
  Object.keys(out).forEach(t => { out[t].score = Math.max(-3, Math.min(3, out[t].score)); });
  return out;
}

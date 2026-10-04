// IDX swing screener (Phase 0). Bound to a Google Sheet.
// Prices: GOOGLEFINANCE. News: Google News RSS. Maths: Indicators.gs. News tagging: News.gs.
//
// Sheets (auto-created by Setup): Config, Universe, Themes, Screener, News.
// Menu "IDX Screener": Setup -> Refresh news -> Run screener -> Install triggers.

const CONFIG_DEFAULTS = [
  ['TARGET_PCT', 8, 'Return you want, in % (swing target)'],
  ['HORIZON_DAYS', 15, 'Trading days allowed to reach the target'],
  ['STOP_ATR_MULT', 2.5, 'Stop distance in ATRs (also used by the hit-rate backtest). Backtest: tight stops (1.5) kill the bounce edge'],
  ['MIN_VALUE_B', 5, 'Minimum average daily value traded, Rp billion (liquidity filter)'],
  ['HISTORY_DAYS', 400, 'Calendar days of price history to pull (~270 trading days)'],
  ['INDEX_SYMBOL', 'IDX:COMPOSITE', 'GOOGLEFINANCE symbol for IHSG. Blank = skip relative strength'],
  ['TOP_N', 10, 'How many picks to highlight / send to Telegram'],
];

// ticker, name, sector, aliases (comma-separated, used to match news headlines), active
const UNIVERSE_SEED = [
  ['BBCA', 'Bank Central Asia', 'Banking', 'BCA', 'Y'],
  ['BBRI', 'Bank Rakyat Indonesia', 'Banking', 'BRI', 'Y'],
  ['BMRI', 'Bank Mandiri', 'Banking', 'Mandiri', 'Y'],
  ['BBNI', 'Bank Negara Indonesia', 'Banking', 'BNI', 'Y'],
  ['BRIS', 'Bank Syariah Indonesia', 'Banking', 'BSI', 'Y'],
  ['TLKM', 'Telkom Indonesia', 'Telco', 'Telkom', 'Y'],
  ['ISAT', 'Indosat Ooredoo Hutchison', 'Telco', 'Indosat', 'Y'],
  ['ASII', 'Astra International', 'Automotive', 'Astra', 'Y'],
  ['ADRO', 'Alamtri Resources Indonesia', 'Energy', 'Adaro,Alamtri', 'Y'],
  ['PTBA', 'Bukit Asam', 'Energy', 'PTBA', 'Y'],
  ['PGAS', 'Perusahaan Gas Negara', 'Energy', 'PGN', 'Y'],
  ['MEDC', 'Medco Energi', 'Energy', 'Medco', 'Y'],
  ['AMMN', 'Amman Mineral', 'Mining', 'Amman', 'Y'],
  ['ANTM', 'Aneka Tambang', 'Metals', 'Antam', 'Y'],
  ['INCO', 'Vale Indonesia', 'Metals', 'Vale Indonesia', 'Y'],
  ['MDKA', 'Merdeka Copper Gold', 'Metals', 'Merdeka Copper', 'Y'],
  ['CPIN', 'Charoen Pokphand Indonesia', 'Poultry', 'Charoen', 'Y'],
  ['JPFA', 'Japfa Comfeed', 'Poultry', 'Japfa', 'Y'],
  ['ICBP', 'Indofood CBP', 'Consumer', 'Indofood CBP', 'Y'],
  ['INDF', 'Indofood Sukses Makmur', 'Consumer', 'Indofood', 'Y'],
  ['UNVR', 'Unilever Indonesia', 'Consumer', 'Unilever', 'Y'],
  ['KLBF', 'Kalbe Farma', 'Healthcare', 'Kalbe', 'Y'],
  ['GOTO', 'GoTo Gojek Tokopedia', 'Tech', 'GoTo', 'Y'],
  ['JSMR', 'Jasa Marga', 'Construction', 'Jasa Marga', 'Y'],
  ['SMGR', 'Semen Indonesia', 'Construction', 'Semen Indonesia', 'Y'],
  ['BSDE', 'Bumi Serpong Damai', 'Property', 'BSD', 'Y'],
  ['CTRA', 'Ciputra Development', 'Property', 'Ciputra', 'Y'],
];

const SCREENER_HEADERS = ['Rank', 'Ticker', 'Name', 'Sector', 'Action', 'Score', 'Setup', 'Close', '1D %', '5D %', 'RSI',
  'ATRs vs SMA20', 'Support', 'Resistance', 'Entry', 'Stop', 'Target', 'Bounce target (SMA20)', 'R/R', 'News', 'Top headline (link)', 'Narrative'];

// ---------- menu & setup ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('IDX Screener')
    .addItem('1. Setup sheets', 'setup')
    .addItem('2. Refresh news', 'refreshNewsUi_')
    .addItem('3. Run screener', 'runScreener')
    .addItem('Install daily triggers', 'installTriggers')
    .addToUi();
}

function setup() {
  const cfg = sheet_('Config', ['Key', 'Value', 'Note']);
  if (cfg.getLastRow() < 2) cfg.getRange(2, 1, CONFIG_DEFAULTS.length, 3).setValues(CONFIG_DEFAULTS);
  const uni = sheet_('Universe', ['Ticker', 'Name', 'Sector', 'Aliases', 'Active']);
  if (uni.getLastRow() < 2) uni.getRange(2, 1, UNIVERSE_SEED.length, 5).setValues(UNIVERSE_SEED);
  ensureThemes_();
  sheet_('News', NEWS_HEADERS);
  sheet_('Screener', SCREENER_HEADERS);
  SpreadsheetApp.getActive().toast('Sheets ready. Edit Config / Universe / Themes, then run News and Screener.');
}

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (name === 'Screener') {
      sh.getRange(2, 1, 1, headers.length).setValues([headers]);
      sh.getRange(2, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      sh.setFrozenRows(2);
    } else {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function readConfig_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Config');
  if (!sh) throw new Error('Run "1. Setup sheets" first.');
  const m = {};
  sh.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) m[r[0]] = r[1]; });
  const num = (k, d) => (m[k] === '' || m[k] === undefined ? d : Number(m[k]));
  return {
    targetPct: num('TARGET_PCT', 8), horizon: num('HORIZON_DAYS', 15), stopMult: num('STOP_ATR_MULT', 2.5),
    minValueB: num('MIN_VALUE_B', 5), historyDays: num('HISTORY_DAYS', 400), topN: num('TOP_N', 10),
    indexSymbol: String(m.INDEX_SYMBOL || '').trim(),
  };
}

function readUniverse_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Universe');
  if (!sh) throw new Error('Run "1. Setup sheets" first.');
  return sh.getDataRange().getValues().slice(1)
    .filter(r => r[0] && String(r[4]).toUpperCase() !== 'N')
    .map(r => ({
      ticker: String(r[0]).trim().toUpperCase(), name: String(r[1]).trim(), sector: String(r[2]).trim(),
      aliases: String(r[3] || '').split(',').map(s => s.trim()).filter(Boolean),
    }));
}

// ---------- prices via GOOGLEFINANCE ----------

// Writes GOOGLEFINANCE formulas into a scratch sheet in blocks of 7 columns, waits, reads them back.
// symbols: ['IDX:BBCA', ...]  ->  {symbol: bars | null}
function fetchBars_(symbols, historyDays) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('_fetch');
  if (!sh) sh = ss.insertSheet('_fetch');
  sh.hideSheet();
  const BLOCK = 7, BATCH = 8;
  const out = {};
  const start = new Date(Date.now() - historyDays * 86400000);
  const startExpr = 'DATE(' + start.getFullYear() + ',' + (start.getMonth() + 1) + ',' + start.getDate() + ')';

  for (let b0 = 0; b0 < symbols.length; b0 += BATCH) {
    const batch = symbols.slice(b0, b0 + BATCH);
    sh.clear();
    const needCols = batch.length * BLOCK;
    if (sh.getMaxColumns() < needCols) sh.insertColumnsAfter(sh.getMaxColumns(), needCols - sh.getMaxColumns());
    batch.forEach((sym, i) => {
      sh.getRange(1, i * BLOCK + 1).setFormula('=GOOGLEFINANCE("' + sym + '","all",' + startExpr + ',TODAY(),"DAILY")');
    });
    SpreadsheetApp.flush();
    for (let tries = 0; tries < 12; tries++) {
      const heads = batch.map((s, i) => sh.getRange(1, i * BLOCK + 1).getDisplayValue());
      if (!heads.some(h => h === 'Loading...')) break;
      Utilities.sleep(1500);
    }
    const lastRow = Math.max(sh.getLastRow(), 2);
    const vals = sh.getRange(1, 1, lastRow, needCols).getValues();
    batch.forEach((sym, i) => { out[sym] = parseBars_(vals, i * BLOCK); });
  }
  return out;
}

// Reads one GOOGLEFINANCE block (header + rows of Date,Open,High,Low,Close,Volume).
function parseBars_(vals, col) {
  const bars = { d: [], o: [], h: [], l: [], c: [], v: [] };
  for (let r = 1; r < vals.length; r++) {
    const row = vals[r].slice(col, col + 6);
    if (!(row[0] instanceof Date)) continue;
    const nums = row.slice(1).map(Number);
    if (nums.some(x => isNaN(x)) || nums[3] <= 0) continue; // c = nums[3]
    bars.d.push(row[0]); bars.o.push(nums[0]); bars.h.push(nums[1]);
    bars.l.push(nums[2]); bars.c.push(nums[3]); bars.v.push(nums[4]);
  }
  return bars.c.length ? bars : null;
}

// ---------- main run ----------

function runScreener() {
  const cfg = readConfig_();
  const uni = readUniverse_();
  const symbols = uni.map(u => 'IDX:' + u.ticker);
  if (cfg.indexSymbol) symbols.push(cfg.indexSymbol);
  const bars = fetchBars_(symbols, cfg.historyDays);
  const idx = cfg.indexSymbol && bars[cfg.indexSymbol] ? bars[cfg.indexSymbol].c : null;
  const news = newsScores_(uni);

  const picks = [], skipped = [];
  uni.forEach(u => {
    const b = bars['IDX:' + u.ticker];
    if (!b) { skipped.push(u.ticker + ' (no data)'); return; }
    const a = analyse_(b, idx, cfg);
    if (!a) { skipped.push(u.ticker + ' (short history)'); return; }
    if (a.avgValue / 1e9 < cfg.minValueB) { skipped.push(u.ticker + ' (illiquid)'); return; }
    picks.push(buildPick_(u, b, a, news[u.ticker], null, cfg));
  });
  picks.sort((x, y) => y.score - x.score);
  const market = marketRead_(picks, idx);

  const stamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'EEE dd MMM yyyy HH:mm') + ' WIB';
  writeScreenerSheet_(picks, market, cfg, skipped, stamp);
  saveState_({
    meta: { generatedAt: new Date().toISOString(), engine: 'oversold-v2', actScore: ACT_SCORE, params: cfg, universe: uni.length, ranked: picks.length, skipped: skipped, sample: false, sources: { prices: 'GOOGLEFINANCE', news: 'Google News RSS', ownership: null } },
    market: market, picks: picks, news: newsForApi_(), ownership: null, backtest: null, forward: null,
  });
  SpreadsheetApp.getActive().toast('Screener updated: ' + picks.length + ' ranked, ' + skipped.length + ' skipped.');
  sendDigest_(picks, cfg, stamp);
}

function writeScreenerSheet_(picks, market, cfg, skipped, stamp) {
  const sh = sheet_('Screener', SCREENER_HEADERS);
  sh.getRange(3, 1, Math.max(sh.getLastRow(), 3), SCREENER_HEADERS.length).clearContent().clearFormat();
  sh.getRange(1, 1).setValue('Target +' + cfg.targetPct + '% in ' + cfg.horizon + 'd | stop ' + cfg.stopMult + ' ATR | ' + market.regime +
    ' (' + market.oversoldCount + '/' + market.of + ' oversold) | updated ' + stamp + (skipped.length ? ' | skipped: ' + skipped.join(', ') : ''));
  if (!picks.length) return;
  const data = picks.map((p, i) => {
    const h = p.headlines[0];
    const link = h ? '=HYPERLINK("' + String(h.link).replace(/"/g, '""') + '","' + ('[' + h.category + '] ' + h.title).replace(/"/g, '""') + '")' : '';
    return [i + 1, p.ticker, p.name, p.sector, p.action, p.score, p.setup, p.close, p.chg1d, p.chg5d,
      p.rsi === null ? '' : Math.round(p.rsi), p.dist20Atr, p.support, p.resistance, p.entry, p.stop, p.target,
      p.targetMR === null ? '' : p.targetMR, p.rr === null ? '' : p.rr, p.newsScore, link, p.narrative];
  });
  const n = data.length;
  sh.getRange(3, 1, n, SCREENER_HEADERS.length).setValues(data);
  sh.getRange(3, 8, n, 1).setNumberFormat('#,##0');
  sh.getRange(3, 9, n, 2).setNumberFormat('+0.0%;-0.0%;0.0%');
  sh.getRange(3, 12, n, 1).setNumberFormat('+0.0;-0.0;0.0');
  sh.getRange(3, 13, n, 6).setNumberFormat('#,##0');
  sh.getRange(3, 19, n, 1).setNumberFormat('0.0');
  sh.getRange(3, 20, n, 1).setNumberFormat('+0.0;-0.0;0.0');
  sh.getRange(3, 22, n, 1).setWrap(false);
  applyScreenerFormatting_(sh, n);
  sh.setFrozenRows(2);
  sh.setFrozenColumns(2);
}

function applyScreenerFormatting_(sh, n) {
  const R = SpreadsheetApp.InterpolationType.NUMBER;
  const score = SpreadsheetApp.newConditionalFormatRule().setGradientMaxpointWithValue('#34a853', R, '85')
    .setGradientMidpointWithValue('#fff2cc', R, '55').setGradientMinpointWithValue('#f4cccc', R, '25').setRanges([sh.getRange(3, 6, n, 1)]).build();
  const act = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('ACT').setBackground('#d9ead3').setBold(true).setRanges([sh.getRange(3, 5, n, 1)]).build();
  const skip = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('SKIP').setFontColor('#b91c1c').setRanges([sh.getRange(3, 5, n, 1)]).build();
  const pos = SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor('#15803d').setRanges([sh.getRange(3, 9, n, 2), sh.getRange(3, 20, n, 1)]).build();
  const neg = SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#b91c1c').setRanges([sh.getRange(3, 9, n, 2), sh.getRange(3, 20, n, 1)]).build();
  sh.setConditionalFormatRules([score, act, skip, pos, neg]);
}

// ---------- JSON API for the web app (same shape as the GitHub snapshot) ----------

// Latest payload lives in a hidden sheet, chunked because a cell holds ~50k characters.
function saveState_(obj) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('_state');
  if (!sh) sh = ss.insertSheet('_state');
  sh.hideSheet();
  sh.clear();
  const s = JSON.stringify(obj);
  const chunks = [];
  for (let i = 0; i < s.length; i += 40000) chunks.push([s.slice(i, i + 40000)]);
  sh.getRange(1, 1, chunks.length, 1).setValues(chunks);
}

function newsForApi_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('News');
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, Math.min(sh.getLastRow() - 1, 300), NEWS_HEADERS.length).getValues().map(r => ({
    published: new Date(r[0]).toISOString(), source: r[1], title: r[2], link: r[3], category: r[4],
    tickers: r[5] ? String(r[5]).split(',') : [], sectors: r[6] ? String(r[6]).split(',') : [], sentiment: Number(r[7]) || 0,
    roundup: !!classify_(String(r[2])).roundup,
  }));
}

// GET ?token=...  -> latest payload. Set Script Property API_TOKEN first (Project Settings > Script Properties).
// Deploy: Deploy > New deployment > Web app, execute as Me, access Anyone. The token is the only gate.
function doGet(e) {
  const token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!token || !e || !e.parameter || e.parameter.token !== token) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'unauthorized' })).setMimeType(ContentService.MimeType.JSON);
  }
  const sh = SpreadsheetApp.getActive().getSheetByName('_state');
  const text = sh && sh.getLastRow() ? sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => r[0]).join('') : '{"error":"run the screener first"}';
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function refreshNewsUi_() {
  const n = fetchNews();
  SpreadsheetApp.getActive().toast(n + ' new headlines.');
}

// ---------- triggers & digest ----------

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['runScreenerScheduled', 'fetchNews'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  // IDX closes 16:00 WIB; GOOGLEFINANCE lags, so run the screener at ~17:00.
  ScriptApp.newTrigger('runScreenerScheduled').timeBased().everyDays(1).atHour(17).create();
  ScriptApp.newTrigger('fetchNews').timeBased().everyHours(2).create();
  SpreadsheetApp.getActive().toast('Triggers installed: news every 2h, screener daily ~17:00 WIB.');
}

function runScreenerScheduled() {
  const dow = Number(Utilities.formatDate(new Date(), 'Asia/Jakarta', 'u')); // 1=Mon..7=Sun
  if (dow >= 6) return;
  fetchNews();
  runScreener();
}

// Optional: set Script Properties TG_TOKEN and TG_CHAT to get the top picks on Telegram.
function sendDigest_(picks, cfg, stamp) {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('TG_TOKEN'), chat = p.getProperty('TG_CHAT');
  if (!token || !chat || !picks.length) return;
  const top = picks.filter(x => x.action === 'ACT').slice(0, cfg.topN);
  const lines = top.map((x, i) => (i + 1) + '. ' + x.ticker + ' [' + x.score + '] ' + x.setup + ' | in ' +
    Math.round(x.entry) + ' stop ' + Math.round(x.stop) + ' tgt ' + Math.round(x.target) +
    (x.headlines[0] ? '\n   ' + x.headlines[0].title + '\n   ' + x.headlines[0].link : ''));
  const text = 'IDX swing picks ' + stamp + '\n' + (lines.length ? lines.join('\n') : 'No ACT picks today.') +
    '\nNot financial advice.';
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chat, text: text }),
  });
}

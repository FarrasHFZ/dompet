// JSON API for the Wallet PWA. Data lives in the bound Google Sheet.
// All requests are POST {token, action, ...}. The first 'init' call claims the
// access code (stored in Script Properties); every later call must present it.

const TX_SHEET = 'Transactions';
const INCOME_SHEET = 'Income';

// First matching rule wins. Edit freely.
const CATEGORY_RULES = [
  ['Makan & Minum', ['makan', 'kopi', 'coffee', 'kfc', 'mcd', 'starbucks', 'bakso', 'nasi', 'ayam', 'sate', 'mie', 'bubur', 'roti', 'boba', 'teh', 'gofood', 'grabfood', 'shopeefood', 'resto', 'cafe', 'lunch', 'dinner', 'breakfast', 'snack', 'jajan', 'minum']],
  ['Transportasi', ['grab', 'gojek', 'gocar', 'goride', 'ojek', 'bensin', 'pertamax', 'pertalite', 'parkir', 'tol', 'krl', 'mrt', 'lrt', 'transjakarta', 'busway', 'taxi', 'taksi', 'bluebird', 'kereta', 'e-toll', 'etoll']],
  ['Belanja Harian', ['indomaret', 'alfamart', 'supermarket', 'superindo', 'hypermart', 'sayur', 'belanja', 'grocery', 'groceries', 'telur', 'beras']],
  ['Tagihan', ['listrik', 'pln', 'token', 'pdam', 'wifi', 'indihome', 'internet', 'pulsa', 'paket data', 'telkomsel', 'bpjs', 'kos', 'sewa', 'rent', 'cicilan']],
  ['Belanja', ['shopee', 'tokopedia', 'lazada', 'baju', 'sepatu', 'uniqlo', 'zara', 'skincare', 'amazon']],
  ['Hiburan', ['netflix', 'spotify', 'youtube', 'bioskop', 'cinema', 'xxi', 'game', 'steam', 'konser', 'disney']],
  ['Kesehatan', ['dokter', 'apotek', 'obat', 'rumah sakit', 'klinik', 'vitamin', 'gym', 'kimia farma']],
  ['Pendidikan', ['buku', 'kursus', 'course', 'udemy', 'sekolah', 'kuliah', 'spp']],
  ['Perjalanan', ['hotel', 'tiket', 'pesawat', 'traveloka', 'airbnb', 'agoda']],
];
const DEFAULT_CATEGORY = 'Lainnya';

function doGet() {
  return json_({ ok: true, data: 'Wallet API' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const stored = PropertiesService.getScriptProperties().getProperty('TOKEN');

    if (req.action === 'init') {
      if (stored) throw new Error('Kode akses sudah dibuat. Masukkan kode yang sama.');
      if (!req.token || String(req.token).length < 6) throw new Error('Kode minimal 6 karakter.');
      PropertiesService.getScriptProperties().setProperty('TOKEN', String(req.token));
      return json_({ ok: true, data: load_() });
    }

    if (!stored) throw new Error('SETUP');
    if (req.token !== stored) throw new Error('Kode akses salah.');

    const actions = {
      load: () => load_(),
      add: () => add_(req),
      update: () => update_(req),
      remove: () => remove_(req.id),
      setIncome: () => setIncome_(req.month, req.amount),
    };
    if (!actions[req.action]) throw new Error('Aksi tidak dikenal');
    return json_({ ok: true, data: actions[req.action]() });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function categorize_(item) {
  const text = String(item).toLowerCase();
  for (const [category, words] of CATEGORY_RULES) {
    if (words.some(w => text.includes(w))) return category;
  }
  return DEFAULT_CATEGORY;
}

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}

const txSheet_ = () => sheet_(TX_SHEET, ['id', 'date', 'item', 'amount', 'category', 'createdAt']);
const incomeSheet_ = () => sheet_(INCOME_SHEET, ['month', 'amount']);

function fmt_(d, pattern) {
  return Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), pattern);
}

function parseDay_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) throw new Error('Tanggal tidak valid');
  return new Date(s + 'T00:00:00');
}

function toTx_(r) {
  return { id: r[0], date: fmt_(r[1], 'yyyy-MM-dd'), item: r[2], amount: Number(r[3]), category: r[4] };
}

function load_() {
  const transactions = txSheet_().getDataRange().getValues().slice(1)
    .filter(r => r[0]).map(toTx_);
  const income = {};
  incomeSheet_().getDataRange().getValues().slice(1).forEach(r => {
    if (!r[0]) return;
    const key = r[0] instanceof Date ? fmt_(r[0], 'yyyy-MM') : String(r[0]);
    income[key] = Number(r[1]);
  });
  return { transactions, income, categories: CATEGORY_RULES.map(r => r[0]).concat(DEFAULT_CATEGORY) };
}

function checkTx_(req) {
  const item = String(req.item || '').trim();
  const amount = Number(req.amount);
  if (!item || !(amount > 0)) throw new Error('Isi nama item dan harga.');
  return { item, amount, date: parseDay_(req.date) };
}

function add_(req) {
  const { item, amount, date } = checkTx_(req);
  const row = [Utilities.getUuid(), date, item, amount, req.category || categorize_(item), new Date()];
  txSheet_().appendRow(row);
  return toTx_(row);
}

function findRow_(sh, id) {
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (rows[i][0] === id) return i + 1;
  throw new Error('Transaksi tidak ditemukan');
}

function update_(req) {
  const { item, amount, date } = checkTx_(req);
  const sh = txSheet_();
  const r = findRow_(sh, req.id);
  const category = req.category || categorize_(item);
  sh.getRange(r, 2, 1, 4).setValues([[date, item, amount, category]]);
  return { id: req.id, date: fmt_(date, 'yyyy-MM-dd'), item, amount, category };
}

function remove_(id) {
  const sh = txSheet_();
  sh.deleteRow(findRow_(sh, id));
  return { id };
}

function setIncome_(month, amount) {
  amount = Number(amount);
  if (!/^\d{4}-\d{2}$/.test(month || '') || !(amount > 0)) throw new Error('Pemasukan tidak valid');
  const sh = incomeSheet_();
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const key = rows[i][0] instanceof Date ? fmt_(rows[i][0], 'yyyy-MM') : String(rows[i][0]);
    if (key === month) { sh.getRange(i + 1, 2).setValue(amount); return { month, amount }; }
  }
  // Plain-text month so Sheets doesn't coerce "2026-10" into a date.
  const r = sh.getLastRow() + 1;
  sh.getRange(r, 1).setNumberFormat('@').setValue(month);
  sh.getRange(r, 2).setValue(amount);
  return { month, amount };
}

(() => {
'use strict';

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Math.round(n).toLocaleString('id-ID');
const rp = n => (n < 0 ? '-' : '') + 'Rp' + num(Math.abs(n));
const short = n => {
  n = Math.abs(n);
  if (n >= 1e6) return 'Rp' + (n / 1e6).toFixed(1).replace('.', ',').replace(/,0$/, '') + ' jt';
  if (n >= 1e3) return 'Rp' + Math.round(n / 1e3) + ' rb';
  return 'Rp' + n;
};
const pad = n => String(n).padStart(2, '0');
const dayStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dayStr(new Date());
const monthOf = ds => ds.slice(0, 7);
const monthName = (m, withYear) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('id-ID', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' });
};
const shiftMonth = (m, delta) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const prettyDate = ds => {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};
const sum = list => list.reduce((s, t) => s + t.amount, 0);

const CATS = {
  'Makan & Minum': ['🍜', '#3b82f6'],
  'Transportasi': ['🚗', '#f59e0b'],
  'Belanja Harian': ['🛒', '#10b981'],
  'Tagihan': ['💡', '#8b5cf6'],
  'Belanja': ['🛍️', '#ec4899'],
  'Hiburan': ['🎬', '#ef4444'],
  'Kesehatan': ['💊', '#14b8a6'],
  'Pendidikan': ['📚', '#6366f1'],
  'Perjalanan': ['✈️', '#0ea5e9'],
  'Lainnya': ['📦', '#9ca3af'],
};
const catIcon = c => (CATS[c] || CATS['Lainnya'])[0];
const catColor = c => (CATS[c] || CATS['Lainnya'])[1];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- state & api ----------
const S = {
  token: store.get('wallet.token') || '',
  data: null,            // { transactions, income, categories }
  tab: 'home',
  month: todayStr().slice(0, 7),
};
const H = { q: '', cat: '', from: '', to: '', sort: 'new' };

async function api(action, payload = {}, token = S.token) {
  let res;
  try {
    // text/plain keeps this a "simple" request, so the browser skips CORS preflight (Apps Script can't answer it).
    res = await fetch(window.WALLET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, action, ...payload }),
    });
  } catch {
    throw new Error('Tidak ada koneksi.');
  }
  const body = await res.json();
  if (!body.ok) throw new Error(body.error);
  return body.data;
}

function setData(d) {
  d.transactions.forEach((t, i) => { t._i = i; });
  S.data = d;
  store.set('wallet.cache', JSON.stringify(d));
}

async function refresh() {
  try {
    setData(await api('load'));
    render();
  } catch (e) {
    if (e.message === 'SETUP' || /Kode akses/.test(e.message)) { logout(); return; }
    toast(e.message);
  }
}

function logout() {
  store.del('wallet.token');
  S.token = '';
  render();
}

// ---------- views ----------
const app = $('#app');
const nav = $('#nav');

function render() {
  if (!S.token) { nav.hidden = true; return viewLogin(); }
  nav.hidden = false;
  nav.querySelectorAll('button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  if (!S.data) { app.innerHTML = '<p class="muted center" style="margin-top:40vh">Memuat…</p>'; return; }
  ({ home: viewHome, history: viewHistory, reports: viewReports })[S.tab]();
  window.scrollTo(0, 0);
}

function viewLogin() {
  app.innerHTML = `
    <div style="margin-top:14vh" class="center">
      <div class="ico" style="width:72px;height:72px;font-size:34px;margin:0 auto 16px">👛</div>
      <h2 style="margin:0 0 6px">Dompet Saya</h2>
      <p class="muted">Masukkan kode akses.<br>Pertama kali? Kode yang kamu ketik akan jadi kode aksesmu.</p>
    </div>
    <div class="field"><input id="code" class="in" type="password" placeholder="Kode akses" autocomplete="current-password"></div>
    <button id="enter" class="btn">Masuk</button>
    <p id="err" class="small center" style="color:var(--bad)"></p>`;
  const go = async () => {
    const code = $('#code').value.trim();
    if (code.length < 6) { $('#err').textContent = 'Kode minimal 6 karakter.'; return; }
    $('#enter').disabled = true;
    try {
      let d;
      try { d = await api('load', {}, code); }
      catch (e) { if (e.message !== 'SETUP') throw e; d = await api('init', {}, code); }
      S.token = code;
      store.set('wallet.token', code);
      setData(d);
      render();
    } catch (e) {
      $('#err').textContent = e.message;
      $('#enter').disabled = false;
    }
  };
  $('#enter').onclick = go;
  $('#code').onkeydown = e => { if (e.key === 'Enter') go(); };
}

function monthTx(m) { return S.data.transactions.filter(t => monthOf(t.date) === m); }

function byRecent(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b._i - a._i; }

function txRow(t) {
  return `<button class="tx" data-edit="${esc(t.id)}">
    <div class="ico">${catIcon(t.category)}</div>
    <div class="body"><div class="name">${esc(t.item)}</div>
      <div class="small muted">${prettyDate(t.date)} · ${esc(t.category)}</div></div>
    <div class="amt">-${rp(t.amount)}</div></button>`;
}

function viewHome() {
  const m = S.month;
  const now = new Date();
  const isCurrent = m === todayStr().slice(0, 7);
  const list = monthTx(m);
  const spent = sum(list);

  // compare with last month up to the same day, so a half-finished month isn't unfairly "better"
  const prevKey = shiftMonth(m, -1);
  const cutoff = isCurrent ? now.getDate() : 31;
  const prevList = monthTx(prevKey).filter(t => Number(t.date.slice(8)) <= cutoff);
  const prevSpent = sum(prevList);
  let chip = '<span class="chip">Belum ada data bulan lalu</span>';
  if (prevSpent > 0) {
    const diff = spent - prevSpent;
    if (Math.abs(diff) / prevSpent < 0.05) chip = `<span class="chip">＝ Hampir sama dengan ${monthName(prevKey)}</span>`;
    else if (diff < 0) chip = `<span class="chip good">↓ ${short(-diff)} lebih hemat dari ${monthName(prevKey)}</span>`;
    else chip = `<span class="chip bad">↑ ${short(diff)} lebih boros dari ${monthName(prevKey)}</span>`;
  }

  const income = S.data.income[m];
  let savings;
  if (!income) {
    savings = `<div class="card"><div class="stat">Berapa pemasukan ${monthName(m)}?</div>
      <p class="small muted" style="margin:4px 0 12px">Dipakai untuk menghitung tingkat tabunganmu.</p>
      <input id="inc" class="in" inputmode="numeric" placeholder="Pemasukan (Rp)" style="margin-bottom:10px">
      <button id="saveInc" class="btn">Simpan</button></div>`;
  } else {
    const rate = (income - spent) / income;
    const over = spent > income;
    let line = '';
    if (isCurrent && !over) {
      const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
      line = `<div class="small muted" style="margin-top:10px">Sisa ${rp(income - spent)} · ${rp((income - spent) / daysLeft)}/hari untuk ${daysLeft} hari</div>`;
    } else if (over) {
      line = `<div class="small" style="margin-top:10px;color:var(--bad)">Pengeluaran melebihi pemasukan ${rp(spent - income)}</div>`;
    }
    savings = `<div class="card">
      <div class="row"><span class="muted small">Pemasukan ${rp(income)}</span>
        <button id="editInc" class="link small">Ubah</button></div>
      <div class="row" style="margin:6px 0 10px"><span>Tingkat tabungan</span>
        <span class="stat" style="font-size:22px;${rate < 0 ? 'color:var(--bad)' : ''}">${(rate * 100).toFixed(1).replace('.', ',')}%</span></div>
      <div class="track ${over ? 'over' : ''}"><i style="width:${Math.min(100, spent / income * 100)}%"></i></div>${line}</div>`;
  }

  const groups = {};
  list.forEach(t => { groups[t.category] = (groups[t.category] || 0) + t.amount; });
  const cats = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const catHtml = cats.length ? cats.slice(0, 6).map(([c, v]) => `
    <div class="cat"><div class="ico">${catIcon(c)}</div><div class="body">
      <div class="row"><span class="name">${esc(c)}</span><span class="stat">${short(v)}</span></div>
      <div class="bar"><i style="width:${(v / spent * 100).toFixed(1)}%;background:${catColor(c)}"></i></div></div></div>`).join('')
    : '<p class="muted center">Belum ada pengeluaran.</p>';

  const recent = [...list].sort(byRecent).slice(0, 5).map(txRow).join('');

  app.innerHTML = `
    <div class="top"><div><h2>${now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}</h2></div>
      <div class="monthnav"><button id="pm">‹</button><span class="small" style="min-width:92px;text-align:center">${monthName(m, true)}</span><button id="nm">›</button></div></div>
    <div class="hero"><div class="label">Pengeluaran ${monthName(m)}</div>
      <div class="amount"><small>Rp</small>${num(spent)}</div>${chip}</div>
    ${savings}
    <div class="section-title"><h3>Ke mana uangmu</h3></div>
    <div class="card" style="padding:6px 16px">${catHtml}</div>
    <button class="btn" id="addBig">＋ Tambah pengeluaran</button>
    <div class="section-title"><h3>Terbaru</h3><button class="link" id="seeAll">Lihat semua</button></div>
    <div class="card" style="padding:4px 16px">${recent || '<p class="muted center">Belum ada transaksi.</p>'}</div>`;

  $('#pm').onclick = () => { S.month = shiftMonth(m, -1); render(); };
  $('#nm').onclick = () => { S.month = shiftMonth(m, 1); render(); };
  $('#addBig').onclick = () => openSheet();
  $('#seeAll').onclick = () => setTab('history');
  const saveInc = $('#saveInc');
  if (saveInc) {
    bindMoney($('#inc'));
    saveInc.onclick = () => saveIncome(digits($('#inc').value), saveInc);
  }
  const editInc = $('#editInc');
  if (editInc) editInc.onclick = () => openIncomeSheet(m, income);
}

async function saveIncome(amount, btn) {
  if (!(amount > 0)) { toast('Isi pemasukan dengan benar.'); return false; }
  if (btn) btn.disabled = true;
  try {
    const r = await api('setIncome', { month: S.month, amount });
    S.data.income[r.month] = r.amount;
    store.set('wallet.cache', JSON.stringify(S.data));
    closeSheet();
    render();
    toast('Pemasukan disimpan');
    return true;
  } catch (e) {
    toast(e.message);
    if (btn) btn.disabled = false;
    return false;
  }
}

function filteredHistory() {
  const q = H.q.trim().toLowerCase();
  const list = S.data.transactions.filter(t =>
    (!q || t.item.toLowerCase().includes(q)) &&
    (!H.cat || t.category === H.cat) &&
    (!H.from || t.date >= H.from) &&
    (!H.to || t.date <= H.to));
  const sorters = {
    new: byRecent,
    old: (a, b) => -byRecent(a, b),
    high: (a, b) => b.amount - a.amount,
    low: (a, b) => a.amount - b.amount,
  };
  return list.sort(sorters[H.sort]);
}

function viewHistory() {
  const cats = S.data.categories;
  app.innerHTML = `
    <div class="top"><h2>Riwayat</h2></div>
    <div class="filters">
      <input id="hq" class="in full" type="search" placeholder="Cari nama item…" value="${esc(H.q)}">
      <select id="hcat" class="in"><option value="">Semua kategori</option>
        ${cats.map(c => `<option ${H.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="hsort" class="in">
        <option value="new" ${H.sort === 'new' ? 'selected' : ''}>Terbaru</option>
        <option value="old" ${H.sort === 'old' ? 'selected' : ''}>Terlama</option>
        <option value="high" ${H.sort === 'high' ? 'selected' : ''}>Nominal terbesar</option>
        <option value="low" ${H.sort === 'low' ? 'selected' : ''}>Nominal terkecil</option></select>
      <div class="field" style="margin:0"><label>Dari tanggal</label><input id="hfrom" class="in" type="date" value="${H.from}"></div>
      <div class="field" style="margin:0"><label>Sampai tanggal</label><input id="hto" class="in" type="date" value="${H.to}"></div>
    </div>
    <div class="row" style="margin:14px 2px 8px"><span id="hsum" class="small muted"></span>
      <button id="reset" class="link small">Reset filter</button></div>
    <div class="card" style="padding:4px 16px" id="hlist"></div>
    <button id="csv" class="btn ghost">⬇ Unduh CSV</button>`;

  const bind = (id, key, ev = 'input') => { $(id).addEventListener(ev, e => { H[key] = e.target.value; listHistory(); }); };
  bind('#hq', 'q'); bind('#hcat', 'cat', 'change'); bind('#hsort', 'sort', 'change');
  bind('#hfrom', 'from', 'change'); bind('#hto', 'to', 'change');
  $('#reset').onclick = () => { Object.assign(H, { q: '', cat: '', from: '', to: '', sort: 'new' }); viewHistory(); };
  $('#csv').onclick = downloadCsv;
  listHistory();
}

function listHistory() {
  const list = filteredHistory();
  $('#hsum').textContent = `${list.length} transaksi · ${rp(sum(list))}`;
  $('#hlist').innerHTML = list.length ? list.map(txRow).join('') : '<p class="muted center">Tidak ada transaksi.</p>';
}

function downloadCsv() {
  const list = filteredHistory();
  if (!list.length) { toast('Tidak ada data untuk diunduh.'); return; }
  const cell = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Tanggal', 'Item', 'Kategori', 'Jumlah (IDR)'], ...list.map(t => [t.date, t.item, t.category, t.amount])];
  const csv = '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `dompet-${todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`${list.length} transaksi diunduh`);
}

function viewReports() {
  const cur = todayStr().slice(0, 7);
  const months = [];
  for (let i = 0; i < 6; i++) months.push(shiftMonth(cur, -i));
  const rows = months.map(m => {
    const spent = sum(monthTx(m));
    const income = S.data.income[m];
    const rate = income ? (income - spent) / income : null;
    const pctBar = income ? Math.min(100, spent / income * 100) : 0;
    return `<div class="mrow"><div class="row"><strong>${monthName(m, true)}</strong>
        <span class="stat">${rp(spent)}</span></div>
      ${income ? `<div class="track ${spent > income ? 'over' : ''}"><i style="width:${pctBar}%"></i></div>
        <div class="row small muted"><span>Pemasukan ${short(income)}</span>
        <span style="${rate < 0 ? 'color:var(--bad)' : ''}">Tabungan ${(rate * 100).toFixed(1).replace('.', ',')}%</span></div>`
        : '<div class="small muted">Pemasukan belum diisi</div>'}</div>`;
  }).join('');

  const rated = months.filter(m => S.data.income[m]);
  const avg = rated.length
    ? rated.reduce((s, m) => s + (S.data.income[m] - sum(monthTx(m))) / S.data.income[m], 0) / rated.length : null;

  app.innerHTML = `
    <div class="top"><h2>Laporan</h2></div>
    <div class="card center"><div class="muted small">Rata-rata tingkat tabungan (${rated.length} bulan)</div>
      <div style="font-size:36px;font-weight:800;${avg !== null && avg < 0 ? 'color:var(--bad)' : ''}">${avg === null ? '–' : (avg * 100).toFixed(1).replace('.', ',') + '%'}</div></div>
    <div class="section-title"><h3>6 bulan terakhir</h3></div>
    <div class="card" style="padding:4px 16px">${rows}</div>
    <button id="out" class="btn danger">Keluar</button>`;
  $('#out').onclick = () => { if (confirm('Keluar dari aplikasi di perangkat ini?')) logout(); };
}

// ---------- sheets (add / edit) ----------
const sheet = $('#sheet');
const digits = v => Number(String(v).replace(/\D/g, '')) || 0;
function bindMoney(input) {
  input.addEventListener('input', () => {
    const n = digits(input.value);
    input.value = n ? num(n) : '';
  });
}
function openPanel(html) {
  sheet.innerHTML = `<div class="panel">${html}</div>`;
  sheet.hidden = false;
  sheet.onclick = e => { if (e.target === sheet) closeSheet(); };
}
function closeSheet() { sheet.hidden = true; sheet.innerHTML = ''; }

function openIncomeSheet(month, current) {
  openPanel(`<h3>Pemasukan ${monthName(month, true)}</h3>
    <div class="field"><input id="inc2" class="in" inputmode="numeric" value="${current ? num(current) : ''}" placeholder="Pemasukan (Rp)"></div>
    <button id="ok" class="btn">Simpan</button>
    <button id="cancel" class="btn danger">Batal</button>`);
  bindMoney($('#inc2'));
  $('#ok').onclick = () => saveIncome(digits($('#inc2').value), $('#ok'));
  $('#cancel').onclick = closeSheet;
}

function openSheet(tx) {
  const editing = !!tx;
  const cats = S.data.categories;
  openPanel(`<h3>${editing ? 'Ubah transaksi' : 'Tambah pengeluaran'}</h3>
    <div class="field"><label>Nama item</label><input id="fItem" class="in" placeholder="mis. kopi susu" autocomplete="off" value="${editing ? esc(tx.item) : ''}"></div>
    <div class="field"><label>Harga (Rp)</label><input id="fPrice" class="in" inputmode="numeric" placeholder="0" value="${editing ? num(tx.amount) : ''}"></div>
    <div class="field"><label>Tanggal</label><input id="fDate" class="in" type="date" value="${editing ? tx.date : todayStr()}"></div>
    <div class="field"><label>Kategori</label><select id="fCat" class="in">
      ${editing ? '' : '<option value="">Otomatis</option>'}
      ${cats.map(c => `<option ${editing && tx.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <button id="ok" class="btn">Simpan</button>
    ${editing ? '<button id="del" class="btn danger">Hapus</button>' : ''}
    <button id="cancel" class="btn ghost" style="margin-top:8px">Batal</button>`);
  bindMoney($('#fPrice'));
  if (!editing) $('#fItem').focus();
  $('#cancel').onclick = closeSheet;

  $('#ok').onclick = async () => {
    const payload = { item: $('#fItem').value.trim(), amount: digits($('#fPrice').value), date: $('#fDate').value, category: $('#fCat').value };
    if (!payload.item || !payload.amount) { toast('Isi nama item dan harga.'); return; }
    if (!payload.date) { toast('Pilih tanggal.'); return; }
    $('#ok').disabled = true;
    try {
      if (editing) {
        const r = await api('update', { id: tx.id, ...payload });
        Object.assign(tx, r);
      } else {
        const r = await api('add', payload);
        r._i = S.data.transactions.length;
        S.data.transactions.push(r);
        S.month = monthOf(r.date);
      }
      store.set('wallet.cache', JSON.stringify(S.data));
      closeSheet();
      render();
      toast(editing ? 'Perubahan disimpan' : 'Tersimpan');
    } catch (e) {
      toast(e.message);
      $('#ok').disabled = false;
    }
  };

  if (editing) {
    $('#del').onclick = async () => {
      if (!confirm('Hapus transaksi ini?')) return;
      try {
        await api('remove', { id: tx.id });
        S.data.transactions = S.data.transactions.filter(t => t.id !== tx.id);
        store.set('wallet.cache', JSON.stringify(S.data));
        closeSheet();
        render();
        toast('Dihapus');
      } catch (e) { toast(e.message); }
    };
  }
}

// ---------- wiring ----------
function setTab(tab) { S.tab = tab; render(); }

nav.addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  if (b.dataset.tab === 'add') openSheet(); else setTab(b.dataset.tab);
});

app.addEventListener('click', e => {
  const row = e.target.closest('[data-edit]');
  if (!row) return;
  const tx = S.data.transactions.find(t => t.id === row.dataset.edit);
  if (tx) openSheet(tx);
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell is optional */ });
}

// show cached data instantly, then refresh from the Sheet
try { const c = store.get('wallet.cache'); if (c && S.token) setData(JSON.parse(c)); } catch { /* ignore bad cache */ }
render();
if (S.token) refresh();
})();

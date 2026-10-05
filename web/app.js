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
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayStr(d); };
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
const dayLabel = ds => {
  if (ds === todayStr()) return 'Hari ini';
  if (ds === yesterdayStr()) return 'Kemarin';
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
};
const sum = list => list.reduce((s, t) => s + t.amount, 0);
const wait = ms => new Promise(r => setTimeout(r, ms));
const buzz = () => { try { navigator.vibrate && navigator.vibrate(12); } catch { /* unsupported */ } };

// one drawing + colour per category (24x24 line icons)
const CATS = {
  'Makan & Minum': ['#3b82f6', '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>'],
  'Transportasi': ['#f59e0b', '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>'],
  'Belanja Harian': ['#10b981', '<path d="m15 11-1 9"/><path d="m19 11-4-7"/><path d="M2 11h20"/><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4"/><path d="m5 11 4-7"/><path d="m9 11 1 9"/>'],
  'Tagihan': ['#8b5cf6', '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>'],
  'Belanja': ['#ec4899', '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'],
  'Hiburan': ['#ef4444', '<rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20"/><path d="M17 2v20"/><path d="M2 12h20"/><path d="M2 7h5"/><path d="M2 17h5"/><path d="M17 17h5"/><path d="M17 7h5"/>'],
  'Kesehatan': ['#14b8a6', '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>'],
  'Pendidikan': ['#6366f1', '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>'],
  'Perjalanan': ['#0ea5e9', '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'],
  'Lainnya': ['#8b95a5', '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>'],
};
const meta = c => CATS[c] || CATS['Lainnya'];
const catColor = c => meta(c)[0];
const catSvg = c => `<svg viewBox="0 0 24 24">${meta(c)[1]}</svg>`;
const catIco = c => `<span class="ico" style="background:${catColor(c)}22;color:${catColor(c)}">${catSvg(c)}</span>`;
const TRASH = '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/><path d="M10 11v5M14 11v5"/></svg>';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
  t.classList.toggle('actionable', !!action);
  t.classList.add('show');
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2600);
}

// ---------- state & api ----------
const S = {
  token: store.get('wallet.token') || '',
  data: null,            // { transactions, income, categories, rules }
  tab: 'home',
  month: todayStr().slice(0, 7),
};
const H = { q: '', cat: '', period: 'all', from: '', to: '', sort: 'new' };
const persist = () => store.set('wallet.cache', JSON.stringify(S.data));

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
  persist();
}

const nextIndex = () => S.data.transactions.reduce((m, t) => Math.max(m, t._i), -1) + 1;
const hasPending = () => S.data && S.data.transactions.some(t => t.pending);

async function refresh() {
  if (hasPending()) return;
  try {
    setData(await api('load'));
    render(true);
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

// mirrors the server's keyword rules so the category can be previewed instantly
function guessCategory(item) {
  const text = String(item).toLowerCase();
  for (const [cat, words] of (S.data && S.data.rules) || []) {
    if (words.some(w => text.includes(w))) return cat;
  }
  return item.trim() ? 'Lainnya' : '';
}

// ---------- views ----------
const app = $('#app');
const nav = $('#nav');
let openRow = null;

function render(keepScroll) {
  openRow = null;
  if (!S.token) { nav.hidden = true; return viewLogin(); }
  nav.hidden = false;
  nav.querySelectorAll('button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  if (!S.data) { app.innerHTML = '<p class="muted center" style="margin-top:40vh">Memuat…</p>'; return; }
  const y = window.scrollY;
  ({ home: viewHome, history: viewHistory, reports: viewReports })[S.tab]();
  window.scrollTo(0, keepScroll ? y : 0);
}

function viewLogin() {
  app.innerHTML = `
    <div style="margin-top:14vh" class="center">
      <img src="icon-192.png" alt="" width="76" height="76" style="border-radius:20px;margin-bottom:16px">
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

function txRow(t, showDate) {
  const locked = t.pending ? ' pending' : '';
  return `<div class="swipe" data-id="${esc(t.id)}">
    <div class="swipe-del" data-del="${esc(t.id)}">${TRASH}<span>Hapus</span></div>
    <div class="tx${locked}" data-edit="${esc(t.id)}">${catIco(t.category)}
      <div class="body"><div class="name">${esc(t.item)}</div>
        <div class="small muted">${esc(t.category)}${showDate ? ' · ' + prettyDate(t.date) : ''}${t.pending ? ' · menyimpan…' : ''}</div></div>
      <div class="amt">-${rp(t.amount)}</div></div></div>`;
}

function groupedRows(list) {
  const days = [];
  list.forEach(t => {
    const last = days[days.length - 1];
    if (last && last.date === t.date) last.items.push(t); else days.push({ date: t.date, items: [t] });
  });
  return days.map(d => `<div class="dayhead"><span>${dayLabel(d.date)}</span><span>${rp(sum(d.items))}</span></div>${d.items.map(t => txRow(t)).join('')}`).join('');
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
  const prevSpent = sum(monthTx(prevKey).filter(t => Number(t.date.slice(8)) <= cutoff));
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
      <div class="pricewrap" style="margin-bottom:10px"><span>Rp</span><input id="inc" class="in" inputmode="numeric" placeholder="0"></div>
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
    <button class="cat" data-cat="${esc(c)}">${catIco(c)}<div class="body">
      <div class="row"><span class="name">${esc(c)}</span><span class="stat">${short(v)}</span></div>
      <div class="bar"><i style="width:${(v / spent * 100).toFixed(1)}%;background:${catColor(c)}"></i></div></div></button>`).join('')
    : '<div class="empty"><div class="big">🌱</div>Belum ada pengeluaran bulan ini.</div>';

  const recent = [...list].sort(byRecent).slice(0, 5);

  app.innerHTML = `
    <div class="top"><h2>${now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}</h2>
      <div class="monthnav"><button id="pm" aria-label="Bulan sebelumnya">‹</button><span class="small" style="min-width:92px;text-align:center">${monthName(m, true)}</span><button id="nm" aria-label="Bulan berikutnya">›</button></div></div>
    <div class="hero"><div class="label">Pengeluaran ${monthName(m)}</div>
      <div class="amount"><small>Rp</small>${num(spent)}</div>${chip}</div>
    ${savings}
    <div class="section-title"><h3>Ke mana uangmu</h3></div>
    <div class="card flush">${catHtml}</div>
    <button class="btn" id="addBig">＋ Tambah pengeluaran</button>
    <div class="section-title"><h3>Terbaru</h3><button class="link" id="seeAll">Lihat semua</button></div>
    <div class="card flush">${recent.length ? recent.map(t => txRow(t, true)).join('') : '<div class="empty"><div class="big">🧾</div>Belum ada transaksi.</div>'}</div>
    ${recent.length ? '<div class="hint">Geser ke kiri untuk menghapus</div>' : ''}`;

  $('#pm').onclick = () => { S.month = shiftMonth(m, -1); render(); };
  $('#nm').onclick = () => { S.month = shiftMonth(m, 1); render(); };
  $('#addBig').onclick = () => openSheet();
  $('#seeAll').onclick = () => { Object.assign(H, { q: '', cat: '', period: 'all', sort: 'new' }); setTab('history'); };
  const saveInc = $('#saveInc');
  if (saveInc) {
    bindMoney($('#inc'));
    saveInc.onclick = () => saveIncome(digits($('#inc').value), saveInc);
  }
  const editInc = $('#editInc');
  if (editInc) editInc.onclick = () => openIncomeSheet(m, income);
}

async function saveIncome(amount, btn) {
  if (!(amount > 0)) { toast('Isi pemasukan dengan benar.'); return; }
  if (btn) btn.disabled = true;
  try {
    const r = await api('setIncome', { month: S.month, amount });
    S.data.income[r.month] = r.amount;
    persist();
    closeSheet();
    render(true);
    toast('✓ Pemasukan disimpan');
  } catch (e) {
    toast(e.message);
    if (btn) btn.disabled = false;
  }
}

// ----- history -----
function periodRange() {
  const cur = todayStr().slice(0, 7);
  if (H.period === 'this') return [cur + '-01', cur + '-31'];
  if (H.period === 'last') { const p = shiftMonth(cur, -1); return [p + '-01', p + '-31']; }
  if (H.period === 'custom') return [H.from || '', H.to || '9999'];
  return ['', '9999'];
}

function filteredHistory() {
  const q = H.q.trim().toLowerCase();
  const [from, to] = periodRange();
  const list = S.data.transactions.filter(t =>
    (!q || t.item.toLowerCase().includes(q)) &&
    (!H.cat || t.category === H.cat) &&
    t.date >= from && t.date <= to);
  const sorters = {
    new: byRecent,
    old: (a, b) => -byRecent(a, b),
    high: (a, b) => b.amount - a.amount,
    low: (a, b) => a.amount - b.amount,
  };
  return list.sort(sorters[H.sort]);
}

function viewHistory() {
  const keep = $('#hcats') ? $('#hcats').scrollLeft : 0;
  const chip = (attr, val, label, on, color, icon) =>
    `<button class="chipbtn ${on ? 'on' : ''}" ${color ? `style="--c:${color}"` : ''} data-${attr}="${esc(val)}">${icon || ''}${esc(label)}</button>`;
  app.innerHTML = `
    <div class="top"><h2>Riwayat</h2><button class="pillbtn" data-act="csv">⬇ CSV</button></div>
    <input id="hq" class="in" type="search" placeholder="Cari nama item…" value="${esc(H.q)}" style="margin-bottom:12px">
    <div class="chips">${[['all', 'Semua'], ['this', 'Bulan ini'], ['last', 'Bulan lalu'], ['custom', 'Pilih tanggal']].map(([k, l]) => chip('per', k, l, H.period === k)).join('')}</div>
    ${H.period === 'custom' ? `<div class="filters">
      <div><label>Dari</label><input id="hfrom" class="in" type="date" value="${H.from}"></div>
      <div><label>Sampai</label><input id="hto" class="in" type="date" value="${H.to}"></div></div>` : ''}
    <div class="chips" id="hcats">${chip('hcat', '', 'Semua kategori', !H.cat)}${S.data.categories.map(c => chip('hcat', c, c, H.cat === c, catColor(c), catSvg(c))).join('')}</div>
    <div class="chips">${[['new', 'Terbaru'], ['old', 'Terlama'], ['high', 'Terbesar'], ['low', 'Terkecil']].map(([k, l]) => chip('sort', k, l, H.sort === k)).join('')}</div>
    <div class="row" style="margin:6px 2px 10px"><span id="hsum" class="small muted"></span>
      <button class="link small" data-act="reset">Reset</button></div>
    <div class="card flush" id="hlist"></div>`;
  $('#hcats').scrollLeft = keep;
  $('#hq').addEventListener('input', e => { H.q = e.target.value; listHistory(); });
  const hf = $('#hfrom'), ht = $('#hto');
  if (hf) hf.onchange = e => { H.from = e.target.value; listHistory(); };
  if (ht) ht.onchange = e => { H.to = e.target.value; listHistory(); };
  listHistory();
}

function listHistory() {
  const list = filteredHistory();
  $('#hsum').textContent = `${list.length} transaksi · ${rp(sum(list))}`;
  const byDate = H.sort === 'new' || H.sort === 'old';
  $('#hlist').innerHTML = list.length
    ? (byDate ? groupedRows(list) : list.map(t => txRow(t, true)).join(''))
    : '<div class="empty"><div class="big">🔍</div>Tidak ada transaksi yang cocok.</div>';
  openRow = null;
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
  toast(`✓ ${list.length} transaksi diunduh`);
}

function viewReports() {
  const cur = todayStr().slice(0, 7);
  const months = [];
  for (let i = 0; i < 6; i++) months.push(shiftMonth(cur, -i));
  const rows = months.map(m => {
    const spent = sum(monthTx(m));
    const income = S.data.income[m];
    const rate = income ? (income - spent) / income : null;
    return `<div class="mrow"><div class="row"><strong>${monthName(m, true)}</strong>
        <span class="stat">${rp(spent)}</span></div>
      ${income ? `<div class="track ${spent > income ? 'over' : ''}"><i style="width:${Math.min(100, spent / income * 100)}%"></i></div>
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
    <div class="card flush">${rows}</div>
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
  sheet.innerHTML = `<div class="panel"><div class="grab"></div>${html}</div>`;
  sheet.hidden = false;
  sheet.onclick = e => { if (e.target === sheet) closeSheet(); };
}
function closeSheet() { sheet.hidden = true; sheet.innerHTML = ''; }

function openIncomeSheet(month, current) {
  openPanel(`<h3>Pemasukan ${monthName(month, true)}</h3>
    <div class="field pricewrap"><span>Rp</span><input id="inc2" class="in" inputmode="numeric" value="${current ? num(current) : ''}" placeholder="0"></div>
    <button id="ok" class="btn">Simpan</button>
    <button id="cancel" class="btn danger">Batal</button>`);
  bindMoney($('#inc2'));
  $('#ok').onclick = () => saveIncome(digits($('#inc2').value), $('#ok'));
  $('#cancel').onclick = closeSheet;
}

function openSheet(tx) {
  const editing = !!tx;
  let date = editing ? tx.date : todayStr();
  let cat = editing ? tx.category : '';          // '' = automatic
  const cats = S.data.categories;

  openPanel(`<h3>${editing ? 'Ubah transaksi' : 'Tambah pengeluaran'}</h3>
    <div class="field"><label>Nama item</label>
      <input id="fItem" class="in" placeholder="mis. kopi susu" autocomplete="off" enterkeyhint="next" value="${editing ? esc(tx.item) : ''}"></div>
    <div class="field"><label>Harga</label>
      <div class="pricewrap"><span>Rp</span><input id="fPrice" class="in" inputmode="numeric" placeholder="0" enterkeyhint="done" value="${editing ? num(tx.amount) : ''}"></div></div>
    <div class="field"><label>Tanggal</label><div class="chips" id="fDates"></div></div>
    <div class="field"><label>Kategori <span id="fDetect"></span></label><div class="chips" id="fCats"></div></div>
    <button id="ok" class="btn">Simpan</button>
    ${editing ? '<button id="del" class="btn danger">Hapus</button>' : ''}`);

  const drawDates = () => {
    const custom = date !== todayStr() && date !== yesterdayStr();
    $('#fDates').innerHTML = `
      <button class="chipbtn ${date === todayStr() ? 'on' : ''}" data-d="${todayStr()}">Hari ini</button>
      <button class="chipbtn ${date === yesterdayStr() ? 'on' : ''}" data-d="${yesterdayStr()}">Kemarin</button>
      <label class="chipbtn ${custom ? 'on' : ''}">📅 ${custom ? prettyDate(date) : 'Pilih tanggal'}<input type="date" id="fDate" value="${date}" max="${todayStr()}"></label>`;
    $('#fDate').onchange = e => { if (e.target.value) { date = e.target.value; drawDates(); } };
  };
  const drawCats = () => {
    const keep = $('#fCats').scrollLeft;
    $('#fCats').innerHTML = `<button class="chipbtn ${cat === '' ? 'on' : ''}" data-c="">✨ Otomatis</button>` +
      cats.map(c => `<button class="chipbtn ${cat === c ? 'on' : ''}" style="--c:${catColor(c)}" data-c="${esc(c)}">${catSvg(c)}${esc(c)}</button>`).join('');
    $('#fCats').scrollLeft = keep;
  };
  const detect = () => {
    const g = guessCategory($('#fItem').value);
    $('#fDetect').textContent = cat === '' && g ? `→ ${g}` : '';
  };
  drawDates(); drawCats(); detect();

  $('#fDates').onclick = e => { const b = e.target.closest('[data-d]'); if (b) { date = b.dataset.d; drawDates(); } };
  $('#fCats').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { cat = b.dataset.c; drawCats(); detect(); } };
  $('#fItem').addEventListener('input', detect);
  $('#fItem').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#fPrice').focus(); } });
  $('#fPrice').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#ok').click(); } });
  bindMoney($('#fPrice'));
  if (!editing) $('#fItem').focus();

  $('#ok').onclick = () => {
    const item = $('#fItem').value.trim(), amount = digits($('#fPrice').value);
    if (!item || !amount) { toast('Isi nama item dan harga.'); return; }
    closeSheet();
    editing ? saveEdit(tx, { item, amount, date, category: cat }) : saveNew({ item, amount, date, category: cat });
  };
  if (editing) $('#del').onclick = () => { closeSheet(); deleteTx(tx.id); };
}

// Optimistic: the list updates immediately, the Sheet catches up in the background.
async function saveNew(p) {
  const guess = p.category || guessCategory(p.item) || 'Lainnya';
  const temp = { id: 'tmp' + Date.now(), item: p.item, amount: p.amount, date: p.date, category: guess, _i: nextIndex(), pending: true };
  S.data.transactions.push(temp);
  S.month = monthOf(p.date);
  buzz();
  render(true);
  try {
    const r = await api('add', p);
    Object.assign(temp, r, { pending: false });
    persist();
    render(true);
    toast(`✓ Tersimpan · ${r.category}`);
  } catch (e) {
    S.data.transactions = S.data.transactions.filter(t => t !== temp);
    render(true);
    toast('Gagal menyimpan: ' + e.message);
  }
}

async function saveEdit(tx, p) {
  const before = { item: tx.item, amount: tx.amount, date: tx.date, category: tx.category };
  Object.assign(tx, p, { category: p.category || guessCategory(p.item) || 'Lainnya', pending: true });
  render(true);
  try {
    const r = await api('update', { id: tx.id, ...p });
    Object.assign(tx, r, { pending: false });
    persist();
    render(true);
    toast('✓ Perubahan disimpan');
  } catch (e) {
    Object.assign(tx, before, { pending: false });
    render(true);
    toast('Gagal menyimpan: ' + e.message);
  }
}

async function deleteTx(id) {
  const tx = S.data.transactions.find(t => t.id === id);
  if (!tx || tx.pending) return;
  buzz();
  const el = [...app.querySelectorAll('.swipe')].find(e => e.dataset.id === id);
  if (el) {
    el.style.maxHeight = el.offsetHeight + 'px';
    el.getBoundingClientRect();
    el.classList.add('gone');
    await wait(240);
  }
  S.data.transactions = S.data.transactions.filter(t => t.id !== id);
  render(true);
  toast('Menghapus…');
  try {
    await api('remove', { id });
    persist();
    toast('✓ Transaksi dihapus', { label: 'Urungkan', run: () => undoDelete(tx) });
  } catch (e) {
    S.data.transactions.push(tx);
    render(true);
    toast('Gagal menghapus: ' + e.message);
  }
}

async function undoDelete(tx) {
  try {
    const r = await api('add', { item: tx.item, amount: tx.amount, date: tx.date, category: tx.category });
    r._i = tx._i;
    S.data.transactions.push(r);
    persist();
    render(true);
    toast('✓ Transaksi dikembalikan');
  } catch (e) { toast('Gagal mengembalikan: ' + e.message); }
}

// ---------- swipe to delete ----------
const OPEN = 88, AUTO = 170;
let drag = null, suppressClick = false;

function setRow(tx, x, animate) {
  tx.style.transition = animate ? '' : 'none';
  tx.style.transform = x ? `translateX(${x}px)` : '';
}
function closeRow(tx) { tx.classList.remove('open'); setRow(tx, 0, true); if (openRow === tx) openRow = null; }

app.addEventListener('pointerdown', e => {
  const tx = e.target.closest('.tx');
  if (!tx || tx.classList.contains('pending')) return;
  if (openRow && openRow !== tx) closeRow(openRow);
  drag = { tx, id: e.pointerId, x: e.clientX, y: e.clientY, base: tx.classList.contains('open') ? -OPEN : 0, lock: null, cur: 0 };
});

app.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.lock) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    drag.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
    if (drag.lock === 'x') { try { drag.tx.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
  }
  if (drag.lock === 'y') { drag = null; return; }
  drag.cur = Math.max(-260, Math.min(0, drag.base + dx));
  setRow(drag.tx, drag.cur, false);
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const { tx, cur, lock } = drag;
  drag = null;
  if (lock !== 'x') return;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 300);
  if (cur <= -AUTO) { setRow(tx, -300, true); deleteTx(tx.dataset.edit); return; }
  if (cur <= -OPEN / 2) { tx.classList.add('open'); setRow(tx, 0, true); openRow = tx; }
  else closeRow(tx);
}
app.addEventListener('pointerup', endDrag);
app.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) { closeRow(drag.tx); drag = null; } });

// ---------- wiring ----------
function setTab(tab) { S.tab = tab; render(); }

nav.addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  if (b.dataset.tab === 'add') openSheet(); else setTab(b.dataset.tab);
});

app.addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del) { deleteTx(del.dataset.del); return; }
  if (suppressClick) return;

  const act = e.target.closest('[data-act]');
  if (act) {
    if (act.dataset.act === 'csv') downloadCsv();
    if (act.dataset.act === 'reset') { Object.assign(H, { q: '', cat: '', period: 'all', from: '', to: '', sort: 'new' }); viewHistory(); }
    return;
  }
  const per = e.target.closest('[data-per]'), hc = e.target.closest('[data-hcat]'), so = e.target.closest('[data-sort]');
  if (per) { H.period = per.dataset.per; viewHistory(); return; }
  if (hc) { H.cat = hc.dataset.hcat; viewHistory(); return; }
  if (so) { H.sort = so.dataset.sort; viewHistory(); return; }

  const catRow = e.target.closest('[data-cat]');
  if (catRow) {
    Object.assign(H, { q: '', cat: catRow.dataset.cat, period: 'custom', from: S.month + '-01', to: S.month + '-31', sort: 'new' });
    setTab('history');
    return;
  }

  const row = e.target.closest('.tx');
  if (!row) { if (openRow) closeRow(openRow); return; }
  if (row.classList.contains('open')) { closeRow(row); return; }
  if (openRow) { closeRow(openRow); return; }
  const tx = S.data.transactions.find(t => t.id === row.dataset.edit);
  if (tx && !tx.pending) openSheet(tx);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.token && S.data && sheet.hidden && !drag) refresh();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell is optional */ });
}

// show cached data instantly, then refresh from the Sheet
try { const c = store.get('wallet.cache'); if (c && S.token) setData(JSON.parse(c)); } catch { /* ignore bad cache */ }
render();
if (S.token) refresh();
})();

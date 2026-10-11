// IDX filing reader. Paste INTO a normal browser tab on https://www.idx.co.id/ (plain scripts get a Cloudflare 403; a
// real tab does not, and this does not try to get around that). Defines two steps:
//   await __arList(tickers, days, skip)  lists announcements (1.2 s apart), drops routine ones -> window.__arL
//   __arRead()                           reads each listed filing's PDFs with pdf.js, in memory (nothing saved to
//                                        disk), extracts amounts / percentages / company names -> window.__ar.items
// skip: ['TICKER|timestamp', ...] already digested. Claude then reads window.__ar.items in chunks and writes
// data/filing-digest.json (tools/filing-digest.mjs merges and publishes it).
(() => {
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');
  // Routine: monthly registry / exploration reports, ad proofs, schedules, coupon and principal payments, bond and
  // commercial-paper notices, ratings, use-of-proceeds, the financial statements themselves (numbers come from Yahoo),
  // annual-meeting logistics, committee and auditor appointments, buyback progress, corrections.
  const ROUTINE = /laporan bulanan|bukti iklan|rencana penyampaian|jadwal|pembayaran (bunga|kupon|imbal|pokok)|kupon|imbalan ijarah|bagi hasil sukuk|penggunaan dana|laporan keuangan|annual report|laporan tahunan|laporan keberlanjutan|sustainability report|rups tahunan|rapat umum pemegang saham tahunan|daftar efek syariah|penyesuaian harga|penyampaian bukti|perubahan alamat|biro administrasi|sekretaris perusahaan|corporate secretary|komite|unit audit|audit internal|kesiapan dana|pelunasan|pemeringkatan|peringkat|surat berharga komersial|medium term note|\bmtn\b|obligasi(?!.*konversi)|sukuk|pelaksanaan (paparan publik|public expose)|pelaksanaan pembelian kembali|hasil pelaksanaan pembelian kembali|pengalihan saham hasil|pencatatan saham tambahan|pelaksanaan rups|ralat|koreksi|cum dan ex|akuntan publik|kantor akuntan|pemenuhan|surat tanggapan|tanggapan atas surat|waran seri .* pelaksanaan|hasil pelaksanaan waran|rencana penyelenggaraan public expose|pemberitahuan rencana rapat umum|laporan hasil public expose|saham hilang|sks pengganti|ijarah|brupob|pemegang (obligasi|sukuk)|penundaan rapat/i;
  window.__arList = async (T, days = 10, skip = []) => {
    const sk = new Set(skip), to = new Date(Date.now() + 864e5), from = new Date(Date.now() - days * 864e5), rows = [];
    const st = window.__ar = { phase: 'list', done: 0, total: T.length, items: [], error: null };
    for (const tk of T) {
      try {
        const r = await fetch(`/primary/ListedCompany/GetAnnouncement?kodeEmiten=${tk}&emitenType=*&indexFrom=0&pageSize=100&dateFrom=${fmt(from)}&dateTo=${fmt(to)}&lang=id&keyword=`);
        if (r.status !== 200) { st.error = tk + ' HTTP ' + r.status; break; }
        for (const x of (await r.json()).Replies || []) {
          const p = x.pengumuman, title = (p.JudulPengumuman || '').replace(/\s+/g, ' ').trim();
          if (ROUTINE.test(title) || sk.has(tk + '|' + p.TglPengumuman)) continue;
          const att = x.attachments || [];
          const urls = att.filter(a => !a.IsAttachment).concat(att.filter(a => a.IsAttachment)).map(a => a.FullSavePath).filter(u => /\.pdf$/i.test(u));
          rows.push({ t: tk, d: p.TglPengumuman, title, url: urls[0] || null, urls: urls.slice(0, 3) });
        }
      } catch (e) { st.error = tk + ' ' + e.message; break; }
      st.done++;
      await new Promise(res => setTimeout(res, 1200));
    }
    const seen = new Set(); // one per repeated title per stock (re-uploads), newest kept
    window.__arL = rows.filter(r => { const k = r.t + '|' + r.title.slice(0, 50).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    st.phase = 'listed';
    return window.__arL.length;
  };
  window.__arRead = async (list = window.__arL) => {
    const st = window.__ar; st.phase = 'read'; st.done = 0; st.total = list.length; st.items = [];
    const pdfjs = window.__pdfjs || (window.__pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs'));
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
    const textOf = async (u, maxPages) => {
      const doc = await pdfjs.getDocument({ data: await (await fetch(u)).arrayBuffer() }).promise;
      let t = '';
      for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) t += (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + '\n';
      return { pages: doc.numPages, text: t.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim() };
    };
    const AMT = /(?:Rp\.?|IDR)\s?[\d.,]+(?:\s?(?:triliun|miliar|milyar|juta))?|(?:US\$|USD)\s?[\d.,]+(?:\s?(?:juta|miliar|million|billion))?/gi;
    const PCT = /\d{1,3}(?:[.,]\d+)?\s?%/g, CO = /\bPT\.?\s+[A-Z][A-Za-z&.\- ]{2,60}?(?:Tbk\.?|\(Persero\))?(?=[,.;)\s])/g;
    const uniq = a => [...new Set(a.map(s => s.trim()))];
    for (const r of list) {
      let text = '', pages = 0, err = null;
      try { for (const u of r.urls) { const x = await textOf(u, 6); pages += x.pages; text += (text ? '\n---\n' : '') + x.text; if (text.length > 9000) break; } } catch (e) { err = e.message; }
      st.items.push({ t: r.t, d: r.d, title: r.title, url: r.url, pages, chars: text.length, scan: text.length < 200, err,
        facts: { amounts: uniq(text.match(AMT) || []).slice(0, 10), pct: uniq(text.match(PCT) || []).slice(0, 8), companies: uniq(text.match(CO) || []).slice(0, 8) }, text: text.slice(0, 7000) });
      st.done++;
      await new Promise(res => setTimeout(res, 300));
    }
    st.phase = 'done';
    return st.items.length;
  };
  // Formulaic filings parsed here, not by Claude: ownership reports (POJK 4/2024), "no material information" answers
  // to IDX volatility queries, public-expose slides. Returns a digest item (tools/digest-rules.md) or null.
  const num = s => (s == null ? null : +s.replace(/\./g, '').replace(',', '.'));
  const INST = /SEKURITAS|SECURITIES|FUND|LTD|PTE|BANK|TBK|INVEST|CAPITAL|ASSET|NOMINEE|A\/C|CLIENT|LIMITED/i;
  window.__arAuto = x => {
    const T = x.text.replace(/\s+/g, ' '), ti = x.title;
    if (/kepemilikan atau setiap perubahan kepemilikan/i.test(ti)) {
      const nm = (T.match(/Nama \(sesuai SID\) : (.+?) (Anggota|Kewarganegaraan|Alamat|Status|Pengendali|Jenis)/) || [])[1] || 'A holder';
      const dir = /Anggota Direksi\/Dewan Komisaris : Ya/.test(T) && !INST.test(nm);
      const b0 = num((T.match(/Jumlah Saham Sebelum Transaksi : ([\d.,]+)/) || [])[1]), b1 = num((T.match(/Jumlah Saham Setelah Transaksi : ([\d.,]+)/) || [])[1]);
      const p0 = num((T.match(/Hak Suara Sebelum Transaksi : ([\d.,]+)%/) || [])[1]) ?? 0, p1 = num((T.match(/Hak Suara Setelah Transaksi : ([\d.,]+)%/) || [])[1]) ?? 0;
      const tx = T.match(/(Pembelian|Penjualan|Hibah|Pewarisan|Konversi|Pelaksanaan|Pengalihan|Lainnya|Repurchase Agreement|Gadai)[A-Za-z ]{0,40}?(Langsung|Tidak Langsung)[\s\S]{0,80}?([\d.]+,\d\d) Saham Biasa ([\d.]+,\d\d)/);
      if (b0 == null || b1 == null) return null;
      const px = tx ? num(tx[4]) : null, q = Math.abs(b1 - b0), chg = p1 - p0, cross = (p0 < 5) !== (p1 < 5), up = chg > 0 || b1 > b0;
      const imp = Math.abs(chg) >= 2 ? 3 : Math.abs(chg) >= 0.5 || cross ? 2 : dir ? 1 : 0;
      const who = nm + (dir ? ' (director / commissioner)' : '');
      const head = q < 1000 && Math.abs(chg) >= 1 ? `${who} reported a holding: ${p0}% → ${p1}%` : `${who} ${up ? 'bought' : 'sold'} ${q.toLocaleString('en-US')} shares${px ? ` at Rp ${px.toLocaleString('en-US')}` : ''}: ${p0}% → ${p1}%`;
      return { kind: up ? 'insider-buy' : 'insider-sell', impact: imp, dir: imp >= 2 ? (up ? 'up' : 'down') : '?', head,
        what: `Ownership report under POJK 4/2024${tx && !/Pembelian|Penjualan/.test(tx[1]) ? ` (type: ${tx[1]}, not an open-market trade)` : ''}.`, size: px ? (q * px >= 1e12 ? `≈ Rp ${((q * px) / 1e12).toFixed(2)} T` : `≈ Rp ${((q * px) / 1e9).toFixed(1)} B`) : 'price not stated',
        why: (imp >= 2 ? (up ? 'A large holder adding is a sign of confidence or of a stake being built.' : 'A large holder selling adds supply and can mean it sees less upside.') : 'Small: no signal by itself.') + (/SEKURITAS|SECURITIES|A\/C|CLIENT|NOMINEE/i.test(nm) ? ' The holder is a broker or custodian account, usually holding for a client: the real owner is not named.' : ''), watch: '' };
    }
    if (/volatilitas transaksi|permintaan penjelasan bursa/i.test(ti) && /tidak (memiliki|mengetahui)[^.]{0,60}informasi atau fakta material/i.test(T))
      return { kind: 'idx-query', impact: 1, dir: '?', head: 'IDX queried unusual trading; the company says it knows of no material information', what: `Standard reply to the exchange's volatility query${/tidak memiliki rencana (untuk melakukan )?tindakan korporasi/i.test(T) ? '; no corporate action planned in the next 3 months' : ''}.`, size: 'none', why: 'A sharp move with no news behind it: often trading-driven. Watch for an unusual-market-activity notice or a suspension.', watch: '' };
    if (/penyampaian materi public expose/i.test(ti)) return { kind: 'results', impact: 0, dir: '?', head: 'Public-expose slides posted', what: 'Presentation material for the public expose.', size: 'none', why: 'Open the slides for management targets.', watch: '' };
    return null;
  };
  // Reading view for Claude: filings still to digest (not auto-parsed), boilerplate and the English copy stripped,
  // longer excerpts for deal-type filings. Use __arC(i, n) and __arTodo().
  window.__arTodo = () => window.__ar.items.map((x, i) => i).filter(i => !window.__arAuto(window.__ar.items[i]));
  window.__arC = (i, n, cap) => window.__ar.items.slice(i, i + n).map((x, k) => {
    const s = x.text.replace(/^[\s\S]*?Go To English Page/, '').replace(/(Letter \/ Announcement No\.|Subject Go To Indonesian Page|Go To Indonesian Page)[\s\S]*?(?=\n---|$)/g, '').replace(/Dokumen ini merupakan dokumen resmi[\s\S]{0,260}?dokumen ini\./gi, '')
      .replace(/(Telepon|Faksimili|Alamat Surat Elektronik|Alamat Kantor|Situs web|Nama Pengirim|Jabatan|Hormat Kami|Demikian (untuk|disampaikan)|Corporate Secretary)[^\n]{0,160}/gi, '').replace(/Dengan ini kami untuk dan atas nama perusahaan menyampaikan Laporan Informasi atau Fakta Material sebagai berikut:/g, '')
      .replace(/Dampak kejadian, informasi atau fakta material tersebut terhadap kegiatan operasional, hukum, kondisi keuangan, atau kelangsungan usaha Emiten atau Perusahaan Publik/g, 'Dampak:').replace(/\s+/g, ' ');
    const big = /transaksi|penambahan modal|hmetd|prospektus|aksi korporasi|kegiatan usaha|pengambilalihan|akuisisi|jual beli|perjanjian|tender|kontrak|siaran pers|keterbukaan informasi|rencana|pengumuman/i.test(x.title);
    return `#${i + k} ${x.t} ${x.d} | ${x.title}${x.scan ? ' | SCAN' : ''}\n${s.slice(0, cap || (big ? 3200 : 1100))}`;
  }).join('\n\n');
  window.__arCI = (idx, cap) => idx.map(i => window.__arC(i, 1, cap)).join('\n\n');
  // Hand titles, links and the auto-parsed items to tools/flow-receiver.mjs (data/filing-read-new.json), then run
  // node tools/filing-digest.mjs <Claude's batches> --meta data/filing-read-new.json
  window.__arExport = () => {
    const P = {};
    window.__ar.items.forEach(x => { P[x.t + '|' + x.d] = { title: x.title, url: x.url, scan: x.scan || undefined, auto: window.__arAuto(x) || undefined }; });
    setTimeout(() => { location.href = 'http://127.0.0.1:5175/upload#' + encodeURIComponent('filing-read-new.json|' + JSON.stringify(P)); }, 300);
    return Object.keys(P).length;
  };
})();

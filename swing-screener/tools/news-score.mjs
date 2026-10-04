// Scores the headline classifier against hand labels (tools/news-labels.json).
// "legacy" = the first version of News.gs rules, kept here so the before/after is reproducible.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, ROOT } from './lib.mjs';

const api = loadEngine();
const labels = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'news-labels.json'), 'utf8'));

const LEG_RULES = [
  ['RISK', /suspen|\buma\b|\bfca\b|pkpu|pailit|sanksi|denda|tersangka|korupsi|gagal bayar|delisting|going private|ojk (blokir|cabut)/i],
  ['COMMISSIONER', /komisaris|dewan direksi|direktur utama|rups(lb)?|reshuffle/i],
  ['GOV_INVEST', /danantara|investasi pemerintah|proyek strategis|\bpsn\b|hilirisasi|kementerian|insentif|subsidi|stimulus|apbn|kemenkeu|bumn|swasembada|makan bergizi|\bmbg\b|ibu kota nusantara|\bikn\b|penyertaan modal/i],
  ['CORP_ACTION', /dividen|buyback|stock split|rights issue|private placement|akuisisi|tender offer|\bmtn\b|obligasi|ipo/i],
  ['CONTRACT', /kontrak|tender|proyek baru|kerja sama|kemitraan|pesanan|order book/i],
  ['EARNINGS', /laba|rugi|pendapatan|kinerja|kuartal|semester|ebitda|target (laba|pendapatan)/i],
];
const LEG_POS = /naik|melonjak|menguat|laba (naik|tumbuh|bersih naik)|tumbuh|dividen|buyback|akuisisi|kontrak|investasi|suntik|insentif|stimulus|ekspansi|rekor|upgrade|beli|akumulasi|borong|proyek|surplus|positif/i;
const LEG_NEG = /turun|anjlok|melemah|rugi|gagal bayar|suspen|denda|korupsi|tersangka|pailit|pkpu|downgrade|sanksi|\buma\b|\bfca\b|jual|koreksi|defisit|negatif|batal|tunda|cabut/i;
function legacy(title, isTicker) {
  let category = 'OTHER';
  for (const [c, re] of LEG_RULES) if (re.test(title)) { category = c; break; }
  const sentiment = (LEG_POS.test(title) ? 1 : 0) - (LEG_NEG.test(title) ? 1 : 0);
  return { category, sentiment, roundup: false };
}
function current(title) {
  const r = api.classify_(title);
  return { category: r.category, sentiment: r.sentiment, roundup: !!r.roundup };
}

export function evaluate(name, classify, rows) {
  let catOk = 0, catT = 0, catTn = 0, catS = 0, catSn = 0, catTok = 0, catSok = 0;
  let tp = 0, predNZ = 0, trueNZ = 0, wrongSign = 0, ru = 0, ruOk = 0, ruTrue = 0, ruPred = 0, ruBoth = 0;
  rows.forEach(([title, tcat, tsent, truRound, kind]) => {
    const p = classify(title, kind === 'T');
    if (p.category === tcat) catOk++;
    if (kind === 'T') { catTn++; if (p.category === tcat) catTok++; } else { catSn++; if (p.category === tcat) catSok++; }
    if (p.sentiment !== 0) predNZ++;
    if (tsent !== 0) trueNZ++;
    if (p.sentiment !== 0 && p.sentiment === tsent) tp++;
    if (p.sentiment !== 0 && tsent !== 0 && p.sentiment !== tsent) wrongSign++;
    if (truRound) ruTrue++;
    if (p.roundup) ruPred++;
    if (truRound && p.roundup) ruBoth++;
    if (kind === 'T') ru++;
  });
  const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + '%' : 'n/a');
  console.log(`\n[${name}] n=${rows.length}`);
  console.log(`  category accuracy: ${pct(catOk, rows.length)}  (ticker-tagged ${pct(catTok, catTn)}, sector-theme ${pct(catSok, catSn)})`);
  console.log(`  sentiment precision (non-zero calls that match truth): ${pct(tp, predNZ)}   recall (true direction found): ${pct(tp, trueNZ)}   opposite-sign calls: ${wrongSign}`);
  console.log(`  roundup detection: flagged ${ruPred}, true ${ruTrue}, overlap ${ruBoth}`);
}

if (process.argv[1].endsWith('news-score.mjs')) {
  Object.entries(labels).filter(([k]) => k.startsWith('set')).forEach(([k, rows]) => {
    evaluate(`${k} legacy rules`, legacy, rows);
    evaluate(`${k} current rules`, current, rows);
  });
}

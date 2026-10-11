// Quarterly revenue / net income / equity from Yahoo's fundamentals-timeseries (free, unofficial, ~5 recent quarters for IDX).
// Context only: not scored, because there is no point-in-time history here to backtest it without look-ahead bias.
import { sleep } from './lib.mjs';

const TYPES = 'quarterlyTotalRevenue,quarterlyNetIncome,quarterlyStockholdersEquity';
// Valuation inputs (same request): ~4 fiscal years of revenue, profit, cash flow, EBITDA and balance sheet, plus the
// latest quarter's share count, debt and cash. Values are in the report currency (rupiah, or US$ for some issuers).
const ANNUAL = ['TotalRevenue', 'NetIncome', 'FreeCashFlow', 'OperatingCashFlow', 'CapitalExpenditure', 'EBITDA', 'TotalDebt', 'CashAndCashEquivalents', 'StockholdersEquity', 'OrdinarySharesNumber'];
const QBAL = ['OrdinarySharesNumber', 'TotalDebt', 'CashAndCashEquivalents'];
const ALL = [TYPES, ...ANNUAL.map(k => 'annual' + k), ...QBAL.map(k => 'quarterly' + k)].join(',');

export async function fetchFundamentals(tickers) {
  const out = {};
  for (const t of tickers) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${t}.JK?type=${ALL}&period1=1483228800&period2=${Math.floor(Date.now() / 1000) + 86400 * 30}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) { out[t] = null; continue; }
      const res = ((await r.json()).timeseries || {}).result || [];
      const g = k => { const x = res.find(y => y.meta.type[0] === k); return (x && x[k]) || []; };
      const ni = g('quarterlyNetIncome'), rev = g('quarterlyTotalRevenue'), eq = g('quarterlyStockholdersEquity');
      const byDate = new Map();
      const put = (arr, key) => arr.forEach(p => { const d = p.asOfDate; byDate.set(d, { ...(byDate.get(d) || { date: d }), [key]: p.reportedValue.raw }); });
      put(rev, 'rev'); put(ni, 'ni'); put(eq, 'equity');
      const q = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-5);
      out[t] = q.length ? summarize(q) : null;
      // annual rows by fiscal year, and the latest balance-sheet quarter
      const yrs = new Map();
      for (const k of ANNUAL) g('annual' + k).forEach(p => { if (!p) return; const y = p.asOfDate.slice(0, 4); yrs.set(y, { ...(yrs.get(y) || { y }), [k]: p.reportedValue.raw }); });
      const lastOf = k => { const a = g('quarterly' + k).filter(Boolean); return a.length ? a[a.length - 1].reportedValue.raw : null; };
      const years = [...yrs.values()].sort((a, b) => a.y.localeCompare(b.y)).slice(-5);
      if (out[t] && years.length) out[t].val = { years, shares: lastOf('OrdinarySharesNumber') || (years.at(-1) || {}).OrdinarySharesNumber || null, debt: lastOf('TotalDebt'), cash: lastOf('CashAndCashEquivalents') };
    } catch { out[t] = null; }
    await sleep(150);
  }
  return out;
}

export function summarize(q) {
  const last = q[q.length - 1], yearAgo = q.length >= 5 ? q[q.length - 5] : null;
  const ttm = q.slice(-4);
  const niTtm = ttm.every(x => x.ni != null) ? ttm.reduce((s, x) => s + x.ni, 0) : null;
  const yoy = yearAgo && yearAgo.ni > 0 && last.ni != null ? last.ni / yearAgo.ni - 1 : null;
  const margin = last.rev && last.ni != null ? last.ni / last.rev : null;
  const flags = [];
  if (niTtm !== null && niTtm < 0) flags.push('Loss-making (last 4 quarters)');
  else if (last.ni != null && last.ni < 0) flags.push('Latest quarter loss');
  if (yoy !== null && yoy <= -0.2) flags.push('Profit down 20%+ YoY');
  if (yoy !== null && yoy >= 0.2) flags.push('Profit up 20%+ YoY');
  return { quarters: q, latest: last.date, niTtm, yoy, margin, flags };
}

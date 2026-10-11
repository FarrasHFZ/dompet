# Catalyst thesis brief (filings-first, after @dojjunn)

The stock page's **Catalyst** tab copies this brief with the stock's own facts appended
(`catalystPrompt` in `web/app.js`). Paste it into Claude with web search on. Keep the two
versions in sync.

```
Build a catalyst thesis for IDX:<TICKER> (<name>, <sector>), price <price>, data as of <date>.

METHOD (filings first, no screening):
1. Read primary sources: IDX Keterbukaan Informasi (last 6 months), the latest Laporan Keuangan
   incl. notes, any prospectus / HMETD / warrant terms, RKAB if mining. Prefer them over news and
   broker research.
2. Find the 1-2 catalysts that can move earnings or cash flow in 6-12 months (corporate action,
   acquisition, asset sale, capacity / RKAB change, contract, change of control). Quantify each.
3. Map control and capital: controller and %, free float, who supplies real cash vs who converts
   notes, loans or related-party assets, and how ownership shifts after any raise.
4. For an acquisition: price paid vs net assets acquired, goodwill (Kombinasi Bisnis note), how it
   is funded and how the debt is serviced.
5. Second-level questions: why is management doing this now, what does it say about their
   conviction, what would make it fail?
6. Value it with ONE simple multiple (PE or EV/EBITDA on next year's estimate). Give target price
   and upside %, and the multiple peers trade at.
7. Risks: concentration / pump risk, liquidity, dilution, debt, sell-on-news, related parties.

OUTPUT (max 300 words): Title / Catalysts (1-2, measurable) / Snapshot (sector, market cap,
controller %, free float) / Valuation (multiple, TP, upside %) / Call (BUY, HOLD or NO THESIS) /
Supporting facts / Risks / Open questions. Cite the filing (title + date) for every number. If no
catalyst is found, answer NO THESIS and say why. Do not invent numbers: write "not found" instead.
End with DYOR.

FACTS ALREADY KNOWN (from the screener; verify):
- controller, top-3 %, free float upper bound (KSEI holders >= 1%), group
- trailing 12-month profit, margin, flags
- corporate-action filings of the last 45 days
- second-level questions the screener generated
```

## Why it is shaped like this

- **Starts from filings and allows "NO THESIS".** The method's edge is reading what others skip.
  A brief that must always produce a BUY becomes a story generator.
- **Every number cites a filing; "not found" beats a guess.** This is the main defence against a
  model inventing figures. Check each cited number yourself.
- **One multiple, one target.** It matches the playbook and keeps the output comparable across
  stocks.
- **300 words, fixed headings.** Short enough to read on a phone and to compare side by side.
- **Facts from the screener are pre-filled but marked "verify".** It saves the model a lookup
  without letting stale data pass unchecked.

Status: qualitative and untested. It is a months-long fundamental view, separate from the
15-session bounce trade, and never feeds a badge.

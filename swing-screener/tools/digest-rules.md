# How to digest an IDX filing (rules for Claude)

Goal: a reader opens a stock's Catalyst tab and **instantly knows what big thing is going on**.
Each filing text comes from `tools/ann-read.js` (first ~6 pages of each PDF, max 7,000
characters, plus the amounts, percentages and company names it found). Read it and write one
item per filing into a batch file for `node swing-screener/tools/filing-digest.mjs <batch>`.

## One item per filing

```json
{ "t": "TOBA", "d": "2026-09-07T08:10:57", "title": "<IDX title>", "url": "<pdf url>",
  "kind": "acquisition", "impact": 2, "dir": "up",
  "head":  "One line, plain English: the news itself, with the number",
  "what":  "What is NEW versus what the market already knew, 1-3 sentences, with dates and counterparties",
  "size":  "The amount and what it is against the company: % of market cap, of equity, of revenue",
  "why":   "What it could trigger: re-rating, dilution, tender offer, earnings step-up, suspension ...",
  "watch": "The next step and its date: EGM, effective date, ex-date, closing, deadline" }
```

- **kind**: acquisition, divestment, rights-issue, private-placement, warrant, buyback,
  tender-offer, change-of-control, insider-buy, insider-sell, related-party, contract,
  capacity, new-business, permit, debt, dividend, results, guidance, legal, suspension,
  idx-query, media-reply, board, egm, other.
- **impact** (be strict; most filings are 0 or 1):
  - **3 BIG**: can re-rate the stock by itself. A deal of ~10% of market cap or more, change of
    control or tender offer, rights issue / private placement of ~10%+ new shares, entry into a
    new business, a large contract against revenue, delisting / suspension / PKPU risk, a
    controller selling or buying a meaningful stake.
  - **2 Notable**: real but smaller money (1-10% of market cap), insider trades by the
    controller or directors, a buyback plan, a dividend that is unusually large, an IDX query
    with a substantive answer, an EGM whose agenda includes a capital raise or asset deal.
  - **1 Minor**: board changes, small affiliate deals, a plain "no material information"
    answer to IDX, standard dividends.
  - **0 Routine**: nothing new. Kept so it is not read again.
- **dir**: up / down / mixed / ? for existing shareholders (dilution below market is down; a
  tender offer above market is up; a controller selling is down). Not a forecast.

## Rules

1. **Numbers or nothing.** Quote the amount, price, % and date from the text. Convert to a
   share of market cap when you can (market cap = price × shares; the batch prompt gives both).
   If the text does not say, write "not stated": never guess.
2. **What is new.** Say what changed: "first disclosure", "signed (earlier: MoU)",
   "terms set: price Rp X", "completed". A repeat or a correction of an earlier filing is 0
   unless the terms changed.
3. **Second-level read** (the @dojjunn habit) in `why`: who pays real cash, who converts claims,
   who gains control, why management does this now, how it is funded.
4. **Scanned PDFs** (`scan: true`, no text): use the title only, impact at most 1, and write
   "scanned PDF: open the original" in `what`.
5. Plain English, short sentences, no hype words. No investment advice.

## The stock story

After its items, write `stories.<TICKER>`: one or two sentences on the biggest thing going on
across the last ~60 days of filings, most important first, with numbers. If nothing is big,
say so plainly ("Only routine filings since August: no catalyst on file."). Update it whenever a
new impact 2-3 item arrives.

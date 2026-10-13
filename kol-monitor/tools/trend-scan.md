# Trend scan playbook (what is happening around a KOL right now)

Why this exists: a generic "<name> terbaru" web search returns stale evergreen results and missed the Awkarin x Aa Juju feud (broke 2026-10-11, caught 2026-10-13). Follower numbers lag events by days, so the scan looks at events first, numbers second.

## Layer 1: automatic sweep for all creators (about 25 minutes)
1. `node tools/news-scan.mjs` pulls the newest 12 stories per creator from Bing News (Indonesian market, sorted by date) and, if a creator has coverage, a 30-day view too. Matching is by display name (first two words for long names) or handle. Paced about 2.5 s per request; it retries with backoff and never records a rejected request as "no news".
   - Google News gives better depth but blocks fast scanners with a 503 "Sorry" page. Do not hammer it; if used, one request every 6+ seconds.
2. `node tools/scan-youtube.mjs` reads each channel's public video feed: upload cadence, median views, and outlier videos (3x median or more in the last 45 days).
3. `node tools/news-stories.mjs` groups headlines into stories, counts distinct outlets, labels type (legal, conflict, personal, commercial, collab, event, content) and sentiment from Indonesian keywords, spots other roster creators named in the same headline (linked creators), and checks Google's daily trending searches for Indonesia. Output `data/news-auto.json`.
4. `node tools/build.mjs` scores everyone. Auto-scanned creators carry "auto scan from headlines" and low confidence.

Known limits of layer 1: name collisions (namesakes), keyword labels can mislabel a story (a victim of a crime reads like a suspect), headline-only, and no coverage of anything that is not in news (Instagram stories, TikTok videos, private feeds).

## Layer 2: hand checks for anyone who lights up
Triggers: 3+ outlets in the last 7 days, any legal or conflict story, a trending-search hit, a viral YouTube outlier, or a creator with 5M+ reach.
Run in parallel with WebSearch mode=extended, Indonesian terms, month and year in the query:
1. `<name> <bulan> <tahun>` and `<name> terbaru`
2. `<name> klarifikasi / dihujat / dilaporkan / somasi` as separate queries (the engine ignores OR)
3. `<name> vs`, `<name> dan`: conflicts and collabs show up as a second name; search that second name too
4. TikTok discover page for the creator and for the other party
5. Calendar: events, launches, court dates, award voting
Then write curated rows to `data/signals.json` (with dates, outlet counts, sentiment, co-entities) and add the creator to `data/scans.json`. Hand-checked creators use only the curated rows.

## Event record (data/signals.json)
`{kol, firstSeen, date, type, sentiment, outlets, coEntities[], topic, sources[], note, catalystDate?}`
- type: conflict | collab | legal | personal | content | commercial | event
- sentiment: positive | negative | mixed | unknown. Negative attention can still grow followers but it is a brand-safety flag.
- 3+ independent outlets within 48 hours = TRENDING NOW.

## Verdict rules (event layer, combines with the numeric layer)
- TRENDING NOW: a story with 3+ outlets in 48h, or a trending-search hit.
- RISING: 1-2 outlets plus a second named party with a bigger audience, or a dated catalyst within 14 days.
- Always say whether numbers have confirmed it yet. Until 7 days of snapshots exist, say "event-driven, not yet confirmed in followers".
- Instagram, Threads, X and TikTok feeds cannot be read without logging in, so say what was not covered.

# Trend scan playbook (what is happening around a KOL *right now*)

Why this exists: a generic "<name> terbaru" search returns stale evergreen results and missed the
Awkarin x Aa Juju feud (broke 2026-10-11, caught 2026-10-13). Numbers (followers) lag events by days, so
the scan has to look at events first, numbers second.

## Run for every KOL, in parallel, with WebSearch mode=extended
Always put the current month/year in the query and use Indonesian terms. Stale-looking results
(older than 14 days) are background, not signal.

1. `<name> <bulan> <tahun>` (e.g. "Awkarin Oktober 2026")
2. `<name> viral hari ini netizen`
3. `<name> netizen reaksi <bulan> <tahun>`
4. `<name> klarifikasi OR somasi OR dihujat OR dipuji` (run as separate queries; the engine ignores OR)
5. `<name> vs` and `<name> dan` : conflicts and collabs show up as a second name
6. `<name> tiktok trending` + open `https://www.tiktok.com/discover/<name-with-dashes>`
7. Second-order: for every other name that appears next to the KOL in 2+ results, search
   `<that name> <bulan> <tahun>`, since the other party's audience is where spillover comes from
   (e.g. Aa Juju: 1.8M TikTok followers, already trending on a Hyundai complaint).
8. Calendar items (events, launches, court dates, DJ gigs). They are predictable catalysts.

Sources of truth by speed: IG Stories / TikTok (hours) > gossip accounts + tvOne/Suara/Viva/Detik (same day)
> general news tag pages (days). Google Trends 429s in the browser pane, so don't depend on it.

## Log what you find: data/signals.json
One row per event: `{date, kol, topic, type, coEntities[], sentiment, sources[], firstSeen, note}`
- type: conflict | collab | legal | personal | content | commercial | event
- sentiment: positive | negative | mixed | unknown  (be explicit: negative attention can still grow followers but is a brand-safety flag)
- For every event, note *how many independent outlets* and the *newest source date*: 3+ outlets within 48h = TRENDING NOW.

## Verdict rules (event layer, combines with the numeric layer from tools/kol.mjs)
- TRENDING NOW: a story with 3+ outlets in 48h, or the KOL named in a TikTok discover "lagi viral" page.
- RISING: 1-2 outlets plus a second named party with a bigger or comparable audience, or a dated catalyst within 14 days.
- Always state whether numbers have confirmed it yet. Until 7 days of snapshots exist, say "event-driven, not yet confirmed in followers".

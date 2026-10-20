# Affiliate video studio

Turns a Shopee product into honest, UGC-style 9:16 affiliate videos, using the product's real seller photos and videos and only facts from its product page. It queues requests, renders unattended, gates output for review, and learns from performance exports.

```
Shopee page ──(signed-in browser)──► extraction JSON
     │
ingest ── download seller media, Claude reads photos, proposes claims,
     │    each claim kept only if its quote is literally on the page
     ▼
public/products/<id>/product.json
     │
request ─► recipe pick (category fit; rotation until 30 videos of data, then best + 1 exploration)
     │
writer ── Claude writes storyboard(s); hook test = one body, N hooks
     │
guard ── facts ⊂ verified claims, no invented numbers/prices/promos/ownership stories ─► repair round ─► blocked
     │
voice ── Edge neural TTS (id-ID), scene length = spoken line
     │
render ── Remotion "UGC" composition: handheld camera, karaoke captions, hook card,
     │    time-of-day chips, CTA card, AI/affiliate disclosure, -14 LUFS
     ▼
QC ── 1080x1920 h264, length, loudness, black frames ─► review page ─► approve ─► publish (manual)
                                                                              │
perf import (TikTok Studio / affiliate CSV) ◄─────────────────────────────────┘
```

## Daily use

```
npm run request -- --url "<shopee link>" --brief "daily-life angle, students" --variants 3 --experiment hook
npm run watch -- --once          # or `npm run watch` to keep polling
start out/review.html            # watch, read scripts, copy captions
npm run approve -- <videoId>     # or --reject "why" / --published <url>
npm run perf -- --import export.csv
```

`--experiment hook` (default) keeps everything the same except the opening scene, so results show which hook works. `recipe` gives one video per recipe, and `voice` tries a female and a male voice.

## Getting product data (needs a Shopee login)

Shopee only serves product pages to signed-in sessions, so extraction runs inside a signed-in tab:

1. Open the product in the Claude app's browser pane (or Chrome) while signed in.
2. Run `scripts/shopee-extract.browser.js` in that tab. Claude does this with its browser tool; by hand, paste it into DevTools.
3. Save the result as `requests/extract/<item>.json`, then
   `npm run ingest -- --from requests/extract/<item>.json [--affiliate <your affiliate link>]`.

A request for a product that hasn't been ingested waits in `requests/waiting/` and retries by itself once the product exists.

Real daily-life footage beats everything. Drop your own clips or photos into `public/products/<id>/assets/own/` and re-ingest. They get `origin: own_footage`, and the writer can use them as "full" layout scenes.

## Inspiration → recipe

```
npm run inspire -- --video ref.mp4 --notes "love the 1s hook and the time chips"
```

Measures cuts with ffmpeg and makes a contact sheet. Claude then turns the mechanism (hook type, pacing, beats) into `recipes/insp_*.json`. It never copies words or footage. Use references you saved yourself; nothing is scraped.

## Honesty rules (enforced in `scripts/guard.mjs`)

- Only seller media or your own footage. No generated product pixels.
- Every factual line cites a claim ID, and every number must exist in a verified claim.
- No prices, promos, "terbaik/dijamin/100%", invented purchases, ownership periods or testimonials.
- A disclosure label ("Konten dibuat dengan AI · Link afiliasi") is burned in. TikTok and Shopee also require the AI-content toggle when posting.

## Requirements

- Node 24. Run `npm install` once (it also downloads ffmpeg-static and Remotion's headless Chrome on first render).
- The `claude` CLI, logged in. The writer, ingest and inspire steps run headless `claude -p` on your existing login. Set `AV_MODEL` to force a model.
- Rendering runs on this PC (~1-2 min per 20 s video). Set `AV_CONCURRENCY` to tune it.

## Files

| Path | What |
|---|---|
| `src/UGC.tsx` | the composition (all motion, captions, overlays) |
| `src/schema.js` | Product / Recipe / Storyboard / Request contracts |
| `recipes/*.json` | creative recipes (seed + learned from inspiration) |
| `scripts/` | ingest, writer, guard, voice, render+QC, run, watch, perf, inspire, approve |
| `data/` | videos.json registry, costs/renders/jobs/performance ledgers |
| `out/` | rendered MP4s, posters, review.html |
